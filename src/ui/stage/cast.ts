// O elenco do LudoTrip em pixel art 24 × 30 (aprovado no protótipo): os mesmos 4 viajantes no mapa, no
// Dia/Noite e em toda animação futura. Cada quadro é montado por partes (pernas, tronco, braços, cabeça,
// rosto) e ganha contorno automático; o resultado vira poucos <rect> (tiras da mesma cor), sem imagens.

import {
  box,
  grid as gridOf,
  INK,
  outline as outlineOf,
  put,
  runs,
  type Art,
  type Grid,
  type Run,
} from './art'

export const W = 24
export const H = 30

export type HairStyle = 'short' | 'long' | 'cap' | 'bun'
export interface Person {
  name: string
  hair: string
  skin: string
  shirt: string
  pants: string
  style: HairStyle
  cap?: string
}

export const CAST: readonly Person[] = [
  { name: 'Ana', hair: '#3a2a2a', skin: '#f3c9a8', shirt: '#2b3f6b', pants: '#3a2c3a', style: 'short' },
  { name: 'Bia', hair: '#6a3a2c', skin: '#e9b48f', shirt: '#e2809f', pants: '#2b3f6b', style: 'long' },
  {
    name: 'Caio',
    hair: '#c99a4a',
    skin: '#f6d5bd',
    shirt: '#557a3e',
    pants: '#3a2c3a',
    style: 'cap',
    cap: '#c4313a',
  },
  { name: 'Duda', hair: '#1d1a20', skin: '#b07a57', shirt: '#c4313a', pants: '#241a28', style: 'bun' },
]

export { INK } from './art'
export type { Grid } from './art'
export const SHOE = '#3a2c3a'
export const WHITE = '#ffffff'
export const BLUSH = '#f2a0a8'
export const MOUTH = '#7a2a2a'

type Pt = readonly [number, number]

const grid = (): Grid => gridOf(W, H)

// Membros: pontos de 2 px de largura por pose (lado direito da tela; o esquerdo espelha).
interface Arm {
  sleeve: Pt[]
  skin: Pt[]
  hand: Pt[]
}
const ARMS = {
  down: {
    sleeve: [
      [16, 16],
      [16, 17],
      [16, 18],
    ],
    skin: [
      [16, 19],
      [16, 20],
    ],
    hand: [
      [16, 21],
      [16, 22],
    ],
  },
  up: {
    sleeve: [
      [16, 15],
      [17, 14],
      [18, 13],
    ],
    skin: [
      [18, 12],
      [19, 11],
      [19, 10],
      [19, 9],
      [19, 8],
    ],
    hand: [
      [19, 6],
      [19, 7],
      [20, 6],
    ],
  },
  // De costas, subindo a corda: os braços passam ao lado da cabeça e as mãos se encontram no alto.
  rope: {
    sleeve: [
      [16, 15],
      [17, 14],
      [17, 13],
    ],
    skin: [
      [17, 12],
      [17, 11],
      [17, 10],
      [17, 9],
      [17, 8],
      [17, 7],
      [17, 6],
      [16, 5],
      [15, 4],
      [14, 3],
    ],
    hand: [
      [12, 1],
      [12, 2],
      [13, 2],
    ],
  },
  wave: {
    sleeve: [
      [17, 14],
      [18, 13],
      [18, 12],
    ],
    skin: [
      [18, 11],
      [19, 10],
      [19, 9],
      [19, 8],
    ],
    hand: [
      [19, 6],
      [19, 7],
      [20, 6],
    ],
  },
  out: {
    sleeve: [
      [16, 16],
      [17, 16],
      [18, 16],
    ],
    skin: [
      [19, 16],
      [20, 16],
    ],
    hand: [
      [21, 15],
      [21, 16],
      [22, 16],
    ],
  },
  reachDown: {
    sleeve: [
      [16, 16],
      [17, 17],
    ],
    skin: [
      [18, 18],
      [18, 19],
      [19, 20],
    ],
    hand: [
      [19, 21],
      [20, 21],
      [20, 22],
    ],
  },
  grabHigh: {
    sleeve: [
      [16, 14],
      [16, 13],
    ],
    skin: [
      [16, 12],
      [16, 11],
      [16, 10],
      [15, 8],
      [15, 9],
    ],
    hand: [
      [13, 0],
      [14, 1],
      [14, 2],
      [13, 2],
    ],
  },
  grabLow: {
    sleeve: [
      [15, 16],
      [15, 17],
    ],
    skin: [[14, 18]],
    hand: [
      [12, 18],
      [12, 19],
      [13, 19],
    ],
  },
  hip: {
    sleeve: [
      [16, 16],
      [17, 17],
    ],
    skin: [
      [18, 18],
      [17, 19],
    ],
    hand: [
      [16, 20],
      [16, 21],
    ],
  },
  thumb: {
    sleeve: [
      [16, 16],
      [17, 16],
    ],
    skin: [
      [18, 16],
      [19, 15],
    ],
    hand: [
      [19, 13],
      [19, 14],
      [20, 12],
    ],
  },
  camera: {
    sleeve: [
      [15, 15],
      [14, 14],
    ],
    skin: [[13, 13]],
    hand: [
      [12, 12],
      [12, 13],
    ],
  },
  // O outro tempo do aceno: o braço continua no alto, com a mão inclinada para o outro lado.
  wave2: {
    sleeve: [
      [17, 14],
      [18, 13],
      [18, 12],
    ],
    skin: [
      [18, 11],
      [18, 10],
      [18, 9],
      [17, 8],
    ],
    hand: [
      [16, 6],
      [16, 7],
      [17, 6],
    ],
  },
} satisfies Record<string, Arm>
type ArmPose = keyof typeof ARMS
const mirror = (x: number) => W - 1 - x - 1 // membros têm 2 px de largura: espelha o par

