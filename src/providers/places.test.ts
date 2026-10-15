import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPlacesCache, searchOnline, toPlace } from './places'

const feature = (props: Record<string, unknown>, lon: number, lat: number) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: props,
})

const SAMPLE = {
  features: [
    feature(
      {
        name: 'Brașov',
        countrycode: 'RO',
        state: 'Brașov',
        osm_key: 'place',
        osm_value: 'city',
        type: 'city',
        extent: [25.5, 45.7, 25.7, 45.6],
      },
      25.6,
      45.65,
    ),
    feature(
      { name: 'Romania', countrycode: 'RO', osm_key: 'place', osm_value: 'country', type: 'country' },
      25,
      46,
    ),
    feature(
      {
        name: 'Castelul Bran',
        countrycode: 'RO',
        city: 'Bran',
        osm_key: 'historic',
        osm_value: 'castle',
        type: 'house',
      },
      25.37,
      45.52,
    ),
    feature(
      {
        name: 'La Ceaun',
        countrycode: 'RO',
        city: 'Brașov',
        osm_key: 'amenity',
        osm_value: 'restaurant',
        type: 'house',
      },
      25.59,
      45.64,
    ),
    feature({ name: 'Sem coordenada', osm_key: 'place', osm_value: 'city' }, NaN, 0),
  ],
}

describe('busca online de lugares (Photon)', () => {
  beforeEach(() => clearPlacesCache())
  afterEach(() => vi.unstubAllGlobals())

  it('traduz cidade, país, ponto turístico e restaurante; descarta o que não tem coordenada', () => {
    const [city, country, castle, food, bad] = SAMPLE.features.map((f) => toPlace(f))
    expect(city).toMatchObject({ kind: 'city', name: 'Brașov', country: 'RO', detail: 'Brașov, Romênia' })
    expect(city!.bbox).toEqual([25.5, 45.6, 25.7, 45.7])
    expect(country).toMatchObject({ kind: 'country', name: 'Romênia', country: 'RO', detail: 'país' })
    expect(castle).toMatchObject({ kind: 'poi', placeKind: 'sight', detail: 'castelo · Bran' })
    expect(food).toMatchObject({ kind: 'poi', placeKind: 'food', detail: 'restaurante · Brașov' })
    expect(bad).toBeNull()
  })

  it('consulta com viés e limite, guarda no cache e só chama a rede uma vez', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(SAMPLE), { status: 200 })))
    vi.stubGlobal('fetch', fetchMock)
    const a = await searchOnline('bras', { lat: 45.6, lon: 25.6, limit: 5 })
    expect(a.map((x) => x.kind)).toEqual(['city', 'country', 'poi', 'poi'])
    const url = String((fetchMock.mock.calls[0] as unknown[])[0])
    expect(url).toContain('q=bras')
    expect(url).toContain('limit=5')
    expect(url).toContain('lat=45.6')
    const b = await searchOnline('bras', { lat: 45.6, lon: 25.6, limit: 5 })
    expect(b).toBe(a)
    // Uma em inglês e uma no idioma local; a segunda busca vem do cache.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const langs = fetchMock.mock.calls.map((c) =>
      new URL(String((c as unknown[])[0])).searchParams.get('lang'),
    )
    expect(langs.sort()).toEqual(['default', 'en'])
  })

  it('nomes em português: local no Brasil, inglês aportuguesado fora dele', async () => {
    const en = {
      features: [
        feature(
          {
            osm_type: 'N',
            osm_id: 1,
            name: 'Christ the Redeemer',
            countrycode: 'BR',
            city: 'Rio de Janeiro',
            osm_key: 'tourism',
            osm_value: 'attraction',
          },
          -43.21,
          -22.95,
        ),
        feature(
          {
            osm_type: 'W',
            osm_id: 2,
            name: 'Uminomori Park',
            countrycode: 'JP',
            city: 'Tokyo',
            osm_key: 'leisure',
            osm_value: 'park',
          },
          139.81,
          35.6,
        ),
        feature(
          {
            osm_type: 'N',
            osm_id: 3,
            name: 'Hanazono Shrine',
            countrycode: 'JP',
            osm_key: 'amenity',
            osm_value: 'place_of_worship',
          },
          139.7,
          35.69,
        ),
      ],
    }
    const local = {
      features: [
        feature(
          { osm_type: 'N', osm_id: 1, name: 'Cristo Redentor', countrycode: 'BR', city: 'Rio de Janeiro' },
          -43.21,
          -22.95,
        ),
        feature(
          { osm_type: 'W', osm_id: 2, name: '海の森公園', countrycode: 'JP', city: '東京都' },
          139.81,
          35.6,
        ),
      ],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((u: string) => {
        const lang = new URL(u).searchParams.get('lang')
        return Promise.resolve(new Response(JSON.stringify(lang === 'en' ? en : local), { status: 200 }))
      }),
    )
    const r = await searchOnline('qualquer')
    expect(r.map((x) => x.name)).toEqual(['Cristo Redentor', 'Parque Uminomori', 'Santuário Hanazono'])
    expect(r[1]!.detail).toBe('parque · Tóquio')
  })

  it('se o idioma local falhar, segue só com o inglês', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((u: string) =>
        new URL(u).searchParams.get('lang') === 'en'
          ? Promise.resolve(new Response(JSON.stringify(SAMPLE), { status: 200 }))
          : Promise.reject(new Error('falhou')),
      ),
    )
    expect((await searchOnline('bras')).map((x) => x.name)).toEqual([
      'Brașov',
      'Romênia',
      'Castelul Bran',
      'La Ceaun',
    ])
  })

  it('sem rede ou com erro, devolve lista vazia (a lista própria continua)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    )
    expect(await searchOnline('kyoto')).toEqual([])
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('x', { status: 500 }))),
    )
    expect(await searchOnline('kyoto2')).toEqual([])
    expect(await searchOnline('k')).toEqual([])
  })
})
