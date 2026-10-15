// Objetos do mundo da viagem em pixel art, na mesma densidade e com o mesmo contorno do elenco 24 × 30:
// mala, bilhete, carimbo, futon, cama, barraca, travesseiro, câmera, polaroid, comida, nuvem, balão, pipa,
// cartão da viagem e os veículos (com as cabeças dos viajantes nas janelas). Desenhados por código
// (formas simples), para ficarem fáceis de ajustar quando o avaliador pedir.

import { box, grid, outline, put, runs, shade, type Art, type Grid } from './art'
import type { Person } from './cast'

export const C = {
  ink: '#241a28',
  white: '#ffffff',
  cream: '#f6edeb',
  paper: '#fffbe6',
  red: '#c4313a',
  orange: '#e9573f',
  pink: '#e2809f',
  pinkLight: '#f6c6d4',
  yellow: '#f2c14e',
  yellowLight: '#ffe7a3',
  blue: '#2b3f6b',
  blueLight: '#9db4f0',
  sky: '#cfe3ee',
  green: '#557a3e',
  greenLight: '#9dc57f',
  brown: '#8a5a3a',
  tan: '#c4915e',
  silver: '#9a95a3',
  silverLight: '#c9c3cf',
  dark: '#3a2c3a',
  soft: '#6e5b69',
} as const

/** Desenha numa grade do tamanho pedido, põe 1 pixel de margem e devolve a arte já contornada. */
function make(w: number, h: number, draw: (g: Grid) => void, opts: { outline?: boolean } = {}): Art {
  const inner = grid(w, h)
  draw(inner)
  const g = pad(inner)
  const done = opts.outline === false ? g : outline(g)
  return { w: w + 2, h: h + 2, runs: runs(done) }
}

/** A mesma grade com 1 pixel vazio em volta (onde o contorno cabe). */
function pad(inner: Grid): Grid {
  const g = grid((inner[0]?.length ?? 0) + 2, inner.length + 2)
  inner.forEach((row, y) => row.forEach((c, x) => c && (g[y + 1]![x + 1] = c)))
  return g
}

function disc(g: Grid, cx: number, cy: number, r: number, c: string) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.3) put(g, x, y, c)
}

const memo = new Map<string, Art>()
const cached = (key: string, f: () => Art): Art => {
  let a = memo.get(key)
  if (!a) {
    a = f()
    memo.set(key, a)
  }
  return a
}

// ---------------------------------------------------------------------------
// Mala, bilhete, carimbo
// ---------------------------------------------------------------------------

/** Mala de mão (12 × 10), com alça, tiras e adesivo. */
export const suitcase = (color: string = C.orange) =>
  cached(`mala:${color}`, () =>
    make(12, 10, (g) => {
      box(g, 4, 0, 7, 0, C.dark)
      put(g, 4, 1, C.dark)
      put(g, 7, 1, C.dark)
      box(g, 0, 2, 11, 8, color)
      box(g, 0, 8, 11, 8, shade(color))
      box(g, 2, 2, 2, 8, C.tan)
      box(g, 9, 2, 9, 8, C.tan)
      box(g, 5, 4, 6, 5, C.cream)
      put(g, 1, 9, C.dark)
      put(g, 10, 9, C.dark)
    }),
  )

/**
 * Mala aberta (13 × 13): a tampa fina inclinada para trás, a dobradiça escura e o forro claro por dentro;
 * as tiras iguais às da mala fechada.
 */
export const suitcaseOpen = (color: string = C.orange) =>
  cached(`mala-aberta:${color}`, () =>
    make(13, 13, (g) => {
      // Tampa: 2 px de espessura, caindo para trás (para a esquerda), presa na dobradiça.
      for (let k = 0; k < 4; k++) box(g, 1 + k, 3 - k, 9 + k, 3 - k, k === 0 ? shade(color, 0.85) : color)
      box(g, 0, 4, 12, 4, C.dark) // dobradiça
      box(g, 0, 5, 12, 11, color)
      box(g, 1, 5, 11, 7, C.cream) // forro
      box(g, 1, 7, 11, 7, shade(C.cream, 0.9))
      box(g, 0, 11, 12, 11, shade(color))
      box(g, 2, 8, 2, 11, C.tan)
      box(g, 10, 8, 10, 11, C.tan)
      put(g, 1, 12, C.dark)
      put(g, 11, 12, C.dark)
    }),
  )

