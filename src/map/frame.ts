import { placeStates } from '../engine'
import type { BBox, ID } from '../engine'
import type { TripDoc } from '../app/doc'
import { fallbackBox, openCenters } from '../app/area'

// Enquadramento do mapa (spec §8): só os destinos da viagem (paradas e bate-voltas), nunca a casa.
// Sem nenhum destino localizado, vale o país das noites em aberto ou o escopo antigo (`fallbackBox`). Funções puras.

export type Level = 'city' | 'region' | 'country' | 'world'

export type { BBox }

export interface FramePoint {
  destId: ID
  lon: number
  lat: number
  /** Bate-volta (sem noites), ligado a uma parada. */
  dayTrip: boolean
}

export interface Frame {
  /** Já com folga nas bordas. */
  bbox: BBox
  level: Level
  points: FramePoint[]
}

const KM_PER_DEG = 111

/** Diagonal aproximada da caixa, em km. */
export function spanKm([w, s, e, n]: BBox): number {
  const mid = ((s + n) / 2) * (Math.PI / 180)
  return Math.hypot((e - w) * Math.cos(mid) * KM_PER_DEG, (n - s) * KM_PER_DEG)
}

/** Nível pela extensão: cidade, região, país ou mundo. */
export function levelOf(bbox: BBox): Level {
  const km = spanKm(bbox)
  return km < 50 ? 'city' : km < 400 ? 'region' : km < 4000 ? 'country' : 'world'
}

/** Destinos localizados das paradas (na ordem) e os bate-voltas com atividade marcada. */
export function framePoints(doc: TripDoc): FramePoint[] {
  const it = doc.itinerary
  const byId = new Map(doc.destinations.map((d) => [d.id, d]))
  const located = (id: ID | null) => {
    const d = id ? byId.get(id) : undefined
    return d && d.lat !== undefined && d.lon !== undefined ? d : null
  }
  const out: FramePoint[] = []
  const seen = new Set<ID>()
  for (const s of it.stops) {
    const d = located(s.destinationId)
    if (!d || seen.has(d.id)) continue
    seen.add(d.id)
    out.push({ destId: d.id, lon: d.lon!, lat: d.lat!, dayTrip: false })
  }
  const states = placeStates(it, doc.places)
  for (const d of doc.destinations) {
    if (seen.has(d.id) || !located(d.id)) continue
    if (!doc.places.some((p) => p.destinationId === d.id && states.get(p.id)?.days.length)) continue
    seen.add(d.id)
    out.push({ destId: d.id, lon: d.lon!, lat: d.lat!, dayTrip: true })
  }
  return out
}

/** Folga nas bordas e um tamanho mínimo (uma cidade só não vira um ponto). */
export function pad(raw: BBox, ratio = 0.18, minW = 0.08, minH = 0.06): BBox {
  let [w, s, e, n] = raw
  if (e - w < minW) {
    const c = (w + e) / 2
    w = c - minW / 2
    e = c + minW / 2
  }
  if (n - s < minH) {
    const c = (s + n) / 2
    s = c - minH / 2
    n = c + minH / 2
  }
  const pw = (e - w) * ratio
  const ph = (n - s) * ratio
  return [w - pw, Math.max(-85, s - ph), e + pw, Math.min(85, n + ph)]
}

export function bboxOf(points: { lon: number; lat: number }[]): BBox {
  const lons = points.map((p) => p.lon)
  const lats = points.map((p) => p.lat)
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
}

export function frame(doc: TripDoc): Frame | null {
  const points = framePoints(doc)
  // As fases tracejadas (noites em aberto num país) também ficam à vista.
  const raw: BBox | null = points.length ? bboxOf([...points, ...openCenters(doc)]) : fallbackBox(doc)
  if (!raw) return null
  const bbox = pad(raw)
  return { bbox, level: levelOf(bbox), points }
}

/** Caixa dos lugares de um destino (atividades com coordenadas), para "entrar na cidade". */
export function cityFrame(doc: TripDoc, destId: ID): BBox | null {
  const d = doc.destinations.find((x) => x.id === destId)
  const pts = doc.places
    .filter((p) => p.destinationId === destId && p.lat !== undefined && p.lon !== undefined)
    .map((p) => ({ lon: p.lon!, lat: p.lat! }))
  if (d?.lat !== undefined && d.lon !== undefined) pts.push({ lon: d.lon, lat: d.lat })
  if (!pts.length) return null
  // Mínimo de ~3 km para a cidade não virar um ponto.
  return pad(bboxOf(pts), 0.22, 0.04, 0.03)
}
