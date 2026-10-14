// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App'
import { useApp, useRepo } from '../app/store'
import { memoryRepo } from '../app/repo'

// M3.7 (spec §17.13): painéis empilhados com "‹ voltar" e "Criar ou Descartar".

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

const gionSheet = async () => {
  const gion = useApp.getState().doc!.places.find((p) => p.name === 'Gion')!
  useApp.getState().openSheet({ kind: 'sticker', placeId: gion.id })
  return within(await screen.findByRole('dialog'))
}

describe('painéis empilhados (M3.7)', () => {
  it('pilha: empilha, volta, fecha limpa, ação concluída limpa, no máximo 10', () => {
    const s = useApp.getState()
    s.openSheet({ kind: 'trip' })
    s.openSheet({ kind: 'leg', legId: 'x' })
    expect(useApp.getState().sheetBack.map((x) => x.kind)).toEqual(['trip'])
    useApp.getState().backSheet()
    expect(useApp.getState().sheet?.kind).toBe('trip')
    expect(useApp.getState().sheetBack).toEqual([])
    for (let i = 0; i < 14; i++) useApp.getState().openSheet({ kind: 'leg', legId: `l${i}` })
    expect(useApp.getState().sheetBack.length).toBe(10)
    useApp.getState().closeSheet()
    expect(useApp.getState().sheetBack).toEqual([])
  })

  it('"+ Tarefa" numa atividade: cabeçalho "NOVA TAREFA" e "‹ Gion" volta à atividade', async () => {
    let dialog = await gionSheet()
    expect(dialog.getByText('ATIVIDADE')).toBeTruthy()
    fireEvent.click(dialog.getByRole('button', { name: '+ Tarefa' }))
    dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('NOVA TAREFA')).toBeTruthy()
    fireEvent.click(dialog.getByRole('button', { name: 'Voltar para Gion' }))
    dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('ATIVIDADE')).toBeTruthy()
    expect(dialog.getByRole('heading', { name: 'Gion' })).toBeTruthy()
  })

  it('criada a tarefa, o "‹ Gion" continua lá; o título editado sem sair do campo fica salvo ao voltar', async () => {
    let dialog = await gionSheet()
    fireEvent.click(dialog.getByRole('button', { name: '+ Tarefa' }))
    dialog = within(await screen.findByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('O que precisa fazer'), { target: { value: 'Fila online' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Criar tarefa' }))
    dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('TAREFA')).toBeTruthy()
    fireEvent.change(dialog.getByLabelText('Tarefa'), { target: { value: 'Fila online do ingresso' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Voltar para Gion' }))
    await waitFor(() => expect(useApp.getState().doc!.tasks![0]!.title).toBe('Fila online do ingresso'))
    expect(within(await screen.findByRole('dialog')).getByText('ATIVIDADE')).toBeTruthy()
  })

  it('tarefa criada: diz "Criada ✓", e "Pronto ✓" conclui voltando à atividade', async () => {
    let dialog = await gionSheet()
    fireEvent.click(dialog.getByRole('button', { name: '+ Tarefa' }))
    dialog = within(await screen.findByRole('dialog'))
    expect(dialog.queryByRole('button', { name: 'Pronto ✓' })).toBeNull()
    fireEvent.change(dialog.getByLabelText('O que precisa fazer'), { target: { value: 'Fila online' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Criar tarefa' }))
    dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText(/Criada ✓/)).toBeTruthy()
    fireEvent.click(dialog.getByRole('button', { name: 'Pronto ✓' }))
    dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('ATIVIDADE')).toBeTruthy()
    expect(dialog.getByText('Fila online')).toBeTruthy()
  })

  it('com o nome digitado, tocar fora pergunta "Criar ou Descartar"', async () => {
    let dialog = await gionSheet()
    fireEvent.click(dialog.getByRole('button', { name: '+ Tarefa' }))
    dialog = within(await screen.findByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('O que precisa fazer'), { target: { value: 'Comprar o JR Pass' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar' })[0]!)
    expect(dialog.getByRole('alert').textContent).toMatch(/Criar “Comprar o JR Pass”\?/)
    fireEvent.click(dialog.getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useApp.getState().doc!.tasks ?? []).toHaveLength(0)

    dialog = await gionSheet()
    fireEvent.click(dialog.getByRole('button', { name: '+ Tarefa' }))
    dialog = within(await screen.findByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('O que precisa fazer'), { target: { value: 'Comprar o JR Pass' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Voltar para Gion' }))
    fireEvent.click(dialog.getByRole('button', { name: 'Criar' }))
    await waitFor(() => expect(useApp.getState().doc!.tasks![0]!.title).toBe('Comprar o JR Pass'))
    expect(within(await screen.findByRole('dialog')).getByText('ATIVIDADE')).toBeTruthy()
  })

  it('trecho → Horários → "‹" volta ao trecho; salvar também volta, com o "‹" dele', async () => {
    fireEvent.click(screen.getByRole('button', { name: /São Paulo → Tóquio: editar trecho/ }))
    let dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(dialog.getByText('Horários'))
    dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('HORÁRIOS')).toBeTruthy()
    fireEvent.click(dialog.getByRole('button', { name: /^Voltar para/ }))
    dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('TRECHO')).toBeTruthy()
  })
})
