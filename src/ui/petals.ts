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
