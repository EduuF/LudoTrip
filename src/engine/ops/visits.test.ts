import { describe, expect, it } from 'vitest'
import { japao } from '../fixtures/trips'
import { datesOf, refuse, run, stopOf } from '../fixtures/helpers'
import { findVisit } from '../core'

describe('visitas', () => {
  it('o mesmo item pode ficar em dois dias', () => {
    const t = japao()
    const pid = t.placeId('Fushimi Inari')
    const r = run(t.itinerary, {
      type: 'scheduleVisit',
      visitId: 'x1',
      placeId: pid,
      day: { kind: 'stop', stopId: 's8', ordinal: 5 },
      slot: 'morning',
    })
    expect(datesOf(t, r.state, 'Fushimi Inari')).toEqual(['2030-04-15', '2030-04-18'])
    expect(stopOf(r.state, 's8').days[5]!.map((v) => v.id)).toEqual(['v19', 'x1'])
    const s = run(r.state, {
      type: 'scheduleVisit',
      visitId: 'x2',
      placeId: pid,
      day: { kind: 'stop', stopId: 's8', ordinal: 5 },
      index: 0,
    })
    expect(stopOf(s.state, 's8').days[5]!.map((v) => v.id)).toEqual(['x2', 'v19', 'x1'])
    expect(
      refuse(s.state, { type: 'scheduleVisit', visitId: 'x2', placeId: pid, day: { kind: 'departure' } })
        .code,
    ).toBe('INVALID')
  })

  it('no dia da volta e nunca em noites em aberto', () => {
    const t = japao()
    const r = run(t.itinerary, {
      type: 'scheduleVisit',
      visitId: 'x1',
      placeId: t.placeId('Shibuya'),
      day: { kind: 'departure' },
    })
    expect(datesOf(t, r.state, 'Shibuya')).toEqual(['2030-04-22', '2030-04-24'])
    const a = run(t.itinerary, { type: 'removeStop', stopId: 's2' }).state
    expect(
      refuse(a, {
        type: 'scheduleVisit',
        visitId: 'x1',
        placeId: t.placeId('Shibuya'),
        day: { kind: 'stop', stopId: 's2', ordinal: 0 },
      }).code,
    ).toBe('OPEN_HAS_NO_PLANS')
    expect(
      refuse(a, {
        type: 'scheduleVisit',
        visitId: 'x1',
        placeId: t.placeId('Shibuya'),
        day: { kind: 'stop', stopId: 's1', ordinal: 9 },
      }).code,
    ).toBe('OUT_OF_RANGE')
    expect(
      refuse(a, {
        type: 'scheduleVisit',
        visitId: 'x1',
        placeId: t.placeId('Shibuya'),
        day: { kind: 'leg', legId: 'L:home>tokyo', ordinal: 0 },
      }).code,
    ).toBe('OUT_OF_RANGE')
  })

  it('desagendar, mover e editar', () => {
    const t = japao()
    const a = run(t.itinerary, {
      type: 'moveVisit',
      visitId: 'v14',
      to: { kind: 'stop', stopId: 's8', ordinal: 6 },
      index: 0,
    }).state
    expect(stopOf(a, 's8').days[6]!.map((v) => v.id)).toEqual(['v14', 'v20'])
    const b = run(a, {
      type: 'setVisitMeta',
      visitId: 'v14',
      slot: 'evening',
      time: '19:30',
      note: 'jantar',
      visited: true,
    }).state
    expect(findVisit(b, 'v14')!.list[0]).toMatchObject({
      slot: 'evening',
      time: '19:30',
      note: 'jantar',
      visited: true,
    })
    const c = run(b, {
      type: 'setVisitMeta',
      visitId: 'v14',
      time: null,
      note: null,
      visited: false,
      participants: ['t1'],
    }).state
    expect(findVisit(c, 'v14')!.list[0]).toEqual({
      id: 'v14',
      placeId: t.placeId('Gion'),
      slot: 'evening',
      participants: ['t1'],
    })
    const d = run(c, { type: 'unscheduleVisit', visitId: 'v14' }).state
    expect(findVisit(d, 'v14')).toBeNull()
    expect(refuse(d, { type: 'unscheduleVisit', visitId: 'v14' }).code).toBe('NOT_FOUND')
    expect(refuse(d, { type: 'moveVisit', visitId: 'v14', to: { kind: 'departure' } }).code).toBe('NOT_FOUND')
    expect(refuse(d, { type: 'setVisitMeta', visitId: 'v14', slot: 'any' }).code).toBe('NOT_FOUND')
  })
})

