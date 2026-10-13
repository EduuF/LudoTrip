// Fila de explosões de pétalas (o canvas das pétalas lê a fila a cada quadro).

export type Petal = {
  x: number
  y: number
  v: number
  vx: number
  s: number
  a: number
  w: number
  r: number
  vr: number
  o: number
  t: number
  life?: number
}

export type Flake = 'petal' | 'leaf'
export interface Palette {
  colors: string[]
  shape: Flake
}

const SAKURA = new Set(['JP', 'KR', 'CN', 'TW'])
const TROPICAL = new Set(
  'BR MX CO PE CR PA DO CU JM TH VN ID PH MY SG IN LK KE TZ ZA AU MV MU SC EC VE GT BZ HN NI SV PR BS BB TT KH LA MM FJ PF NZ'.split(
    ' ',
  ),
)

/** O que cai na tela: sakura no Leste Asiático, folhas tropicais, folhas de outono no resto; cores pelo tema. */
export function palette(country: string | undefined, theme: 'light' | 'dark'): Palette {
  const dark = theme === 'dark'
  if (!country || SAKURA.has(country))
    return {
      shape: 'petal',
      colors: dark ? ['#d892a9', '#c47a94', '#ecb7c7'] : ['#f3a9c0', '#e2809f', '#ffd1df'],
    }
  if (TROPICAL.has(country))
    return {
      shape: 'leaf',
      colors: dark ? ['#5f9c6a', '#d9a53f', '#d2735a'] : ['#7cbf86', '#f2c14e', '#ef8a6c'],
    }
  return {
    shape: 'leaf',
    colors: dark ? ['#b86f3c', '#c9983e', '#9a4a3a'] : ['#d98a4a', '#e6b450', '#b85c47'],
  }
}

let queue: { x: number; y: number; n: number }[] = []

const reduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Solta pétalas a partir de um ponto da tela (em pixels CSS). */
export function petalBurst(x = innerWidth / 2, y = innerHeight / 2, n = 36) {
  if (reduced()) return
  queue.push({ x, y, n })
}

export function takeBursts() {
  const q = queue
  queue = []
  return q
}
