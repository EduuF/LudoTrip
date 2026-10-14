import { describe, expect, it } from 'vitest'
import { caminho, japao } from './fixtures/trips'
import { run } from './fixtures/helpers'
import { progress, tripPhase, XP } from './derive'
import type { Booking } from './types'

describe('a viagem no tempo', () => {
  it('antes: quantos dias faltam', () => {
    const t = japao()
    expect(tripPhase(t.itinerary, '2030-03-30')).toEqual({ kind: 'before', daysLeft: 2, start: '2030-04-01' })
  })

  it('durante: em que dia e cidade', () => {
    const t = japao()
    expect(tripPhase(t.itinerary, '2030-04-01')).toMatchObject({
      kind: 'during',
      day: 1,
      totalDays: 24,
      destinationId: 'd-tokyo',
    })
    expect(tripPhase(t.itinerary, '2030-04-15')).toMatchObject({
      kind: 'during',
      day: 15,
      destinationId: 'd-kyoto',
    })
    expect(tripPhase(t.itinerary, '2030-04-24')).toMatchObject({ kind: 'during', day: 24, stopId: 's9' })
  })

  it('depois e sem data', () => {
    const t = japao()
    expect(tripPhase(t.itinerary, '2030-04-25')).toEqual({ kind: 'after', totalDays: 24 })
    const undated = run(t.itinerary, { type: 'setTripStart', date: null }).state
    expect(tripPhase(undated, '2030-04-10')).toEqual({ kind: 'undated' })
  })
})

describe('preparo: XP e nível', () => {
  it('Japão de exemplo: parte do preparo feita', () => {
    const t = japao()
    const p = progress(t.itinerary, t)
    const byKind = Object.fromEntries(p.tasks.map((x) => [x.kind, x]))
    expect(byKind.ticket).toEqual({ kind: 'ticket', done: 2, total: 10 })
    expect(byKind.lodging).toEqual({ kind: 'lodging', done: 1, total: 9 })
    expect(byKind.must!.total).toBe(13)
    expect(p.level).toBeGreaterThanOrEqual(2)
    expect(p.xp).toBeGreaterThan(0)
    expect(p.inLevel).toBeGreaterThanOrEqual(0)
    expect(p.inLevel).toBeLessThanOrEqual(1)
  })

  it('comprar uma passagem dá XP; desfazer (tirar a reserva) tira', () => {
    const t = japao()
    const before = progress(t.itinerary, t)
    const ticket: Booking = {
      id: 'k1',
      kind: 'transport',
      title: 'Trem',
      fromDestinationId: 'd-tokyo',
      toDestinationId: 'd-ginzan',
      date: '2030-04-03',
      mode: 'train',
      status: 'booked',
    }
    const after = progress(t.itinerary, { places: t.places, bookings: [...t.bookings, ticket] })
    expect(after.xp - before.xp).toBe(XP.ticket)
    expect(progress(t.itinerary, t).xp).toBe(before.xp)
  })

  it('mexer em noites não dá XP', () => {
    const t = japao()
    const s = run(t.itinerary, { type: 'shiftStop', stopId: 's8', by: 1 }).state
    expect(progress(s, t).xp).toBeLessThanOrEqual(progress(t.itinerary, t).xp)
  })

  it('tudo resolvido: Pronto pra partir', () => {
    const t = caminho()
    // Caminho a pé: só as passagens de ida e volta e as hospedagens.
    const bookings: Booking[] = [
      {
        id: 'a',
        kind: 'transport',
        title: 'Ida',
        fromDestinationId: 'home',
        toDestinationId: 'd-sarria',
        date: '2030-09-01',
        mode: 'flight',
        status: 'booked',
      },
      {
        id: 'b',
        kind: 'transport',
        title: 'Volta',
        fromDestinationId: 'd-santiago',
        toDestinationId: 'home',
        date: '2030-09-08',
        mode: 'flight',
        status: 'booked',
      },
      ...t.itinerary.stops.map((s, i): Booking => ({
        id: `h${i}`,
        kind: 'lodging',
        title: 'Albergue',
        destinationId: s.destinationId!,
        checkin: '2030-09-01',
        checkout: '2030-09-09',
        status: 'booked',
      })),
    ]
    const p = progress(t.itinerary, { places: t.places, bookings })
    expect(p).toMatchObject({ level: 5, levelName: 'Pronto pra partir', ratio: 1, inLevel: 1 })
  })
})

describe('viagem sem datas (M3.5)', () => {
  it('passagem guardada conta no progresso, como em health(): nada de 0/N sem tarefa', () => {
    const t = japao()
    const it0 = { ...t.itinerary, start: null }
    const p = progress(it0, t)
    const tickets = p.tasks.find((x) => x.kind === 'ticket')!
    expect(tickets.done).toBeGreaterThan(0)
  })
})
