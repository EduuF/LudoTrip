import { describe, expect, it } from 'vitest'
import { caminho, cruzeiro, europa, japao, portugal, rio } from './fixtures/trips'
import { run } from './fixtures/helpers'
import {
  bookingStatus,
  days,
  estimateLeg,
  health,
  lodgingGaps,
  placeStates,
  stopWindows,
  suggestDonors,
  suggestReceivers,
  tripRange,
  tzOffsetMin,
  worlds,
} from './derive'
import type { BuiltTrip } from './fixtures/build'
import type { Itinerary } from './types'

const statuses = (t: BuiltTrip, it: Itinerary) => t.bookings.map((b) => bookingStatus(b, it).state)
const healthOf = (t: BuiltTrip, it: Itinerary) =>
  health(it, { destinations: t.destinations, places: t.places, bookings: t.bookings })

describe('dias e janelas', () => {
  it('Japão: 24 dias, bate-volta a Nara, dia da volta', () => {
    const t = japao()
    const ds = days(t.itinerary, t.places)
    expect(ds).toHaveLength(24)
    expect(ds.map((d) => d.index)).toEqual([...Array(24).keys()])
    const nara = ds.find((d) => d.date === '2030-04-11')!
    expect(nara).toMatchObject({ kind: 'stop', destinationId: 'd-osaka', dayTrips: ['d-nara'] })
    expect(ds.at(-1)).toMatchObject({
      kind: 'departure',
      date: '2030-04-24',
      travelLegId: 'L:tokyo>home',
      stopId: 's9',
    })
    expect(ds[2]).toMatchObject({ date: '2030-04-03', travelLegId: 'L:tokyo>ginzan', label: 'qua 03/04' })
    expect(ds[3]!.travelLegId).toBe('L:ginzan>tokyo')
    expect(ds[1]!.travelLegId).toBeNull()
  })

  it('janelas das cidades e período da viagem', () => {
    const t = japao()
    expect(stopWindows(t.itinerary).find((w) => w.stopId === 's8')).toMatchObject({
      start: '2030-04-13',
      end: '2030-04-20',
      nights: 7,
    })
    expect(tripRange(t.itinerary)).toEqual({ start: '2030-04-01', end: '2030-04-24', nights: 23 })
  })

  it('noites incertas deixam as datas seguintes "estimadas"', () => {
    const t = japao()
    const s = run(t.itinerary, { type: 'setTentative', stopId: 's7', tentative: true }).state
    const ds = days(s)
    expect(ds.find((d) => d.date === '2030-04-12')!.estimated).toBe(false)
    expect(ds.find((d) => d.date === '2030-04-13')!.estimated).toBe(true)
  })

  it('noites em aberto não têm onde planejar', () => {
    const t = japao()
    const s = run(t.itinerary, { type: 'removeStop', stopId: 's2' }).state
    expect(days(s)[2]).toMatchObject({ kind: 'open', ref: null, destinationId: null })
  })

  it('cruzeiro: escalas viram bate-voltas do navio', () => {
    const t = cruzeiro()
    const ds = days(t.itinerary, t.places)
    expect(ds.find((d) => d.date === '2030-05-08')).toMatchObject({
      destinationId: 'd-navio',
      dayTrips: ['d-roma'],
    })
  })
})

describe('mundos', () => {
  it('Europa tem 3 mundos; Portugal, 1; Japão, 1', () => {
    expect(worlds(europa().itinerary, europa().destinations).map((w) => w.country)).toEqual([
      'PT',
      'FR',
      'IT',
    ])
    expect(worlds(portugal().itinerary, portugal().destinations)).toEqual([
      { country: 'PT', stopIds: ['s1', 's2', 's3', 's4', 's5', 's6', 's7'], nights: 14, firstIndex: 0 },
    ])
    expect(worlds(japao().itinerary, japao().destinations)).toHaveLength(1)
  })
})

