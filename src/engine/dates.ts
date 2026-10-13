import type { ISODate } from './types'

// Datas como dias inteiros em UTC: nada depende do fuso do computador.

const toDayNumber = (iso: ISODate): number => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

const fromDayNumber = (n: number): ISODate => new Date(n * 86_400_000).toISOString().slice(0, 10)

export const addDays = (iso: ISODate, days: number): ISODate => fromDayNumber(toDayNumber(iso) + days)

export const diffDays = (from: ISODate, to: ISODate): number => toDayNumber(to) - toDayNumber(from)

export const isISODate = (s: unknown): s is ISODate =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromDayNumber(toDayNumber(s)) === s

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

export const weekday = (iso: ISODate): string => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!
}

/** "07/04" */
export const ddmm = (iso: ISODate): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** "qua 07/04" */
export const dayLabel = (iso: ISODate): string => `${weekday(iso)} ${ddmm(iso)}`
