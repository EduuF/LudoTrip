import { addDays, dayLabel, diffDays } from './dates'
import { dateAt, getStop, isOpen, labelAt, legBetween, nightsOf, stopIndex, timeline } from './core'
import type { Effects, EngineError, ReturnedVisit } from './core'
import { dispatch } from './commands'
import type { Command } from './commands'
import type {
  Booking,
  DayRef,
  Destination,
  ID,
  ISODate,
  Itinerary,
  Leg,
  LegMode,
  Place,
  Via,
  Visit,
} from './types'

// Derivações: tudo o que a tela mostra e que sai do itinerário sem ser guardado.
// Funções puras; nenhuma muda o que recebe.

// ---------------------------------------------------------------------------
// Datas da viagem e janelas das cidades
// ---------------------------------------------------------------------------

export interface TripRange {
  start: ISODate | null
  /** Dia da volta (sai da última cidade). */
  end: ISODate | null
  nights: number
}

export function tripRange(it: Itinerary): TripRange {
  const { total } = timeline(it)
  return { start: it.start, end: it.start ? addDays(it.start, total) : null, nights: total }
}

export interface StopWindow {
  stopId: ID
  destinationId: ID | null
  startIndex: number
  nights: number
  /** Primeira noite. */
  start: ISODate | null
  /** Dia em que sai (check-out). */
  end: ISODate | null
}

export function stopWindows(it: Itinerary): StopWindow[] {
  return timeline(it)
    .segments.filter((s) => s.kind === 'stop')
    .map((s) => {
      const stop = getStop(it, s.id)
      return {
        stopId: s.id,
        destinationId: stop.destinationId,
        startIndex: s.startIndex,
        nights: s.nights,
        start: dateAt(it, s.startIndex),
        end: dateAt(it, s.startIndex + s.nights),
      }
    })
}

/** Dia em que o trecho acontece (saída). */
export function legDayIndex(it: Itinerary, legId: ID): number | null {
  const seg = timeline(it).segments.find((s) => s.kind === 'leg' && s.id === legId)
  return seg ? seg.startIndex : null
}

// ---------------------------------------------------------------------------
// Dias
// ---------------------------------------------------------------------------

export interface Day {
  index: number
  date: ISODate | null
  label: string
  kind: 'stop' | 'aboard' | 'open' | 'departure'
  /** Onde planejar o dia; null nas noites em aberto. */
  ref: DayRef | null
  stopId: ID | null
  legId: ID | null
  ordinal: number
  destinationId: ID | null
  /** Trecho feito neste dia (chegada à cidade, noite a bordo ou volta para casa). */
  travelLegId: ID | null
  visits: Visit[]
  /** Outros destinos visitados no dia: bate-voltas. */
  dayTrips: ID[]
  /** Há uma cidade com noites incertas antes deste dia. */
  estimated: boolean
}

