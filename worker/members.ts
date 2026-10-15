import { firstName, invitesOf } from './invites'
import type { Role } from './db'
import { fail, json } from './http'
import type { Ctx } from './http'
import { DELETED_MS } from './limits'
import { log, uidHash } from './log'

// Quem participa de uma viagem (spec publicação §4.1, §4.5, §4.6): papéis, tirar, sair, passar,
// apagar para todos e recuperar, e o Histórico. O D1 decide quem pode o quê; a viagem (TripRoom) é
// avisada para valer já nas conexões abertas.

interface MemberRow {
  uid: string
  role: Role
  joined_at: number
  name: string | null
  email: string | null
  photo_url: string | null
}

async function membersOf(db: D1Database, tripId: string) {
  const { results } = await db
    .prepare(
      `SELECT m.uid, m.role, m.joined_at, u.name, u.email, u.photo_url
       FROM members m LEFT JOIN users u ON u.uid = m.uid WHERE m.trip_id = ?1 ORDER BY m.joined_at`,
    )
    .bind(tripId)
    .all<MemberRow>()
  return results
}

/** GET /api/trips/<id>/people: membros, convites aguardando e quem está com a viagem aberta. */
export async function people(c: Ctx, tripId: string, role: Role | null): Promise<Response> {
  if (!role) return fail(404, 'not-found')
  const { env } = c
  const [members, invites, online] = await Promise.all([
    membersOf(env.DB, tripId),
    invitesOf(env.DB, tripId),
    env.TRIPS.getByName(tripId).online(),
  ])
  return json({
    me: role,
    members: members.map((m) => ({
      uid: m.uid,
      name: firstName(m.name, m.email),
      fullName: m.name,
      photo: m.photo_url,
      role: m.role,
      joinedAt: m.joined_at,
    })),
    // Só quem pode convidar vê os convites.
    invites: role === 'viewer' ? [] : invites,
    online,
  })
}

/** PATCH /api/trips/<id>/members/<uid> { role }: só o Dono, entre Planeja junto e Só vê. */
export async function setMemberRole(c: Ctx, tripId: string, uid: string, role: Role | null) {
  const { env, request } = c
  if (role !== 'owner') return fail(role ? 403 : 404, role ? 'role' : 'not-found')
  const body = (await request.json().catch(() => ({}))) as { role?: string }
  const next = body.role === 'editor' || body.role === 'viewer' ? body.role : null
  if (!next) return fail(400, 'invalid')
  const r = await env.DB.prepare(
    `UPDATE members SET role = ?3 WHERE trip_id = ?1 AND uid = ?2 AND role != 'owner'`,
  )
    .bind(tripId, uid, next)
    .run()
  if (!r.meta.changes) return fail(404, 'not-found')
  const room = env.TRIPS.getByName(tripId)
  await room.setRole(uid, next)
  await room.peopleChanged()
  log({ msg: 'papel mudou', trip: tripId, role: next, uid: await uidHash(uid) })
  return json({ ok: true })
}

/**
 * DELETE /api/trips/<id>/members/<uid>?traveler=1: o Dono tira alguém; qualquer um (menos o Dono) sai.
 * `traveler=1` também tira a pessoa de "Quem vai".
 */
export async function removeMember(c: Ctx, tripId: string, uid: string, role: Role | null) {
  const { env, url, who } = c
  if (!role) return fail(404, 'not-found')
  const self = uid === who!.uid
  if (self && role === 'owner') return fail(409, 'owner-must-transfer')
  if (!self && role !== 'owner') return fail(403, 'role')
  const r = await env.DB.prepare(`DELETE FROM members WHERE trip_id = ?1 AND uid = ?2 AND role != 'owner'`)
    .bind(tripId, uid)
    .run()
  if (!r.meta.changes) return fail(404, 'not-found')
  const also = url.searchParams.get('traveler') === '1'
  await env.TRIPS.getByName(tripId).removeMember(uid, also, who!.uid, `leave-${crypto.randomUUID()}`)
  log({
    msg: self ? 'saiu da viagem' : 'membro removido',
    trip: tripId,
    traveler: also,
    uid: await uidHash(uid),
  })
  return json({ ok: true })
}

