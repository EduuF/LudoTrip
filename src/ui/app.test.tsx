// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  useApp.setState({
    ready: false,
    screen: 'home',
    doc: null,
    undoStack: [],
    toast: null,
    sheet: null,
    openStop: null,
    cursorDay: null,
    celebrations: [],
  })
  render(<App />)
  fireEvent.click(await screen.findByText('Japão de trem'))
  await screen.findByText('PARTIDA · FALTAM')
})

afterEach(cleanup)

const nav = () => within(screen.getByRole('navigation', { name: 'Telas da viagem' }))
const tab = (name: string) => fireEvent.click(nav().getByText(name))

describe('app', () => {
  it('abre na tela do Mapa, com trilha, cartão do dia e roteiro; abas Mapa · Mochila · Tarefas', () => {
    for (const t of ['Mapa', 'Mochila', 'Tarefas']) expect(nav().getByText(t)).toBeTruthy()
    expect(nav().queryByText('Roteiro')).toBeNull()
    expect(nav().queryByText('Quests')).toBeNull()
    expect(screen.getByRole('region', { name: 'Mapa da viagem' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Trilha da viagem' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Dia escolhido' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Noites em Kyoto' })).toBeTruthy()
  })

  it('passagem: marcar e desmarcar no mesmo lugar, com Desfazer', async () => {
    const buy = screen.getAllByRole('button', { name: /Passagem: falta comprar/ })[0]!
    fireEvent.click(buy)
    expect(await screen.findByText('Passagem comprada 済.')).toBeTruthy()
    const on = screen.getAllByRole('button', { name: /Passagem comprada/ })
    expect(on.length).toBeGreaterThanOrEqual(3)
    fireEvent.click(on[0]!)
    expect(await screen.findByText('Passagem desmarcada.')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('status')).getByText('Desfazer'))
    await waitFor(() => expect(useApp.getState().toast?.text).toMatch(/^Desfeito/))
  })

  it('nova figurinha já nasce com a prioridade escolhida', async () => {
    tab('Mochila')
    const input = screen.getByLabelText('Nova figurinha em Kyoto')
    fireEvent.change(input, { target: { value: 'Ginkaku-ji' } })
    const form = input.closest('form')!
    fireEvent.click(within(form).getByRole('button', { name: /Imperdível/ }))
    expect(await screen.findByText('Figurinha nova: Ginkaku-ji.')).toBeTruthy()
    const card = screen.getByRole('button', { name: /^Ginkaku-ji, Imperdível, solta/ })
    expect(card.className).toContain('r-must')
  })

  it('volta marcada: "+" pergunta de onde sai a noite, com prévia', async () => {
    const kyoto = screen.getByRole('group', { name: 'Noites em Kyoto' })
    fireEvent.click(within(kyoto).getByRole('button', { name: 'Mais' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('De onde sai essa noite?')).toBeTruthy()
    fireEvent.click(within(dialog).getByText(/^Tirar de Osaka/))
    expect(
      await screen.findByText(/Kyoto: 8 noites\. Shinsekai e Kuromon voltaram para a mochila\./),
    ).toBeTruthy()
  })

  it('tocar num destino da trilha abre as ações em palavras', async () => {
    await act(async () => {
      useApp.getState().openSheet({ kind: 'city', stopId: 's8' })
    })
    const dialog = await screen.findByRole('dialog')
    for (const t of [
      'Mais 1 noite',
      'Menos 1 noite',
      'Chegar 1 dia antes',
      'Chegar 1 dia depois',
      'Mudar a ordem',
      'Ir a outro destino no meio',
      'Tirar do roteiro',
    ])
      expect(within(dialog).getByText(t)).toBeTruthy()
    fireEvent.click(within(dialog).getByText('Chegar 1 dia depois'))
    expect(await screen.findByText('Kyoto chega 1 dia depois.')).toBeTruthy()
  })

  it('tocar num dia da régua mostra o cartão daquele dia (chegada em Kyoto)', async () => {
    const card = screen.getByRole('region', { name: 'Dia escolhido' })
    expect(within(card).getByText('chega em Tóquio')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^sáb 13\/04/ }))
    expect(await within(card).findByText('chega em Kyoto')).toBeTruthy()
    expect(within(card).getByText('13')).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: 'Dia seguinte' }))
    expect(await within(card).findByText('em Kyoto')).toBeTruthy()
    expect(within(card).getByText(/Hotel em Kyoto/)).toBeTruthy()
  })

  it('bate-volta aparece na régua da trilha (Nara no dia 11/04)', () => {
    const day = screen.getByRole('button', { name: /^qui 11\/04, bate-volta: Nara/ })
    expect(day.querySelector('.tr-trip')).toBeTruthy()
  })

  it('"+ Adicionar destino" põe um lugar antes da volta, escolhendo de onde saem as noites', async () => {
    const before = useApp.getState().doc!.itinerary.stops.length
    fireEvent.click(screen.getByRole('button', { name: /Adicionar destino/ }))
    let dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Que destino entra no fim da viagem?')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: /Nara/ }))
    dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Nara no fim')).toBeTruthy()
    fireEvent.click(within(dialog).getAllByText(/^Tirar de Tóquio/)[0]!)
    expect(await screen.findByText(/Nara entrou no roteiro\./)).toBeTruthy()
    expect(useApp.getState().doc!.itinerary.stops.length).toBe(before + 1)
  })
})