export function days(it: Itinerary, places: Place[] = []): Day[] {
  const placeDest = new Map(places.map((p) => [p.id, p.destinationId]))
  const tripsOf = (visits: Visit[], here: ID | null): ID[] => {
    const out: ID[] = []
    for (const v of visits) {
      const d = placeDest.get(v.placeId)
      if (d && d !== here && !out.includes(d)) out.push(d)
    }
    return out
  }
  const out: Day[] = []
  let estimated = false
  let prev: ID | 'home' = 'home'
  const { segments, departureIndex } = timeline(it)
  for (const seg of segments) {
    if (seg.kind === 'leg') {
      const leg = it.legs.find((l) => l.id === seg.id)!
      leg.aboard.forEach((visits, ordinal) =>
        out.push({
          index: seg.startIndex + ordinal,
          date: dateAt(it, seg.startIndex + ordinal),
          label: labelAt(it, seg.startIndex + ordinal),
          kind: 'aboard',
          ref: { kind: 'leg', legId: leg.id, ordinal },
          stopId: null,
          legId: leg.id,
          ordinal,
          destinationId: null,
          travelLegId: ordinal === 0 ? leg.id : null,
          visits,
          dayTrips: tripsOf(visits, null),
          estimated,
        }),
      )
      continue
    }
    const stop = getStop(it, seg.id)
    const arriving = legBetween(it, prev, stop.id)
    stop.days.forEach((visits, ordinal) => {
      const index = seg.startIndex + ordinal
      out.push({
        index,
        date: dateAt(it, index),
        label: labelAt(it, index),
        kind: isOpen(stop) ? 'open' : 'stop',
        ref: isOpen(stop) ? null : { kind: 'stop', stopId: stop.id, ordinal },
        stopId: stop.id,
        legId: null,
        ordinal,
        destinationId: stop.destinationId,
        travelLegId: ordinal === 0 && arriving && arriving.aboard.length === 0 ? arriving.id : null,
        visits,
        dayTrips: tripsOf(visits, stop.destinationId),
        estimated,
      })
    })
    if (stop.tentative) estimated = true
    prev = stop.id
  }
  const last = it.stops[it.stops.length - 1]
  const home = last ? legBetween(it, last.id, 'home') : undefined
  out.push({
    index: departureIndex,
    date: dateAt(it, departureIndex),
    label: labelAt(it, departureIndex),
    kind: 'departure',
    ref: { kind: 'departure' },
    stopId: last?.id ?? null,
    legId: null,
    ordinal: 0,
    destinationId: last?.destinationId ?? null,
    travelLegId: home?.id ?? null,
    visits: it.departurePlan,
    dayTrips: tripsOf(it.departurePlan, last?.destinationId ?? null),
    estimated,
  })
  return out.sort((a, b) => a.index - b.index)
}

// ---------------------------------------------------------------------------
// Mundos (agrupamento por país)
// ---------------------------------------------------------------------------

export interface World {
  country: string
  stopIds: ID[]
  nights: number
  firstIndex: number
}

export function worlds(it: Itinerary, destinations: Destination[]): World[] {
  const byId = new Map(destinations.map((d) => [d.id, d]))
  const out = new Map<string, World>()
  it.stops.forEach((s, i) => {
    const country = s.destinationId ? byId.get(s.destinationId)?.country : undefined
    if (!country) return
    const w = out.get(country) ?? { country, stopIds: [], nights: 0, firstIndex: i }
    w.stopIds.push(s.id)
    w.nights += nightsOf(s)
    out.set(country, w)
  })
  return [...out.values()].sort((a, b) => a.firstIndex - b.firstIndex)
}

// ---------------------------------------------------------------------------
// Reservas: fatos que o motor nunca muda; aqui só se confere se ainda batem
// ---------------------------------------------------------------------------

export type BookingState = 'ok' | 'out-of-window' | 'orphan' | 'wrong-mode' | 'undated' | 'archived'

export interface BookingStatus {
  state: BookingState
  stopId?: ID
  legId?: ID
}

const endpointDest = (it: Itinerary, end: ID | 'home'): ID | 'home' | null =>
  end === 'home' ? 'home' : (it.stops.find((s) => s.id === end)?.destinationId ?? null)

/** Trechos ativos que ligam esses dois destinos (ou casa). */
export function legsForPair(it: Itinerary, from: ID | 'home', to: ID | 'home'): Leg[] {
  return it.legs.filter((l) => endpointDest(it, l.from) === from && endpointDest(it, l.to) === to)
}

