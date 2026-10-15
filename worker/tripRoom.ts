import { DurableObject } from 'cloudflare:workers'
import { tripRange } from '../src/engine'
import { migrate } from '../src/app/doc'
import type { DocAction, TripDoc } from '../src/app/doc'
import type { ClientMsg, RejectReason, ServerMsg } from '../src/sync/protocol'
import { answerHello, decide, MAX_DOC_BYTES, recordToMsg } from '../src/sync/serverCore'
import type { OpLog, OpRecord, Role } from '../src/sync/serverCore'
import { WS_PROTOCOL } from './auth'
import { updateTripMeta } from './db'
import type { TripMetaRow } from './db'
import type { AppEnv } from './env'
import { log, logError, uidHash } from './log'

// Uma viagem da nuvem (spec publicação §5): guarda o documento e o registro de ações num SQLite só
// dela, aplica uma ação de cada vez com o mesmo runDoc do aparelho e repassa a quem está com a viagem
// aberta (WebSocket com hibernação: não custa nada parado). As decisões (aplicar, recusar, o que
// responder ao `hello`) são as de src/sync/serverCore.ts; aqui só se grava e transmite.

export { MAX_DOC_BYTES }

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

const OP_COLS = 'op_id, uid, action, result, reason, version, at'

const toRecord = (o: OpRow): OpRecord => ({
  opId: o.op_id,
  uid: o.uid,
  action: JSON.parse(o.action) as DocAction,
  result: o.result as OpRecord['result'],
  reason: o.reason === null ? null : (JSON.parse(o.reason) as RejectReason),
  version: o.version,
  at: o.at,
})

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

  private readonly opLog: OpLog = {
    appliedSince: (since) =>
      this.ctx.storage.sql
        .exec<OpRow>(
          `SELECT ${OP_COLS} FROM ops WHERE result = 'applied' AND version > ? ORDER BY version`,
          since,
        )
        .toArray()
        .map(toRecord),
    find: (opIds) =>
      opIds.length
        ? this.ctx.storage.sql
            .exec<OpRow>(
              `SELECT ${OP_COLS} FROM ops WHERE op_id IN (SELECT value FROM json_each(?))`,
              JSON.stringify(opIds),
            )
            .toArray()
            .map(toRecord)
        : [],
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

  /**
   * Volta a viagem para um instante (spec §5.8): a próxima sessão do objeto começa com o armazenamento
   * daquele momento. Devolve o marcador de "antes da volta", para desfazer a volta se preciso.
   */
  async restoreTo(at: number): Promise<string> {
    const bookmark = await this.ctx.storage.getBookmarkForTime(at)
    const undo = await this.ctx.storage.onNextSessionRestoreBookmark(bookmark)
    for (const ws of this.ctx.getWebSockets()) ws.close(1012, 'restaurada')
    this.cache = null
    this.ctx.abort('restaurar')
    return undo
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
      if (msg.t === 'hello') {
        const cur = this.current()
        const out: ServerMsg[] = cur ? answerHello(cur, this.opLog, msg) : [{ t: 'gone', reason: 'deleted' }]
        for (const m of out) this.send(ws, m)
      } else if (msg.t === 'op' && typeof msg.opId === 'string' && msg.opId.length <= 64 && msg.action) {
        await this.op(ws, conn, msg.opId, msg.action)
      }
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

  private async op(ws: WebSocket, conn: Conn, opId: string, action: DocAction) {
    const started = Date.now()
    // Reenvio (a conexão caiu antes da resposta): devolve o resultado já gravado, sem aplicar de novo.
    const seen = this.opLog.find([opId])[0]
    if (seen) return this.send(ws, recordToMsg(seen))
    const cur = this.current()
    if (!cur) return this.send(ws, { t: 'gone', reason: 'deleted' })
    const at = Date.now()
    const out = decide(cur, conn.role, opId, action)
    const result = out.kind
    const reason = out.kind === 'rejected' ? out.reason : null
    const version = out.kind === 'applied' ? out.version : cur.version
    const record: OpRecord = { opId, uid: conn.uid, action, result, reason, version, at }

    // Documento e registro na mesma transação implícita (nenhum await entre as escritas).
    if (out.kind === 'applied')
      this.ctx.storage.sql.exec('UPDATE doc SET json = ?, version = ? WHERE k = 1', out.json, out.version)
    this.ctx.storage.sql.exec(
      `INSERT INTO ops (${OP_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      opId,
      conn.uid,
      JSON.stringify(action),
      result,
      reason === null ? null : JSON.stringify(reason),
      version,
      at,
    )
    if (out.kind === 'applied') {
      this.cache = { doc: out.doc, version: out.version }
      this.broadcast(recordToMsg(record))
      this.ctx.waitUntil(this.syncMeta(out.doc, out.version, out.json.length, at))
    } else {
      this.send(ws, recordToMsg(record))
    }
    log({
      msg: 'op',
      trip: this.row()?.trip_id ?? null,
      opId,
      type: action.type === 'engine' ? `engine.${action.command.type}` : action.type,
      result,
      code: reason?.code ?? null,
      version,
      ms: Date.now() - started,
      uid: await uidHash(conn.uid),
    })
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
