import { addDays, dayLabel } from './dates'
import type { DayRef, Edge, ID, ISODate, Itinerary, Leg, Stop, Visit } from './types'

// ---------------------------------------------------------------------------
// Contexto, efeitos e erros
// ---------------------------------------------------------------------------

export interface OpContext {
  /** Gera ids novos. Vem de fora para o motor continuar determinístico. */
  newId: () => ID
}

export interface ReturnedVisit {
  visit: Visit
  from: DayRef
  date: ISODate | null
  label: string
}

export interface Effects {
  returned: ReturnedVisit[]
  merged: { keptStopId: ID; removedStopId: ID; destinationId: ID | null }[]
  legsCreated: ID[]
  legsArchived: ID[]
  legsRestored: ID[]
}

export const emptyEffects = (): Effects => ({
  returned: [],
  merged: [],
  legsCreated: [],
  legsArchived: [],
  legsRestored: [],
})

export type ErrorCode =
  | 'NOT_FOUND'
  | 'NO_CHANGE'
  | 'MIN_ONE_NIGHT'
  | 'DONOR_TOO_SHORT'
  | 'SAME_STOP'
  | 'NEEDS_BOTH_NEIGHBORS'
  | 'SPLIT_TOO_SMALL'
  | 'NOT_OPEN'
  | 'ALREADY_OPEN'
  | 'OPEN_HAS_NO_PLANS'
  | 'NO_START'
  | 'INVALID_DATE'
  | 'TAKE_FROM_MISMATCH'
  | 'OUT_OF_RANGE'
  | 'INVALID'

export interface EngineError {
  code: ErrorCode
  /** Dados para a interface montar a mensagem e as saídas (ex.: { stopId, nights }). */
  data?: Record<string, unknown>
}

export class OpError extends Error {
  readonly error: EngineError
  constructor(error: EngineError) {
    super(error.code)
    this.error = error
  }
}

export const fail = (code: ErrorCode, data?: Record<string, unknown>): never => {
  throw new OpError({ code, data })
}

// ---------------------------------------------------------------------------
// Consultas básicas
// ---------------------------------------------------------------------------

export const nightsOf = (s: Stop): number => s.days.length
export const isOpen = (s: Stop): boolean => s.destinationId === null

export const stopIndex = (it: Itinerary, stopId: ID): number => {
  const i = it.stops.findIndex((s) => s.id === stopId)
  if (i < 0) fail('NOT_FOUND', { stopId })
  return i
}

export const getStop = (it: Itinerary, stopId: ID): Stop => it.stops[stopIndex(it, stopId)]!

export const getLeg = (it: Itinerary, legId: ID): Leg => {
  const leg = it.legs.find((l) => l.id === legId)
  if (!leg) fail('NOT_FOUND', { legId })
  return leg!
}

export const legBetween = (it: Itinerary, from: ID | 'home', to: ID | 'home'): Leg | undefined =>
  it.legs.find((l) => l.from === from && l.to === to)

// ---------------------------------------------------------------------------
// Linha do tempo: trecho de ida, parada, trecho, parada, …, trecho de volta
// ---------------------------------------------------------------------------

export interface Segment {
  kind: 'stop' | 'leg'
  id: ID
  startIndex: number
  nights: number
}

export function timeline(it: Itinerary): { segments: Segment[]; total: number; departureIndex: number } {
  const segments: Segment[] = []
  let cursor = 0
  let prev: ID | 'home' = 'home'
  const pushLeg = (from: ID | 'home', to: ID | 'home') => {
    const leg = legBetween(it, from, to)
    if (leg) {
      segments.push({ kind: 'leg', id: leg.id, startIndex: cursor, nights: leg.aboard.length })
      cursor += leg.aboard.length
    }
  }
  for (const stop of it.stops) {
    pushLeg(prev, stop.id)
    segments.push({ kind: 'stop', id: stop.id, startIndex: cursor, nights: nightsOf(stop) })
    cursor += nightsOf(stop)
    prev = stop.id
  }
  const departureIndex = cursor
  pushLeg(prev, 'home')
  return { segments, total: cursor, departureIndex }
}

export const totalNights = (it: Itinerary): number => timeline(it).total

export function stopStartIndex(it: Itinerary, stopId: ID): number {
  const seg = timeline(it).segments.find((s) => s.kind === 'stop' && s.id === stopId)
  if (!seg) fail('NOT_FOUND', { stopId })
  return seg!.startIndex
}

export const dateAt = (it: Itinerary, index: number): ISODate | null =>
  it.start ? addDays(it.start, index) : null

export const labelAt = (it: Itinerary, index: number): string => {
  const d = dateAt(it, index)
  return d ? dayLabel(d) : `dia ${index + 1}`
}

// ---------------------------------------------------------------------------
// Regra da ponta: crescer e encolher uma parada no começo ou no fim
// ---------------------------------------------------------------------------

