import { useState } from 'react'
import { searchCities } from '../providers/cities'
import { countryByIso, searchCountries } from '../providers/countries'

// Busca de lugares compartilhada por "Criar viagem" e "+ Destino": países e cidades da lista própria
// (sem internet). A busca online (Photon) entra por aqui na fase B.

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
    }

export function PlaceSearch({
  id,
  placeholder,
  kinds,
  within,
  exclude,
  onPick,
  free = true,
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
}) {
  const [q, setQ] = useState('')
  const t = q.trim()
  const ex = new Set(exclude ?? [])
  const countries = kinds.includes('country') ? searchCountries(t).filter((c) => !ex.has(c.name)) : []
  const cities = kinds.includes('city') ? searchCities(t).filter((c) => !ex.has(c.name)) : []
  const sorted = within
    ? [...cities].sort((a, b) => Number(b.country === within) - Number(a.country === within))
    : cities
  const pick = (p: PlacePick) => {
    onPick(p)
    setQ('')
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