/** POST /api/trips/<id>/transfer { uid }: o Dono passa a viagem; ele vira "Planeja junto". */
export async function transfer(c: Ctx, tripId: string, role: Role | null) {
  const { env, request, who } = c
  if (role !== 'owner') return fail(role ? 403 : 404, role ? 'role' : 'not-found')
  const body = (await request.json().catch(() => ({}))) as { uid?: string }
  const to = typeof body.uid === 'string' ? body.uid : ''
  if (!to || to === who!.uid) return fail(400, 'invalid')
  const target = await env.DB.prepare('SELECT role FROM members WHERE trip_id = ?1 AND uid = ?2')
    .bind(tripId, to)
    .first<{ role: Role }>()
  if (!target) return fail(404, 'not-found')
  await env.DB.batch([
    env.DB.prepare(`UPDATE members SET role = 'owner' WHERE trip_id = ?1 AND uid = ?2`).bind(tripId, to),
    env.DB.prepare(`UPDATE members SET role = 'editor' WHERE trip_id = ?1 AND uid = ?2`).bind(
      tripId,
      who!.uid,
    ),
    env.DB.prepare('UPDATE trips SET owner_uid = ?2 WHERE id = ?1').bind(tripId, to),
  ])
  const room = env.TRIPS.getByName(tripId)
  await room.setRole(to, 'owner')
  await room.setRole(who!.uid, 'editor')
  await room.peopleChanged()
  log({ msg: 'viagem passada', trip: tripId, to: await uidHash(to) })
  return json({ ok: true })
}

/** DELETE /api/trips/<id>: só o Dono. Vai para "Apagadas" por 30 dias (dá para recuperar). */
export async function softDelete(c: Ctx, tripId: string, role: Role | null) {
  const { env, who } = c
  if (role !== 'owner') return fail(role ? 403 : 404, role ? 'forbidden' : 'not-found')
  const at = Date.now()
  await env.DB.prepare('UPDATE trips SET deleted_at = ?2, deleted_by = ?3 WHERE id = ?1')
    .bind(tripId, at, who!.uid)
    .run()
  await env.TRIPS.getByName(tripId).markDeleted(firstName(who!.name, who!.email), at)
  log({ msg: 'viagem apagada', trip: tripId })
  return json({ ok: true, deletedAt: at })
}

/** POST /api/trips/<id>/restore: o Dono traz de volta de "Apagadas". */
export async function restore(c: Ctx, tripId: string) {
  const { env, who } = c
  const t = await env.DB.prepare('SELECT owner_uid, deleted_at FROM trips WHERE id = ?1')
    .bind(tripId)
    .first<{ owner_uid: string; deleted_at: number | null }>()
  if (!t || t.owner_uid !== who!.uid) return fail(404, 'not-found')
  if (!t.deleted_at) return json({ ok: true })
  if (Date.now() - t.deleted_at >= DELETED_MS) return fail(410, 'gone')
  await env.DB.prepare('UPDATE trips SET deleted_at = NULL, deleted_by = NULL WHERE id = ?1')
    .bind(tripId)
    .run()
  await env.TRIPS.getByName(tripId).restored()
  log({ msg: 'viagem recuperada', trip: tripId })
  return json({ ok: true })
}

/** GET /api/trips?deleted=1: as viagens do Dono em "Apagadas". */
export async function deletedTrips(db: D1Database, uid: string) {
  const { results } = await db
    .prepare(
      `SELECT id, name, start, "end", deleted_at FROM trips
       WHERE owner_uid = ?1 AND deleted_at IS NOT NULL AND deleted_at > ?2 ORDER BY deleted_at DESC`,
    )
    .bind(uid, Date.now() - DELETED_MS)
    .all<{ id: string; name: string; start: string | null; end: string | null; deleted_at: number }>()
  return results.map((t) => ({
    id: t.id,
    name: t.name,
    start: t.start,
    end: t.end,
    deletedAt: t.deleted_at,
    purgeAt: t.deleted_at + DELETED_MS,
  }))
}

/** GET /api/trips/<id>/history?before=<seq>: quem fez o quê, de 50 em 50. */
export async function history(c: Ctx, tripId: string, role: Role | null) {
  const { env, url } = c
  if (!role) return fail(404, 'not-found')
  const raw = Number(url.searchParams.get('before'))
  const before = Number.isInteger(raw) && raw > 0 ? raw : null
  const rows = await env.TRIPS.getByName(tripId).history(before, 50)
  const uids = [...new Set(rows.map((r) => r.uid))]
  const names = new Map<string, string>()
  if (uids.length) {
    const { results } = await env.DB.prepare(
      `SELECT uid, name, email FROM users WHERE uid IN (SELECT value FROM json_each(?1))`,
    )
      .bind(JSON.stringify(uids))
      .all<{ uid: string; name: string | null; email: string | null }>()
    for (const u of results) names.set(u.uid, firstName(u.name, u.email))
  }
  return json({
    items: rows.map((r) => ({
      seq: r.seq,
      uid: r.uid,
      name: names.get(r.uid) ?? 'Alguém',
      at: r.at,
      text: r.text ?? 'Mudou a viagem.',
    })),
    more: rows.length === 50,
  })
}
