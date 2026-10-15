import { describe, expect, it } from 'vitest'
import { ALL_TRIPS, asiaAberta } from '../engine/fixtures/trips'
import type { BuiltTrip } from '../engine/fixtures/build'
import type { TripDoc } from '../app/doc'
import { cityFrame, frame, levelOf, spanKm } from './frame'

const docOf = (t: BuiltTrip): TripDoc => ({
  meta: { id: 't', name: t.name, createdAt: 0, updatedAt: 0 },
  itinerary: t.itinerary,
  ...(t.scope ? { scope: t.scope } : {}),
  destinations: t.destinations,
  places: t.places,
  bookings: t.bookings,
  seq: 0,
})

describe('enquadramento do mapa', () => {
  it('só noites em aberto: a caixa dos países delas', () => {
    const t = asiaAberta()
    const doc = docOf(t)
    const open = { ...doc, itinerary: { ...doc.itinerary, stops: doc.itinerary.stops.slice(0, 2) } }
    const f = frame(open)!
    expect(f.points).toEqual([])
    expect(f.level).toBe('country')
    const [w, s, e, n] = f.bbox
    expect(w).toBeLessThan(126.1)
    expect(e).toBeGreaterThan(145.8)
    expect(s).toBeLessThan(31)
    expect(n).toBeGreaterThan(45.5)
  })

  it('Rio: região Rio–Petrópolis, sem Belo Horizonte (a casa nunca entra)', () => {
    const f = frame(docOf(ALL_TRIPS.rio()))!
    expect(f.level).toBe('region')
    expect(f.points.map((p) => p.dayTrip)).toEqual([false, true])
    const [, s, , n] = f.bbox
    expect(n).toBeLessThan(-22) // Belo Horizonte (-19.9) fica fora
    expect(s).toBeLessThan(-22.91)
  })

  it('Japão: país, com as paradas e o bate-volta a Nara', () => {
    const f = frame(docOf(ALL_TRIPS.japao()))!
    expect(f.level).toBe('country')
    expect(f.points).toHaveLength(7)
    expect(f.points.filter((p) => p.dayTrip).map((p) => p.destId)).toEqual(['d-nara'])
    const [w, s, e, n] = f.bbox
    expect(w).toBeLessThan(135.5)
    expect(e).toBeGreaterThan(140.53)
    expect(s).toBeLessThan(34.68)
    expect(n).toBeGreaterThan(38.57)
  })

  it('sem parada localizada, vale o escopo (país com caixa; cidade com um raio)', () => {
    const base = docOf(ALL_TRIPS.rio())
    const country: TripDoc = {
      ...base,
      itinerary: {
        ...base.itinerary,
        stops: base.itinerary.stops.map((s) => ({ ...s, destinationId: null })),
      },
      places: [],
      scope: { name: 'Romênia', kind: 'country', country: 'RO', bbox: [20.2, 43.6, 29.7, 48.3] },
    }
    const f = frame(country)!
    expect(f.points).toEqual([])
    expect(f.level).toBe('country')
    expect(f.bbox[0]).toBeLessThan(20.2)
    const city: TripDoc = { ...country, scope: { name: 'Cusco', kind: 'city', lat: -13.52, lon: -71.97 } }
    expect(frame(city)!.level).toBe('city')
    expect(frame({ ...country, scope: undefined })).toBeNull()
  })

  it('níveis por extensão e caixa da cidade com mínimo de ~3 km', () => {
    expect(levelOf([0, 0, 0.1, 0.1])).toBe('city')
    expect(levelOf([0, 0, 2, 2])).toBe('region')
    expect(levelOf([0, 0, 20, 20])).toBe('country')
    expect(levelOf([-60, -30, 60, 30])).toBe('world')
    expect(spanKm([0, 0, 1, 0])).toBeCloseTo(111, 0)
    const doc = docOf(ALL_TRIPS.japao())
    const c = cityFrame(doc, 'd-kyoto')!
    expect(c[2] - c[0]).toBeGreaterThanOrEqual(0.04)
    expect(cityFrame(doc, 'nao-existe')).toBeNull()
  })
})
