import { tripRange } from '../src/engine'
import type { TripDoc } from '../src/app/doc'
import { countOwned, createTrip, myTrips, roleOf, tripOwner, upsertUser } from './db'
import { createInvite, revokeInvite } from './invites'
import {
  deletedTrips,
  history,
  people,
  removeMember,
  restore,
  setMemberRole,
  softDelete,
  transfer,
} from './members'
import { fail, json } from './http'
import type { Ctx } from './http'
import { MAX_DOC_BYTES } from './tripRoom'
import { MAX_TRIPS } from './limits'

// Rotas das viagens da nuvem (spec publicação §3.4, §5).

const ID = /^[A-Za-z0-9._-]{1,64}$/

/** O mínimo para ser uma viagem: o resto o motor confere a cada ação. */
function looksLikeTrip(x: unknown): x is TripDoc {
  const d = x as TripDoc
  return (
    !!d &&
    typeof d === 'object' &&
    !!d.meta &&
    typeof d.meta.id === 'string' &&
    ID.test(d.meta.id) &&
    typeof d.meta.name === 'string' &&
    !!d.itinerary &&
    Array.isArray(d.itinerary.stops)
  )
}

export async function tripRoutes(c: Ctx): Promise<Response> {
  const { env, request, url, who } = c
  if (!who) return fail(401, 'auth')
  const parts = url.pathname.split('/').filter(Boolean) // ['api', 'trips', id?, sub?, item?]
  const id = parts[2]
  const sub = parts[3]
  const item = parts[4]

  // As apagadas para todos (só o Dono vê, com "Recuperar").
  if (!id && request.method === 'GET' && url.searchParams.get('deleted') === '1')
    return json({ trips: await deletedTrips(env.DB, who.uid) })

  // Minhas viagens.
  if (!id && request.method === 'GET') {
    const trips = await myTrips(env.DB, who.uid)
    return json({
      trips: trips.map((t) => ({
        id: t.id,
        name: t.name,
        start: t.start,
        end: t.end,
        version: t.version,
        updatedAt: t.updated_at,
        createdAt: t.created_at,
        role: t.role,
        owner: t.owner_uid,
      })),
    })
  }

  // Levar uma viagem do aparelho para a conta (idempotente para o mesmo dono).
  if (!id && request.method === 'POST') {
    const text = await request.text()
    if (text.length > MAX_DOC_BYTES + 10_000) return fail(413, 'too-big')
    let body: { doc?: unknown }
    try {
      body = JSON.parse(text) as { doc?: unknown }
    } catch {
      return fail(400, 'invalid')
    }
    if (!looksLikeTrip(body.doc)) return fail(400, 'invalid')
    const doc = body.doc
    const owner = await tripOwner(env.DB, doc.meta.id)
    if (owner && owner !== who.uid) return fail(409, 'owned')
    if (!owner && (await countOwned(env.DB, who.uid)) >= MAX_TRIPS) return fail(403, 'limit')
    await upsertUser(env.DB, who)
    const stub = env.TRIPS.getByName(doc.meta.id)
    const r = await stub.init(doc.meta.id, doc, who.uid)
    if (!r.ok) return fail(r.reason === 'owned' ? 409 : 413, r.reason)
    if (!owner) {
      const range = tripRange(doc.itinerary)
      const now = Date.now()
      await createTrip(env.DB, who.uid, {
        id: doc.meta.id,
        name: doc.meta.name,
        start: range.start,
        end: range.end,
        version: r.version,
        sizeBytes: text.length,
        updatedAt: now,
      })
    }
    return json({ id: doc.meta.id, version: r.version, created: r.created }, r.created ? 201 : 200)
  }

  if (!id || !ID.test(id)) return fail(404, 'not-found')
  const role = await roleOf(env.DB, id, who.uid)

  // Abrir a viagem ao vivo.
  if (sub === 'ws' && request.method === 'GET') {
    if (request.headers.get('Upgrade') !== 'websocket') return fail(426, 'websocket')
    if (!role)
      return fail(
        (await tripOwner(env.DB, id)) ? 403 : 404,
        (await tripOwner(env.DB, id)) ? 'forbidden' : 'not-found',
      )
    // Os cabeçalhos internos são sempre os nossos: nunca os que vieram do navegador.
    const headers = new Headers(request.headers)
    headers.set('X-LudoTrip-Uid', who.uid)
    headers.set('X-LudoTrip-Role', role)
    return env.TRIPS.getByName(id).fetch(new Request(request.url, { headers }))
  }

  // Colaboração (M5): pessoas, convites, papéis, passar, apagar para todos, recuperar e Histórico.
  const m = request.method
  if (!sub && m === 'DELETE') return softDelete(c, id, role)
  if (sub === 'restore' && m === 'POST') return restore(c, id)
  if (sub === 'people' && m === 'GET') return people(c, id, role)
  if (sub === 'history' && m === 'GET') return history(c, id, role)
  if (sub === 'invites' && !item && m === 'POST') return createInvite(c, id, role)
  if (sub === 'invites' && item && m === 'DELETE') return revokeInvite(c, id, item, role)
  if (sub === 'members' && item && m === 'PATCH') return setMemberRole(c, id, decodeURIComponent(item), role)
  if (sub === 'members' && item && m === 'DELETE') return removeMember(c, id, decodeURIComponent(item), role)
  if (sub === 'transfer' && m === 'POST') return transfer(c, id, role)

  return fail(404, 'not-found')
}
