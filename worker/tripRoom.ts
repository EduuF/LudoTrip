import { DurableObject } from 'cloudflare:workers'
import { tripRange } from '../src/engine'
import { migrate, runDoc } from '../src/app/doc'
import type { DocAction, TripDoc } from '../src/app/doc'
import { MIN_PROTOCOL } from '../src/sync/protocol'
import type { ClientMsg, ServerMsg } from '../src/sync/protocol'
import { WS_PROTOCOL } from './auth'
import { updateTripMeta } from './db'
import type { Role, TripMetaRow } from './db'
import type { AppEnv } from './env'
import { log, logError, uidHash } from './log'

// Uma viagem da nuvem (spec publicação §5): guarda o documento e o registro de ações num SQLite só
// dela, aplica uma ação de cada vez com o mesmo runDoc do aparelho e repassa a quem está com a viagem
// aberta (WebSocket com hibernação: não custa nada parado).

/** Tamanho máximo de uma viagem (spec §4.7). */
export const MAX_DOC_BYTES = 1_000_000
/** Acima de quantas ações faltando é mais barato mandar o estado inteiro. */
const MAX_REPLAY = 200

interface Conn {
  uid: string
  role: Role
}

interface DocRow {
  json: string
  version: number
  owner: string
  trip_id: string
  [key: string]: SqlStorageValue
}

interface OpRow {
  op_id: string
  uid: string
  action: string
  result: string
  reason: string | null
  version: number
  at: number
  [key: string]: SqlStorageValue
}

export type InitResult =
  { ok: true; created: boolean; version: number } | { ok: false; reason: 'owned' | 'too-big' }

export class TripRoom extends DurableObject<AppEnv> {
  /** Cópia do documento em memória (só cache: a verdade está no SQLite). */
  private cache: { doc: TripDoc; version: number } | null = null