describe('reservas', () => {
  it('tudo certo no começo', () => {
    const t = japao()
    expect(statuses(t, t.itinerary)).toEqual(['ok', 'ok', 'ok'])
  })

  it('deslocar Kyoto deixa o hotel e o trem fora da janela', () => {
    const t = japao()
    const s = run(t.itinerary, { type: 'shiftStop', stopId: 's8', by: 1 }).state
    expect(statuses(t, s)).toEqual(['out-of-window', 'out-of-window', 'ok'])
    expect(bookingStatus(t.bookings[0]!, s)).toEqual({ state: 'out-of-window', stopId: 's8' })
  })

  it('Kyoto no fim: hotel fora da janela; trem e voo de volta órfãos', () => {
    const t = japao()
    const s = run(t.itinerary, { type: 'reorderStop', stopId: 's8', toIndex: 8 }).state
    expect(statuses(t, s)).toEqual(['out-of-window', 'orphan', 'orphan'])
  })

  it('trem que virou ônibus: passagem de outro meio', () => {
    const t = japao()
    const s = run(t.itinerary, { type: 'setLegMode', legId: 'L:kyoto>tokyo', mode: 'bus' }).state
    expect(bookingStatus(t.bookings[1]!, s)).toEqual({ state: 'wrong-mode', legId: 'L:kyoto>tokyo' })
  })

  it('sem data de ida, nada é conferido por data', () => {
    const t = japao()
    const s = run(t.itinerary, { type: 'setTripStart', date: null }).state
    expect(statuses(t, s)).toEqual(['undated', 'undated', 'undated'])
  })

  it('arquivadas e outras reservas', () => {
    const t = japao()
    expect(bookingStatus({ ...t.bookings[0]!, archived: true }, t.itinerary).state).toBe('archived')
    const ticket = { id: 'k', kind: 'ticket' as const, title: 'Museu', status: 'booked' as const }
    expect(bookingStatus(ticket, t.itinerary).state).toBe('ok')
    expect(bookingStatus({ ...ticket, date: '2030-04-10' }, t.itinerary).state).toBe('ok')
    expect(bookingStatus({ ...ticket, date: '2030-05-10' }, t.itinerary).state).toBe('out-of-window')
    const undated = run(t.itinerary, { type: 'setTripStart', date: null }).state
    expect(bookingStatus({ ...ticket, date: '2030-04-10' }, undated).state).toBe('undated')
    const noKyoto = run(t.itinerary, { type: 'removeStop', stopId: 's8' }).state
    expect(bookingStatus(t.bookings[0]!, noKyoto).state).toBe('orphan')
  })
})

describe('hospedagem', () => {
  it('Osaka|Kyoto −2: Kyoto fica com 11/04 e 12/04 sem hotel (cobertura parcial)', () => {
    const t = japao()
    const s = run(t.itinerary, { type: 'moveBoundary', index: 6, k: -2 }).state
    const kyoto = lodgingGaps(s, t.bookings).find((g) => g.stopId === 's8')!
    expect(kyoto.partial).toBe(true)
    expect(kyoto.missing.map((m) => m.date)).toEqual(['2030-04-11', '2030-04-12'])
  })

  it('casa de amigos e a bordo não precisam de hotel', () => {
    const t = cruzeiro()
    expect(lodgingGaps(t.itinerary, t.bookings).map((g) => g.stopId)).toEqual(['s1', 's3'])
    const s = run(japao().itinerary, { type: 'setLodging', stopId: 's2', lodging: 'friends' }).state
    expect(lodgingGaps(s, []).some((g) => g.stopId === 's2')).toBe(false)
  })

  it('sem data: reserva no destino conta como coberta', () => {
    const t = japao()
    const s = run(t.itinerary, { type: 'setTripStart', date: null }).state
    expect(lodgingGaps(s, t.bookings).some((g) => g.stopId === 's8')).toBe(false)
  })
})

