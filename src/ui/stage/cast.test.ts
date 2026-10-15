import { describe, expect, it } from 'vitest'
import { CAST, H, INK, POSES, W, castFor, render, runs, sprite, toSvgRects, type PoseName } from './cast'

// O elenco 24 × 30 (aprovado no protótipo): todo quadro cabe na grade, tem contorno e usa as cores do
// personagem; o mapa e as animações usam os mesmos quadros.

const poses = Object.keys(POSES) as PoseName[]

describe('elenco em pixel art', () => {
  it('todo personagem em toda pose cabe na grade 24 × 30 e tem contorno', () => {
    for (const p of CAST)
      for (const pose of poses) {
        const g = render(p, pose)
        expect(g.length).toBe(H)
        expect(g.every((r) => r.length === W)).toBe(true)
        const cells = g.flat()
        expect(cells.filter(Boolean).length).toBeGreaterThan(150)
        expect(cells).toContain(INK)
      }
  })

  it('cada personagem usa as próprias cores (camisa, pele, cabelo ou boné)', () => {
    for (const p of CAST) {
      const cells = new Set(render(p, 'idle').flat())
      expect(cells.has(p.shirt)).toBe(true)
      expect(cells.has(p.skin)).toBe(true)
      expect(cells.has(p.style === 'cap' ? p.cap! : p.hair)).toBe(true)
    }
  })

  it('de costas na corda, não aparece rosto (sem olhos brancos)', () => {
    const front = render(CAST[0]!, 'idle')
    const back = render(CAST[0]!, 'climbA')
    expect(front[8]![9]).toBe('#ffffff')
    expect(back[8]![9]).not.toBe('#ffffff')
  })

  it('as poses diferem entre si (soprar ≠ inspirar ≠ parado; subir A ≠ B)', () => {
    const key = (pose: PoseName) => toSvgRects(sprite(CAST[1]!, pose))
    const all = poses.map(key)
    expect(new Set(all).size).toBe(poses.length)
  })

  it('as tiras reconstroem a grade exatamente', () => {
    const g = render(CAST[2]!, 'cheer')
    const back = Array.from({ length: H }, () => Array<string | null>(W).fill(null))
    for (const r of runs(g)) for (let x = r.x; x < r.x + r.w; x++) back[r.y]![x] = r.c
    expect(back).toEqual(g)
  })

  it('o 5º viajante em diante repete o elenco', () => {
    expect(castFor(0).name).toBe('Ana')
    expect(castFor(4).name).toBe('Ana')
    expect(castFor(3).name).toBe('Duda')
  })
})