function drawArm(g: Grid, pose: ArmPose, side: 'L' | 'R', p: Person) {
  const a: Arm = ARMS[pose]
  const X = (x: number) => (side === 'R' ? x : mirror(x))
  for (const [x, y] of a.sleeve) box(g, X(x), y, X(x) + 1, y, p.shirt)
  for (const [x, y] of [...a.skin, ...a.hand]) box(g, X(x), y, X(x) + 1, y, p.skin)
}

interface Legs {
  l: Pt[]
  r: Pt[]
  shoeL: Pt
  shoeR: Pt
}
const LEGS = {
  stand: {
    l: [
      [9, 23],
      [9, 24],
      [9, 25],
      [9, 26],
      [9, 27],
    ],
    r: [
      [13, 23],
      [13, 24],
      [13, 25],
      [13, 26],
      [13, 27],
    ],
    shoeL: [8, 28],
    shoeR: [13, 28],
  },
  walkA: {
    l: [
      [9, 23],
      [9, 24],
      [8, 25],
      [8, 26],
      [7, 27],
    ],
    r: [
      [13, 23],
      [13, 24],
      [14, 25],
      [14, 26],
      [15, 27],
    ],
    shoeL: [6, 28],
    shoeR: [15, 28],
  },
  walkB: {
    l: [
      [9, 23],
      [9, 24],
      [10, 25],
      [10, 26],
      [10, 27],
    ],
    r: [
      [13, 23],
      [13, 24],
      [12, 25],
      [12, 26],
      [12, 27],
    ],
    shoeL: [9, 28],
    shoeR: [12, 28],
  },
  climbA: {
    l: [
      [9, 23],
      [9, 24],
      [9, 25],
      [9, 26],
      [9, 27],
    ],
    r: [
      [13, 23],
      [14, 23],
      [15, 23],
      [15, 24],
    ],
    shoeL: [8, 28],
    shoeR: [15, 25],
  },
  climbB: {
    l: [
      [9, 23],
      [8, 23],
      [7, 23],
      [7, 24],
    ],
    r: [
      [13, 23],
      [13, 24],
      [13, 25],
      [13, 26],
      [13, 27],
    ],
    shoeL: [5, 25],
    shoeR: [13, 28],
  },
  jump: {
    l: [
      [9, 23],
      [8, 24],
      [8, 25],
    ],
    r: [
      [13, 23],
      [14, 24],
      [14, 25],
    ],
    shoeL: [7, 26],
    shoeR: [14, 26],
  },
  sit: {
    l: [
      [9, 23],
      [10, 23],
      [11, 23],
    ],
    r: [
      [13, 23],
      [14, 23],
      [15, 23],
      [16, 23],
    ],
    shoeL: [12, 24],
    shoeR: [17, 24],
  },
} satisfies Record<string, Legs>
type LegPose = keyof typeof LEGS

