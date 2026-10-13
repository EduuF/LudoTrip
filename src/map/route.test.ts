import { describe, expect, it } from 'vitest'
import { ALL_TRIPS } from '../engine/fixtures/trips'
import type { BuiltTrip } from '../engine/fixtures/build'
import type { TripDoc } from '../app/doc'
import { travelersAt } from './route'

const docOf = (t: BuiltTrip): TripDoc => ({
  meta: { id: 't', name: t.name, createdAt: 0, updatedAt: 0 },
  itinerary: t.itinerary,
  destinations: t.destinations,
  places: t.places,
  bookings: t.bookings,
  seq: 0,
})

describe('onde o grupo está em cada dia', () => {
  it('Japão: no destino do dia; no dia da volta, a caminho de casa', () => {
    const doc = docOf(ALL_TRIPS.japao())
    expect(travelersAt(doc, 0)).toEqual({ kind: 'at', destId: 'd-tokyo', stopId: 's1' })
    expect(travelersAt(doc, 2)).toEqual({ kind: 'at', destId: 'd-ginzan', stopId: 's2' })
    expect(travelersAt(doc, 10)).toEqual({ kind: 'at', destId: 'd-osaka', stopId: 's7' })
    expect(travelersAt(doc, 23)).toEqual({ kind: 'leg', from: 's9', to: 'home', t: 0.5 })
    expect(travelersAt(doc, 99)).toEqual({ kind: 'leg', from: 's9', to: 'home', t: 0.5 }) // fora: último dia
  })

  it('noites em aberto: fica onde estava; sem nenhum lugar no mapa: null', () => {
    const base = docOf(ALL_TRIPS.rio())
    const stops = base.itinerary.stops
    const open: TripDoc = {
      ...base,
      itinerary: {
        ...base.itinerary,
        stops: [stops[0]!, { ...stops[0]!, id: 'open', destinationId: null, days: [[], []] }],
      },
    }
    expect(travelersAt(open, 6)).toEqual({ kind: 'at', destId: 'd-rio', stopId: stops[0]!.id })
    const none: TripDoc = {
      ...base,
      destinations: base.destinations.map((d) => ({ ...d, lat: undefined, lon: undefined })),
    }
    expect(travelersAt(none, 0)).toBeNull()
  })

  it('noite a bordo: no meio do trecho', () => {
    const doc = docOf(ALL_TRIPS.japao())
    const it = doc.itinerary
    const leg = it.legs[1]! // Tóquio → Ginzan
    const withAboard: TripDoc = {
      ...doc,
      itinerary: { ...it, legs: it.legs.map((l) => (l.id === leg.id ? { ...l, aboard: [[]] } : l)) },
    }
    // O dia 2 vira a noite no trem; Ginzan passa para o dia 3.
    expect(travelersAt(withAboard, 2)).toEqual({ kind: 'leg', from: leg.from, to: leg.to, t: 0.5 })
    expect(travelersAt(withAboard, 3)).toMatchObject({ kind: 'at', destId: 'd-ginzan' })
  })
})
