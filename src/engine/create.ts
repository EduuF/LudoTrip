import { emptyEffects, normalize } from './core'
import type { OpContext } from './core'
import type { ID, ISODate, Itinerary, LegMode, Lock, Traveler } from './types'

export interface NewTripSpec {
  /** Destinos na ordem da viagem (podem repetir); `null` = noites em aberto ("decido depois"). */
  destinationIds: (ID | null)[]
  nights: number
  start: ISODate | null
  defaultMode: LegMode
  /** Meio da ida e da volta (ex.: avião quando a casa é longe). */
  homeMode?: LegMode
  lock?: Lock
  travelers: Traveler[]
  home?: Itinerary['home']
}

/** Monta um itinerário novo: as noites se dividem igualmente e o resto vai para as primeiras cidades. */
export function createItinerary(spec: NewTripSpec, ctx: OpContext): Itinerary {
  const n = spec.destinationIds.length
  const total = Math.max(spec.nights, n || 1)
  const base = n ? Math.floor(total / n) : total
  const extra = n ? total % n : 0
  const it: Itinerary = {
    version: 0,
    start: spec.start,
    lock: spec.lock ?? 'free',
    defaultMode: spec.defaultMode,
    pace: 'normal',
    travelers: spec.travelers,
    ...(spec.home ? { home: spec.home } : {}),
    stops: (n ? spec.destinationIds : [null]).map((destinationId, i) => ({
      id: ctx.newId(),
      destinationId,
      days: Array.from({ length: n ? base + (i < extra ? 1 : 0) : total }, () => []),
      lodging: 'hotel' as const,
    })),
    legs: [],
    archivedLegs: [],
    departurePlan: [],
    resources: [],
    anchors: [],
    returned: [],
  }
  normalize(it, structuredClone(it), emptyEffects(), ctx)
  if (spec.homeMode) for (const l of it.legs) if (l.from === 'home' || l.to === 'home') l.mode = spec.homeMode
  return it
}