/** A parede da frente da mala aberta (desenhada por cima do que entra nela). */
export const suitcaseFront = (color: string = C.orange) =>
  cached(`mala-frente:${color}`, () =>
    make(13, 5, (g) => {
      box(g, 0, 0, 12, 3, color)
      box(g, 0, 3, 12, 3, shade(color))
      box(g, 2, 0, 2, 3, C.tan)
      box(g, 10, 0, 10, 3, C.tan)
      put(g, 1, 4, C.dark)
      put(g, 11, 4, C.dark)
    }),
  )

export type TicketState = 'plain' | 'punched' | 'stamped'

/** Bilhete (13 × 7) com picote; picotado tem um furo; carimbado tem o selo vermelho. */
export const ticket = (state: TicketState = 'plain') =>
  cached(`bilhete:${state}`, () => {
    const g = grid(15, 9)
    const o = (x: number, y: number, c: string) => put(g, x + 1, y + 1, c)
    for (let y = 0; y < 7; y++) for (let x = 0; x < 13; x++) o(x, y, C.yellowLight)
    for (let y = 0; y < 7; y += 2) o(8, y, '#c9a24a')
    for (let x = 1; x <= 5; x++) o(x, 1, C.blue)
    for (let x = 1; x <= 6; x++) o(x, 3, C.blue)
    for (let x = 1; x <= 4; x++) o(x, 5, C.soft)
    if (state === 'stamped') {
      for (let y = 1; y <= 4; y++) for (let x = 9; x <= 12; x++) o(x, y, C.red)
      o(10, 2, C.yellowLight)
      o(11, 3, C.yellowLight)
    }
    if (state === 'punched') {
      // O picote: meia-lua de 2 × 2 na borda do canhoto (o contorno vira a borda dela).
      for (const [x, y] of [
        [11, 3],
        [12, 3],
        [11, 4],
        [12, 4],
      ] as const)
        g[y + 1]![x + 1] = null
    }
    return { w: 15, h: 9, runs: runs(outline(g)) }
  })

/** O bilhete deitado, visto de lado (15 × 2); carimbado, com a marca vermelha no meio. */
export const ticketFlat = (stamped = false) =>
  cached(`bilhete-deitado:${stamped}`, () =>
    // Em leve perspectiva (13 × 4): a face de cima à vista, com as linhas e o picote; a borda da frente
    // mais escura. Carimbado, o selo 3 × 3 no centro.
    make(13, 4, (g) => {
      box(g, 0, 0, 12, 2, C.yellowLight)
      box(g, 1, 0, 4, 0, C.blue)
      box(g, 1, 2, 3, 2, C.blue)
      put(g, 9, 0, '#c9a24a')
      put(g, 9, 2, '#c9a24a')
      box(g, 0, 3, 12, 3, shade(C.yellowLight, 0.82))
      if (stamped) box(g, 5, 0, 7, 2, C.red)
    }),
  )

/** Carimbo japonês (hanko), pequeno (3 × 6): cabo de madeira 3 × 4 e base vermelha 3 × 2. */
export const hanko = () =>
  cached('hanko', () =>
    make(3, 6, (g) => {
      box(g, 0, 0, 2, 3, C.tan)
      put(g, 1, 0, C.brown)
      box(g, 0, 4, 2, 5, C.red)
    }),
  )

/** Pedacinho de confete de papel (2 × 2), sem contorno. */
export const confetti = (color: string) =>
  cached(`confete:${color}`, () =>
    make(
      2,
      2,
      (g) => {
        box(g, 0, 0, 1, 1, color)
        put(g, 1, 1, shade(color))
      },
      { outline: false },
    ),
  )

// ---------------------------------------------------------------------------
// Dormir: futon, cama, barraca, travesseiro, penas, "z"
// ---------------------------------------------------------------------------

/** Futon esticado (28 × 5): colchão e travesseiro. */
export const futon = () =>
  cached('futon', () =>
    make(28, 5, (g) => {
      box(g, 0, 2, 27, 4, C.white)
      box(g, 0, 4, 27, 4, C.silverLight)
      box(g, 1, 0, 6, 2, C.paper)
      box(g, 1, 2, 6, 2, '#e8dcc0')
    }),
  )

