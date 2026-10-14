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
    const sheet = await tripSheet()
    fireEvent.click(sheet.getByRole('button', { name: '+ Mais uma pessoa' }))
    fireEvent.click(sheet.getByRole('button', { name: 'Fechar' }))
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
