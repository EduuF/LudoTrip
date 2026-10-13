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
    celebrations: [],
  })
  render(<App />)
  fireEvent.click(await screen.findByText('Japão de trem'))
  await screen.findByText('PARTIDA · FALTAM')
})

afterEach(cleanup)

const tab = (name: string) =>
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Telas da viagem' })).getByText(name))

describe('app', () => {
  it('passagem: marcar e desmarcar no mesmo lugar, com Desfazer', async () => {
    tab('Roteiro')
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

  it('nova figurinha já nasce com a raridade escolhida', async () => {
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
    tab('Roteiro')
    const kyoto = screen.getByRole('group', { name: 'Noites em Kyoto' })
    fireEvent.click(within(kyoto).getByRole('button', { name: 'Mais' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('De onde sai essa noite?')).toBeTruthy()
    fireEvent.click(within(dialog).getByText(/^Tirar de Osaka/))
    expect(
      await screen.findByText(/Kyoto: 8 noites\. Shinsekai e Kuromon voltaram para a mochila\./),
    ).toBeTruthy()
  })

  it('tocar numa cidade da trilha abre as ações em palavras', async () => {
    tab('Roteiro')
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
      'Ir a outra cidade no meio',
      'Tirar do roteiro',
    ])
      expect(within(dialog).getByText(t)).toBeTruthy()
    fireEvent.click(within(dialog).getByText('Chegar 1 dia depois'))
    expect(await screen.findByText('Kyoto chega 1 dia depois.')).toBeTruthy()
  })
})
