// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App'
import { configureCloud, exampleDoc, useApp, useRepo } from '../app/store'
import { memoryRepo } from '../app/repo'
import type { TripDoc } from '../app/doc'
import { memoryAuth } from '../auth/authClient'
import { createOutbox } from '../sync/outbox'
import type { OutboxIO } from '../sync/outbox'
import { memoryCloud, SimServer } from '../sync/testing'

// M4.11 (spec publicação §3.2–3.5): as viagens do aparelho sobem ao entrar, "Guardar na nuvem" em
// três lugares, e os casos estranhos (aparelho de outra conta, viagem de outra conta, sem internet).

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

const memoryIO = (): OutboxIO => {
  const data = new Map<string, unknown>()
  return {
    open: () => ({}),
    entries: async () => [...data],
    set: async (k, v) => void data.set(k, v),
    del: async (k) => void data.delete(k),
  }
}

let auth: ReturnType<typeof memoryAuth>
let cloud: ReturnType<typeof memoryCloud>
const S = () => useApp.getState()

beforeEach(() => {
  useRepo(memoryRepo())
  auth = memoryAuth()
  cloud = memoryCloud(() => auth.current()?.uid ?? null)
  configureCloud({ auth, api: cloud.api, outbox: createOutbox(memoryIO()), app: 'teste' })
  localStorage.clear()
  localStorage.setItem('ludotrip.tutorial', '1')
  sessionStorage.clear()
  history.replaceState(null, '', '/')
  useApp.setState({
    ready: false,
    screen: 'home',
    doc: null,
    trips: [],
    undoStack: [],
    toast: null,
    sheet: null,
    sheetBack: [],
    celebrations: [],
    tab: 'mapa',
    mapView: { kind: 'trip' },
    placing: null,
    tutorial: false,
    account: null,
    cloud: null,
  })
  render(<App />)
})
afterEach(() => {
  S().goHome()
  cleanup()
  configureCloud(null)
})

/** Uma viagem criada sem conta (📱). */
async function viagemDoAparelho(name = 'Minha viagem'): Promise<TripDoc> {
  await waitFor(() => expect(S().ready).toBe(true))
  const doc = exampleDoc('japao')
  doc.meta.example = undefined
  doc.meta.name = name
  await act(() => S().addTrip(doc))
  act(() => S().goHome())
  return doc
}

const entrarComGoogle = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Continuar com Google' }))
  await waitFor(() => expect(S().account).not.toBeNull())
}

