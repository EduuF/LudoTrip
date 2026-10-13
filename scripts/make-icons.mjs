// Gera os ícones do app (PWA) a partir de um desenho em pixel art: o casal de viajantes
// sobre papel washi, com a faixa sakura do HUD. Sem dependências: PNG escrito à mão (zlib do Node).
// Uso: node scripts/make-icons.mjs  →  public/icon-192.png, icon-512.png, icon-180.png, icon.svg
import { deflateSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'

const COL = {
  '#': '#241a28', // tinta
  '.': '#f6edeb', // washi
  'p': '#e2809f', // sakura
  'h': '#3a2a2a', // cabelo 1
  'H': '#6a3a2c', // cabelo 2
  's': '#f3c9a8', // pele
  'b': '#2b3f6b', // roupa 1 (índigo)
  'B': '#e2809f', // roupa 2 (sakura)
  'r': '#c4313a', // beni
  'w': '#ffffff',
}

// 20 × 20
const GRID = [
  '####################',
  '#..................#',
  '#.............pp...#',
  '#....hhh.....pppp..#',
  '#...hhhhh...HHH.pp.#',
  '#...hsshs..HHHHH...#',
  '#....sss...Hsshs...#',
  '#....bbb....sss....#',
  '#...bbbbb...BBB....#',
  '#...s.b.s..BBBBB...#',
  '#....#.#...s.B.s...#',
  '#....#.#....#.#....#',
  '#...........#.#....#',
  '#..................#',
  '#..rrrr............#',
  '#..rwwr............#',
  '#..rrrr............#',
  '#pppppppppppppppppp#',
  '#pppppppppppppppppp#',
  '####################',
]

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

function png(size) {
  const n = GRID.length
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filtro: nenhum
    const gy = Math.min(n - 1, Math.floor((y * n) / size))
    for (let x = 0; x < size; x++) {
      const gx = Math.min(n - 1, Math.floor((x * n) / size))
      const [r, g, b] = hex(COL[GRID[gy][gx]] ?? '#ff00ff')
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = 255
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, k) => {
    let c = k
    for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bits
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function svg() {
  const n = GRID.length
  const rects = GRID.flatMap((row, y) =>
    [...row].map((c, x) => `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${COL[c]}"/>`),
  ).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">${rects}</svg>\n`
}

await mkdir('public', { recursive: true })
for (const size of [192, 512, 180]) await writeFile(`public/icon-${size}.png`, png(size))
await writeFile('public/icon.svg', svg())
console.log('public/icon-192.png, icon-512.png, icon-180.png, icon.svg')
