import { diffDays, isISODate, addDays } from '../dates'
import {
  fail,
  getStop,
  isOpen,
  newStop,
  nightsOf,
  normalize,
  resize,
  returnDays,
  stopIndex,
  totalNights,
} from '../core'
import type { Effects, OpContext } from '../core'
import type { ID, ISODate, Itinerary, Lock, Via } from '../types'
import { removeStop } from './structure'

/** Remove um dia específico. O buraco fecha pelo lado de `via` (spec §14). */
export function removeDay(
  it: Itinerary,
  before: Itinerary,
  a: { stopId: ID; ordinal: number; via: Via },
  ctx: OpContext,
  eff: Effects,
) {
  const x = getStop(it, a.stopId)
  if (isOpen(x)) fail('INVALID', { reason: 'open-has-no-days' })
  if (!Number.isInteger(a.ordinal) || a.ordinal < 0 || a.ordinal >= nightsOf(x))
    fail('OUT_OF_RANGE', { stopId: x.id, ordinal: a.ordinal })
  if (nightsOf(x) === 1) return removeStop(it, before, { stopId: x.id }, ctx, eff)

  returnDays(it, before, x.id, [a.ordinal], eff)
  x.days.splice(a.ordinal, 1)
  if (a.via.kind === 'open') {
    it.stops.splice(stopIndex(it, x.id) + 1, 0, newStop(ctx, null, 1))
  } else if (a.via.kind === 'stop') {
    const y = getStop(it, a.via.stopId)
    if (y.id === x.id) fail('SAME_STOP')
    const yAfter = stopIndex(it, y.id) > stopIndex(it, x.id)
    resize(it, before, y.id, yAfter ? 'start' : 'end', 1, eff)
  }
  normalize(it, before, eff, ctx)
}

export function swapDays(it: Itinerary, _before: Itinerary, a: { stopId: ID; a: number; b: number }) {
  const x = getStop(it, a.stopId)
  if (isOpen(x)) fail('INVALID', { reason: 'open-has-no-days' })
  const n = nightsOf(x)
  if (![a.a, a.b].every((o) => Number.isInteger(o) && o >= 0 && o < n)) fail('OUT_OF_RANGE', { stopId: x.id })
  if (a.a === a.b) fail('NO_CHANGE')
  const tmp = x.days[a.a]!
  x.days[a.a] = x.days[a.b]!
  x.days[a.b] = tmp
}

export function setTripStart(it: Itinerary, _before: Itinerary, a: { date: ISODate | null }) {
  if (a.date !== null && !isISODate(a.date)) fail('INVALID_DATE', { date: a.date })
  if (a.date === it.start) fail('NO_CHANGE')
  it.start = a.date
}

/** Muda a data de volta. Encurtar exige dizer de quais cidades sair (`takeFrom`). */
export function setTripEnd(
  it: Itinerary,
  before: Itinerary,
  a: { date: ISODate; takeFrom: { stopId: ID; nights: number }[] },
  ctx: OpContext,
  eff: Effects,
) {
  if (!it.start) fail('NO_START')
  if (!isISODate(a.date)) fail('INVALID_DATE', { date: a.date })
  const currentEnd = addDays(it.start!, totalNights(it))
  const delta = diffDays(currentEnd, a.date)
  if (delta === 0) fail('NO_CHANGE')
  if (delta > 0) {
    const target = a.takeFrom[0]?.stopId ?? it.stops[it.stops.length - 1]!.id
    resize(it, before, target, 'end', delta, eff)
  } else {
    const sum = a.takeFrom.reduce((s, t) => s + t.nights, 0)
    if (sum !== -delta) fail('TAKE_FROM_MISMATCH', { needed: -delta })
    for (const t of a.takeFrom) {
      if (!Number.isInteger(t.nights) || t.nights < 0) fail('INVALID')
      if (nightsOf(getStop(it, t.stopId)) - t.nights < 1)
        fail('DONOR_TOO_SHORT', { donorId: t.stopId, max: nightsOf(getStop(it, t.stopId)) - 1 })
      resize(it, before, t.stopId, 'end', -t.nights, eff)
    }
  }
  normalize(it, before, eff, ctx)
}

export function setLock(it: Itinerary, _before: Itinerary, a: { lock: Lock }) {
  if (it.lock === a.lock) fail('NO_CHANGE')
  it.lock = a.lock
}
