// Momento "hospedagem reservada" (1 s): em pé sobre o botão tocado (o topo dele é o chão).
// Variações pelo destino e pelo jeito da viagem: futon (Japão e Coreia) · barraca (a pé ou de bicicleta,
// parques) · cama de hotel (o resto). Rara: o travesseiro cai na cabeça e voam penas.

import { crop, rotateCCW } from '../art'
import { frontArt, type Person, type PoseName } from '../cast'
import { arc, ease, lerp, seg, squash } from '../motion'
import type { Actor, MomentDef } from '../palco'
import {
  bed,
  bedBlanket,
  feather,
  futon,
  futonBlanket,
  futonRolled,
  pillow,
  tent,
  tentShell,
  zee,
} from '../props'
import { on, party, twinkle } from '../scene'

export interface LodgingCtx {
  travelers: number
  /** País do destino (ISO 3166-1, ex.: "JP"). */
  country?: string
  /** O destino é parque, ou a viagem é a pé/de bicicleta. */
  outdoors?: boolean
}

const W = 72
const H = 48

/** Crescer do chão sem passar de 0 no começo (o `ease.back` é negativo bem no início). */
const grow = (t: number, a: number, b: number) => Math.max(0, ease.back(seg(t, a, b)))

export const lodgingMoment: MomentDef<LodgingCtx> = {
  id: 'hospedagem',
  variants: (c) => [c.outdoors ? 'barraca' : c.country === 'JP' || c.country === 'KR' ? 'futon' : 'cama'],
  rare: 'travesseiro',
  duration: (v) => (v === 'travesseiro' ? 1300 : 1000),
  figure: (r) => Math.min(36, Math.max(24, r.height * 0.85)),
  size: () => ({ w: W, h: H }),
  place: 'on',
  fitGap: true,
  build(stage, variant, ctx, rng) {
    const ps = party(ctx.travelers)
    const p: Person = ps[Math.floor(rng() * ps.length)]!
    const g = H
    const who = stage.actor(3)
    const base = stage.actor(1)
    const cover = stage.actor(4)
    const zs = [stage.actor(6), stage.actor(6)]
    const extra = stage.actor(5)
    const feathers = Array.from({ length: 6 }, () => ({
      a: stage.actor(7),
      // Caem fora da cama (antes da cabeceira ou depois do pé), no chão.
      dx: rng() < 0.5 ? -22 + rng() * 12 : 32 + rng() * 8,
      up: 4 + rng() * 6,
    }))
    const sparks = twinkle(stage)
    const lying = (pose: PoseName) => rotateCCW(frontArt(p, pose))
    const idle = frontArt(p, 'idle')

    /** Dois "z" subindo em zigue-zague, cada um vivendo de `from` a `from + life`. */
    const snore = (t: number, starts: number[], life: number, x: number, y: number) =>
      zs.forEach((a, i) => {
        const k = seg(t, starts[i]!, starts[i]! + life)
        a.draw(k > 0 && k < 1 ? zee() : null, {
          x: x + i * 3 + Math.round(Math.sin(k * 6) * 1.5),
          y: Math.max(g - 38, y - k * 8 - i * 2),
          opacity: k < 0.2 ? k / 0.2 : 1 - Math.max(0, k - 0.6) / 0.4,
        })
      })

    /** Agacha (antecipação), salta em arco e aterrissa em pé, amassando. */
    const jump = (
      a: Actor,
      t: number,
      x0: number,
      x1: number,
      floor: number,
      t0: number,
      t1: number,
      t2: number,
    ) => {
      if (t < t0) return a.draw(idle, on(idle, x0, g))
      // Agacha a partir dos pés: quem desce é a cabeça.
      if (t < t1) return a.draw(idle, on(idle, x0, g, { sx: 1.08, sy: 0.88 }))
      if (t < t2) {
        const pt = arc(ease.inOut(seg(t, t1, t2)), x0, g - 30, x1, floor - 30, 10)
        return a.draw(frontArt(p, 'cheer'), { x: pt.x, y: pt.y })
      }
      a.draw(idle, on(idle, x1, floor, { sx: 1.08, sy: 0.85 }))
    }

    if (variant === 'futon') {
      const fx = 28
      return (t) => {
        const unroll = ease.out(seg(t, 80, 320))
        base.draw(futon(), on(futon(), fx, g, { reveal: unroll }))
        extra.draw(t < 320 ? futonRolled() : null, on(futonRolled(), fx + unroll * 22, g))
        if (t < 550) jump(who, t, 2, fx + 4, g - 3, 180, 330, 470)
        else if (t < 770) who.draw(lying('blink'), { x: fx, y: g - 22 })
        else {
          // Levanta com um pulinho e acena (dois tempos de aceno).
          const hop = -2 * Math.sin(seg(t, 770, 870) * Math.PI)
          const pose = Math.floor((t - 770) / 120) % 2 ? 'idle' : 'wave'
          who.draw(frontArt(p, pose), on(idle, fx + 4, g - 3 + hop, squash(t, 870, 100, 0.1)))
        }
        // Cobertor: desliza dos pés para cima; na hora de levantar, é jogado para o lado.
        if (t >= 550 && t < 770)
          cover.draw(futonBlanket(), { x: lerp(fx + 30, fx + 11, ease.out(seg(t, 550, 620))), y: g - 11 })
        else if (t >= 770 && t < 840)
          // Jogado para o lado: sai de baixo dela (+12 px), deitado no futon, e esmaece.
          cover.draw(futonBlanket(), {
            x: fx + 11 + 12 * seg(t, 770, 840),
            y: g - 6,
            opacity: 1 - seg(t, 770, 840),
          })
        else cover.draw(null)
        snore(t, [590, 640], 120, fx + 5, g - 25)
        sparks(t, 860, fx + 20, g - 32)
      }
    }

    if (variant === 'barraca') {
      // A barraca arma num pulo; a cabeça espia pela porta, pisca e volta para dentro.
      const tx = 18
      return (t) => {
        const up = grow(t, 0, 300)
        const grow2 = { sx: lerp(0.6, 1, up), sy: up }
        base.draw(up > 0 ? tent() : null, on(tent(), tx, g, grow2))
        extra.draw(up > 0 ? tentShell() : null, on(tentShell(), tx, g, grow2))
        const peek = t < 380 ? 0 : t < 740 ? ease.out(seg(t, 380, 500)) : 1 - ease.in(seg(t, 740, 860))
        const head = crop(frontArt(p, t > 600 && t < 680 ? 'blink' : 'idle'), 16)
        who.draw(peek > 0 ? head : null, { x: tx + 5, y: g - 2 - 16 * peek })
        cover.draw(null)
        snore(t, [9999, 9999], 1, 0, 0)
        sparks(t, 520, tx + 26, g - 24)
      }
    }

    // Cama de hotel (e a rara, que começa igual).
    const rare = variant === 'travesseiro'
    const bx = 34
    return (t) => {
      const pop = grow(t, 0, 180)
      base.draw(
        pop > 0 ? bed() : null,
        on(bed(), bx, g, { sy: pop, ...(t >= 600 ? squash(t, 600, 160, 0.12) : {}) }),
      )
      if (t < 600) jump(who, t, 4, bx + 8, g - 9, 160, 300, 500)
      else who.draw(lying(rare && t > 860 ? 'oops' : 'blink'), { x: bx + 4, y: g - 25 })
      cover.draw(t >= 600 ? bedBlanket() : null, {
        x: lerp(bx + 30, bx + 13, ease.out(seg(t, 600, 660))),
        y: g - 16,
      })
      if (!rare) {
        snore(t, [680, 740], 120, bx + 8, g - 30)
        sparks(t, 830, bx + 20, g - 20)
        extra.draw(null)
        return
      }
      // Rara: o travesseiro cai do alto, quica na cabeça e solta penas.
      snore(t, [9999, 9999], 1, 0, 0)
      const k = ease.in(seg(t, 700, 860))
      const py = k < 1 ? lerp(-12, g - 27, k) : g - 27 - 3 * Math.sin(seg(t, 860, 1000) * Math.PI)
      extra.draw(t >= 700 ? pillow() : null, { x: bx + 5, y: py, ...squash(t, 860, 160, 0.2) })
      for (const f of feathers) {
        const fk = seg(t, 860, 1160)
        const pt = arc(fk, bx + 9, g - 26, bx + 9 + f.dx, g - 3, f.up + 6)
        f.a.draw(fk > 0 && fk < 1 ? feather() : null, {
          x: pt.x + Math.sin(fk * 9) * 3,
          y: pt.y,
          rot: Math.sin(fk * 8) * 30,
          opacity: 1 - fk * 0.6,
        })
      }
    }
  },
}
