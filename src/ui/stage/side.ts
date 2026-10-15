// O elenco de perfil (olhando para a direita; `flipX` vira para a esquerda), na mesma grade 24 × 30 e com
// as mesmas peças de cor do elenco de frente: andar (4 quadros), correr (2), pular, carregar, arremessar e
// puxar a mala. O braço e a perna de longe saem um pouco mais escuros, para dar profundidade.

import { box, grid, outline, put, runs, shade, type Art, type Grid } from './art'
import { BLUSH, H, INK, MOUTH, SHOE, W, WHITE, type Person } from './cast'

type Pt = readonly [number, number]

interface Limb {
  sleeve: Pt[]
  skin: Pt[]
  hand: Pt[]
}

const ARMS = {
  down: {
    sleeve: [
      [11, 16],
      [11, 17],
      [11, 18],
    ],
    skin: [
      [11, 19],
      [11, 20],
    ],
    hand: [[11, 21]],
  },
  fwd: {
    sleeve: [
      [11, 16],
      [12, 17],
      [12, 18],
    ],
    skin: [
      [13, 19],
      [13, 20],
    ],
    hand: [
      [14, 20],
      [14, 21],
    ],
  },
  back: {
    sleeve: [
      [11, 16],
      [10, 17],
      [10, 18],
    ],
    skin: [
      [9, 19],
      [9, 20],
    ],
    hand: [
      [8, 20],
      [8, 21],
    ],
  },
  // Braço estendido à frente (carregando ou entregando algo).
  carry: {
    sleeve: [
      [11, 16],
      [12, 16],
      [11, 17],
      [12, 17],
    ],
    skin: [
      [13, 16],
      [14, 16],
      [13, 17],
      [14, 17],
    ],
    hand: [
      [15, 16],
      [16, 16],
      [15, 17],
    ],
  },
  // Para o alto (arremesso, aceno de lado).
  up: {
    sleeve: [
      [11, 16],
      [12, 15],
      [13, 14],
    ],
    skin: [
      [14, 13],
      [15, 13],
      [16, 12],
    ],
    hand: [
      [17, 11],
      [18, 10],
    ],
  },
  // Para trás e baixo, puxando a mala de rodinhas.
  pull: {
    sleeve: [
      [11, 16],
      [10, 17],
    ],
    skin: [
      [9, 18],
      [8, 19],
    ],
    hand: [
      [7, 20],
      [6, 20],
    ],
  },
  // Correndo: cotovelo dobrado.
  runFwd: {
    sleeve: [
      [11, 16],
      [12, 17],
    ],
    skin: [
      [13, 17],
      [14, 16],
    ],
    hand: [
      [15, 15],
      [15, 16],
    ],
  },
  runBack: {
    sleeve: [
      [11, 16],
      [10, 17],
    ],
    skin: [
      [9, 17],
      [8, 17],
    ],
    hand: [
      [7, 16],
      [7, 17],
    ],
  },
  // Bem para o alto, à frente (erguer algo acima da cabeça).
  high: {
    sleeve: [
      [11, 16],
      [12, 15],
      [13, 14],
    ],
    skin: [
      [14, 12],
      [15, 10],
      [15, 9],
      [16, 8],
      [16, 7],
      [16, 6],
    ],
    hand: [
      [17, 4],
      [17, 5],
    ],
  },
  // Para baixo e à frente (bater o carimbo no balcão).
  press: {
    sleeve: [
      [11, 16],
      [12, 17],
      [13, 18],
    ],
    skin: [
      [14, 19],
      [15, 20],
      [16, 21],
      [17, 22],
    ],
    hand: [
      [18, 23],
      [19, 24],
    ],
  },
} satisfies Record<string, Limb>
export type SideArm = keyof typeof ARMS

interface Leg {
  pts: Pt[]
  shoe: Pt
}
const STRAIGHT: Leg = {
  pts: [
    [11, 23],
    [11, 24],
    [11, 25],
    [11, 26],
    [11, 27],
  ],
  shoe: [11, 28],
}
const FWD: Leg = {
  pts: [
    [12, 23],
    [12, 24],
    [13, 25],
    [13, 26],
    [14, 27],
  ],
  shoe: [14, 28],
}
const BACK: Leg = {
  pts: [
    [10, 23],
    [10, 24],
    [9, 25],
    [9, 26],
    [8, 27],
  ],
  shoe: [7, 28],
}
const LIFT: Leg = {
  pts: [
    [10, 23],
    [10, 24],
    [10, 25],
    [9, 26],
  ],
  shoe: [7, 26],
}
const KNEE: Leg = {
  pts: [
    [12, 23],
    [13, 23],
    [14, 24],
    [14, 25],
    [14, 26],
  ],
  shoe: [14, 27],
}
const KICK: Leg = {
  pts: [
    [10, 23],
    [9, 24],
    [8, 25],
    [7, 25],
    [6, 26],
  ],
  shoe: [4, 26],
}
const TUCK_N: Leg = {
  pts: [
    [12, 23],
    [13, 24],
    [13, 25],
  ],
  shoe: [13, 26],
}
const TUCK_F: Leg = {
  pts: [
    [10, 23],
    [10, 24],
    [10, 25],
  ],
  shoe: [9, 26],
}
const STAND_F: Leg = {
  pts: [
    [10, 23],
    [10, 24],
    [10, 25],
    [10, 26],
    [10, 27],
  ],
  shoe: [9, 28],
}
const STAND_N: Leg = {
  pts: [
    [12, 23],
    [12, 24],
    [12, 25],
    [12, 26],
    [12, 27],
  ],
  shoe: [12, 28],
}

