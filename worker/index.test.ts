import { describe, expect, it } from 'vitest'
import { env } from 'cloudflare:workers'

import { proxyAuth } from './index'
import type { AppEnv } from './env'
import { api, BASE } from './test/helpers'

describe('API base', () => {
  it('health confere o banco', async () => {
    const r = await api('/api/health')
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ ok: true })
  })

  it('/api/me exige login e guarda a conta', async () => {
    expect((await api('/api/me')).status).toBe(401)
    const r = await api('/api/me', { uid: 'ana' })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ uid: 'ana' })
    const row = await env.DB.prepare('SELECT uid FROM users WHERE uid = ?1').bind('ana').first()
    expect(row).toEqual({ uid: 'ana' })
  })

  it('rota desconhecida dá 404', async () => {
    expect((await api('/api/nada', { uid: 'ana' })).status).toBe(404)
  })
})

describe('login de teste nunca em produção', () => {
  it('sem TEST_AUTH, /api/test/token não existe', async () => {
    const { default: worker } = await import('./index')
    const r = await worker.fetch(
      new Request(`${BASE}/api/test/token?uid=x`),
      { ...(env as AppEnv), TEST_AUTH: undefined },
      { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext,
    )
    expect(r.status).toBe(404)
  })
})

describe('repasse do login (/__/auth) para o Firebase', () => {
  it('GET e POST chegam com o mesmo caminho, query e corpo, sem redirecionar', async () => {
    const seen: { url: string; method: string; body: string; redirect: string }[] = []
    const fake = (async (req: Request) => {
      seen.push({ url: req.url, method: req.method, body: await req.text(), redirect: req.redirect })
      return new Response('ok')
    }) as typeof fetch
    const e = { ...(env as AppEnv), FIREBASE_PROJECT_ID: 'ludotrip' }
    await proxyAuth(new Request(`${BASE}/__/auth/handler?apiKey=k&x=1`), e, fake)
    await proxyAuth(new Request(`${BASE}/__/auth/handler`, { method: 'POST', body: 'a=1' }), e, fake)
    expect(seen).toEqual([
      {
        url: 'https://ludotrip.firebaseapp.com/__/auth/handler?apiKey=k&x=1',
        method: 'GET',
        body: '',
        redirect: 'manual',
      },
      {
        url: 'https://ludotrip.firebaseapp.com/__/auth/handler',
        method: 'POST',
        body: 'a=1',
        redirect: 'manual',
      },
    ])
  })
})
