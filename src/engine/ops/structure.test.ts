import { describe, expect, it } from 'vitest'
import { japao, rio } from '../fixtures/trips'
import { datesOf, legById, refuse, run, shape, stopOf } from '../fixtures/helpers'
import { tripRange } from '../derive'

describe('reorderStop', () => {
  it('começar por Kyoto: datas e trechos se refazem; os planos vão junto', () => {
    const t = japao()
    const r = run(t.itinerary, { type: 'reorderStop', stopId: 's8', toIndex: 0 })
    expect(shape(r.state)).toMatch(/^kyoto 7 · tokyo 2/)
    expect(datesOf(t, r.state, 'Gion')).toEqual(['2030-04-01'])
    expect(r.state.legs[0]).toMatchObject({ from: 'home', to: 's8', mode: 'flight' })
    expect(r.state.legs).toHaveLength(r.state.stops.length + 1)
    expect(tripRange(r.state).end).toBe('2030-04-24')
  })

  it('Tóquios que ficam lado a lado viram uma só, com os planos em ordem', () => {
    const t = japao()
    const r = run(t.itinerary, { type: 'reorderStop', stopId: 's2', toIndex: 8 })
    expect(shape(r.state)).toBe(
      'tokyo 4 · kawa 1 · tokyo 1 · kama 1 · osaka 4 · kyoto 7 · tokyo 4 · ginzan 1',
    )
    expect(r.effects.merged).toEqual([{ keptStopId: 's1', removedStopId: 's3', destinationId: 'd-tokyo' }])
    expect(stopOf(r.state, 's1').days[1]!.map((v) => v.id)).toEqual(['v1', 'v2'])
  })

  it('o trecho com horário sai do roteiro guardado e volta com 06:12', () => {
    const t = japao()
    const a = run(t.itinerary, { type: 'setLegTimes', legId: 'L:kyoto>tokyo', dep: '06:12' }).state
    const b = run(a, { type: 'reorderStop', stopId: 's8', toIndex: 0 })
    expect(b.effects.legsArchived).toContain('L:kyoto>tokyo')
    expect(b.state.archivedLegs.find((l) => l.id === 'L:kyoto>tokyo')!.dep).toBe('06:12')
    const c = run(b.state, { type: 'reorderStop', stopId: 's8', toIndex: 7 })
    expect(c.effects.legsRestored).toEqual(expect.arrayContaining(['L:kyoto>tokyo', 'L:home>tokyo']))
    expect(legById(c.state, 'L:kyoto>tokyo').dep).toBe('06:12')
    expect(legById(c.state, 'L:home>tokyo').mode).toBe('flight')
  })

  it('mesma posição não muda nada', () => {
    expect(refuse(japao().itinerary, { type: 'reorderStop', stopId: 's8', toIndex: 7 }).code).toBe(
      'NO_CHANGE',
    )
  })
})

describe('insertStop', () => {
  it('volta livre: estende a viagem', () => {
    const t = japao()
    const r = run(t.itinerary, {
      type: 'insertStop',
      index: 7,
      destinationId: 'd-hakone',
      nights: 2,
      via: { kind: 'return' },
    })
    expect(shape(r.state)).toContain('osaka 4 · hakone 2 · kyoto 7')
    expect(tripRange(r.state).end).toBe('2030-04-26')
  })

  it('volta marcada: a cidade escolhida cede', () => {
    const t = japao()
    const r = run(t.itinerary, {
      type: 'insertStop',
      index: 7,
      destinationId: 'd-hakone',
      nights: 2,
      via: { kind: 'stop', stopId: 's8' },
    })
    expect(shape(r.state)).toContain('osaka 4 · hakone 2 · kyoto 5')
    expect(r.effects.returned.map((x) => x.visit.id)).toEqual(['v14', 'v15'])
    expect(tripRange(r.state).end).toBe('2030-04-24')
  })

  it('doadora curta é recusada', () => {
    const e = refuse(japao().itinerary, {
      type: 'insertStop',
      index: 2,
      destinationId: 'd-hakone',
      nights: 2,
      via: { kind: 'stop', stopId: 's2' },
    })
    expect(e.code).toBe('DONOR_TOO_SHORT')
  })
})