function drawLegs(g: Grid, pose: LegPose, p: Person) {
  const L: Legs = LEGS[pose]
  box(g, 9, 23, 14, 23, p.pants)
  for (const [x, y] of [...L.l, ...L.r]) box(g, x, y, x + 1, y, p.pants)
  box(g, L.shoeL[0], L.shoeL[1], L.shoeL[0] + 2, L.shoeL[1] + 1, SHOE)
  box(g, L.shoeR[0], L.shoeR[1], L.shoeR[0] + 2, L.shoeR[1] + 1, SHOE)
}

interface Face {
  eyes?: 'open' | 'closed' | 'happy' | 'squint'
  mouth?: 'smile' | 'line' | 'open' | 'puff' | 'blow'
  cheeks?: boolean
}

function drawHead(g: Grid, p: Person, face: Face) {
  // Cabeça (pele) e pescoço.
  box(g, 7, 4, 16, 13, p.skin)
  box(g, 8, 3, 15, 3, p.skin)
  box(g, 11, 14, 12, 14, p.skin)
  if (face.cheeks) {
    box(g, 6, 9, 6, 12, p.skin)
    box(g, 17, 9, 17, 12, p.skin)
  }
  // Cabelo por estilo.
  const hh = p.hair
  box(g, 8, 1, 15, 1, hh)
  box(g, 7, 2, 16, 4, hh)
  box(g, 6, 3, 6, 8, hh)
  box(g, 17, 3, 17, 8, hh)
  if (p.style === 'short') {
    box(g, 7, 5, 10, 5, hh)
    box(g, 13, 5, 16, 6, hh)
    put(g, 7, 6, hh)
  }
  if (p.style === 'long') {
    box(g, 7, 5, 16, 5, hh)
    box(g, 5, 4, 6, 15, hh)
    box(g, 17, 4, 18, 15, hh)
  }
  if (p.style === 'bun') {
    box(g, 9, 0, 14, 0, hh)
    box(g, 7, 5, 9, 5, hh)
    box(g, 14, 5, 16, 5, hh)
  }
  if (p.style === 'cap') {
    const cap = p.cap ?? INK
    box(g, 7, 1, 16, 4, cap)
    box(g, 8, 0, 15, 0, cap)
    box(g, 14, 4, 20, 5, cap)
    put(g, 11, 2, WHITE)
    put(g, 12, 2, WHITE)
  }
  // Olhos.
  for (const ex of [9, 13]) {
    if (face.eyes === 'open') {
      box(g, ex, 8, ex + 1, 9, INK)
      put(g, ex, 8, WHITE)
    } else if (face.eyes === 'closed') box(g, ex, 9, ex + 1, 9, INK)
    else if (face.eyes === 'happy') {
      put(g, ex, 9, INK)
      put(g, ex + 1, 8, INK)
      put(g, ex + 2, 9, INK)
    } else if (face.eyes === 'squint') {
      box(g, ex, 9, ex + 1, 9, INK)
      put(g, ex + (ex === 9 ? 1 : 0), 8, INK)
    }
  }
  // Bochechas e boca.
  put(g, 8, 11, BLUSH)
  put(g, 15, 11, BLUSH)
  if (face.mouth === 'smile') {
    put(g, 10, 11, INK)
    box(g, 11, 12, 12, 12, INK)
    put(g, 13, 11, INK)
  }
  if (face.mouth === 'line' || face.mouth === 'puff') box(g, 11, 12, 12, 12, INK)
  if (face.mouth === 'open') {
    box(g, 10, 11, 13, 11, INK)
    box(g, 11, 12, 12, 12, MOUTH)
    put(g, 10, 12, INK)
    put(g, 13, 12, INK)
  }
  if (face.mouth === 'blow') {
    box(g, 15, 11, 16, 12, INK)
    put(g, 16, 11, MOUTH)
  }
}

