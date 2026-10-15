// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../App'
import { exampleDoc, useApp, configureCloud, useRepo } from '../app/store'
import { memoryRepo } from '../app/repo'
import { memoryAuth } from '../auth/authClient'
import { createOutbox } from '../sync/outbox'
import type { OutboxIO } from '../sync/outbox'
import { memoryCloud } from '../sync/testing'

// M4.8 (spec publicação §3.1, §5): viagens da nuvem na tela — selos, ícone de nuvem, edições de outro
// aparelho, sem internet e mudanças que o servidor não aplicou.

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

function memoryIO(): OutboxIO {
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
const ANA = { uid: 'ana', name: 'Ana', email: 'ana@teste.invalid', picture: null }

beforeEach(() => {
  useRepo(memoryRepo())
  auth = memoryAuth()
  cloud = memoryCloud(() => auth.current()?.uid ?? null)
  configureCloud({ auth, api: cloud.api, outbox: createOutbox(memoryIO()), app: 'teste' })
  localStorage.setItem('ludotrip.tutorial', '1')
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
  history.replaceState(null, '', '/')
})

/** Cria uma viagem com a Ana logada: nasce na nuvem e abre. */
async function criarNaNuvem() {
  act(() => auth.signInAs(ANA))
  const doc = exampleDoc('japao')
  doc.meta.example = undefined
  doc.meta.name = 'Japão na nuvem'
  await act(() => S().addTrip(doc))
  await waitFor(() => expect(S().cloud?.status).toBe('saved'))
  return doc.meta.id
}

describe('viagem da nuvem na tela', () => {
  it('sem conta, a viagem criada fica 📱 só neste aparelho', async () => {
    await waitFor(() => expect(S().ready).toBe(true))
    const doc = exampleDoc('rio')
    doc.meta.example = undefined
    await act(() => S().addTrip(doc))
    act(() => S().goHome())
    expect(await screen.findByText('📱 só neste aparelho')).toBeTruthy()
    expect(cloud.trips.size).toBe(0)
  })

  it('com conta, nasce ☁️: selo na lista, ícone "tudo salvo" e edições chegam ao servidor', async () => {
    const id = await criarNaNuvem()
    expect(cloud.trips.has(id)).toBe(true)
    expect(screen.getByRole('button', { name: 'Tudo salvo na sua conta.' })).toBeTruthy()
    act(() => void S().act({ type: 'rename', name: 'Japão 2030' }))
    expect(S().doc!.meta.name).toBe('Japão 2030')
    await waitFor(() => expect(cloud.trips.get(id)!.server.state.doc.meta.name).toBe('Japão 2030'))
    await waitFor(() => expect(S().cloud).toEqual({ status: 'saved', pending: 0 }))
    act(() => S().goHome())
    expect(await screen.findByText('☁️ salva na sua conta')).toBeTruthy()
  })

  it('edição feita noutro aparelho aparece na hora, com aviso', async () => {
    const id = await criarNaNuvem()
    act(() => cloud.remoteEdit(id, 'ana', 'remoto-1', { type: 'rename', name: 'Nome do outro celular' }))
    await waitFor(() => expect(S().doc!.meta.name).toBe('Nome do outro celular'))
    expect(S().toast?.text).toMatch(/^Noutro aparelho: /)
  })

  it('sem internet: a mudança fica guardada, o ícone avisa, e vai sozinha quando a rede volta', async () => {
    const id = await criarNaNuvem()
    act(() => cloud.offline())
    await waitFor(() => expect(S().cloud?.status).toBe('offline'))
    act(() => void S().act({ type: 'rename', name: 'Feito offline' }))
    expect(S().doc!.meta.name).toBe('Feito offline')
    await waitFor(() => expect(S().cloud).toEqual({ status: 'offline', pending: 1 }))
    expect(
      screen.getByRole('button', { name: /Sem internet · 1 alteração guardada neste aparelho/ }),
    ).toBeTruthy()
    act(() => {
      cloud.online()
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => expect(cloud.trips.get(id)!.server.state.doc.meta.name).toBe('Feito offline'))
    await waitFor(() => expect(S().cloud).toEqual({ status: 'saved', pending: 0 }))
  })

  it('mudança que não cabe mais (alguém tirou a atividade) vira painel com o motivo, sem sumir calada', async () => {
    const id = await criarNaNuvem()
    const place = S().doc!.places[0]!
    act(() => cloud.offline())
    await waitFor(() => expect(S().cloud?.status).toBe('offline'))
    act(() => void S().act({ type: 'setPlace', id: place.id, patch: { note: 'minha anotação' } }))
    act(() => cloud.remoteEdit(id, 'bia', 'remoto-2', { type: 'removePlace', id: place.id }))
    act(() => {
      cloud.online()
      window.dispatchEvent(new Event('online'))
    })
    expect(await screen.findByText('Sua mudança não foi aplicada')).toBeTruthy()
    await waitFor(() => expect(S().doc!.places.some((p) => p.id === place.id)).toBe(false))
    expect(S().cloud).toEqual({ status: 'saved', pending: 0 })
  })

  it('viagem da conta nunca baixada aqui, sem internet: diz o que fazer', async () => {
    const id = await criarNaNuvem()
    act(() => S().goHome())
    // Outro aparelho: sem a cópia local.
    useRepo(memoryRepo())
    await act(() => S().refreshTrips())
    expect(S().trips.find((t) => t.id === id)?.cloud?.version).toBe(-1)
    act(() => cloud.offline())
    await act(() => S().openTrip(id))
    await waitFor(() => expect(S().toast?.text).toMatch(/ainda não foi baixada neste aparelho/))
    expect(S().screen).toBe('home')
    act(() => {
      cloud.online()
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => expect(S().screen).toBe('trip'))
    expect(S().doc!.meta.name).toBe('Japão na nuvem')
  })

  it('apagar uma viagem da nuvem com Desfazer: some da conta e volta inteira', async () => {
    const id = await criarNaNuvem()
    act(() => S().goHome())
    await act(() => S().removeTrip(id))
    expect(cloud.trips.has(id)).toBe(false)
    expect(S().trips.some((t) => t.id === id)).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(cloud.trips.has(id)).toBe(true))
    await waitFor(() => expect(S().trips.find((t) => t.id === id)?.cloud).toBeTruthy())
  })

  it('duas abas com a mesma viagem do aparelho: a outra recarrega quando esta salva', async () => {
    const repo = memoryRepo()
    useRepo(repo)
    await waitFor(() => expect(S().ready).toBe(true))
    const doc = exampleDoc('rio')
    doc.meta.example = undefined
    await act(() => S().addTrip(doc))
    // A "outra aba" muda a viagem e avisa pelo canal entre abas.
    const other = new BroadcastChannel('ludotrip')
    await repo.save({ ...doc, meta: { ...doc.meta, name: 'Mudado na outra aba' } })
    other.postMessage({ t: 'saved', id: doc.meta.id })
    await waitFor(() => expect(S().doc!.meta.name).toBe('Mudado na outra aba'))
    other.close()
  })

  it('o endereço acompanha a tela: /v/<id> na viagem, / em "Suas viagens"', async () => {
    const id = await criarNaNuvem()
    await waitFor(() => expect(location.pathname).toBe(`/v/${id}`))
    act(() => S().goHome())
    await waitFor(() => expect(location.pathname).toBe('/'))
  })

  it('abrir direto no endereço: abre a viagem; o primeiro Voltar leva a "Suas viagens" sem sair', async () => {
    const id = await criarNaNuvem()
    act(() => S().goHome())
    cleanup()
    useApp.setState({ ready: false, screen: 'home', doc: null, trips: [], cloud: null })
    history.replaceState(null, '', `/v/${id}`)
    render(<App />)
    await waitFor(() => expect(S().screen).toBe('trip'))
    expect(S().doc!.meta.id).toBe(id)
    fireEvent(window, new PopStateEvent('popstate', { state: null }))
    await waitFor(() => expect(S().screen).toBe('home'))
  })

  it('endereço de uma viagem da conta, sem estar logado: pede para entrar', async () => {
    const id = await criarNaNuvem()
    act(() => S().goHome())
    await act(() => auth.signOut())
    cleanup()
    useApp.setState({ ready: false, screen: 'home', doc: null, trips: [], cloud: null })
    history.replaceState(null, '', `/v/${id}`)
    render(<App />)
    // Abre ENTRAR dizendo por quê; depois de entrar, a viagem abre (a intenção é retomada).
    expect(await screen.findByText('Entrar para abrir esta viagem')).toBeTruthy()
    expect(S().screen).toBe('home')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar com Google' }))
    await waitFor(() => expect(S().screen).toBe('trip'))
    expect(S().doc!.meta.id).toBe(id)
    expect(S().sheet).toBeNull()
  })

  it('endereço de uma viagem de outra conta: diz como conseguir acesso', async () => {
    const id = await criarNaNuvem()
    act(() => S().goHome())
    act(() => auth.signInAs({ ...ANA, uid: 'bia', name: 'Bia' }))
    cleanup()
    useApp.setState({ ready: false, screen: 'home', doc: null, trips: [], cloud: null })
    history.replaceState(null, '', `/v/${id}`)
    render(<App />)
    await waitFor(() =>
      expect(S().toast?.text).toBe('Você ainda não está nesta viagem. Peça um convite a quem a criou.'),
    )
  })

  it('sem conta, as viagens da nuvem não aparecem', async () => {
    const id = await criarNaNuvem()
    act(() => S().goHome())
    await act(() => auth.signOut())
    await waitFor(() => expect(S().trips.some((t) => t.id === id)).toBe(false))
  })
})
