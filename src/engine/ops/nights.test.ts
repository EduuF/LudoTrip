import { describe, expect, it } from 'vitest'
import { japao } from '../fixtures/trips'
import { datesOf, refuse, run, shape, stopOf } from '../fixtures/helpers'
import { tripRange } from '../derive'

// Japão: s1 Tóquio 2 · s2 Ginzan 1 · s3 Tóquio 2 · s4 Kawaguchiko 1 · s5 Tóquio 1 · s6 Kamakura 1
//        · s7 Osaka 4 · s8 Kyoto 7 · s9 Tóquio 4. De 01/04 a 24/04/2030.

describe('setNights', () => {
  it('volta livre: Kyoto ganha 1 noite no fim e a volta anda', () => {
    const t = japao()
    const r = run(t.itinerary, { type: 'setNights', stopId: 's8', nights: 8, via: { kind: 'return' } })
    expect(stopOf(r.state, 's8').days).toHaveLength(8)
    expect(stopOf(r.state, 's8').days[7]).toEqual([])
    expect(tripRange(r.state).end).toBe('2030-04-25')
    expect(datesOf(t, r.state, 'Gion')).toEqual(['2030-04-13'])
    expect(datesOf(t, r.state, 'Akihabara')).toEqual(['2030-04-22'])
  })

  it('a cidade seguinte cede: sai o PRIMEIRO dia dela e a volta fica', () => {
    const t = japao()
    const r = run(t.itinerary, {
      type: 'setNights',
      stopId: 's8',
      nights: 8,
      via: { kind: 'stop', stopId: 's9' },
    })
    expect(shape(r.state)).toBe(
      'tokyo 2 · ginzan 1 · tokyo 2 · kawa 1 · tokyo 1 · kama 1 · osaka 4 · kyoto 8 · tokyo 3',
    )
    expect(tripRange(r.state).end).toBe('2030-04-24')
    expect(datesOf(t, r.state, 'Akihabara')).toEqual(['2030-04-21'])
    expect(r.effects.returned).toEqual([])
  })

  it('doadora distante: as cidades do meio deslocam com os planos', () => {
    const t = japao()
    const r = run(t.itinerary, {
      type: 'setNights',
      stopId: 's1',
      nights: 3,
      via: { kind: 'stop', stopId: 's7' },
    })
    expect(shape(r.state)).toBe(
      'tokyo 3 · ginzan 1 · tokyo 2 · kawa 1 · tokyo 1 · kama 1 · osaka 3 · kyoto 7 · tokyo 4',
    )
    expect(stopOf(r.state, 's1').days[2]).toEqual([])
    expect(datesOf(t, r.state, 'Vila de Ginzan')).toEqual(['2030-04-04'])
    expect(datesOf(t, r.state, 'Grande Buda')).toEqual(['2030-04-09'])
    // Osaka perdeu o primeiro dia (vazio); Dotonbori continua na mesma data.
    expect(datesOf(t, r.state, 'Dotonbori')).toEqual(['2030-04-10'])
    expect(datesOf(t, r.state, 'Gion')).toEqual(['2030-04-13'])
  })

  it('cidade de 1 noite não pode ceder', () => {
    const t = japao()
    const e = refuse(t.itinerary, {
      type: 'setNights',
      stopId: 's1',
      nights: 3,
      via: { kind: 'stop', stopId: 's2' },
    })
    expect(e.code).toBe('DONOR_TOO_SHORT')
    expect(e.data).toMatchObject({ donorId: 's2', max: 0 })
  })

  it('cidade anterior recebe a noite que sai: sai o primeiro dia de Kyoto', () => {
    const t = japao()
    const r = run(t.itinerary, {
      type: 'setNights',
      stopId: 's8',
      nights: 6,
      via: { kind: 'stop', stopId: 's7' },
    })
    expect(shape(r.state)).toContain('osaka 5 · kyoto 6')
    expect(r.effects.returned.map((x) => x.visit.id)).toEqual(['v14'])
    expect(r.effects.returned[0]!.label).toBe('sáb 13/04')
    expect(datesOf(t, r.state, 'Kiyomizu-dera')).toEqual(['2030-04-14'])
  })

  it('deixar em aberto: 1 noite em aberto logo depois de Tóquio', () => {
    const t = japao()
    const r = run(t.itinerary, { type: 'setNights', stopId: 's9', nights: 3, via: { kind: 'open' } })
    expect(shape(r.state)).toMatch(/kyoto 7 · tokyo 3 · aberto 1$/)
    expect(tripRange(r.state).end).toBe('2030-04-24')
    expect(r.state.legs.at(-1)!.from).toBe(r.state.stops.at(-1)!.id)
  })

  it('aberto não cede noite por aqui', () => {
    const t = japao()
    expect(
      refuse(t.itinerary, { type: 'setNights', stopId: 's9', nights: 5, via: { kind: 'open' } }).code,
    ).toBe('INVALID')
  })

  it('zero noites é recusado', () => {
    const t = japao()
    expect(
      refuse(t.itinerary, { type: 'setNights', stopId: 's8', nights: 0, via: { kind: 'return' } }).code,
    ).toBe('MIN_ONE_NIGHT')
    expect(
      refuse(t.itinerary, { type: 'setNights', stopId: 's8', nights: 7, via: { kind: 'return' } }).code,
    ).toBe('NO_CHANGE')
    expect(
      refuse(t.itinerary, { type: 'setNights', stopId: 's8', nights: 8, via: { kind: 'stop', stopId: 's8' } })
        .code,
    ).toBe('SAME_STOP')
  })

  it('doadora em aberto pode ir a zero e some', () => {
    const t = japao()
    const a = run(t.itinerary, { type: 'removeStop', stopId: 's6' }).state
    const open = a.stops.find((s) => s.destinationId === null)!
    const r = run(a, { type: 'setNights', stopId: 's7', nights: 5, via: { kind: 'stop', stopId: open.id } })
    expect(shape(r.state)).toContain('tokyo 1 · osaka 5 · kyoto 7')
    expect(datesOf(t, r.state, 'Dotonbori')).toEqual(['2030-04-10'])
  })
})

