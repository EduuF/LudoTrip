import { timeline } from '../../engine'
import type { Command, ID, Itinerary } from '../../engine'

// O que um gesto na Trilha quer dizer, em dias (frações de dia a partir do início da viagem).
// Funções puras: a tela só mede o dedo e chama estas regras (spec §17.3).

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export interface StopSeg {
  id: ID
  index: number
  start: number
  nights: number
  open: boolean
}

export function stopSegs(it: Itinerary): StopSeg[] {
  return timeline(it)
    .segments.filter((s) => s.kind === 'stop')
    .map((s, index) => ({
      id: s.id,
      index,
      start: s.startIndex,
      nights: s.nights,
      open: it.stops[index]!.destinationId === null,
    }))
}

/** Pegador da divisa entre `stops[index]` e `stops[index + 1]`, arrastado `k` dias. */
export function boundaryCommand(it: Itinerary, index: number, k: number): Command | null {
  const left = it.stops[index]
  const right = it.stops[index + 1]
  if (!left || !right) return null
  const kk = clamp(Math.round(k), -(left.days.length - 1), right.days.length - 1)
  return kk === 0 ? null : { type: 'moveBoundary', index, k: kk }
}

export type EndIntent = { kind: 'none' } | { kind: 'locked' } | { kind: 'command'; command: Command }

/** Pegador da volta (fim da última cidade). Com a volta marcada, não mexe. */
export function endIntent(it: Itinerary, k: number): EndIntent {
  const last = it.stops[it.stops.length - 1]
  if (!last) return { kind: 'none' }
  const nights = Math.max(1, last.days.length + Math.round(k))
  if (nights === last.days.length) return { kind: 'none' }
  if (it.lock === 'fixed') return { kind: 'locked' }
  return { kind: 'command', command: { type: 'setNights', stopId: last.id, nights, via: { kind: 'return' } } }
}

export type BlockIntent =
  | { kind: 'none'; reason?: 'first' | 'last' | 'short' }
  | { kind: 'shift'; by: number }
  | { kind: 'reorder'; toIndex: number }

/**
 * Cidade levantada e arrastada `dDays` dias, com o dedo em `pointerDay`.
 * Pouco: empurra a vizinha (chega antes/depois, mesmas noites). Além da vizinha: muda a ordem.
 */
export function blockIntent(it: Itinerary, stopId: ID, dDays: number, pointerDay: number): BlockIntent {
  const segs = stopSegs(it)
  const me = segs.find((s) => s.id === stopId)
  if (!me) return { kind: 'none' }
  const d = Math.round(dDays)
  const prev = segs[me.index - 1]
  const next = segs[me.index + 1]
  if (prev && next) {
    if (d > 0 && d <= next.nights - 1) return { kind: 'shift', by: d }
    if (d < 0 && -d <= prev.nights - 1) return { kind: 'shift', by: d }
  }
  const toIndex = segs.filter((s) => s.id !== stopId && s.start + s.nights / 2 < pointerDay).length
  if (toIndex !== me.index) return { kind: 'reorder', toIndex }
  if (d < 0 && !prev) return { kind: 'none', reason: 'first' }
  if (d > 0 && !next) return { kind: 'none', reason: 'last' }
  return { kind: 'none', reason: d === 0 ? undefined : 'short' }
}

export type ShelfIntent =
  | { kind: 'insert'; index: number }
  | { kind: 'split'; stopId: ID; afterOrdinal: number }
  | { kind: 'fill'; stopId: ID }

/** Uma cidade da prateleira solta em `pointerDay`: entre cidades, no meio de uma, ou nas noites em aberto. */
export function shelfIntent(it: Itinerary, pointerDay: number, edge = 0.35): ShelfIntent {
  const segs = stopSegs(it)
  if (!segs.length || pointerDay < 0) return { kind: 'insert', index: 0 }
  const last = segs[segs.length - 1]!
  if (pointerDay >= last.start + last.nights) return { kind: 'insert', index: segs.length }
  const seg = segs.find((s) => pointerDay >= s.start && pointerDay < s.start + s.nights)
  // Entre cidades (sobre uma noite a bordo): entra antes da próxima cidade.
  if (!seg) return { kind: 'insert', index: segs.filter((s) => s.start < pointerDay).length }
  if (seg.open) return { kind: 'fill', stopId: seg.id }
  const local = pointerDay - seg.start
  if (seg.nights === 1) return { kind: 'insert', index: local < 0.5 ? seg.index : seg.index + 1 }
  if (local < edge) return { kind: 'insert', index: seg.index }
  if (local > seg.nights - edge) return { kind: 'insert', index: seg.index + 1 }
  return { kind: 'split', stopId: seg.id, afterOrdinal: clamp(Math.round(local), 1, seg.nights - 1) }
}
