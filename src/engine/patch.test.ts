import { describe, expect, it } from 'vitest'
import { japao } from './fixtures/trips'
import { ids, run } from './fixtures/helpers'
import { applyUndo, deepEqual, makePatch } from './patch'
import { COMMAND_TYPES, dispatch } from './commands'
import type { Command } from './commands'

const sameTrip = (a: object, b: object) => deepEqual({ ...a, version: 0 }, { ...b, version: 0 })

describe('Desfazer', () => {
  it('volta exatamente ao estado anterior', () => {
    const t = japao()
    const r = run(t.itinerary, {
      type: 'splitStopWith',
      stopId: 's8',
      afterOrdinal: 4,
      destinationId: 'd-tokyo',
      nights: 2,
      via: { kind: 'stop', stopId: 's8' },
    })
    const u = applyUndo(r.state, r.inverse)
    expect(u.ok).toBe(true)
    if (u.ok) {
      expect(sameTrip(u.state, t.itinerary)).toBe(true)
      expect(u.state.version).toBe(r.state.version + 1)
    }
  })

  it('desfaz fusões e trechos restaurados', () => {
    const t = japao()
    const a = run(t.itinerary, { type: 'removeStop', stopId: 's2' })
    const b = run(a.state, { type: 'stretchInto', stopId: 's2', side: 'before' })
    const u = applyUndo(b.state, b.inverse)
    expect(u.ok && sameTrip(u.state, a.state)).toBe(true)
  })

  it('recusa se alguém mexeu nas mesmas partes depois', () => {
    const t = japao()
    const a = run(t.itinerary, { type: 'setNights', stopId: 's8', nights: 8, via: { kind: 'return' } })
    const b = run(a.state, {
      type: 'scheduleVisit',
      visitId: 'x1',
      placeId: t.placeId('Sanjūsangen-dō'),
      day: { kind: 'stop', stopId: 's8', ordinal: 7 },
    })
    expect(applyUndo(b.state, a.inverse)).toEqual({ ok: false, code: 'CHANGED_SINCE' })
  })

  it('aplica se a outra edição foi em outra parte', () => {
    const t = japao()
    const a = run(t.itinerary, { type: 'setNights', stopId: 's8', nights: 8, via: { kind: 'return' } })
    const b = run(a.state, {
      type: 'scheduleVisit',
      visitId: 'x1',
      placeId: t.placeId('teamLab Planets'),
      day: { kind: 'stop', stopId: 's1', ordinal: 0 },
    })
    const u = applyUndo(b.state, a.inverse)
    expect(u.ok).toBe(true)
    if (u.ok) {
      expect(u.state.stops.find((s) => s.id === 's8')!.days).toHaveLength(7)
      expect(u.state.stops.find((s) => s.id === 's1')!.days[0]!.map((v) => v.id)).toEqual(['x1'])
    }
  })

  it('nada para desfazer', () => {
    const t = japao()
    expect(applyUndo(t.itinerary, makePatch(t.itinerary, t.itinerary))).toEqual({
      ok: false,
      code: 'NOTHING_TO_UNDO',
    })
  })

  it('igualdade profunda ignora chaves indefinidas', () => {
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true)
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false)
    expect(deepEqual({ a: [1] }, { a: { 0: 1 } })).toBe(false)
    expect(deepEqual(null, {})).toBe(false)
  })
})

describe('comandos', () => {
  it('são serializáveis: o mesmo comando depois de JSON dá o mesmo resultado', () => {
    const t = japao()
    const cmds: Command[] = [
      { type: 'setNights', stopId: 's1', nights: 3, via: { kind: 'stop', stopId: 's7' } },
      {
        type: 'splitStopWith',
        stopId: 's8',
        afterOrdinal: 2,
        destinationId: 'd-nara',
        nights: 1,
        via: { kind: 'stop', stopId: 's8' },
      },
      { type: 'removeStop', stopId: 's4' },
      { type: 'setLegTimes', legId: 'L:tokyo>home', dep: '19:00', arr: '06:00', arrDayOffset: 1 },
    ]
    let a = t.itinerary
    let b = t.itinerary
    const ca = ids()
    const cb = ids()
    for (const cmd of cmds) {
      a = run(a, cmd, ca).state
      b = run(b, JSON.parse(JSON.stringify(cmd)) as Command, cb).state
    }
    expect(a).toEqual(b)
  })

  it('não mexem no estado recebido, mesmo quando falham', () => {
    const t = japao()
    const copy = structuredClone(t.itinerary)
    dispatch(
      t.itinerary,
      { type: 'setNights', stopId: 's1', nights: 3, via: { kind: 'stop', stopId: 's7' } },
      ids(),
    )
    dispatch(
      t.itinerary,
      { type: 'setNights', stopId: 's1', nights: 3, via: { kind: 'stop', stopId: 's2' } },
      ids(),
    )
    expect(t.itinerary).toEqual(copy)
  })

  it('lista todos os tipos', () => {
    expect(COMMAND_TYPES).toContain('splitStopWith')
    expect(COMMAND_TYPES.length).toBeGreaterThan(30)
  })

  it('erros inesperados não são engolidos', () => {
    const t = japao()
    expect(() => dispatch(t.itinerary, { type: 'nope' } as unknown as Command, ids())).toThrow()
  })
})