describe('tempo de viagem', () => {
  it('estimativa pela distância, com o trem-bala do Japão', () => {
    const t = japao()
    const leg = t.itinerary.legs.find((l) => l.id === 'L:kyoto>tokyo')!
    const e = estimateLeg(leg, t.itinerary, t.destinations)
    expect(e.source).toBe('estimate')
    expect(e.km).toBeGreaterThan(350)
    expect(e.km).toBeLessThan(390)
    expect(e.minutes).toBeGreaterThanOrEqual(130)
    expect(e.minutes).toBeLessThanOrEqual(170)
  })

  it('a passagem da pessoa vence, inclusive com fuso', () => {
    const t = japao()
    const s = run(t.itinerary, {
      type: 'setLegTimes',
      legId: 'L:tokyo>home',
      dep: '19:00',
      arr: '06:00',
      arrDayOffset: 1,
    }).state
    const leg = s.legs.find((l) => l.id === 'L:tokyo>home')!
    expect(estimateLeg(leg, s, t.destinations)).toMatchObject({ minutes: 23 * 60, source: 'user' })
    const d = run(t.itinerary, { type: 'setLegDuration', legId: 'L:kyoto>tokyo', minutes: 135 }).state
    expect(
      estimateLeg(
        d.legs.find((l) => l.id === 'L:kyoto>tokyo')!,
        d,
        t.destinations,
      ),
    ).toMatchObject({ minutes: 135, source: 'user' })
  })

  it('rota real quando existe; sem coordenadas, sem tempo', () => {
    const t = japao()
    const leg = t.itinerary.legs.find((l) => l.id === 'L:kyoto>tokyo')!
    expect(estimateLeg(leg, t.itinerary, t.destinations, { minutes: 134.4, km: 476 })).toEqual({
      minutes: 134,
      km: 476,
      source: 'route',
    })
    expect(estimateLeg(leg, t.itinerary, [])).toEqual({ minutes: null, km: null, source: 'none' })
  })

  it('fusos conhecidos e desconhecidos', () => {
    expect(tzOffsetMin('Asia/Tokyo', '2030-04-01')).toBe(540)
    expect(tzOffsetMin('UTC', '2030-04-01')).toBe(0)
    expect(tzOffsetMin('Lugar/Nenhum', '2030-04-01')).toBeNull()
  })
})

describe('escolhas de noites', () => {
  it('"De onde sai essa noite?": a mais próxima com noites sobrando primeiro, com a prévia', () => {
    const t = japao()
    const opts = suggestDonors(t.itinerary, 's1')
    expect(opts.map((o) => o.stopId)).toEqual(['s3', 's7', 's8', 's9'])
    expect(opts[0]!.preview.shifted).toEqual(['s2'])
    const kyoto = opts.find((o) => o.stopId === 's8')!
    expect(kyoto.preview.returned.map((r) => r.visit.id)).toEqual(['v14'])
    expect(kyoto.preview.shifted).toEqual(['s2', 's3', 's4', 's5', 's6', 's7'])
  })

  it('noites em aberto são a primeira opção quando estão perto', () => {
    const t = japao()
    const s = run(t.itinerary, { type: 'removeStop', stopId: 's6' }).state
    const opts = suggestDonors(s, 's7')
    expect(opts[0]!.stopId).toBe('s6')
    expect(opts[0]!.preview.returned).toEqual([])
  })

  it('"Para onde vai essa noite?": antes, depois ou em aberto', () => {
    const t = japao()
    const opts = suggestReceivers(t.itinerary, 's8')
    expect(opts.map((o) => (o.via.kind === 'stop' ? o.stopId : o.via.kind))).toEqual(['s7', 's9', 'open'])
    expect(opts[0]!.preview.returned.map((r) => r.visit.id)).toEqual(['v14'])
    expect(opts[1]!.preview.returned.map((r) => r.visit.id)).toEqual(['v20'])
    expect(suggestReceivers(t.itinerary, 's2')).toEqual([])
  })
})

