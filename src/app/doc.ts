import { allVisits, applyUndo, dispatch, emptyEffects } from '../engine'
import type {
  Booking,
  Command,
  Destination,
  Effects,
  EngineError,
  ID,
  ISODate,
  Itinerary,
  Patch,
  Place,
  PlaceKind,
  Rarity,
  Scope,
} from '../engine'

import { rehome } from './tasks'
import type { Task, TaskMeta } from './tasks'

// O documento da viagem: itinerário (motor) + destinos, mochila e reservas.
// Toda ação de quem usa passa por runDoc e volta com o seu Desfazer, inclusive mochila e reservas.

export interface TripMeta {
  id: ID
  name: string
  /** Chave da viagem de exemplo, quando veio de uma. */
  example?: string
  createdAt: number
  updatedAt: number
}

export type { Scope }

export interface TripDoc {
  meta: TripMeta
  itinerary: Itinerary
  scope?: Scope
  destinations: Destination[]
  places: Place[]
  bookings: Booking[]
  /** Contador para ids novos (o motor é determinístico; os ids vêm daqui). */
  seq: number
  /** Versão do formato salvo (ausente = antes do M3.5). `migrate()` atualiza ao abrir. */
  schemaVersion?: number
  /** Tarefas escritas por quem viaja (spec §17.11). */
  tasks?: Task[]
  /** Prazo, quem faz, anotações e "Não preciso" das tarefas automáticas, pela chave `tipo:alvo`. */
  taskMeta?: Record<string, TaskMeta>
}

export const SCHEMA_VERSION = 1

/**
 * Atualiza uma viagem salva por uma versão anterior (spec §17.12). Hoje só garante as listas que o
 * motor percorre; cada formato novo (tarefas no M3.6, nuvem no M4) acrescenta um passo aqui.
 */
export function migrate(doc: TripDoc): TripDoc {
  if ((doc.schemaVersion ?? 0) >= SCHEMA_VERSION) return doc
  const it = doc.itinerary
  return {
    ...doc,
    destinations: doc.destinations ?? [],
    places: doc.places ?? [],
    bookings: doc.bookings ?? [],
    itinerary: {
      ...it,
      travelers: it.travelers ?? [],
      legs: it.legs ?? [],
      archivedLegs: it.archivedLegs ?? [],
      departurePlan: it.departurePlan ?? [],
      resources: it.resources ?? [],
      anchors: it.anchors ?? [],
      returned: it.returned ?? [],
    },
    schemaVersion: SCHEMA_VERSION,
  }
}

export type DocAction =
  | { type: 'engine'; command: Command }
  | { type: 'addPlace'; place: Omit<Place, 'id'> & { id?: ID } }
  | {
      type: 'setPlace'
      id: ID
      /** `note: ''` apaga as anotações gerais. */
      patch: { rarity?: Rarity; name?: string; lat?: number; lon?: number; kind?: PlaceKind; note?: string }
    }
  | { type: 'removePlace'; id: ID }
  | { type: 'addDestination'; destination: Destination }
  /** Só destinos fora do roteiro; leva as atividades deles (e as visitas de bate-volta), com Desfazer. */
  | { type: 'removeDestination'; id: ID }
  | { type: 'addBooking'; booking: Booking }
  | {
      type: 'setBooking'
      id: ID
      patch: { archived?: boolean; status?: 'planned' | 'booked'; title?: string }
    }
  | { type: 'removeBooking'; id: ID }
  | { type: 'rename'; name: string }
  | { type: 'addTask'; task: Task }
  /** Textos vazios (`note: ''`, `link: ''`) e `due: null` / `who: null` apagam o campo. */
  | {
      type: 'setTask'
      id: ID
      patch: Partial<Omit<Task, 'id' | 'createdAt' | 'due' | 'who'>> & {
        due?: ISODate | null
        who?: ID | null
      }
    }
  | { type: 'removeTask'; id: ID }
  /** `patch: null` apaga tudo o que se acrescentou; campos vazios/null apagam aquele campo. */
  | {
      type: 'setTaskMeta'
      key: string
      patch: {
        due?: ISODate | null
        note?: string
        who?: ID | null
        skip?: { reason?: string } | null
      } | null
    }
  | { type: 'batch'; actions: DocAction[] }

type Collection = 'destinations' | 'places' | 'bookings' | 'meta' | 'tasks' | 'taskMeta'
export type UndoStep = { kind: 'it'; patch: Patch } | { kind: 'col'; key: Collection; before: unknown }

