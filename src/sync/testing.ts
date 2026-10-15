import { migrate } from '../app/doc'
import type { DocAction, TripDoc } from '../app/doc'
import type { ClientMsg, ServerMsg } from './protocol'
import { answerHello, decide, recordToMsg } from './serverCore'
import type { OpLog, OpRecord, Role } from './serverCore'
import type { CloudApi, RemoteTrip } from './cloudApi'

// Só para testes: um servidor em memória com as mesmas decisões do TripRoom (serverCore), e uma
// "nuvem" inteira (CloudApi) em cima dele para os testes de tela.

export interface SimConn {
  up: ClientMsg[]
  down: ServerMsg[]
  alive: boolean
  opened: boolean
  uid: string
  handlers: { onOpen(): void; onMessage(m: ServerMsg): void; onClose(i: { code?: number }): void }
}

export class SimServer {
  readonly maxReplay: number
  state: { doc: TripDoc; version: number }
  ops: OpRecord[] = []
  conns = new Set<SimConn>()
  log: OpLog = {
    appliedSince: (since) => this.ops.filter((o) => o.result === 'applied' && o.version > since),
    find: (ids) => this.ops.filter((o) => ids.includes(o.opId)),
  }

  constructor(doc: TripDoc, maxReplay = 200) {
    this.state = { doc: migrate(doc), version: 0 }
    this.maxReplay = maxReplay
  }

  receive(conn: SimConn, msg: ClientMsg, role: Role = 'owner') {
    if (msg.t === 'hello') {
      conn.down.push(...answerHello(this.state, this.log, msg, this.maxReplay))
      return
    }
    const seen = this.ops.find((o) => o.opId === msg.opId)
    if (seen) return void conn.down.push(recordToMsg(seen))
    const out = decide(this.state, role, msg.opId, msg.action)
    const rec: OpRecord = {
      opId: msg.opId,
      uid: conn.uid,
      action: msg.action,
      result: out.kind,
      reason: out.kind === 'rejected' ? out.reason : null,
      version: out.kind === 'applied' ? out.version : this.state.version,
      at: 0,
    }
    this.ops.push(rec)
    if (out.kind === 'applied') {
      this.state = { doc: out.doc, version: out.version }
      for (const c of this.conns) if (c.alive) c.down.push(recordToMsg(rec))
    } else conn.down.push(recordToMsg(rec))
  }
}

/**
 * Uma nuvem inteira em memória (CloudApi), entregando mensagens sozinha no próximo ciclo. `offline()`
 * derruba as conexões e recusa novas até `online()`.
 */
export function memoryCloud(uidOf: () => string | null) {
  const trips = new Map<string, { server: SimServer; owner: string; createdAt: number }>()
  let up = true
  const conns = new Set<SimConn>()
  const pump = () =>
    setTimeout(() => {
      for (const c of [...conns]) {
        if (!c.alive || !c.opened) continue
        const server = [...trips.values()].find((t) => t.server.conns.has(c))?.server
        while (server && c.up.length) server.receive(c, c.up.shift()!)
      }
      for (const c of [...conns]) {
        while (c.alive && c.opened && c.down.length) c.handlers.onMessage(structuredClone(c.down.shift()!))
      }
    }, 0)

  const api: CloudApi = {
    async listTrips() {
      const uid = uidOf()
      if (!up || !uid) return null
      return [...trips.entries()]
        .filter(([, t]) => t.owner === uid)
        .map(([id, t]): RemoteTrip => ({
          id,
          name: t.server.state.doc.meta.name,
          start: t.server.state.doc.itinerary.start,
          end: null,
          version: t.server.state.version,
          updatedAt: 1,
          createdAt: t.createdAt,
          role: 'owner',
          owner: t.owner,
        }))
    },
    async upload(doc) {
      const uid = uidOf()
      if (!uid) return { ok: false, reason: 'auth' }
      if (!up) return { ok: false, reason: 'offline' }
      const t = trips.get(doc.meta.id)
      if (t)
        return t.owner === uid
          ? { ok: true, version: t.server.state.version, created: false }
          : { ok: false, reason: 'owned' }
      trips.set(doc.meta.id, { server: new SimServer(doc), owner: uid, createdAt: Date.now() })
      return { ok: true, version: 0, created: true }
    },
    async remove(id) {
      if (!up) return false
      const t = trips.get(id)
      if (!t) return false
      for (const c of t.server.conns) {
        c.handlers.onMessage({ t: 'gone', reason: 'deleted' })
        c.alive = false
      }
      trips.delete(id)
      return true
    },
    connector: (tripId) => (handlers) => {
      const conn: SimConn = { up: [], down: [], alive: true, opened: false, uid: uidOf() ?? '?', handlers }
      setTimeout(() => {
        const t = trips.get(tripId)
        if (!up || !t || !conn.alive) {
          conn.alive = false
          return handlers.onClose({})
        }
        t.server.conns.add(conn)
        conns.add(conn)
        conn.opened = true
        handlers.onOpen()
        pump()
      }, 0)
      return {
        send(msg) {
          if (!conn.alive) return
          conn.up.push(msg)
          pump()
        },
        close() {
          conn.alive = false
          conns.delete(conn)
        },
      }
    },
  }
  return {
    api,
    trips,
    offline() {
      up = false
      for (const c of [...conns]) {
        c.alive = false
        conns.delete(c)
        c.handlers.onClose({})
      }
    },
    online() {
      up = true
    },
    /** Outra pessoa (ou outro aparelho) edita direto no servidor. */
    remoteEdit(tripId: string, uid: string, opId: string, action: DocAction) {
      const t = trips.get(tripId)!
      const ghost: SimConn = {
        up: [],
        down: [],
        alive: false,
        opened: true,
        uid,
        handlers: { onOpen() {}, onMessage() {}, onClose() {} },
      }
      t.server.receive(ghost, { t: 'op', opId, action })
      pump()
    },
  }
}