/** O cobertor do futon (por cima de quem dorme): 19 × 6, cobre o corpo deitado inteiro. */
export const futonBlanket = () =>
  cached('futon-cobertor', () =>
    make(19, 6, (g) => {
      box(g, 0, 0, 18, 5, C.blueLight)
      for (let x = 2; x < 18; x += 4) {
        put(g, x, 2, C.blue)
        put(g, x + 1, 3, C.blue)
      }
      box(g, 0, 0, 18, 0, C.white)
    }),
  )

/** Futon enrolado (9 × 7). */
export const futonRolled = () =>
  cached('futon-enrolado', () =>
    make(9, 7, (g) => {
      disc(g, 4, 3, 3.6, C.blueLight)
      disc(g, 4, 3, 2, C.white)
      put(g, 4, 3, C.blueLight)
      put(g, 5, 3, C.blueLight)
    }),
  )

/** Cama de hotel (30 × 14), cabeceira à esquerda. */
export const bed = () =>
  cached('cama', () =>
    make(30, 14, (g) => {
      box(g, 0, 0, 3, 13, C.brown)
      box(g, 1, 1, 2, 10, C.tan)
      box(g, 4, 6, 29, 8, C.white)
      box(g, 4, 4, 9, 6, C.paper)
      box(g, 4, 9, 29, 10, C.brown)
      box(g, 4, 11, 5, 13, C.brown)
      box(g, 28, 11, 29, 13, C.brown)
    }),
  )

/** O cobertor da cama (por cima de quem dorme): 17 × 6, não passa do pé da cama. */
export const bedBlanket = () =>
  cached('cama-cobertor', () =>
    make(17, 6, (g) => {
      box(g, 0, 0, 16, 5, C.pink)
      box(g, 0, 0, 16, 0, C.white)
      for (let x = 3; x < 16; x += 5) box(g, x, 2, x, 5, C.pinkLight)
    }),
  )

/** Barraca (31 × 20): triângulo verde com a porta escura no meio. */
export const tent = () =>
  cached('barraca', () =>
    make(31, 20, (g) => {
      for (let y = 0; y < 20; y++) {
        const hw = Math.round(y * 0.78)
        box(g, 15 - hw, y, 15 + hw, y, C.green)
        if (hw > 1) put(g, 15 - hw + 1, y, C.greenLight)
        if (y >= 7) {
          const dw = Math.round((y - 7) * 0.48)
          box(g, 15 - dw, y, 15 + dw, y, C.dark)
        }
      }
      box(g, 14, 0, 16, 1, C.red) // bandeirinha no topo
    }),
  )

/** A lona da barraca sem a porta (desenhada por cima de quem espia: a cabeça só aparece pelo vão). */
export const tentShell = () =>
  cached('barraca-lona', () => {
    const g = grid(31, 20)
    for (let y = 0; y < 20; y++) {
      const hw = Math.round(y * 0.78)
      box(g, 15 - hw, y, 15 + hw, y, C.green)
      if (hw > 1) put(g, 15 - hw + 1, y, C.greenLight)
      if (y >= 7) {
        const dw = Math.round((y - 7) * 0.48)
        for (let x = 15 - dw; x <= 15 + dw; x++) g[y]![x] = null
      }
    }
    box(g, 14, 0, 16, 1, C.red)
    const p = grid(33, 22)
    g.forEach((row, y) => row.forEach((c, x) => c && (p[y + 1]![x + 1] = c)))
    return { w: 33, h: 22, runs: runs(outline(p)) }
  })

/** Travesseiro pequeno (9 × 5). */
export const pillow = () =>
  cached('travesseiro', () =>
    make(9, 5, (g) => {
      box(g, 1, 0, 7, 4, C.paper)
      box(g, 0, 1, 8, 3, C.paper)
      box(g, 1, 4, 7, 4, '#e8dcc0')
    }),
  )

/** Pena (6 × 2): branca, com a ponta cinza. */
export const feather = () =>
  cached('pena', () =>
    make(6, 2, (g) => {
      box(g, 0, 0, 4, 0, C.white)
      box(g, 1, 1, 5, 1, C.white)
      put(g, 5, 1, C.silverLight)
    }),
  )

