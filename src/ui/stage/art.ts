// Pixel art genérica do Palco: grades de qualquer tamanho, contorno automático e tiras de cor. O elenco
// (cast.ts) e os objetos (props.ts) saem daqui, com a mesma densidade e o mesmo contorno, para que um
// bonequinho e uma mala lado a lado pareçam do mesmo mundo.

export const INK = '#241a28'

export type Grid = (string | null)[][]

export interface Run {
  x: number
  y: number
  w: number
  c: string
}

/** Uma arte pronta: tamanho em pixels de arte e as tiras de cor. */
export interface Art {
  w: number
  h: number
  runs: Run[]
}

export const grid = (w: number, h: number): Grid =>
  Array.from({ length: h }, () => Array<string | null>(w).fill(null))

export function put(g: Grid, x: number, y: number, c: string) {
  if (y >= 0 && y < g.length && x >= 0 && x < g[0]!.length) g[y]![x] = c
}

export function box(g: Grid, x0: number, y0: number, x1: number, y1: number, c: string) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(g, x, y, c)
}

/** Contorno automático: todo vazio vizinho (4 lados) de algo pintado vira tinta. */
export function outline(g: Grid, ink = INK): Grid {
  const out = g.map((r) => r.slice())
  for (let y = 0; y < g.length; y++)
    for (let x = 0; x < g[y]!.length; x++) {
      if (g[y]![x]) continue
      if (g[y]![x + 1] || g[y]![x - 1] || g[y + 1]?.[x] || g[y - 1]?.[x]) out[y]![x] = ink
    }
  return out
}

/** Tiras horizontais da mesma cor (poucos retângulos). */
export function runs(g: Grid): Run[] {
  const out: Run[] = []
  for (let y = 0; y < g.length; y++) {
    const row = g[y]!
    let x = 0
    while (x < row.length) {
      const c = row[x]
      if (!c) {
        x++
        continue
      }
      let e = x
      while (e + 1 < row.length && row[e + 1] === c) e++
      out.push({ x, y, w: e - x + 1, c })
      x = e + 1
    }
  }
  return out
}

export const toArt = (g: Grid): Art => ({ w: g[0]?.length ?? 0, h: g.length, runs: runs(g) })

/**
 * Arte a partir de linhas de texto: cada caractere é uma cor da paleta, '.' é vazio. Com `pad`, ganha 1
 * pixel de margem em volta para o contorno caber.
 */
export function fromRows(
  rows: string[],
  palette: Record<string, string>,
  opts: { outline?: boolean } = {},
): Art {
  const w = Math.max(...rows.map((r) => r.length))
  const edge = opts.outline === false ? 0 : 1
  const g = grid(w + edge * 2, rows.length + edge * 2)
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      const c = palette[ch]
      if (c) put(g, x + edge, y + edge, c)
    }),
  )
  return toArt(edge ? outline(g) : g)
}

/** Espelha na horizontal (virar de lado). */
export function flipX(a: Art): Art {
  return { ...a, runs: a.runs.map((r) => ({ ...r, x: a.w - r.x - r.w })) }
}

/** Só as linhas de cima (ex.: a cabeça espiando pela porta). */
export function crop(a: Art, rows: number): Art {
  return { w: a.w, h: rows, runs: a.runs.filter((r) => r.y < rows) }
}

/** O quadro como marcação SVG. */
export const toSvgRects = (rs: Run[]) =>
  rs.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="1" fill="${r.c}"/>`).join('')

/** Escurece uma cor #rrggbb (o lado de longe de um braço ou perna). */
export function shade(hex: string, k = 0.78): string {
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number) =>
    Math.round(v * k)
      .toString(16)
      .padStart(2, '0')
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`
}

/** Gira 90° no sentido anti-horário (deitado, com a cabeça à esquerda). */
export function rotateCCW(a: Art): Art {
  const g = grid(a.h, a.w)
  for (const r of a.runs) for (let x = r.x; x < r.x + r.w; x++) g[a.w - 1 - x]![r.y] = r.c
  return toArt(g)
}

/** Faixa lisa (chão, estrada, água), sem contorno. */
export function bar(w: number, h: number, c: string): Art {
  return { w, h, runs: Array.from({ length: h }, (_, y) => ({ x: 0, y, w, c })) }
}