export function bookingStatus(b: Booking, it: Itinerary): BookingStatus {
  if (b.archived) return { state: 'archived' }
  if (b.kind === 'lodging') {
    const windows = stopWindows(it).filter((w) => w.destinationId === b.destinationId)
    if (!windows.length) return { state: 'orphan' }
    if (!it.start) return { state: 'undated', stopId: windows[0]!.stopId }
    const inside = windows.find((w) => w.start! <= b.checkin && b.checkout <= w.end!)
    if (inside) return { state: 'ok', stopId: inside.stopId }
    const overlap = windows.find((w) => b.checkin < w.end! && w.start! < b.checkout) ?? windows[0]!
    return { state: 'out-of-window', stopId: overlap.stopId }
  }
  if (b.kind === 'transport') {
    const legs = legsForPair(it, b.fromDestinationId, b.toDestinationId)
    if (!legs.length) return { state: 'orphan' }
    if (!it.start) return { state: 'undated', legId: legs[0]!.id }
    const sameDay = legs.find((l) => dateAt(it, legDayIndex(it, l.id)!) === b.date)
    if (!sameDay) return { state: 'out-of-window', legId: legs[0]!.id }
    if (sameDay.mode !== b.mode) return { state: 'wrong-mode', legId: sameDay.id }
    return { state: 'ok', legId: sameDay.id }
  }
  if (!b.date) return { state: 'ok' }
  if (!it.start) return { state: 'undated' }
  const range = tripRange(it)
  if (b.date < range.start! || b.date > range.end!) return { state: 'out-of-window' }
  return { state: 'ok' }
}

// ---------------------------------------------------------------------------
// Hospedagem: noites sem reserva (inclusive cobertura parcial)
// ---------------------------------------------------------------------------

export interface LodgingGap {
  stopId: ID
  destinationId: ID
  /** Noites sem hospedagem: posição na cidade, data e rótulo. */
  missing: { ordinal: number; date: ISODate | null; label: string }[]
  /** Alguma noite da cidade tem reserva (a falta é parcial). */
  partial: boolean
}

const NO_LODGING_NEEDED = new Set(['friends', 'onboard'])

export function lodgingGaps(it: Itinerary, bookings: Booking[]): LodgingGap[] {
  const lodgings = bookings.filter(
    (b): b is Extract<Booking, { kind: 'lodging' }> => b.kind === 'lodging' && !b.archived,
  )
  const out: LodgingGap[] = []
  for (const w of stopWindows(it)) {
    const stop = getStop(it, w.stopId)
    if (!w.destinationId || NO_LODGING_NEEDED.has(stop.lodging)) continue
    const mine = lodgings.filter((b) => b.destinationId === w.destinationId)
    const missing: LodgingGap['missing'] = []
    for (let ord = 0; ord < w.nights; ord++) {
      const date = dateAt(it, w.startIndex + ord)
      const covered = date ? mine.some((b) => b.checkin <= date && date < b.checkout) : mine.length > 0
      if (!covered) missing.push({ ordinal: ord, date, label: labelAt(it, w.startIndex + ord) })
    }
    if (missing.length)
      out.push({
        stopId: w.stopId,
        destinationId: w.destinationId,
        missing,
        partial: missing.length < w.nights,
      })
  }
  return out
}

// ---------------------------------------------------------------------------
// Tempo de viagem de um trecho, sempre com a fonte
// ---------------------------------------------------------------------------

/** Velocidade média (km/h), fator de desvio da linha reta e tempo fixo (h). */
const SPEED: Record<LegMode, { v: number; f: number; base: number }> = {
  flight: { v: 780, f: 1, base: 0.6 },
  train: { v: 150, f: 1.15, base: 0 },
  bus: { v: 65, f: 1.25, base: 0 },
  car: { v: 80, f: 1.25, base: 0 },
  moto: { v: 75, f: 1.25, base: 0 },
  boat: { v: 30, f: 1.2, base: 0 },
  bike: { v: 15, f: 1.25, base: 0 },
  walk: { v: 4.5, f: 1.25, base: 0 },
}

/** Ajustes por país (ex.: trem-bala no Japão). */
const COUNTRY_SPEED: Record<string, Partial<Record<LegMode, number>>> = {
  JP: { train: 170 },
  CN: { train: 190 },
  FR: { train: 160 },
  ES: { train: 160 },
  IT: { train: 140 },
  US: { car: 95 },
  BR: { car: 70, bus: 55 },
  IN: { car: 50, bus: 40, train: 60 },
}

