import { addDays } from '../dates'
import { allVisits } from '../core'
import type { Command } from '../commands'
import { days, tripRange } from '../derive'
import type { Itinerary, Via } from '../types'
import type { BuiltTrip } from './build'

// Comandos aleatórios (válidos e inválidos) para os testes de propriedade: invariantes do motor
// (spec §16) e convergência da nuvem (spec publicação §7).

export type Step = [number, number, number, number, number]

export const OPS = [
  'setNights',
  'setNights',
  'setNights',
  'moveBoundary',
  'moveBoundary',
  'shiftStop',
  'reorderStop',
  'insertStop',
  'splitStopWith',
  'removeStop',
  'fillOpen',
  'stretchInto',
  'closeOpen',
  'setDestination',
  'removeDay',
  'removeDay',
  'swapDays',
  'setTripStart',
  'setTripEnd',
  'setLock',
  'setLegNightsAboard',
  'setLegMode',
  'setLegTimes',
  'addWaypoint',
  'removeWaypoint',
  'scheduleVisit',
  'scheduleVisit',
  'unscheduleVisit',
  'moveVisit',
  'setTentative',
] as const

export const pick = <T>(list: readonly T[], n: number): T => list[n % list.length]!

/** Transforma números aleatórios num comando que faz sentido para o estado atual (ou quase). */
export function toCommand(it: Itinerary, trip: BuiltTrip, [k, a, b, c, d]: Step, n: number): Command {
  const stop = pick(it.stops, a)
  const other = pick(it.stops, b)
  const dest = pick(trip.destinations, c).id
  const via: Via = pick(
    [{ kind: 'return' }, { kind: 'open' }, { kind: 'stop', stopId: other.id }] as Via[],
    d,
  )
  const nights = 1 + (c % 4)
  const refs = days(it).flatMap((x) => (x.ref ? [x.ref] : []))
  const visits = allVisits(it).filter(
    (v) => !v.where.startsWith('l:') || it.legs.some((l) => v.where.startsWith(`l:${l.id}:`)),
  )
  const leg = pick(it.legs, a)
  const op = pick(OPS, k)
  switch (op) {
    case 'setNights':
      return { type: op, stopId: stop.id, nights: Math.max(0, stop.days.length + (c % 5) - 2), via }
    case 'moveBoundary':
      return { type: op, index: a % Math.max(1, it.stops.length - 1), k: (c % 5) - 2 }
    case 'shiftStop':
      return { type: op, stopId: stop.id, by: (c % 3) - 1 }
    case 'reorderStop':
      return { type: op, stopId: stop.id, toIndex: b % (it.stops.length + 1) }
    case 'insertStop':
      return { type: op, index: b % (it.stops.length + 1), destinationId: dest, nights, via }
    case 'splitStopWith':
      return {
        type: op,
        stopId: stop.id,
        afterOrdinal: 1 + (b % Math.max(1, stop.days.length)),
        destinationId: dest,
        nights,
        via,
      }
    case 'removeStop':
    case 'closeOpen':
      return { type: op, stopId: (it.stops.find((s) => s.destinationId === null && b % 2) ?? stop).id }
    case 'fillOpen':
      return {
        type: op,
        stopId: (it.stops.find((s) => s.destinationId === null) ?? stop).id,
        destinationId: dest,
        ...(d % 2 ? { nights, side: b % 2 ? ('start' as const) : ('end' as const) } : {}),
      }
    case 'stretchInto':
      return {
        type: op,
        stopId: (it.stops.find((s) => s.destinationId === null) ?? stop).id,
        side: d % 2 ? 'before' : 'after',
      }
    case 'setDestination':
      return { type: op, stopId: stop.id, destinationId: dest }
    case 'removeDay':
      return { type: op, stopId: stop.id, ordinal: b % (stop.days.length + 1), via }
    case 'swapDays':
      return { type: op, stopId: stop.id, a: b % stop.days.length, b: c % stop.days.length }
    case 'setTripStart':
      return {
        type: op,
        date: pick([null, '2030-04-01', '2030-12-30', it.start ? addDays(it.start, 1) : '2031-02-28'], c),
      }
    case 'setTripEnd': {
      const end = tripRange(it).end ?? '2030-01-01'
      const delta = (c % 5) - 2
      const takeFrom =
        delta < 0 ? [{ stopId: stop.id, nights: -delta }] : d % 2 ? [{ stopId: other.id, nights: 0 }] : []
      return { type: op, date: addDays(end, delta), takeFrom }
    }
    case 'setLock':
      return { type: op, lock: it.lock === 'fixed' ? 'free' : 'fixed' }
    case 'setLegNightsAboard':
      return { type: op, legId: leg.id, nights: c % 3, via }
    case 'setLegMode':
      return {
        type: op,
        legId: leg.id,
        mode: pick(['flight', 'train', 'bus', 'car', 'boat', 'walk'] as const, c),
      }
    case 'setLegTimes':
      return { type: op, legId: leg.id, dep: '06:12', arr: c % 2 ? '09:40' : null }
    case 'addWaypoint':
      return { type: op, legId: leg.id, visitId: `g${n}`, placeId: pick(trip.places, c).id }
    case 'removeWaypoint':
      return { type: op, legId: leg.id, visitId: leg.waypoints[0]?.id ?? 'nada' }
    case 'scheduleVisit':
      return {
        type: op,
        visitId: `g${n}`,
        placeId: pick(trip.places, c).id,
        day: refs.length ? pick(refs, b) : { kind: 'departure' },
      }
    case 'unscheduleVisit':
      return { type: op, visitId: visits.length ? pick(visits, b).visit.id : 'nada' }
    case 'moveVisit':
      return {
        type: op,
        visitId: visits.length ? pick(visits, b).visit.id : 'nada',
        to: refs.length ? pick(refs, c) : { kind: 'departure' },
      }
    case 'setTentative':
      return { type: op, stopId: stop.id, tentative: d % 2 === 0 }
  }
}
