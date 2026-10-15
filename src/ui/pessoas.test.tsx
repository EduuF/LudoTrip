// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App'
import { exampleDoc, useApp, configureCloud, useRepo } from '../app/store'
import { memoryRepo } from '../app/repo'
import { memoryAuth } from '../auth/authClient'
import { createOutbox } from '../sync/outbox'
import type { OutboxIO } from '../sync/outbox'
import { memoryCloud } from '../sync/testing'

// M5 (spec publicação §4): PESSOAS, CONVIDAR, o membro, "Só vê" e Apagadas, na tela.

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
  configureCloud({
    auth,
    api: cloud.api,
    people: cloud.people,
    outbox: createOutbox(memoryIO()),
    app: 'teste',
  })
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

const dialog = async () => within(await screen.findByRole('dialog'))

describe('pessoas e convites', () => {
  it('"+" no topo: planejar junto, vai viajar, o Convidado aparece na hora e o link sai', async () => {
    const id = await criarNaNuvem()
    const before = S().doc!.itinerary.travelers.length
    fireEvent.click(screen.getByRole('button', { name: 'Chamar alguém' }))
    let d = await dialog()
    fireEvent.click(d.getByRole('button', { name: /Planejar junto/ }))
    d = await dialog()
    fireEvent.click(d.getByRole('button', { name: /Sim, vai/ }))
    d = await dialog()
    expect(await d.findByLabelText('Link do convite')).toBeTruthy()
    expect(d.getByLabelText('Link do convite').textContent).toMatch(/\/convite\//)
    expect(d.getByRole('button', { name: 'Por e-mail' })).toHaveProperty('disabled', true)
    expect(S().doc!.itinerary.travelers).toHaveLength(before + 1)
    expect(S().doc!.itinerary.travelers.at(-1)!.name).toBe('Convidado')
    const inv = [...cloud.invites.values()][0]!
    expect(inv).toMatchObject({
      tripId: id,
      role: 'editor',
      travelerId: S().doc!.itinerary.travelers.at(-1)!.id,
    })
    fireEvent.click(d.getByRole('button', { name: 'Pronto ✓' }))
    d = await dialog()
    expect(d.getByText('Convites aguardando')).toBeTruthy()
    expect(d.getByText(/Link · enviado agora · Planeja junto · vai viajar/)).toBeTruthy()
    expect(d.getByText('convite aguardando')).toBeTruthy()
  })

  it('cancelar o convite tira o Convidado', async () => {
    await criarNaNuvem()
    const n = S().doc!.itinerary.travelers.length
    await act(async () => void (await S().createInvite('viewer', true)))
    await act(() => S().loadPeople())
    expect(S().doc!.itinerary.travelers).toHaveLength(n + 1)
    await act(() => S().cancelInvite(S().people!.invites[0]!))
    expect(S().doc!.itinerary.travelers).toHaveLength(n)
    expect(S().people!.invites).toEqual([])
  })

  it('viagem do aparelho sem conta: chamar alguém pede para entrar antes', async () => {
    await waitFor(() => expect(S().ready).toBe(true))
    const doc = exampleDoc('rio')
    doc.meta.example = undefined
    await act(() => S().addTrip(doc))
    fireEvent.click(screen.getByRole('button', { name: 'Chamar alguém' }))
    await waitFor(() =>
      expect(S().sheet).toMatchObject({ kind: 'signin', intent: { kind: 'invite', id: doc.meta.id } }),
    )
  })

  it('o Dono troca o papel e tira alguém', async () => {
    const id = await criarNaNuvem()
    cloud.nameAs('bia', 'Bia')
    cloud.members
      .get(id)!
      .push({ uid: 'bia', name: 'Bia', fullName: 'Bia Lopes', photo: null, role: 'editor', joinedAt: 1 })
    await act(() => S().loadPeople())
    act(() => S().openSheet({ kind: 'people' }))
    let d = await dialog()
    fireEvent.click(d.getByRole('button', { name: /^Bia/ }))
    d = await dialog()
    fireEvent.click(d.getByRole('radio', { name: 'Só vê' }))
    await waitFor(() => expect(cloud.members.get(id)!.find((m) => m.uid === 'bia')!.role).toBe('viewer'))
    fireEvent.click(d.getByRole('button', { name: 'Tirar da viagem…' }))
    fireEvent.click(d.getByRole('button', { name: 'Tirar Bia' }))
    await waitFor(() => expect(cloud.members.get(id)!.some((m) => m.uid === 'bia')).toBe(false))
    await waitFor(() => expect(S().toast?.text).toBe('Bia saiu da viagem.'))
  })
})

describe('Só vê', () => {
  it('sem Desfazer, com a etiqueta, e nenhuma ação passa', async () => {
    const id = await criarNaNuvem()
    const doc = S().doc!
    act(() =>
      useApp.setState({
        doc: { ...doc, meta: { ...doc.meta, cloud: { ...doc.meta.cloud!, role: 'viewer' } } },
      }),
    )
    expect(screen.queryByRole('button', { name: '↶ Desfazer' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '👁 Você está vendo' }))
    expect((await dialog()).getByRole('button', { name: 'Pedir para planejar junto' })).toBeTruthy()
    let ok = true
    act(() => void (ok = S().act({ type: 'rename', name: 'Outro' })))
    expect(ok).toBe(false)
    expect(S().doc!.meta.name).toBe('Japão na nuvem')
    expect(S().toast?.text).toMatch(/Você está vendo esta viagem/)
    void id
  })
})

describe('Apagadas', () => {
  it('apagar uma viagem da nuvem: some, fica em Apagadas, e Desfazer recupera', async () => {
    const id = await criarNaNuvem()
    act(() => S().goHome())
    await act(() => S().removeTrip(id))
    expect(S().trips.some((t) => t.id === id)).toBe(false)
    expect(S().deleted.map((t) => t.id)).toEqual([id])
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(S().trips.some((t) => t.id === id)).toBe(true))
    expect(S().deleted).toEqual([])
  })
})