/** Pernas: [perto, longe]. */
const LEGS = {
  stand: [STAND_N, STAND_F],
  walkA: [FWD, BACK],
  walkB: [STRAIGHT, LIFT],
  walkC: [BACK, FWD],
  walkD: [LIFT, STRAIGHT],
  runA: [KNEE, KICK],
  runB: [KICK, KNEE],
  jump: [TUCK_N, TUCK_F],
} satisfies Record<string, [Leg, Leg]>
export type SideLegs = keyof typeof LEGS

export interface SideFace {
  eyes?: 'open' | 'closed' | 'happy'
  mouth?: 'smile' | 'open'
}

function limb(g: Grid, a: Limb, p: Person, far: boolean) {
  const sl = far ? shade(p.shirt) : p.shirt
  const sk = far ? shade(p.skin) : p.skin
  for (const [x, y] of a.sleeve) box(g, x, y, x + 1, y, sl)
  for (const [x, y] of [...a.skin, ...a.hand]) box(g, x, y, x + 1, y, sk)
}

function leg(g: Grid, l: Leg, p: Person, far: boolean) {
  const c = far ? shade(p.pants) : p.pants
  for (const [x, y] of l.pts) box(g, x, y, x + 1, y, c)
  box(g, l.shoe[0], l.shoe[1], l.shoe[0] + 2, l.shoe[1] + 1, far ? shade(SHOE) : SHOE)
}

function head(g: Grid, p: Person, f: SideFace) {
  const hh = p.hair
  // Rosto e pescoço.
  box(g, 9, 4, 16, 12, p.skin)
  box(g, 10, 3, 15, 3, p.skin)
  box(g, 10, 13, 15, 13, p.skin)
  box(g, 11, 14, 12, 14, p.skin)
  put(g, 17, 10, p.skin) // nariz
  // Cabelo: topo, nuca e franja.
  box(g, 9, 1, 15, 1, hh)
  box(g, 8, 2, 16, 3, hh)
  box(g, 7, 3, 9, 10, hh)
  box(g, 10, 4, 16, 4, hh)
  put(g, 16, 5, hh)
  put(g, 10, 5, hh)
  if (p.style === 'long') box(g, 6, 4, 9, 17, hh)
  if (p.style === 'bun') {
    box(g, 5, 1, 7, 4, hh)
    put(g, 4, 2, hh)
  }
  if (p.style === 'short') put(g, 8, 11, hh)
  if (p.style === 'cap') {
    const cap = p.cap ?? INK
    box(g, 9, 0, 15, 0, cap)
    box(g, 8, 1, 16, 3, cap)
    box(g, 14, 3, 20, 4, cap) // aba para a frente
    put(g, 12, 1, WHITE)
  }
  // Orelha.
  box(g, 11, 8, 11, 9, shade(p.skin, 0.88))
  // Olho, bochecha e boca.
  if (f.eyes === 'closed') box(g, 14, 9, 15, 9, INK)
  else if (f.eyes === 'happy') {
    put(g, 13, 9, INK)
    put(g, 14, 8, INK)
    put(g, 15, 9, INK)
  } else {
    box(g, 14, 8, 14, 9, INK)
    put(g, 15, 8, WHITE)
  }
  put(g, 13, 11, BLUSH)
  if (f.mouth === 'open') {
    box(g, 14, 11, 15, 12, INK)
    put(g, 15, 12, MOUTH)
  } else {
    put(g, 15, 12, INK)
    put(g, 14, 12, INK)
  }
}

function body(g: Grid, p: Person) {
  box(g, 10, 15, 13, 15, p.shirt)
  box(g, 10, 16, 14, 21, p.shirt)
  box(g, 10, 22, 14, 23, p.pants)
}

function draw(p: Person, legs: SideLegs, near: SideArm, far: SideArm, face: SideFace): Grid {
  const g = grid(W, H)
  const [ln, lf] = LEGS[legs]
  limb(g, ARMS[far], p, true)
  leg(g, lf, p, true)
  body(g, p)
  leg(g, ln, p, false)
  head(g, p, face)
  limb(g, ARMS[near], p, false)
  return outline(g)
}

const cache = new Map<string, Art>()

/** O personagem de perfil, olhando para a direita. */
export function sideArt(
  p: Person,
  legs: SideLegs,
  near: SideArm = 'down',
  far: SideArm = 'down',
  face: SideFace = {},
): Art {
  const key = `${p.name}:${legs}:${near}:${far}:${face.eyes ?? ''}:${face.mouth ?? ''}`
  let a = cache.get(key)
  if (!a) {
    a = { w: W, h: H, runs: runs(draw(p, legs, near, far, face)) }
    cache.set(key, a)
  }
  return a
}

/** Os 4 quadros de andar, com os braços balançando ao contrário das pernas. */
export const WALK: [SideLegs, SideArm, SideArm][] = [
  ['walkA', 'back', 'fwd'],
  ['walkB', 'down', 'down'],
  ['walkC', 'fwd', 'back'],
  ['walkD', 'down', 'down'],
]
/** Os 2 quadros de correr. */
export const RUN: [SideLegs, SideArm, SideArm][] = [
  ['runA', 'runBack', 'runFwd'],
  ['runB', 'runFwd', 'runBack'],
]

/** Quadro de andar ou correr no instante `t` (ms), com `step` ms por quadro. */
export function gait(p: Person, t: number, kind: 'walk' | 'run' = 'walk', step = 120, near?: SideArm): Art {
  const cycle = kind === 'walk' ? WALK : RUN
  const [legs, n, f] = cycle[Math.floor(Math.max(0, t) / step) % cycle.length]!
  return sideArt(p, legs, near ?? n, f, { mouth: kind === 'run' ? 'open' : 'smile' })
}