  constructor(ctx: DurableObjectState, env: AppEnv) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => this.schema())
  }

  private schema() {
    this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS doc (
          k INTEGER PRIMARY KEY CHECK (k = 1),
          trip_id TEXT NOT NULL,
          owner TEXT NOT NULL,
          json TEXT NOT NULL,
          version INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ops (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          op_id TEXT NOT NULL UNIQUE,
          uid TEXT NOT NULL,
          action TEXT NOT NULL,
          result TEXT NOT NULL,
          reason TEXT,
          version INTEGER NOT NULL,
          at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ops_by_version ON ops(version);
      `)
  }

  private row(): DocRow | null {
    return (
      this.ctx.storage.sql
        .exec<DocRow>('SELECT json, version, owner, trip_id FROM doc WHERE k = 1')
        .toArray()[0] ?? null
    )
  }

  private current(): { doc: TripDoc; version: number } | null {
    if (this.cache) return this.cache
    const r = this.row()
    if (!r) return null
    this.cache = { doc: JSON.parse(r.json) as TripDoc, version: r.version }
    return this.cache
  }

  /** Cria a viagem com o documento que veio do aparelho. Repetir com o mesmo dono não faz nada. */
  async init(tripId: string, doc: TripDoc, ownerUid: string): Promise<InitResult> {
    const existing = this.row()
    if (existing) {
      if (existing.owner !== ownerUid) return { ok: false, reason: 'owned' }
      return { ok: true, created: false, version: existing.version }
    }
    const clean = migrate(doc)
    const json = JSON.stringify(clean)
    if (json.length > MAX_DOC_BYTES) return { ok: false, reason: 'too-big' }
    this.ctx.storage.sql.exec(
      'INSERT INTO doc (k, trip_id, owner, json, version) VALUES (1, ?, ?, ?, 0)',
      tripId,
      ownerUid,
      json,
    )
    this.cache = { doc: clean, version: 0 }
    return { ok: true, created: true, version: 0 }
  }

  async exportDoc(): Promise<{ doc: TripDoc; version: number } | null> {
    return this.current()
  }

  /** Apaga a viagem: avisa quem está com ela aberta e limpa o armazenamento. */
  async destroy(): Promise<void> {
    this.broadcast({ t: 'gone', reason: 'deleted' })
    for (const ws of this.ctx.getWebSockets()) ws.close(4000, 'deleted')
    this.cache = null
    await this.ctx.storage.deleteAll()
    // Vazio, mas pronto para responder ("apagada") a quem ainda chamar.
    this.schema()
  }

  /** Tira uma pessoa (M5): fecha as conexões dela na hora. */
  async kick(uid: string): Promise<void> {
    for (const ws of this.ctx.getWebSockets(uid)) {
      this.send(ws, { t: 'gone', reason: 'removed' })
      ws.close(4001, 'removed')
    }
  }

  /** O Worker já conferiu o token e o papel; aqui só chegam pedidos de WebSocket dele. */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('websocket', { status: 426 })
    const uid = request.headers.get('X-LudoTrip-Uid')
    const role = request.headers.get('X-LudoTrip-Role') as Role | null
    if (!uid || !role || !this.row()) return new Response('gone', { status: 404 })
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket]
    this.ctx.acceptWebSocket(server, [uid])
    server.serializeAttachment({ uid, role } satisfies Conn)
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { 'Sec-WebSocket-Protocol': WS_PROTOCOL },
    })
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const conn = ws.deserializeAttachment() as Conn | null
    if (!conn) return ws.close(1008, 'sem conexão')
    let msg: ClientMsg
    try {
      if (typeof raw !== 'string' || raw.length > MAX_DOC_BYTES * 2) throw new Error('mensagem inválida')
      msg = JSON.parse(raw) as ClientMsg
    } catch {
      return ws.close(1007, 'mensagem inválida')
    }
    try {
      if (msg.t === 'hello') this.hello(ws, msg)
      else if (msg.t === 'op' && typeof msg.opId === 'string' && msg.opId.length <= 64 && msg.action)
        await this.op(ws, conn, msg.opId, msg.action)
    } catch (e) {
      logError({
        msg: 'erro no TripRoom',
        trip: this.row()?.trip_id ?? null,
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? (e.stack ?? null) : null,
      })
      // Estado em memória pode ter ficado pela metade: a verdade volta do SQLite.
      this.cache = null
      ws.close(1011, 'erro')
    }
  }

  async webSocketClose(): Promise<void> {}

  /** Põe o aparelho em dia: as ações que faltam, ou o estado inteiro. */
  private hello(ws: WebSocket, msg: Extract<ClientMsg, { t: 'hello' }>) {
    if (typeof msg.protocol !== 'number' || msg.protocol < MIN_PROTOCOL)
      return this.send(ws, { t: 'upgrade' })
    const cur = this.current()
    if (!cur) return this.send(ws, { t: 'gone', reason: 'deleted' })
    const since = Number.isInteger(msg.sinceVersion) ? msg.sinceVersion : -1
    if (since === cur.version) return
    if (since >= 0 && since < cur.version && cur.version - since <= MAX_REPLAY) {
      const ops = this.ctx.storage.sql
        .exec<OpRow>(
          `SELECT op_id, uid, action, result, reason, version, at FROM ops
           WHERE result = 'applied' AND version > ? ORDER BY version`,
          since,
        )
        .toArray()
      // Só repete se o registro está completo (depois de uma volta no tempo, pode não estar).
      if (ops.length === cur.version - since && ops.every((o, i) => o.version === since + i + 1)) {
        for (const o of ops) this.send(ws, this.appliedMsg(o))
        return
      }
    }
    this.send(ws, { t: 'snapshot', version: cur.version, doc: cur.doc })
  }

  private appliedMsg(o: OpRow): ServerMsg {
    return {
      t: 'applied',
      opId: o.op_id,
      version: o.version,
      action: JSON.parse(o.action) as DocAction,
      by: o.uid,
      at: o.at,
    }
  }

  private async op(ws: WebSocket, conn: Conn, opId: string, action: DocAction) {
    const started = Date.now()
    // Reenvio (a conexão caiu antes da resposta): devolve o resultado já gravado, sem aplicar de novo.
    const seen = this.ctx.storage.sql
      .exec<OpRow>('SELECT op_id, uid, action, result, reason, version, at FROM ops WHERE op_id = ?', opId)
      .toArray()[0]
    if (seen) {
      if (seen.result === 'rejected')
        return this.send(ws, { t: 'rejected', opId, reason: JSON.parse(seen.reason ?? '{"code":"INVALID"}') })
      return this.send(ws, this.appliedMsg(seen))
    }
    const cur = this.current()
    if (!cur) return this.send(ws, { t: 'gone', reason: 'deleted' })
    const at = Date.now()
    const record = (result: string, reason: unknown, version: number) =>
      this.ctx.storage.sql.exec(
        'INSERT INTO ops (op_id, uid, action, result, reason, version, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        opId,
        conn.uid,
        JSON.stringify(action),
        result,
        reason === null ? null : JSON.stringify(reason),
        version,
        at,
      )
    const done = async (result: string, code: string | null) =>
      log({
        msg: 'op',
        trip: this.row()?.trip_id ?? null,
        opId,
        type: action.type === 'engine' ? `engine.${action.command.type}` : action.type,
        result,
        code,
        version: this.cache?.version ?? null,
        ms: Date.now() - started,
        uid: await uidHash(conn.uid),
      })

    if (conn.role === 'viewer') {
      record('rejected', { code: 'ROLE' }, cur.version)
      this.send(ws, { t: 'rejected', opId, reason: { code: 'ROLE' } })
      return done('rejected', 'ROLE')
    }
    const r = runDoc(cur.doc, action, { opId })
    if (!r.ok) {
      // "Nada mudou" não é recusa: confirma para quem mandou, sem nova versão.
      if (r.error.code === 'NO_CHANGE') {
        record('noop', null, cur.version)
        this.send(ws, { t: 'applied', opId, version: cur.version, action, by: conn.uid, at })
        return done('noop', null)
      }
      record('rejected', r.error, cur.version)
      this.send(ws, { t: 'rejected', opId, reason: r.error })
      return done('rejected', r.error.code)
    }
    const json = JSON.stringify(r.doc)
    if (json.length > MAX_DOC_BYTES) {
      record('rejected', { code: 'TOO_BIG' }, cur.version)
      this.send(ws, { t: 'rejected', opId, reason: { code: 'TOO_BIG' } })
      return done('rejected', 'TOO_BIG')
    }
    const version = cur.version + 1
    // Documento e registro na mesma transação implícita (nenhum await entre as duas escritas).
    this.ctx.storage.sql.exec('UPDATE doc SET json = ?, version = ? WHERE k = 1', json, version)
    record('applied', null, version)
    this.cache = { doc: r.doc, version }
    this.broadcast({ t: 'applied', opId, version, action, by: conn.uid, at })
    this.ctx.waitUntil(this.syncMeta(r.doc, version, json.length, at))
    return done('applied', null)
  }

  /** O que "Suas viagens" mostra (D1) acompanha a viagem. */
  private async syncMeta(doc: TripDoc, version: number, sizeBytes: number, at: number) {
    const range = tripRange(doc.itinerary)
    const meta: TripMetaRow = {
      id: this.row()?.trip_id ?? doc.meta.id,
      name: doc.meta.name,
      start: range.start,
      end: range.end,
      version,
      sizeBytes,
      updatedAt: at,
    }
    try {
      await updateTripMeta(this.env.DB, meta)
    } catch (e) {
      logError({
        msg: 'falha ao atualizar trips',
        trip: meta.id,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  private send(ws: WebSocket, msg: ServerMsg) {
    try {
      ws.send(JSON.stringify(msg))
    } catch {
      // Conexão já fechada: o aparelho recebe tudo no próximo hello.
    }
  }

  private broadcast(msg: ServerMsg) {
    const text = JSON.stringify(msg)
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text)
      } catch {
        // idem
      }
    }
  }
}
