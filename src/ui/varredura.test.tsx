// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App'
import { useApp, useRepo } from '../app/store'
import { tripRange } from '../engine'
import { memoryRepo } from '../app/repo'

// M3.5 (spec §17.12): um teste por achado da varredura, escrito antes da correção.

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
  })
  render(<App />)
  fireEvent.click(await screen.findByText('Japão de trem'))
  await screen.findByText('FALTAM', { selector: '.map-head .lbl' })
})
afterEach(cleanup)

const nav = () => within(screen.getByRole('navigation', { name: 'Telas da viagem' }))
const tripSheet = async () => {
  fireEvent.click(screen.getByRole('button', { name: /: nome, quem vai e datas$/ }))
  return within(await screen.findByRole('dialog'))
}

describe('varredura M3.5: bugs', () => {
  it('A1 "Ver no mapa da cidade" a partir de Atividades leva à aba Mapa, na cidade', async () => {
    fireEvent.click(nav().getByText('Atividades'))
    fireEvent.click(screen.getByRole('button', { name: /^Gion,/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByText('Ver no mapa da cidade'))
    await waitFor(() => expect(useApp.getState().tab).toBe('mapa'))
    expect(useApp.getState().mapView).toMatchObject({ kind: 'city' })
  })

  it('A1 trocar de aba sai do modo "marcar no mapa"', () => {
    useApp.getState().setPlacing('new')
    fireEvent.click(nav().getByText('Tarefas'))
    expect(useApp.getState().placing).toBeNull()
  })

  it('A2 "+ Mais uma pessoa" fica salva mesmo fechando o painel logo depois', async () => {
    const n = useApp.getState().doc!.itinerary.travelers.length
    const trip = await tripSheet()
    fireEvent.click(trip.getByRole('button', { name: /Quem vai/ }))
    const sheet = within(await screen.findByRole('dialog'))
    fireEvent.click(sheet.getByRole('button', { name: '+ Mais uma pessoa' }))
    fireEvent.click(sheet.getByRole('button', { name: 'Pronto ✓' }))
    await waitFor(() => expect(useApp.getState().doc!.itinerary.travelers.length).toBe(n + 1))
  })

  it('A3 o campo da volta acompanha a ida (sem opções que ninguém pediu)', async () => {
    const sheet = await tripSheet()
    fireEvent.change(sheet.getByLabelText('Ida (primeira noite)'), { target: { value: '2030-05-01' } })
    fireEvent.blur(sheet.getByLabelText('Ida (primeira noite)'))
    await waitFor(() => expect(useApp.getState().doc!.itinerary.start).toBe('2030-05-01'))
    const end = tripRange(useApp.getState().doc!.itinerary).end!
    expect((sheet.getByLabelText(/^Volta/) as HTMLInputElement).value).toBe(end)
    expect(sheet.queryByText(/^Tirar \d+ noites? de/)).toBeNull()
  })

  it('A4 digitar o ano aos poucos não move a viagem para o ano 2 nem 202', async () => {
    const before = useApp.getState().doc!.itinerary.start
    const sheet = await tripSheet()
    const ida = sheet.getByLabelText('Ida (primeira noite)')
    for (const v of ['0002-04-01', '0020-04-01', '0202-04-01'])
      fireEvent.change(ida, { target: { value: v } })
    expect(useApp.getState().doc!.itinerary.start).toBe(before)
    fireEvent.change(ida, { target: { value: '2031-04-01' } })
    fireEvent.blur(ida)
    await waitFor(() => expect(useApp.getState().doc!.itinerary.start).toBe('2031-04-01'))
    expect(useApp.getState().undoStack.length).toBe(1)
  })

  it('A7 "Salvar" dos horários volta ao painel do trecho', async () => {
    fireEvent.click(screen.getByRole('button', { name: /São Paulo → Tóquio: editar trecho/ }))
    let dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(dialog.getByText('Horários'))
    dialog = within(await screen.findByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('Sai'), { target: { value: '10:00' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Horários salvos.')).toBeTruthy()
    dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByRole('group', { name: 'Como vão' })).toBeTruthy()
  })
})

describe('varredura M3.5: becos sem saída', () => {
  const undated = () =>
    useApp.getState().act({ type: 'engine', command: { type: 'setTripStart', date: null } })

  it('B1 sem datas: a tarefa de hospedagem leva a "Sua viagem" e o painel de hospedagem explica', async () => {
    undated()
    fireEvent.click(nav().getByText('Tarefas'))
    const btn = screen.getAllByRole('button', { name: 'Escolher a data de ida' })[0]!
    fireEvent.click(btn)
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Sua viagem')).toBeTruthy()
    expect(await screen.findByText(/escolha primeiro a data de ida/)).toBeTruthy()
  })

  it('B1 sem datas: "Passagem: falta comprar" nunca fica desligado', async () => {
    undated()
    const t = screen.getAllByRole('button', { name: /Passagem: falta comprar/ })[0]!
    expect(t).toHaveProperty('disabled', false)
    fireEvent.click(t)
    expect(within(await screen.findByRole('dialog')).getByText('Sua viagem')).toBeTruthy()
  })

  it('B2 "com amigos" tira a hospedagem das tarefas e dá para voltar atrás', async () => {
    const it0 = useApp.getState().doc!.itinerary
    const osaka = it0.stops.find((s) => s.days.length === 4 && s.destinationId === 'd-osaka')!
    useApp.getState().openSheet({ kind: 'lodging', stopId: osaka.id })
    let dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(dialog.getByText('Vamos ficar com amigos ou família'))
    expect(await screen.findByText('Com amigos: não precisa de reserva.')).toBeTruthy()
    fireEvent.click(nav().getByText('Tarefas'))
    expect(screen.queryByText(/^Osaka: falta hospedagem/)).toBeNull()
    useApp.getState().openSheet({ kind: 'lodging', stopId: osaka.id })
    dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(dialog.getByText('Mudar: vamos precisar de hospedagem'))
    expect(await screen.findByText(/^Osaka: falta hospedagem/)).toBeTruthy()
  })

  it('B3 reserva tirada do roteiro aparece em "Sua viagem" e volta', async () => {
    const b = useApp.getState().doc!.bookings[0]!
    useApp.getState().act({ type: 'setBooking', id: b.id, patch: { archived: true } })
    const sheet = await tripSheet()
    expect(sheet.getByText('RESERVAS TIRADAS DO ROTEIRO')).toBeTruthy()
    fireEvent.click(sheet.getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(useApp.getState().doc!.bookings[0]!.archived).toBeFalsy())
  })

  it('B4 "Ir para Osaka" nas Tarefas abre o cartão de Osaka', async () => {
    fireEvent.click(nav().getByText('Tarefas'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Ir para Osaka' })[0]!)
    await waitFor(() => expect(useApp.getState().tab).toBe('mapa'))
    expect(screen.getByRole('button', { name: 'Osaka: fechar os dias' })).toBeTruthy()
  })

  it('B7 destino guardado (Hakone) se apaga, com as atividades e Desfazer', async () => {
    fireEvent.click(nav().getByText('Atividades'))
    fireEvent.click(screen.getByRole('button', { name: 'Apagar Hakone' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByText('Apagar destino'))
    expect(await screen.findByText('Hakone apagado.')).toBeTruthy()
    expect(useApp.getState().doc!.destinations.some((d) => d.name === 'Hakone')).toBe(false)
    expect(useApp.getState().doc!.places.some((p) => p.name === 'Onsen com vista')).toBe(false)
  })
})

describe('varredura M3.5: teclado e proteção', () => {
  it('D trilha pelo teclado: ← → num pegador passam uma noite; Enter num bloco abre o destino', async () => {
    const it0 = useApp.getState().doc!.itinerary
    const handle = screen.getByRole('button', { name: /^Divisa entre Osaka e Kyoto/ })
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    await waitFor(() => {
      const it1 = useApp.getState().doc!.itinerary
      expect(it1.stops.find((s) => s.destinationId === 'd-kyoto')!.days.length).toBe(
        it0.stops.find((s) => s.destinationId === 'd-kyoto')!.days.length - 1,
      )
    })
    fireEvent.click(screen.getByRole('button', { name: /^Kyoto, \d+ noites/ }), { detail: 0 })
    expect(await screen.findByRole('button', { name: 'Kyoto: fechar os dias' })).toBeTruthy()
  })

  it('E apagar atividade com anotações pede um segundo toque', async () => {
    const gion = useApp.getState().doc!.places.find((p) => p.name === 'Gion')!
    useApp.getState().act({ type: 'setPlace', id: gion.id, patch: { note: 'Ir à noite' } })
    useApp.getState().openSheet({ kind: 'sticker', placeId: gion.id })
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(dialog.getByText('Apagar atividade'))
    expect(useApp.getState().doc!.places.some((p) => p.id === gion.id)).toBe(true)
    fireEvent.click(dialog.getByText('Toque de novo para apagar'))
    await waitFor(() => expect(useApp.getState().doc!.places.some((p) => p.id === gion.id)).toBe(false))
  })
})
