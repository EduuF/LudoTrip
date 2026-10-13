import type { PlaceKind } from '../engine'

/** Selo (kanji) e nome de cada tipo de lugar no mapa da cidade. */
export const PLACE_KINDS: Record<PlaceKind, { glyph: string; label: string }> = {
  sight: { glyph: '景', label: 'lugar' },
  food: { glyph: '食', label: 'comida' },
  shop: { glyph: '買', label: 'compras' },
  nature: { glyph: '山', label: 'natureza' },
  transit: { glyph: '駅', label: 'transporte' },
  lodging: { glyph: '宿', label: 'hospedagem' },
  other: { glyph: '印', label: 'outro' },
}

export const PLACE_KIND_ORDER: PlaceKind[] = [
  'sight',
  'food',
  'shop',
  'nature',
  'transit',
  'lodging',
  'other',
]