export type LegTimeSource = 'user' | 'route' | 'estimate' | 'none'

export interface LegEstimate {
  minutes: number | null
  km: number | null
  source: LegTimeSource
}

const toRad = (d: number) => (d * Math.PI) / 180
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/** Diferença do fuso em relação a UTC (minutos) numa data. Null se o fuso não for conhecido. */
export function tzOffsetMin(tz: string, date: ISODate): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date(`${date}T12:00:00Z`))
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
    if (name === 'GMT') return 0
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name)
    if (!m) return null
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
  } catch {
    return null
  }
}

interface Endpoint {
  lat?: number
  lon?: number
  tz?: string
  country?: string
}

function endpoint(it: Itinerary, end: ID | 'home', byId: Map<ID, Destination>): Endpoint | null {
  if (end === 'home') return it.home ?? null
  const dest = it.stops.find((s) => s.id === end)?.destinationId
  return dest ? (byId.get(dest) ?? null) : null
}

const minutesOf = (t: string): number => {
  const [h, m] = t.split(':').map(Number) as [number, number]
  return h * 60 + m
}

/**
 * Tempo do trecho. Vale a primeira fonte que existir:
 * horários ou duração dados pela pessoa ("sua passagem") → rota real (cache dos provedores) → estimativa pela distância.
 */
export function estimateLeg(
  leg: Leg,
  it: Itinerary,
  destinations: Destination[],
  route?: { minutes: number; km: number } | null,
): LegEstimate {
  const byId = new Map(destinations.map((d) => [d.id, d]))
  const a = endpoint(it, leg.from, byId)
  const b = endpoint(it, leg.to, byId)
  const hasCoords = a?.lat !== undefined && a.lon !== undefined && b?.lat !== undefined && b.lon !== undefined
  const km = hasCoords ? haversineKm({ lat: a.lat!, lon: a.lon! }, { lat: b.lat!, lon: b.lon! }) : null

  if (leg.dep && leg.arr) {
    let minutes = minutesOf(leg.arr) - minutesOf(leg.dep) + (leg.arrDayOffset ?? 0) * 1440
    const idx = legDayIndex(it, leg.id)
    const date = idx === null ? null : dateAt(it, idx)
    if (date && a?.tz && b?.tz) {
      const oa = tzOffsetMin(a.tz, date)
      const ob = tzOffsetMin(b.tz, date)
      if (oa !== null && ob !== null) minutes -= ob - oa
    }
    if (minutes > 0) return { minutes, km, source: 'user' }
  }
  if (leg.durationMin) return { minutes: leg.durationMin, km, source: 'user' }
  if (route) return { minutes: Math.round(route.minutes), km: route.km, source: 'route' }
  if (km === null) return { minutes: null, km: null, source: 'none' }
  const sp = SPEED[leg.mode]
  const country = a?.country && a.country === b?.country ? a.country : undefined
  const v = (country && COUNTRY_SPEED[country]?.[leg.mode]) || sp.v
  const hours = sp.base + (km * sp.f) / v
  return { minutes: Math.max(5, Math.round((hours * 60) / 5) * 5), km: Math.round(km), source: 'estimate' }
}

// ---------------------------------------------------------------------------
// Escolhas: "De onde sai essa noite?" e "Para onde vai essa noite?"
// ---------------------------------------------------------------------------

export interface Preview {
  ok: boolean
  error?: EngineError
  returned: ReturnedVisit[]
  /** Cidades que mudam de data sem mudar de tamanho (deslocam inteiras). */
  shifted: ID[]
  effects?: Effects
  state?: Itinerary
}

const previewIds = () => {
  let n = 0
  return { newId: () => `preview-${++n}` }
}

