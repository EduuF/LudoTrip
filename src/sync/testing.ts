import { migrate } from '../app/doc'
import type { DocAction, TripDoc } from '../app/doc'
import type { ClientMsg, ServerMsg } from './protocol'
import { answerHello, decide, recordToMsg } from './serverCore'
import type { OpLog, OpRecord, Role } from './serverCore'
import type { CloudApi, RemoteTrip } from './cloudApi'
import type { Member, PeopleApi, PendingInvite } from './peopleApi'

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
  /** Apagadas para todos (30 dias em "Apagadas"): saem de `trips` e voltam com `restore`. */
  const deleted = new Map<string, { server: SimServer; owner: string; createdAt: number; at: number }>()
  /** Quem participa, por viagem (o Dono entra ao subir). */
  const members = new Map<string, Member[]>()
  const invites = new Map<string, PendingInvite & { tripId: string; token: string; used?: boolean }>()
  const names = new Map<string, string>()
  const roleIn = (tripId: string, uid: string | null) =>
    members.get(tripId)?.find((m) => m.uid === uid)?.role ?? null
  const member = (uid: string, role: Member['role']): Member => ({
    uid,
    name: names.get(uid) ?? uid,
    fullName: null,
    photo: null,
    role,
    joinedAt: Date.now(),
  })
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
        .filter(([id]) => roleIn(id, uid))
        .map(([id, t]): RemoteTrip => ({
          id,
          name: t.server.state.doc.meta.name,
          start: t.server.state.doc.itinerary.start,
          end: null,
          version: t.server.state.version,
          updatedAt: 1,
          createdAt: t.createdAt,
          role: roleIn(id, uid)!,
          owner: t.owner,
          members: members.get(id)?.length ?? 1,
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
      members.set(doc.meta.id, [member(uid, 'owner')])
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
      deleted.set(id, { ...t, at: Date.now() })
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
  const people: PeopleApi = {
    async people(tripId) {
      const me = roleIn(tripId, uidOf())
      if (!up || !me) return null
      return {
        me,
        members: members.get(tripId) ?? [],
        invites: [...invites.values()].filter((i) => i.tripId === tripId && !i.used),
        online: [],
      }
    },
    async createInvite(tripId, role, travelerId) {
      if (!up) return { ok: false, reason: 'offline' }
      const me = roleIn(tripId, uidOf())
      if (!me || me === 'viewer' || (me === 'editor' && role !== 'viewer'))
        return { ok: false, reason: 'role' }
      const id = `i${invites.size + 1}`
      const token = `tok${id}xxxxxxxxxxxxxxxx`
      const now = Date.now()
      invites.set(id, {
        id,
        tripId,
        token,
        role,
        travelerId: travelerId ?? null,
        email: null,
        createdBy: uidOf()!,
        createdAt: now,
        expiresAt: now + 7 * 864e5,
      })
      return { ok: true, id, url: `https://ludotrip.test/convite/${token}`, expiresAt: now + 7 * 864e5 }
    },
    async revokeInvite(_tripId, inviteId) {
      if (!up) return { ok: false, reason: 'offline' }
      invites.delete(inviteId)
      return { ok: true }
    },
    async setRole(tripId, uid, role) {
      const m = members.get(tripId)?.find((x) => x.uid === uid)
      if (!m) return { ok: false, reason: 'not-found' }
      m.role = role
      return { ok: true }
    },
    async removeMember(tripId, uid) {
      if (!up) return { ok: false, reason: 'offline' }
      if (roleIn(tripId, uid) === 'owner') return { ok: false, reason: 'owner-must-transfer' }
      members.set(
        tripId,
        (members.get(tripId) ?? []).filter((m) => m.uid !== uid),
      )
      return { ok: true }
    },
    async transfer(tripId, uid) {
      const list = members.get(tripId) ?? []
      for (const m of list) if (m.role === 'owner') m.role = 'editor'
      const to = list.find((m) => m.uid === uid)
      if (!to) return { ok: false, reason: 'not-found' }
      to.role = 'owner'
      return { ok: true }
    },
    async deleted() {
      if (!up) return null
      const uid = uidOf()
      return [...deleted.entries()]
        .filter(([, t]) => t.owner === uid)
        .map(([id, t]) => ({
          id,
          name: t.server.state.doc.meta.name,
          start: null,
          end: null,
          deletedAt: t.at,
          purgeAt: t.at + 30 * 864e5,
        }))
    },
    async restore(tripId) {
      if (!up) return { ok: false, reason: 'offline' }
      const t = deleted.get(tripId)
      if (!t || t.owner !== uidOf()) return { ok: false, reason: 'not-found' }
      deleted.delete(tripId)
      trips.set(tripId, t)
      return { ok: true }
    },
    async history() {
      return { items: [], more: false }
    },
    async preview(token) {
      if (!up) return { ok: false, reason: 'offline' }
      const inv = [...invites.values()].find((i) => i.token === token)
      const t = inv && trips.get(inv.tripId)
      if (!inv || !t || inv.used) return { ok: false, reason: 'invalid' }
      const doc = t.server.state.doc
      return {
        ok: true,
        preview: {
          tripId: inv.tripId,
          tripName: doc.meta.name,
          inviter: names.get(inv.createdBy) ?? inv.createdBy,
          role: inv.role,
          start: doc.itinerary.start ?? null,
          end: null,
          destinations: doc.destinations.map((d) => d.name).slice(0, 12),
          travels: !!inv.travelerId,
          expiresAt: inv.expiresAt,
        },
      }
    },
    async accept(token) {
      const uid = uidOf()
      if (!uid) return { ok: false, reason: 'auth' }
      if (!up) return { ok: false, reason: 'offline' }
      const inv = [...invites.values()].find((i) => i.token === token)
      if (!inv || !trips.get(inv.tripId)) return { ok: false, reason: 'invalid' }
      const already = roleIn(inv.tripId, uid)
      if (already) return { ok: true, tripId: inv.tripId, role: already, already: true }
      if (inv.used) return { ok: false, reason: 'invalid' }
      inv.used = true
      members.get(inv.tripId)!.push(member(uid, inv.role))
      if (inv.travelerId)
        api_.remoteEdit(inv.tripId, uid, `join-${inv.id}`, {
          type: 'engine',
          command: { type: 'setTraveler', id: inv.travelerId, name: names.get(uid) ?? uid, userId: uid },
        })
      return { ok: true, tripId: inv.tripId, role: inv.role, already: false }
    },
  }
  const api_ = {
    api,
    people,
    trips,
    deleted,
    members,
    invites,
    /** O nome que os outros veem (o do login). */
    nameAs(uid: string, name: string) {
      names.set(uid, name)
    },
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
  return api_
}
