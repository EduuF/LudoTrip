import { dateAt, fail, getLeg, labelAt, normalize, resize, returnPlans, stopIndex, timeline } from '../core'
import type { Effects, OpContext } from '../core'
import type { Hub, ID, Itinerary, LegMode, LocalTime, Slot, Via } from '../types'
import { donate } from './nights'

export function setLegMode(it: Itinerary, _b: Itinerary, a: { legId: ID; mode: LegMode }) {
  const leg = getLeg(it, a.legId)
  if (leg.mode === a.mode) fail('NO_CHANGE')
  leg.mode = a.mode
  leg.touched = true
}

export function setLegTimes(
  it: Itinerary,
  _b: Itinerary,
  a: { legId: ID; dep?: LocalTime | null; arr?: LocalTime | null; arrDayOffset?: number | null },
) {
  const leg = getLeg(it, a.legId)
  const set = <K extends 'dep' | 'arr' | 'arrDayOffset'>(k: K, v: (typeof leg)[K] | null | undefined) => {
    if (v === undefined) return
    if (v === null) delete leg[k]
    else leg[k] = v
  }
  set('dep', a.dep)
  set('arr', a.arr)
  set('arrDayOffset', a.arrDayOffset)
  leg.touched = true
}

export function setLegHubs(
  it: Itinerary,
  _b: Itinerary,
  a: { legId: ID; fromHub?: Hub | null; toHub?: Hub | null; via?: Hub[] | null },
) {
  const leg = getLeg(it, a.legId)
  for (const k of ['fromHub', 'toHub', 'via'] as const) {
    const v = a[k]
    if (v === undefined) continue
    if (v === null) delete leg[k]
    else (leg as unknown as Record<string, unknown>)[k] = v
  }
  leg.touched = true
}

export function setLegDuration(it: Itinerary, _b: Itinerary, a: { legId: ID; minutes: number | null }) {
  const leg = getLeg(it, a.legId)
  if (a.minutes === null) delete leg.durationMin
  else {
    if (!Number.isFinite(a.minutes) || a.minutes <= 0) fail('INVALID')
    leg.durationMin = Math.round(a.minutes)
  }
  leg.touched = true
}

/** Noites a bordo (ônibus/voo noturno). `via` diz de onde vem ou para onde vai a noite. */
export function setLegNightsAboard(
  it: Itinerary,
  before: Itinerary,
  a: { legId: ID; nights: number; via: Via },
  ctx: OpContext,
  eff: Effects,
) {
  const leg = getLeg(it, a.legId)
  if (!Number.isInteger(a.nights) || a.nights < 0) fail('INVALID')
  const delta = a.nights - leg.aboard.length
  if (delta === 0) fail('NO_CHANGE')
  if (a.via.kind === 'open') fail('INVALID', { reason: 'open-cannot-donate-here' })
  // Na volta, a noite no avião é "chega no dia seguinte" (arrDayOffset), não uma noite da viagem.
  if (leg.to === 'home') fail('INVALID', { reason: 'home-leg-aboard' })

  // Posição do trecho na lista de paradas: entre `from` e `to`.
  const toIndex = leg.to === 'home' ? it.stops.length : stopIndex(it, leg.to)

  if (a.via.kind === 'stop') {
    if (delta > 0) donate(it, before, a.via.stopId, toIndex - 0.5, delta, eff)
    else {
      // A cidade escolhida recebe as noites na ponta voltada para o trecho.
      const yi = stopIndex(it, a.via.stopId)
      resize(it, before, a.via.stopId, yi < toIndex ? 'end' : 'start', -delta, eff)
    }
  }

  if (delta > 0) {
    leg.aboard = [...leg.aboard, ...Array.from({ length: delta }, () => [])]
  } else {
    const seg = timeline(before).segments.find((s) => s.kind === 'leg' && s.id === leg.id)
    const keep = leg.aboard.length + delta
    const gone = leg.aboard.slice(keep)
    returnPlans(
      gone,
      (ord) => ({ kind: 'leg', legId: leg.id, ordinal: keep + ord }),
      (ord) => {
        const idx = (seg?.startIndex ?? 0) + keep + ord
        return { date: dateAt(before, idx), label: labelAt(before, idx) }
      },
      eff,
    )
    leg.aboard = leg.aboard.slice(0, keep)
  }
  leg.touched = true
  normalize(it, before, eff, ctx)
}

export function addWaypoint(
  it: Itinerary,
  _b: Itinerary,
  a: { legId: ID; visitId: ID; placeId: ID; slot?: Slot; index?: number },
) {
  const leg = getLeg(it, a.legId)
  const visit = { id: a.visitId, placeId: a.placeId, slot: a.slot ?? 'any' }
  const at =
    a.index === undefined ? leg.waypoints.length : Math.max(0, Math.min(leg.waypoints.length, a.index))
  leg.waypoints.splice(at, 0, visit)
  leg.touched = true
}

export function removeWaypoint(it: Itinerary, _b: Itinerary, a: { legId: ID; visitId: ID }) {
  const leg = getLeg(it, a.legId)
  const i = leg.waypoints.findIndex((v) => v.id === a.visitId)
  if (i < 0) fail('NOT_FOUND', { visitId: a.visitId })
  leg.waypoints.splice(i, 1)
}