/** "z" de sono (4 × 5). */
export const zee = () =>
  cached('z', () =>
    make(4, 5, (g) => {
      box(g, 0, 0, 3, 0, C.blueLight)
      put(g, 2, 1, C.blueLight)
      put(g, 1, 2, C.blueLight)
      put(g, 0, 3, C.blueLight)
      box(g, 0, 4, 3, 4, C.blueLight)
    }),
  )

// ---------------------------------------------------------------------------
// Atividade: flash, polaroid, comida, coração, brilho, "!"
// ---------------------------------------------------------------------------

/** Clarão do flash (9 × 9). */
export const flash = () =>
  cached('flash', () =>
    make(
      9,
      9,
      (g) => {
        box(g, 4, 0, 4, 8, C.yellowLight)
        box(g, 0, 4, 8, 4, C.yellowLight)
        box(g, 3, 3, 5, 5, C.white)
        put(g, 2, 2, C.yellowLight)
        put(g, 6, 2, C.yellowLight)
        put(g, 2, 6, C.yellowLight)
        put(g, 6, 6, C.yellowLight)
      },
      { outline: false },
    ),
  )

export type Photo = 'view' | 'group' | 'cat' | 'food'

/** Polaroid (11 × 13): a moldura branca e a foto do momento. */
export const polaroid = (photo: Photo = 'view', people: Person[] = []) =>
  cached(`polaroid:${photo}:${people.map((p) => p.name).join()}`, () =>
    make(11, 13, (g) => {
      box(g, 0, 0, 10, 12, C.white)
      box(g, 1, 1, 9, 8, C.sky)
      if (photo === 'view') {
        for (let y = 4; y <= 8; y++) box(g, 5 - (y - 4), y, 5 + (y - 4), y, C.green)
        box(g, 4, 4, 6, 4, C.white)
        box(g, 7, 2, 8, 3, C.yellow)
      }
      if (photo === 'group') {
        box(g, 1, 7, 9, 8, C.greenLight)
        people.slice(0, 3).forEach((p, i) => {
          const x = 2 + i * 3
          box(g, x, 3, x + 1, 3, p.hair)
          box(g, x, 4, x + 1, 5, p.skin)
          box(g, x, 6, x + 1, 8, p.shirt)
        })
      }
      if (photo === 'cat') {
        box(g, 1, 1, 9, 8, C.pinkLight)
        box(g, 3, 4, 7, 8, C.orange)
        put(g, 3, 3, C.orange)
        put(g, 7, 3, C.orange)
        put(g, 4, 5, C.ink)
        put(g, 6, 5, C.ink)
        put(g, 5, 6, C.pink)
      }
      if (photo === 'food') {
        box(g, 1, 1, 9, 8, C.yellowLight)
        for (let y = 3; y <= 7; y++) box(g, 5 - (y - 3), y, 5 + (y - 3), y, C.white)
        box(g, 3, 6, 7, 7, C.ink)
      }
    }),
  )

/** Onigiri (9 × 8); `bites` mordidas tiram pedaços do canto. */
export const onigiri = (bites = 0) =>
  cached(`onigiri:${bites}`, () => {
    const g = grid(11, 10)
    for (let y = 0; y < 8; y++) {
      const hw = Math.round(y * 0.6)
      for (let x = 4 - hw; x <= 4 + hw; x++) put(g, x + 1, y + 1, C.white)
    }
    for (let x = 2; x <= 6; x++) for (let y = 5; y <= 7; y++) put(g, x + 1, y + 1, C.ink)
    if (bites >= 1)
      for (const [x, y] of [
        [6, 3],
        [7, 4],
        [7, 5],
        [8, 5],
        [6, 4],
      ] as const)
        g[y + 1]![x + 1] = null
    if (bites >= 2)
      for (const [x, y] of [
        [4, 0],
        [4, 1],
        [5, 1],
        [5, 2],
        [3, 1],
      ] as const)
        g[y + 1]![x + 1] = null
    // 3ª mordida: sobra só uma ponta de baixo.
    if (bites >= 3) for (let y = 0; y < 5; y++) for (let x = 0; x < 9; x++) g[y + 1]![x + 1] = null
    return { w: 11, h: 10, runs: runs(outline(g)) }
  })

