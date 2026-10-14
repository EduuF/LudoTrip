import type { ID, Itinerary } from './types'

// Remendo do Desfazer: só as partes que a operação tocou, com os valores de antes e de depois.
// Desfazer só é aplicado se essas partes continuam como a operação as deixou; se alguém mexeu
// nelas depois, o Desfazer é recusado em vez de apagar o trabalho da outra pessoa.

type EntityField = 'stops' | 'legs' | 'archivedLegs' | 'resources' | 'anchors' | 'travelers'
type ValueField = 'start' | 'lock' | 'defaultMode' | 'pace' | 'departurePlan' | 'returned' | 'home'

const ENTITY_FIELDS: EntityField[] = ['stops', 'legs', 'archivedLegs', 'resources', 'anchors', 'travelers']
const VALUE_FIELDS: ValueField[] = [
  'start',
  'lock',
  'defaultMode',
  'pace',
  'departurePlan',
  'returned',
  'home',
]

export type PatchEntry =
  | { kind: 'value'; field: ValueField; before: unknown; after: unknown }
  | { kind: 'entity'; field: EntityField; id: ID; before: unknown; after: unknown }
  | { kind: 'order'; field: EntityField; before: ID[]; after: ID[] }

export interface Patch {
  entries: PatchEntry[]
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined || a === null || b === null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const bb = b as unknown[]
    return a.length === bb.length && a.every((v, i) => deepEqual(v, bb[i]))
  }
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const keys = new Set(
    [...Object.keys(ao), ...Object.keys(bo)].filter((k) => ao[k] !== undefined || bo[k] !== undefined),
  )
  for (const k of keys) if (!deepEqual(ao[k], bo[k])) return false
  return true
}

type WithId = { id: ID }
const list = (it: Itinerary, f: EntityField): WithId[] => it[f] as unknown as WithId[]

export function makePatch(before: Itinerary, after: Itinerary): Patch {
  const entries: PatchEntry[] = []
  for (const field of VALUE_FIELDS) {
    if (!deepEqual(before[field], after[field]))
      entries.push({
        kind: 'value',
        field,
        before: structuredClone(before[field]),
        after: structuredClone(after[field]),
      })
  }
  for (const field of ENTITY_FIELDS) {
    const b = list(before, field)
    const a = list(after, field)
    const ids = new Set([...b.map((x) => x.id), ...a.map((x) => x.id)])
    for (const id of ids) {
      const eb = b.find((x) => x.id === id)
      const ea = a.find((x) => x.id === id)
      if (!deepEqual(eb, ea))
        entries.push({ kind: 'entity', field, id, before: structuredClone(eb), after: structuredClone(ea) })
    }
    const ob = b.map((x) => x.id)
    const oa = a.map((x) => x.id)
    if (!deepEqual(ob, oa)) entries.push({ kind: 'order', field, before: ob, after: oa })
  }
  return { entries }
}

export type UndoResult =
  { ok: true; state: Itinerary } | { ok: false; code: 'CHANGED_SINCE' | 'NOTHING_TO_UNDO' }

/** Aplica o Desfazer de uma operação sobre o estado atual (que pode ter outras edições depois). */
/** O remendo ao contrário: desfazer um Desfazer (refazer). */
export function invertPatch(patch: Patch): Patch {
  return { entries: patch.entries.map((e) => ({ ...e, before: e.after, after: e.before }) as PatchEntry) }
}

export function applyUndo(current: Itinerary, patch: Patch): UndoResult {
  if (!patch.entries.length) return { ok: false, code: 'NOTHING_TO_UNDO' }
  // 1) Conferir: tudo o que a operação tocou continua como ela deixou?
  for (const e of patch.entries) {
    if (e.kind === 'value' && !deepEqual(current[e.field], e.after))
      return { ok: false, code: 'CHANGED_SINCE' }
    if (
      e.kind === 'entity' &&
      !deepEqual(
        list(current, e.field).find((x) => x.id === e.id),
        e.after,
      )
    )
      return { ok: false, code: 'CHANGED_SINCE' }
    if (
      e.kind === 'order' &&
      !deepEqual(
        list(current, e.field).map((x) => x.id),
        e.after,
      )
    )
      return { ok: false, code: 'CHANGED_SINCE' }
  }
  // 2) Restaurar.
  const next = structuredClone(current)
  for (const e of patch.entries) {
    if (e.kind === 'value') (next as unknown as Record<string, unknown>)[e.field] = structuredClone(e.before)
  }
  for (const field of ENTITY_FIELDS) {
    let arr = [...list(next, field)]
    for (const e of patch.entries) {
      if (e.kind !== 'entity' || e.field !== field) continue
      const i = arr.findIndex((x) => x.id === e.id)
      if (e.before === undefined) {
        if (i >= 0) arr.splice(i, 1)
      } else if (i >= 0) arr[i] = structuredClone(e.before) as WithId
      else arr.push(structuredClone(e.before) as WithId)
    }
    const order = patch.entries.find((e) => e.kind === 'order' && e.field === field) as
      Extract<PatchEntry, { kind: 'order' }> | undefined
    if (order) {
      const byId = new Map(arr.map((x) => [x.id, x]))
      arr = order.before.map((id) => byId.get(id)!).filter(Boolean)
    }
    ;(next as unknown as Record<string, unknown>)[field] = arr
  }
  next.version = current.version + 1
  return { ok: true, state: next }
}