/** Roda um comando de mentira para mostrar antes o que vai acontecer. */
export function preview(it: Itinerary, command: Command): Preview {
  const r = dispatch(it, command, previewIds())
  if (!r.ok) return { ok: false, error: r.error, returned: [], shifted: [] }
  const before = new Map(stopWindows(it).map((w) => [w.stopId, w]))
  const shifted = stopWindows(r.state)
    .filter((w) => {
      const old = before.get(w.stopId)
      return old && old.nights === w.nights && old.startIndex !== w.startIndex
    })
    .map((w) => w.stopId)
  return { ok: true, returned: r.effects.returned, shifted, effects: r.effects, state: r.state }
}

export interface NightOption {
  via: Via
  /** Cidade que cede ou recebe (ausente para volta e noites em aberto). */
  stopId?: ID
  side?: 'before' | 'after'
  distance: number
  preview: Preview
}

/** Cidades que podem ceder `nights` noites para `stopId`, da mais próxima para a mais distante. */
export function suggestDonors(it: Itinerary, stopId: ID, nights = 1): NightOption[] {
  const x = getStop(it, stopId)
  const xi = stopIndex(it, stopId)
  const out: NightOption[] = []
  it.stops.forEach((s, i) => {
    if (s.id === stopId) return
    const enough = isOpen(s) ? nightsOf(s) >= nights : nightsOf(s) - nights >= 1
    if (!enough) return
    const via: Via = { kind: 'stop', stopId: s.id }
    const p = preview(it, { type: 'setNights', stopId, nights: nightsOf(x) + nights, via })
    if (!p.ok) return
    out.push({ via, stopId: s.id, side: i < xi ? 'before' : 'after', distance: Math.abs(i - xi), preview: p })
  })
  // Mais próxima primeiro; noites em aberto ganham empate (ninguém perde planos); depois, a que vem depois.
  return out.sort(
    (a, b) =>
      a.distance - b.distance ||
      Number(!isOpen(getStop(it, a.stopId!))) - Number(!isOpen(getStop(it, b.stopId!))) ||
      (a.side === 'after' ? -1 : 1) - (b.side === 'after' ? -1 : 1),
  )
}

/** Para onde vai a noite que sai de `stopId`: cidade antes, cidade depois, ou noites em aberto. */
export function suggestReceivers(it: Itinerary, stopId: ID, nights = 1): NightOption[] {
  const x = getStop(it, stopId)
  const xi = stopIndex(it, stopId)
  const target = nightsOf(x) - nights
  if (target < 1) return []
  const out: NightOption[] = []
  for (const [side, s] of [
    ['before', it.stops[xi - 1]],
    ['after', it.stops[xi + 1]],
  ] as const) {
    if (!s) continue
    const via: Via = { kind: 'stop', stopId: s.id }
    const p = preview(it, { type: 'setNights', stopId, nights: target, via })
    if (p.ok) out.push({ via, stopId: s.id, side, distance: 1, preview: p })
  }
  const open = preview(it, { type: 'setNights', stopId, nights: target, via: { kind: 'open' } })
  if (open.ok) out.push({ via: { kind: 'open' }, distance: 0, preview: open })
  return out
}

// ---------------------------------------------------------------------------
// Saúde do roteiro: a lista única de pendências (vira as quests)
// ---------------------------------------------------------------------------

export type IssueKind =
  | 'booking-orphan'
  | 'booking-out-of-window'
  | 'booking-wrong-mode'
  | 'anchor-outside'
  | 'lodging-partial'
  | 'open-nights'
  | 'long-drive'
  | 'outside-resource'
  | 'lodging-missing'
  | 'transport-missing'
  | 'must-unscheduled'

export interface Issue {
  kind: IssueKind
  severity: 'alert' | 'warn' | 'info'
  target: { kind: 'stop' | 'leg' | 'place' | 'booking' | 'anchor' | 'resource'; id: ID }
  data?: Record<string, unknown>
}

const SEVERITY_ORDER = { alert: 0, warn: 1, info: 2 } as const
const NEEDS_TICKET = new Set<LegMode>(['flight', 'train', 'bus', 'boat'])
const LONG_DRIVE_MIN = 6 * 60

