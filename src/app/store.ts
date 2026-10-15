import { create } from 'zustand'
import { days as allDays, describeError, describeUndoRefusal, placeStates } from '../engine'
import type { ID } from '../engine'
import { ALL_TRIPS } from '../engine/fixtures/trips'
import { migrate, runDoc } from './doc'
import type { CloudMeta, DocAction, TripDoc, TripMeta, UndoStep } from './doc'
import { narrate } from './narration'
import { localRepo } from './repo'
import type { TripRepo } from './repo'
import { applyTheme, readThemeChoice } from './theme'
import type { ThemeChoice } from './theme'
import { markTutorialSeen, tutorialSeen } from './tutorial'
import { parseRoute } from './routePaths'
import { captureError, identify, track } from './telemetry'
import type { SheetSpec } from '../ui/sheetTypes'
import { sfx, setSound } from '../ui/sound'
import { docProgress } from './tasks'
import type { Account, AuthClient, SignInResult } from '../auth/authClient'
import type { SignInIntent } from '../ui/sheetTypes'
import type { CloudApi } from '../sync/cloudApi'
import type { Outbox } from '../sync/outbox'
import { TripSync } from '../sync/tripSync'
import type { Refusal, SyncStatus } from '../sync/tripSync'
import { SCHEMA_VERSION } from './doc'
import { describeRefusal, mergeTrips, stripCloud, withCloud } from './cloudTrips'
import { canEdit, nameOf } from './people'
import type {
  DeletedTrip,
  HistoryItem,
  PeopleApi,
  People,
  PendingInvite,
  PreviewResult,
} from '../sync/peopleApi'
import type { Role } from '../sync/protocol'

export type Tab = 'mapa' | 'atividades' | 'tarefas'
export type Screen = 'home' | 'trip' | 'create' | 'invite'
export type ExampleKey = keyof typeof ALL_TRIPS
/** O mapa mostra a viagem inteira ou uma cidade (com as atividades de cada dia). */
export type MapView = { kind: 'trip' } | { kind: 'city'; destId: ID }

export interface ToastState {
  id: number
  text: string
  warn: boolean
  undo: boolean
  /** Desfazer especial (ex.: trazer de volta uma viagem apagada). */
  action?: () => void
  /** Texto do botão do `action` (padrão: "Desfazer"). */
  actionLabel?: string
}

export type CelebrationBody =
  | { kind: 'xp'; amount: number }
  | { kind: 'level'; level: number; name: string }
  | { kind: 'stamp' }
  | { kind: 'burst' }
  | { kind: 'page'; name: string }
  | { kind: 'created'; name: string }
export type Celebration = { id: number } & CelebrationBody

interface ActOptions {
  /** Carimbo 済 (algo foi garantido). */
  stamp?: boolean
  /** Pétalas (algo saiu, "puf"). */
  burst?: boolean
  /** Deixa o painel aberto. Regra: painel-editor (vários campos: trecho, atividade, visita, hospedagem,
   *  "Sua viagem") fica aberto ao mudar um campo; painel de escolha fecha ao escolher. */
  keep?: boolean
}

export interface AppState {
  ready: boolean
  screen: Screen
  tab: Tab
  trips: TripMeta[]
  doc: TripDoc | null
  undoStack: { steps: UndoStep[]; text: string }[]
  toast: ToastState | null
  celebrations: Celebration[]
  sheet: SheetSpec | null
  /** Painéis por baixo do aberto (spec §17.13): "‹ voltar" desempilha; fechar limpa. */
  sheetBack: SheetSpec[]
  /** Direção da última troca de painel (para a animação). */
  sheetDir: 'in' | 'back'
  /** Painel de criar com texto digitado e não criado: sair pergunta "Criar ou Descartar". */
  sheetGuard: SheetGuard | null
  /** Dia escolhido (índice em `days()`): sincroniza trilha, mapa e cartão do dia. */
  cursorDay: number | null
  /** Cartão do roteiro aberto (acordeão); null segue o dia do cursor. */
  openStop: ID | null
  /** A pessoa fechou o cartão aberto. */
  stopCollapsed: boolean
  mapView: MapView
  /** À espera de um toque no mapa: marcar esta atividade, ou criar uma nova ('new'). */
  placing: ID | 'new' | null
  /** "▶ Ver a viagem": os dias passam sozinhos. */
  playing: boolean
  /** "Como jogar" aberto. */
  tutorial: boolean
  theme: ThemeChoice
  focus: string | null
  sound: boolean
  /** Quem está usando (null: sem conta; tudo fica no aparelho). */
  account: Account | null
  /** A viagem aberta é da nuvem: como está o envio (spec publicação §5.4). */
  cloud: { status: SyncStatus; pending: number } | null
  /** Este app ficou antigo para o servidor: precisa recarregar. */
  needsUpgrade: boolean
  /** A nuvem existe neste build (no GitHub Pages, não: tudo fica no aparelho, como antes). */
  cloudEnabled: boolean
  /** Quem participa da viagem da nuvem aberta (spec publicação §4.2). */
  people: People | null
  /** Viagens apagadas para todos, ainda recuperáveis (só do Dono). */
  deleted: DeletedTrip[]
  /** O convite aberto pelo link (/convite/<token>). */
  invite: { token: string; result: PreviewResult | null; busy: boolean } | null
  /** Relê as pessoas da viagem aberta. */
  loadPeople(): Promise<void>
  /** CONVIDAR: cria o convite (e o "Convidado" no mapa, se a pessoa vai viajar). Devolve o link. */
  createInvite(role: Exclude<Role, 'owner'>, travels: boolean): Promise<string | null>
  cancelInvite(invite: PendingInvite): Promise<void>
  /** Reenviar: um link novo com o mesmo papel e o mesmo "Convidado" (o antigo para de valer). */
  resendInvite(invite: PendingInvite): Promise<string | null>
  setMemberRole(uid: string, role: Exclude<Role, 'owner'>): Promise<void>
  removeMember(uid: string, alsoTraveler: boolean): Promise<void>
  leaveTrip(): Promise<void>
  transferTrip(uid: string): Promise<void>
  restoreTrip(id: string): Promise<void>
  loadHistory(before?: number): Promise<{ items: HistoryItem[]; more: boolean } | null>
  /** Chamar alguém: viagem do aparelho vai antes para a conta (com ENTRAR, se preciso). */
  startInvite(): void
  /** Abre a prévia de um convite. */
  openInvite(token: string): Promise<void>
  /** "Entrar e participar": sem conta, ENTRAR primeiro; com conta, entra e abre a viagem. */
  acceptInvite(): Promise<void>
  init(): Promise<void>
  /** Junta as viagens do aparelho com as da conta. */
  refreshTrips(): Promise<void>
  /** Abre o painel ENTRAR; depois de entrar, faz o que a pessoa queria (`intent`). */
  openSignIn(reason: string, intent?: SignInIntent): void
  /** Quantas alterações ainda não foram para a nuvem (para "Sair da conta"). */
  pendingCount(): Promise<number>
  /** Sai da conta: tira deste aparelho as cópias das viagens da conta e a fila (privacidade). */
  signOut(): Promise<void>
  /** Volta do link de e-mail (/entrar/link). Sem o e-mail guardado aqui, pergunta. */
  completeEmailLink(email?: string): Promise<SignInResult>
  /** Guardar na nuvem (spec publicação §3.2–3.4): sem conta, abre ENTRAR; com conta, sobe já. */
  saveToCloud(id: string): Promise<void>
  /** Leva para a conta as viagens do aparelho escolhidas (ou todas). */
  uploadTrips(ids: string[]): Promise<void>
  /** Viagens que acabaram de subir (os cartões fazem a animação). */
  justUploaded: string[]
  openTrip(id: string): Promise<void>
  goHome(): void
  goCreate(): void
  setTab(tab: Tab): void
  act(action: DocAction, opts?: ActOptions): boolean
  undo(): void
  say(text: string, warn?: boolean): void
  /** Com um painel aberto, empilha o atual (ou troca, com `replace`). */
  openSheet(sheet: SheetSpec, opts?: { replace?: boolean }): void
  patchSheet(patch: Partial<SheetSpec>): void
  closeSheet(): void
  /** Volta ao painel de baixo; com `kind`, ao último painel daquele tipo. */
  backSheet(kind?: SheetSpec['kind']): void
  setSheetGuard(guard: SheetGuard | null): void
  /** Um passo terminou: volta ao painel de origem pela pilha (mantendo o "‹ voltar" dele), ou o abre. */
  returnToSheet(spec: SheetSpec): void
  setCursorDay(index: number | null): void
  /** Entra no mapa da cidade; o cursor de dias vai para o primeiro dia dela, como na v1. */
  enterCity(destId: ID): void
  toggleStop(stopId: ID, isOpen: boolean): void
  openStopCard(stopId: ID): void
  exitCity(): void
  /** Volta um passo (spec §17.14): painel → tutorial → "marcar no mapa" → outra aba → cidade → viagem → início.
   *  O "‹" do topo, o Escape e o Voltar do sistema usam todos este. Devolve se havia para onde voltar. */
  stepBack(): boolean
  setPlacing(what: ID | 'new' | null): void
  setPlaying(on: boolean): void
  setTutorial(on: boolean): void
  setTheme(choice: ThemeChoice): void
  focusOn(elementId: string, tab?: Tab): void
  clearFocus(): void
  /** Abre a cópia já existente do exemplo, ou cria uma. */
  addExample(key: ExampleKey): Promise<void>
  addTrip(doc: TripDoc): Promise<void>
  /** Apaga com aviso e Desfazer (a viagem volta inteira). */
  removeTrip(id: string): Promise<void>
  renameTrip(id: string, name: string): Promise<void>
  dismiss(id: number): void
  toggleSound(): void
}

