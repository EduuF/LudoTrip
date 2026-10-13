import { allVisits, applyUndo, dispatch, emptyEffects } from '../engine'
import type {
  Booking,
  Command,
  Destination,
  Effects,
  EngineError,
  ID,
  Itinerary,
  Patch,
  Place,
  Rarity,
  Scope,
} from '../engine'

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
}

export type DocAction =
  | { type: 'engine'; command: Command }
  | { type: 'addPlace'; place: Omit<Place, 'id'> & { id?: ID } }
  | { type: 'setPlace'; id: ID; patch: { rarity?: Rarity; name?: string } }
  | { type: 'removePlace'; id: ID }
  | { type: 'addDestination'; destination: Destination }
  | { type: 'addBooking'; booking: Booking }
  | { type: 'setBooking'; id: ID; patch: { archived?: boolean; status?: 'planned' | 'booked' } }
  | { type: 'removeBooking'; id: ID }
  | { type: 'rename'; name: string }
  | { type: 'batch'; actions: DocAction[] }

type Collection = 'destinations' | 'places' | 'bookings' | 'meta'
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

export function runDoc(doc: TripDoc, action: DocAction): RunDocResult {
  const draft: TripDoc = { ...doc }
  const steps: UndoStep[] = []
  const effects = emptyEffects()
  const newId = () => `u${++draft.seq}`
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
        snapshot('places')
        draft.places = draft.places.map((p) => (p.id === a.id ? { ...p, ...a.patch } : p))
        return
      }
      case 'removePlace': {
        if (!draft.places.some((p) => p.id === a.id))
          throw new DocFail({ code: 'NOT_FOUND', data: { placeId: a.id } })
        // Tirar do álbum tira a figurinha de todos os dias (com Desfazer).
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
