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
import type { SheetSpec } from '../ui/sheetTypes'
import { sfx, setSound } from '../ui/sound'
import { docProgress } from './tasks'
import type { Account, AuthClient } from '../auth/authClient'
import type { CloudApi } from '../sync/cloudApi'
import type { Outbox } from '../sync/outbox'
import { TripSync } from '../sync/tripSync'
import type { Refusal, SyncStatus } from '../sync/tripSync'
import { SCHEMA_VERSION } from './doc'
import { describeRefusal, mergeTrips, stripCloud, withCloud } from './cloudTrips'

export type Tab = 'mapa' | 'atividades' | 'tarefas'
export type Screen = 'home' | 'trip' | 'create'
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
  init(): Promise<void>
  /** Junta as viagens do aparelho com as da conta. */
  refreshTrips(): Promise<void>
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
  outbox: Outbox
  /** Versão do app (vai no `hello` e nos logs). */
  app: string
}
let cloudDeps: CloudDeps | null = null
let unsubAuth: (() => void) | null = null
export const configureCloud = (deps: CloudDeps | null) => {
  cloudDeps = deps
}
/** A viagem da nuvem aberta agora. */
let sync: TripSync | null = null
let syncTripId: string | null = null
/** Avisos de edições de outros aparelhos chegando em rajada viram um só. */
let remoteBurst = { at: 0, count: 0 }
/** Viagem pedida pelo endereço (/v/<id>) que ainda depende de saber quem está logado. */
let pendingRoute: string | null = null
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
      () => {
        if (saveWarned) return
        saveWarned = true
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
      return doc
    }
    return save(doc)
  }

  /** Apagar uma viagem da nuvem (só quem criou), com Desfazer que a sobe de novo. */
  const removeCloudTrip = async (meta: TripMeta, deps: CloudDeps) => {
    if (meta.cloud?.role !== 'owner') return toast('Só quem criou a viagem pode apagá-la.', true)
    const copy = await repo.load(meta.id)
    if (!(await deps.api.remove(meta.id)))
      return toast('Sem internet: não deu para apagar agora. Tente quando a conexão voltar.', true)
    await repo.remove(meta.id)
    await deps.outbox.clear(meta.id)
    await get().refreshTrips()
    if (!copy) return toast(`${meta.name} apagada.`)
    toast(`${meta.name} apagada.`, false, true, () => {
      void (async () => {
        const doc = stripCloud(copy)
        const up = await deps.api.upload(doc)
        if (!up.ok) return toast('Sem internet: não deu para trazer de volta.', true)
        await repo.save(withCloud(doc, { ...meta.cloud!, version: up.version }))
        await get().refreshTrips()
        set({ toast: null })
      })()
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

  /** O endereço pediu uma viagem: abre, ou diz por que não dá (spec publicação §3.5). */
  const resolvePendingRoute = async () => {
    const id = pendingRoute
    if (!id) return
    pendingRoute = null
    const account = get().account
    if (get().trips.some((t) => t.id === id)) return get().openTrip(id)
    if (!account) return toast('Esta viagem está numa conta. Entre para abrir.', true)
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
    const who = msg.by === get().account?.uid ? 'Noutro aparelho' : 'Alguém'
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
  const openCloudTrip = async (id: string, loaded: TripDoc | null, meta: CloudMeta) => {
    const deps = cloudDeps
    if (!deps || !get().account) return toast('Esta viagem está numa conta. Entre para abrir.', true)
    stopSync()
    const base =
      loaded && meta.version >= 0 ? { doc: stripCloud(migrate(loaded)), version: meta.version } : null
    let shown = false
    const s = new TripSync({
      tripId: id,
      outbox: deps.outbox,
      connect: deps.api.connector(id),
      base,
      schemaVersion: SCHEMA_VERSION,
      app: deps.app,
      onView: (v) => {
        if (sync !== s) return
        const doc = v.doc ? withCloud(v.doc, { ...meta, version: s.version }) : null
        if (doc && !shown) {
          shown = true
          showTrip(doc)
        } else if (doc) set({ doc })
        set({ cloud: { status: v.status, pending: v.pending } })
        if (!doc && v.status === 'offline' && !shown)
          toast(
            'Esta viagem ainda não foi baixada neste aparelho. Conecte-se uma vez para levá-la junto.',
            true,
          )
      },
      onBase: (b) => void repo.save(withCloud(b.doc, { ...meta, version: b.version })).catch(() => undefined),
      onRemote: (m, before) => {
        if (sync === s) remoteToast(m, before)
      },
      onRefused: (list) => {
        if (sync === s) refusalSheet(list)
      },
      onGone: (reason) => {
        if (sync !== s) return
        stopSync()
        void repo.remove(id)
        void deps.outbox.clear(id)
        get().goHome()
        const name = get().doc?.meta.name ?? loaded?.meta.name ?? 'A viagem'
        toast(reason === 'deleted' ? `${name} foi apagada.` : `Você não faz mais parte de ${name}.`, true)
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

    async init() {
      // O endereço é lido antes de tudo (a tela inicial troca o endereço para "/").
      const route = cloudDeps ? parseRoute(location.pathname) : null
      const theme = readThemeChoice()
      applyTheme(theme)
      const trips = await repo.list()
      set({ trips: trips.filter((t) => !t.cloud), ready: true, theme, cloudEnabled: !!cloudDeps })
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
        addEventListener('online', () => sync?.poke())
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
      unsubAuth?.()
      unsubAuth =
        cloudDeps?.auth.onChange((account) => {
          set({ account })
          void get()
            .refreshTrips()
            .then(() => resolvePendingRoute())
        }) ?? null
    },

    async refreshTrips() {
      const local = await repo.list()
      const account = get().account
      const remote = cloudDeps && account ? await cloudDeps.api.listTrips() : null
      const { trips, drop } = mergeTrips(local, remote, !!account)
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
      set({ screen: 'home', sheet: null, toast: null, undoStack: [], playing: false, cloud: null })
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
      const opId = newOpId()
      const r = runDoc(before, action, { opId })
      if (!r.ok) {
        const text = describeError(r.error, before.itinerary, before)
        if (text) toast(text, true)
        return false
      }
      const after = commit(r.doc, action, opId)
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
      await get().refreshTrips()
      await get().openTrip(doc.meta.id)
      celebrate({ kind: 'created', name: doc.meta.name })
      sfx.level()
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
