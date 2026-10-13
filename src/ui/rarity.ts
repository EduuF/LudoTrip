import type { Rarity } from '../engine'

export const RARITY: Record<Rarity, { label: string; gems: string }> = {
  maybe: { label: 'Se der', gems: '✦' },
  want: { label: 'Quero', gems: '✦✦' },
  must: { label: 'Imperdível', gems: '✦✦✦' },
}