let repo: TripRepo = localRepo()
/** Para testes. */
export const useRepo = (r: TripRepo) => {
  repo = r
}

/** A nuvem (spec publicação §2): login, API e fila de saída. Sem ela, o app é só do aparelho. */
export interface CloudDeps {
  auth: AuthClient
  api: CloudApi
  /** Pessoas e convites (M5). */
  people?: PeopleApi
  outbox: Outbox
  /** Versão do app (vai no `hello` e nos logs). */
  app: string
}
let cloudDeps: CloudDeps | null = null
let unsubAuth: (() => void) | null = null
export const configureCloud = (deps: CloudDeps | null) => {
  cloudDeps = deps
}
/** O login, para as telas de conta (null sem nuvem). */
export const authClient = (): AuthClient | null => cloudDeps?.auth ?? null
/** A viagem da nuvem aberta agora. */
let sync: TripSync | null = null
let syncTripId: string | null = null
/** Avisos de edições de outros aparelhos chegando em rajada viram um só. */
let remoteBurst = { at: 0, count: 0 }
/** Viagem pedida pelo endereço (/v/<id>) que ainda depende de saber quem está logado. */
let pendingRoute: string | null = null

/** A última conta que entrou neste aparelho (decide se as viagens daqui sobem sozinhas). */
const LAST_UID = 'ludotrip.lastUid'
const readLastUid = () => {
  try {
    return localStorage.getItem(LAST_UID)
  } catch {
    return null
  }
}
const writeLastUid = (uid: string) => {
  try {
    localStorage.setItem(LAST_UID, uid)
  } catch {
    // sem armazenamento: na próxima vez, pergunta de novo
  }
}

/** O que a pessoa queria ao abrir ENTRAR; sobrevive ao redirecionamento do login do Google. */
const INTENT_KEY = 'ludotrip.intent'
const saveIntent = (intent: SignInIntent | null) => {
  try {
    if (intent) sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent))
    else sessionStorage.removeItem(INTENT_KEY)
  } catch {
    // sem armazenamento: a intenção vale só nesta página
  }
}
const takeIntent = (): SignInIntent | null => {
  try {
    const raw = sessionStorage.getItem(INTENT_KEY)
    sessionStorage.removeItem(INTENT_KEY)
    return raw ? (JSON.parse(raw) as SignInIntent) : null
  } catch {
    return null
  }
}
let wired = false
const channel: BroadcastChannel | null =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('ludotrip')

let seq = 0
const nextId = () => ++seq

export function exampleDoc(key: ExampleKey, now = Date.now()): TripDoc {
  const t = ALL_TRIPS[key]()
  return {
    meta: { id: `ex-${key}-${now.toString(36)}`, name: t.name, example: key, createdAt: now, updatedAt: now },
    itinerary: t.itinerary,
    ...(t.scope ? { scope: t.scope } : {}),
    destinations: t.destinations,
    places: t.places,
    bookings: t.bookings,
    seq: 0,
  }
}

/** Viagens de exemplo salvas antes ganham o que as fixtures ganharam depois (lugar no mapa, escopo). */
export function refreshExample(doc: TripDoc): TripDoc {
  const key = doc.meta.example
  if (!key || !(key in ALL_TRIPS)) return doc
  const fresh = ALL_TRIPS[key as ExampleKey]()
  const byName = new Map(fresh.places.map((p) => [`${p.destinationId}|${p.name}`, p]))
  let changed = false
  const places = doc.places.map((p) => {
    if (p.lat !== undefined) return p
    const f = byName.get(`${p.destinationId}|${p.name}`)
    if (!f || f.lat === undefined || f.lon === undefined) return p
    changed = true
    return { ...p, lat: f.lat, lon: f.lon, ...(f.kind ? { kind: f.kind } : {}) }
  })
  const scope = doc.scope ?? fresh.scope
  if (!changed && (doc.scope || !fresh.scope)) return doc
  return { ...doc, places, ...(scope ? { scope } : {}) }
}

function completedPages(doc: TripDoc): Set<ID> {
  const states = placeStates(doc.itinerary, doc.places)
  const out = new Set<ID>()
  for (const d of doc.destinations) {
    const mine = doc.places.filter((p) => p.destinationId === d.id)
    if (mine.length >= 3 && mine.every((p) => states.get(p.id)?.days.length)) out.add(d.id)
  }
  return out
}

let saveWarned = false

/** O que perguntar ao sair de um painel de criar com algo digitado. */
export interface SheetGuard {
  /** "Comprar o JR Pass" (o que foi digitado). */
  text: string
  create: () => void
}

