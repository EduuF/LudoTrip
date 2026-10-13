import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import world from 'world-atlas/countries-50m.json'

// Peças do mapa compartilhadas pelas camadas (viagem e cidade): contornos, aleatório semeado,
// afastamento de nós, rótulos sem sobreposição e curvas suaves (portados da v1).

export const f1 = (n: number) => n.toFixed(1)

let countriesCache: Feature<Geometry>[] | null = null
export function countries(): Feature<Geometry>[] {
  if (!countriesCache) {
    const topo = world as unknown as Topology<{ countries: GeometryCollection }>
    countriesCache = (feature(topo, topo.objects.countries) as FeatureCollection<Geometry>).features
  }
  return countriesCache
}

export function rng(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    return ((h >>> 0) % 10000) / 10000
  }
}

export interface RelaxNode {
  x: number
  y: number
  ox: number
  oy: number
}

/** Afasta nós muito próximos, puxando de leve de volta ao lugar real; dentro da área. */
export function relax<T extends RelaxNode>(nodes: T[], min: number, pad: number, W: number, H: number): T[] {
  for (let k = 0; k < 140; k++) {
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!
        const b = nodes[j]!
        let dx = b.x - a.x
        let dy = b.y - a.y
        let d = Math.hypot(dx, dy)
        if (d < min) {
          if (d < 0.01) {
            dx = i % 2 ? 1 : -1
            dy = 0.5
            d = Math.hypot(dx, dy)
          }
          const push = (min - d) / 2
          dx /= d
          dy /= d
          a.x -= dx * push
          a.y -= dy * push
          b.x += dx * push
          b.y += dy * push
        }
      }
    for (const n of nodes) {
      n.x += (n.ox - n.x) * 0.02
      n.y += (n.oy - n.y) * 0.02
      n.x = Math.max(pad, Math.min(W - pad, n.x))
      n.y = Math.max(pad, Math.min(H - pad, n.y))
    }
  }
  return nodes
}

export type Rect = { x: number; y: number; w: number; h: number }
export interface LabelPlacement {
  cx: number
  cy: number
  /** Qual dos lados foi escolhido (para manter durante um arraste do mapa). */
  cand: number
}

/** Rótulos ao redor do nó sem cobrir nós nem outros rótulos. `fixed` mantém o lado escolhido antes. */
export function placeLabels(
  items: { x: number; y: number; w: number; h: number; gap: number }[],
  occ: Rect[],
  W: number,
  H: number,
  fixed?: (number | undefined)[],
): LabelPlacement[] {
  const ov = (a: Rect, b: Rect) =>
    Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  return items.map(({ x, y, w, h, gap }, i) => {
    const cands: [number, number][] = [
      [x, y + gap + h / 2],
      [x, y - gap - h / 2],
      [x + gap + w / 2 + 4, y],
      [x - gap - w / 2 - 4, y],
      [x + w / 2, y + gap + h / 2],
      [x - w / 2, y + gap + h / 2],
    ]
    const keep = fixed?.[i]
    if (keep !== undefined && cands[keep]) {
      const [cx, cy] = cands[keep]!
      occ.push({ x: cx - w / 2, y: cy - h / 2, w, h })
      return { cx, cy, cand: keep }
    }
    let best: [number, number, Rect, number] = [x, y + gap + h / 2, { x: x - w / 2, y: y + gap, w, h }, 0]
    let bestS = Infinity
    cands.forEach(([cx, cy], k) => {
      const r = { x: cx - w / 2, y: cy - h / 2, w, h }
      let s = occ.reduce((a, o) => a + ov(r, o), 0)
      if (r.x < 4 || r.y < 4 || r.x + r.w > W - 4 || r.y + r.h > H - 4) s += w * h
      if (s < bestS) {
        bestS = s
        best = [cx, cy, r, k]
      }
    })
    occ.push(best[2])
    return { cx: best[0], cy: best[1], cand: best[3] }
  })
}

export type DecoKind = 'mountain' | 'sakura' | 'torii' | 'palm' | 'pine' | 'castle' | 'cactus'

/** Decoração por país do escopo (ou do primeiro destino). */
export function decoKinds(country: string | undefined): DecoKind[] {
  switch (country) {
    case 'JP':
      return ['sakura', 'torii', 'mountain', 'sakura', 'pine']
    case 'BR':
    case 'MX':
    case 'TH':
    case 'ID':
    case 'CU':
    case 'DO':
    case 'CO':
      return ['palm', 'mountain', 'palm', 'pine']
    case 'EG':
    case 'MA':
    case 'AE':
    case 'JO':
    case 'TN':
      return ['cactus', 'mountain', 'cactus']
    case 'PT':
    case 'ES':
    case 'FR':
    case 'IT':
    case 'DE':
    case 'GB':
    case 'AT':
    case 'CZ':
    case 'HU':
    case 'RO':
    case 'PL':
    case 'GR':
    case 'HR':
      return ['castle', 'pine', 'mountain', 'pine']
    default:
      return ['pine', 'mountain', 'pine']
  }
}

/** Curva suave fechada ou aberta por pontos (Catmull-Rom → Bézier), como na v1. */
export function smoothPath(pts: [number, number][], closed = false): string {
  if (!pts.length) return ''
  if (pts.length === 1) return `M${f1(pts[0]![0])},${f1(pts[0]![1])}`
  const n = pts.length
  const at = (i: number) => (closed ? pts[((i % n) + n) % n]! : pts[Math.max(0, Math.min(n - 1, i))]!)
  let d = `M${f1(pts[0]![0])},${f1(pts[0]![1])}`
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)},${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)},${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])},${f1(p2[1])}`
  }
  return closed ? d + 'Z' : d
}