/** Coração (7 × 6). */
export const heart = () =>
  cached('coracao', () =>
    make(7, 6, (g) => {
      box(g, 0, 1, 2, 2, C.pink)
      box(g, 4, 1, 6, 2, C.pink)
      box(g, 1, 0, 1, 0, C.pink)
      box(g, 5, 0, 5, 0, C.pink)
      box(g, 0, 2, 6, 3, C.pink)
      box(g, 1, 4, 5, 4, C.pink)
      box(g, 2, 5, 4, 5, C.pink)
      put(g, 1, 1, C.pinkLight)
    }),
  )

/** Brilho de 4 pontas (5 × 5), sem contorno. */
export const sparkle = (color: string = C.yellow) =>
  cached(`brilho:${color}`, () =>
    make(
      5,
      5,
      (g) => {
        box(g, 2, 0, 2, 4, color)
        box(g, 0, 2, 4, 2, color)
        put(g, 2, 2, C.white)
      },
      { outline: false },
    ),
  )

/** Celular (4 × 6) com a tela clara. */
export const phone = () =>
  cached('celular', () =>
    make(4, 6, (g) => {
      box(g, 0, 0, 3, 5, C.dark)
      box(g, 1, 1, 2, 3, C.sky)
    }),
  )

/** Moldura de foto (12 × 10) que salta da tela do celular. */
export const photoFrame = (people: Person[] = []) =>
  cached(`moldura:${people.map((p) => p.name).join()}`, () =>
    make(12, 10, (g) => {
      box(g, 0, 0, 11, 9, C.white)
      box(g, 1, 1, 10, 8, C.sky)
      box(g, 1, 7, 10, 8, C.greenLight)
      people.slice(0, 3).forEach((p, i) => {
        const x = 2 + i * 3
        box(g, x, 3, x + 1, 3, p.style === 'cap' ? (p.cap ?? p.hair) : p.hair)
        box(g, x, 4, x + 1, 5, p.skin)
        box(g, x, 6, x + 1, 8, p.shirt)
      })
    }),
  )

/** Estouro do balão (7 × 7): um anel com fiapos vermelhos. */
export const balloonPop = () =>
  cached('estouro', () =>
    make(
      7,
      7,
      (g) => {
        for (const [x, y] of [
          [3, 0],
          [3, 6],
          [0, 3],
          [6, 3],
          [1, 1],
          [5, 1],
          [1, 5],
          [5, 5],
        ] as const)
          put(g, x, y, C.white)
        put(g, 2, 0, C.red)
        put(g, 6, 4, C.red)
        put(g, 0, 2, C.red)
      },
      { outline: false },
    ),
  )

/** Ponto de exclamação (2 × 7). */
export const bang = () =>
  cached('exclamacao', () =>
    make(2, 7, (g) => {
      box(g, 0, 0, 1, 4, C.red)
      box(g, 0, 6, 1, 6, C.red)
    }),
  )

// ---------------------------------------------------------------------------
// Nuvem, cartão, balão, pipa
// ---------------------------------------------------------------------------

export type CloudFace = 'calm' | 'open' | 'sneeze'

/** Nuvem fofa (24 × 12) com carinha. */
export const cloud = (face: CloudFace = 'calm') =>
  cached(`nuvem:${face}`, () =>
    make(24, 12, (g) => {
      disc(g, 6, 7, 4.5, C.white)
      disc(g, 12, 5, 5.5, C.white)
      disc(g, 18, 7, 4.5, C.white)
      box(g, 3, 8, 21, 11, C.white)
      box(g, 3, 11, 21, 11, C.silverLight)
      if (face === 'sneeze') {
        // Olhos apertados: "> <".
        put(g, 9, 5, C.ink)
        put(g, 10, 6, C.ink)
        put(g, 9, 7, C.ink)
        put(g, 15, 5, C.ink)
        put(g, 14, 6, C.ink)
        put(g, 15, 7, C.ink)
      } else {
        put(g, 9, 6, C.ink)
        put(g, 15, 6, C.ink)
      }
      put(g, 8, 8, C.pinkLight)
      put(g, 16, 8, C.pinkLight)
      if (face === 'calm') box(g, 11, 8, 13, 8, C.ink)
      if (face === 'open') {
        box(g, 11, 8, 13, 9, C.ink)
        put(g, 12, 9, C.pink)
      }
      if (face === 'sneeze') box(g, 10, 8, 14, 9, C.ink)
    }),
  )