describe('as viagens do aparelho sobem ao entrar', () => {
  it('primeiro login: a viagem 📱 vira ☁️ sozinha, com aviso e animação; exemplos ficam no aparelho', async () => {
    const doc = await viagemDoAparelho()
    await act(() => S().addExample('rio'))
    act(() => S().goHome())
    fireEvent.click(await screen.findByRole('button', { name: 'Entrar' }))
    await entrarComGoogle()
    await waitFor(() => expect(cloud.trips.has(doc.meta.id)).toBe(true))
    await waitFor(() => expect(S().toast?.text).toBe('Viagem guardada na sua conta ✓'))
    expect(S().justUploaded).toEqual([doc.meta.id])
    expect(await screen.findByText('☁️ salva na sua conta')).toBeTruthy()
    // Nenhum exemplo foi para a conta.
    expect([...cloud.trips.values()].every((t) => !t.server.state.doc.meta.example)).toBe(true)
  })

  it('"Guardar na nuvem" na aba Tarefas: entra e a viagem continua aberta, agora na nuvem', async () => {
    const doc = await viagemDoAparelho()
    await act(() => S().openTrip(doc.meta.id))
    act(() => S().setTab('tarefas'))
    expect(screen.getByText('Guardar a viagem na nuvem ☁️')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar na nuvem' }))
    await entrarComGoogle()
    await waitFor(() => expect(S().cloud?.status).toBe('saved'))
    expect(S().screen).toBe('trip')
    expect(S().tab).toBe('tarefas')
    expect(S().doc!.meta.cloud).toBeTruthy()
    expect(screen.queryByText('Guardar a viagem na nuvem ☁️')).toBeNull()
  })

  it('"Não preciso" esconde a missão desta viagem', async () => {
    const doc = await viagemDoAparelho()
    await act(() => S().openTrip(doc.meta.id))
    act(() => S().setTab('tarefas'))
    fireEvent.click(
      within(screen.getByText('Guardar a viagem na nuvem ☁️').closest('.quest') as HTMLElement).getByRole(
        'button',
        { name: 'Não preciso' },
      ),
    )
    expect(screen.queryByText('Guardar a viagem na nuvem ☁️')).toBeNull()
  })

  it('"Abrir em outro aparelho" sem conta: entra e volta a "Sua viagem", já ☁️, explicando o caminho', async () => {
    const doc = await viagemDoAparelho()
    await act(() => S().openTrip(doc.meta.id))
    act(() => S().openSheet({ kind: 'trip' }))
    expect(screen.getByText('📱 Só neste aparelho')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir em outro aparelho' }))
    expect(await screen.findByText('Entrar para abrir em outro aparelho')).toBeTruthy()
    await entrarComGoogle()
    await waitFor(() => expect(S().sheet?.kind).toBe('trip'))
    await waitFor(() => expect(screen.getByText('☁️ Salva na sua conta')).toBeTruthy())
  })
})

describe('"☁️ Salvar" no topo da viagem (à vista, sem voltar à tela inicial)', () => {
  it('num exemplo: Salvar → Guardar na nuvem → entrar; vira viagem da pessoa e o topo mostra ☁️✓', async () => {
    await waitFor(() => expect(S().ready).toBe(true))
    await act(() => S().addExample('rio'))
    const id = S().doc!.meta.id
    fireEvent.click(
      screen.getByRole('button', { name: 'Salvar na nuvem: esta viagem está só neste aparelho' }),
    )
    expect(screen.getByText('O exemplo vira uma viagem sua.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar na nuvem' }))
    expect(await screen.findByText('Entrar para guardar na nuvem')).toBeTruthy()
    await entrarComGoogle()
    await waitFor(() => expect(cloud.trips.has(id)).toBe(true))
    expect(cloud.trips.get(id)!.server.state.doc.meta.example).toBeUndefined()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tudo salvo na sua conta.' })).toBeTruthy())
    expect(S().screen).toBe('trip')
    expect(S().sheet).toBeNull()
  })

  it('com conta, Salvar sobe na hora', async () => {
    const doc = await viagemDoAparelho()
    // Aparelho de outra conta: nada sobe sozinho; a pessoa decide pelo "☁️ Salvar".
    localStorage.setItem('ludotrip.lastUid', 'outra')
    act(() => auth.signInAs({ uid: 'ana', name: 'Ana', email: 'ana@teste.invalid', picture: null }))
    await waitFor(() => expect(S().sheet?.kind).toBe('adopt'))
    act(() => S().closeSheet())
    await act(() => S().openTrip(doc.meta.id))
    fireEvent.click(
      screen.getByRole('button', { name: 'Salvar na nuvem: esta viagem está só neste aparelho' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar na nuvem' }))
    await waitFor(() => expect(cloud.trips.has(doc.meta.id)).toBe(true))
  })

  it('logo depois de criar sem conta, o aviso oferece "☁️ Salvar"', async () => {
    await waitFor(() => expect(S().ready).toBe(true))
    const doc = exampleDoc('japao')
    doc.meta.example = undefined
    await act(() => S().addTrip(doc))
    expect(S().toast?.text).toBe('Viagem criada neste aparelho. Guarde na nuvem para não perder.')
    expect(screen.getByRole('button', { name: '☁️ Salvar' })).toBeTruthy()
  })
})

describe('casos estranhos', () => {
  it('aparelho que já teve outra conta: pergunta, nada marcado, e leva só o escolhido', async () => {
    const a = await viagemDoAparelho('Viagem da outra pessoa')
    const b = await viagemDoAparelho('Minha viagem')
    localStorage.setItem('ludotrip.lastUid', 'outra-conta')
    fireEvent.click(await screen.findByRole('button', { name: 'Entrar' }))
    await entrarComGoogle()
    expect(await screen.findByText('Levar estas viagens para a sua conta?')).toBeTruthy()
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes.every((x) => !x.checked)).toBe(true)
    expect(screen.getByRole('button', { name: 'Levar para a minha conta' })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Minha viagem' }))
    fireEvent.click(screen.getByRole('button', { name: 'Levar para a minha conta' }))
    await waitFor(() => expect(cloud.trips.has(b.meta.id)).toBe(true))
    expect(cloud.trips.has(a.meta.id)).toBe(false)
    expect(S().trips.find((t) => t.id === a.meta.id)?.cloud).toBeUndefined()
  })

  it('viagem que já está noutra conta: oferece levar uma cópia (id novo)', async () => {
    const doc = await viagemDoAparelho()
    cloud.trips.set(doc.meta.id, { server: new SimServer(doc), owner: 'bia', createdAt: 1 })
    fireEvent.click(await screen.findByRole('button', { name: 'Entrar' }))
    await entrarComGoogle()
    expect(await screen.findByText('Minha viagem já está noutra conta')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Levar uma cópia' }))
    await waitFor(() => expect([...cloud.trips.values()].filter((t) => t.owner === 'ana')).toHaveLength(1))
    const mine = [...cloud.trips.entries()].find(([, t]) => t.owner === 'ana')!
    expect(mine[0]).not.toBe(doc.meta.id)
    expect(mine[1].server.state.doc.meta.name).toBe('Minha viagem')
    await waitFor(() => expect(S().trips.map((t) => t.id)).not.toContain(doc.meta.id))
  })

  it('sem internet ao entrar: a viagem continua 📱 e sobe sozinha quando a rede volta', async () => {
    const doc = await viagemDoAparelho()
    act(() => cloud.offline())
    fireEvent.click(await screen.findByRole('button', { name: 'Entrar' }))
    await entrarComGoogle()
    await waitFor(() => expect(S().toast?.text).toMatch(/^Sem internet: suas viagens continuam salvas aqui/))
    expect(cloud.trips.size).toBe(0)
    expect(screen.getByText('📱 só neste aparelho')).toBeTruthy()
    act(() => {
      cloud.online()
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => expect(cloud.trips.has(doc.meta.id)).toBe(true))
  })
})
