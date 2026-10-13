import type { GeoPath } from 'd3-geo'
import type { BBox } from './frame'
import type { Theme } from './style/washi'

// O mapa por baixo da nossa camada SVG tem dois adaptadores (spec §8): "papel" (d3-geo, sem rede)
// e "tiles" (MapLibre + OpenFreeMap, com rede e WebGL). A camada SVG só conhece esta interface.

export type LonLat = [number, number]
export type MovePhase = 'move' | 'end'

export interface MapAdapter {
  readonly kind: 'paper' | 'tiles'
  /** Pixel dentro da área do mapa; null fora do domínio da projeção. */
  project(ll: LonLat): [number, number] | null
  unproject(xy: [number, number]): LonLat | null
  /** Enquadra a caixa com folga em px, com ou sem animação. */
  fit(bbox: BBox, opts?: { padding?: number; animate?: boolean }): void
  /** Avisa a cada quadro de movimento e ao parar. Devolve o cancelamento. */
  onMove(cb: (phase: MovePhase) => void): () => void
  /** Tamanho atual da área do mapa, em px. */
  size(): [number, number]
  resize(): void
  destroy(): void
  /** Só nos tiles: troca o estilo para o modo dia ou noite. */
  setTheme?(theme: Theme): void
  /** Só no papel: desenha contornos com a mesma projeção. */
  geoPath?(): GeoPath
}

export const reducedMotion = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Interpolação com ida e volta suaves. */
export const easeInOut = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2)
