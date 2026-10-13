import { describe, expect, it } from 'vitest'
import { europa, japao } from '../fixtures/trips'
import { legById, refuse, run, shape } from '../fixtures/helpers'
import { days, tripRange } from '../derive'

describe('trechos', () => {
  it('meio, horários e pontas', () => {
    const t = japao()
    let it_ = run(t.itinerary, { type: 'setLegMode', legId: 'L:kyoto>tokyo', mode: 'bus' }).state
    expect(legById(it_, 'L:kyoto>tokyo')).toMatchObject({ mode: 'bus', touched: true })
    expect(refuse(it_, { type: 'setLegMode', legId: 'L:kyoto>tokyo', mode: 'bus' }).code).toBe('NO_CHANGE')
    it_ = run(it_, {
      type: 'setLegTimes',
      legId: 'L:tokyo>home',
      dep: '19:00',
      arr: '06:00',
      arrDayOffset: 1,
    }).state
    expect(legById(it_, 'L:tokyo>home')).toMatchObject({ dep: '19:00', arr: '06:00', arrDayOffset: 1 })
    it_ = run(it_, { type: 'setLegTimes', legId: 'L:tokyo>home', arrDayOffset: null }).state
    expect(legById(it_, 'L:tokyo>home').arrDayOffset).toBeUndefined()
    it_ = run(it_, {
      type: 'setLegHubs',
      legId: 'L:tokyo>home',
      fromHub: { kind: 'airport', code: 'HND', name: 'Haneda' },
      via: [{ kind: 'airport', code: 'DXB', name: 'Dubai' }],
    }).state
    expect(legById(it_, 'L:tokyo>home').fromHub?.code).toBe('HND')
    it_ = run(it_, { type: 'setLegHubs', legId: 'L:tokyo>home', via: null }).state
    expect(legById(it_, 'L:tokyo>home').via).toBeUndefined()
    it_ = run(it_, { type: 'setLegDuration', legId: 'L:kyoto>tokyo', minutes: 135 }).state
    expect(legById(it_, 'L:kyoto>tokyo').durationMin).toBe(135)
    it_ = run(it_, { type: 'setLegDuration', legId: 'L:kyoto>tokyo', minutes: null }).state
    expect(legById(it_, 'L:kyoto>tokyo').durationMin).toBeUndefined()
    expect(refuse(it_, { type: 'setLegDuration', legId: 'L:kyoto>tokyo', minutes: -3 }).code).toBe('INVALID')
    expect(refuse(it_, { type: 'setLegMode', legId: 'nada', mode: 'car' }).code).toBe('NOT_FOUND')
  })

  it('noite a bordo com volta marcada: Paris cede a primeira noite', () => {
    const t = europa()
    const r = run(t.itinerary, {
      type: 'setLegNightsAboard',
      legId: 'L:lisboa>paris',
      nights: 1,
      via: { kind: 'stop', stopId: 's2' },
    })
    expect(shape(r.state)).toBe('lisboa 3 · paris 3 · roma 4')
    expect(tripRange(r.state).end).toBe('2030-06-12')
    const aboard = days(r.state).find((d) => d.kind === 'aboard')!
    expect(aboard).toMatchObject({
      index: 3,
      date: '2030-06-04',
      ref: { kind: 'leg', legId: 'L:lisboa>paris', ordinal: 0 },
    })
  })

  it('noite a bordo com volta livre; tirar a noite devolve os planos dela', () => {
    const t = europa()
    const a = run(t.itinerary, {
      type: 'setLegNightsAboard',
      legId: 'L:lisboa>paris',
      nights: 1,
      via: { kind: 'return' },
    }).state
    expect(tripRange(a).end).toBe('2030-06-13')
    const b = run(a, {
      type: 'scheduleVisit',
      visitId: 'x1',
      placeId: t.placeId('Montmartre'),
      day: { kind: 'leg', legId: 'L:lisboa>paris', ordinal: 0 },
    }).state
    const c = run(b, {
      type: 'setLegNightsAboard',
      legId: 'L:lisboa>paris',
      nights: 0,
      via: { kind: 'stop', stopId: 's1' },
    })
    expect(c.effects.returned.map((x) => x.visit.id)).toEqual(['x1'])
    expect(shape(c.state)).toBe('lisboa 4 · paris 4 · roma 4')
    expect(
      refuse(a, { type: 'setLegNightsAboard', legId: 'L:lisboa>paris', nights: 1, via: { kind: 'return' } })
        .code,
    ).toBe('NO_CHANGE')
    expect(
      refuse(a, { type: 'setLegNightsAboard', legId: 'L:lisboa>paris', nights: 2, via: { kind: 'open' } })
        .code,
    ).toBe('INVALID')
    expect(
      refuse(a, { type: 'setLegNightsAboard', legId: 'L:roma>home', nights: 1, via: { kind: 'return' } }),
    ).toEqual({
      code: 'INVALID',
      data: { reason: 'home-leg-aboard' },
    })
  })

  it('trecho com noite a bordo que sai do roteiro deixa noites em aberto (nada some)', () => {
    const t = europa()
    const a = run(t.itinerary, {
      type: 'setLegNightsAboard',
      legId: 'L:lisboa>paris',
      nights: 1,
      via: { kind: 'return' },
    }).state
    const r = run(a, { type: 'reorderStop', stopId: 's1', toIndex: 2 })
    expect(shape(r.state)).toBe('paris 4 · roma 4 · lisboa 3 · aberto 1')
    expect(tripRange(r.state).end).toBe('2030-06-13')
  })

  it('paradas no caminho', () => {
    const t = japao()
    const a = run(t.itinerary, {
      type: 'addWaypoint',
      legId: 'L:kama>osaka',
      visitId: 'w1',
      placeId: t.placeId('Onsen com vista'),
    }).state
    expect(legById(a, 'L:kama>osaka').waypoints.map((v) => v.id)).toEqual(['w1'])
    const b = run(a, {
      type: 'addWaypoint',
      legId: 'L:kama>osaka',
      visitId: 'w2',
      placeId: t.placeId('Onsen com vista'),
      index: 0,
    }).state
    expect(legById(b, 'L:kama>osaka').waypoints.map((v) => v.id)).toEqual(['w2', 'w1'])
    const c = run(b, { type: 'removeWaypoint', legId: 'L:kama>osaka', visitId: 'w2' }).state
    expect(legById(c, 'L:kama>osaka').waypoints.map((v) => v.id)).toEqual(['w1'])
    expect(refuse(c, { type: 'removeWaypoint', legId: 'L:kama>osaka', visitId: 'w2' }).code).toBe('NOT_FOUND')
  })
})