export const useApp = create<AppState>((set, get) => {
  const save = (doc: TripDoc) => {
    const stamped = { ...doc, meta: { ...doc.meta, updatedAt: Date.now() } }
    void persist(stamped).then(() => get().refreshTrips())
    return stamped
  }
  /** Salva no aparelho; se falhar, avisa uma vez (não a cada toque) e segue com a viagem na memória. */
  const persist = (doc: TripDoc) =>
    repo.save(doc).then(
      () => {
        saveWarned = false
        // Outra aba com a mesma viagem do aparelho aberta recarrega (spec publicação §3.5).
        channel?.postMessage({ t: 'saved', id: doc.meta.id })
      },
      (e: unknown) => {
        if (saveWarned) return
        saveWarned = true
        captureError(e instanceof Error ? e : new Error('falha ao salvar no aparelho'), { kind: 'salvar' })
        toast('Não consegui salvar no aparelho: as mudanças valem só enquanto esta aba estiver aberta.', true)
      },
    )
  const toast = (text: string, warn = false, undo = false, action?: () => void) => {
    const id = nextId()
    set({ toast: { id, text, warn, undo, ...(action ? { action } : {}) } })
    setTimeout(
      () => {
        if (get().toast?.id === id) set({ toast: null })
      },
      action ? 8000 : 6000,
    )
  }
  const celebrate = (c: CelebrationBody) =>
    set((s) => ({ celebrations: [...s.celebrations, { ...c, id: nextId() }] }))

  /** Abre a tela da viagem do zero (aba Mapa, nada selecionado). */
  const showTrip = (doc: TripDoc) =>
    set({
      doc,
      screen: 'trip',
      tab: 'mapa',
      undoStack: [],
      sheet: null,
      cursorDay: null,
      openStop: null,
      stopCollapsed: false,
      mapView: { kind: 'trip' },
      placing: null,
      playing: false,
      tutorial: !tutorialSeen(),
      toast: null,
    })

  /**
   * Grava o resultado de uma ação: no aparelho (viagem 📱) ou na fila da nuvem (☁️, a tela já mostra o
   * resultado e o servidor confirma depois).
   */
  const commit = (doc: TripDoc, action: DocAction, opId: string): TripDoc => {
    if (sync && syncTripId === doc.meta.id) {
      void sync.submit({ opId, tripId: doc.meta.id, action, at: Date.now() })
      const view = sync.view()
      if (view.status === 'offline') track('offline_fila', { pending: view.pending })
      return doc
    }
    return save(doc)
  }

  /** Apagar uma viagem da nuvem (só o Dono): vai para "Apagadas" por 30 dias; o Desfazer recupera. */
  const removeCloudTrip = async (meta: TripMeta, deps: CloudDeps) => {
    if (meta.cloud?.role !== 'owner') return toast('Só o Dono da viagem pode apagá-la.', true)
    if (!(await deps.api.remove(meta.id)))
      return toast('Sem internet: não deu para apagar agora. Tente quando a conexão voltar.', true)
    await repo.remove(meta.id)
    await deps.outbox.clear(meta.id)
    if (syncTripId === meta.id) get().goHome()
    await get().refreshTrips()
    track('viagem_apagada', { cloud: true })
    toast(`${meta.name} apagada. Fica em Apagadas por 30 dias.`, false, true, () => {
      set({ toast: null })
      void get().restoreTrip(meta.id)
    })
  }

  /** Renomear da lista uma viagem da nuvem fechada: a ação vai pela fila, como qualquer outra. */
  const renameCloudTrip = async (copy: TripDoc, name: string, deps: CloudDeps) => {
    const meta = copy.meta.cloud!
    const detached: TripSync = new TripSync({
      tripId: copy.meta.id,
      outbox: deps.outbox,
      connect: deps.api.connector(copy.meta.id),
      base: meta.version >= 0 ? { doc: stripCloud(copy), version: meta.version } : null,
      schemaVersion: SCHEMA_VERSION,
      app: deps.app,
      onView: (v) => {
        if (v.status === 'saved') {
          detached.stop()
          void get().refreshTrips()
        }
      },
      onBase: (b) => void repo.save(withCloud(b.doc, { ...meta, version: b.version })).catch(() => undefined),
      // Sem internet: não insiste; a ação fica na fila e vai quando a viagem abrir.
      schedule: (): void => detached.stop(),
    })
    await detached.start()
    await detached.submit({
      opId: newOpId(),
      tripId: copy.meta.id,
      action: { type: 'rename', name },
      at: Date.now(),
    })
    set((s) => ({ trips: s.trips.map((t) => (t.id === copy.meta.id ? { ...t, name } : t)) }))
  }

  /** Viagens que já estão noutra conta: levar uma cópia (id novo) ou deixar só aqui. */
  const ownedSheet = (docs: TripDoc[]) => {
    const first = docs[0]!
    set({
      sheet: {
        kind: 'choice',
        title:
          docs.length > 1
            ? `${docs.length} viagens já estão noutra conta`
            : `${first.meta.name} já está noutra conta`,
        sub: 'Ela foi guardada por outra pessoa neste aparelho. Você pode levar uma cópia para a sua conta.',
        options: [
          {
            label: docs.length > 1 ? 'Levar cópias' : 'Levar uma cópia',
            main: true,
            run: () => {
              get().closeSheet()
              void (async () => {
                const ids: string[] = []
                for (const d of docs) {
                  const copy: TripDoc = { ...d, meta: { ...d.meta, id: uid('t'), cloud: undefined } }
                  delete copy.meta.cloud
                  await repo.save(copy)
                  await repo.remove(d.meta.id)
                  ids.push(copy.meta.id)
                }
                await get().uploadTrips(ids)
              })()
            },
          },
          { label: 'Deixar só neste aparelho', run: () => get().closeSheet() },
        ],
      },
      sheetBack: [],
    })
  }

  /** Viagens do aparelho (📱) que podem ir para a conta (os exemplos ficam no aparelho). */
  const guestTrips = async () => (await repo.list()).filter((t) => !t.cloud && !t.example)

  /**
   * Acabou de entrar (spec publicação §3.3–3.4): as viagens do aparelho sobem e o que a pessoa queria
   * fazer continua. Aparelho que já teve outra conta pergunta antes (computador compartilhado).
   */
  const afterSignIn = async () => {
    const account = get().account
    if (account) {
      track('login_feito', {})
      const last = readLastUid()
      writeLastUid(account.uid)
      const guests = await guestTrips()
      if (guests.length && last && last !== account.uid)
        set({
          sheet: { kind: 'adopt', trips: guests.map((g) => ({ id: g.id, name: g.name })) },
          sheetBack: [],
        })
      else if (guests.length) await get().uploadTrips(guests.map((g) => g.id))
    }
    const intent = takeIntent()
    const s = get()
    // Fecha ENTRAR e volta ao painel de onde se veio (se havia um).
    if (s.sheet?.kind === 'signin') {
      if (s.sheetBack.length) s.backSheet()
      else set({ sheet: null })
    }
    if (!intent || intent.kind === 'none') return
    if (intent.kind === 'openTrip') return get().openTrip(intent.id)
    if (intent.kind === 'tripSheet' && get().screen === 'trip') get().openSheet({ kind: 'trip' })
    if (intent.kind === 'acceptInvite') {
      if (get().invite?.token !== intent.token)
        set({ invite: { token: intent.token, result: null, busy: false } })
      return get().acceptInvite()
    }
    if (intent.kind === 'invite') {
      set({ sheet: null, sheetBack: [] })
      await get().uploadTrips([intent.id])
      if (get().doc?.meta.cloud && get().doc?.meta.id === intent.id) get().openSheet({ kind: 'invite' })
      return
    }
    if (intent.kind === 'saveTrip') {
      // Feito o login, sobe esta viagem; o aviso "guardada ✓" e o selo ☁️ mostram o resultado.
      set({ sheet: null, sheetBack: [] })
      await get().uploadTrips([intent.id])
    }
  }

  /** O endereço pediu uma viagem: abre, ou diz por que não dá (spec publicação §3.5). */
  const resolvePendingRoute = async () => {
    const id = pendingRoute
    if (!id) return
    pendingRoute = null
    const account = get().account
    if (get().trips.some((t) => t.id === id)) return get().openTrip(id)
    if (!account) return get().openSignIn('para abrir esta viagem', { kind: 'openTrip', id })
    toast('Você ainda não está nesta viagem. Peça um convite a quem a criou.', true)
  }

  const stopSync = () => {
    sync?.stop()
    sync = null
    syncTripId = null
  }

  /** Uma ação de outro aparelho chegou: um aviso leve com o efeito (rajadas viram um aviso só). */
  const remoteToast = (msg: { action: DocAction; opId: string; by: string }, before: TripDoc) => {
    const r = runDoc(before, msg.action, { opId: msg.opId })
    if (!r.ok) return
    const who = msg.by === get().account?.uid ? 'Noutro aparelho' : (nameOf(msg.by, get().people) ?? 'Alguém')
    const now = Date.now()
    remoteBurst =
      now - remoteBurst.at < 3000 ? { at: now, count: remoteBurst.count + 1 } : { at: now, count: 1 }
    const text =
      remoteBurst.count > 1
        ? `${who}: ${remoteBurst.count} mudanças`
        : `${who}: ${narrate(msg.action, before, r.doc, r.effects)}`
    toast(text)
  }

  /** O servidor não aplicou uma ação deste aparelho: um painel com o motivo (spec publicação §5.3). */
  const refusalSheet = (list: Refusal[]) => {
    const doc = get().doc
    if (!doc || !list.length) return
    const first = list[0]!
    track('conflito', { count: list.length, reason: first.reason.code })
    const mins = Math.round((Date.now() - first.op.at) / 60000)
    const when = mins >= 1 ? ` (há ${mins} min)` : ''
    set({
      sheet: {
        kind: 'choice',
        title:
          list.length > 1
            ? `${list.length} mudanças suas não foram aplicadas`
            : 'Sua mudança não foi aplicada',
        sub: `${describeRefusal(first.reason, doc)}${when}`,
        options: [{ label: 'Ver a viagem', main: true, run: () => get().closeSheet() }],
      },
      sheetBack: [],
      undoStack: [],
    })
  }

  /** Abre uma viagem da nuvem: a cópia do aparelho na hora, e o servidor põe em dia (spec §5.2). */
  const openCloudTrip = async (
    id: string,
    loaded: TripDoc | null,
    meta: CloudMeta,
    opts: { keepView?: boolean } = {},
  ) => {
    const deps = cloudDeps
    if (!deps) return toast('Esta viagem está numa conta. Entre para abrir.', true)
    if (!get().account) return get().openSignIn('para abrir esta viagem', { kind: 'openTrip', id })
    stopSync()
    set({ people: null })
    // O papel pode mudar com a viagem aberta (o Dono trocou): a cópia guardada acompanha.
    let cm: CloudMeta = { ...meta }
    const base = loaded && cm.version >= 0 ? { doc: stripCloud(migrate(loaded)), version: cm.version } : null
    // `keepView`: a viagem já está na tela (acabou de subir): troca só a origem, mantendo aba e dia.
    let shown = !!opts.keepView
    const s = new TripSync({
      tripId: id,
      outbox: deps.outbox,
      connect: deps.api.connector(id),
      base,
      schemaVersion: SCHEMA_VERSION,
      app: deps.app,
      onView: (v) => {
        if (sync !== s) return
        const doc = v.doc ? withCloud(v.doc, { ...cm, version: s.version }) : null
        if (doc && !shown) {
          shown = true
          showTrip(doc)
          void get().loadPeople()
        } else if (doc) set({ doc })
        set({ cloud: { status: v.status, pending: v.pending } })
        if (!doc && v.status === 'offline' && !shown)
          toast(
            'Esta viagem ainda não foi baixada neste aparelho. Conecte-se uma vez para levá-la junto.',
            true,
          )
      },
      onBase: (b) => void repo.save(withCloud(b.doc, { ...cm, version: b.version })).catch(() => undefined),
      onPresence: (online) => {
        const p = get().people
        if (sync === s && p) set({ people: { ...p, online } })
      },
      onPeople: () => {
        if (sync === s) void get().loadPeople()
      },
      onJoined: (uid, name) => {
        if (sync !== s || uid === get().account?.uid) return
        toast(`${name} entrou na viagem 🎉`)
        sfx.level()
        track('pessoa_chegou', {})
      },
      onRole: (role) => {
        if (sync !== s) return
        const was = cm.role
        cm = { ...cm, role }
        const d = get().doc
        if (d) set({ doc: withCloud(stripCloud(d), { ...cm, version: s.version }), undoStack: [] })
        void get().refreshTrips()
        void get().loadPeople()
        if (role === was) return
        toast(
          role === 'owner'
            ? 'Agora a viagem é sua: você é o Dono.'
            : role === 'viewer'
              ? 'Agora você só pode ver esta viagem.'
              : 'Agora você planeja junto ✓',
        )
      },
      onRemote: (m, before) => {
        if (sync === s) remoteToast(m, before)
      },
      onRefused: (list) => {
        if (sync === s) refusalSheet(list)
      },
      onGone: (reason, by) => {
        if (sync !== s) return
        stopSync()
        void repo.remove(id)
        void deps.outbox.clear(id)
        get().goHome()
        const name = get().doc?.meta.name ?? loaded?.meta.name ?? 'A viagem'
        toast(
          reason === 'deleted'
            ? by && cm.role !== 'owner'
              ? `${by} apagou ${name}.`
              : `${name} foi apagada.`
            : `Você não faz mais parte de ${name}.`,
          true,
        )
      },
      onUpgrade: () => {
        set({ needsUpgrade: true })
        set({
          toast: {
            id: nextId(),
            text: 'Nova versão do LudoTrip ✨ Atualize para continuar editando.',
            warn: false,
            undo: false,
            action: () => location.reload(),
            actionLabel: 'Atualizar',
          },
        })
      },
    })
    sync = s
    syncTripId = id
    await s.start()
  }

  return {
    ready: false,
    screen: 'home',
    tab: 'mapa',
    trips: [],
    doc: null,
    undoStack: [],
    toast: null,
    celebrations: [],
    sheet: null,
    sheetBack: [],
    sheetDir: 'in',
    sheetGuard: null,
    cursorDay: null,
    openStop: null,
    stopCollapsed: false,
    mapView: { kind: 'trip' },
    placing: null,
    playing: false,
    tutorial: false,
    theme: 'auto',
    focus: null,
    sound: false,
    account: null,
    cloud: null,
    needsUpgrade: false,
    cloudEnabled: false,
    justUploaded: [],
    people: null,
    deleted: [],
    invite: null,

    async init() {
      // O endereço é lido antes de tudo (a tela inicial troca o endereço para "/").
      const route = cloudDeps ? parseRoute(location.pathname) : null
      const theme = readThemeChoice()
      applyTheme(theme)
      const trips = await repo.list()
      set({ trips: trips.filter((t) => !t.cloud), ready: true, theme, cloudEnabled: !!cloudDeps })
      track('app_aberto', { cloud: !!cloudDeps })
      if (channel)
        channel.onmessage = (e: MessageEvent<{ t: string; id: string }>) => {
          if (e.data?.t !== 'saved') return
          void get().refreshTrips()
          const open = get().doc
          if (open && open.meta.id === e.data.id && !open.meta.cloud && syncTripId !== open.meta.id)
            void repo.load(e.data.id).then((fresh) => {
              if (fresh && get().doc?.meta.id === fresh.meta.id) set({ doc: migrate(fresh), undoStack: [] })
            })
        }
      // A rede voltou ou a pessoa voltou ao app: a viagem da nuvem tenta conectar na hora.
      if (!wired && typeof window !== 'undefined') {
        wired = true
        addEventListener('online', () => {
          sync?.poke()
          // Viagens criadas sem internet com a conta aberta sobem quando a rede volta.
          if (get().account)
            void guestTrips().then((g) => {
              if (g.length) void get().uploadTrips(g.map((x) => x.id))
            })
        })
        addEventListener('offline', () => sync?.pause())
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') sync?.poke()
        })
      }
      // Aberto direto no endereço de uma viagem (/v/<id>): a do aparelho abre já; a da conta, depois
      // de saber quem está logado.
      if (route) {
        if (route.kind === 'trip') {
          const local = await repo.load(route.id)
          if (local && !local.meta.cloud) await get().openTrip(route.id)
          else pendingRoute = route.id
        }
      }
      if (route?.kind === 'emailLink') set({ sheet: { kind: 'signin', reason: 'pelo link do e-mail' } })
      if (route?.kind === 'invite') void get().openInvite(route.token)
      unsubAuth?.()
      unsubAuth =
        cloudDeps?.auth.onChange((account) => {
          const was = get().account
          set({ account })
          void identify(account?.uid ?? null)
          void get()
            .refreshTrips()
            .then(async () => {
              if (account && was?.uid !== account.uid) await afterSignIn()
              await resolvePendingRoute()
            })
        }) ?? null
      if (route?.kind === 'emailLink') void get().completeEmailLink()
    },

    async saveToCloud(id) {
      if (!cloudDeps) return
      if (!get().account) return get().openSignIn('para guardar na nuvem', { kind: 'saveTrip', id })
      await get().uploadTrips([id])
    },

    async uploadTrips(ids) {
      const deps = cloudDeps
      const account = get().account
      if (!deps || !account || !ids.length) return
      const done: string[] = []
      const owned: TripDoc[] = []
      let offline = false
      let limit = false
      for (const id of ids) {
        const raw = await repo.load(id)
        if (!raw || raw.meta.cloud) continue
        // Um exemplo guardado vira uma viagem da pessoa (deixa de ser exemplo).
        const migrated = migrate(raw)
        const { example: _example, ...meta } = migrated.meta
        void _example
        const doc: TripDoc = { ...migrated, meta }
        const r = await deps.api.upload(doc)
        if (r.ok) {
          await repo.save(withCloud(doc, { owner: account.uid, role: 'owner', version: r.version }))
          done.push(id)
        } else if (r.reason === 'owned') owned.push(doc)
        else if (r.reason === 'limit') limit = true
        else offline = true
      }
      await get().refreshTrips()
      // A viagem aberta que subiu continua aberta, agora na nuvem (sem perder a aba nem o dia).
      const open = get().doc
      if (open && done.includes(open.meta.id) && get().screen === 'trip') {
        const copy = await repo.load(open.meta.id)
        if (copy?.meta.cloud) await openCloudTrip(open.meta.id, copy, copy.meta.cloud, { keepView: true })
      }
      if (done.length) {
        track('viagens_subiram', { count: done.length })
        set({ justUploaded: done })
        setTimeout(() => set({ justUploaded: [] }), 2400)
        toast(
          done.length === 1
            ? 'Viagem guardada na sua conta ✓'
            : `${done.length} viagens guardadas na sua conta ✓`,
        )
        sfx.level()
      }
      if (limit) toast('Sua conta já tem 100 viagens. Apague alguma para guardar outra.', true)
      else if (offline && !done.length)
        toast(
          'Sem internet: suas viagens continuam salvas aqui e vão para a conta quando a conexão voltar.',
          true,
        )
      if (owned.length) ownedSheet(owned)
    },

    openSignIn(reason, intent) {
      track('login_oferecido', { trigger: reason })
      saveIntent(intent ?? null)
      get().openSheet({ kind: 'signin', reason, ...(intent ? { intent } : {}) })
    },

    async pendingCount() {
      return cloudDeps ? cloudDeps.outbox.count() : 0
    },

    async signOut() {
      const deps = cloudDeps
      if (!deps) return
      stopSync()
      for (const t of await repo.list()) if (t.cloud) await repo.remove(t.id)
      await deps.outbox.clear()
      await deps.auth.signOut()
      set({ sheet: null, sheetBack: [] })
      if (get().screen === 'trip' && get().doc?.meta.cloud) get().goHome()
      await get().refreshTrips()
      toast('Você saiu da conta. As viagens deste aparelho continuam aqui.')
    },

    async completeEmailLink(email) {
      const deps = cloudDeps
      if (!deps) return { ok: false, reason: 'error' }
      const r = await deps.auth.completeEmailLink(location.href, email)
      if (r.ok || (!r.ok && r.reason !== 'needs-email'))
        history.replaceState(history.state, '', import.meta.env.BASE_URL || '/')
      if (!r.ok && r.reason === 'needs-email')
        set({ sheet: { kind: 'signin', reason: 'pelo link do e-mail', step: 'confirmEmail' } })
      else if (!r.ok) {
        set({ sheet: null })
        toast('Este link de entrar não vale mais. Peça outro.', true)
      }
      return r
    },

    async refreshTrips() {
      const local = await repo.list()
      const account = get().account
      const remote = cloudDeps && account ? await cloudDeps.api.listTrips() : null
      const { trips, drop } = mergeTrips(local, remote, !!account)
      const deleted = cloudDeps?.people && account && remote ? await cloudDeps.people.deleted() : null
      set({ deleted: account ? (deleted ?? get().deleted) : [] })
      for (const m of drop) {
        await repo.remove(m.id)
        await cloudDeps?.outbox.clear(m.id)
        if (syncTripId === m.id) {
          sync?.stop()
          get().goHome()
          toast(`Você não faz mais parte de ${m.name}.`, true)
        }
      }
      set({ trips })
    },

    async openTrip(id) {
      const loaded = await repo.load(id)
      const listed = get().trips.find((t) => t.id === id)
      const cloudMeta = loaded?.meta.cloud ?? listed?.cloud
      if (cloudMeta) return openCloudTrip(id, loaded, cloudMeta)
      if (!loaded) return toast('Essa viagem não está mais aqui.', true)
      const doc = refreshExample(migrate(loaded))
      if (doc !== loaded) void persist(doc)
      showTrip(doc)
    },

    goHome() {
      stopSync()
      // Primeiro sai da tela da viagem; só depois solta o documento (nenhuma tela desenha sem viagem).
      set({
        screen: 'home',
        sheet: null,
        toast: null,
        undoStack: [],
        playing: false,
        cloud: null,
        people: null,
        invite: null,
      })
      setTimeout(() => {
        if (get().screen !== 'trip') set({ doc: null })
      }, 0)
      void get().refreshTrips()
    },

    goCreate() {
      set({ screen: 'create', sheet: null })
    },

    setTab(tab) {
      // Trocar de aba sai do modo "marcar no mapa" (o mapa some de vista).
      set({ tab, sheet: null, placing: null })
    },

    act(action, opts = {}) {
      const before = get().doc
      if (!before) return false
      if (!canEdit(before)) {
        toast('Você está vendo esta viagem. Para mudar algo, peça ao Dono para planejar junto.', true)
        return false
      }
      const opId = newOpId()
      const r = runDoc(before, action, { opId })
      if (!r.ok) {
        const text = describeError(r.error, before.itinerary, before)
        if (text) toast(text, true)
        return false
      }
      const after = commit(r.doc, action, opId)
      track('edicao', {
        type: action.type === 'engine' ? action.command.type : action.type,
        cloud: !!after.meta.cloud,
      })
      const text = narrate(action, before, after, r.effects)
      set((s) => ({
        doc: after,
        undoStack: [...s.undoStack.slice(-49), { steps: r.steps, text }],
        sheet: opts.keep ? s.sheet : null,
      }))
      toast(text, false, true)

      // Jogo: XP, nível, carimbo, destino completo (spec §17.1).
      const p0 = docProgress(before)
      const p1 = docProgress(after)
      if (opts.stamp) {
        celebrate({ kind: 'stamp' })
        sfx.stamp()
      }
      if (opts.burst) {
        celebrate({ kind: 'burst' })
        sfx.puf()
      }
      if (p1.xp > p0.xp) {
        celebrate({ kind: 'xp', amount: p1.xp - p0.xp })
        sfx.coin()
      }
      if (p1.level > p0.level) {
        celebrate({ kind: 'level', level: p1.level, name: p1.levelName })
        sfx.level()
      }
      const pages0 = completedPages(before)
      for (const id of completedPages(after)) {
        if (pages0.has(id)) continue
        celebrate({ kind: 'page', name: after.destinations.find((d) => d.id === id)?.name ?? '' })
      }
      return true
    },

    undo() {
      const { doc, undoStack } = get()
      const last = undoStack[undoStack.length - 1]
      if (!doc || !last) return toast(describeUndoRefusal('NOTHING_TO_UNDO'), true)
      if (!canEdit(doc)) return toast('Você está vendo esta viagem.', true)
      // O Desfazer é uma ação como as outras (spec publicação §5.2): na nuvem, vai pela mesma fila.
      const opId = newOpId()
      const revert: DocAction = { type: 'revert', steps: last.steps }
      const r = runDoc(doc, revert, { opId })
      if (!r.ok) return toast(describeUndoRefusal('CHANGED_SINCE'), true)
      set({ doc: commit(r.doc, revert, opId), undoStack: undoStack.slice(0, -1), sheet: null })
      toast(`Desfeito: ${last.text}`)
    },

    say(text, warn = false) {
      toast(text, warn)
    },

    openSheet(sheet, opts = {}) {
      track('painel_aberto', { kind: sheet.kind })
      const cur = get().sheet
      if (!cur || opts.replace) return set({ sheet, sheetDir: 'in', sheetGuard: null })
      set((s) => ({ sheet, sheetBack: [...s.sheetBack, cur].slice(-10), sheetDir: 'in', sheetGuard: null }))
    },
    backSheet(kind) {
      const stack = get().sheetBack
      let i = stack.length - 1
      if (kind) while (i >= 0 && stack[i]!.kind !== kind) i--
      if (i < 0) return set({ sheet: null })
      set({ sheet: stack[i]!, sheetBack: stack.slice(0, i), sheetDir: 'back', sheetGuard: null })
    },
    returnToSheet(spec) {
      const { sheet, sheetBack } = get()
      if (sheet && sheetBack.some((x) => x.kind === spec.kind)) return get().backSheet(spec.kind)
      set({ sheet: spec, sheetBack: [], sheetDir: 'back', sheetGuard: null })
    },
    setSheetGuard(guard) {
      set({ sheetGuard: guard })
    },
    patchSheet(patch) {
      const s = get().sheet
      if (s) set({ sheet: { ...s, ...patch } as SheetSpec })
    },
    closeSheet() {
      set({ sheet: null })
    },

    setCursorDay(index) {
      const { cursorDay, mapView, doc } = get()
      if (index === cursorDay) return
      const day = index !== null && doc ? allDays(doc.itinerary, doc.places)[index] : undefined
      // O cartão do roteiro aberto segue o dia (acordeão).
      set({ cursorDay: index, ...(day?.stopId ? { openStop: day.stopId, stopCollapsed: false } : {}) })
      if (index === null) return
      sfx.step()
      // No mapa da cidade, mudar o dia muda a cidade (a mesma regra do "▶ Ver a viagem").
      if (mapView.kind === 'city' && day?.destinationId && day.destinationId !== mapView.destId)
        get().enterCity(day.destinationId)
    },
    enterCity(destId) {
      const { doc, cursorDay } = get()
      if (!doc) return
      const mine = allDays(doc.itinerary, doc.places).filter((d) => d.destinationId === destId)
      const inCity = mine.some((d) => d.index === cursorDay)
      set({
        // De qualquer aba (ex.: "Ver no mapa da cidade" em Atividades), o mapa aparece.
        tab: 'mapa',
        mapView: { kind: 'city', destId },
        sheet: null,
        ...(mine.length && !inCity ? { cursorDay: mine[0]!.index } : {}),
      })
      sfx.enter()
    },
    exitCity() {
      set({ mapView: { kind: 'trip' }, placing: null })
    },
    stepBack() {
      const s = get()
      // O painel aberto (ou os passos de "Criar viagem") decide: pode perguntar "Criar ou Descartar".
      if ((s.sheet || s.screen === 'create') && localBack) {
        localBack()
        return true
      }
      if (s.sheet) {
        s.backSheet()
        return true
      }
      if (s.tutorial && s.screen === 'trip' && s.tab === 'mapa') {
        markTutorialSeen()
        set({ tutorial: false })
        return true
      }
      if (s.placing) {
        set({ placing: null })
        return true
      }
      if (s.screen === 'trip' && s.tab !== 'mapa') {
        set({ tab: 'mapa' })
        return true
      }
      if (s.screen === 'trip' && s.mapView.kind === 'city') {
        s.exitCity()
        return true
      }
      if (s.screen !== 'home') {
        s.goHome()
        return true
      }
      return false
    },
    toggleStop(stopId, isOpen) {
      if (isOpen) return set({ openStop: stopId, stopCollapsed: true })
      set({ openStop: stopId, stopCollapsed: false })
      // Abrir o cartão leva o cursor ao primeiro dia dele (mapa, trilha e cartão do dia seguem).
      const doc = get().doc
      const first = doc
        ? allDays(doc.itinerary, doc.places).find((d) => d.stopId === stopId && d.kind === 'stop')
        : undefined
      if (first) get().setCursorDay(first.index)
    },
    openStopCard(stopId) {
      const { openStop, stopCollapsed } = get()
      if (openStop !== stopId || stopCollapsed) set({ openStop: stopId, stopCollapsed: false })
    },
    setPlacing(what) {
      // Entrar no modo "marcar no mapa" fecha o painel; sair dele não mexe no painel (o clique no mapa
      // sai do modo e abre "Nova atividade").
      set(what ? { placing: what, sheet: null } : { placing: null })
    },
    setPlaying(on) {
      set({ playing: on })
    },
    setTutorial(on) {
      set({ tutorial: on, sheet: null })
    },
    setTheme(choice) {
      applyTheme(choice)
      set({ theme: choice })
    },

    focusOn(elementId, tab) {
      set((s) => ({ focus: elementId, tab: tab ?? s.tab, sheet: null }))
    },
    clearFocus() {
      set({ focus: null })
    },

    async addExample(key) {
      const existing = get().trips.find((t) => t.example === key)
      if (existing) return get().openTrip(existing.id)
      const doc = exampleDoc(key)
      await persist(doc)
      await get().refreshTrips()
      await get().openTrip(doc.meta.id)
    },

    async addTrip(doc) {
      // Com conta, a viagem já nasce na nuvem; sem internet, fica no aparelho e sobe depois.
      const account = get().account
      const up = cloudDeps && account ? await cloudDeps.api.upload(migrate(doc)) : null
      if (up?.ok)
        await repo.save(withCloud(migrate(doc), { owner: account!.uid, role: 'owner', version: up.version }))
      else await persist(doc)
      track('viagem_criada', { cloud: !!up?.ok })
      await get().refreshTrips()
      await get().openTrip(doc.meta.id)
      celebrate({ kind: 'created', name: doc.meta.name })
      sfx.level()
      // Sem conta: logo ao criar, o caminho para não perder a viagem (spec publicação §3.2).
      if (cloudDeps && !up?.ok) {
        toast('Viagem criada neste aparelho. Guarde na nuvem para não perder.', false, false, () => {
          set({ toast: null })
          void get().saveToCloud(doc.meta.id)
        })
        set((s) => (s.toast ? { toast: { ...s.toast, actionLabel: '☁️ Salvar' } } : {}))
      }
    },

    async removeTrip(id) {
      const listed = get().trips.find((t) => t.id === id)
      if (listed?.cloud && cloudDeps) return removeCloudTrip(listed, cloudDeps)
      const removed = await repo.load(id)
      await repo.remove(id)
      await get().refreshTrips()
      if (!removed) return
      toast(`${removed.meta.name} apagada.`, false, true, () => {
        void persist(removed).then(async () => (await get().refreshTrips(), set({ toast: null })))
      })
    },

    async renameTrip(id, name) {
      const d = await repo.load(id)
      if (!d) return
      if (d.meta.cloud && cloudDeps) return renameCloudTrip(d, name, cloudDeps)
      const r = runDoc(d, { type: 'rename', name }, { opId: newOpId() })
      if (!r.ok) return
      await persist({ ...r.doc, meta: { ...r.doc.meta, updatedAt: Date.now() } })
      await get().refreshTrips()
    },

    dismiss(id) {
      set((s) => ({ celebrations: s.celebrations.filter((c) => c.id !== id) }))
    },

    // --- Colaboração (spec publicação §4) ---

    async loadPeople() {
      const id = get().doc?.meta.id
      const api = cloudDeps?.people
      if (!id || !api || !get().doc?.meta.cloud) return
      const p = await api.people(id)
      if (p && get().doc?.meta.id === id) set({ people: p })
    },

    startInvite() {
      const doc = get().doc
      if (!doc) return
      if (doc.meta.cloud) return get().openSheet({ kind: 'invite' })
      if (!cloudDeps) return toast('Chamar pessoas precisa da versão com conta do LudoTrip.', true)
      // Viagem do aparelho: vai para a conta antes (as outras pessoas precisam de onde abrir).
      if (!get().account)
        return get().openSignIn('para chamar alguém para a viagem', { kind: 'invite', id: doc.meta.id })
      void (async () => {
        await get().uploadTrips([doc.meta.id])
        if (get().doc?.meta.cloud) get().openSheet({ kind: 'invite' })
      })()
    },

    async createInvite(role, travels) {
      const doc = get().doc
      const api = cloudDeps?.people
      if (!doc?.meta.cloud || !api) return null
      // "Sim, vai": o bonequinho "Convidado" aparece na hora, no mapa e em Quem vai.
      let travelerId: string | undefined
      if (travels) {
        travelerId = uid('t')
        const ok = get().act(
          {
            type: 'engine',
            command: { type: 'addTraveler', traveler: { id: travelerId, name: 'Convidado' } },
          },
          { keep: true },
        )
        if (!ok) return null
      }
      const r = await api.createInvite(doc.meta.id, role, travelerId)
      if (!r.ok) {
        // O convite não saiu: o "Convidado" não fica sobrando.
        if (travelerId)
          get().act({ type: 'engine', command: { type: 'removeTraveler', id: travelerId } }, { keep: true })
        toast(
          r.reason === 'full'
            ? 'Esta viagem já tem 20 pessoas.'
            : r.reason === 'invites-limit'
              ? 'Já há 10 convites aguardando. Cancele algum em Pessoas para chamar mais alguém.'
              : r.reason === 'role'
                ? 'Seu papel não deixa chamar alguém com esse papel.'
                : 'Sem internet: não deu para criar o convite agora.',
          true,
        )
        return null
      }
      track('convite_criado', { role, travels })
      void get().loadPeople()
      return r.url
    },

    async cancelInvite(inv) {
      const doc = get().doc
      const api = cloudDeps?.people
      if (!doc || !api) return
      const r = await api.revokeInvite(doc.meta.id, inv.id)
      if (!r.ok) return toast('Sem internet: não deu para cancelar o convite agora.', true)
      track('convite_cancelado', {})
      await get().loadPeople()
      const t = inv.travelerId
        ? get().doc?.itinerary.travelers.find((x) => x.id === inv.travelerId)
        : undefined
      // O "Convidado" sai junto (com Desfazer, que o deixa como viajante sem convite).
      if (t && !t.userId && (get().doc?.itinerary.travelers.length ?? 0) > 1)
        get().act({ type: 'engine', command: { type: 'removeTraveler', id: t.id } }, { keep: true })
      else toast('Convite cancelado: o link não vale mais.')
    },

    async resendInvite(inv) {
      const doc = get().doc
      const api = cloudDeps?.people
      if (!doc || !api) return null
      const off = await api.revokeInvite(doc.meta.id, inv.id)
      if (!off.ok) {
        toast('Sem internet: não deu para reenviar agora.', true)
        return null
      }
      const r = await api.createInvite(doc.meta.id, inv.role, inv.travelerId ?? undefined)
      await get().loadPeople()
      if (!r.ok) {
        toast('Sem internet: não deu para criar o link novo agora.', true)
        return null
      }
      track('convite_criado', { role: inv.role, travels: !!inv.travelerId })
      return r.url
    },

    async setMemberRole(uid, role) {
      const doc = get().doc
      const api = cloudDeps?.people
      if (!doc || !api) return
      const r = await api.setRole(doc.meta.id, uid, role)
      if (!r.ok) return toast('Sem internet: não deu para mudar o papel agora.', true)
      await get().loadPeople()
      const name = nameOf(uid, get().people) ?? 'A pessoa'
      toast(role === 'viewer' ? `${name} agora só vê a viagem.` : `${name} agora planeja junto.`)
    },

    async removeMember(uid, alsoTraveler) {
      const doc = get().doc
      const api = cloudDeps?.people
      if (!doc || !api) return
      const name = nameOf(uid, get().people) ?? 'A pessoa'
      const r = await api.removeMember(doc.meta.id, uid, alsoTraveler)
      if (!r.ok) return toast('Sem internet: não deu para tirar agora.', true)
      track('membro_removido', { traveler: alsoTraveler })
      set({ sheet: { kind: 'people' }, sheetBack: [] })
      await get().loadPeople()
      toast(`${name} saiu da viagem.`)
    },

    async leaveTrip() {
      const doc = get().doc
      const api = cloudDeps?.people
      const me = get().account?.uid
      if (!doc || !api || !me) return
      const r = await api.removeMember(doc.meta.id, me, false)
      if (!r.ok)
        return toast(
          r.reason === 'owner-must-transfer'
            ? 'Passe a viagem para alguém antes de sair.'
            : 'Sem internet: não deu para sair agora.',
          true,
        )
      track('saiu_da_viagem', {})
      stopSync()
      await repo.remove(doc.meta.id)
      await cloudDeps?.outbox.clear(doc.meta.id)
      get().goHome()
      toast(`Você saiu de ${doc.meta.name}.`)
    },

    async transferTrip(uid) {
      const doc = get().doc
      const api = cloudDeps?.people
      if (!doc || !api) return
      const name = nameOf(uid, get().people) ?? 'A pessoa'
      const r = await api.transfer(doc.meta.id, uid)
      if (!r.ok) return toast('Sem internet: não deu para passar a viagem agora.', true)
      track('viagem_passada', {})
      set({ sheet: { kind: 'people' }, sheetBack: [] })
      await get().loadPeople()
      toast(`${name} agora é o Dono. Você continua planejando junto.`)
    },

    async restoreTrip(id) {
      const api = cloudDeps?.people
      if (!api) return
      const r = await api.restore(id)
      if (!r.ok) return toast('Sem internet: não deu para recuperar agora.', true)
      track('viagem_recuperada', {})
      await get().refreshTrips()
      const name = get().trips.find((t) => t.id === id)?.name ?? 'A viagem'
      toast(`${name} voltou ✓`)
    },

    async loadHistory(before) {
      const id = get().doc?.meta.id
      const api = cloudDeps?.people
      if (!id || !api) return null
      if (!before) track('historico_aberto', {})
      return api.history(id, before)
    },

    async openInvite(token) {
      const api = cloudDeps?.people
      if (!api) return
      stopSync()
      set({ screen: 'invite', invite: { token, result: null, busy: false }, sheet: null, sheetBack: [] })
      const result = await api.preview(token)
      if (get().invite?.token !== token) return
      set({ invite: { token, result, busy: false } })
      track('convite_aberto', { ok: result.ok })
    },

    async acceptInvite() {
      const inv = get().invite
      const api = cloudDeps?.people
      if (!inv || !api) return
      if (!get().account)
        return get().openSignIn('para participar da viagem', { kind: 'acceptInvite', token: inv.token })
      set({ invite: { ...inv, busy: true } })
      const r = await api.accept(inv.token)
      if (!r.ok) {
        if (r.reason === 'offline' || r.reason === 'error') {
          set({ invite: { ...inv, busy: false } })
          return toast('Sem internet: não deu para entrar agora. Tente de novo.', true)
        }
        if (r.reason === 'auth') {
          set({ invite: { ...inv, busy: false } })
          return get().openSignIn('para participar da viagem', { kind: 'acceptInvite', token: inv.token })
        }
        set({
          invite: {
            ...inv,
            busy: false,
            result: { ok: false, reason: r.reason, ...(r.inviter ? { inviter: r.inviter } : {}) },
          },
        })
        return
      }
      track('convite_aceito', { role: r.role, already: r.already })
      set({ invite: null })
      await get().refreshTrips()
      await get().openTrip(r.tripId)
      const name = get().doc?.meta.name
      if (!r.already && name) toast(`Você entrou em ${name} 🎉`)
    },

    toggleSound() {
      const sound = !get().sound
      setSound(sound)
      set({ sound })
      if (sound) sfx.coin()
    },
  }
})

