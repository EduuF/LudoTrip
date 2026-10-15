import { identify, testAuth } from './auth'
import type { Identity } from './auth'
import { upsertUser } from './db'
import type { AppEnv } from './env'
import { fail, json } from './http'
import type { Ctx } from './http'
import { log, logError, uidHash } from './log'
import { tripRoutes } from './trips'
import { adminRoutes } from './admin'

export { TripRoom } from './tripRoom'

// O Worker do LudoTrip (spec publicação §2.1). Os arquivos do app (dist/) são servidos direto pela
// Cloudflare; só /api/* e /__/auth/* chegam aqui (run_worker_first no wrangler.jsonc).

/**
 * Repassa o login do Firebase pelo nosso domínio, de forma transparente (sem 302): o Safari bloqueia
 * o armazenamento do login quando ele vem de outro domínio (spec §2.3).
 */
export async function proxyAuth(request: Request, env: AppEnv, fetcher: typeof fetch = fetch) {
  const url = new URL(request.url)
  const target = new URL(url.pathname + url.search, `https://${env.FIREBASE_PROJECT_ID}.firebaseapp.com`)
  const init: RequestInit = { method: request.method, headers: request.headers, redirect: 'manual' }
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body
  return fetcher(new Request(target, init))
}

async function route(c: Ctx): Promise<Response> {
  const { url, env, request } = c
  const path = url.pathname

  if (path.startsWith('/__/auth/')) return proxyAuth(request, env)

  if (path === '/api/health') {
    await env.DB.prepare('SELECT 1').first()
    return json({ ok: true, env: env.APP_ENV })
  }

  // Login de teste (e2e): só existe com TEST_AUTH=1, que a produção nunca tem.
  if (path === '/api/test/token') {
    if (env.TEST_AUTH !== '1') return fail(404, 'not-found')
    const uid = url.searchParams.get('uid') ?? 'teste'
    const auth = await testAuth(env.FIREBASE_PROJECT_ID)
    return json({ token: await auth.sign(uid, url.searchParams.get('name') ?? undefined) })
  }

  // Limite por pessoa (ou por IP sem login): 120 por minuto.
  const key = c.who?.uid ?? request.headers.get('CF-Connecting-IP') ?? 'anon'
  const { success } = await env.API.limit({ key })
  if (!success) return fail(429, 'rate')

  if (path === '/api/me') {
    if (!c.who) return fail(401, 'auth')
    await upsertUser(env.DB, c.who)
    return json({ uid: c.who.uid, name: c.who.name, email: c.who.email, picture: c.who.picture })
  }

  if (path === '/api/trips' || path.startsWith('/api/trips/')) return tripRoutes(c)
  if (path.startsWith('/api/admin/')) return adminRoutes(c)

  return fail(404, 'not-found')
}

export default {
  async fetch(request, env: AppEnv, exec): Promise<Response> {
    const started = Date.now()
    const url = new URL(request.url)
    const reqId = request.headers.get('cf-ray') ?? crypto.randomUUID()
    let who: Identity | null = null
    let res: Response
    try {
      who = url.pathname.startsWith('/api/') ? await identify(request, env) : null
      res = await route({ request, url, env, exec, reqId, who })
    } catch (e) {
      logError({
        msg: 'erro',
        reqId,
        path: url.pathname,
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? (e.stack ?? null) : null,
      })
      res = fail(500, 'server')
    }
    if (url.pathname !== '/api/health')
      log({
        msg: 'req',
        reqId,
        method: request.method,
        path: url.pathname.replace(/^\/api\/trips\/[^/]+/, '/api/trips/:id'),
        trip: url.pathname.match(/^\/api\/trips\/([^/]+)/)?.[1] ?? null,
        status: res.status,
        ms: Date.now() - started,
        uid: await uidHash(who?.uid),
        app: request.headers.get('x-ludotrip-app'),
      })
    return res
  },
} satisfies ExportedHandler<AppEnv>
