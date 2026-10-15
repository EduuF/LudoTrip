import type { AuthClient } from '../auth/authClient'
import type { Role } from './protocol'

// Pessoas e convites vistos do app (spec publicação §4). HTTP com o token no cabeçalho, como o resto
// da API; a prévia do convite é a única chamada sem conta.

export interface Member {
  uid: string
  /** Primeiro nome ("Ana"). */
  name: string
  fullName: string | null
  photo: string | null
  role: Role
  joinedAt: number
}

export interface PendingInvite {
  id: string
  role: Exclude<Role, 'owner'>
  travelerId: string | null
  /** Mascarado ("b•••@gmail.com"), quando foi por e-mail. */
  email: string | null
  createdBy: string
  createdAt: number
  expiresAt: number
}

export interface People {
  me: Role
  members: Member[]
  invites: PendingInvite[]
  online: string[]
}

export interface InvitePreview {
  tripId: string
  tripName: string
  inviter: string
  role: Exclude<Role, 'owner'>
  start: string | null
  end: string | null
  destinations: string[]
  travels: boolean
  expiresAt: number
}

export type InviteProblem = 'invalid' | 'deleted' | 'full'

export type PreviewResult =
  { ok: true; preview: InvitePreview } | { ok: false; reason: InviteProblem | 'offline'; inviter?: string }

export type AcceptResult =
  | { ok: true; tripId: string; role: Role; already: boolean }
  | { ok: false; reason: InviteProblem | 'offline' | 'auth' | 'error'; inviter?: string }

export type CreateInviteResult =
  | { ok: true; id: string; url: string; expiresAt: number }
  | { ok: false; reason: 'role' | 'full' | 'invites-limit' | 'offline' | 'error' }

export type Done = { ok: true } | { ok: false; reason: string }

export interface DeletedTrip {
  id: string
  name: string
  start: string | null
  end: string | null
  deletedAt: number
  purgeAt: number
}

export interface HistoryItem {
  seq: number
  uid: string
  name: string
  at: number
  text: string
}

export interface PeopleApi {
  people(tripId: string): Promise<People | null>
  createInvite(tripId: string, role: Exclude<Role, 'owner'>, travelerId?: string): Promise<CreateInviteResult>
  revokeInvite(tripId: string, inviteId: string): Promise<Done>
  setRole(tripId: string, uid: string, role: Exclude<Role, 'owner'>): Promise<Done>
  removeMember(tripId: string, uid: string, alsoTraveler: boolean): Promise<Done>
  transfer(tripId: string, uid: string): Promise<Done>
  deleted(): Promise<DeletedTrip[] | null>
  restore(tripId: string): Promise<Done>
  history(tripId: string, before?: number): Promise<{ items: HistoryItem[]; more: boolean } | null>
  preview(token: string): Promise<PreviewResult>
  accept(token: string): Promise<AcceptResult>
}

const PROBLEMS: InviteProblem[] = ['invalid', 'deleted', 'full']

export function httpPeopleApi(auth: AuthClient, origin = location.origin, app = 'web'): PeopleApi {
  const call = async (path: string, init: RequestInit = {}, signed = true): Promise<Response | null> => {
    const token = signed ? await auth.token() : null
    if (signed && !token) return null
    try {
      return await fetch(`${origin}${path}`, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.body ? { 'content-type': 'application/json' } : {}),
          'x-ludotrip-app': app,
        },
      })
    } catch {
      return null
    }
  }
  const trip = (id: string) => `/api/trips/${encodeURIComponent(id)}`
  const body = async <T>(r: Response | null): Promise<T | null> =>
    r ? ((await r.json().catch(() => null)) as T | null) : null
  const done = async (r: Response | null): Promise<Done> => {
    if (!r) return { ok: false, reason: 'offline' }
    if (r.ok) return { ok: true }
    return { ok: false, reason: (await body<{ reason?: string }>(r))?.reason ?? 'error' }
  }
  return {
    async people(tripId) {
      const r = await call(`${trip(tripId)}/people`)
      return r?.ok ? body<People>(r) : null
    },
    async createInvite(tripId, role, travelerId) {
      const r = await call(`${trip(tripId)}/invites`, {
        method: 'POST',
        body: JSON.stringify({ role, ...(travelerId ? { travelerId } : {}) }),
      })
      if (!r) return { ok: false, reason: 'offline' }
      const b = await body<{ id: string; url: string; expiresAt: number; reason?: string }>(r)
      if (r.ok && b) return { ok: true, id: b.id, url: b.url, expiresAt: b.expiresAt }
      const known = ['role', 'full', 'invites-limit'] as const
      return { ok: false, reason: known.find((k) => k === b?.reason) ?? 'error' }
    },
    revokeInvite: async (tripId, inviteId) =>
      done(await call(`${trip(tripId)}/invites/${encodeURIComponent(inviteId)}`, { method: 'DELETE' })),
    setRole: async (tripId, uid, role) =>
      done(
        await call(`${trip(tripId)}/members/${encodeURIComponent(uid)}`, {
          method: 'PATCH',
          body: JSON.stringify({ role }),
        }),
      ),
    removeMember: async (tripId, uid, alsoTraveler) =>
      done(
        await call(`${trip(tripId)}/members/${encodeURIComponent(uid)}${alsoTraveler ? '?traveler=1' : ''}`, {
          method: 'DELETE',
        }),
      ),
    transfer: async (tripId, uid) =>
      done(await call(`${trip(tripId)}/transfer`, { method: 'POST', body: JSON.stringify({ uid }) })),
    async deleted() {
      const r = await call('/api/trips?deleted=1')
      return r?.ok ? ((await body<{ trips: DeletedTrip[] }>(r))?.trips ?? null) : null
    },
    restore: async (tripId) => done(await call(`${trip(tripId)}/restore`, { method: 'POST' })),
    async history(tripId, before) {
      const r = await call(`${trip(tripId)}/history${before ? `?before=${before}` : ''}`)
      return r?.ok ? body<{ items: HistoryItem[]; more: boolean }>(r) : null
    },
    async preview(token) {
      const r = await call(`/api/invites/${encodeURIComponent(token)}`, {}, false)
      if (!r) return { ok: false, reason: 'offline' }
      const b = await body<InvitePreview & { reason?: string; inviter?: string }>(r)
      if (r.ok && b) return { ok: true, preview: b }
      const reason = PROBLEMS.find((p) => p === b?.reason) ?? 'invalid'
      return { ok: false, reason, ...(b?.inviter ? { inviter: b.inviter } : {}) }
    },
    async accept(token) {
      if (!auth.current()) return { ok: false, reason: 'auth' }
      const r = await call(`/api/invites/${encodeURIComponent(token)}/accept`, { method: 'POST' })
      if (!r) return { ok: false, reason: 'offline' }
      const b = await body<{
        tripId: string
        role: Role
        already: boolean
        reason?: string
        inviter?: string
      }>(r)
      if (r.ok && b) return { ok: true, tripId: b.tripId, role: b.role, already: b.already }
      const reason = PROBLEMS.find((p) => p === b?.reason) ?? (r.status === 401 ? 'auth' : 'error')
      return { ok: false, reason, ...(b?.inviter ? { inviter: b.inviter } : {}) }
    },
  }
}
