// Momento "passagem comprada" (0,9 s): em pé sobre o botão tocado (o topo dele é o chão).
// Variações: o bilheteiro picota · o bilhete voa para a mala · o viajante bate o carimbo.
// Rara: o vento leva o bilhete e o viajante corre atrás.

import { flipX } from '../art'
import { frontArt, type Person } from '../cast'
import { arc, ease, fade, lerp, seg, squash } from '../motion'
import type { MomentDef } from '../palco'
import { bang, hanko, suitcase, suitcaseFront, suitcaseOpen, ticket, ticketFlat } from '../props'
import { burst, on, party, STAFF, twinkle } from '../scene'
import { gait, sideArt } from '../side'

export interface TicketCtx {
  travelers: number
}

const W = 68
/** Rajada de vento: dois traços de 8 × 1 com 2 px de vão. */
const GUST = {
  w: 18,
  h: 1,
  runs: [
    { x: 0, y: 0, w: 8, c: '#a39cab' },
    { x: 10, y: 0, w: 8, c: '#a39cab' },
  ],
}
const H = 46

export const ticketMoment: MomentDef<TicketCtx> = {
  id: 'passagem',
  variants: () => ['bilheteiro', 'mala', 'carimbo'],
  rare: 'vento',
  duration: (v) => (v === 'vento' ? 1300 : 900),
  figure: (r) => Math.min(36, Math.max(24, r.height * 0.85)),
  size: () => ({ w: W, h: H }),
  place: 'on',
  fitGap: true,
  build(stage, variant, ctx, rng) {
    const ps = party(ctx.travelers)
    const p: Person = ps[Math.floor(rng() * ps.length)]!
    const g = H
    const who = stage.actor(2)
    const other = stage.actor(1)
    const tk = stage.actor(4)
    const tool = stage.actor(5)
    const front = stage.actor(6)
    const sparks = twinkle(stage)
    const bits = burst(stage, rng, 9)
    const idle = frontArt(p, 'idle')

    if (variant === 'bilheteiro') {
      // O viajante estende o bilhete; o bilheteiro estica o braço, recua (antecipação) e picota com o
      // braço descendo ("clic"); o viajante guarda o bilhete picotado no bolso e faz joinha.
      const x = 4
      const sx0 = x + 32
      const staffGive = flipX(frontArt(STAFF, 'give'))
      const staffPunch = flipX(frontArt(STAFF, 'reach'))
      return (t) => {
        const lean = t >= 200 && t < 300 ? -2 : t >= 300 && t < 360 ? 1 : 0
        const staffArt =
          t < 120
            ? frontArt(STAFF, 'idle')
            : t >= 300 && t < 380
              ? staffPunch
              : t < 560
                ? staffGive
                : flipX(frontArt(STAFF, 'wave'))
        other.draw(staffArt, on(staffArt, sx0 + lean, g, squash(t, 300, 140, 0.1)))
        const pose = t < 80 ? 'idle' : t < 440 ? 'give' : t < 560 ? 'idle' : 'thumb'
        who.draw(frontArt(p, pose), on(idle, x, g))
        // O bilhete: surge na mão, pula no picote e volta em arco para o bolso.
        const hand = { x: x + 19, y: g - 30 + 11 }
        if (t < 80) tk.draw(null)
        else if (t < 440) {
          const pop = ease.back(seg(t, 80, 200))
          const hop = t > 300 && t < 400 ? -2 * Math.sin(seg(t, 300, 400) * Math.PI) : 0
          tk.draw(ticket(t < 300 ? 'plain' : 'punched'), { x: hand.x, y: hand.y + hop, sx: pop, sy: pop })
        } else {
          const k = ease.inOut(seg(t, 440, 560))
          const pt = arc(k, hand.x, hand.y, x + 5, g - 15, 4)
          const sz = lerp(1, 0.4, k)
          tk.draw(k < 1 ? ticket('punched') : null, { x: pt.x, y: pt.y, sx: sz, sy: sz })
        }
        bits(t, 300, x + 31, g - 17) // do furo do picote
        sparks(t, 580, x + 12, g - 33)
        tool.draw(null)
        front.draw(null)
      }
    }

    if (variant === 'mala') {
      // Recua (antecipação), lança o bilhete em arco para dentro da mala aberta (passa por trás da borda
      // da frente) e a mala fecha num pulo.
      const x = 4
      const mx = 44
      return (t) => {
        const body = t >= 150 && t < 250 ? -2 : t >= 250 && t < 330 ? 1 : 0
        const pose = t < 330 ? 'give' : t < 620 ? 'idle' : 'thumb'
        who.draw(frontArt(p, pose), on(idle, x + body, g))
        const closed = t >= 600
        const bag = closed ? suitcase() : suitcaseOpen()
        other.draw(bag, on(bag, mx, g, squash(t, 600, 180, 0.16)))
        front.draw(!closed && t >= 450 ? suitcaseFront() : null, { x: mx, y: g - 7 })
        const k = ease.out(seg(t, 250, 600))
        const start = { x: x + 19 + body, y: g - 30 + 11 }
        // Termina deitado e inteiro dentro da boca da mala (colunas mx+2 a mx+10, base em g−6).
        const pt = arc(k, start.x, start.y, mx - 2, g - 15, 12)
        const fold = lerp(1, 0.5, seg(t, 250, 380))
        const flat = lerp(1, 0.6, seg(k, 0.85, 1))
        const pop = ease.back(seg(t, 0, 140))
        tk.draw(t < 600 ? ticket() : null, { x: pt.x, y: pt.y, rot: k * 360, sx: pop * fold, sy: pop * flat })
        sparks(t, 620, mx + 7, g - 16)
        tool.draw(null)
      }
    }

    if (variant === 'carimbo') {
      // De perfil, com o carimbo (pequeno) na mão; o bilhete deitado no "balcão" (o botão), à frente dele,
      // em leve perspectiva. Ergue o carimbo acima da cabeça (na ponta dos pés), leva o braço à frente,
      // bate no centro do bilhete inclinando o corpo, recolhe o braço para trás (o selo vermelho fica à
      // vista) e comemora com o carimbo no alto. O carimbo vem sempre da mão da pose atual.
      const x = 4
      const tx = x + 17 // o bilhete, à frente (x+18 a x+31)
      const hit = 375
      // Onde fica a mão em cada pose de perfil (pixels da arte), e o carimbo preso nela.
      const HAND = { carry: [15, 16], high: [17, 4], press: [18, 23], back: [8, 20] } as const
      return (t) => {
        let arm: keyof typeof HAND = 'carry'
        let lean = 0
        let toes = 0
        if (t >= 150 && t < 320) {
          arm = 'high'
          toes = -2
        } else if (t >= 320 && t < 360)
          arm = 'carry' // o braço vem à frente, a caminho do golpe
        else if (t >= 360 && t < 480) {
          arm = 'press'
          lean = 3
        } else if (t >= 480 && t < 620) arm = 'back'
        else if (t >= 620) arm = 'high'
        const hop = t > 640 && t < 800 ? -3 * Math.sin(seg(t, 640, 800) * Math.PI) : 0
        const art = sideArt(p, 'stand', arm, 'down', { eyes: t >= hit && t < 520 ? 'happy' : 'open' })
        const fx = x + lean
        const fy = g + toes + hop
        who.draw(art, on(art, fx, fy, squash(t, hit, 120, 0.06)))
        const [hx, hy] = HAND[arm]
        const top = fy - 30
        // Preso na mão: o meio do cabo na mão (no alto, a base para cima; no golpe, a base para baixo).
        const up = arm === 'high'
        tool.draw(hanko(), {
          x: fx + hx - 1,
          y: up ? top + hy - 6 : top + hy - 4,
          ...squash(t, hit, 140, 0.25),
        })
        tk.draw(ticketFlat(t >= hit), on(ticketFlat(), tx, g))
        sparks(t, hit + 20, tx + 7, g - 6)
        other.draw(null)
        front.draw(null)
      }
    }

    // Rara: um vento leva o bilhete; susto, e ele corre atrás até sumir na borda.
    const cry = stage.actor(7)
    const gusts = [stage.actor(0), stage.actor(0), stage.actor(0)]
    return (t) => {
      const o = fade(t, 1180, 1300)
      const x0 = 4
      // Rajadas: pares de traços (8 × 1, 2 px de vão) atravessando da esquerda.
      gusts.forEach((a, i) => {
        const k = seg(t, 80 + i * 60, 460 + i * 60)
        a.draw(k > 0 && k < 1 ? GUST : null, { x: lerp(-18, W, k), y: g - 34 + i * 7 })
      })
      const lift = seg(t, 220, 1100)
      const tx = lerp(x0 + 19, W + 18, ease.in(lift))
      const ty = g - 19 - lift * 14 + Math.sin(lift * 14) * 3
      tk.draw(ticket(), { x: tx, y: ty, rot: Math.sin(lift * 10) * 25, opacity: o })
      if (t < 380) {
        who.draw(frontArt(p, t < 220 ? 'give' : 'oops'), on(idle, x0, g))
        cry.draw(t > 220 ? bang() : null, { x: x0 + 11, y: g - 40 })
      } else {
        cry.draw(null)
        const run = seg(t, 380, 1250)
        const art = gait(p, t, 'run', 80)
        who.draw(art, on(art, lerp(x0, W + 8, ease.in(run)), g, { opacity: o }))
      }
      other.draw(null)
      tool.draw(null)
      front.draw(null)
    }
  },
}
