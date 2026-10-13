import { describe, expect, it } from 'vitest'
import { japao, rio } from './fixtures/trips'
import { refuse, run } from './fixtures/helpers'
import { describeEffects, describeError, describeUndoRefusal } from './narrate'
import type { Command } from './commands'
import type { BuiltTrip } from './fixtures/build'
import type { ErrorCode } from './core'

const say = (t: BuiltTrip, cmd: Command, it = t.itinerary) => {
  const r = run(it, cmd)
  return describeEffects(r.effects, it, r.state, t)
}
const sayError = (t: BuiltTrip, cmd: Command, it = t.itinerary) => describeError(refuse(it, cmd), it, t)

describe('o que aconteceu', () => {
  it('itens que voltam para a mochila', () => {
    const t = japao()
    expect(say(t, { type: 'removeStop', stopId: 's2' })).toBe('Vila de Ginzan voltou para a mochila.')
    expect(say(t, { type: 'removeStop', stopId: 's4' })).toBe(
      'Pagode Chureito e Lago Kawaguchi voltaram para a mochila.',
    )
    expect(say(t, { type: 'moveBoundary', index: 6, k: -2 })).toBe(
      'Parque de Nara e mais 3 voltaram para a mochila.',
    )
  })

  it('volta e ida que mudam', () => {
    const t = japao()
    expect(say(t, { type: 'setNights', stopId: 's8', nights: 8, via: { kind: 'return' } })).toBe(
      'Volta agora qui 25/04.',
    )
    expect(say(t, { type: 'setTripStart', date: '2030-04-03' })).toBe('Ida agora qua 03/04.')
    const undated = run(t.itinerary, { type: 'setTripStart', date: null }).state
    expect(say(t, { type: 'setNights', stopId: 's8', nights: 8, via: { kind: 'return' } }, undated)).toBe(
      'Agora são 24 noites.',
    )
  })

  it('cidades que se juntam', () => {
    const t = japao()
    const a = run(t.itinerary, { type: 'removeStop', stopId: 's2' }).state
    expect(say(t, { type: 'stretchInto', stopId: 's2', side: 'before' }, a)).toBe(
      'Tóquio virou uma só: 5 noites.',
    )
  })

  it('trechos guardados e recuperados', () => {
    const t = japao()
    const a = run(t.itinerary, { type: 'setLegTimes', legId: 'L:kyoto>tokyo', dep: '06:12' }).state
    const b = run(a, { type: 'reorderStop', stopId: 's8', toIndex: 0 }).state
    expect(say(t, { type: 'reorderStop', stopId: 's8', toIndex: 0 }, a)).toBe(
      'São Paulo → Tóquio saiu do roteiro; os dados ficam guardados. Kyoto → Tóquio saiu do roteiro; os dados ficam guardados.',
    )
    expect(say(t, { type: 'reorderStop', stopId: 's8', toIndex: 7 }, b)).toBe(
      'São Paulo → Tóquio voltou com os dados. Kyoto → Tóquio voltou com os dados.',
    )
  })

  it('nada a contar', () => {
    const t = japao()
    expect(say(t, { type: 'setPace', pace: 'calm' })).toBeNull()
  })
})

describe('quando não dá', () => {
  it('mensagens curtas, com as palavras de quem viaja', () => {
    const t = japao()
    expect(
      sayError(t, { type: 'setNights', stopId: 's1', nights: 3, via: { kind: 'stop', stopId: 's2' } }),
    ).toBe('Ginzan Onsen tem só 1 noite.')
    expect(sayError(t, { type: 'setNights', stopId: 's8', nights: 0, via: { kind: 'return' } })).toBe(
      'Kyoto precisa de pelo menos 1 noite.',
    )
    expect(sayError(t, { type: 'shiftStop', stopId: 's1', by: 1 })).toBe(
      'É a primeira cidade: mude a data de ida.',
    )
    expect(sayError(t, { type: 'shiftStop', stopId: 's9', by: 1 })).toBe(
      'É a última cidade: mude a data de volta.',
    )
    expect(
      sayError(t, {
        type: 'splitStopWith',
        stopId: 's8',
        afterOrdinal: 6,
        destinationId: 'd-tokyo',
        nights: 2,
        via: { kind: 'stop', stopId: 's8' },
      }),
    ).toBe('Não cabe: Kyoto ficaria sem noites depois.')
    expect(sayError(t, { type: 'setPace', pace: 'normal' } as Command)).toBeNull()
    expect(
      sayError(
        rio(),
        { type: 'closeOpen', stopId: 's1' },
        run(rio().itinerary, { type: 'removeStop', stopId: 's1' }).state,
      ),
    ).toBe('É a única cidade da viagem.')
  })

  it('todo erro tem texto (nenhum fica sem mensagem)', () => {
    const t = japao()
    const codes: ErrorCode[] = [
      'NOT_FOUND',
      'MIN_ONE_NIGHT',
      'DONOR_TOO_SHORT',
      'SAME_STOP',
      'NEEDS_BOTH_NEIGHBORS',
      'SPLIT_TOO_SMALL',
      'NOT_OPEN',
      'ALREADY_OPEN',
      'OPEN_HAS_NO_PLANS',
      'NO_START',
      'INVALID_DATE',
      'TAKE_FROM_MISMATCH',
      'OUT_OF_RANGE',
      'INVALID',
    ]
    for (const code of codes) {
      const text = describeError({ code }, t.itinerary, t)
      expect(text, code).toBeTruthy()
      expect(text!.length, code).toBeLessThanOrEqual(60)
      expect(text, code).not.toMatch(/parada|trava|vizinha|órf/i)
    }
    for (const reason of [
      'same-destination',
      'split-open',
      'open-cannot-donate-here',
      'home-leg-aboard',
      'outro',
    ])
      expect(describeError({ code: 'INVALID', data: { reason } }, t.itinerary, t)).toBeTruthy()
    expect(describeError({ code: 'TAKE_FROM_MISMATCH', data: { needed: 2 } }, t.itinerary, t)).toBe(
      'Escolha de onde saem 2 noites.',
    )
  })

  it('Desfazer recusado', () => {
    expect(describeUndoRefusal('CHANGED_SINCE')).toBe('Alguém mudou isso depois. Não dá para desfazer.')
    expect(describeUndoRefusal('NOTHING_TO_UNDO')).toBe('Nada para desfazer.')
  })
})
