// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  activeRuns,
  fitScale,
  force,
  freeze,
  pick,
  play,
  resetPalco,
  seeded,
  setAnimMode,
  type MomentDef,
} from './palco'
import { MOMENTS } from './cues'
import { frontArt, CAST } from './cast'

// O Palco (docs/animacoes.md): o contrato de toda animação, testado com relógio falso.

const motion = (reduce: boolean) =>
  ((q: string) =>
    ({
      matches: reduce && q.includes('reduce'),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia

const ANCHOR = new DOMRect(100, 400, 160, 40)

const tiny: MomentDef<{ n: number }> = {
  id: 'teste',
  variants: () => ['a', 'b', 'c'],
  rare: 'r',
  duration: () => 500,
  figure: () => 30,
  size: () => ({ w: 40, h: 40 }),
  place: 'on',
  build(stage) {
    const a = stage.actor()
    return (t) => a.draw(frontArt(CAST[0]!, 'idle'), { x: 4, y: 10, opacity: 1 - t / 500 })
  },
}

beforeEach(() => {
  resetPalco()
  setAnimMode('full')
  window.matchMedia = motion(false)
  vi.useFakeTimers()
})
afterEach(() => {
  resetPalco()
  vi.useRealTimers()
})

describe('Palco', () => {
  it('a camada nunca recebe toque e some sozinha no fim (pelo relógio)', () => {
    const run = play(tiny, { n: 1 }, ANCHOR)!
    const el = document.querySelector('.palco') as HTMLElement
    expect(el).toBeTruthy()
    expect(el.getAttribute('aria-hidden')).toBe('true')
    expect(run.stage.el).toBe(el)
    vi.advanceTimersByTime(600)
    expect(document.querySelector('.palco')).toBeNull()
    expect(activeRuns()).toHaveLength(0)
  })

  it('com "reduzir movimento", nada se mexe', () => {
    window.matchMedia = motion(true)
    expect(play(tiny, { n: 1 }, ANCHOR)).toBeNull()
    expect(document.querySelector('.palco')).toBeNull()
  })

  it('com "Animações discretas", só o brilho', () => {
    setAnimMode('discreet')
    const run = play(tiny, { n: 1 }, ANCHOR)!
    expect(run.minimal).toBe(true)
    expect(run.variant).toBe('brilho')
  })

  it('da 3ª repetição em 1 minuto em diante, a versão mínima; depois de 1 minuto, completa de novo', () => {
    const now = vi.spyOn(performance, 'now')
    now.mockReturnValue(1000)
    expect(play(tiny, { n: 1 }, ANCHOR)!.minimal).toBe(false)
    now.mockReturnValue(2000)
    expect(play(tiny, { n: 1 }, ANCHOR)!.minimal).toBe(false)
    now.mockReturnValue(3000)
    expect(play(tiny, { n: 1 }, ANCHOR)!.minimal).toBe(true)
    now.mockReturnValue(70_000)
    expect(play(tiny, { n: 1 }, ANCHOR)!.minimal).toBe(false)
  })

  it('elemento fora da tela: não toca', () => {
    expect(play(tiny, { n: 1 }, new DOMRect(0, -300, 100, 40))).toBeNull()
  })

  it('sorteio: nunca a mesma duas vezes seguidas; a rara aparece por volta de 1 em 12', () => {
    const rnd = seeded(7)
    let last = ''
    let rare = 0
    for (let i = 0; i < 1200; i++) {
      const v = pick('sorteio', ['a', 'b', 'c'], 'r', rnd)
      expect(v).not.toBe(last)
      if (v === 'r') rare++
      last = v
    }
    expect(rare).toBeGreaterThan(50)
    expect(rare).toBeLessThan(160)
  })

  it('variação forçada (o avaliador) e congelar um instante', () => {
    force('teste', 'b')
    const run = play(tiny, { n: 1 }, ANCHOR)!
    expect(run.variant).toBe('b')
    freeze(250)
    vi.advanceTimersByTime(2000)
    expect(document.querySelector('.palco')).toBeTruthy() // congelado não acaba
    expect((run.stage.actors[0]!.el as SVGSVGElement).style.opacity).toBe('0.5')
    freeze(null)
    expect(document.querySelector('.palco')).toBeNull()
  })

  it('escala: 1 pixel de arte vira um número inteiro de pixels do aparelho', () => {
    for (const dpr of [1, 2, 2.625, 3]) {
      vi.stubGlobal('devicePixelRatio', dpr)
      for (const h of [24, 30, 36, 44]) {
        const s = fitScale(h)
        expect(Number.isInteger(Math.round(s * dpr * 1000) / 1000)).toBe(true)
        expect(s * dpr).toBeGreaterThanOrEqual(1)
      }
    }
    vi.unstubAllGlobals()
  })
})

// Todas as cenas: todo quadro desenha sem erro, nada foge muito do palco e o fim é limpo.
const CONTEXTS = [
  { travelers: 1 },
  { travelers: 3, mode: 'flight', kind: 'food', country: 'JP' },
  { travelers: 4, mode: 'car', must: true, outdoors: true },
  { travelers: 2, mode: 'train' },
  { travelers: 2, mode: 'boat' },
] as const

describe('cenas da primeira leva', () => {
  for (const [id, def] of Object.entries(MOMENTS) as unknown as [
    string,
    MomentDef<Record<string, unknown>>,
  ][]) {
    it(`${id}: 3 ou mais variações pelo contexto, mais a rara`, () => {
      const all = new Set(CONTEXTS.flatMap((c) => def.variants(c as never)))
      // Variações por contexto + as que o sorteio escolhe: ao menos 3 no total.
      expect(all.size + 1).toBeGreaterThanOrEqual(3)
      expect(all.has(def.rare)).toBe(false)
    })

    const variants = [...new Set(CONTEXTS.flatMap((c) => def.variants(c as never))), def.rare]
    for (const v of variants)
      it(`${id} · ${v}: desenha cada instante, fica perto do palco e termina limpo`, () => {
        const host = document.createElement('div')
        Object.defineProperty(host, 'offsetWidth', { value: 280 })
        Object.defineProperty(host, 'offsetHeight', { value: 60 })
        document.body.appendChild(host)
        force(id, v)
        const ctx = CONTEXTS.find((c) => def.variants(c as never).includes(v)) ?? CONTEXTS[1]
        const run = play(def, ctx as never, def.place === 'inside' ? host : new DOMRect(40, 400, 300, 40))!
        expect(run.variant).toBe(v)
        const { w, h } = run.stage
        for (let t = 0; t <= run.duration; t += 40) {
          run.render(t)
          for (const a of run.stage.actors) {
            if (!a.box.visible || def.clip || def.place === 'inside') continue
            expect(a.box.x).toBeGreaterThan(-60)
            expect(a.box.x).toBeLessThan(w + 60)
            expect(a.box.y).toBeGreaterThan(-60)
            expect(a.box.y + a.box.h).toBeLessThanOrEqual(h + 30)
          }
        }
        run.render(run.duration)
        // O fim é limpo: o palco já esmaeceu por inteiro.
        expect(Number(run.stage.el.style.opacity)).toBe(0)
        run.stop()
        host.remove()
      })
  }
})
