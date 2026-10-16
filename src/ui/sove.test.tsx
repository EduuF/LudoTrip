// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App'
import { exampleDoc, useApp, configureCloud, useRepo } from '../app/store'
import type { Tab } from '../app/store'
import { memoryRepo } from '../app/repo'
import { memoryAuth } from '../auth/authClient'
import { createOutbox } from '../sync/outbox'
import type { OutboxIO } from '../sync/outbox'
import { memoryCloud } from '../sync/testing'

// M5.7 (spec publicação §4.6): "Só vê" não tem controles de edição — não ficam cinza, não existem.
// A varredura entra como quem só vê, toca em todos os botões de cada aba e dos painéis que eles abrem,
// e anota qualquer um que tente editar (o app recusa com "Você está vendo esta viagem").

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

const S = () => useApp.getState()
let auth: ReturnType<typeof memoryAuth>
let cloud: ReturnType<typeof memoryCloud>

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
    toast: null,
    sheet: null,
    account: null,
  })
  render(<App />)
})
afterEach(() => {
  S().goHome()
  cleanup()
  configureCloud(null)
})

/** A Ana cria a viagem e chama a Bia para só ver; a Bia abre. */
async function abrirComoQuemSoVe() {
  act(() => auth.signInAs({ uid: 'ana', name: 'Ana', email: null, picture: null }))
  const doc = exampleDoc('japao')
  doc.meta.example = undefined
  await act(() => S().addTrip(doc))
  await waitFor(() => expect(S().cloud?.status).toBe('saved'))
  cloud.members
    .get(doc.meta.id)!
    .push({ uid: 'bia', name: 'Bia', fullName: null, photo: null, role: 'viewer', joinedAt: 2 })
  act(() => S().goHome())
  await act(() => auth.signOut())
  act(() => auth.signInAs({ uid: 'bia', name: 'Bia', email: null, picture: null }))
  await waitFor(() => expect(S().trips.find((t) => t.id === doc.meta.id)?.cloud?.role).toBe('viewer'))
  await act(() => S().openTrip(doc.meta.id))
  await waitFor(() => expect(S().screen).toBe('trip'))
  await waitFor(() => expect(S().doc?.meta.cloud?.role).toBe('viewer'))
  return doc.meta.id
}

/** Tocável de verdade: não desativado (nem por um fieldset) e não escondido pelo modo de leitura. */
const live = (b: Element) => !b.matches(':disabled') && !b.matches('.view-only button:not(.nav)')
const label = (b: Element) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim().slice(0, 60)
const main = () => document.querySelector('main') ?? document.body
const mainButtons = () =>
  [...main().querySelectorAll('button')].filter(
    (b) =>
      !b.closest('[role="dialog"]') &&
      !b.closest('[hidden]') &&
      !b.closest('nav') &&
      !b.closest('header') &&
      !(b as HTMLButtonElement).disabled,
  )

describe('Só vê: varredura', () => {
  it('nenhum botão de nenhuma aba (nem dos painéis que eles abrem) tenta editar', async () => {
    await abrirComoQuemSoVe()
    const refused: string[] = []
    let current = ''
    const off = useApp.subscribe((s, prev) => {
      if (s.toast && s.toast !== prev.toast && /Você está vendo/.test(s.toast.text)) refused.push(current)
    })
    const version = S().doc!.meta.cloud!.version
    for (const tab of ['mapa', 'atividades', 'tarefas'] as Tab[]) {
      act(() => S().setTab(tab))
      const count = Math.min(mainButtons().length, 60)
      for (let i = 0; i < count; i++) {
        act(() =>
          useApp.setState({ sheet: null, sheetBack: [], placing: null, tab, mapView: { kind: 'trip' } }),
        )
        const b = mainButtons()[i]
        if (!b) break
        current = `${tab} › ${label(b)}`
        act(() => void fireEvent.click(b))
        const d = document.querySelector('[role="dialog"]')
        if (!d) continue
        const inside = [...d.querySelectorAll('button')].filter(live)
        for (let k = 0; k < Math.min(inside.length, 30); k++) {
          const dlg = document.querySelector('[role="dialog"]')
          if (!dlg) break
          const x = [...dlg.querySelectorAll('button')].filter(live)[k]
          if (!x) break
          current = `${tab} › ${label(b)} › ${label(x)}`
          act(() => void fireEvent.click(x))
        }
      }
    }
    off()
    expect([...new Set(refused)]).toEqual([])
    expect(S().cloud?.pending ?? 0).toBe(0)
    expect(S().doc!.meta.cloud!.version).toBe(version)
  })

  it('nenhum controle de editar existe: criar, menus, noites, arrastar, marcar', async () => {
    await abrirComoQuemSoVe()
    const EDIT =
      /^\+|Adicionar|Mais opções de|Opções de|arraste|Marcar|marcar como feita|Divisa entre|Noites em|Nova atividade|Atividade em/
    for (const tab of ['mapa', 'atividades', 'tarefas'] as Tab[]) {
      act(() => S().setTab(tab))
      const found = mainButtons()
        .map(label)
        .filter((l) => EDIT.test(l))
      expect(found, tab).toEqual([])
    }
    expect(document.querySelectorAll('.tr-handle, .shelf, .stepper').length).toBe(0)
  })

  it('o painel da atividade abre para ler: campos só de leitura, "Ver no mapa da cidade" continua', async () => {
    await abrirComoQuemSoVe()
    const gion = S().doc!.places.find((p) => p.name === 'Gion')!
    act(() => S().openSheet({ kind: 'sticker', placeId: gion.id }))
    const d = within(await screen.findByRole('dialog'))
    const ver = d.getByRole('button', { name: /Ver no mapa da cidade/ }) as HTMLButtonElement
    expect(ver.disabled).toBe(false)
    for (const i of document.querySelectorAll(
      '[role="dialog"] input:not([type="checkbox"]), [role="dialog"] textarea',
    ))
      expect((i as HTMLInputElement).readOnly).toBe(true)
    fireEvent.click(ver)
    await waitFor(() => expect(S().mapView).toMatchObject({ kind: 'city' }))
  })

  it('o topo mostra "Você está vendo" e não mostra Desfazer nem o "+ Chamar"', async () => {
    await abrirComoQuemSoVe()
    const hud = within(document.querySelector('header')!)
    expect(hud.getByRole('button', { name: '👁 Você está vendo' })).toBeTruthy()
    expect(hud.queryByRole('button', { name: '↶ Desfazer' })).toBeNull()
    expect(hud.queryByRole('button', { name: '+ Chamar' })).toBeNull()
    void screen
  })
})
