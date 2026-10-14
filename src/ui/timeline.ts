import type { Day, ID, Stop } from '../engine'
import { cityName } from '../app/choices'
import { fold } from '../providers/countries'

// As contas da linha do tempo (spec §17.10), fora do componente.

/** A partir de quantos destinos aparece a busca. */
export const SEARCH_FROM = 9

export const norm = fold

/** "no começo", "entre Roma e Siena", "no fim" (a fresta `i` fica antes da parada `i`). */
export function gapText(stops: Stop[], i: number): string {
  const a = stops[i - 1]
  const b = stops[i]
  if (!a) return 'no começo da viagem'
  if (!b) return 'no fim da viagem'
  return `entre ${cityName(a.id)} e ${cityName(b.id)}`
}

export interface Group {
  key: string
  stopId: ID | null
  destinationId: ID | null
  days: Day[]
}

/** Agrupa os dias planejáveis pelo destino onde caem (a bordo vai com o destino de chegada; a volta, com o último). */
export function dayGroups(ds: Day[], stops: Stop[]): Group[] {
  const out: Group[] = []
  for (const d of ds) {
    if (!d.ref) continue
    const last = out[out.length - 1]
    const stopId =
      d.kind === 'departure'
        ? (last?.stopId ?? null)
        : d.kind === 'aboard'
          ? (ds.find((x) => x.index > d.index && x.kind === 'stop')?.stopId ?? last?.stopId ?? null)
          : d.stopId
    if (last && last.stopId === stopId) last.days.push(d)
    else
      out.push({
        key: `${stopId}-${d.index}`,
        stopId,
        destinationId: stops.find((x) => x.id === stopId)?.destinationId ?? null,
        days: [d],
      })
  }
  return out
}
