import { fail, findVisit, planAt } from '../core'
import type { DayRef, ID, Itinerary, LocalTime, Slot, Visit } from '../types'

/** Agenda um item da mochila num dia. O mesmo item pode estar em vários dias. */
export function scheduleVisit(
  it: Itinerary,
  _b: Itinerary,
  a: { visitId: ID; placeId: ID; day: DayRef; slot?: Slot; index?: number },
) {
  if (findVisit(it, a.visitId)) fail('INVALID', { reason: 'duplicate-visit-id' })
  const plan = planAt(it, a.day)
  const visit: Visit = { id: a.visitId, placeId: a.placeId, slot: a.slot ?? 'any' }
  const at = a.index === undefined ? plan.length : Math.max(0, Math.min(plan.length, a.index))
  plan.splice(at, 0, visit)
}

export function unscheduleVisit(it: Itinerary, _b: Itinerary, a: { visitId: ID }) {
  const found = findVisit(it, a.visitId)
  if (!found) fail('NOT_FOUND', { visitId: a.visitId })
  found!.list.splice(found!.index, 1)
}

export function moveVisit(it: Itinerary, _b: Itinerary, a: { visitId: ID; to: DayRef; index?: number }) {
  const found = findVisit(it, a.visitId)
  if (!found) fail('NOT_FOUND', { visitId: a.visitId })
  const target = planAt(it, a.to)
  const [visit] = found!.list.splice(found!.index, 1)
  const at = a.index === undefined ? target.length : Math.max(0, Math.min(target.length, a.index))
  target.splice(at, 0, visit!)
}

export function setVisitMeta(
  it: Itinerary,
  _b: Itinerary,
  a: {
    visitId: ID
    slot?: Slot
    time?: LocalTime | null
    note?: string | null
    visited?: boolean
    participants?: ID[] | null
  },
) {
  const found = findVisit(it, a.visitId)
  if (!found) fail('NOT_FOUND', { visitId: a.visitId })
  const v = found!.list[found!.index]!
  if (a.slot) v.slot = a.slot
  for (const k of ['time', 'note', 'participants'] as const) {
    const val = a[k]
    if (val === undefined) continue
    if (val === null) delete v[k]
    else (v as unknown as Record<string, unknown>)[k] = val
  }
  if (a.visited !== undefined) {
    if (a.visited) v.visited = true
    else delete v.visited
  }
}
