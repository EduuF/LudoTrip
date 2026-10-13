import { counterIds } from './build'
import type { BuiltTrip } from './build'
import { dispatch } from '../commands'
import type { Command, DispatchResult } from '../commands'
import type { EngineError } from '../core'
import { days } from '../derive'
import type { ID, ISODate, Itinerary } from '../types'

// Atalhos para os testes do motor.

export const ids = () => counterIds('n')

export function run(it: Itinerary, command: Command, ctx = ids()): Extract<DispatchResult, { ok: true }> {
  const r = dispatch(it, command, ctx)
  if (!r.ok) throw new Error(`${command.type} falhou: ${r.error.code} ${JSON.stringify(r.error.data ?? {})}`)
  return r
}

export function refuse(it: Itinerary, command: Command): EngineError {
  const r = dispatch(it, command, ids())
  if (r.ok) throw new Error(`${command.type} deveria falhar`)
  return r.error
}

/** "tokyo 2 · ginzan 1 · aberto 1" */
export function shape(it: Itinerary): string {
  return it.stops
    .map((s) => `${s.destinationId ? s.destinationId.replace(/^d-/, '') : 'aberto'} ${s.days.length}`)
    .join(' · ')
}

/** Datas em que um item está agendado. */
export function datesOf(trip: BuiltTrip, it: Itinerary, placeName: string): (ISODate | null)[] {
  const pid = trip.placeId(placeName)
  return days(it, trip.places)
    .filter((d) => d.visits.some((v) => v.placeId === pid))
    .map((d) => d.date)
}

export const stopOf = (it: Itinerary, id: ID) => it.stops.find((s) => s.id === id)!
export const legById = (it: Itinerary, id: ID) => it.legs.find((l) => l.id === id)!