/** O cartão da viagem em miniatura (10 × 8): papel com o selo vermelho. */
export const tripCard = () =>
  cached('cartao', () =>
    make(10, 8, (g) => {
      box(g, 0, 0, 9, 7, C.paper)
      box(g, 1, 1, 3, 3, C.red)
      put(g, 2, 2, C.white)
      box(g, 5, 1, 8, 1, C.ink)
      box(g, 5, 3, 7, 3, C.soft)
      box(g, 1, 5, 8, 5, C.pinkLight)
    }),
  )

/** Balão (8 × 10) com nó. */
export const balloon = () =>
  cached('balao', () =>
    make(8, 10, (g) => {
      disc(g, 3.5, 3.8, 3.6, C.red)
      box(g, 3, 8, 4, 8, C.red)
      put(g, 3, 9, shade(C.red))
      put(g, 2, 2, C.white)
      put(g, 2, 3, C.pinkLight)
    }),
  )

/** Pipa (9 × 11) com rabinho. */
export const kite = () =>
  cached('pipa', () =>
    make(9, 11, (g) => {
      for (let y = 0; y <= 8; y++) {
        const hw = y <= 4 ? y : 8 - y
        box(g, 4 - hw, y, 4 + hw, y, y < 4 ? C.pink : C.yellow)
      }
      box(g, 4, 0, 4, 8, C.dark)
      box(g, 0, 4, 8, 4, C.dark)
      put(g, 4, 9, C.red)
      put(g, 5, 10, C.blue)
    }),
  )

/** Chapéu de palha (9 × 4) que voa da cabeça. */
export const strawHat = () =>
  cached('chapeu', () =>
    make(9, 4, (g) => {
      box(g, 2, 0, 6, 2, C.yellow)
      box(g, 2, 2, 6, 2, C.red)
      box(g, 0, 3, 8, 3, C.yellow)
    }),
  )

/** Baforada do espirro (7 × 5): uma nuvenzinha branca com o mesmo contorno da nuvem. */
export const sneezePuff = () =>
  cached('baforada', () =>
    make(7, 5, (g) => {
      disc(g, 2, 2.5, 2.2, C.white)
      disc(g, 4.5, 2, 2.2, C.white)
      box(g, 1, 4, 5, 4, C.silverLight)
    }),
  )

/** Fumacinha (5 × 5), sem contorno. */
export const puff = (size: 2 | 3 = 3) =>
  cached(`fumaca:${size}`, () =>
    make(
      5,
      5,
      (g) => {
        disc(g, 2, 2, size === 3 ? 2.4 : 1.5, C.silverLight)
        put(g, 1, 1, C.white)
      },
      { outline: false },
    ),
  )

// ---------------------------------------------------------------------------
// Veículos (de perfil, para a direita), com as cabeças dos viajantes nas janelas
// ---------------------------------------------------------------------------

/** Cabeça de passageiro na janela (4 × 5): cabelo (ou boné), rosto e olho. */
const head = (g: Grid, x: number, y: number, p: Person) => {
  box(g, x, y, x + 3, y + 1, p.style === 'cap' ? (p.cap ?? p.hair) : p.hair)
  box(g, x, y + 2, x + 3, y + 4, p.skin)
  put(g, x + 2, y + 3, C.ink)
  if (p.style === 'long') box(g, x, y + 2, x, y + 4, p.hair)
}

const wheel = (g: Grid, cx: number, cy: number, r = 3.6) => {
  disc(g, cx, cy, r, C.dark)
  box(g, cx - 1, cy - 1, cx, cy, C.silver)
}

const key = (ps: Person[]) => ps.map((p) => p.name).join()

export interface VehicleOpts {
  /** Porta aberta (alguém entrando). */
  door?: boolean
  /** Tampa de trás levantada (porta-malas). */
  hatch?: boolean
  /** Trem de pouso recolhido (o avião já no ar). */
  gearUp?: boolean
}

