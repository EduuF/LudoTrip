import type { DayRef, ID, ISODate } from '../engine'

/** Uma opção de escolha (com prévia do que vai acontecer). */
export interface Opt {
  label: string
  detail?: string[]
  run: () => void
  main?: boolean
  disabled?: boolean
}

/** Painéis que sobem de baixo. Guardam só o que precisam; o resto vem do estado atual. */
export type SheetSpec =
  | { kind: 'choice'; title: string; sub?: string; options: Opt[] }
  | { kind: 'city'; stopId: ID }
  | { kind: 'leg'; legId: ID }
  | { kind: 'dest'; title: string; pick: (destId: ID) => void }
  | { kind: 'split'; stopId: ID; destId: ID; nights: number; after: number }
  | { kind: 'insert'; index: number; destId: ID; nights: number }
  | { kind: 'fill'; stopId: ID; destId: ID; nights: number; side: 'start' | 'end' }
  | { kind: 'days'; title: string; prefer?: ID | null; pick: (ref: DayRef) => void }
  | { kind: 'sticker'; placeId: ID }
  | { kind: 'visit'; visitId: ID }
  | { kind: 'times'; legId: ID }
  | { kind: 'end'; date: ISODate | null }
  | { kind: 'order'; stopId: ID }
  | { kind: 'where'; destId: ID }
