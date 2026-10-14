// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { buildTrip } from '../engine/fixtures/build'
import { italiaLonga, japao } from '../engine/fixtures/trips'
import type { BuiltTrip } from '../engine/fixtures/build'
import { insertOptions, NEAREST_SHOWN, splitOptions, suggestGap } from './choices'
import { useApp } from './store'
import type { TripDoc } from './doc'

const docOf = (t: BuiltTrip): TripDoc => ({
  meta: { id: 't1', name: t.name, createdAt: 0, updatedAt: 0 },
  itinerary: t.itinerary,
  destinations: t.destinations,
  places: t.places,
  bookings: t.bookings,
  seq: 0,
})

const toscana = () =>
  buildTrip({
    name: 'Toscana',
    start: '2031-05-01',
    lock: 'free',
    defaultMode: 'train',
    destinations: {
      roma: { name: 'Roma', lat: 41.9, lon: 12.5 },
      siena: { name: 'Siena', lat: 43.32, lon: 11.33 },
      firenze: { name: 'Florença', lat: 43.77, lon: 11.25 },
      bologna: { name: 'Bolonha', lat: 44.49, lon: 11.34 },
      pisa: { name: 'Pisa', lat: 43.72, lon: 10.4 },
      lugar: { name: 'Sem mapa' },
    },
    stops: [
      ['roma', 3],
      ['siena', 2],
      ['firenze', 3],
      ['bologna', 2],
    ],
    places: {},
  })

describe('sugestão "no caminho" (suggestGap)', () => {
  it('Pisa entra colada em Florença (o menor desvio), nunca antes de Roma', () => {
    const t = toscana()
    // Florença→Bolonha desvia 102 km; Siena→Florença, 105 km; antes de Roma, 270 km.
    expect(suggestGap(t.itinerary, t.destinations, t.destId('pisa'))).toBe(3)
  })
  it('um destino no caminho entre dois entra entre eles', () => {
    const t = toscana()
    const d = [
      ...t.destinations,
      { id: 'd-orvieto', name: 'Orvieto', kind: 'city' as const, lat: 42.72, lon: 12.11 },
    ]
    expect(suggestGap(t.itinerary, d, 'd-orvieto')).toBe(1)
  })
  it('sem coordenadas, o fim da viagem', () => {
    const t = toscana()
    expect(suggestGap(t.itinerary, t.destinations, t.destId('lugar'))).toBe(4)
  })
  it('viagem sem destinos: o começo (que também é o fim)', () => {
    const t = toscana()
    expect(suggestGap({ ...t.itinerary, stops: [] }, t.destinations, t.destId('pisa'))).toBe(0)
  })
  it('Nara no Japão fica perto de Osaka', () => {
    const t = japao()
    const i = suggestGap(t.itinerary, t.destinations, t.destId('nara'))
    const near = [t.itinerary.stops[i - 1], t.itinerary.stops[i]].map((s) => s?.destinationId)
    expect(near).toContain(t.destId('osaka'))
  })
})

describe('viagem longa (50 destinos, 120 noites): as escolhas não crescem com a viagem', () => {
  beforeEach(() => useApp.setState({ doc: docOf(italiaLonga()) }))

  it('inserir: no máximo 3 destinos que cedem + "Outro destino…"', () => {
    const opts = insertOptions(25, useApp.getState().doc!.destinations[0]!.id, 1)
    const donors = opts.filter((o) => /^Tirar de/.test(o.label))
    expect(donors.length).toBe(NEAREST_SHOWN)
    expect(opts.at(-1)!.label === 'Outro destino…' || opts.some((o) => o.label === 'Outro destino…')).toBe(
      true,
    )
    expect(opts.length).toBeLessThanOrEqual(NEAREST_SHOWN + 2)
  })

  it('"Outro destino…" abre a linha do tempo só com os que podem ceder', () => {
    const it = useApp.getState().doc!.itinerary
    const opts = splitOptions(it.stops[40]!.id, useApp.getState().doc!.destinations[0]!.id, 1, 1)
    opts.find((o) => o.label === 'Outro destino…')!.run()
    const sheet = useApp.getState().sheet
    expect(sheet?.kind).toBe('pickStop')
    if (sheet?.kind !== 'pickStop') return
    expect(sheet.ok.length).toBe(49)
    // Escolher pela linha do tempo roda o mesmo comando.
    const before = it.stops.find((s) => s.id === sheet.ok[10])!.days.length
    sheet.pick(sheet.ok[10]!)
    const after = useApp.getState().doc!.itinerary.stops.find((s) => s.id === sheet.ok[10])!.days.length
    expect(after).toBe(before - 1)
  })
})
