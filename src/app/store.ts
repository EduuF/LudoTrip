import { create } from 'zustand'
import { days as allDays, describeError, describeUndoRefusal, placeStates, progress } from '../engine'
import type { ID } from '../engine'
import { ALL_TRIPS } from '../engine/fixtures/trips'
import { runDoc, undoDoc } from './doc'
import type { DocAction, TripDoc, TripMeta, UndoStep } from './doc'
import { narrate } from './narration'
import { localRepo } from './repo'
import type { TripRepo } from './repo'
import type { SheetSpec } from '../ui/sheetTypes'
import { sfx, setSound } from '../ui/sound'

export type Tab = 'mapa' | 'mochila' | 'tarefas'
export type Screen = 'home' | 'trip' | 'create'
/** O mapa mostra a viagem inteira ou uma cidade (com os lugares de cada dia). */
export type MapView = { kind: 'trip' } | { kind: 'city'; destId: ID }
export type ExampleKey = keyof typeof ALL_TRIPS

export interface ToastState {
  id: number
  text: string
  warn: boolean
  undo: boolean
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
  openStop: ID | null
  /** Dia escolhido (índice em `days()`): sincroniza trilha, mapa e cartão do dia. */
  cursorDay: number | null
  mapView: MapView
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
  openSheet(sheet: SheetSpec): void
  patchSheet(patch: Partial<SheetSpec>): void
  closeSheet(): void
  setOpenStop(id: ID | null): void
  setCursorDay(index: number | null): void
  /** Entra no mapa da cidade; o cursor de dias vai para o primeiro dia dela, como na v1. */
  enterCity(destId: ID): void
  exitCity(): void
  focusOn(elementId: string, tab?: Tab): void
  clearFocus(): void
  addExample(key: ExampleKey): Promise<void>
  addTrip(doc: TripDoc): Promise<void>
  removeTrip(id: string): Promise<void>
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

function completedPages(doc: TripDoc): Set<ID> {
  const states = placeStates(doc.itinerary, doc.places)
  const out = new Set<ID>()
  for (const d of doc.destinations) {
    const mine = doc.places.filter((p) => p.destinationId === d.id)
    if (mine.length >= 3 && mine.every((p) => states.get(p.id)?.days.length)) out.add(d.id)
  }
  return out
}

export const useApp = create<AppState>((set, get) => {
  const save = (doc: TripDoc) => {
    const stamped = { ...doc, meta: { ...doc.meta, updatedAt: Date.now() } }
    void repo.save(stamped).then(() => repo.list().then((trips) => set({ trips })))
    return stamped
  }
  const toast = (text: string, warn = false, undo = false) => {
    const id = nextId()
    set({ toast: { id, text, warn, undo } })
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null })
    }, 6000)
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
    openStop: null,
    cursorDay: null,
    mapView: { kind: 'trip' },
    focus: null,
    sound: false,

    async init() {
      const trips = await repo.list()
      set({ trips, ready: true })
    },

    async openTrip(id) {
      const doc = await repo.load(id)
      if (!doc) return toast('Essa viagem não está mais aqui.', true)
      set({
        doc,
        screen: 'trip',
        tab: 'mapa',
        undoStack: [],
        sheet: null,
        openStop: null,
        cursorDay: null,
        mapView: { kind: 'trip' },
        toast: null,
      })
    },

    goHome() {
      // Primeiro sai da tela da viagem; só depois solta o documento (nenhuma tela desenha sem viagem).
      set({ screen: 'home', sheet: null, toast: null, undoStack: [], openStop: null })
      setTimeout(() => {
        if (get().screen !== 'trip') set({ doc: null })
      }, 0)
      void repo.list().then((trips) => set({ trips }))
    },

    goCreate() {
      set({ screen: 'create', sheet: null })
    },

    setTab(tab) {
      set({ tab, sheet: null })
    },

    act(action, opts = {}) {
      const before = get().doc
      if (!before) return false
      const r = runDoc(before, action)
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
        sheet: null,
      }))
      toast(text, false, true)

      // Jogo: XP, nível, carimbo, página completa (spec §17.1).
      const p0 = progress(before.itinerary, before)
      const p1 = progress(after.itinerary, after)
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
      const u = undoDoc(doc, last.steps)
      if (!u.ok) return toast(describeUndoRefusal(u.code), true)
      set({ doc: save(u.doc), undoStack: undoStack.slice(0, -1), sheet: null })
      toast(`Desfeito: ${last.text}`)
    },

    say(text, warn = false) {
      toast(text, warn)
    },

    openSheet(sheet) {
      set({ sheet })
    },
    patchSheet(patch) {
      const s = get().sheet
      if (s) set({ sheet: { ...s, ...patch } as SheetSpec })
    },
    closeSheet() {
      set({ sheet: null })
    },

    setOpenStop(id) {
      set({ openStop: id })
    },
    setCursorDay(index) {
      set({ cursorDay: index })
    },
    enterCity(destId) {
      const { doc, cursorDay } = get()
      if (!doc) return
      const mine = allDays(doc.itinerary, doc.places).filter((d) => d.destinationId === destId)
      const inCity = mine.some((d) => d.index === cursorDay)
      set({
        mapView: { kind: 'city', destId },
        sheet: null,
        ...(mine.length && !inCity ? { cursorDay: mine[0]!.index } : {}),
      })
      sfx.enter()
    },
    exitCity() {
      set({ mapView: { kind: 'trip' } })
    },

    focusOn(elementId, tab) {
      set((s) => ({ focus: elementId, tab: tab ?? s.tab, sheet: null }))
    },
    clearFocus() {
      set({ focus: null })
    },

    async addExample(key) {
      const doc = exampleDoc(key)
      await repo.save(doc)
      set({ trips: await repo.list() })
      await get().openTrip(doc.meta.id)
    },

    async addTrip(doc) {
      await repo.save(doc)
      set({ trips: await repo.list() })
      await get().openTrip(doc.meta.id)
      celebrate({ kind: 'created', name: doc.meta.name })
      sfx.level()
    },

    async removeTrip(id) {
      await repo.remove(id)
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

/** Id novo para coisas criadas na tela (visitas, reservas, figurinhas). */
export function uid(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
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