// De costas: a cabeça é toda cabelo (ou boné), com o detalhe de cada estilo.
function drawHeadBack(g: Grid, p: Person) {
  const hh = p.hair
  box(g, 7, 2, 16, 13, hh)
  box(g, 8, 1, 15, 1, hh)
  box(g, 6, 3, 6, 11, hh)
  box(g, 17, 3, 17, 11, hh)
  box(g, 8, 12, 15, 13, p.skin) // nuca
  box(g, 11, 14, 12, 14, p.skin)
  box(g, 9, 11, 14, 11, hh)
  if (p.style === 'long') {
    box(g, 6, 3, 17, 15, hh)
    box(g, 5, 5, 18, 15, hh)
  }
  if (p.style === 'bun') box(g, 9, 0, 14, 0, hh)
  if (p.style === 'cap') {
    const cap = p.cap ?? INK
    box(g, 7, 1, 16, 5, cap)
    box(g, 8, 0, 15, 0, cap)
    box(g, 10, 5, 13, 5, WHITE)
  }
}

function drawBody(g: Grid, p: Person) {
  box(g, 9, 15, 14, 15, p.shirt)
  box(g, 8, 16, 15, 22, p.shirt)
  put(g, 11, 15, p.skin) // gola
  put(g, 12, 15, p.skin)
  box(g, 8, 22, 15, 22, p.pants) // cinto
}

interface Pose {
  arms: [ArmPose, ArmPose]
  legs: LegPose
  face: Face
  back?: boolean
  /** Onde está a câmera: no rosto (fotografando), no peito (baixada) ou na mão esquerda. */
  camera?: 'face' | 'chest' | 'hand' | 'handOut'
}
export const POSES = {
  idle: { arms: ['down', 'down'], legs: 'stand', face: { eyes: 'open', mouth: 'smile' } },
  walkA: { arms: ['down', 'down'], legs: 'walkA', face: { eyes: 'open', mouth: 'smile' } },
  walkB: { arms: ['down', 'down'], legs: 'walkB', face: { eyes: 'open', mouth: 'smile' } },
  climbA: { arms: ['rope', 'rope'], legs: 'climbA', face: {}, back: true },
  climbB: { arms: ['rope', 'rope'], legs: 'climbB', face: {}, back: true },
  reach: { arms: ['down', 'reachDown'], legs: 'stand', face: { eyes: 'open', mouth: 'line' } },
  inhale: { arms: ['down', 'down'], legs: 'stand', face: { eyes: 'squint', mouth: 'puff', cheeks: true } },
  blow: { arms: ['down', 'down'], legs: 'stand', face: { eyes: 'closed', mouth: 'blow', cheeks: true } },
  blink: { arms: ['down', 'down'], legs: 'stand', face: { eyes: 'closed', mouth: 'smile' } },
  cheer: { arms: ['up', 'up'], legs: 'jump', face: { eyes: 'happy', mouth: 'open' } },
  wave: { arms: ['down', 'wave'], legs: 'stand', face: { eyes: 'happy', mouth: 'smile' } },
  sit: { arms: ['down', 'down'], legs: 'sit', face: { eyes: 'open', mouth: 'smile' } },
  photo: {
    arms: ['camera', 'camera'],
    legs: 'stand',
    face: { eyes: 'squint', mouth: 'smile' },
    camera: 'face',
  },
  thumb: { arms: ['hip', 'thumb'], legs: 'stand', face: { eyes: 'happy', mouth: 'smile' } },
  // O outro tempo do aceno (alternar com `wave` a cada 140 ms).
  wave2: { arms: ['down', 'wave2'], legs: 'stand', face: { eyes: 'happy', mouth: 'smile' } },
  // Entregando algo (o bilhete na mão estendida).
  give: { arms: ['down', 'out'], legs: 'stand', face: { eyes: 'open', mouth: 'smile' } },
  // Comendo: as duas mãos na boca, olhos felizes.
  eat: { arms: ['camera', 'camera'], legs: 'stand', face: { eyes: 'happy', mouth: 'open' } },
  // A câmera baixada no peito, segura com as duas mãos (entre fotografar e o joinha).
  camLow: {
    arms: ['grabLow', 'grabLow'],
    legs: 'stand',
    face: { eyes: 'open', mouth: 'smile' },
    camera: 'chest',
  },
  // Joinha com a câmera na outra mão.
  thumbCam: {
    arms: ['hip', 'thumb'],
    legs: 'stand',
    face: { eyes: 'happy', mouth: 'smile' },
    camera: 'hand',
  },
  // De costas, em pé (virado para uma porta, prestes a entrar).
  back: { arms: ['down', 'down'], legs: 'stand', face: {}, back: true },
  // Susto com a câmera na mão (a foto do gato).
  oopsCam: {
    arms: ['out', 'out'],
    legs: 'stand',
    face: { eyes: 'open', mouth: 'open' },
    camera: 'handOut',
  },
  // Susto ou surpresa (a variação rara).
  oops: { arms: ['out', 'out'], legs: 'stand', face: { eyes: 'open', mouth: 'open' } },
} satisfies Record<string, Pose>
export type PoseName = keyof typeof POSES

