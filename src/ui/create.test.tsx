// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../App'
import { useApp, useRepo } from '../app/store'
import { memoryRepo } from '../app/repo'

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  window.matchMedia ??= (q: string) =>
    ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    }) as MediaQueryList
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext']
  Element.prototype.scrollIntoView ??= () => {}
  window.scrollTo = (() => {}) as typeof window.scrollTo
})

beforeEach(async () => {
  useRepo(memoryRepo())
  useApp.setState({ ready: false, screen: 'home', doc: null, undoStack: [], toast: null, sheet: null })
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Criar viagem' }))
})

afterEach(cleanup)

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

const search = async (text: string, pick: string) => {
  fireEvent.change(screen.getByPlaceholderText(/Busque: Japão/), { target: { value: text } })
  fireEvent.click(await screen.findByText(pick))
}

const create = async () => {
  next()
  next()
  next()
  next()
  fireEvent.click(screen.getByRole('button', { name: 'Criar viagem' }))
  await waitFor(() => expect(useApp.getState().screen).toBe('trip'))
  return useApp.getState().doc!
}

describe('criar viagem', () => {
  it('sem destino não dá para seguir', () => {
    const btn = screen.getByRole('button', { name: 'Diga pra onde' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('só um país: a viagem nasce com noites em aberto nele, sem escopo', async () => {
    await search('japa', 'Japão')
    expect(screen.getByText(/1\. Japão · cidades em aberto/)).toBeTruthy()
    const doc = await create()
    expect(doc.scope).toBeUndefined()
    expect(doc.destinations).toEqual([])
    expect(doc.itinerary.stops).toEqual([
      expect.objectContaining({ destinationId: null, openIn: expect.objectContaining({ country: 'JP' }) }),
    ])
    expect(doc.itinerary.stops[0]!.openIn!.bbox![0]).toBeGreaterThan(120)
    expect(doc.itinerary.stops[0]!.days).toHaveLength(7)
    expect(doc.meta.name).toBe('Viagem para Japão')
    expect(await screen.findByText('VIAGEM CRIADA!')).toBeTruthy()
  })

  it('país e cidade sugerida: na ordem escolhida; tirar um destino', async () => {
    await search('japa', 'Japão')
    fireEvent.click(screen.getByRole('button', { name: '+ Kyoto' }))
    expect(screen.getByText(/2\. Kyoto/)).toBeTruthy()
    await search('rio de', 'Rio de Janeiro')
    fireEvent.click(screen.getByRole('button', { name: 'Tirar Rio de Janeiro' }))
    const doc = await create()
    expect(doc.itinerary.stops.map((s) => s.openIn?.country ?? s.destinationId)).toEqual(['JP', 'd-1'])
    expect(doc.destinations).toEqual([expect.objectContaining({ id: 'd-1', name: 'Kyoto', country: 'JP' })])
    expect(doc.meta.name).toBe('Viagem para Japão')
  })

  it('cidades de dois países: "Viagem para França e Itália"', async () => {
    await search('paris', 'Paris')
    await search('roma', 'Roma')
    const doc = await create()
    expect(doc.scope).toBeUndefined()
    expect(doc.itinerary.stops.map((s) => s.destinationId)).toEqual(['d-1', 'd-2'])
    expect(doc.meta.name).toBe('Viagem para França e Itália')
  })

  it('uma cidade só: o nome é a cidade', async () => {
    await search('rio de', 'Rio de Janeiro')
    const doc = await create()
    expect(doc.meta.name).toBe('Viagem para Rio de Janeiro')
    expect(doc.itinerary.stops.map((s) => s.destinationId)).toEqual(['d-1'])
  })
})