export function health(
  it: Itinerary,
  data: { destinations: Destination[]; places: Place[]; bookings: Booking[] },
): Issue[] {
  const issues: Issue[] = []
  const bookings = data.bookings.filter((b) => !b.archived)

  for (const b of bookings) {
    const st = bookingStatus(b, it)
    const extra = { stopId: st.stopId, legId: st.legId }
    if (st.state === 'orphan')
      issues.push({ kind: 'booking-orphan', severity: 'alert', target: { kind: 'booking', id: b.id } })
    if (st.state === 'out-of-window')
      issues.push({
        kind: 'booking-out-of-window',
        severity: 'alert',
        target: { kind: 'booking', id: b.id },
        data: extra,
      })
    if (st.state === 'wrong-mode')
      issues.push({
        kind: 'booking-wrong-mode',
        severity: 'alert',
        target: { kind: 'booking', id: b.id },
        data: extra,
      })
  }

  const allDays = days(it, data.places)
  for (const a of it.anchors) {
    if (!a.destinationId || !it.start) continue
    const day = allDays.find((d) => d.date === a.date)
    const here = day && (day.destinationId === a.destinationId || day.dayTrips.includes(a.destinationId))
    if (!here)
      issues.push({ kind: 'anchor-outside', severity: 'alert', target: { kind: 'anchor', id: a.id } })
  }

  for (const g of lodgingGaps(it, bookings)) {
    issues.push({
      kind: g.partial ? 'lodging-partial' : 'lodging-missing',
      severity: g.partial ? 'warn' : 'info',
      target: { kind: 'stop', id: g.stopId },
      data: { nights: g.missing.map((m) => m.label) },
    })
  }

  for (const s of it.stops) {
    if (!isOpen(s)) continue
    const start = stopWindows(it).find((w) => w.stopId === s.id)!
    issues.push({
      kind: 'open-nights',
      severity: 'warn',
      target: { kind: 'stop', id: s.id },
      data: {
        nights: nightsOf(s),
        from: labelAt(it, start.startIndex),
        to: labelAt(it, start.startIndex + nightsOf(s) - 1),
      },
    })
  }

  // Cada passagem vale para um trecho só (o do mesmo dia); pares repetidos (Kyoto → Tóquio duas vezes) contam separado.
  const ticketed = new Set(
    bookings.filter((b) => b.kind === 'transport').map((b) => bookingStatus(b, it).legId),
  )
  for (const leg of it.legs) {
    const from = endpointDest(it, leg.from)
    const to = endpointDest(it, leg.to)
    if (!from || !to) continue
    if (leg.mode === 'car') {
      const est = estimateLeg(leg, it, data.destinations)
      if (est.minutes !== null && est.minutes > LONG_DRIVE_MIN)
        issues.push({
          kind: 'long-drive',
          severity: 'warn',
          target: { kind: 'leg', id: leg.id },
          data: { minutes: est.minutes },
        })
    }
    const idx = legDayIndex(it, leg.id)
    const date = idx === null ? null : dateAt(it, idx)
    for (const r of it.resources) {
      if (!r.covers?.includes(leg.mode) || !date || !r.start || !r.end) continue
      if (date < r.start || date > r.end)
        issues.push({
          kind: 'outside-resource',
          severity: 'warn',
          target: { kind: 'leg', id: leg.id },
          data: { resourceId: r.id },
        })
    }
    if (NEEDS_TICKET.has(leg.mode) && !ticketed.has(leg.id))
      issues.push({ kind: 'transport-missing', severity: 'info', target: { kind: 'leg', id: leg.id } })
  }

  const { scheduled, inTrip } = scheduleInfo(it, data.places)
  for (const p of data.places) {
    if (p.rarity === 'must' && inTrip.has(p.destinationId) && !scheduled.has(p.id))
      issues.push({ kind: 'must-unscheduled', severity: 'info', target: { kind: 'place', id: p.id } })
  }

  return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

/** Itens com dia e destinos que a viagem usa (com noites ou com algum item agendado, como um bate-volta). */
function scheduleInfo(it: Itinerary, places: Place[]): { scheduled: Set<ID>; inTrip: Set<ID> } {
  const scheduled = new Set<ID>()
  for (const d of days(it)) for (const v of d.visits) scheduled.add(v.placeId)
  for (const l of it.legs) for (const v of l.waypoints) scheduled.add(v.placeId)
  const placeDest = new Map(places.map((p) => [p.id, p.destinationId]))
  const inTrip = new Set<ID>()
  for (const s of it.stops) if (s.destinationId) inTrip.add(s.destinationId)
  for (const id of scheduled) {
    const d = placeDest.get(id)
    if (d) inTrip.add(d)
  }
  return { scheduled, inTrip }
}

// ---------------------------------------------------------------------------
// A viagem no tempo: antes, durante e depois
// ---------------------------------------------------------------------------

export type TripPhase =
  | { kind: 'undated' }
  | { kind: 'before'; daysLeft: number; start: ISODate }
  | { kind: 'during'; day: number; totalDays: number; stopId: ID | null; destinationId: ID | null }
  | { kind: 'after'; totalDays: number }

/** `today` vem de fora (o motor não lê o relógio). */
export function tripPhase(it: Itinerary, today: ISODate): TripPhase {
  if (!it.start) return { kind: 'undated' }
  const { total } = timeline(it)
  const offset = diffDays(it.start, today)
  if (offset < 0) return { kind: 'before', daysLeft: -offset, start: it.start }
  if (offset > total) return { kind: 'after', totalDays: total + 1 }
  const day = days(it).find((d) => d.index === offset)
  return {
    kind: 'during',
    day: offset + 1,
    totalDays: total + 1,
    stopId: day?.stopId ?? null,
    destinationId: day?.destinationId ?? null,
  }
}

// ---------------------------------------------------------------------------
// Preparo da viagem: XP e nível (calculados do estado, nunca de cliques)
// ---------------------------------------------------------------------------

export const LEVELS = [
  { level: 1, name: 'Sonhando', from: 0 },
  { level: 2, name: 'Rascunho', from: 0.2 },
  { level: 3, name: 'Roteiro firme', from: 0.45 },
  { level: 4, name: 'Quase lá', from: 0.7 },
  { level: 5, name: 'Pronto pra partir', from: 1 },
] as const

export const XP = { ticket: 30, lodging: 30, must: 15, scheduled: 5 } as const

export interface PrepTask {
  kind: 'ticket' | 'lodging' | 'must'
  done: number
  total: number
}

export interface Progress {
  xp: number
  level: number
  levelName: string
  /** 0..1: quanto do preparo essencial (passagens, hospedagens, imperdíveis) já está feito. */
  ratio: number
  /** 0..1 dentro do nível atual (para a barra). */
  inLevel: number
  tasks: PrepTask[]
}

export function progress(
  it: Itinerary,
  data: {
    places: Place[]
    bookings: Booking[]
    /** Tarefas automáticas marcadas "Não preciso" (chave `tipo:alvo`): contam como resolvidas. */
    skip?: (key: string) => boolean
    /** XP de fora do motor (tarefas escritas por quem viaja). */
    extraXp?: number
  },
): Progress {
  const skip = data.skip ?? (() => false)
  const bookings = data.bookings.filter((b) => !b.archived)
  const okTickets = new Set(
    bookings
      .filter((b) => b.kind === 'transport')
      .map((b) => bookingStatus(b, it))
      // Sem datas a passagem não tem como "bater o dia", mas existe: conta (como em health()).
      .filter((s) => s.state === 'ok' || s.state === 'undated')
      .map((s) => s.legId),
  )
  const ticketLegs = it.legs.filter(
    (l) => NEEDS_TICKET.has(l.mode) && endpointDest(it, l.from) && endpointDest(it, l.to),
  )
  const tickets = {
    kind: 'ticket' as const,
    done: ticketLegs.filter((l) => okTickets.has(l.id) || skip(`transport-missing:${l.id}`)).length,
    skipped: ticketLegs.filter((l) => !okTickets.has(l.id) && skip(`transport-missing:${l.id}`)).length,
    total: ticketLegs.length,
  }

  const gaps = new Set(lodgingGaps(it, bookings).map((g) => g.stopId))
  const sleeps = it.stops.filter((s) => s.destinationId && !NO_LODGING_NEEDED.has(s.lodging))
  const lodging = {
    kind: 'lodging' as const,
    done: sleeps.filter(
      (s) => !gaps.has(s.id) || skip(`lodging-missing:${s.id}`) || skip(`lodging-partial:${s.id}`),
    ).length,
    skipped: sleeps.filter(
      (s) => gaps.has(s.id) && (skip(`lodging-missing:${s.id}`) || skip(`lodging-partial:${s.id}`)),
    ).length,
    total: sleeps.length,
  }

  const { scheduled, inTrip } = scheduleInfo(it, data.places)
  const musts = data.places.filter((p) => p.rarity === 'must' && inTrip.has(p.destinationId))
  const must = {
    kind: 'must' as const,
    done: musts.filter((p) => scheduled.has(p.id) || skip(`must-unscheduled:${p.id}`)).length,
    skipped: musts.filter((p) => !scheduled.has(p.id) && skip(`must-unscheduled:${p.id}`)).length,
    total: musts.length,
  }
  const others = data.places.filter((p) => p.rarity !== 'must' && scheduled.has(p.id)).length

  const done = tickets.done * XP.ticket + lodging.done * XP.lodging + must.done * XP.must
  const total = tickets.total * XP.ticket + lodging.total * XP.lodging + must.total * XP.must
  const ratio = total ? done / total : 0
  const current = [...LEVELS].reverse().find((l) => ratio >= l.from) ?? LEVELS[0]
  const next = LEVELS.find((l) => l.level === current.level + 1)
  const inLevel = next ? (ratio - current.from) / (next.from - current.from) : 1
  return {
    // "Não preciso" conta no nível (ratio), mas não dá XP: só o que foi feito de verdade.
    xp:
      done -
      (tickets.skipped * XP.ticket + lodging.skipped * XP.lodging + must.skipped * XP.must) +
      others * XP.scheduled +
      (data.extraXp ?? 0),
    level: current.level,
    levelName: current.name,
    ratio,
    inLevel: Math.max(0, Math.min(1, inLevel)),
    tasks: [tickets, lodging, must].map((t) => ({ kind: t.kind, done: t.done, total: t.total })),
  }
}

// ---------------------------------------------------------------------------
// Estado dos itens da Mochila
// ---------------------------------------------------------------------------

export interface PlaceState {
  placeId: ID
  /** Dias em que o item está agendado (rótulos prontos). */
  days: { index: number; label: string }[]
  visited: boolean
  /** "voltou de qua 07": a nota mais recente, se o item não voltou a ser agendado. */
  returnedFrom: string | null
}

export function placeStates(it: Itinerary, places: Place[]): Map<ID, PlaceState> {
  const out = new Map<ID, PlaceState>()
  for (const p of places) out.set(p.id, { placeId: p.id, days: [], visited: false, returnedFrom: null })
  for (const d of days(it, places)) {
    for (const v of d.visits) {
      const st = out.get(v.placeId)
      if (!st) continue
      st.days.push({ index: d.index, label: d.label })
      if (v.visited) st.visited = true
    }
  }
  for (const note of [...it.returned].reverse()) {
    const st = out.get(note.placeId)
    if (st && !st.days.length) st.returnedFrom = note.fromDate ? dayLabel(note.fromDate) : note.fromLabel
  }
  return out
}