describe('moveBoundary (arrastar a divisa)', () => {
  it('Osaka|Kyoto −2: Osaka perde os 2 últimos dias; Kyoto ganha 2 vazios no começo', () => {
    const t = japao()
    const r = run(t.itinerary, { type: 'moveBoundary', index: 6, k: -2 })
    expect(shape(r.state)).toContain('osaka 2 · kyoto 9')
    expect(r.effects.returned.map((x) => x.visit.id)).toEqual(['v10', 'v11', 'v12', 'v13'])
    expect(stopOf(r.state, 's8').days.slice(0, 2)).toEqual([[], []])
    expect(datesOf(t, r.state, 'Gion')).toEqual(['2030-04-13'])
    expect(r.state.returned).toContainEqual({
      placeId: 'p-nara-1',
      fromDate: '2030-04-11',
      fromLabel: 'qui 11/04',
    })
  })

  it('não deixa ninguém sem noite', () => {
    const t = japao()
    expect(refuse(t.itinerary, { type: 'moveBoundary', index: 0, k: -2 }).code).toBe('MIN_ONE_NIGHT')
    expect(refuse(t.itinerary, { type: 'moveBoundary', index: 0, k: 1 }).code).toBe('MIN_ONE_NIGHT')
    expect(refuse(t.itinerary, { type: 'moveBoundary', index: 8, k: 1 }).code).toBe('NOT_FOUND')
    expect(refuse(t.itinerary, { type: 'moveBoundary', index: 6, k: 0 }).code).toBe('NO_CHANGE')
  })
})

describe('shiftStop (deslocar a janela)', () => {
  it('Kyoto +1: Osaka ganha 1 dia vazio no fim; Tóquio final perde o primeiro; Kyoto anda junto', () => {
    const t = japao()
    const r = run(t.itinerary, { type: 'shiftStop', stopId: 's8', by: 1 })
    expect(shape(r.state)).toContain('osaka 5 · kyoto 7 · tokyo 3')
    expect(stopOf(r.state, 's7').days[4]).toEqual([])
    expect(datesOf(t, r.state, 'Gion')).toEqual(['2030-04-14'])
    expect(datesOf(t, r.state, 'Akihabara')).toEqual(['2030-04-21'])
    expect(r.effects.returned).toEqual([])
  })

  it('Kyoto −1: Osaka perde o último dia (Kuromon volta)', () => {
    const t = japao()
    const r = run(t.itinerary, { type: 'shiftStop', stopId: 's8', by: -1 })
    expect(shape(r.state)).toContain('osaka 3 · kyoto 7 · tokyo 5')
    expect(r.effects.returned.map((x) => x.visit.id)).toEqual(['v12', 'v13'])
    expect(stopOf(r.state, 's9').days[0]).toEqual([])
  })

  it('precisa de cidade dos dois lados e de noites para ceder', () => {
    const t = japao()
    expect(refuse(t.itinerary, { type: 'shiftStop', stopId: 's1', by: 1 }).code).toBe('NEEDS_BOTH_NEIGHBORS')
    expect(refuse(t.itinerary, { type: 'shiftStop', stopId: 's3', by: 1 }).code).toBe('DONOR_TOO_SHORT')
    expect(refuse(t.itinerary, { type: 'shiftStop', stopId: 's3', by: -1 }).code).toBe('DONOR_TOO_SHORT')
    expect(refuse(t.itinerary, { type: 'shiftStop', stopId: 's8', by: 0 }).code).toBe('NO_CHANGE')
  })
})
