import type { DayRef, ID } from '../engine'

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
  | { kind: 'leg'; legId: ID }
  | { kind: 'dest'; title: string; pick: (destId: ID) => void }
  | { kind: 'split'; stopId: ID; destId: ID; nights: number; after: number }
  | { kind: 'insert'; index: number; destId: ID; nights: number }
  | { kind: 'fill'; stopId: ID; destId: ID; nights: number; side: 'start' | 'end' }
  /** Escolher um dia; com `placeId`, os dias em que a atividade já está ficam marcados e desligados. */
  | { kind: 'days'; title: string; prefer?: ID | null; placeId?: ID; pick: (ref: DayRef) => void }
  /** Escolher um destino da viagem na linha do tempo (só os de `ok`); `tag` diz o que o toque faz. */
  | { kind: 'pickStop'; title: string; tag: string; ok: ID[]; pick: (stopId: ID) => void }
  | { kind: 'sticker'; placeId: ID }
  | { kind: 'visit'; visitId: ID }
  | { kind: 'times'; legId: ID }
  | { kind: 'order'; stopId: ID }
  | { kind: 'where'; destId: ID }
  /** Nome, quem vai, de onde saem e as datas. */
  | { kind: 'trip' }
  /** Nova atividade num destino; com `day`, já entra nesse dia; com lat/lon, já tem lugar no mapa. */
  | { kind: 'newActivity'; destId: ID; day?: DayRef; dayLabel?: string; lat?: number; lon?: number }
  /** Onde vocês dormem numa parada: nome, noites e "já reservei". */
  | { kind: 'lodging'; stopId: ID }
