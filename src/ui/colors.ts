import type { Destination, ID } from '../engine'

const PALETTE = [
  'var(--sakura)',
  'var(--ai)',
  'var(--matcha)',
  'var(--gold)',
  'var(--beni)',
  '#8a6fb0',
  '#2f8f8a',
  '#c77b3a',
]

/** Cor fixa de cada destino (a mesma na trilha, nos cartões, na lista de atividades e no mapa). */
export function colorOf(destinations: Destination[], destId: ID | null | undefined): string {
  const i = destinations.findIndex((d) => d.id === destId)
  return i < 0 ? 'var(--ink-soft)' : PALETTE[i % PALETTE.length]!
}

/** Primeira letra da escrita local (京, 東, P…). */
export function sealOf(d: Destination | undefined): string {
  return (d?.localName ?? d?.name ?? '?').slice(0, 1)
}
