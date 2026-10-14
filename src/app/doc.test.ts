import { describe, expect, it } from 'vitest'
import { japao } from '../engine/fixtures/trips'
import { deepEqual, findVisit } from '../engine'
import { runDoc, undoDoc } from './doc'
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
