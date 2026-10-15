import { allVisits, applyUndo, deepEqual, dispatch, emptyEffects, invertPatch } from '../engine'
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
  /**
   * Viagem da nuvem (spec publicação §3.1): só na cópia guardada neste aparelho, nunca no servidor.
   * `version` é a versão do servidor desta cópia (-1: ainda não baixada, só aparece na lista).
   */
  cloud?: CloudMeta
}

export interface CloudMeta {
  owner: string
  role: 'owner' | 'editor' | 'viewer'
  version: number
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
  /**
   * Desfazer como ação (spec publicação §5.2): passa pelo mesmo caminho das outras (fila, servidor) e
   * é recusado com `CHANGED_SINCE` se alguém mexeu depois. Gera os próprios passos (refazer).
   */
  | { type: 'revert'; steps: UndoStep[] }

type Collection = 'destinations' | 'places' | 'bookings' | 'meta' | 'tasks' | 'taskMeta'
/** Coleções que são listas de itens com `id`; as outras (`meta`, `taskMeta`) são registros por chave. */
const LISTS = new Set<Collection>(['destinations', 'places', 'bookings', 'tasks'])

/**
 * Um passo do Desfazer. Fora do roteiro, o passo é **por item** (spec publicação §5.2): desfazer só
 * mexe no item que a ação mudou, e só se ele ainda está como a ação o deixou. Assim o Desfazer de uma
 * pessoa nunca apaga o que outra mudou na mesma lista.
 */
export type UndoStep =
  | { kind: 'it'; patch: Patch }
  | {
      kind: 'item'
      key: Collection
      /** O `id` do item (listas) ou a chave (registros). */
      id: string
      before: unknown
      after: unknown
      /** Posição de antes na lista, para reinserir um item apagado no mesmo lugar. */
      index: number
    }

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
  // O primeiro retrato de cada coleção tocada; os passos por item saem da comparação no fim.
  const originals = new Map<Collection, unknown>()
  const snapshot = (key: Collection) => {
    if (!originals.has(key)) originals.set(key, structuredClone(draft[key]))
  }

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
      case 'revert': {
        for (const s of a.steps) if (s.kind === 'item') snapshot(s.key)
        const u = undoDoc(draft, a.steps)
        if (!u.ok) throw new DocFail({ code: 'CHANGED_SINCE' })
        Object.assign(draft, u.doc)
        // Os remendos do roteiro foram aplicados do último para o primeiro; o refazer guarda o inverso
        // de cada um nessa mesma ordem.
        for (const s of [...a.steps].reverse())
          if (s.kind === 'it') steps.push({ kind: 'it', patch: invertPatch(s.patch) })
        return
      }
    }
  }

  try {
    apply(action)
  } catch (e) {
    if (e instanceof DocFail) return { ok: false, error: e.error }
    throw e
  }
  // Nada some calado: tarefas presas ao que deixou de existir viram "da viagem" (spec §17.11).
  if ((steps.length || originals.size) && doc.tasks?.length) {
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
  for (const [key, before] of originals) steps.push(...itemSteps(key, before, draft[key]))
  if (!steps.length) return { ok: false, error: { code: 'NO_CHANGE' } }
  return { ok: true, doc: draft, steps, effects }
}

type Keyed = { id: string }
const entriesOf = (key: Collection, value: unknown): [string, unknown][] =>
  LISTS.has(key)
    ? ((value as Keyed[] | undefined) ?? []).map((x) => [x.id, x])
    : Object.entries((value as Record<string, unknown> | undefined) ?? {})

/** O que mudou numa coleção, item a item (ou chave a chave). */
function itemSteps(key: Collection, before: unknown, after: unknown): UndoStep[] {
  const b = entriesOf(key, before)
  const a = new Map(entriesOf(key, after))
  const out: UndoStep[] = []
  const seen = new Set<string>()
  b.forEach(([id, item], index) => {
    seen.add(id)
    const now = a.get(id)
    if (!deepEqual(item, now)) out.push({ kind: 'item', key, id, before: item, after: now ?? null, index })
  })
  ;[...a].forEach(([id, item], index) => {
    if (!seen.has(id)) out.push({ kind: 'item', key, id, before: null, after: item, index })
  })
  return out
}

export type UndoDocResult = { ok: true; doc: TripDoc } | { ok: false; code: 'CHANGED_SINCE' }

/** Desfaz os passos de uma ação, do último para o primeiro. Recusa se alguém mexeu depois. */
export function undoDoc(doc: TripDoc, steps: UndoStep[]): UndoDocResult {
  const next: TripDoc = { ...doc }
  const bag = next as unknown as Record<string, unknown>
  for (const step of [...steps].reverse()) {
    if (step.kind === 'it') {
      const u = applyUndo(next.itinerary, step.patch)
      if (!u.ok) return { ok: false, code: 'CHANGED_SINCE' }
      next.itinerary = u.state
      continue
    }
    const before = step.before === null ? undefined : structuredClone(step.before)
    if (LISTS.has(step.key)) {
      const list = [...((bag[step.key] as Keyed[] | undefined) ?? [])]
      const i = list.findIndex((x) => x.id === step.id)
      if (!deepEqual(i < 0 ? null : list[i], step.after)) return { ok: false, code: 'CHANGED_SINCE' }
      if (i >= 0) list.splice(i, 1)
      if (before) list.splice(i >= 0 ? i : Math.min(step.index, list.length), 0, before as Keyed)
      bag[step.key] = list
    } else {
      const rec = { ...((bag[step.key] as Record<string, unknown> | undefined) ?? {}) }
      if (!deepEqual(rec[step.id] ?? null, step.after)) return { ok: false, code: 'CHANGED_SINCE' }
      if (before === undefined) delete rec[step.id]
      else rec[step.id] = before
      bag[step.key] = rec
    }
  }
  return { ok: true, doc: next }
}
