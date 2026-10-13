import { emptyEffects, OpError } from './core'
import type { Effects, EngineError, OpContext } from './core'
import { makePatch } from './patch'
import type { Patch } from './patch'
import type { Itinerary } from './types'
import * as days from './ops/days'
import * as legs from './ops/legs'
import * as misc from './ops/misc'
import * as nights from './ops/nights'
import * as structure from './ops/structure'
import * as visits from './ops/visits'

type Handler<A> = (it: Itinerary, before: Itinerary, args: A, ctx: OpContext, eff: Effects) => void
type ArgsOf<H> = H extends Handler<infer A> ? A : never

/** Todas as operações do motor, por nome. Cada comando é serializável (fila offline e transações). */
const HANDLERS = {
  setNights: nights.setNights,
  moveBoundary: nights.moveBoundary,
  shiftStop: nights.shiftStop,
  reorderStop: structure.reorderStop,
  insertStop: structure.insertStop,
  splitStopWith: structure.splitStopWith,
  removeStop: structure.removeStop,
  fillOpen: structure.fillOpen,
  stretchInto: structure.stretchInto,
  closeOpen: structure.closeOpen,
  setDestination: structure.setDestination,
  removeDay: days.removeDay,
  swapDays: days.swapDays,
  setTripStart: days.setTripStart,
  setTripEnd: days.setTripEnd,
  setLock: days.setLock,
  setLegMode: legs.setLegMode,
  setLegTimes: legs.setLegTimes,
  setLegHubs: legs.setLegHubs,
  setLegDuration: legs.setLegDuration,
  setLegNightsAboard: legs.setLegNightsAboard,
  addWaypoint: legs.addWaypoint,
  removeWaypoint: legs.removeWaypoint,
  scheduleVisit: visits.scheduleVisit,
  unscheduleVisit: visits.unscheduleVisit,
  moveVisit: visits.moveVisit,
  setVisitMeta: visits.setVisitMeta,
  setParticipants: misc.setParticipants,
  addResource: misc.addResource,
  removeResource: misc.removeResource,
  addAnchor: misc.addAnchor,
  removeAnchor: misc.removeAnchor,
  setTentative: misc.setTentative,
  setLodging: misc.setLodging,
  setPace: misc.setPace,
  setDefaultMode: misc.setDefaultMode,
  setTravelers: misc.setTravelers,
} satisfies Record<string, Handler<never>>

type Handlers = typeof HANDLERS
export type CommandType = keyof Handlers
export type Command = { [K in CommandType]: { type: K } & ArgsOf<Handlers[K]> }[CommandType]

export type DispatchResult =
  | { ok: true; state: Itinerary; inverse: Patch; effects: Effects; command: Command }
  | { ok: false; error: EngineError; command: Command }

/** Aplica um comando sem tocar no estado recebido. */
export function dispatch(it: Itinerary, command: Command, ctx: OpContext): DispatchResult {
  const before = structuredClone(it)
  const draft = structuredClone(it)
  const eff = emptyEffects()
  const { type, ...args } = command
  const handler = HANDLERS[type] as unknown as Handler<unknown>
  try {
    handler(draft, before, args, ctx, eff)
  } catch (e) {
    if (e instanceof OpError) return { ok: false, error: e.error, command }
    throw e
  }
  const inverse = makePatch(it, draft)
  // Nada mudou de fato (ex.: mover uma visita para onde ela já está): não vira edição nem Desfazer.
  if (!inverse.entries.length) return { ok: false, error: { code: 'NO_CHANGE' }, command }
  draft.version = it.version + 1
  return { ok: true, state: draft, inverse, effects: eff, command }
}

export const COMMAND_TYPES = Object.keys(HANDLERS) as CommandType[]
