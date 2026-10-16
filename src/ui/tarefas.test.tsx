// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App'
import { useApp, useRepo } from '../app/store'
import { memoryRepo } from '../app/repo'
import { docProgress } from '../app/tasks'

// M3.6 (spec §17.11): tarefas escritas por quem viaja, numa lista só com as que o app vê.

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
  // Os exemplos saíram da tela inicial: abre pelo store, como o `?exemplo=japao`.
  await screen.findByRole('button', { name: 'Criar viagem' })
  await act(() => useApp.getState().addExample('japao'))
  await screen.findByText('FALTAM', { selector: '.map-head .lbl' })
})
afterEach(cleanup)

const nav = () => within(screen.getByRole('navigation', { name: 'Telas da viagem' }))

describe('tarefas (M3.6)', () => {
  it('a fila online do Gion: criar a partir da atividade, com prazo, link e item; aparece na aba pelo prazo', async () => {
    const gion = useApp.getState().doc!.places.find((p) => p.name === 'Gion')!
    useApp.getState().openSheet({ kind: 'sticker', placeId: gion.id })
    let dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: '+ Tarefa' }))
    dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText(/Presa a Gion/)).toBeTruthy()
    fireEvent.change(dialog.getByLabelText('O que precisa fazer'), {
      target: { value: 'Entrar na fila online' },
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Criar tarefa' }))
    expect(await screen.findByText('Tarefa nova: Entrar na fila online.')).toBeTruthy()
    dialog = within(await screen.findByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('Prazo'), { target: { value: '2030-03-01' } })
    const link = dialog.getByLabelText('Link (site, fila, reserva)')
    fireEvent.change(link, { target: { value: 'sankan.kunaicho.go.jp' } })
    fireEvent.blur(link)
    await waitFor(() => expect(dialog.getByRole('link', { name: 'Abrir ↗' })).toBeTruthy())
    expect(dialog.getByRole('link', { name: 'Abrir ↗' }).getAttribute('href')).toBe(
      'https://sankan.kunaicho.go.jp',
    )
    const item = dialog.getByLabelText('Novo item')
    fireEvent.change(item, { target: { value: 'passaporte em mãos' } })
    fireEvent.keyDown(item, { key: 'Enter' })
    await waitFor(() => expect(useApp.getState().doc!.tasks![0]!.items).toHaveLength(1))
    const t = useApp.getState().doc!.tasks![0]!
    expect(t).toMatchObject({
      title: 'Entrar na fila online',
      due: '2030-03-01',
      link: 'sankan.kunaicho.go.jp',
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Pronto ✓' }))

    // Na aba: o prazo de 2030 é "mais tarde" (hoje é antes); presa a Gion.
    fireEvent.click(nav().getByText('Tarefas'))
    const group = within(screen.getByRole('region', { name: 'MAIS TARDE' }))
    expect(group.getByText('Entrar na fila online')).toBeTruthy()
    expect(group.getByText(/Gion/)).toBeTruthy()
    // Marcar feita: sai da lista, vai para "Feitas", dá XP.
    const xp0 = docProgress(useApp.getState().doc!).xp
    fireEvent.click(group.getByRole('button', { name: 'Entrar na fila online: marcar como feita' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'MAIS TARDE' })).toBeNull())
    expect(docProgress(useApp.getState().doc!).xp).toBe(xp0 + 5)
    fireEvent.click(screen.getByRole('button', { name: /Feitas e "não preciso"/ }))
    expect(screen.getByText('Entrar na fila online')).toBeTruthy()
  })

  it('automática: "Não preciso" com motivo tira da lista, conta no progresso e volta atrás', async () => {
    fireEvent.click(nav().getByText('Tarefas'))
    const before = docProgress(useApp.getState().doc!)
    const osaka = screen.getAllByRole('button', { name: /^Osaka: falta hospedagem/ })[0]!
    fireEvent.click(osaka)
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(dialog.getByText('Não preciso…'))
    fireEvent.change(dialog.getByLabelText('Por quê? (opcional)'), { target: { value: 'casa da tia' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Não preciso' }))
    expect(await screen.findByText('Não precisa: saiu das tarefas.')).toBeTruthy()
    fireEvent.click(dialog.getByRole('button', { name: 'Pronto ✓' }))
    await waitFor(() =>
      expect(screen.queryAllByRole('button', { name: /^Osaka: falta hospedagem/ })).toHaveLength(0),
    )
    const after = docProgress(useApp.getState().doc!)
    expect(after.tasks.find((t) => t.kind === 'lodging')!.done).toBe(
      before.tasks.find((t) => t.kind === 'lodging')!.done + 1,
    )
    expect(after.xp).toBe(before.xp)
    fireEvent.click(screen.getByRole('button', { name: /Feitas e "não preciso"/ }))
    expect(screen.getByText(/não precisa: casa da tia/)).toBeTruthy()
  })

  it('tarefa do destino vira "da viagem" quando o destino sai, com "era de"', async () => {
    const doc = useApp.getState().doc!
    const hakone = doc.destinations.find((d) => d.name === 'Hakone')!
    useApp.getState().act({
      type: 'addTask',
      task: { id: 't1', title: 'Ver o onsen', about: { kind: 'dest', id: hakone.id }, createdAt: 1 },
    })
    useApp.getState().act({ type: 'removeDestination', id: hakone.id })
    expect(useApp.getState().doc!.tasks![0]).toMatchObject({ about: { kind: 'trip' }, wasAbout: 'Hakone' })
  })
})
