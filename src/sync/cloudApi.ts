import type { AuthClient } from '../auth/authClient'
import type { TripDoc } from '../app/doc'
import type { Role } from './serverCore'
import { isServerMsg, WS_PROTOCOL } from './protocol'
import type { ClientMsg } from './protocol'
import type { Connector } from './tripSync'

// A API da nuvem vista do app (spec publicação §5): HTTP para listar, subir e apagar viagens; WebSocket
// para a viagem aberta. O token vai no cabeçalho (HTTP) ou no subprotocolo (WebSocket), nunca na URL.

export interface RemoteTrip {
  id: string
  name: string
  start: string | null
  end: string | null
  version: number
  updatedAt: number
  createdAt: number
  role: Role
  owner: string
}

export type UploadResult =
  | { ok: true; version: number; created: boolean }
  | { ok: false; reason: 'owned' | 'limit' | 'too-big' | 'offline' | 'auth' | 'error' }

export interface CloudApi {
  listTrips(): Promise<RemoteTrip[] | null>
  upload(doc: TripDoc): Promise<UploadResult>
  remove(id: string): Promise<boolean>
  connector(tripId: string): Connector
}

export function httpCloudApi(auth: AuthClient, origin = location.origin, app = 'web'): CloudApi {
  const call = async (path: string, init: RequestInit = {}): Promise<Response | null> => {
    const token = await auth.token()
    if (!token) return null
    try {
      return await fetch(`${origin}${path}`, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${token}`,
          'x-ludotrip-app': app,
        },
      })
    } catch {
      return null
    }
  }
  return {
    async listTrips() {
      const r = await call('/api/trips')
      if (!r?.ok) return null
      return ((await r.json()) as { trips: RemoteTrip[] }).trips
    },
    async upload(doc) {
      if (!auth.current()) return { ok: false, reason: 'auth' }
      const r = await call('/api/trips', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ doc }),
      })
      if (!r) return { ok: false, reason: 'offline' }
      const body = (await r.json().catch(() => ({}))) as {
        reason?: string
        version?: number
        created?: boolean
      }
      if (r.ok) return { ok: true, version: body.version ?? 0, created: !!body.created }
      const known = ['owned', 'limit', 'too-big', 'auth'] as const
      const reason = known.find((k) => k === body.reason) ?? 'error'
      return { ok: false, reason }
    },
    async remove(id) {
      const r = await call(`/api/trips/${encodeURIComponent(id)}`, { method: 'DELETE' })
      return !!r?.ok
    },
    connector: (tripId) => (handlers) => {
      let ws: WebSocket | null = null
      let closed = false
      void auth.token().then((token) => {
        if (closed) return
        if (!token) return handlers.onClose({ code: 4401 })
        const url = new URL(`/api/trips/${encodeURIComponent(tripId)}/ws`, origin)
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
        try {
          ws = new WebSocket(url, [WS_PROTOCOL, token])
        } catch {
          return handlers.onClose({})
        }
        ws.onopen = () => handlers.onOpen()
        ws.onmessage = (e) => {
          try {
            const m: unknown = JSON.parse(String(e.data))
            if (isServerMsg(m)) handlers.onMessage(m)
          } catch {
            // mensagem estranha: ignora (o próximo hello põe em dia)
          }
        }
        ws.onclose = (e) => handlers.onClose({ code: e.code })
      })
      return {
        send(msg: ClientMsg) {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
        },
        close() {
          closed = true
          ws?.close()
        },
      }
    },
  }
}