describe('splitStopWith (encaixar no meio)', () => {
  it('Tóquio 2 noites dentro de Kyoto, tirando de Kyoto: Kyoto 4 → Tóquio 2 → Kyoto 1', () => {
    const t = japao()
    const r = run(t.itinerary, {
      type: 'splitStopWith',
      stopId: 's8',
      afterOrdinal: 4,
      destinationId: 'd-tokyo',
      nights: 2,
      via: { kind: 'stop', stopId: 's8' },
    })
    expect(shape(r.state)).toBe(
      'tokyo 2 · ginzan 1 · tokyo 2 · kawa 1 · tokyo 1 · kama 1 · osaka 4 · kyoto 4 · tokyo 2 · kyoto 1 · tokyo 4',
    )
    expect(r.effects.returned.map((x) => x.visit.id)).toEqual(['v18', 'v19'])
    expect(datesOf(t, r.state, 'Caminho do Filósofo')).toEqual(['2030-04-19'])
    expect(datesOf(t, r.state, 'Arashiyama')).toEqual(['2030-04-16'])
    const kyotos = r.state.stops.filter((s) => s.destinationId === 'd-kyoto')
    expect(kyotos).toHaveLength(2)
    expect(tripRange(r.state).end).toBe('2030-04-24')
  })

  it('volta livre: a viagem cresce e nada fica sem dia', () => {
    const t = japao()
    const r = run(t.itinerary, {
      type: 'splitStopWith',
      stopId: 's8',
      afterOrdinal: 4,
      destinationId: 'd-tokyo',
      nights: 2,
      via: { kind: 'return' },
    })
    expect(shape(r.state)).toContain('kyoto 4 · tokyo 2 · kyoto 3')
    expect(r.effects.returned).toEqual([])
    expect(tripRange(r.state).end).toBe('2030-04-26')
    expect(datesOf(t, r.state, 'Caminho do Filósofo')).toEqual(['2030-04-21'])
  })

  it('outra cidade cede', () => {
    const t = japao()
    const r = run(t.itinerary, {
      type: 'splitStopWith',
      stopId: 's8',
      afterOrdinal: 3,
      destinationId: 'd-nara',
      nights: 1,
      via: { kind: 'stop', stopId: 's9' },
    })
    expect(shape(r.state)).toContain('kyoto 3 · nara 1 · kyoto 4 · tokyo 3')
  })

  it('não cabe: recusa com o máximo possível', () => {
    const t = japao()
    const e = refuse(t.itinerary, {
      type: 'splitStopWith',
      stopId: 's8',
      afterOrdinal: 6,
      destinationId: 'd-tokyo',
      nights: 2,
      via: { kind: 'stop', stopId: 's8' },
    })
    expect(e).toEqual({ code: 'SPLIT_TOO_SMALL', data: { stopId: 's8', max: 0 } })
    expect(
      refuse(t.itinerary, {
        type: 'splitStopWith',
        stopId: 's8',
        afterOrdinal: 0,
        destinationId: 'd-tokyo',
        nights: 1,
        via: { kind: 'return' },
      }).code,
    ).toBe('OUT_OF_RANGE')
    expect(
      refuse(t.itinerary, {
        type: 'splitStopWith',
        stopId: 's8',
        afterOrdinal: 2,
        destinationId: 'd-kyoto',
        nights: 1,
        via: { kind: 'return' },
      }).code,
    ).toBe('INVALID')
  })
})

