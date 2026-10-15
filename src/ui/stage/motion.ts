// Ferramentas de movimento das cenas do Palco: tempo relativo, easings, arcos e quadros.
// Tudo é função pura do tempo, para a cena poder ser congelada em qualquer instante.

/** Progresso 0–1 do instante t entre a e b. */
export const seg = (t: number, a: number, b: number) =>
  b <= a ? (t >= b ? 1 : 0) : Math.min(1, Math.max(0, (t - a) / (b - a)))

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k

export const ease = {
  in: (k: number) => k * k * k,
  out: (k: number) => 1 - (1 - k) ** 3,
  inOut: (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2),
  /** Passa um pouco do ponto e volta (chegada com vida). */
  back: (k: number) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2,
}

/** Ponto num arco (lançamento): de (x0, y0) a (x1, y1), subindo `h` acima do mais alto dos dois. */
export function arc(k: number, x0: number, y0: number, x1: number, y1: number, h: number) {
  const x = lerp(x0, x1, k)
  const top = Math.min(y0, y1) - h
  // Parábola que passa por y0, top (no meio) e y1.
  const y = (1 - k) * (1 - k) * y0 + 2 * (1 - k) * k * (2 * top - (y0 + y1) / 2) + k * k * y1
  return { x, y }
}

/** Índice do quadro no instante t, trocando a cada `step` ms. */
export const frame = (t: number, step: number, n: number) => Math.floor(Math.max(0, t) / step) % n

/** Amassar e esticar no impacto (sy), com o volume compensado em sx. */
export function squash(t: number, at: number, len = 160, amount = 0.14) {
  const k = seg(t, at, at + len)
  if (k <= 0 || k >= 1) return { sx: 1, sy: 1 }
  const sy = 1 - amount * Math.sin(k * Math.PI) * (1 - k * 0.5)
  return { sx: 2 - sy, sy }
}

/** Opacidade de saída: 1 até `from`, 0 em `to`. */
export const fade = (t: number, from: number, to: number) => 1 - seg(t, from, to)

/** Opacidade de entrada. */
export const appear = (t: number, from: number, to: number) => seg(t, from, to)
