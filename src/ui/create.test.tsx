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

describe('criar viagem', () => {
  it('um país como destino, "decido no mapa": a viagem nasce com noites em aberto e o escopo do país', async () => {
    fireEvent.change(screen.getByPlaceholderText(/Busque: Japão/), { target: { value: 'romen' } })
    fireEvent.click(await screen.findByText('Romênia'))
    expect(screen.getByText(/Romênia · país/)).toBeTruthy()
    next()
    expect(screen.getByText(/Em quais cidades/)).toBeTruthy()
    const btn = screen.getByRole('button', { name: /Escolha um lugar ou/ })
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Ainda não sei: decido no mapa' }))
    next()
    next()
    next()
    next()
    expect(screen.getByText(/cidades a decidir/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Criar viagem' }))
    await waitFor(() => expect(useApp.getState().screen).toBe('trip'))
    const doc = useApp.getState().doc!
    expect(doc.scope).toMatchObject({ name: 'Romênia', kind: 'country', country: 'RO' })
    expect(doc.scope!.bbox![0]).toBeGreaterThan(19)
    expect(doc.itinerary.stops).toEqual([expect.objectContaining({ destinationId: null })])
    expect(doc.itinerary.stops[0]!.days).toHaveLength(7)
    expect(await screen.findByText('VIAGEM CRIADA!')).toBeTruthy()
  })

  it('uma cidade como destino já entra como primeiro lugar; dá para somar um bate-volta', async () => {
    fireEvent.change(screen.getByPlaceholderText(/Busque: Japão/), { target: { value: 'rio de' } })
    fireEvent.click(await screen.findByText('Rio de Janeiro'))
    next()
    expect(screen.getByText(/Vão dormir em/)).toBeTruthy()
    expect(screen.getByText('1. Rio de Janeiro ×')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText(/Busque: Kyoto/), { target: { value: 'petr' } })
    fireEvent.click(await screen.findByText('Petrópolis'))
    expect(screen.getByText('2. Petrópolis ×')).toBeTruthy()
    next()
    next()
    next()
    next()
    fireEvent.click(screen.getByRole('button', { name: 'Criar viagem' }))
    await waitFor(() => expect(useApp.getState().screen).toBe('trip'))
    const doc = useApp.getState().doc!
    expect(doc.scope).toMatchObject({ name: 'Rio de Janeiro', kind: 'city', country: 'BR' })
    expect(doc.itinerary.stops.map((s) => s.destinationId)).toEqual(['d-1', 'd-2'])
  })
})