describe('lixeira e noites em aberto', () => {
  it('remover Ginzan deixa 1 noite em aberto nas mesmas datas', () => {
    const t = japao()
    const r = run(t.itinerary, { type: 'removeStop', stopId: 's2' })
    expect(shape(r.state)).toMatch(/^tokyo 2 · aberto 1 · tokyo 2/)
    expect(r.effects.returned.map((x) => x.visit.id)).toEqual(['v3'])
    expect(datesOf(t, r.state, 'Pagode Chureito')).toEqual(['2030-04-06'])
    expect(tripRange(r.state).end).toBe('2030-04-24')
    expect(refuse(r.state, { type: 'removeStop', stopId: 's2' }).code).toBe('ALREADY_OPEN')
  })

  it('noites em aberto lado a lado viram um espaço só', () => {
    const t = japao()
    const a = run(t.itinerary, { type: 'removeStop', stopId: 's2' }).state
    const b = run(a, { type: 'removeStop', stopId: 's3' })
    expect(shape(b.state)).toMatch(/^tokyo 2 · aberto 3 · kawa 1/)
    expect(b.effects.merged).toEqual([{ keptStopId: 's2', removedStopId: 's3', destinationId: null }])
  })

  it('preencher o espaço todo ou só uma parte', () => {
    const t = japao()
    const a = run(run(t.itinerary, { type: 'removeStop', stopId: 's2' }).state, {
      type: 'removeStop',
      stopId: 's3',
    }).state
    const all = run(a, { type: 'fillOpen', stopId: 's2', destinationId: 'd-hakone' })
    expect(shape(all.state)).toMatch(/^tokyo 2 · hakone 3 · kawa 1/)
    const start = run(a, { type: 'fillOpen', stopId: 's2', destinationId: 'd-hakone', nights: 1 })
    expect(shape(start.state)).toMatch(/^tokyo 2 · hakone 1 · aberto 2 · kawa 1/)
    const end = run(a, { type: 'fillOpen', stopId: 's2', destinationId: 'd-hakone', nights: 1, side: 'end' })
    expect(shape(end.state)).toMatch(/^tokyo 2 · aberto 2 · hakone 1 · kawa 1/)
    expect(refuse(a, { type: 'fillOpen', stopId: 's2', destinationId: 'd-hakone', nights: 4 }).code).toBe(
      'OUT_OF_RANGE',
    )
    expect(refuse(a, { type: 'fillOpen', stopId: 's1', destinationId: 'd-hakone' }).code).toBe('NOT_OPEN')
  })

  it('preencher com a cidade vizinha junta as duas', () => {
    const t = japao()
    const a = run(t.itinerary, { type: 'removeStop', stopId: 's2' }).state
    const r = run(a, { type: 'fillOpen', stopId: 's2', destinationId: 'd-tokyo' })
    expect(shape(r.state)).toMatch(/^tokyo 5 · kawa 1/)
  })

  it('esticar uma cidade: ela ganha dias vazios na ponta encostada', () => {
    const t = japao()
    const a = run(t.itinerary, { type: 'removeStop', stopId: 's6' }).state
    const before = run(a, { type: 'stretchInto', stopId: 's6', side: 'before' })
    expect(shape(before.state)).toContain('kawa 1 · tokyo 2 · osaka 4')
    expect(stopOf(before.state, 's5').days[1]).toEqual([])
    const after = run(a, { type: 'stretchInto', stopId: 's6', side: 'after' })
    expect(shape(after.state)).toContain('tokyo 1 · osaka 5')
    expect(stopOf(after.state, 's7').days[0]).toEqual([])
    expect(datesOf(t, after.state, 'Dotonbori')).toEqual(['2030-04-10'])
    expect(refuse(t.itinerary, { type: 'stretchInto', stopId: 's6', side: 'after' }).code).toBe('NOT_OPEN')
  })

  it('Tóquio | aberto | Tóquio: "Juntar Tóquio" mantém os planos das duas partes', () => {
    const t = japao()
    const a = run(t.itinerary, { type: 'removeStop', stopId: 's2' }).state
    const r = run(a, { type: 'stretchInto', stopId: 's2', side: 'before' })
    expect(shape(r.state)).toMatch(/^tokyo 5 · kawa 1/)
    expect(stopOf(r.state, 's1').days.map((d) => d.map((v) => v.id))).toEqual([[], ['v1', 'v2'], [], [], []])
    expect(r.effects.merged).toEqual([{ keptStopId: 's1', removedStopId: 's3', destinationId: 'd-tokyo' }])
    expect(datesOf(t, r.state, 'Sensō-ji')).toEqual(['2030-04-02'])
  })

  it('encurtar a viagem: as cidades seguintes antecipam com os planos', () => {
    const t = japao()
    const a = run(t.itinerary, { type: 'removeStop', stopId: 's2' }).state
    const r = run(a, { type: 'closeOpen', stopId: 's2' })
    expect(shape(r.state)).toMatch(/^tokyo 4 · kawa 1/)
    expect(datesOf(t, r.state, 'Gion')).toEqual(['2030-04-12'])
    expect(tripRange(r.state).end).toBe('2030-04-23')
  })

  it('a única cidade vira noites em aberto; não dá para encurtar até zero', () => {
    const t = rio()
    const a = run(t.itinerary, { type: 'removeStop', stopId: 's1' }).state
    expect(shape(a)).toBe('aberto 5')
    expect(a.legs.map((l) => [l.from, l.to])).toEqual([
      ['home', 's1'],
      ['s1', 'home'],
    ])
    expect(refuse(a, { type: 'closeOpen', stopId: 's1' })).toEqual({
      code: 'INVALID',
      data: { reason: 'only-stop' },
    })
  })
})

describe('setDestination', () => {
  it('troca a cidade e mantém as visitas', () => {
    const t = japao()
    const r = run(t.itinerary, { type: 'setDestination', stopId: 's4', destinationId: 'd-hakone' })
    expect(shape(r.state)).toContain('hakone 1')
    expect(datesOf(t, r.state, 'Pagode Chureito')).toEqual(['2030-04-06'])
    expect(refuse(r.state, { type: 'setDestination', stopId: 's4', destinationId: 'd-hakone' }).code).toBe(
      'NO_CHANGE',
    )
  })
})