describe('ajustes da viagem', () => {
  it('participantes, recursos e âncoras', () => {
    const t = japao()
    let s = run(t.itinerary, {
      type: 'setParticipants',
      target: { kind: 'stop', id: 's2' },
      ids: ['t1'],
    }).state
    expect(stopOf(s, 's2').participants).toEqual(['t1'])
    s = run(s, { type: 'setParticipants', target: { kind: 'stop', id: 's2' }, ids: null }).state
    expect(stopOf(s, 's2').participants).toBeUndefined()
    s = run(s, { type: 'setParticipants', target: { kind: 'leg', id: 'L:tokyo>ginzan' }, ids: ['t2'] }).state
    s = run(s, { type: 'setParticipants', target: { kind: 'visit', id: 'v3' }, ids: ['t2'] }).state
    expect(findVisit(s, 'v3')!.list[0]!.participants).toEqual(['t2'])
    expect(refuse(s, { type: 'setParticipants', target: { kind: 'visit', id: 'zz' }, ids: [] }).code).toBe(
      'NOT_FOUND',
    )

    s = run(s, {
      type: 'addResource',
      resource: {
        id: 'r1',
        kind: 'rail-pass',
        title: 'Passe de trem',
        start: '2030-04-09',
        end: '2030-04-15',
        covers: ['train'],
      },
    }).state
    expect(refuse(s, { type: 'addResource', resource: { id: 'r1', kind: 'esim', title: 'eSIM' } }).code).toBe(
      'INVALID',
    )
    s = run(s, { type: 'removeResource', id: 'r1' }).state
    expect(s.resources).toEqual([])
    expect(refuse(s, { type: 'removeResource', id: 'r1' }).code).toBe('NOT_FOUND')

    s = run(s, {
      type: 'addAnchor',
      anchor: { id: 'a1', title: 'Show', date: '2030-04-21', destinationId: 'd-tokyo' },
    }).state
    expect(
      refuse(s, { type: 'addAnchor', anchor: { id: 'a1', title: 'Show', date: '2030-04-21' } }).code,
    ).toBe('INVALID')
    s = run(s, { type: 'removeAnchor', id: 'a1' }).state
    expect(refuse(s, { type: 'removeAnchor', id: 'a1' }).code).toBe('NOT_FOUND')
  })

  it('pouso, noites incertas, ritmo, meio padrão e viajantes', () => {
    const t = japao()
    let s = run(t.itinerary, { type: 'setLodging', stopId: 's2', lodging: 'friends' }).state
    expect(stopOf(s, 's2').lodging).toBe('friends')
    s = run(s, { type: 'setTentative', stopId: 's2', tentative: true }).state
    expect(stopOf(s, 's2').tentative).toBe(true)
    s = run(s, { type: 'setTentative', stopId: 's2', tentative: false }).state
    expect(stopOf(s, 's2').tentative).toBeUndefined()
    s = run(s, { type: 'setPace', pace: 'calm' }).state
    s = run(s, { type: 'setDefaultMode', mode: 'bus' }).state
    s = run(s, { type: 'setTravelers', travelers: [{ id: 't1', name: 'Ana' }] }).state
    expect(s).toMatchObject({ pace: 'calm', defaultMode: 'bus', travelers: [{ id: 't1', name: 'Ana' }] })
  })
})
