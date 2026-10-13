import { describe, expect, it } from 'vitest'
import { ALL_TRIPS } from '../engine/fixtures/trips'
import type { TripDoc } from '../app/doc'
import { citySpots } from './spots'

const japao = (): TripDoc => {
  const t = ALL_TRIPS.japao()
  return {
    meta: { id: 't', name: t.name, createdAt: 0, updatedAt: 0 },
    itinerary: t.itinerary,
    destinations: t.destinations,
    places: t.places,
    bookings: t.bookings,
    seq: 0,
  }
}

describe('lugares da cidade no mapa', () => {
  it('Nara (bate-volta): os lugares e a trilha do dia em Osaka', () => {
    const c = citySpots(japao(), 'd-nara')
    expect(c.spots.map((s) => s.place.name)).toEqual(['Parque de Nara', 'Tōdai-ji'])
    expect(c.cityDays).toEqual([])
    expect(c.trails).toHaveLength(1)
    expect(c.trails[0]).toMatchObject({ dayIndex: 10, ordinal: 0, spots: ['p-nara-1', 'p-nara-2'] })
    expect(c.spots.map((s) => s.days)).toEqual([[10], [10]])
  })

  it('Osaka: 4 dias, duas trilhas (dias 2 e 4), todos os lugares com dia', () => {
    const c = citySpots(japao(), 'd-osaka')
    expect(c.cityDays.map((d) => d.index)).toEqual([8, 9, 10, 11])
    expect(c.trails.map((t) => [t.dayIndex, t.spots.length])).toEqual([
      [9, 2],
      [11, 2],
    ])
    expect(c.spots.every((s) => s.days.length === 1)).toBe(true)
    expect(c.unplaced).toEqual([])
  })

  it('sem coordenadas vai para "sem lugar no mapa"; solta fica sem dias', () => {
    const doc = japao()
    doc.places = [
      ...doc.places,
      { id: 'p-x', destinationId: 'd-kyoto', name: 'Sem lugar', rarity: 'want' },
      { id: 'p-y', destinationId: 'd-kyoto', name: 'Solta', rarity: 'maybe', lat: 35, lon: 135.7 },
    ]
    const c = citySpots(doc, 'd-kyoto')
    expect(c.unplaced.map((p) => p.id)).toEqual(['p-x'])
    expect(c.spots.find((s) => s.place.id === 'p-y')?.days).toEqual([])
    expect(c.trails).toHaveLength(7)
  })
})
