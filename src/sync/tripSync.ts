import { runDoc } from '../app/doc'
import type { TripDoc } from '../app/doc'
import type { Outbox } from './outbox'
import { MAX_HELLO_PENDING, PROTOCOL } from './protocol'
import type { ClientMsg, PendingOp, RejectReason, ServerMsg } from './protocol'
import { rebase } from './rebase'

// Uma viagem da nuvem neste aparelho (spec publicação §5.2–5.4). Guarda a última cópia confirmada
// pelo servidor (`base`) e as ações ainda sem resposta (`pending`, espelho da fila no IndexedDB).
// O que a tela mostra é sempre `base + pending` (rebase). Nada é aplicado duas vezes: o servidor
// ignora reenvios pelo opId, e o `hello` diz quais pendentes ele já decidiu.

export type SyncStatus = 'saved' | 'sending' | 'offline'

export interface Channel {
  send(msg: ClientMsg): void
  close(): void
}

/** Abre uma conexão (WebSocket de verdade, ou um falso nos testes). */
export type Connector = (handlers: {
  onOpen(): void
  onMessage(msg: ServerMsg): void
  onClose(info: { code?: number }): void
}) => Channel

export interface Refusal {
  op: PendingOp
  reason: RejectReason
}

export interface SyncView {
  /** O que a tela mostra (null: ainda não baixada neste aparelho). */
  doc: TripDoc | null
  status: SyncStatus
  pending: number
}

export interface TripSyncOptions {
  tripId: string
  outbox: Outbox
  connect: Connector
  /** A cópia do servidor guardada neste aparelho, se houver. */
  base: { doc: TripDoc; version: number } | null
  schemaVersion: number
  app: string
  onView(view: SyncView): void
  /** A cópia confirmada mudou: guardar no aparelho para abrir offline. */
  onBase?(base: { doc: TripDoc; version: number }): void
  /** Ação de outra pessoa (ou deste aparelho noutra aba) chegou. */
  onRemote?(msg: Extract<ServerMsg, { t: 'applied' }>, before: TripDoc): void
  /** Ações deste aparelho que não cabem mais (viram painel de escolha). */
  onRefused?(list: Refusal[]): void
  onGone?(reason: 'deleted' | 'removed'): void
  onUpgrade?(): void
  /** Espera antes de reconectar (injetável nos testes). */
  schedule?(fn: () => void, ms: number): unknown
}

const BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000]

export class TripSync {
  private base: { doc: TripDoc; version: number } | null
  private pending: PendingOp[] = []
  private ch: Channel | null = null
  private open = false
  private stopped = false
  private attempt = 0
  private waiting = false

  private readonly o: TripSyncOptions

  constructor(options: TripSyncOptions) {
    this.o = options
    this.base = options.base
  }

  get version(): number {
    return this.base?.version ?? -1
  }

  get pendingOps(): readonly PendingOp[] {
    return this.pending
  }

  /** Lê a fila do aparelho e conecta. */
  async start(): Promise<void> {
    this.pending = await this.o.outbox.pending(this.o.tripId)
    this.emit()
    this.connectNow()
  }

  stop(): void {
    this.stopped = true
    this.open = false
    this.ch?.close()
    this.ch = null
  }

  /** A rede voltou (evento `online`) ou a tela voltou ao primeiro plano: tenta já. */
  poke(): void {
    if (!this.open && !this.stopped && !this.ch) this.connectNow()
  }

  /** Uma ação feita neste aparelho (já aplicada na tela pelo store). */
  async submit(op: PendingOp): Promise<void> {
    this.pending.push(op)
    this.emit()
    await this.o.outbox.push(op)
    if (this.open) this.ch?.send({ t: 'op', opId: op.opId, action: op.action })
  }

  /** O que a tela mostra agora. */
  view(): SyncView {
    const doc = this.base ? rebase(this.base.doc, this.pending).doc : null
    const status: SyncStatus = !this.open ? 'offline' : this.pending.length ? 'sending' : 'saved'
    return { doc, status, pending: this.pending.length }
  }

  private emit() {
    this.o.onView(this.view())
  }

  private connectNow() {
    if (this.stopped) return
    this.ch = this.o.connect({
      onOpen: () => this.onOpen(),
      onMessage: (m) => this.onMessage(m),
      onClose: (info) => this.onClose(info),
    })
  }

  private onOpen() {
    this.open = true
    this.attempt = 0
    this.hello()
    for (const op of this.pending) this.ch?.send({ t: 'op', opId: op.opId, action: op.action })
    this.emit()
  }

  private hello(sinceVersion = this.version) {
    this.ch?.send({
      t: 'hello',
      sinceVersion,
      protocol: PROTOCOL,
      schemaVersion: this.o.schemaVersion,
      app: this.o.app,
      pending: this.pending.slice(0, MAX_HELLO_PENDING).map((p) => p.opId),
    })
  }

  private onClose(info: { code?: number }) {
    this.open = false
    this.ch = null
    this.emit()
    // 4000/4001: a viagem foi apagada ou a pessoa saiu; não adianta tentar de novo.
    if (this.stopped || info.code === 4000 || info.code === 4001) return
    if (this.waiting) return
    this.waiting = true
    const ms = BACKOFF[Math.min(this.attempt++, BACKOFF.length - 1)]!
    ;(this.o.schedule ?? setTimeout)(() => {
      this.waiting = false
      this.poke()
    }, ms)
  }

  private settle(opId: string): PendingOp | undefined {
    const i = this.pending.findIndex((p) => p.opId === opId)
    if (i < 0) return undefined
    const [op] = this.pending.splice(i, 1)
    void this.o.outbox.ack(opId)
    return op
  }

  private setBase(doc: TripDoc, version: number) {
    this.base = { doc, version }
    this.o.onBase?.(this.base)
  }

  private onMessage(m: ServerMsg) {
    switch (m.t) {
      case 'snapshot': {
        const refused: Refusal[] = []
        for (const a of m.acks ?? []) {
          const op = this.settle(a.opId)
          if (op && a.result === 'rejected') refused.push({ op, reason: a.reason })
        }
        this.setBase(m.doc, m.version)
        if (refused.length) this.o.onRefused?.(refused)
        return this.emit()
      }
      case 'applied': {
        const mine = this.pending.some((p) => p.opId === m.opId)
        if (!m.noop && this.base && m.version === this.base.version + 1) {
          const before = this.base.doc
          const r = runDoc(before, m.action, { opId: m.opId })
          // O servidor aplicou com o mesmo motor; se aqui não deu, a cópia está errada: pede tudo.
          if (!r.ok) return this.hello(-1)
          this.setBase(r.doc, m.version)
          if (!mine) this.o.onRemote?.(m, rebase(before, this.pending).doc)
        } else if (!m.noop && (!this.base || m.version > this.base.version + 1)) {
          // Faltou alguma coisa no caminho: pede para pôr em dia.
          return this.hello()
        }
        if (mine) this.settle(m.opId)
        return this.emit()
      }
      case 'rejected': {
        const op = this.settle(m.opId)
        if (op) this.o.onRefused?.([{ op, reason: m.reason }])
        return this.emit()
      }
      case 'upgrade':
        this.stop()
        this.o.onUpgrade?.()
        return this.emit()
      case 'gone':
        this.stop()
        this.o.onGone?.(m.reason)
        return this.emit()
    }
  }
}