export type RunDocResult =
  { ok: true; doc: TripDoc; steps: UndoStep[]; effects: Effects } | { ok: false; error: EngineError }

class DocFail extends Error {
  readonly error: EngineError
  constructor(error: EngineError) {
    super(error.code)
    this.error = error
  }
}

/** De onde vêm os ids novos de uma ação (spec publicação §5.2). */
export interface RunCtx {
  /**
   * Id único da ação (UUID). Os ids criados por ela são `<12 primeiros caracteres>.<n>`: a mesma ação
   * gera os mesmos ids no aparelho e no servidor, e ações de aparelhos diferentes nunca colidem.
   * Sem ele (testes antigos), os ids saem do contador `seq` da viagem.
   */
  opId?: string
}

export const opPrefix = (opId: string) => opId.replace(/-/g, '').slice(0, 12)

export function runDoc(doc: TripDoc, action: DocAction, ctx: RunCtx = {}): RunDocResult {
  const draft: TripDoc = { ...doc }
  const steps: UndoStep[] = []
  const effects = emptyEffects()
  let n = 0
  const prefix = ctx.opId ? opPrefix(ctx.opId) : null
  const newId = () => (prefix ? `${prefix}.${++n}` : `u${++draft.seq}`)
  const snapshot = (key: Collection) => steps.push({ kind: 'col', key, before: structuredClone(draft[key]) })

  const apply = (a: DocAction): void => {
    switch (a.type) {
      case 'engine': {
        const r = dispatch(draft.itinerary, a.command, { newId })
        if (!r.ok) throw new DocFail(r.error)
        draft.itinerary = r.state
        steps.push({ kind: 'it', patch: r.inverse })
        effects.returned.push(...r.effects.returned)
        effects.merged.push(...r.effects.merged)
        effects.legsArchived.push(...r.effects.legsArchived)
        effects.legsRestored.push(...r.effects.legsRestored)
        effects.legsCreated.push(...r.effects.legsCreated)
        return
      }
      case 'addPlace': {
        const name = a.place.name.trim()
        if (!name) throw new DocFail({ code: 'INVALID', data: { reason: 'empty-name' } })
        snapshot('places')
        draft.places = [...draft.places, { ...a.place, name, id: a.place.id ?? newId() }]
        return
      }
      case 'setPlace': {
        const i = draft.places.findIndex((p) => p.id === a.id)
        if (i < 0) throw new DocFail({ code: 'NOT_FOUND', data: { placeId: a.id } })
        // Nada muda (mesma prioridade, mesma anotação): sem Desfazer nem aviso.
        const cur = draft.places[i]! as unknown as Record<string, unknown>
        if (Object.entries(a.patch).every(([k, v]) => (cur[k] ?? '') === (v ?? ''))) return
        snapshot('places')
        draft.places = draft.places.map((p) => {
          if (p.id !== a.id) return p
          const next = { ...p, ...a.patch }
          if (!next.note) delete next.note
          return next
        })
        return
      }
      case 'removePlace': {
        if (!draft.places.some((p) => p.id === a.id))
          throw new DocFail({ code: 'NOT_FOUND', data: { placeId: a.id } })
        // Apagar a atividade tira a visita de todos os dias (com Desfazer).
        for (const v of allVisits(draft.itinerary).filter((x) => x.visit.placeId === a.id)) {
          const legId = v.where.startsWith('w:') ? v.where.slice(2) : null
          apply({
            type: 'engine',
            command: legId
              ? { type: 'removeWaypoint', legId, visitId: v.visit.id }
              : { type: 'unscheduleVisit', visitId: v.visit.id },
          })
        }
        snapshot('places')
        draft.places = draft.places.filter((p) => p.id !== a.id)
        return
      }
      case 'addDestination': {
        if (draft.destinations.some((d) => d.id === a.destination.id)) return
        snapshot('destinations')
        draft.destinations = [...draft.destinations, a.destination]
        return
      }
      case 'removeDestination': {
        if (!draft.destinations.some((d) => d.id === a.id))
          throw new DocFail({ code: 'NOT_FOUND', data: { destinationId: a.id } })
        if (draft.itinerary.stops.some((s) => s.destinationId === a.id))
          throw new DocFail({ code: 'INVALID', data: { reason: 'destination-in-trip' } })
        for (const p of draft.places.filter((x) => x.destinationId === a.id))
          apply({ type: 'removePlace', id: p.id })
        snapshot('destinations')
        draft.destinations = draft.destinations.filter((d) => d.id !== a.id)
        return
      }
      case 'addBooking': {
        snapshot('bookings')
        draft.bookings = [...draft.bookings, a.booking]
        return
      }
      case 'setBooking': {
        if (!draft.bookings.some((b) => b.id === a.id))
          throw new DocFail({ code: 'NOT_FOUND', data: { bookingId: a.id } })
        snapshot('bookings')
        draft.bookings = draft.bookings.map((b) => (b.id === a.id ? ({ ...b, ...a.patch } as Booking) : b))
        return
      }
      case 'removeBooking': {
        if (!draft.bookings.some((b) => b.id === a.id))
          throw new DocFail({ code: 'NOT_FOUND', data: { bookingId: a.id } })
        snapshot('bookings')
        draft.bookings = draft.bookings.filter((b) => b.id !== a.id)
        return
      }
      case 'rename': {
        const name = a.name.trim()
        if (!name || name === draft.meta.name) throw new DocFail({ code: 'NO_CHANGE' })
        snapshot('meta')
        draft.meta = { ...draft.meta, name }
        return
      }
      case 'addTask': {
        const title = a.task.title.trim()
        if (!title) throw new DocFail({ code: 'INVALID', data: { reason: 'empty-title' } })
        snapshot('tasks')
        draft.tasks = [...(draft.tasks ?? []), { ...a.task, title }]
        return
      }
      case 'setTask': {
        const cur = draft.tasks?.find((t) => t.id === a.id)
        if (!cur) throw new DocFail({ code: 'NOT_FOUND', data: { taskId: a.id } })
        const next = { ...cur } as Record<string, unknown>
        for (const [k, v] of Object.entries(a.patch)) {
          if (v === null || v === '' || (Array.isArray(v) && !v.length)) delete next[k]
          else next[k] = k === 'title' ? String(v).trim() || cur.title : v
        }
        if (JSON.stringify(next) === JSON.stringify(cur)) return
        snapshot('tasks')
        draft.tasks = draft.tasks!.map((t) => (t.id === a.id ? (next as unknown as Task) : t))
        return
      }
      case 'removeTask': {
        if (!draft.tasks?.some((t) => t.id === a.id))
          throw new DocFail({ code: 'NOT_FOUND', data: { taskId: a.id } })
        snapshot('tasks')
        draft.tasks = draft.tasks.filter((t) => t.id !== a.id)
        return
      }
      case 'setTaskMeta': {
        const all = { ...(draft.taskMeta ?? {}) }
        const cur = all[a.key] ?? {}
        const next: Record<string, unknown> = a.patch === null ? {} : { ...cur }
        if (a.patch)
          for (const [k, v] of Object.entries(a.patch)) {
            if (v === null || v === '') delete next[k]
            else next[k] = v
          }
        if (JSON.stringify(next) === JSON.stringify(cur)) return
        snapshot('taskMeta')
        if (Object.keys(next).length) all[a.key] = next as TaskMeta
        else delete all[a.key]
        draft.taskMeta = all
        return
      }
      case 'batch':
        for (const x of a.actions) apply(x)
        return
    }
  }

  try {
    apply(action)
  } catch (e) {
    if (e instanceof DocFail) return { ok: false, error: e.error }
    throw e
  }
  // Nada some calado: tarefas presas ao que deixou de existir viram "da viagem" (spec §17.11).
  if (steps.length && doc.tasks?.length) {
    const moved = rehome(
      draft.tasks ?? [],
      { it: doc.itinerary, names: doc },
      { it: draft.itinerary, names: draft },
    )
    if (moved) {
      snapshot('tasks')
      draft.tasks = moved
    }
  }
  if (!steps.length) return { ok: false, error: { code: 'NO_CHANGE' } }
  return { ok: true, doc: draft, steps, effects }
}

export type UndoDocResult = { ok: true; doc: TripDoc } | { ok: false; code: 'CHANGED_SINCE' }

/** Desfaz os passos de uma ação, do último para o primeiro. */
export function undoDoc(doc: TripDoc, steps: UndoStep[]): UndoDocResult {
  const next: TripDoc = { ...doc }
  for (const step of [...steps].reverse()) {
    if (step.kind === 'it') {
      const u = applyUndo(next.itinerary, step.patch)
      if (!u.ok) return { ok: false, code: 'CHANGED_SINCE' }
      next.itinerary = u.state
    } else {
      ;(next as unknown as Record<string, unknown>)[step.key] = structuredClone(step.before)
    }
  }
  return { ok: true, doc: next }
}
