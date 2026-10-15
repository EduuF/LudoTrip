import { describe, expect, it } from 'vitest'
import type { People } from '../sync/peopleApi'
import { ago, canEdit, faces, inDays, inviteFor, inviteLine, invitableRoles } from './people'
import type { TripDoc } from './doc'

const H = 3600_000
const member = (uid: string, role: 'owner' | 'editor' | 'viewer', joinedAt: number) => ({
  uid,
  name: uid,
  fullName: null,
  photo: null,
  role,
  joinedAt,
})

describe('pessoas', () => {
  it('quem pode editar e convidar', () => {
    const doc = (role?: 'owner' | 'editor' | 'viewer') =>
      ({
        meta: {
          id: 'x',
          name: 'X',
          createdAt: 0,
          updatedAt: 0,
          ...(role ? { cloud: { owner: 'a', role, version: 0 } } : {}),
        },
      }) as TripDoc
    expect(canEdit(doc())).toBe(true)
    expect(canEdit(doc('editor'))).toBe(true)
    expect(canEdit(doc('viewer'))).toBe(false)
    expect(invitableRoles('owner')).toEqual(['editor', 'viewer'])
    expect(invitableRoles('editor')).toEqual(['viewer'])
    expect(invitableRoles('viewer')).toEqual([])
  })

  it('tempo em palavras', () => {
    const now = 100 * 24 * H
    expect(ago(now - 10_000, now)).toBe('agora')
    expect(ago(now - 5 * 60_000, now)).toBe('há 5 min')
    expect(ago(now - 2 * H, now)).toBe('há 2 h')
    expect(ago(now - 25 * H, now)).toBe('há 1 dia')
    expect(ago(now - 72 * H, now)).toBe('há 3 dias')
    expect(inDays(now + 3 * 24 * H, now)).toBe('em 3 dias')
    expect(inDays(now + 2 * H, now)).toBe('amanhã')
  })

  it('a linha do convite e o viajante reservado', () => {
    const now = 10 * 24 * H
    const inv = {
      id: 'i',
      role: 'editor' as const,
      travelerId: 't9',
      email: null,
      createdBy: 'a',
      createdAt: now - 2 * H,
      expiresAt: now + H,
    }
    expect(inviteLine(inv, now)).toBe('Link · enviado há 2 h · Planeja junto · vai viajar')
    expect(inviteLine({ ...inv, expiresAt: now - 1, travelerId: null }, now)).toBe(
      'Link · enviado há 2 h · Planeja junto · convite vencido',
    )
    const people: People = { me: 'owner', members: [], invites: [inv], online: [] }
    expect(inviteFor({ id: 't9', name: 'Convidado' }, people)).toBe(inv)
    expect(inviteFor({ id: 't9', name: 'Bia', userId: 'b' }, people)).toBeUndefined()
  })

  it('rostos: online primeiro, depois o Dono; sozinho não mostra nada', () => {
    const people: People = {
      me: 'owner',
      members: [
        member('ana', 'owner', 1),
        member('bia', 'editor', 2),
        member('caio', 'viewer', 3),
        member('davi', 'editor', 4),
        member('eva', 'editor', 5),
      ],
      invites: [],
      online: ['davi'],
    }
    const f = faces(people, 'ana')
    expect(f.shown.map((m) => m.uid)).toEqual(['davi', 'ana', 'bia'])
    expect(f.more).toBe(2)
    expect(faces({ ...people, members: [member('ana', 'owner', 1)] }, 'ana')).toEqual({ shown: [], more: 0 })
  })
})
