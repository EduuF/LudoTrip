import { tripRange } from '../src/engine'
import { memberCount, roleOf, upsertUser } from './db'
import type { Role } from './db'
import { fail, json } from './http'
import type { Ctx } from './http'
import { INVITE_MS, MAX_MEMBERS, MAX_PENDING_INVITES } from './limits'
import { log, uidHash } from './log'

// Convites (spec publicação §4.3–4.4). O link é a credencial: tem 128 bits aleatórios, vale uma vez e
// por 7 dias. O banco guarda só o SHA-256 dele; o token nunca volta numa listagem nem vai para o log.

const ID = /^[A-Za-z0-9._-]{1,64}$/

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

export const randomToken = (bytes: number) => b64url(crypto.getRandomValues(new Uint8Array(bytes)))

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** O primeiro nome que os outros veem ("Ana"), nunca o e-mail inteiro. */
export function firstName(name: string | null | undefined, email?: string | null): string {
  const first = name?.trim().split(/\s+/)[0]
  if (first) return first
  const local = email?.split('@')[0]?.trim()
  return local ? local.slice(0, 20) : 'Alguém'
}

/** "b•••@gmail.com": quem convidou confere para quem foi, sem expor o endereço inteiro. */
export const maskEmail = (email: string) => {
  const [user = '', host = ''] = email.split('@')
  return `${user.slice(0, 1)}•••@${host}`
}

interface InviteRow {
  id: string
  trip_id: string
  role: Exclude<Role, 'owner'>
  traveler_id: string | null
  email: string | null
  created_by: string
  created_at: number
  expires_at: number
  used_by: string | null
  used_at: number | null
  revoked_at: number | null
}

const pending = (now: number) => `used_by IS NULL AND revoked_at IS NULL AND expires_at > ${now}`

/** POST /api/trips/<id>/invites: o Dono chama para planejar ou ver; "Planeja junto" só para ver. */
export async function createInvite(c: Ctx, tripId: string, role: Role | null): Promise<Response> {
  const { env, request, url, who } = c
  if (!role) return fail(404, 'not-found')
  const body = (await request.json().catch(() => ({}))) as { role?: string; travelerId?: string }
  const wanted = body.role === 'viewer' ? 'viewer' : body.role === 'editor' ? 'editor' : null
  if (!wanted) return fail(400, 'invalid')
  if (role === 'viewer' || (role === 'editor' && wanted !== 'viewer')) return fail(403, 'role')
  if (body.travelerId !== undefined && (typeof body.travelerId !== 'string' || !ID.test(body.travelerId)))
    return fail(400, 'invalid')
  const now = Date.now()
  if ((await memberCount(env.DB, tripId)) >= MAX_MEMBERS) return fail(403, 'full')
  const open = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM invites WHERE trip_id = ?1 AND ${pending(now)}`,
  )
    .bind(tripId)
    .first<{ n: number }>()
  if ((open?.n ?? 0) >= MAX_PENDING_INVITES) return fail(403, 'invites-limit')
  const token = randomToken(16)
  const id = randomToken(9)
  const expiresAt = now + INVITE_MS
  await env.DB.prepare(
    `INSERT INTO invites (id, token_hash, trip_id, role, traveler_id, created_by, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  )
    .bind(id, await sha256(token), tripId, wanted, body.travelerId ?? null, who!.uid, now, expiresAt)
    .run()
  await env.TRIPS.getByName(tripId).peopleChanged()
  log({
    msg: 'convite criado',
    trip: tripId,
    invite: id,
    role: wanted,
    traveler: !!body.travelerId,
    uid: await uidHash(who!.uid),
  })
  return json({ id, token, url: `${url.origin}/convite/${token}`, role: wanted, expiresAt }, 201)
}

/** DELETE /api/trips/<id>/invites/<inviteId>: o link para de valer na hora. */
export async function revokeInvite(
  c: Ctx,
  tripId: string,
  inviteId: string,
  role: Role | null,
): Promise<Response> {
  const { env, who } = c
  if (!role) return fail(404, 'not-found')
  const inv = await env.DB.prepare('SELECT * FROM invites WHERE id = ?1 AND trip_id = ?2')
    .bind(inviteId, tripId)
    .first<InviteRow>()
  if (!inv) return fail(404, 'not-found')
  if (role !== 'owner' && inv.created_by !== who!.uid) return fail(403, 'role')
  if (!inv.revoked_at && !inv.used_by)
    await env.DB.prepare('UPDATE invites SET revoked_at = ?2 WHERE id = ?1').bind(inviteId, Date.now()).run()
  await env.TRIPS.getByName(tripId).peopleChanged()
  log({ msg: 'convite cancelado', trip: tripId, invite: inviteId })
  return json({ ok: true, travelerId: inv.traveler_id })
}

/** Os convites que "Convites aguardando" mostra: os que ainda valem e os vencidos sem uso. */
export async function invitesOf(db: D1Database, tripId: string) {
  const { results } = await db
    .prepare(
      `SELECT * FROM invites WHERE trip_id = ?1 AND used_by IS NULL AND revoked_at IS NULL ORDER BY created_at DESC`,
    )
    .bind(tripId)
    .all<InviteRow>()
  return results.map((i) => ({
    id: i.id,
    role: i.role,
    travelerId: i.traveler_id,
    email: i.email ? maskEmail(i.email) : null,
    createdBy: i.created_by,
    createdAt: i.created_at,
    expiresAt: i.expires_at,
  }))
}

