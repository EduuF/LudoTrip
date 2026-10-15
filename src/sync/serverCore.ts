import { runDoc } from '../app/doc'
import type { DocAction, TripDoc } from '../app/doc'
import { MIN_PROTOCOL } from './protocol'
import type { Effects } from '../engine'
import type { Ack, ClientMsg, RejectReason, Role, ServerMsg } from './protocol'

// O que o servidor decide (spec publicação §5.2). Funções puras: o TripRoom grava e transmite; os
// testes de convergência usam exatamente as mesmas decisões, sem duplicar a regra.

export type { Role }

/** Tamanho máximo de uma viagem (spec §4.7). */
export const MAX_DOC_BYTES = 1_000_000
/** Acima de quantas ações faltando é mais barato mandar o estado inteiro. */
export const MAX_REPLAY = 200

export type Outcome =
  | { kind: 'applied'; doc: TripDoc; version: number; json: string; effects: Effects }
  /** Nada mudou: confirma para quem mandou, sem nova versão. */
  | { kind: 'noop' }
  | { kind: 'rejected'; reason: RejectReason }

export function decide(
  state: { doc: TripDoc; version: number },
  role: Role,
  opId: string,
  action: DocAction,
): Outcome {
  if (role === 'viewer') return { kind: 'rejected', reason: { code: 'ROLE' } }
  const r = runDoc(state.doc, action, { opId })
  if (!r.ok) return r.error.code === 'NO_CHANGE' ? { kind: 'noop' } : { kind: 'rejected', reason: r.error }
  const json = JSON.stringify(r.doc)
  if (json.length > MAX_DOC_BYTES) return { kind: 'rejected', reason: { code: 'TOO_BIG' } }
  return { kind: 'applied', doc: r.doc, version: state.version + 1, json, effects: r.effects }
}

/** Uma linha do registro de ações. */
export interface OpRecord {
  opId: string
  uid: string
  action: DocAction
  result: 'applied' | 'noop' | 'rejected'
  reason: RejectReason | null
  version: number
  at: number
}

export function recordToMsg(o: OpRecord): ServerMsg {
  if (o.result === 'rejected') return { t: 'rejected', opId: o.opId, reason: o.reason ?? { code: 'INVALID' } }
  return {
    t: 'applied',
    opId: o.opId,
    version: o.version,
    action: o.action,
    by: o.uid,
    at: o.at,
    ...(o.result === 'noop' ? { noop: true as const } : {}),
  }
}

export interface OpLog {
  /** As ações aplicadas com versão maior que `since`, em ordem. */
  appliedSince(since: number): OpRecord[]
  /** O que já foi decidido para estes opIds. */
  find(opIds: string[]): OpRecord[]
}

/** A resposta ao `hello`: nada (já em dia), as ações que faltam, ou o estado inteiro. */
export function answerHello(
  cur: { doc: TripDoc; version: number },
  log: OpLog,
  msg: Extract<ClientMsg, { t: 'hello' }>,
  maxReplay = MAX_REPLAY,
): ServerMsg[] {
  if (typeof msg.protocol !== 'number' || msg.protocol < MIN_PROTOCOL) return [{ t: 'upgrade' }]
  const since = Number.isInteger(msg.sinceVersion) ? msg.sinceVersion : -1
  const pending = Array.isArray(msg.pending)
    ? msg.pending.filter((x) => typeof x === 'string').slice(0, 500)
    : []
  // Respostas que o aparelho perdeu (a conexão caiu): recusas, "nada mudou" e aplicadas que ele já
  // tem. As aplicadas depois de `since` chegam na repetição, na ordem.
  const late = () =>
    log
      .find(pending)
      .filter((o) => o.result !== 'applied' || o.version <= since)
      .map(recordToMsg)
  if (since === cur.version) return late()
  if (since >= 0 && since < cur.version && cur.version - since <= maxReplay) {
    const ops = log.appliedSince(since)
    // Só repete se o registro está completo (depois de uma volta no tempo, pode não estar).
    if (ops.length === cur.version - since && ops.every((o, i) => o.version === since + i + 1))
      return [...ops.map(recordToMsg), ...late()]
  }
  const acks: Ack[] = log
    .find(pending)
    .map((o) =>
      o.result === 'rejected'
        ? { opId: o.opId, result: 'rejected', reason: o.reason ?? { code: 'INVALID' } }
        : { opId: o.opId, result: o.result },
    )
  return [{ t: 'snapshot', version: cur.version, doc: cur.doc, ...(acks.length ? { acks } : {}) }]
}
