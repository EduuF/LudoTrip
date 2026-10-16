// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App'
import { useApp, useRepo } from '../app/store'
import { memoryRepo } from '../app/repo'

// M3.8 (spec §17.14): sair da cidade e voltar um passo pelo "‹" do topo, pela aba ativa, pelo Voltar do sistema e pelo Escape.

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
  localStorage.setItem('ludotrip.tutorial', '1')
  useApp.setState({
    ready: false,
    screen: 'home',
    doc: null,
    undoStack: [],
    toast: null,
    sheet: null,
    cursorDay: null,
    openStop: null,
    stopCollapsed: false,
    celebrations: [],
    tab: 'mapa',
    mapView: { kind: 'trip' },
    placing: null,
    tutorial: false,
  })
  render(<App />)
  // Os exemplos saíram da tela inicial: abre pelo store, como o `?exemplo=japao`.
  await screen.findByRole('button', { name: 'Criar viagem' })
  await act(() => useApp.getState().addExample('japao'))
  await screen.findByText('FALTAM', { selector: '.map-head .lbl' })
})
afterEach(cleanup)

const S = () => useApp.getState()
const entrar = async () => {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Kyoto: entrar no mapa da cidade' }, { timeout: 8000 }),
  )
  await screen.findByRole('button', { name: 'Voltar ao mapa da viagem toda' })
}
const voltarDoSistema = () => fireEvent(window, new PopStateEvent('popstate', { state: null }))
const gionSheet = async () => {
  const gion = S().doc!.places.find((p) => p.name === 'Gion')!
  S().openSheet({ kind: 'sticker', placeId: gion.id })
  return within(await screen.findByRole('dialog'))
}

describe('voltar um passo (M3.8)', { timeout: 20000 }, () => {
  it('na cidade, o botão diz para onde leva: "‹ Viagem toda"', async () => {
    await entrar()
    const b = screen.getByRole('button', { name: 'Voltar ao mapa da viagem toda' })
    expect(b.textContent).toBe('‹ Viagem toda')
    fireEvent.click(b)
    expect(S().mapView.kind).toBe('trip')
  })

  it('o "‹" do topo volta um nível: da cidade à viagem toda; da viagem, a "Suas viagens"', async () => {
    await entrar()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à viagem toda' }))
    expect(S().mapView.kind).toBe('trip')
    expect(S().screen).toBe('trip')
    fireEvent.click(screen.getByRole('button', { name: 'Suas viagens' }))
    await waitFor(() => expect(S().screen).toBe('home'))
  })

  it('tocar de novo a aba "Mapa" dentro da cidade volta à viagem toda', async () => {
    await entrar()
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Telas da viagem' })).getByText('Mapa'))
    expect(S().mapView.kind).toBe('trip')
  })

  it('Voltar do sistema: painel empilhado → painel de baixo → fecha → cidade → viagem → início', async () => {
    await entrar()
    let dialog = await gionSheet()
    fireEvent.click(dialog.getByRole('button', { name: '+ Tarefa' }))
    dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('NOVA TAREFA')).toBeTruthy()
    voltarDoSistema()
    expect(within(await screen.findByRole('dialog')).getByText('ATIVIDADE')).toBeTruthy()
    voltarDoSistema()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(S().mapView.kind).toBe('city')
    voltarDoSistema()
    expect(S().mapView.kind).toBe('trip')
    expect(S().screen).toBe('trip')
    voltarDoSistema()
    await waitFor(() => expect(S().screen).toBe('home'))
    expect(S().stepBack()).toBe(false)
  })

  it('Voltar do sistema com texto digitado pergunta "Criar ou Descartar" e não fecha', async () => {
    let dialog = await gionSheet()
    fireEvent.click(dialog.getByRole('button', { name: '+ Tarefa' }))
    dialog = within(await screen.findByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('O que precisa fazer'), { target: { value: 'Comprar o JR Pass' } })
    voltarDoSistema()
    expect(dialog.getByRole('alert').textContent).toMatch(/Criar “Comprar o JR Pass”\?/)
    expect(S().sheet?.kind).toBe('task')
  })

  it('em outra aba, Voltar leva ao Mapa (sem sair da viagem)', async () => {
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Telas da viagem' })).getByText('Tarefas'))
    voltarDoSistema()
    expect(S().tab).toBe('mapa')
    expect(S().screen).toBe('trip')
  })

  it('Escape sai da cidade; com painel aberto, só fecha o painel', async () => {
    await entrar()
    await gionSheet()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(S().mapView.kind).toBe('city')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(S().mapView.kind).toBe('trip')
  })

  it('"Criar viagem": Voltar do sistema volta ao passo anterior, não ao início', async () => {
    S().goHome()
    await waitFor(() => expect(S().screen).toBe('home'))
    S().goCreate()
    fireEvent.change(await screen.findByPlaceholderText(/Busque: Japão/), { target: { value: 'romen' } })
    fireEvent.click(await screen.findByText('Romênia'))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByText(/Primeira noite/)).toBeTruthy()
    voltarDoSistema()
    expect(await screen.findByText(/Romênia · cidades em aberto/)).toBeTruthy()
    expect(S().screen).toBe('create')
    voltarDoSistema()
    await waitFor(() => expect(S().screen).toBe('home'))
  })
})