/**
 * Cresce (delta > 0) com dias vazios ou encolhe (delta < 0) removendo dias na ponta indicada.
 * `before` é o itinerário antes da operação, usado para datar os dias que saem.
 */
export function resize(
  it: Itinerary,
  before: Itinerary,
  stopId: ID,
  edge: Edge,
  delta: number,
  eff: Effects,
) {
  const stop = getStop(it, stopId)
  if (delta === 0) return
  if (delta > 0) {
    const fresh = Array.from({ length: delta }, () => [] as Visit[])
    stop.days = edge === 'start' ? [...fresh, ...stop.days] : [...stop.days, ...fresh]
    return
  }
  const remove = -delta
  if (remove > nightsOf(stop) - 1) fail('MIN_ONE_NIGHT', { stopId })
  const ordinals =
    edge === 'start'
      ? Array.from({ length: remove }, (_, k) => k)
      : Array.from({ length: remove }, (_, k) => nightsOf(stop) - remove + k)
  returnDays(it, before, stopId, ordinals, eff)
  stop.days = edge === 'start' ? stop.days.slice(remove) : stop.days.slice(0, nightsOf(stop) - remove)
}

/** Devolve à mochila as visitas dos dias indicados (sem removê-los). */
export function returnDays(it: Itinerary, before: Itinerary, stopId: ID, ordinals: number[], eff: Effects) {
  const stop = getStop(it, stopId)
  const beforeStop = before.stops.find((s) => s.id === stopId)
  const base = beforeStop ? stopStartIndex(before, stopId) : stopStartIndex(it, stopId)
  for (const ord of ordinals) {
    const day = stop.days[ord] ?? []
    for (const visit of day) {
      const idx = base + ord
      eff.returned.push({
        visit,
        from: { kind: 'stop', stopId, ordinal: ord },
        date: dateAt(before, idx),
        label: labelAt(before, idx),
      })
    }
  }
}

/** Devolve todas as visitas de uma lista de dias (ex.: noites a bordo). */
export function returnPlans(
  days: Visit[][],
  from: (ord: number) => DayRef,
  dateOf: (ord: number) => { date: ISODate | null; label: string },
  eff: Effects,
) {
  days.forEach((day, ord) => {
    for (const visit of day) {
      const d = dateOf(ord)
      eff.returned.push({ visit, from: from(ord), date: d.date, label: d.label })
    }
  })
}

export function recordReturned(it: Itinerary, eff: Effects) {
  if (!eff.returned.length) return
  const notes = eff.returned.map((r) => ({ placeId: r.visit.placeId, fromDate: r.date, fromLabel: r.label }))
  it.returned = [...notes.reverse(), ...it.returned].slice(0, 50)
}

// ---------------------------------------------------------------------------
// Normalização: funde vizinhas iguais e refaz os trechos
// ---------------------------------------------------------------------------

export function newStop(
  ctx: OpContext,
  destinationId: ID | null,
  nights: number,
  lodging: Stop['lodging'] = 'hotel',
): Stop {
  return { id: ctx.newId(), destinationId, days: Array.from({ length: nights }, () => []), lodging }
}

export function mergeAdjacent(it: Itinerary, eff: Effects) {
  it.stops = it.stops.filter((s) => nightsOf(s) > 0)
  for (let i = 0; i < it.stops.length - 1; i++) {
    const a = it.stops[i]!
    const b = it.stops[i + 1]!
    if (a.destinationId === b.destinationId) {
      a.days = [...a.days, ...b.days]
      a.tentative = a.tentative || b.tentative || undefined
      if (!a.tentative) delete a.tentative
      it.stops.splice(i + 1, 1)
      eff.merged.push({ keptStopId: a.id, removedStopId: b.id, destinationId: a.destinationId })
      i--
    }
  }
}

const legHasContent = (l: Leg): boolean => !!l.touched || l.aboard.length > 0 || l.waypoints.length > 0