/** O corpo da Kombi desenhado a partir de (ox, oy). */
function drawKombi(g: Grid, ox: number, oy: number, people: Person[], o: VehicleOpts) {
  const b = (x0: number, y0: number, x1: number, y1: number, c: string) =>
    box(g, ox + x0, oy + y0, ox + x1, oy + y1, c)
  const p = (x: number, y: number, c: string) => put(g, ox + x, oy + y, c)
  b(3, 0, 44, 1, C.cream)
  b(1, 2, 46, 15, C.cream)
  b(1, 16, 46, 27, C.pink)
  b(1, 16, 46, 16, C.white)
  b(41, 3, 45, 12, C.sky) // para-brisa
  for (let k = 0; k < 4; k++) b(15 + k * 6, 4, 19 + k * 6, 12, C.sky)
  people.slice(0, 4).forEach((q, k) => head(g, ox + 15 + k * 6, oy + 6, q))
  // Porta lateral: frisos; aberta, vira um vão escuro.
  if (o.door) b(6, 3, 12, 25, C.dark)
  else {
    b(6, 3, 6, 25, shade(C.cream, 0.85))
    b(12, 3, 12, 25, shade(C.cream, 0.85))
    b(7, 4, 11, 12, C.sky)
  }
  for (let k = 0; k < 4; k++) {
    p(40 + k, 17 + k, C.white)
    p(46 - k, 17 + k, C.white)
  }
  p(47, 19, C.yellow) // farol
  b(0, 26, 47, 27, C.silver)
  wheel(g, ox + 9, oy + 29)
  wheel(g, ox + 38, oy + 29)
}

/**
 * Kombi (48 × 34), mais alta que uma pessoa: janelas na altura dos rostos, porta lateral perto da traseira
 * (x 6–12), o "V" branco na frente. Com `hatch`, a tampa traseira erguida a 45° para trás, articulada no
 * teto (a arte ganha 10 px à esquerda e 7 em cima; a Kombi em si começa em x 10, y 7).
 */
export const kombi = (people: Person[] = [], o: VehicleOpts = {}) =>
  cached(`kombi:${key(people)}:${o.door}:${o.hatch}`, () => {
    if (!o.hatch) return make(48, 34, (g) => drawKombi(g, 0, 0, people, o))
    // A Kombi começa em (10, 7); a tampa é uma placa de 5 px, articulada na quina do teto e erguida a 45°
    // para trás, com o creme da carroceria, a faixa rosa na borda e um vidro azul; o vão escuro por dentro.
    return make(58, 41, (g) => {
      drawKombi(g, 10, 7, people, o)
      box(g, 10, 9, 12, 21, C.dark) // o vão do porta-malas (3 px)
      for (let y = 1; y <= 7; y++) {
        const x1 = 10 - (7 - y)
        box(g, x1 - 4, y, x1, y, C.cream)
        put(g, x1 - 4, y, C.pink)
      }
      box(g, 5, 3, 6, 5, C.sky) // vidro (2 × 3)
    })
  })

/** Escada do avião (12 × 9): degraus do chão (esquerda) até a soleira da porta (direita). */
export const stairs = () =>
  cached('escada', () =>
    make(12, 9, (g) => {
      for (let k = 0; k < 5; k++) {
        box(g, k * 2, 8 - k * 2, 11, 8 - k * 2, C.silver)
        box(g, k * 2, 8 - k * 2 - 1, 11, 8 - k * 2 - 1, C.silverLight)
      }
      box(g, 10, 0, 11, 8, C.silver)
    }),
  )

/**
 * Avião (96 × 46): fuselagem de 26 px, mais alta que a pessoa só no conjunto com o trem de pouso; porta
 * de 9 × 23 atrás da asa (x 16–24), com a soleira 8 px acima do chão. `gearUp` recolhe as rodas.
 */
export const plane = (people: Person[] = [], o: VehicleOpts = {}) =>
  cached(`aviao:${key(people)}:${o.door}:${o.gearUp}`, () =>
    make(96, 46, (g) => {
      for (let y = 0; y <= 13; y++) box(g, 2 + Math.floor(y * 0.6), y, 10 + Math.floor(y * 1.1), y, C.red) // leme
      box(g, 4, 12, 84, 37, C.white)
      for (let y = 13; y <= 36; y++) {
        const r = Math.round(Math.sqrt(Math.max(0, 144 - (y - 24.5) ** 2)))
        box(g, 85, y, 84 + r, y, C.white)
      }
      box(g, 4, 30, 90, 31, C.red)
      box(g, 4, 37, 84, 37, C.silverLight)
      box(g, 85, 18, 92, 22, C.sky) // cabine
      for (let k = 0; k < 10; k++) box(g, 30 + k * 5, 19, 33 + k * 5, 24, C.sky)
      people.slice(0, 4).forEach((p, k) => head(g, 30 + k * 5, 19, p))
      box(g, 16, 14, 24, 36, o.door ? C.dark : C.silverLight)
      if (!o.door) box(g, 17, 15, 23, 22, C.sky)
      box(g, 44, 32, 66, 36, C.silverLight) // asa
      box(g, 50, 37, 58, 40, C.silver) // turbina
      if (!o.gearUp) {
        box(g, 28, 38, 28, 42, C.silver)
        wheel(g, 28, 43, 2.4)
        box(g, 74, 38, 74, 42, C.silver)
        wheel(g, 74, 43, 2.4)
      }
    }),
  )

