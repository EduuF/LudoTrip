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

  it('tocar numa fase do mapa entra na cidade: dias como fichas, lugares por dia, voltar', async () => {
    fireEvent.click(
      await screen.findByRole('button', { name: 'Kyoto: entrar no mapa da cidade' }, { timeout: 8000 }),
    )
    expect(await screen.findByRole('button', { name: '◀ Mapa' })).toBeTruthy()
    const map = () => within(screen.getByRole('group', { name: 'Lugares no mapa da cidade' }))
    expect(screen.getByText(/7 dias · 7\/8 lugares com dia/)).toBeTruthy()
    const gion = await map().findByRole('button', { name: 'Gion' })
    // Entrar leva o cursor ao primeiro dia de Kyoto (Gion aceso, Kiyomizu-dera esmaecido).
    expect(gion.getAttribute('class')).not.toContain('dim')
    expect(map().getByRole('button', { name: 'Kiyomizu-dera' }).getAttribute('class')).toContain('dim')
    fireEvent.click(screen.getByRole('button', { name: /^Ver o dia dom 14/ }))
    expect(map().getByRole('button', { name: 'Gion' }).getAttribute('class')).toContain('dim')
    expect(map().getByRole('button', { name: 'Kiyomizu-dera' }).getAttribute('class')).not.toContain('dim')
    expect(within(screen.getByRole('region', { name: 'Dia escolhido' })).getByText('em Kyoto')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }))
    expect(map().getByRole('button', { name: 'Gion' }).getAttribute('class')).not.toContain('dim')
    fireEvent.click(screen.getByRole('button', { name: '◀ Mapa' }))
    expect(await screen.findByRole('button', { name: 'Kyoto: entrar no mapa da cidade' })).toBeTruthy()
  })

  it('figurinha sem lugar: "Marcar no mapa" e um toque no mapa guardam as coordenadas', async () => {
    tab('Mochila')
    const input = screen.getByLabelText('Nova figurinha em Kyoto')
    fireEvent.change(input, { target: { value: 'Ginkaku-ji' } })
    fireEvent.click(within(input.closest('form')!).getByRole('button', { name: /Quero/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^Ginkaku-ji, Quero, solta/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByText('Marcar no mapa'))
    tab('Mapa')
    expect((await screen.findAllByText(/Toque no mapa onde fica Ginkaku-ji\./)).length).toBeGreaterThan(0)
    const board = document.querySelector('.board')!
    await waitFor(() => expect(board.className).toContain('placing'))
    fireEvent.click(board, { clientX: 10, clientY: 10 })
    expect(await screen.findByText('Lugar marcado no mapa.')).toBeTruthy()
    const p = useApp.getState().doc!.places.find((x) => x.name === 'Ginkaku-ji')!
    expect(typeof p.lat).toBe('number')
    expect(await screen.findByRole('button', { name: 'Ginkaku-ji, sem dia' })).toBeTruthy()
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

  it('"Como jogar": três passos com holofote; aparece uma vez e o "?" mostra de novo', async () => {
    expect(screen.queryByRole('dialog', { name: 'Como jogar' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Como jogar' }))
    const tut = await screen.findByRole('dialog', { name: 'Como jogar' })
    expect(within(tut).getByText('O mapa da viagem')).toBeTruthy()
    fireEvent.click(within(tut).getByText('Próximo'))
    expect(within(tut).getByText('A trilha dos dias')).toBeTruthy()
    fireEvent.click(within(tut).getByText('Próximo'))
    expect(within(tut).getByText('O cartão do dia')).toBeTruthy()
    fireEvent.click(within(tut).getByText('Começar'))
    expect(screen.queryByRole('dialog', { name: 'Como jogar' })).toBeNull()
    expect(localStorage.getItem('ludotrip.tutorial')).toBe('1')
  })
})