export function reconcileLegs(it: Itinerary, before: Itinerary, eff: Effects, ctx: OpContext) {
  for (let pass = 0; pass < 6; pass++) {
    const ids = it.stops.map((s) => s.id)
    const pairs: [ID | 'home', ID | 'home'][] = []
    let prev: ID | 'home' = 'home'
    for (const id of ids) {
      pairs.push([prev, id])
      prev = id
    }
    pairs.push([prev, 'home'])

    const next: Leg[] = []
    const used = new Set<ID>()
    for (const [from, to] of pairs) {
      const active = it.legs.find((l) => l.from === from && l.to === to && !used.has(l.id))
      if (active) {
        next.push(active)
        used.add(active.id)
        continue
      }
      const ai = it.archivedLegs.findIndex((l) => l.from === from && l.to === to)
      if (ai >= 0) {
        const [restored] = it.archivedLegs.splice(ai, 1)
        next.push(restored!)
        used.add(restored!.id)
        eff.legsRestored.push(restored!.id)
        continue
      }
      // A ida e a volta herdam o meio da ida/volta anterior (trocar a primeira cidade não vira "trem para o Japão").
      const sameRole =
        from === 'home'
          ? it.legs.find((l) => l.from === 'home')
          : to === 'home'
            ? it.legs.find((l) => l.to === 'home')
            : undefined
      const created: Leg = {
        id: ctx.newId(),
        from,
        to,
        mode: sameRole?.mode ?? it.defaultMode,
        aboard: [],
        waypoints: [],
      }
      next.push(created)
      used.add(created.id)
      eff.legsCreated.push(created.id)
    }

    // Trechos que saíram da rota: arquivados se a pessoa mexeu neles; noites a bordo viram noites em aberto.
    let insertedOpen = false
    for (const old of it.legs) {
      if (used.has(old.id)) continue
      if (!legHasContent(old)) continue
      if (old.aboard.length) {
        const beforeSeg = timeline(before).segments.find((s) => s.kind === 'leg' && s.id === old.id)
        returnPlans(
          old.aboard,
          (ord) => ({ kind: 'leg', legId: old.id, ordinal: ord }),
          (ord) => {
            const idx = (beforeSeg?.startIndex ?? 0) + ord
            return { date: dateAt(before, idx), label: labelAt(before, idx) }
          },
          eff,
        )
        const open = newStop(ctx, null, old.aboard.length)
        const fromIdx = it.stops.findIndex((s) => s.id === old.from)
        const toIdx = it.stops.findIndex((s) => s.id === old.to)
        const at = fromIdx >= 0 ? fromIdx + 1 : toIdx >= 0 ? toIdx : it.stops.length
        it.stops.splice(at, 0, open)
        insertedOpen = true
      }
      const archived: Leg = { ...old, aboard: [], touched: true }
      it.archivedLegs = [
        ...it.archivedLegs.filter((l) => !(l.from === old.from && l.to === old.to)),
        archived,
      ]
      eff.legsArchived.push(old.id)
    }
    it.legs = next
    if (!insertedOpen) return
    mergeAdjacent(it, eff)
  }
}

export function normalize(it: Itinerary, before: Itinerary, eff: Effects, ctx: OpContext) {
  mergeAdjacent(it, eff)
  reconcileLegs(it, before, eff, ctx)
  recordReturned(it, eff)
}

// ---------------------------------------------------------------------------
// Dias: localizar e editar planos por referência
// ---------------------------------------------------------------------------

export function planAt(it: Itinerary, ref: DayRef): Visit[] {
  if (ref.kind === 'departure') return it.departurePlan
  if (ref.kind === 'stop') {
    const stop = getStop(it, ref.stopId)
    if (isOpen(stop)) fail('OPEN_HAS_NO_PLANS', { stopId: stop.id })
    const day = stop.days[ref.ordinal]
    if (!day) fail('OUT_OF_RANGE', { stopId: stop.id, ordinal: ref.ordinal })
    return day!
  }
  const leg = getLeg(it, ref.legId)
  const day = leg.aboard[ref.ordinal]
  if (!day) fail('OUT_OF_RANGE', { legId: leg.id, ordinal: ref.ordinal })
  return day!
}

/** Todas as visitas do itinerário com a sua localização (para conferências e testes). */
export function allVisits(it: Itinerary): { visit: Visit; where: string }[] {
  const out: { visit: Visit; where: string }[] = []
  it.stops.forEach((s) =>
    s.days.forEach((d, i) => d.forEach((v) => out.push({ visit: v, where: `s:${s.id}:${i}` }))),
  )
  for (const l of [...it.legs, ...it.archivedLegs]) {
    l.aboard.forEach((d, i) => d.forEach((v) => out.push({ visit: v, where: `l:${l.id}:${i}` })))
    l.waypoints.forEach((v) => out.push({ visit: v, where: `w:${l.id}` }))
  }
  it.departurePlan.forEach((v) => out.push({ visit: v, where: 'departure' }))
  return out
}

export function findVisit(it: Itinerary, visitId: ID): { list: Visit[]; index: number } | null {
  const lists: Visit[][] = []
  it.stops.forEach((s) => s.days.forEach((d) => lists.push(d)))
  it.legs.forEach((l) => {
    l.aboard.forEach((d) => lists.push(d))
    lists.push(l.waypoints)
  })
  lists.push(it.departurePlan)
  // Por último os trechos arquivados: guardam visitas que voltam com o trecho (e precisam sair ao apagar).
  it.archivedLegs.forEach((l) => {
    l.aboard.forEach((d) => lists.push(d))
    lists.push(l.waypoints)
  })
  for (const list of lists) {
    const index = list.findIndex((v) => v.id === visitId)
    if (index >= 0) return { list, index }
  }
  return null
}