/** Trem-bala (68 × 44): corpo de 36 px, porta de 7 × 27 em x 7–13, janelas na altura do rosto. */
export const train = (people: Person[] = [], o: VehicleOpts = {}) =>
  cached(`trem:${key(people)}:${o.door}`, () =>
    make(68, 44, (g) => {
      box(g, 0, 2, 52, 37, C.white)
      for (let x = 53; x <= 67; x++) {
        const top = 2 + Math.round(((x - 53) / 14) * 20)
        box(g, x, top, x, 37, C.white)
      }
      box(g, 0, 30, 67, 32, C.blue)
      box(g, 54, 9, 59, 14, C.sky)
      for (let k = 0; k < 5; k++) box(g, 18 + k * 7, 8, 23 + k * 7, 15, C.sky)
      people.slice(0, 4).forEach((p, k) => head(g, 19 + k * 7, 10, p))
      box(g, 7, 9, 13, 35, o.door ? C.dark : C.silverLight)
      if (!o.door) box(g, 8, 10, 12, 16, C.sky)
      box(g, 0, 38, 67, 39, C.silver)
      for (const x of [9, 19, 44, 54]) disc(g, x, 41.5, 2.2, C.dark)
      box(g, 30, 0, 34, 1, C.dark) // pantógrafo
    }),
  )

/** Barco (62 × 52): casco que entra na água, convés na linha 33, cabine de 32 px com porta de 7 × 25. */
export const boat = (people: Person[] = [], o: VehicleOpts = {}) =>
  cached(`barco:${key(people)}:${o.door}`, () =>
    make(62, 52, (g) => {
      for (let y = 34; y <= 51; y++) {
        const inset = Math.round((y - 34) * 0.5)
        box(g, inset, y, 61 - Math.round(inset * 1.4), y, y < 41 ? C.white : C.red)
      }
      box(g, 0, 33, 61, 33, C.blue) // amurada (o convés)
      box(g, 10, 2, 50, 32, C.cream)
      for (let k = 0; k < 4; k++) box(g, 22 + k * 7, 8, 27 + k * 7, 15, C.sky)
      people.slice(0, 4).forEach((p, k) => head(g, 23 + k * 7, 10, p))
      box(g, 12, 8, 18, 32, o.door ? C.dark : C.silverLight)
      box(g, 36, 0, 41, 1, C.red) // chaminé (no teto)
      box(g, 36, 0, 41, 0, C.ink)
    }),
  )

/** Prancha inclinada (dx × dy, em pixels de arte): do píer (embaixo à esquerda) até a soleira (em cima). */
export const ramp = (dx: number, dy: number) =>
  cached(`prancha:${dx}:${dy}`, () =>
    make(Math.max(2, dx), Math.max(2, dy + 2), (g) => {
      for (let x = 0; x < dx; x++) {
        const y = Math.round(dy - (x / Math.max(1, dx - 1)) * dy)
        box(g, x, y, x, y + 1, C.tan)
      }
    }),
  )

/** Portão de embarque (28 × 38): arco alto com luz no alto; aceso, a luz e as colunas brilham verde. */
export const gate = (lit = false) =>
  cached(`portao:${lit}`, () =>
    make(28, 38, (g) => {
      box(g, 0, 5, 3, 37, C.silver)
      box(g, 24, 5, 27, 37, C.silver)
      box(g, 0, 0, 27, 5, C.silverLight)
      box(g, 9, 1, 18, 4, lit ? '#3fc45a' : C.dark)
      box(g, 1, 6, 2, 37, lit ? '#9fe3a8' : C.silverLight)
      box(g, 25, 6, 26, 37, lit ? '#9fe3a8' : C.silver)
    }),
  )