describe('saúde do roteiro', () => {
  it('Japão no começo: só quests de hotel, passagens e imperdíveis', () => {
    const t = japao()
    const kinds = new Set(healthOf(t, t.itinerary).map((i) => i.kind))
    expect([...kinds].sort()).toEqual(['lodging-missing', 'must-unscheduled', 'transport-missing'])
    const must = healthOf(t, t.itinerary)
      .filter((i) => i.kind === 'must-unscheduled')
      .map((i) => i.target.id)
    expect(must).toEqual([t.placeId('teamLab Planets'), t.placeId('Sanjūsangen-dō')])
  })

  it('depois de mexer: reservas, noites em aberto e hotel parcial aparecem primeiro', () => {
    const t = japao()
    let s = run(t.itinerary, { type: 'moveBoundary', index: 6, k: -2 }).state
    s = run(s, { type: 'removeStop', stopId: 's2' }).state
    s = run(s, { type: 'setLegMode', legId: 'L:kyoto>tokyo', mode: 'bus' }).state
    s = run(s, {
      type: 'addAnchor',
      anchor: { id: 'a1', title: 'Show', date: '2030-04-21', destinationId: 'd-osaka' },
    }).state
    const issues = healthOf(t, s)
    expect(
      issues
        .slice(0, 2)
        .map((i) => i.kind)
        .sort(),
    ).toEqual(['anchor-outside', 'booking-wrong-mode'])
    expect(issues.find((i) => i.kind === 'lodging-partial')).toMatchObject({
      target: { kind: 'stop', id: 's8' },
      data: { nights: ['qui 11/04', 'sex 12/04'] },
    })
    expect(issues.find((i) => i.kind === 'open-nights')).toMatchObject({
      data: { nights: 1, from: 'qua 03/04', to: 'qua 03/04' },
    })
  })

  it('Portugal: direção longa e carro fora do aluguel', () => {
    const t = portugal()
    let s = run(t.itinerary, { type: 'reorderStop', stopId: 's6', toIndex: 4 }).state
    s = run(s, { type: 'setTripStart', date: '2030-09-08' }).state
    const kinds = healthOf(t, s).map((i) => i.kind)
    expect(kinds).toContain('outside-resource')
    expect(kinds).toContain('booking-out-of-window')
    // Porto → Lagos de carro: ~7 h.
    expect(healthOf(t, s).find((i) => i.kind === 'long-drive')!.data!.minutes).toBeGreaterThan(6 * 60)
    expect(
      healthOf(t, t.itinerary)
        .filter((i) => i.kind === 'long-drive')
        .map((i) => i.target.id),
    ).toEqual(['L:douro>lagos'])
  })

  it('Caminho e Rio não pedem passagem para trechos a pé', () => {
    const c = caminho()
    expect(
      healthOf(c, c.itinerary)
        .filter((i) => i.kind === 'transport-missing')
        .map((i) => i.target.id),
    ).toEqual(['L:home>sarria', 'L:santiago>home'])
    const r = rio()
    expect(healthOf(r, r.itinerary).map((i) => i.kind)).toEqual(['transport-missing', 'transport-missing'])
  })
})

describe('itens da mochila', () => {
  it('dias agendados, visitado e "voltou de"', () => {
    const t = japao()
    let s = run(t.itinerary, { type: 'removeStop', stopId: 's2' }).state
    s = run(s, { type: 'setVisitMeta', visitId: 'v1', visited: true }).state
    const st = placeStates(s, t.places)
    expect(st.get(t.placeId('Sensō-ji'))).toMatchObject({
      days: [{ index: 1, label: 'ter 02/04' }],
      visited: true,
      returnedFrom: null,
    })
    expect(st.get(t.placeId('Vila de Ginzan'))).toMatchObject({ days: [], returnedFrom: 'qua 03/04' })
    expect(st.get(t.placeId('teamLab Planets'))).toMatchObject({ days: [], returnedFrom: null })
  })
})
