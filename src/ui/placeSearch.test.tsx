// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { clearPlacesCache } from '../providers/places'
import { PlaceSearch } from './PlaceSearch'
import type { PlacePick } from './PlaceSearch'

const photon = (features: unknown[]) =>
  vi.fn(() => Promise.resolve(new Response(JSON.stringify({ features }), { status: 200 })))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  clearPlacesCache()
})

describe('busca de lugares', () => {
  it('lista própria na hora; com rede, o mundo todo depois de uma pausa (sem repetir o que já tem)', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      photon([
        {
          geometry: { coordinates: [25.6, 45.65] },
          properties: {
            name: 'Brașov',
            countrycode: 'RO',
            state: 'Brașov',
            osm_key: 'place',
            osm_value: 'city',
          },
        },
        {
          geometry: { coordinates: [-9.14, 38.72] },
          properties: { name: 'Lisboa', countrycode: 'PT', osm_key: 'place', osm_value: 'city' },
        },
        {
          geometry: { coordinates: [25.5, 45.5] },
          properties: { name: 'Castelul Bran', countrycode: 'RO', osm_key: 'historic', osm_value: 'castle' },
        },
      ]),
    )
    const picks: PlacePick[] = []
    render(<PlaceSearch id="q" placeholder="Busque" kinds={['city']} onPick={(p) => picks.push(p)} />)
    fireEvent.change(screen.getByPlaceholderText('Busque'), { target: { value: 'lis' } })
    expect(screen.getByText('Lisboa')).toBeTruthy() // lista própria, na hora
    expect(screen.queryByText(/Brașov/)).toBeNull()
    await vi.advanceTimersByTimeAsync(350)
    vi.useRealTimers()
    await waitFor(() => expect(screen.getByText('Brașov')).toBeTruthy())
    expect(screen.getAllByText('Lisboa')).toHaveLength(1) // o Photon repetiu Lisboa: fica uma só
    expect(screen.queryByText('Castelul Bran')).toBeNull() // ponto de interesse não é destino
    fireEvent.click(screen.getByText('Brașov'))
    expect(picks[0]).toMatchObject({
      kind: 'city',
      name: 'Brașov',
      country: 'RO',
      lat: 45.65,
      lon: 25.6,
      destKind: 'city',
    })
  })

  it('sem rede, só a lista própria e "Usar" sem lugar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    )
    const picks: PlacePick[] = []
    render(
      <PlaceSearch id="q" placeholder="Busque" kinds={['country', 'city']} onPick={(p) => picks.push(p)} />,
    )
    fireEvent.change(screen.getByPlaceholderText('Busque'), { target: { value: 'romen' } })
    expect(screen.getByText('Romênia')).toBeTruthy()
    fireEvent.click(screen.getByText(/^Usar "romen"/))
    expect(picks[0]).toEqual({ kind: 'city', name: 'romen' })
  })
})
