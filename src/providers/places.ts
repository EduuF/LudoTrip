import type { PlaceKind } from '../engine'
import type { BBox } from '../map/frame'
import { countryByIso, fold } from './countries'

// Busca de lugares online pelo Photon (komoot, dados do OpenStreetMap): países, cidades, regiões,
// parques e pontos de interesse. Grátis com volume razoável: espera entre teclas (no componente),
// cache por consulta e tempo limite curto. Sem rede, devolve lista vazia e a lista própria continua.

export const PHOTON_URL = 'https://photon.komoot.io/api/'

export interface OnlinePlace {
  kind: 'country' | 'city' | 'region' | 'park' | 'poi'
  name: string
  /** ISO 3166-1 alpha-2. */
  country?: string
  lat: number
  lon: number
  /** "Kyoto, Japão" · "museu · Kyoto" · "país". */
  detail: string
  /** Só para pontos de interesse: o selo no mapa da cidade. */
  placeKind?: PlaceKind
  bbox?: BBox
}

export interface SearchOpts {
  /** Viés: perto daqui primeiro. */
  lat?: number
  lon?: number
  limit?: number
  signal?: AbortSignal
}

interface PhotonFeature {
  geometry?: { coordinates?: unknown }
  properties?: Record<string, unknown>
}

const cache = new Map<string, OnlinePlace[]>()

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

const POI_LABEL: Record<string, string> = {
  restaurant: 'restaurante',
  cafe: 'café',
  bar: 'bar',
  pub: 'pub',
  fast_food: 'lanche',
  bakery: 'padaria',
  museum: 'museu',
  attraction: 'atração',
  viewpoint: 'mirante',
  temple: 'templo',
  shrine: 'santuário',
  place_of_worship: 'templo',
  castle: 'castelo',
  monument: 'monumento',
  memorial: 'memorial',
  artwork: 'arte',
  zoo: 'zoológico',
  aquarium: 'aquário',
  theme_park: 'parque temático',
  park: 'parque',
  garden: 'jardim',
  beach: 'praia',
  peak: 'pico',
  station: 'estação',
  bus_station: 'rodoviária',
  aerodrome: 'aeroporto',
  hotel: 'hotel',
  hostel: 'hostel',
  guest_house: 'pousada',
  market: 'mercado',
  marketplace: 'mercado',
  supermarket: 'supermercado',
  mall: 'shopping',
  department_store: 'loja',
  theatre: 'teatro',
  cinema: 'cinema',
  stadium: 'estádio',
  university: 'universidade',
}

function poiKind(key: string | undefined, value: string | undefined): PlaceKind {
  const v = value ?? ''
  if (
    key === 'amenity' &&
    ['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'food_court', 'ice_cream', 'biergarten'].includes(v)
  )
    return 'food'
  if (key === 'shop') return 'shop'
  if (
    key === 'tourism' &&
    ['hotel', 'hostel', 'guest_house', 'motel', 'apartment', 'chalet', 'camp_site'].includes(v)
  )
    return 'lodging'
  if (
    key === 'railway' ||
    key === 'aeroway' ||
    key === 'public_transport' ||
    (key === 'highway' && v === 'bus_stop')
  )
    return 'transit'
  if (key === 'natural' || key === 'leisure' || key === 'waterway') return 'nature'
  if (
    key === 'tourism' ||
    key === 'historic' ||
    (key === 'amenity' &&
      ['theatre', 'cinema', 'place_of_worship', 'arts_centre', 'marketplace', 'university'].includes(v)) ||
    (key === 'building' && ['church', 'temple', 'cathedral', 'castle', 'palace'].includes(v))
  )
    return 'sight'
  return 'other'
}

function extent(p: Record<string, unknown>): BBox | undefined {
  const e = p.extent
  if (!Array.isArray(e) || e.length !== 4 || !e.every((x) => typeof x === 'number')) return undefined
  const [w, n, east, s] = e as [number, number, number, number]
  return [w, s, east, n]
}

/** Traduz uma feature do Photon para um lugar nosso; null quando não serve. */
export function toPlace(f: PhotonFeature): OnlinePlace | null {
  const p = f.properties ?? {}
  const c = f.geometry?.coordinates
  if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null
  const [lon, lat] = c as [number, number]
  const name = str(p.name)
  if (!name) return null
  const cc = str(p.countrycode)?.toUpperCase()
  const countryName = countryByIso(cc)?.name ?? str(p.country)
  const type = str(p.type)
  const key = str(p.osm_key)
  const value = str(p.osm_value)
  const bbox = extent(p)
  if (value === 'country' || type === 'country')
    return {
      kind: 'country',
      name: countryByIso(cc)?.name ?? name,
      country: cc,
      lat,
      lon,
      detail: 'país',
      bbox,
    }
  const CITY = [
    'city',
    'town',
    'village',
    'hamlet',
    'municipality',
    'suburb',
    'quarter',
    'neighbourhood',
    'locality',
    'island',
    'islet',
  ]
  if (key === 'place' && CITY.includes(value ?? ''))
    return {
      kind: 'city',
      name,
      country: cc,
      lat,
      lon,
      detail: [str(p.state), countryName].filter(Boolean).join(', ') || 'cidade',
      bbox,
    }
  if (
    (key === 'leisure' && ['park', 'nature_reserve', 'garden'].includes(value ?? '')) ||
    value === 'national_park' ||
    value === 'protected_area'
  )
    return {
      kind: 'park',
      name,
      country: cc,
      lat,
      lon,
      detail: [POI_LABEL[value ?? ''] ?? 'parque', str(p.city) ?? str(p.state)].filter(Boolean).join(' · '),
      placeKind: 'nature',
      bbox,
    }
  if (key === 'boundary' || ['state', 'county', 'district', 'region', 'province'].includes(type ?? ''))
    return { kind: 'region', name, country: cc, lat, lon, detail: countryName ?? 'região', bbox }
  const label = POI_LABEL[value ?? ''] ?? (value ? value.replace(/_/g, ' ') : 'lugar')
  return {
    kind: 'poi',
    name,
    country: cc,
    lat,
    lon,
    detail: [label, str(p.city) ?? str(p.county) ?? str(p.state)].filter(Boolean).join(' · '),
    placeKind: poiKind(key, value),
  }
}

export async function searchOnline(q: string, opts: SearchOpts = {}): Promise<OnlinePlace[]> {
  const t = q.trim()
  if (t.length < 2) return []
  const key = `${fold(t)}|${opts.lat?.toFixed(2) ?? ''}|${opts.lon?.toFixed(2) ?? ''}|${opts.limit ?? 8}`
  const hit = cache.get(key)
  if (hit) return hit
  const u = new URL(PHOTON_URL)
  u.searchParams.set('q', t)
  u.searchParams.set('limit', String(opts.limit ?? 8))
  u.searchParams.set('lang', 'en')
  if (opts.lat !== undefined && opts.lon !== undefined) {
    u.searchParams.set('lat', String(opts.lat))
    u.searchParams.set('lon', String(opts.lon))
  }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 6000)
  opts.signal?.addEventListener('abort', () => ctl.abort())
  try {
    const r = await fetch(u.toString(), { signal: ctl.signal })
    if (!r.ok) return []
    const json = (await r.json()) as { features?: PhotonFeature[] }
    const out = (json.features ?? []).map(toPlace).filter((x): x is OnlinePlace => !!x)
    cache.set(key, out)
    return out
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

/** Para testes. */
export const clearPlacesCache = () => cache.clear()
