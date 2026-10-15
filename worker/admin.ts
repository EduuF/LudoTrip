import { fail, json } from './http'
import type { Ctx } from './http'
import { log } from './log'

// Administração (spec publicação §5.8): voltar uma viagem para um instante dos últimos 30 dias.
// Só com o segredo ADMIN_TOKEN (wrangler secret), comparado em tempo constante. Quem usa é o workflow
// "Recuperar uma viagem" do GitHub (o mantenedor só preenche o id e o horário).

async function sameSecret(provided: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(provided)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ])
  return crypto.subtle.timingSafeEqual(a, b)
}

const DAY = 24 * 3600 * 1000

export async function adminRoutes(c: Ctx): Promise<Response> {
  const { env, request, url } = c
  const expected = env.ADMIN_TOKEN
  const header = request.headers.get('Authorization') ?? ''
  const provided = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!expected || !provided || !(await sameSecret(provided, expected))) return fail(403, 'forbidden')

  if (url.pathname === '/api/admin/restore' && request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as { tripId?: unknown; at?: unknown } | null
    const tripId = typeof body?.tripId === 'string' ? body.tripId : ''
    const at = typeof body?.at === 'number' ? body.at : NaN
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(tripId) || !Number.isFinite(at)) return fail(400, 'invalid')
    if (at > Date.now() || at < Date.now() - 30 * DAY) return fail(400, 'out-of-range')
    try {
      const undo = await env.TRIPS.getByName(tripId).restoreTo(at)
      log({ msg: 'restore', trip: tripId, at, reqId: c.reqId })
      return json({ ok: true, undo })
    } catch (e) {
      return json({ reason: 'restore-failed', error: e instanceof Error ? e.message : String(e) }, 500)
    }
  }
  return fail(404, 'not-found')
}
