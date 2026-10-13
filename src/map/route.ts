import { days as allDays } from '../engine'
import type { ID } from '../engine'
import type { TripDoc } from '../app/doc'

// Onde o grupo está em cada dia da viagem (v1 "barra de dias"): num destino, no meio de um trecho
// (noite a bordo) ou a caminho de casa. Função pura; a camada do mapa transforma isso em posição.

export type Pos =
  { kind: 'at'; destId: ID; stopId: ID } | { kind: 'leg'; from: ID | 'home'; to: ID | 'home'; t: number }

/** Posição no dia `index` (índice em `days()`). Null quando não há destino com lugar no mapa. */
export function travelersAt(doc: TripDoc, index: number): Pos | null {
  const it = doc.itinerary
  const ds = allDays(it, doc.places)
  if (!ds.length) return null
  const d = ds[Math.max(0, Math.min(ds.length - 1, index))]!
  const located = (id: ID | null | undefined): ID | null => {
    const x = id ? doc.destinations.find((z) => z.id === id) : undefined
    return x && x.lat !== undefined && x.lon !== undefined ? x.id : null
  }
  const stopLocated = (stopId: ID | 'home') =>
    stopId === 'home' || located(it.stops.find((s) => s.id === stopId)?.destinationId)

  if (d.kind === 'stop' && d.stopId && located(d.destinationId))
    return { kind: 'at', destId: d.destinationId!, stopId: d.stopId }
  if (d.kind === 'aboard' && d.legId) {
    const leg = it.legs.find((l) => l.id === d.legId)
    if (leg && stopLocated(leg.from) && stopLocated(leg.to))
      return { kind: 'leg', from: leg.from, to: leg.to, t: 0.5 }
  }
  if (d.kind === 'departure') {
    const last = [...it.stops].reverse().find((s) => located(s.destinationId))
    if (last) return { kind: 'leg', from: last.id, to: 'home', t: 0.5 }
  }
  // Noites em aberto, ou destino sem lugar no mapa: o grupo fica onde estava.
  for (let i = d.index - 1; i >= 0; i--) {
    const p = ds[i]
    if (p?.kind === 'stop' && p.stopId && located(p.destinationId))
      return { kind: 'at', destId: p.destinationId!, stopId: p.stopId }
  }
  return null
}
