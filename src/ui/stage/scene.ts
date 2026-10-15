// Peças comuns das cenas do Palco: o grupo de viajantes, figuras com os pés no chão, confete e brilhos.

import type { Art } from './art'
import { CAST, castFor, type Person } from './cast'
import { arc, seg } from './motion'
import type { Actor, Pose, Stage } from './palco'
import { confetti, sparkle } from './props'

/** Os viajantes da viagem no elenco (1 a 4). */
export const party = (travelers: number): Person[] =>
  Array.from({ length: Math.min(CAST.length, Math.max(1, travelers)) }, (_, i) => castFor(i))

/** O bilheteiro (quepe e uniforme azul-marinho). */
export const STAFF: Person = {
  name: 'Bilheteiro',
  hair: '#3a2a2a',
  skin: '#e9b48f',
  shirt: '#2b3f6b',
  pants: '#241a28',
  style: 'cap',
  cap: '#2b3f6b',
}

/** Pose com a base da arte no chão (`ground` = a linha logo abaixo dos pés). */
export const on = (art: Art, x: number, ground: number, extra: Partial<Pose> = {}): Pose => ({
  x,
  y: ground - art.h,
  ...extra,
})

const BITS = ['#e2809f', '#f2c14e', '#9db4f0', '#9dc57f', '#c4313a']

/**
 * Confete saindo de (x, y) no instante `at`: cada pedaço faz um arco e cai. Devolve o desenho; cria os
 * atores na hora (uma vez).
 */
export function burst(stage: Stage, rng: () => number, n = 8, z = 5) {
  const bits = Array.from({ length: n }, (_, i) => ({
    a: stage.actor(z),
    c: BITS[i % BITS.length]!,
    dx: (rng() - 0.5) * 26,
    up: 4 + rng() * 8,
    fall: 6 + rng() * 10,
    len: 380 + rng() * 220,
  }))
  return (t: number, at: number, x: number, y: number) => {
    for (const b of bits) {
      const k = seg(t, at, at + b.len)
      if (k <= 0 || k >= 1) {
        b.a.draw(null)
        continue
      }
      const p = arc(k, x, y, x + b.dx, y + b.fall, b.up)
      b.a.draw(confetti(b.c), { x: p.x, y: p.y, opacity: k > 0.75 ? (1 - k) / 0.25 : 1 })
    }
  }
}

/** Dois brilhos rápidos em (x, y) no instante `at` (o "plim" de algo que deu certo). */
export function twinkle(stage: Stage, z = 6) {
  const a = stage.actor(z)
  const b = stage.actor(z)
  return (t: number, at: number, x: number, y: number) => {
    const k = seg(t, at, at + 320)
    if (k <= 0 || k >= 1) {
      a.draw(null)
      b.draw(null)
      return
    }
    a.draw(sparkle(), { x: x - 3, y: y - 3 - k * 3, opacity: 1 - k })
    b.draw(sparkle('#f6c6d4'), { x: x + 4, y: y - 6 - k * 4, opacity: k < 0.3 ? 0 : 1 - k })
  }
}

/** Esconde um ator fora do intervalo [a, b). */
export function during(actor: Actor, t: number, a: number, b: number, art: Art, pose: Pose) {
  if (t < a || t >= b) actor.draw(null)
  else actor.draw(art, pose)
}
