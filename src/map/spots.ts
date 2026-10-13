import { days as allDays, placeStates } from '../engine'
import type { Day, ID, Place } from '../engine'
import type { TripDoc } from '../app/doc'

// Os lugares de um destino no mapa da cidade (spec §8 e v1): atividades com coordenadas, a trilha de
// cada dia (na ordem dos turnos) e o que ainda não tem lugar no mapa. Funções puras.

export interface Spot {
  place: Place
  lon: number
  lat: number
  /** Índices dos dias em que está marcada. */
  days: number[]
  visited: boolean
}

export interface DayTrail {
  dayIndex: number
  label: string
  /** Posição entre as trilhas da cidade (dá a cor). */
  ordinal: number
  /** Ids dos lugares, na ordem do dia. */
  spots: ID[]
}

export interface CitySpots {
  spots: Spot[]
  trails: DayTrail[]
  /** Atividades do destino sem coordenadas. */
  unplaced: Place[]
  /** Dias dormindo neste destino. */
  cityDays: Day[]
}

const SLOT_ORDER = { morning: 0, afternoon: 1, evening: 2, any: 3 } as const

/** Cores das trilhas por dia (a mesma paleta dos destinos, em outra ordem). */
export const DAY_COLORS = [
  'var(--beni)',
  'var(--ai)',
  'var(--matcha)',
  'var(--gold)',
  '#8a6fb0',
  '#2f8f8a',
  '#c77b3a',
  'var(--sakura)',
]

export function citySpots(doc: TripDoc, destId: ID): CitySpots {
  const it = doc.itinerary
  const ds = allDays(it, doc.places)
  const cityDays = ds.filter((d) => d.destinationId === destId)
  const mine = doc.places.filter((p) => p.destinationId === destId)
  const located = mine.filter((p) => p.lat !== undefined && p.lon !== undefined)
  const ids = new Set(located.map((p) => p.id))
  const byPlace = new Map<ID, number[]>()
  const trails: DayTrail[] = []
  for (const d of ds) {
    const vs = d.visits
      .filter((v) => ids.has(v.placeId))
      .sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot] || (a.time ?? '').localeCompare(b.time ?? ''))
    if (!vs.length) continue
    for (const v of vs) byPlace.set(v.placeId, [...(byPlace.get(v.placeId) ?? []), d.index])
    trails.push({
      dayIndex: d.index,
      label: d.label,
      ordinal: trails.length,
      spots: vs.map((v) => v.placeId),
    })
  }
  const states = placeStates(it, doc.places)
  const spots: Spot[] = located.map((p) => ({
    place: p,
    lon: p.lon!,
    lat: p.lat!,
    days: byPlace.get(p.id) ?? [],
    visited: !!states.get(p.id)?.visited,
  }))
  return { spots, trails, unplaced: mine.filter((p) => !ids.has(p.id)), cityDays }
}
