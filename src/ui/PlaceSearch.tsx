import { useEffect, useState } from 'react'
import { searchCities } from '../providers/cities'
import { countryByIso, fold, searchCountries } from '../providers/countries'
import { searchOnline } from '../providers/places'
import type { OnlinePlace } from '../providers/places'

// Busca de lugares compartilhada por "Criar viagem" e "+ Destino": países e cidades da lista própria
// (na hora, sem internet) e, com rede, o mundo todo pelo Photon (OpenStreetMap) depois de uma pausa.

export type PlacePick =
  | { kind: 'country'; name: string; localName?: string; country: string; id: string }
  | {
      kind: 'city'
      name: string
      localName?: string
      country?: string
      lat?: number
      lon?: number
      tz?: string
      /** Região ou parque entram como destino de outro tipo. */
      destKind?: 'city' | 'region' | 'park'
    }

export function PlaceSearch({
  id,
  placeholder,
  kinds,
  within,
  exclude,
  onPick,
  free = true,
  online = true,
  bias,
}: {
  id: string
  placeholder: string
  /** O que pode ser escolhido. */
  kinds: ('country' | 'city')[]
  /** ISO2 do país da viagem: as cidades dele vêm primeiro. */
  within?: string
  /** Nomes já escolhidos (não aparecem de novo). */
  exclude?: string[]
  onPick: (p: PlacePick) => void
  /** Permite "Usar 'xxx'" sem lugar no mapa. */
  free?: boolean
  /** Busca online (Photon) depois de 3 letras e uma pausa. */
  online?: boolean
  /** Perto daqui primeiro. */
  bias?: { lat: number; lon: number }
}) {
  const [q, setQ] = useState('')
  const [web, setWeb] = useState<OnlinePlace[]>([])
  const [busy, setBusy] = useState(false)
  const t = q.trim()
  const ex = new Set((exclude ?? []).map(fold))

  const biasLat = bias?.lat
  const biasLon = bias?.lon
  useEffect(() => {
    if (!online || t.length < 3) {
      setWeb([])
      setBusy(false)
      return
    }
    const ctl = new AbortController()
    setBusy(true)
    const timer = setTimeout(() => {
      void searchOnline(t, {
        ...(biasLat !== undefined && biasLon !== undefined ? { lat: biasLat, lon: biasLon } : {}),
        limit: 8,
        signal: ctl.signal,
      }).then((r) => {
        if (ctl.signal.aborted) return
        setWeb(r)
        setBusy(false)
      })
    }, 300)
    return () => {
      clearTimeout(timer)
      ctl.abort()
    }
  }, [t, online, biasLat, biasLon])

  const countries = kinds.includes('country') ? searchCountries(t).filter((c) => !ex.has(fold(c.name))) : []
  const cities = kinds.includes('city') ? searchCities(t).filter((c) => !ex.has(fold(c.name))) : []
  const sorted = within
    ? [...cities].sort((a, b) => Number(b.country === within) - Number(a.country === within))
    : cities
  const seen = new Set([
    ...countries.map((c) => `${fold(c.name)}|${c.iso2}`),
    ...cities.map((c) => `${fold(c.name)}|${c.country}`),
  ])
  const fromWeb = web.filter((o) => {
    if (o.kind === 'poi') return false
    if (o.kind === 'country' ? !kinds.includes('country') : !kinds.includes('city')) return false
    if (ex.has(fold(o.name))) return false
    const key = `${fold(o.name)}|${o.country ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const pick = (p: PlacePick) => {
    onPick(p)
    setQ('')
  }
  const pickWeb = (o: OnlinePlace) => {
    if (o.kind === 'country') {
      const c = o.country ? countryByIso(o.country) : undefined
      if (!c) return
      return pick({
        kind: 'country',
        name: c.name,
        ...(c.localName ? { localName: c.localName } : {}),
        country: c.iso2,
        id: c.id,
      })
    }
    pick({
      kind: 'city',
      name: o.name,
      ...(o.country ? { country: o.country } : {}),
      lat: o.lat,
      lon: o.lon,
      destKind: o.kind === 'region' ? 'region' : o.kind === 'park' ? 'park' : 'city',
    })
  }

  return (
    <>
      <input
        className="input"
        id={id}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {t.length >= 2 ? (
        <div className="suggest">
          {countries.map((c) => (
            <button
              key={`c-${c.iso2}`}
              type="button"
              onClick={() =>
                pick({
                  kind: 'country',
                  name: c.name,
                  ...(c.localName ? { localName: c.localName } : {}),
                  country: c.iso2,
                  id: c.id,
                })
              }
            >
              <span>{c.name}</span>
              <small>{c.localName ? `${c.localName} · país` : 'país'}</small>
            </button>
          ))}
          {sorted.slice(0, 6).map((c) => (
            <button key={`t-${c.name}`} type="button" onClick={() => pick({ kind: 'city', ...c })}>
              <span>{c.name}</span>
              <small>
                {c.localName && c.localName !== c.name
                  ? c.localName
                  : (countryByIso(c.country)?.name ?? c.country)}
              </small>
            </button>
          ))}
          {fromWeb.slice(0, 6).map((o) => (
            <button key={`w-${o.kind}-${o.name}-${o.lat}`} type="button" onClick={() => pickWeb(o)}>
              <span>{o.name}</span>
              <small>{o.detail} · online</small>
            </button>
          ))}
          {busy ? (
            <div className="suggest-note" role="status">
              buscando no mundo todo…
            </div>
          ) : null}
          {free ? (
            <button type="button" onClick={() => pick({ kind: 'city', name: t })}>
              <span>Usar "{t}"</span>
              <small>sem lugar no mapa</small>
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