/** Data local de hoje ("AAAA-MM-DD"). Só a interface lê o relógio. */
export function todayISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Id de uma ação (spec publicação §5.2): os ids que ela cria derivam dele. */
export const newOpId = (): string => crypto.randomUUID()

/**
 * Id novo para coisas criadas na tela (visitas, reservas, atividades). Aleatório de verdade: dois
 * aparelhos criando ao mesmo tempo nunca colidem.
 */
export function uid(prefix: string): string {
  return `${prefix}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
}

/** Contagem regressiva até a meia-noite da primeira noite (dias + relógio), como na v1. */
export function countdownTo(
  start: string,
  now = new Date(),
): { days: number; hh: string; mm: string; ss: string } {
  const [y, m, d] = start.split('-').map(Number) as [number, number, number]
  const ms = Math.max(0, new Date(y, m - 1, d).getTime() - now.getTime())
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    days: Math.floor(ms / 864e5),
    hh: pad(Math.floor(ms / 36e5) % 24),
    mm: pad(Math.floor(ms / 6e4) % 60),
    ss: pad(Math.floor(ms / 1e3) % 60),
  }
}

// O que está por cima diz como voltar um passo: o painel (ao de baixo, ou fecha, perguntando antes se há
// texto não criado) ou "Criar viagem" (ao passo anterior).
let localBack: (() => void) | null = null
export const setLocalBack = (fn: (() => void) | null): void => {
  localBack = fn
}

// Painel fechado (por qualquer caminho: fechar, ação concluída, trocar de aba): a pilha e o guarda saem junto.
useApp.subscribe((s) => {
  if (!s.sheet && (s.sheetBack.length || s.sheetGuard)) useApp.setState({ sheetBack: [], sheetGuard: null })
})
