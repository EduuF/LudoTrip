import { describe, expect, it } from 'vitest'
import { japao, portugal } from '../fixtures/trips'
import { datesOf, refuse, run, shape, stopOf } from '../fixtures/helpers'
import { days, tripRange } from '../derive'

describe('removeDay', () => {
  it('deixando em aberto: os dias seguintes da cidade antecipam; o resto não muda', () => {
    const t = japao()
    const r = run(t.itinerary, { type: 'removeDay', stopId: 's9', ordinal: 1, via: { kind: 'open' } })
    expect(r.effects.returned.map((x) => x.visit.id)).toEqual(['v21'])
    expect(shape(r.state)).toMatch(/kyoto 7 · tokyo 3 · aberto 1$/)
    expect(datesOf(t, r.state, 'Shibuya')).toEqual(['2030-04-21'])
    expect(tripRange(r.state).end).toBe('2030-04-24')
  })

  it('antecipando a volta', () => {
    const t = japao()
    const r = run(t.itinerary, { type: 'removeDay', stopId: 's9', ordinal: 1, via: { kind: 'return' } })
    expect(shape(r.state)).toMatch(/tokyo 3$/)
    expect(tripRange(r.state).end).toBe('2030-04-23')
  })

  it('a cidade anterior fica com a noite: o buraco fecha do lado dela', () => {
    const t = japao()
    const r = run(t.itinerary, {
      type: 'removeDay',
      stopId: 's9',
      ordinal: 1,
      via: { kind: 'stop', stopId: 's8' },
    })
    expect(shape(r.state)).toMatch(/kyoto 8 · tokyo 3$/)
    expect(stopOf(r.state, 's8').days[7]).toEqual([])
    expect(datesOf(t, r.state, 'Shibuya')).toEqual(['2030-04-22'])
    expect(datesOf(t, r.state, 'Gion')).toEqual(['2030-04-13'])
  })

  it('a cidade seguinte fica com a noite', () => {
    const t = japao()
    const r = run(t.itinerary, {
      type: 'removeDay',
      stopId: 's8',
      ordinal: 0,
      via: { kind: 'stop', stopId: 's9' },
    })
    expect(shape(r.state)).toMatch(/kyoto 6 · tokyo 5$/)
    expect(stopOf(r.state, 's9').days[0]).toEqual([])
    expect(datesOf(t, r.state, 'Kiyomizu-dera')).toEqual(['2030-04-13'])
  })

  it('com 1 noite, vira noites em aberto (lixeira)', () => {
    const t = japao()
    const r = run(t.itinerary, { type: 'removeDay', stopId: 's2', ordinal: 0, via: { kind: 'return' } })
    expect(shape(r.state)).toMatch(/^tokyo 2 · aberto 1/)
  })

  it('recusa dias que não existem e noites em aberto', () => {
    const t = japao()
    expect(
      refuse(t.itinerary, { type: 'removeDay', stopId: 's9', ordinal: 4, via: { kind: 'return' } }).code,
    ).toBe('OUT_OF_RANGE')
    expect(
      refuse(t.itinerary, {
        type: 'removeDay',
        stopId: 's9',
        ordinal: 0,
        via: { kind: 'stop', stopId: 's9' },
      }).code,
    ).toBe('SAME_STOP')
    const a = run(t.itinerary, { type: 'removeStop', stopId: 's2' }).state
    expect(refuse(a, { type: 'removeDay', stopId: 's2', ordinal: 0, via: { kind: 'return' } }).code).toBe(
      'INVALID',
    )
  })
})

describe('swapDays', () => {
  it('troca os planos; as datas ficam', () => {
    const t = japao()
    const r = run(t.itinerary, { type: 'swapDays', stopId: 's8', a: 0, b: 6 })
    expect(datesOf(t, r.state, 'Gion')).toEqual(['2030-04-19'])
    expect(datesOf(t, r.state, 'Caminho do Filósofo')).toEqual(['2030-04-13'])
    expect(refuse(t.itinerary, { type: 'swapDays', stopId: 's8', a: 0, b: 7 }).code).toBe('OUT_OF_RANGE')
    expect(refuse(t.itinerary, { type: 'swapDays', stopId: 's8', a: 2, b: 2 }).code).toBe('NO_CHANGE')
  })
})

describe('datas da viagem', () => {
  it('mudar a ida desloca tudo junto', () => {
    const t = japao()
    const r = run(t.itinerary, { type: 'setTripStart', date: '2030-04-03' })
    expect(datesOf(t, r.state, 'Gion')).toEqual(['2030-04-15'])
    expect(tripRange(r.state).end).toBe('2030-04-26')
  })

  it('sem data: dias relativos', () => {
    const t = japao()
    const r = run(t.itinerary, { type: 'setTripStart', date: null })
    const ds = days(r.state)
    expect(ds[0]).toMatchObject({ date: null, label: 'dia 1' })
    expect(ds.at(-1)).toMatchObject({ kind: 'departure', label: 'dia 24' })
    expect(refuse(t.itinerary, { type: 'setTripStart', date: '2030-02-30' }).code).toBe('INVALID_DATE')
    expect(refuse(t.itinerary, { type: 'setTripStart', date: '2030-04-01' }).code).toBe('NO_CHANGE')
  })

  it('volta mais tarde: a última cidade ganha as noites', () => {
    const t = portugal()
    const r = run(t.itinerary, { type: 'setTripEnd', date: '2030-09-26', takeFrom: [] })
    expect(shape(r.state)).toMatch(/lisboa 3$/)
    const s = run(t.itinerary, {
      type: 'setTripEnd',
      date: '2030-09-25',
      takeFrom: [{ stopId: 's4', nights: 0 }],
    })
    expect(shape(s.state)).toContain('porto 4')
  })

  it('volta mais cedo: escolher de onde saem as noites', () => {
    const t = portugal()
    expect(
      refuse(t.itinerary, {
        type: 'setTripEnd',
        date: '2030-09-22',
        takeFrom: [{ stopId: 's4', nights: 1 }],
      }),
    ).toEqual({
      code: 'TAKE_FROM_MISMATCH',
      data: { needed: 2 },
    })
    const r = run(t.itinerary, {
      type: 'setTripEnd',
      date: '2030-09-22',
      takeFrom: [
        { stopId: 's4', nights: 1 },
        { stopId: 's6', nights: 1 },
      ],
    })
    expect(shape(r.state)).toBe('lisboa 3 · nazare 1 · coimbra 1 · porto 2 · douro 2 · lagos 2 · lisboa 1')
    expect(
      refuse(t.itinerary, { type: 'setTripEnd', date: '2030-09-23', takeFrom: [{ stopId: 's2', nights: 1 }] })
        .code,
    ).toBe('DONOR_TOO_SHORT')
    expect(refuse(t.itinerary, { type: 'setTripEnd', date: '2030-09-24', takeFrom: [] }).code).toBe(
      'NO_CHANGE',
    )
    expect(refuse(t.itinerary, { type: 'setTripEnd', date: 'amanhã', takeFrom: [] }).code).toBe(
      'INVALID_DATE',
    )
    const undated = run(t.itinerary, { type: 'setTripStart', date: null }).state
    expect(refuse(undated, { type: 'setTripEnd', date: '2030-09-24', takeFrom: [] }).code).toBe('NO_START')
  })

  it('volta marcada ou livre', () => {
    const t = japao()
    const r = run(t.itinerary, { type: 'setLock', lock: 'free' })
    expect(r.state.lock).toBe('free')
    expect(refuse(t.itinerary, { type: 'setLock', lock: 'fixed' }).code).toBe('NO_CHANGE')
  })
})
