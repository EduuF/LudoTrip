import type { BBox } from '../engine'
import { countryByIso } from '../providers/countries'
import type { TripDoc } from './doc'

// Onde é a viagem, calculado das paradas (spec 2026-10-15 §4): países, nome e caixa de reserva do mapa.
// Substitui o antigo `doc.scope`, que só as viagens criadas antes de 15/10/2026 têm (último recurso).

export interface AreaItem {
  name: string
  localName?: string
  /** ISO 3166-1 alpha-2. */
  country?: string
}

export interface TripArea {
  /** ISO2 dos destinos e das noites em aberto, na ordem das paradas, sem repetir. */
  countries: string[]
  /** Paleta e decoração do mapa. */
  mainCountry?: string
  /** "Japão", "Paris", "França e Itália": o nome padrão da viagem. */
  label: string
  /** O mesmo na escrita local, para a marca-d'água do mapa. */
  localLabel: string
}

/** Os lugares da viagem na ordem das paradas: cada destino e cada país das noites em aberto, uma vez. */
export function areaItems(doc: TripDoc): AreaItem[] {
  const out: AreaItem[] = []
  const seen = new Set<string>()
  for (const s of doc.itinerary.stops) {
    if (s.destinationId) {
      const d = doc.destinations.find((x) => x.id === s.destinationId)
      if (!d || seen.has(d.id)) continue
      seen.add(d.id)
      out.push({
        name: d.name,
        ...(d.localName ? { localName: d.localName } : {}),
        ...(d.country ? { country: d.country } : {}),
      })
    } else if (s.openIn && !seen.has(`open:${s.openIn.country}`)) {
      seen.add(`open:${s.openIn.country}`)
      out.push({
        name: s.openIn.name,
        ...(s.openIn.localName ? { localName: s.openIn.localName } : {}),
        country: s.openIn.country,
      })
    }
  }
  return out
}

const join = (names: string[]): string =>
  names.length <= 1
    ? (names[0] ?? '')
    : names.length === 2
      ? `${names[0]} e ${names[1]}`
      : `${names[0]}, ${names[1]}…`

/** Um lugar: o nome dele; um país: o país; dois países: "França e Itália"; três ou mais: "França, Itália…". */
export function areaLabel(items: AreaItem[], local = false): string {
  const nameOf = (x: { name: string; localName?: string }) => (local ? (x.localName ?? x.name) : x.name)
  if (items.length === 1) return nameOf(items[0]!)
  const countries = [...new Set(items.flatMap((x) => (x.country ? [x.country] : [])))]
  if (!countries.length) return join(items.map(nameOf))
  return join(
    countries.map((iso) => {
      const c = countryByIso(iso)
      return nameOf(c ?? items.find((x) => x.country === iso)!)
    }),
  )
}

export function tripArea(doc: TripDoc): TripArea {
  const items = areaItems(doc)
  const countries = [...new Set(items.flatMap((x) => (x.country ? [x.country] : [])))]
  const mainCountry = countries[0] ?? doc.scope?.country
  if (!items.length) {
    const name = doc.scope?.name ?? 'sua viagem'
    return {
      countries,
      ...(mainCountry ? { mainCountry } : {}),
      label: name,
      localLabel: doc.scope?.localName ?? name,
    }
  }
  return {
    countries,
    ...(mainCountry ? { mainCountry } : {}),
    label: areaLabel(items),
    localLabel: areaLabel(items, true),
  }
}

/**
 * Caixa do mapa quando nenhum destino tem lugar no mapa: a soma dos países das noites em aberto, ou o
 * escopo das viagens antigas (a caixa, ou um raio em volta da cidade).
 */
export function fallbackBox(doc: TripDoc): BBox | null {
  const boxes = doc.itinerary.stops.flatMap((s) =>
    !s.destinationId && s.openIn?.bbox ? [s.openIn.bbox] : [],
  )
  if (boxes.length)
    return [
      Math.min(...boxes.map((b) => b[0])),
      Math.min(...boxes.map((b) => b[1])),
      Math.max(...boxes.map((b) => b[2])),
      Math.max(...boxes.map((b) => b[3])),
    ]
  const sc = doc.scope
  if (sc?.bbox) return sc.bbox
  if (sc?.lat !== undefined && sc.lon !== undefined)
    return [sc.lon - 0.12, sc.lat - 0.1, sc.lon + 0.12, sc.lat + 0.1]
  return null
}
