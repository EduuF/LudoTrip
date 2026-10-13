import { emptyEffects, normalize } from '../core'
import type { OpContext } from '../core'
import type {
  Booking,
  Destination,
  ID,
  ISODate,
  Itinerary,
  Leg,
  LegMode,
  Lock,
  Lodging,
  Place,
  Rarity,
  Resource,
} from '../types'

/** Gerador de ids previsível para testes e exemplos. */
export function counterIds(prefix = 'id'): OpContext {
  let n = 0
  return { newId: () => `${prefix}${++n}` }
}

export interface TripSpec {
  name: string
  start: ISODate | null
  lock: Lock
  defaultMode: LegMode
  home?: { name: string; lat?: number; lon?: number; tz?: string }
  destinations: Record<string, Omit<Destination, 'id' | 'kind'> & { kind?: Destination['kind'] }>
  /** [chave do destino, noites, planos por dia (nomes de itens), pouso?] */
  stops: [string | null, number, string[][]?, Lodging?][]
  /** Itens da mochila por destino: [nome, raridade]. */
  places: Record<string, [string, Rarity][]>
  /** Modo de trechos específicos: [de, para, modo] usando chaves de destino ou "home". */
  legModes?: [string, string, LegMode][]
  bookings?: (
    | { kind: 'lodging'; title: string; dest: string; checkin: ISODate; checkout: ISODate }
    | { kind: 'transport'; title: string; from: string; to: string; date: ISODate; mode: LegMode }
  )[]
  resources?: Omit<Resource, 'id'>[]
}

export interface BuiltTrip {
  name: string
  itinerary: Itinerary
  destinations: Destination[]
  places: Place[]
  bookings: Booking[]
  /** Ajuda os testes: chave do destino → id. */
  destId: (key: string) => ID
  placeId: (name: string) => ID
}

export function buildTrip(spec: TripSpec): BuiltTrip {
  const ctx = counterIds('x')
  const destinations: Destination[] = Object.entries(spec.destinations).map(([key, d]) => ({
    ...d,
    id: `d-${key}`,
    kind: d.kind ?? 'city',
  }))
  const destId = (key: string): ID => {
    const d = destinations.find((x) => x.id === `d-${key}`)
    if (!d) throw new Error(`destino desconhecido na fixture: ${key}`)
    return d.id
  }
  const places: Place[] = []
  for (const [key, list] of Object.entries(spec.places)) {
    list.forEach(([name, rarity], i) =>
      places.push({ id: `p-${key}-${i + 1}`, destinationId: destId(key), name, rarity }),
    )
  }
  const placeId = (name: string): ID => {
    const p = places.find((x) => x.name === name)
    if (!p) throw new Error(`item desconhecido na fixture: ${name}`)
    return p.id
  }
  let visitN = 0
  const it: Itinerary = {
    version: 0,
    start: spec.start,
    lock: spec.lock,
    defaultMode: spec.defaultMode,
    pace: 'normal',
    travelers: [
      { id: 't1', name: 'Viajante 1' },
      { id: 't2', name: 'Viajante 2' },
    ],
    ...(spec.home ? { home: spec.home } : {}),
    stops: spec.stops.map(([key, nights, plans, lodging], i) => ({
      id: `s${i + 1}`,
      destinationId: key === null ? null : destId(key),
      days: Array.from({ length: nights }, (_, d) =>
        (plans?.[d] ?? []).map((name) => ({
          id: `v${++visitN}`,
          placeId: placeId(name),
          slot: 'any' as const,
        })),
      ),
      lodging: lodging ?? 'hotel',
    })),
    legs: [],
    archivedLegs: [],
    departurePlan: [],
    resources: (spec.resources ?? []).map((r, i) => ({ ...r, id: `r${i + 1}` })),
    anchors: [],
    returned: [],
  }
  normalize(it, structuredClone(it), emptyEffects(), ctx)
  // Ids estáveis para os trechos: "L:<de>><para>" com as chaves dos destinos.
  const keyOf = (stopOrHome: ID | 'home'): string => {
    if (stopOrHome === 'home') return 'home'
    const d = it.stops.find((s) => s.id === stopOrHome)?.destinationId
    return d ? d.replace(/^d-/, '') : 'aberto'
  }
  const seen = new Map<string, number>()
  it.legs = it.legs.map((l: Leg) => {
    const base = `L:${keyOf(l.from)}>${keyOf(l.to)}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return { ...l, id: n > 1 ? `${base}#${n}` : base }
  })
  for (const [from, to, mode] of spec.legModes ?? []) {
    for (const l of it.legs)
      if (keyOf(l.from) === from && keyOf(l.to) === to) {
        l.mode = mode
        l.touched = true
      }
  }
  const bookings: Booking[] = (spec.bookings ?? []).map((b, i) =>
    b.kind === 'lodging'
      ? {
          id: `b${i + 1}`,
          kind: 'lodging',
          title: b.title,
          destinationId: destId(b.dest),
          checkin: b.checkin,
          checkout: b.checkout,
          status: 'booked',
        }
      : {
          id: `b${i + 1}`,
          kind: 'transport',
          title: b.title,
          fromDestinationId: b.from === 'home' ? 'home' : destId(b.from),
          toDestinationId: b.to === 'home' ? 'home' : destId(b.to),
          date: b.date,
          mode: b.mode,
          status: 'booked',
        },
  )
  return { name: spec.name, itinerary: it, destinations, places, bookings, destId, placeId }
}
