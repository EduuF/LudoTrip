// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../App'
import { configureCloud, exampleDoc, useApp, useRepo } from '../app/store'
import { memoryRepo } from '../app/repo'
import { memoryAuth } from '../auth/authClient'
import { createOutbox } from '../sync/outbox'
import type { OutboxIO } from '../sync/outbox'
import { memoryCloud } from '../sync/testing'

// M4.10 (spec publicação §3.3, §3.5): o painel ENTRAR, a volta do link de e-mail e "Sair da conta".

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

function start(path = '/') {
  history.replaceState(null, '', path)
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
}

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
  sessionStorage.clear()
})
afterEach(() => {
  S().goHome()
  cleanup()
  configureCloud(null)
  history.replaceState(null, '', '/')
})

describe('ENTRAR', () => {
  it('"Entrar" no topo; com Google, o painel fecha e aparece o rosto da conta', async () => {
    start()
    fireEvent.click(await screen.findByRole('button', { name: 'Entrar' }))
    expect(screen.getByRole('dialog', { name: 'ENTRAR' })).toBeTruthy()
    expect(screen.getByText('Entrar para guardar suas viagens')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar com Google' }))
    await waitFor(() => expect(S().account?.uid).toBe('ana'))
    await waitFor(() => expect(S().sheet).toBeNull())
    expect(screen.getByRole('button', { name: 'Sua conta: Ana' })).toBeTruthy()
  })

  it('fechar a janela do Google não mostra erro; sem internet, diz que a viagem continua salva', async () => {
    start()
    fireEvent.click(await screen.findByRole('button', { name: 'Entrar' }))
    auth.failNext('cancelled')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar com Google' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continuar com Google' })).not.toHaveProperty(
        'disabled',
        true,
      ),
    )
    expect(S().toast).toBeNull()
    expect(S().sheet?.kind).toBe('signin')
    auth.failNext('offline')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar com Google' }))
    await waitFor(() => expect(S().toast?.text).toMatch(/Sem internet\. Sua viagem continua salva aqui/))
    expect(S().account).toBeNull()
  })

  it('link por e-mail: só envia e-mail válido; depois, "neste mesmo celular", Reenviar espera e Trocar e-mail volta', async () => {
    start()
    fireEvent.click(await screen.findByRole('button', { name: 'Entrar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Receber link por e-mail' }))
    const field = screen.getByRole('textbox', { name: 'Seu e-mail' })
    fireEvent.change(field, { target: { value: 'ana@' } })
    expect(screen.getByRole('button', { name: 'Enviar link' })).toHaveProperty('disabled', true)
    fireEvent.change(field, { target: { value: 'ana@exemplo.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }))
    expect(await screen.findByText('Veja seu e-mail ✉️')).toBeTruthy()
    expect(screen.getByText('neste mesmo celular')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Reenviar \(\d+ s\)/ })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'Trocar e-mail' }))
    expect((screen.getByRole('textbox', { name: 'Seu e-mail' }) as HTMLInputElement).value).toBe(
      'ana@exemplo.com',
    )
  })

  it('volta do link de e-mail noutro aparelho: pede para confirmar o e-mail e entra', async () => {
    auth.failNext('needs-email')
    start('/entrar/link?apiKey=x&oobCode=y&mode=signIn')
    expect(await screen.findByText('Confirme seu e-mail')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Seu e-mail' }), {
      target: { value: 'bia@exemplo.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e entrar' }))
    await waitFor(() => expect(S().account?.email).toBe('bia@exemplo.com'))
    await waitFor(() => expect(location.pathname).toBe('/'))
    await waitFor(() => expect(S().sheet).toBeNull())
  })

  it('link de e-mail vencido: avisa e pede outro', async () => {
    auth.failNext('invalid')
    start('/entrar/link?oobCode=velho')
    await waitFor(() => expect(S().toast?.text).toBe('Este link de entrar não vale mais. Peça outro.'))
    expect(location.pathname).toBe('/')
  })
})

describe('Sua conta', () => {
  it('sair com alterações não enviadas pergunta; "Sair mesmo assim" tira as viagens da conta deste aparelho', async () => {
    start()
    act(() => auth.signInAs({ uid: 'ana', name: 'Ana', email: 'ana@teste.invalid', picture: null }))
    const guest = exampleDoc('rio')
    guest.meta.example = undefined
    guest.meta.name = 'Só no aparelho'
    act(() => auth.signInAs(null))
    await act(() => S().addTrip(guest))
    act(() => S().goHome())
    act(() => auth.signInAs({ uid: 'ana', name: 'Ana', email: 'ana@teste.invalid', picture: null }))
    const doc = exampleDoc('japao')
    doc.meta.example = undefined
    doc.meta.name = 'Na conta'
    await act(() => S().addTrip(doc))
    await waitFor(() => expect(S().cloud?.status).toBe('saved'))
    act(() => cloud.offline())
    await waitFor(() => expect(S().cloud?.status).toBe('offline'))
    act(() => void S().act({ type: 'rename', name: 'Mudado offline' }))
    act(() => S().goHome())
    fireEvent.click(await screen.findByRole('button', { name: 'Sua conta: Ana' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }))
    expect(await screen.findByText(/1 alteração ainda não foi enviada\./)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Esperar enviar' }))
    expect(S().account).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sair mesmo assim' }))
    await waitFor(() => expect(S().account).toBeNull())
    await waitFor(() => expect(S().trips.map((t) => t.name)).toEqual(['Só no aparelho']))
    expect(await S().pendingCount()).toBe(0)
  })
})
