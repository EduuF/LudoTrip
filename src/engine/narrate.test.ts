import { describe, expect, it } from 'vitest'
import { japao, portugal, rio } from './fixtures/trips'
import { refuse, run } from './fixtures/helpers'
import { describeEffects, describeError, describeIssue, describeUndoRefusal } from './narrate'
import { health } from './derive'
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

describe('prévia (antes de escolher)', () => {
  it('fala no presente', () => {
    const t = japao()
    const r = run(t.itinerary, { type: 'moveBoundary', index: 6, k: -2 })
    expect(describeEffects(r.effects, t.itinerary, r.state, t, 'preview')).toBe(
      'Parque de Nara e mais 3 voltam para a mochila.',
    )
    const v = run(t.itinerary, { type: 'setNights', stopId: 's8', nights: 6, via: { kind: 'return' } })
    expect(describeEffects(v.effects, t.itinerary, v.state, t, 'preview')).toBe(
      'Caminho do Filósofo volta para a mochila. Volta vai para ter 23/04.',
    )
    const a = run(t.itinerary, { type: 'removeStop', stopId: 's2' }).state
    const j = run(a, { type: 'stretchInto', stopId: 's2', side: 'before' })
    expect(describeEffects(j.effects, a, j.state, t, 'preview')).toBe('Tóquio vira uma só: 5 noites.')
  })
})

describe('quests', () => {
  const quests = (t: BuiltTrip, it = t.itinerary) =>
    health(it, { destinations: t.destinations, places: t.places, bookings: t.bookings }).map((i) =>
      describeIssue(i, it, t, t.bookings),
    )

  it('Japão no começo', () => {
    const t = japao()
    const q = quests(t)
    expect(q).toContain('Tóquio: falta hospedagem (2 noites).')
    expect(q).toContain('Tóquio → Ginzan Onsen: falta a passagem de trem.')
    expect(q).toContain('teamLab Planets é imperdível e ainda não tem dia.')
    expect(q).not.toContain('Kyoto → Tóquio: falta a passagem de trem.')
  })

  it('depois de mexer', () => {
    const t = japao()
    let s = run(t.itinerary, { type: 'moveBoundary', index: 6, k: -2 }).state
    s = run(s, { type: 'removeStop', stopId: 's3' }).state
    s = run(s, { type: 'setLegMode', legId: 'L:kyoto>tokyo', mode: 'bus' }).state
    s = run(s, {
      type: 'addAnchor',
      anchor: { id: 'a1', title: 'Show', date: '2030-04-21', destinationId: 'd-osaka' },
    }).state
    const q = quests(t, s)
    expect(q).toContain('Você tem passagem de trem para Kyoto → Tóquio.')
    expect(q).toContain('Kyoto: qui 11/04 e sex 12/04 sem hospedagem.')
    expect(q).toContain('2 noites em aberto (qui 04/04 a sex 05/04).')
    expect(q).toContain('Show (21/04) ficou fora de Osaka.')
    const shifted = run(t.itinerary, { type: 'shiftStop', stopId: 's8', by: 1 }).state
    expect(quests(t, shifted)).toEqual(
      expect.arrayContaining([
        'Hotel em Kyoto: as datas não batem com Kyoto (14/04 a 21/04).',
        'Trem-bala Kyoto → Tóquio: a passagem é de 20/04; o trecho agora é 21/04.',
      ]),
    )
    const end = run(t.itinerary, { type: 'reorderStop', stopId: 's8', toIndex: 8 }).state
    expect(quests(t, end)).toContain('Voo Tóquio → São Paulo: esse trecho não está mais no roteiro.')
  })

  it('carro: direção longa e fora do aluguel', () => {
    const t = portugal()
    const s = run(t.itinerary, { type: 'setTripStart', date: '2030-09-08' }).state
    const q = quests(t, s)
    expect(q).toContain('Vale do Douro → Lagos: ~7 h de carro num dia.')
    expect(q).toContain('Lisboa → Nazaré fica fora do período de Carro alugado.')
  })
})
