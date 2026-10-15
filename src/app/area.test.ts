import { describe, expect, it } from 'vitest'
import { ALL_TRIPS, asiaAberta } from '../engine/fixtures/trips'
import type { BuiltTrip } from '../engine/fixtures/build'
import type { TripDoc } from './doc'
import { areaLabel, fallbackBox, tripArea } from './area'

const docOf = (t: BuiltTrip, keepScope = true): TripDoc => ({
  meta: { id: 't', name: t.name, createdAt: 0, updatedAt: 0 },
  itinerary: t.itinerary,
  ...(keepScope && t.scope ? { scope: t.scope } : {}),
  destinations: t.destinations,
  places: t.places,
  bookings: t.bookings,
  seq: 0,
})

const paris = { name: 'Paris', country: 'FR' }
const lyon = { name: 'Lyon', country: 'FR' }
const roma = { name: 'Roma', country: 'IT' }
const lisboa = { name: 'Lisboa', country: 'PT' }

describe('nome da viagem pelos lugares', () => {
  it('um lugar: o nome dele', () => {
    expect(areaLabel([paris])).toBe('Paris')
    expect(areaLabel([{ name: 'Japão', localName: '日本', country: 'JP' }], true)).toBe('日本')
  })

  it('vários lugares de um país: o país', () => {
    expect(areaLabel([paris, lyon])).toBe('França')
  })

  it('dois países: "França e Itália"; três ou mais: os dois primeiros e "…"', () => {
    expect(areaLabel([paris, roma])).toBe('França e Itália')
    expect(areaLabel([paris, lyon, roma])).toBe('França e Itália')
    expect(areaLabel([paris, roma, lisboa])).toBe('França, Itália…')
  })

  it('lugares sem país: os nomes deles', () => {
    expect(areaLabel([{ name: 'Navio' }, { name: 'Ilha' }])).toBe('Navio e Ilha')
  })
})

describe('tripArea', () => {
  it('noites em aberto contam com o país delas, na ordem das paradas', () => {
    const a = tripArea(docOf(asiaAberta()))
    expect(a.countries).toEqual(['JP', 'KR'])
    expect(a.mainCountry).toBe('JP')
    expect(a.label).toBe('Japão e Coreia do Sul')
  })

  it('viagem de um país: o país', () => {
    const a = tripArea(docOf(ALL_TRIPS.japao(), false))
    expect(a.countries).toEqual(['JP'])
    expect(a.label).toBe('Japão')
    expect(a.localLabel).toBe('日本')
  })

  it('viagem de uma cidade: a cidade', () => {
    expect(tripArea(docOf(ALL_TRIPS.rio(), false)).label).toBe('Rio de Janeiro')
  })

  it('viagem antiga sem destino nenhum: o escopo', () => {
    const t = ALL_TRIPS.japao()
    const doc = docOf(t)
    const empty: TripDoc = {
      ...doc,
      itinerary: { ...doc.itinerary, stops: doc.itinerary.stops.map((s) => ({ ...s, destinationId: null })) },
    }
    expect(tripArea(empty)).toMatchObject({ mainCountry: 'JP', label: 'Japão', localLabel: '日本' })
    const bare: TripDoc = { ...empty, scope: undefined }
    expect(tripArea(bare)).toEqual({ countries: [], label: 'sua viagem', localLabel: 'sua viagem' })
  })
})

describe('caixa de reserva do mapa', () => {
  it('a soma dos países das noites em aberto', () => {
    expect(fallbackBox(docOf(asiaAberta()))).toEqual([126.1, 31, 145.8, 45.5])
  })

  it('sem país: o escopo antigo; sem nada: nenhuma', () => {
    const doc = docOf(ALL_TRIPS.rio())
    expect(fallbackBox(doc)).toEqual([-43.17 - 0.12, -22.91 - 0.1, -43.17 + 0.12, -22.91 + 0.1])
    expect(fallbackBox({ ...doc, scope: undefined })).toBeNull()
  })
})
