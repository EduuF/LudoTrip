// Porta de entrada do motor do roteiro. A interface só usa o que sai daqui.
export * from './types'
export * from './dates'
export {
  emptyEffects,
  OpError,
  nightsOf,
  isOpen,
  timeline,
  totalNights,
  allVisits,
  findVisit,
  planAt,
} from './core'
export type { OpContext, Effects, ErrorCode, EngineError, ReturnedVisit, Segment } from './core'
export { dispatch, COMMAND_TYPES } from './commands'
export type { Command, CommandType, DispatchResult } from './commands'
export { makePatch, applyUndo, invertPatch, deepEqual } from './patch'
export type { Patch, PatchEntry, UndoResult } from './patch'
export * from './derive'
export * from './narrate'
export * from './create'
