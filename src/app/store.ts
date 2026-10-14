import { create } from 'zustand'
import { days as allDays, describeError, describeUndoRefusal, placeStates } from '../engine'
import type { ID } from '../engine'
import { ALL_TRIPS } from '../engine/fixtures/trips'
import { migrate, runDoc } from './doc'
import type { DocAction, TripDoc, TripMeta, UndoStep } from './doc'
import { narrate } from './narration'
import { localRepo } from './repo'
import type { TripRepo } from './repo'
import { applyTheme, readThemeChoice } from './theme'
import type { ThemeChoice } from './theme'
import { markTutorialSeen, tutorialSeen } from './tutorial'
import type { SheetSpec } from '../ui/sheetTypes'
import { sfx, setSound } from '../ui/sound'
import { docProgress } from './tasks'

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
  init(): Promise<void>
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
    void persist(stamped).then(() => repo.list().then((trips) => set({ trips })))
    return stamped
  }
  /** Salva no aparelho; se falhar, avisa uma vez (não a cada toque) e segue com a viagem na memória. */
  const persist = (doc: TripDoc) =>
    repo.save(doc).then(
      () => {
        saveWarned = false
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

    async init() {
      const theme = readThemeChoice()
      applyTheme(theme)
      const trips = await repo.list()
      set({ trips, ready: true, theme })
    },

    async openTrip(id) {
      const loaded = await repo.load(id)
      if (!loaded) return toast('Essa viagem não está mais aqui.', true)
      const doc = refreshExample(migrate(loaded))
      if (doc !== loaded) void persist(doc)
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
    },

    goHome() {
      // Primeiro sai da tela da viagem; só depois solta o documento (nenhuma tela desenha sem viagem).
      set({ screen: 'home', sheet: null, toast: null, undoStack: [], playing: false })
      setTimeout(() => {
        if (get().screen !== 'trip') set({ doc: null })
      }, 0)
      void repo.list().then((trips) => set({ trips }))
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
      const after = save(r.doc)
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
      const r = runDoc(doc, { type: 'revert', steps: last.steps }, { opId: newOpId() })
      if (!r.ok) return toast(describeUndoRefusal('CHANGED_SINCE'), true)
      set({ doc: save(r.doc), undoStack: undoStack.slice(0, -1), sheet: null })
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
      set({ trips: await repo.list() })
      await get().openTrip(doc.meta.id)
    },

    async addTrip(doc) {
      await persist(doc)
      set({ trips: await repo.list() })
      await get().openTrip(doc.meta.id)
      celebrate({ kind: 'created', name: doc.meta.name })
      sfx.level()
    },

    async removeTrip(id) {
      const removed = await repo.load(id)
      await repo.remove(id)
      set({ trips: await repo.list() })
      if (!removed) return
      toast(`${removed.meta.name} apagada.`, false, true, () => {
        void persist(removed).then(async () => set({ trips: await repo.list(), toast: null }))
      })
    },

    async renameTrip(id, name) {
      const d = await repo.load(id)
      if (!d) return
      const r = runDoc(d, { type: 'rename', name }, { opId: newOpId() })
      if (!r.ok) return
      await persist({ ...r.doc, meta: { ...r.doc.meta, updatedAt: Date.now() } })
      set({ trips: await repo.list() })
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
