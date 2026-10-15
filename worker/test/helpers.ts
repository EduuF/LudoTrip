import { exports } from 'cloudflare:workers'

// Chamadas à API como se viessem do app, com o login de teste (TEST_AUTH=1).

export const BASE = 'https://ludotrip.test'

export async function tokenFor(uid: string, name?: string): Promise<string> {
  const q = new URLSearchParams({ uid, ...(name ? { name } : {}) })
  const r = await exports.default.fetch(`${BASE}/api/test/token?${q}`)
  return ((await r.json()) as { token: string }).token
}

export async function api(path: string, opts: { uid?: string; method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {}
  if (opts.uid) headers.Authorization = `Bearer ${await tokenFor(opts.uid)}`
  if (opts.body !== undefined) headers['content-type'] = 'application/json'
  return exports.default.fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  })
}
