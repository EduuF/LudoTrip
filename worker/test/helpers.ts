import { exports } from 'cloudflare:workers'
import { japao } from '../../src/engine/fixtures/trips'
import type { TripDoc } from '../../src/app/doc'
import { PROTOCOL } from '../../src/sync/protocol'
import type { ClientMsg, ServerMsg } from '../../src/sync/protocol'
import { WS_PROTOCOL } from '../auth'

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

export function tripDoc(id: string): TripDoc {
  const t = japao()
  return {
    meta: { id, name: t.name, createdAt: 0, updatedAt: 0 },
    itinerary: t.itinerary,
    destinations: t.destinations,
    places: t.places,
    bookings: t.bookings,
    seq: 0,
  }
}

/** Sobe uma viagem para a conta de `uid`. */
export const upload = (uid: string, doc: TripDoc) => api('/api/trips', { uid, method: 'POST', body: { doc } })

export interface Client {
  status: number
  inbox: ServerMsg[]
  send(msg: ClientMsg): void
  hello(sinceVersion?: number): void
  /** Espera chegar uma mensagem que satisfaça `pred` (até 2 s). */
  waitFor(pred: (m: ServerMsg) => boolean): Promise<ServerMsg>
  close(): void
}

export async function connect(tripId: string, uid: string): Promise<Client> {
  const token = await tokenFor(uid)
  const r = await exports.default.fetch(`${BASE}/api/trips/${tripId}/ws`, {
    headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': `${WS_PROTOCOL}, ${token}` },
  })
  const inbox: ServerMsg[] = []
  const ws = r.webSocket
  ws?.accept()
  ws?.addEventListener('message', (e) => inbox.push(JSON.parse(e.data as string) as ServerMsg))
  const send = (msg: ClientMsg) => ws?.send(JSON.stringify(msg))
  return {
    status: r.status,
    inbox,
    send,
    hello: (sinceVersion = -1) =>
      send({ t: 'hello', sinceVersion, protocol: PROTOCOL, schemaVersion: 1, app: 'teste' }),
    async waitFor(pred) {
      for (let i = 0; i < 200; i++) {
        const m = inbox.find(pred)
        if (m) return m
        await new Promise((ok) => setTimeout(ok, 10))
      }
      throw new Error(`mensagem não chegou; recebidas: ${JSON.stringify(inbox.map((m) => m.t))}`)
    },
    close: () => ws?.close(),
  }
}