// Braços erguidos passam por cima da cabeça; os outros ficam atrás dela.
const OVER = new Set<ArmPose>(['up', 'wave', 'wave2', 'rope', 'camera', 'thumb'])

function draw(person: Person, poseName: PoseName): Grid {
  const pose: Pose = POSES[poseName]
  const g = grid()
  drawLegs(g, pose.legs, person)
  drawBody(g, person)
  pose.arms.forEach((a, i) => !OVER.has(a) && drawArm(g, a, i ? 'R' : 'L', person))
  if (pose.back) drawHeadBack(g, person)
  else drawHead(g, person, pose.face)
  pose.arms.forEach((a, i) => OVER.has(a) && drawArm(g, a, i ? 'R' : 'L', person))
  if (pose.camera === 'face') {
    box(g, 9, 9, 14, 12, INK)
    box(g, 11, 10, 12, 11, '#9a95a3')
    put(g, 13, 9, WHITE)
  }
  if (pose.camera === 'chest') {
    box(g, 9, 17, 14, 20, INK)
    box(g, 11, 18, 12, 19, '#9a95a3')
  }
  if (pose.camera === 'handOut') {
    box(g, 0, 14, 4, 17, INK)
    box(g, 1, 15, 2, 16, '#9a95a3')
  }
  if (pose.camera === 'hand') {
    box(g, 2, 19, 6, 22, INK)
    box(g, 3, 20, 4, 21, '#9a95a3')
  }
  return outlineOf(g)
}

const cache = new Map<string, Run[]>()

/** O quadro de um personagem numa pose, já em tiras (guardado: cada quadro é desenhado uma vez só). */
export function sprite(person: Person, pose: PoseName): Run[] {
  const key = `${person.name}:${pose}`
  let r = cache.get(key)
  if (!r) {
    r = runs(draw(person, pose))
    cache.set(key, r)
  }
  return r
}

/** O quadro como arte (tamanho + tiras), para o Palco. */
export const frontArt = (person: Person, pose: PoseName): Art => ({ w: W, h: H, runs: sprite(person, pose) })

/** O mesmo quadro como grade de cores (para testes e ferramentas). */
export const render = draw

export { runs, toSvgRects, type Run } from './art'

/** O personagem de cada viajante (o 5º em diante repete o elenco). */
export const castFor = (i: number): Person => CAST[((i % CAST.length) + CAST.length) % CAST.length]!

/** Distância entre um viajante e o próximo, em pixels do elenco (os sprites quase se encostam). */
export const STRIDE = 17

/** Tamanho do grupo de viajantes desenhado com `height` px de altura. */
export function travelersSize(count: number, height: number): { width: number; height: number } {
  if (count >= 5) return { width: (18 * height * 0.85) / 8, height: height * 0.85 }
  const n = Math.min(4, Math.max(1, count))
  return { width: (((n - 1) * STRIDE + W) * height) / H, height }
}
