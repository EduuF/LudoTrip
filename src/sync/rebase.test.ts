import { describe, expect, it } from 'vitest'
import { japao } from '../engine/fixtures/trips'
import { runDoc } from '../app/doc'
import type { DocAction, TripDoc } from '../app/doc'
import { rebase } from './rebase'
import type { PendingOp } from './protocol'

const docOf = (): TripDoc => {
  const t = japao()
  return {
    meta: { id: 't1', name: t.name, createdAt: 0, updatedAt: 0 },
    itinerary: t.itinerary,
    destinations: t.destinations,
    places: t.places,
    bookings: t.bookings,
    seq: 0,
  }
}
const op = (opId: string, action: DocAction): PendingOp => ({ opId, tripId: 't1', at: 0, action })

describe('remontar: estado do servidor + pendentes deste aparelho', () => {
  it('pendentes que não conflitam se somam à mudança de outra pessoa', () => {
    const base = docOf()
    const theirs = runDoc(base, { type: 'setPlace', id: 'p-kyoto-2', patch: { note: 'da Bia' } })
    if (!theirs.ok) throw new Error('falhou')
    const mine = [
      op('11111111-1111-4111-8111-111111111111', {
        type: 'setPlace',
        id: 'p-kyoto-1',
        patch: { note: 'minha' },
      }),
      op('22222222-2222-4222-8222-222222222222', {
        type: 'addPlace',
        place: { destinationId: 'd-kyoto', name: 'Nova', rarity: 'want' },
      }),
    ]
    const r = rebase(theirs.doc, mine)
    expect(r.refused).toEqual([])
    expect(r.doc.places.find((p) => p.id === 'p-kyoto-1')!.note).toBe('minha')
    expect(r.doc.places.find((p) => p.id === 'p-kyoto-2')!.note).toBe('da Bia')
    // O id criado é o mesmo que o servidor vai criar.
    expect(r.doc.places.at(-1)!.id).toBe('222222222222.1')
  })

  it('pendente cujo alvo sumiu vai para as recusas, sem parar as outras', () => {
    const base = docOf()
    const gone = runDoc(base, { type: 'removePlace', id: 'p-kyoto-1' })
    if (!gone.ok) throw new Error('falhou')
    const r = rebase(gone.doc, [
      op('a', { type: 'setPlace', id: 'p-kyoto-1', patch: { note: 'minha' } }),
      op('b', { type: 'rename', name: 'Outro nome' }),
    ])
    expect(r.refused.map((x) => [x.op.opId, x.reason.code])).toEqual([['a', 'NOT_FOUND']])
    expect(r.doc.meta.name).toBe('Outro nome')
  })

  it('ação que já está valendo (nada muda) não é recusa', () => {
    const r = rebase(docOf(), [
      op('a', {
        type: 'setPlace',
        id: 'p-kyoto-1',
        patch: { rarity: docOf().places.find((p) => p.id === 'p-kyoto-1')!.rarity },
      }),
    ])
    expect(r.refused).toEqual([])
  })
})
