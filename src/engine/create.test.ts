import { describe, expect, it } from 'vitest'
import { counterIds } from './fixtures/build'
import { createItinerary } from './create'
import { timeline } from './core'

describe('criar viagem', () => {
  it('divide as noites igualmente; o resto vai para as primeiras cidades', () => {
    const it_ = createItinerary(
      {
        destinationIds: ['a', 'b', 'c'],
        nights: 11,
        start: '2030-01-10',
        defaultMode: 'train',
        homeMode: 'flight',
        travelers: [{ id: 't1', name: 'Ana' }],
      },
      counterIds('n'),
    )
    expect(it_.stops.map((s) => s.days.length)).toEqual([4, 4, 3])
    expect(timeline(it_).total).toBe(11)
    expect(it_.legs.map((l) => l.mode)).toEqual(['flight', 'train', 'train', 'flight'])
    expect(it_.lock).toBe('free')
  })

  it('mesma cidade em sequência vira uma só; sem cidade vira noites em aberto', () => {
    const same = createItinerary(
      { destinationIds: ['a', 'a'], nights: 4, start: null, defaultMode: 'car', travelers: [] },
      counterIds('n'),
    )
    expect(same.stops).toHaveLength(1)
    expect(same.stops[0]!.days).toHaveLength(4)
    const none = createItinerary(
      { destinationIds: [], nights: 5, start: null, defaultMode: 'car', travelers: [] },
      counterIds('n'),
    )
    expect(none.stops).toEqual([expect.objectContaining({ destinationId: null })])
    expect(none.stops[0]!.days).toHaveLength(5)
  })

  it('pelo menos 1 noite por cidade', () => {
    const it_ = createItinerary(
      { destinationIds: ['a', 'b', 'c'], nights: 1, start: null, defaultMode: 'bus', travelers: [] },
      counterIds('n'),
    )
    expect(it_.stops.map((s) => s.days.length)).toEqual([1, 1, 1])
  })
})
