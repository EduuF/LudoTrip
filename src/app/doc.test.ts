import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { toCommand } from '../engine/fixtures/arbitrary'
import { japao } from '../engine/fixtures/trips'
import { deepEqual, findVisit } from '../engine'
import { migrate, runDoc, SCHEMA_VERSION, undoDoc } from './doc'
import type { DocAction, TripDoc } from './doc'

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

function roundTrip(doc: TripDoc, action: DocAction): TripDoc {
  const r = runDoc(doc, action)
  if (!r.ok) throw new Error(r.error.code)
  const u = undoDoc(r.doc, r.steps)
  if (!u.ok) throw new Error(u.code)
  const strip = (d: TripDoc) => ({ ...d, seq: 0, itinerary: { ...d.itinerary, version: 0 } })
  expect(deepEqual(strip(u.doc), strip(doc))).toBe(true)
  return r.doc
}

describe('ids novos vêm da ação (publicação §5.2)', () => {
  const add = (name: string): DocAction => ({
    type: 'addPlace',
    place: { destinationId: 'd-kyoto', name, rarity: 'want' },
  })

  it('com opId, os ids são o prefixo da ação + contador, e o seq não muda', () => {
    const r = runDoc(
      docOf(),
      { type: 'batch', actions: [add('A'), add('B')] },
      { opId: '0f9e8d7c-6b5a-4321-8fed-cba987654321' },
    )
    if (!r.ok) throw new Error(r.error.code)
    expect(r.doc.places.slice(-2).map((p) => p.id)).toEqual(['0f9e8d7c6b5a.1', '0f9e8d7c6b5a.2'])
    expect(r.doc.seq).toBe(0)
  })

  it('a mesma ação com o mesmo opId dá o mesmo resultado; opIds diferentes não colidem', () => {
    const d = docOf()
    const a = runDoc(d, add('A'), { opId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
    const b = runDoc(d, add('A'), { opId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
    const c = runDoc(d, add('A'), { opId: 'bbbbbbbb-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
    if (!a.ok || !b.ok || !c.ok) throw new Error('falhou')
    expect(deepEqual(a.doc, b.doc)).toBe(true)
    expect(a.doc.places.at(-1)!.id).not.toBe(c.doc.places.at(-1)!.id)
  })

  it('ids criados pelo motor (novas paradas) também vêm do opId', () => {
    const d = docOf()
    const r = runDoc(
      d,
      {
        type: 'engine',
        command: {
          type: 'insertStop',
          destinationId: 'd-kyoto',
          index: 1,
          nights: 1,
          via: { kind: 'return' },
        },
      },
      { opId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
    )
    if (!r.ok) throw new Error(r.error.code)
    const fresh = r.doc.itinerary.stops.filter((s) => !d.itinerary.stops.some((x) => x.id === s.id))
    expect(fresh.length).toBeGreaterThan(0)
    for (const s of fresh) expect(s.id.startsWith('cccccccccccc.')).toBe(true)
  })
})

describe('reaplicar as mesmas ações dá a mesma viagem (base da nuvem)', () => {
  it('sequências aleatórias com opId: duas execuções terminam idênticas', () => {
    const trip = japao()
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.nat(), fc.nat(), fc.nat(), fc.nat(), fc.nat(), fc.uuid()), { maxLength: 15 }),
        (steps) => {
          const play = () => {
            let d = docOf()
            steps.forEach(([k, a, b, c, e, opId], n) => {
              const action: DocAction = {
                type: 'engine',
                command: toCommand(d.itinerary, trip, [k, a, b, c, e], n),
              }
              const r = runDoc(d, action, { opId })
              if (r.ok) d = r.doc
            })
            return d
          }
          expect(deepEqual(play(), play())).toBe(true)
        },
      ),
      { numRuns: Number(process.env.INVARIANT_RUNS ?? 200) },
    )
  })
})

describe('mudança que não muda nada (M3.5)', () => {
  it('setPlace igual ao que já está não cria Desfazer', () => {
    const d = docOf()
    const p = d.places[0]!
    const r = runDoc(d, { type: 'setPlace', id: p.id, patch: { rarity: p.rarity } })
    expect(r).toMatchObject({ ok: false, error: { code: 'NO_CHANGE' } })
  })
})

describe('apagar atividade guardada num trecho arquivado (M3.5)', () => {
  it('parada no caminho e noite a bordo de um trecho arquivado não travam o apagar', () => {
    const d = docOf()
    const it0 = d.itinerary
    const leg = structuredClone(it0.legs[2]!)
    const place = d.places.find((p) => p.name === 'Gion')!
    leg.waypoints = [{ id: 'vw', placeId: place.id, slot: 'any' }]
    leg.aboard = [[{ id: 'va', placeId: place.id, slot: 'any' }]]
    const doc: TripDoc = { ...d, itinerary: { ...it0, archivedLegs: [leg] } }
    const r = runDoc(doc, { type: 'removePlace', id: place.id })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.doc.places.some((p) => p.id === place.id)).toBe(false)
    const u = undoDoc(r.doc, r.steps)
    expect(u.ok).toBe(true)
  })
})

describe('documento da viagem: tudo tem Desfazer', () => {
  it('comandos do motor', () => {
    roundTrip(docOf(), { type: 'engine', command: { type: 'removeStop', stopId: 's2' } })
  })

  it('nova figurinha já nasce com raridade; trocar a raridade', () => {
    const d = roundTrip(docOf(), {
      type: 'addPlace',
      place: { destinationId: 'd-kyoto', name: ' Ginkaku-ji ', rarity: 'must' },
    })
    expect(d.places.at(-1)).toMatchObject({ name: 'Ginkaku-ji', rarity: 'must', id: 'u1' })
    roundTrip(docOf(), { type: 'setPlace', id: 'p-kyoto-1', patch: { rarity: 'maybe' } })
    // Anotações gerais: salvar e apagar (texto vazio), com Desfazer.
    const n = roundTrip(docOf(), { type: 'setPlace', id: 'p-kyoto-1', patch: { note: 'Ingresso online' } })
    expect(n.places.find((p) => p.id === 'p-kyoto-1')!.note).toBe('Ingresso online')
    const e = roundTrip(n, { type: 'setPlace', id: 'p-kyoto-1', patch: { note: '' } })
    expect('note' in e.places.find((p) => p.id === 'p-kyoto-1')!).toBe(false)
  })

  it('tirar uma figurinha do álbum tira dos dias também', () => {
    const doc = docOf()
    const d = roundTrip(doc, { type: 'removePlace', id: 'p-kyoto-1' })
    expect(d.places.some((p) => p.id === 'p-kyoto-1')).toBe(false)
    expect(findVisit(d.itinerary, 'v14')).toBeNull()
  })

  it('passagem: marcar e desmarcar', () => {
    const doc = docOf()
    const d = roundTrip(doc, {
      type: 'addBooking',
      booking: {
        id: 'k1',
        kind: 'transport',
        title: 'Trem',
        fromDestinationId: 'd-tokyo',
        toDestinationId: 'd-ginzan',
        date: '2030-04-03',
        mode: 'train',
        status: 'booked',
      },
    })
    expect(d.bookings.at(-1)!.id).toBe('k1')
    roundTrip(doc, { type: 'setBooking', id: 'b2', patch: { archived: true } })
    const gone = roundTrip(doc, { type: 'removeBooking', id: 'b2' })
    expect(gone.bookings.some((b) => b.id === 'b2')).toBe(false)
    expect(runDoc(doc, { type: 'removeBooking', id: 'nada' })).toMatchObject({ ok: false })
  })

  it('ação composta desfaz de uma vez: comprar a volta e marcar a volta', () => {
    const doc = docOf()
    const free = runDoc(doc, { type: 'engine', command: { type: 'setLock', lock: 'free' } })
    if (!free.ok) throw new Error()
    const d = roundTrip(free.doc, {
      type: 'batch',
      actions: [
        { type: 'setBooking', id: 'b3', patch: { status: 'booked' } },
        { type: 'engine', command: { type: 'setLock', lock: 'fixed' } },
      ],
    })
    expect(d.itinerary.lock).toBe('fixed')
  })

  it('se uma parte falha, nada muda', () => {
    const doc = docOf()
    const r = runDoc(doc, {
      type: 'batch',
      actions: [
        { type: 'addPlace', place: { destinationId: 'd-kyoto', name: 'X', rarity: 'want' } },
        { type: 'engine', command: { type: 'setNights', stopId: 's2', nights: 0, via: { kind: 'return' } } },
      ],
    })
    expect(r).toEqual({ ok: false, error: { code: 'MIN_ONE_NIGHT', data: { stopId: 's2' } } })
    expect(doc.places).toHaveLength(docOf().places.length)
  })

  it('erros e nada a fazer', () => {
    const doc = docOf()
    expect(
      runDoc(doc, { type: 'addPlace', place: { destinationId: 'd-kyoto', name: '  ', rarity: 'want' } }),
    ).toMatchObject({ ok: false })
    expect(runDoc(doc, { type: 'setPlace', id: 'nada', patch: {} })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    expect(runDoc(doc, { type: 'removePlace', id: 'nada' })).toMatchObject({ ok: false })
    expect(runDoc(doc, { type: 'setBooking', id: 'nada', patch: {} })).toMatchObject({ ok: false })
    expect(runDoc(doc, { type: 'rename', name: doc.meta.name })).toEqual({
      ok: false,
      error: { code: 'NO_CHANGE' },
    })
    expect(runDoc(doc, { type: 'batch', actions: [] })).toEqual({ ok: false, error: { code: 'NO_CHANGE' } })
    roundTrip(doc, { type: 'rename', name: 'Lua de mel' })
    roundTrip(doc, { type: 'addDestination', destination: { id: 'd-x', name: 'X', kind: 'city' } })
    expect(runDoc(doc, { type: 'addDestination', destination: doc.destinations[0]! })).toEqual({
      ok: false,
      error: { code: 'NO_CHANGE' },
    })
  })

  it('desfazer recusa se o itinerário mudou depois', () => {
    const doc = docOf()
    const a = runDoc(doc, {
      type: 'engine',
      command: { type: 'setNights', stopId: 's8', nights: 8, via: { kind: 'return' } },
    })
    if (!a.ok) throw new Error()
    const b = runDoc(a.doc, {
      type: 'engine',
      command: {
        type: 'scheduleVisit',
        visitId: 'x',
        placeId: 'p-kyoto-8',
        day: { kind: 'stop', stopId: 's8', ordinal: 7 },
      },
    })
    if (!b.ok) throw new Error()
    expect(undoDoc(b.doc, a.steps)).toEqual({ ok: false, code: 'CHANGED_SINCE' })
  })
})

describe('formato salvo (M3.5)', () => {
  it('migrate() completa uma viagem salva antes das listas novas e marca a versão', () => {
    const d = docOf()
    const old = structuredClone(d) as TripDoc & { itinerary: Record<string, unknown> }
    delete (old.itinerary as Record<string, unknown>).returned
    delete (old.itinerary as Record<string, unknown>).anchors
    const m = migrate(old as TripDoc)
    expect(m.itinerary.returned).toEqual([])
    expect(m.itinerary.anchors).toEqual([])
    expect(m.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrate(m)).toBe(m)
  })
})