interface Found {
  inv: InviteRow
  trip: { id: string; name: string; start: string | null; end: string | null; deleted_at: number | null }
  inviter: string
}

async function find(db: D1Database, token: string): Promise<Found | null> {
  if (!token || token.length > 64) return null
  const row = await db
    .prepare(
      `SELECT i.*, t.name AS trip_name, t.start AS trip_start, t."end" AS trip_end, t.deleted_at AS trip_deleted,
              u.name AS inviter_name, u.email AS inviter_email
       FROM invites i JOIN trips t ON t.id = i.trip_id LEFT JOIN users u ON u.uid = i.created_by
       WHERE i.token_hash = ?1`,
    )
    .bind(await sha256(token))
    .first<
      InviteRow & {
        trip_name: string
        trip_start: string | null
        trip_end: string | null
        trip_deleted: number | null
        inviter_name: string | null
        inviter_email: string | null
      }
    >()
  if (!row) return null
  return {
    inv: row,
    trip: {
      id: row.trip_id,
      name: row.trip_name,
      start: row.trip_start,
      end: row.trip_end,
      deleted_at: row.trip_deleted,
    },
    inviter: firstName(row.inviter_name, row.inviter_email),
  }
}

const usable = (inv: InviteRow, now: number) => !inv.used_by && !inv.revoked_at && inv.expires_at > now

/** /api/invites/<token> (prévia, sem conta) e /api/invites/<token>/accept. */
export async function inviteRoutes(c: Ctx): Promise<Response> {
  const { env, request, url, who } = c
  const [, , token = '', sub] = url.pathname.split('/').filter(Boolean)
  const found = await find(env.DB, token)
  const now = Date.now()

  if (!sub && request.method === 'GET') {
    if (!found) return fail(404, 'invalid')
    const { inv, trip, inviter } = found
    if (trip.deleted_at) return json({ reason: 'deleted', inviter }, 410)
    if (!usable(inv, now)) return json({ reason: 'invalid', inviter }, 410)
    if ((await memberCount(env.DB, trip.id)) >= MAX_MEMBERS) return json({ reason: 'full', inviter }, 403)
    // A prévia expõe pouco (spec §4.4): nome, quem chamou, datas e destinos. Nada de anotações.
    const cur = await env.TRIPS.getByName(trip.id).exportDoc()
    const doc = cur?.doc
    const names = doc
      ? [
          ...new Set(
            doc.itinerary.stops
              .map((s) => doc.destinations.find((d) => d.id === s.destinationId)?.name)
              .filter((n): n is string => !!n),
          ),
        ]
      : []
    const range = doc ? tripRange(doc.itinerary) : { start: trip.start, end: trip.end }
    const traveler = inv.traveler_id
      ? doc?.itinerary.travelers.find((t) => t.id === inv.traveler_id)
      : undefined
    log({ msg: 'convite aberto', trip: trip.id, invite: inv.id })
    return json({
      tripId: trip.id,
      tripName: trip.name,
      inviter,
      role: inv.role,
      start: range.start,
      end: range.end,
      destinations: names.slice(0, 12),
      travels: !!traveler,
      expiresAt: inv.expires_at,
    })
  }

  if (sub === 'accept' && request.method === 'POST') {
    if (!who) return fail(401, 'auth')
    if (!found) return fail(404, 'invalid')
    const { inv, trip, inviter } = found
    if (trip.deleted_at) return json({ reason: 'deleted', inviter }, 410)
    await upsertUser(env.DB, who)
    // Já está na viagem: abre, e o convite continua sem uso (pode servir a outra pessoa).
    const already = await roleOf(env.DB, trip.id, who.uid)
    if (already) return json({ tripId: trip.id, role: already, already: true })
    if (!usable(inv, now)) return json({ reason: 'invalid', inviter }, 410)
    if ((await memberCount(env.DB, trip.id)) >= MAX_MEMBERS) return json({ reason: 'full', inviter }, 403)
    // Uso único: só o primeiro que chegar marca o convite.
    const mark = await env.DB.prepare(
      `UPDATE invites SET used_by = ?2, used_at = ?3 WHERE id = ?1 AND ${pending(now)}`,
    )
      .bind(inv.id, who.uid, now)
      .run()
    if (!mark.meta.changes) return json({ reason: 'invalid', inviter }, 410)
    await env.DB.prepare(
      `INSERT INTO members (trip_id, uid, role, joined_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT DO NOTHING`,
    )
      .bind(trip.id, who.uid, inv.role, now)
      .run()
    await env.TRIPS.getByName(trip.id).join(who.uid, firstName(who.name, who.email), inv.traveler_id, inv.id)
    log({ msg: 'convite aceito', trip: trip.id, invite: inv.id, role: inv.role, uid: await uidHash(who.uid) })
    return json({ tripId: trip.id, role: inv.role, already: false })
  }

  return fail(404, 'not-found')
}
