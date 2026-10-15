// Momento "guardada na nuvem" (1,2 s), na faixa de botões do topo da viagem (☁️ · ☾ · ↶): um viajante
// chega de lado numa nuvenzinha pelo vão livre à direita, manda o cartão da viagem até o selo ☁️, que o
// recebe com um pulinho, e sai de lado por onde veio. O palco é a faixa inteira, do selo à borda.
// Variações: arremesso · balão (que estoura ao chegar) · pipa. Rara: a nuvem espirra, o cartão escapa,
// ele pega e joga de novo.

import { flipX } from '../art'
import { frontArt, type PoseName } from '../cast'
import { arc, ease, lerp, seg } from '../motion'
import type { MomentDef, Stage } from '../palco'
import { balloon, balloonPop, bang, cloud, kite, sneezePuff, tripCard } from '../props'
import { party, twinkle } from '../scene'

export interface CloudCtx {
  travelers: number
  /** Onde fica o centro do selo, em px a partir da esquerda da faixa. */
  badgeX?: number
  /** Onde começa o vão livre (depois do último botão), em px a partir da esquerda da faixa. */
  freeX?: number
  /** Chamado quando o cartão chega ao selo (o selo dá um pulinho). */
  onHit?: () => void
}

/** Gotinhas do espirro (sem contorno). */
const DROP = [
  {
    w: 4,
    h: 4,
    runs: [
      { x: 1, y: 0, w: 2, c: '#241a28' },
      { x: 0, y: 1, w: 1, c: '#241a28' },
      { x: 1, y: 1, w: 2, c: '#ffffff' },
      { x: 3, y: 1, w: 1, c: '#241a28' },
      { x: 0, y: 2, w: 1, c: '#241a28' },
      { x: 1, y: 2, w: 2, c: '#9fd3f0' },
      { x: 3, y: 2, w: 1, c: '#241a28' },
      { x: 1, y: 3, w: 2, c: '#241a28' },
    ],
  },
  {
    w: 3,
    h: 3,
    runs: [
      { x: 1, y: 0, w: 1, c: '#241a28' },
      { x: 0, y: 1, w: 1, c: '#241a28' },
      { x: 1, y: 1, w: 1, c: '#9fd3f0' },
      { x: 2, y: 1, w: 1, c: '#241a28' },
      { x: 1, y: 2, w: 1, c: '#241a28' },
    ],
  },
]

/**
 * Linha de pixels contínua entre dois pontos (a linha do balão ou da pipa), com barriga opcional: um ator
 * só, redesenhado a cada quadro, um pixel por passo, sem teto de comprimento.
 */
function string(stage: Stage) {
  const actor = stage.actor(3)
  const C = '#e2809f'
  return (show: boolean, x0: number, y0: number, x1: number, y1: number, opacity: number, sag = 0) => {
    if (!show) return actor.draw(null)
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5) + 2
    const pts = new Set<string>()
    let px = Math.round(x0)
    let py = Math.round(y0)
    pts.add(`${px},${py}`)
    for (let i = 1; i < n; i++) {
      const k = i / (n - 1)
      const nx = Math.round(lerp(x0, x1, k))
      const ny = Math.round(lerp(y0, y1, k) + Math.sin(k * Math.PI) * sag)
      // Sem buracos: se pulou na diagonal, completa com o pixel do canto.
      if (Math.abs(nx - px) > 0 && Math.abs(ny - py) > 0) pts.add(`${nx},${py}`)
      pts.add(`${nx},${ny}`)
      px = nx
      py = ny
    }
    const list = [...pts].map((p) => p.split(',').map(Number) as [number, number])
    const minX = Math.min(...list.map((p) => p[0]))
    const minY = Math.min(...list.map((p) => p[1]))
    const maxX = Math.max(...list.map((p) => p[0]))
    const maxY = Math.max(...list.map((p) => p[1]))
    const art = {
      w: maxX - minX + 1,
      h: maxY - minY + 1,
      runs: list.map(([x, y]) => ({ x: x - minX, y: y - minY, w: 1, c: C })),
    }
    actor.draw(art, { x: minX, y: minY, opacity })
  }
}

export const cloudMoment: MomentDef<CloudCtx> = {
  id: 'nuvem',
  variants: () => ['arremesso', 'balao', 'pipa'],
  rare: 'espirro',
  duration: (v) => (v === 'espirro' ? 1650 : 1200),
  // O boneco tem a altura do botão vizinho; a nuvem e os pés passam um pouco abaixo da faixa.
  figure: (r) => Math.min(36, Math.max(24, r.height * 0.9)),
  size: (r, s) => ({ w: Math.round(r.width / s), h: Math.round(r.height / s) + 10 }),
  place: 'over',
  ownLight: true,
  build(stage, variant, ctx, rng) {
    const ps = party(ctx.travelers)
    const p = ps[Math.floor(rng() * ps.length)]!
    const { w: W, h: H, s } = stage
    const rider = stage.actor(3)
    const puff = stage.actor(2)
    const card = stage.actor(5)
    const lift = stage.actor(4)
    const cry = stage.actor(6)
    const pop = stage.actor(6)
    const line = string(stage)
    const drops = Array.from({ length: 4 }, () => stage.actor(6))
    const blast = stage.actor(6)
    // Sobre a faixa escura: uma luz circular presa ao viajante (nunca uma mancha sobre os botões) e um
    // brilho pequeno no selo quando o cartão chega.
    const glow = stage.dark ? stage.light() : null
    const badgeGlow = stage.dark ? stage.light() : null
    let hitAt = Infinity
    const sparks = twinkle(stage)
    const end = variant === 'espirro' ? 1650 : 1200
    const badge = { x: (ctx.badgeX ?? 18) / s - 5, y: Math.round(H / 2) - 4 }
    const rest = Math.max(Math.round((ctx.freeX ?? 0) / s) + 2, W - 34)
    let hitDone = false
    const hit = (t: number, at: number) => {
      if (t >= at && !hitDone) {
        hitDone = true
        hitAt = at
        ctx.onHit?.()
      }
    }

    /** A nuvem com o viajante em pé: chega de lado (da direita), flutua e sai de lado. */
    const ride = (t: number, face: 'calm' | 'open' | 'sneeze' = 'calm', jolt = 0) => {
      const enter = ease.out(seg(t, 0, 260))
      const leave = ease.in(seg(t, end - 300, end - 40))
      const x = lerp(W + 4, rest, enter) + leave * 40
      const bob = Math.round(Math.sin(t / 140))
      const cy = H - 19 + bob
      glow?.set(x + 13, cy - 11, 24, Math.min(1, enter * 1.3) * (1 - leave))
      badgeGlow?.set(
        badge.x + 6,
        badge.y + 4,
        12,
        t >= hitAt && t < hitAt + 200 ? 1 - seg(t, hitAt, hitAt + 200) : 0,
      )
      puff.draw(cloud(face), {
        x,
        y: cy,
        ...(variant === 'espirro' && t >= 420 && t < 560 ? { sx: 1.12, sy: 0.86 } : {}),
      })
      // O espirro: uma baforada sai da boca da nuvem para a esquerda (cresce, anda 6 px e se desfaz).
      const bk = seg(t, 420, 600)
      const bsz = bk < 0.6 ? lerp(0.6, 1.2, bk / 0.6) : lerp(1.2, 0, (bk - 0.6) / 0.4)
      blast.draw(variant === 'espirro' && bk > 0 && bk < 1 ? sneezePuff() : null, {
        x: x - 6 - bk * 6,
        y: cy + 6,
        sx: bsz,
        sy: bsz,
      })
      // O espirro: gotinhas saindo da boca da nuvem para a esquerda.
      drops.forEach((d, i) => {
        const k = seg(t, 420 + i * 20, 640 + i * 20)
        d.draw(variant === 'espirro' && k > 0 && k < 1 ? DROP[i % 2]! : null, {
          x: x - 4 - k * (8 + i * 2),
          y: cy + 7 + (i - 1.5) * 3 + k * 2,
          opacity: 1 - Math.max(0, k - 0.7) / 0.3,
        })
      })
      return { x: x + 1, feet: cy + 5 + jolt } // a sola afunda 1 px na 1ª linha branca
    }
    const stand = (art: ReturnType<typeof frontArt>, c: { x: number; feet: number }) =>
      rider.draw(art, { x: c.x, y: c.feet - 30 })
    /** Onde a mão segura o cartão em cada pose (pixels da arte do elenco). */
    const hand = (pose: PoseName, c: { x: number; feet: number }) => {
      const top = c.feet - 30
      if (pose === 'give') return { x: c.x + 19, y: top + 11 }
      if (pose === 'reach') return { x: c.x + 17, y: top + 17 }
      return { x: c.x + 7, y: top - 8 } // 'cheer': acima da cabeça, entre as mãos
    }

    /** O cartão entrando no selo: encolhe nos últimos 60 ms. */
    const into = (t: number, at: number) => (t > at - 60 ? lerp(1, 0.5, seg(t, at - 60, at)) : 1)

    // Balão e pipa: o veículo corre pela borda de cima da faixa (fora do texto dos botões) e, sobre o
    // selo, solta o cartão, que cai num arco curto (ease.in, 120 ms) e entra no selo encolhendo.
    const topLine = 1 // o alto do cartão rente à borda de cima da faixa
    const dropFrom = (t: number, at: number) => {
      const k = ease.in(seg(t, at, at + 120))
      return { pos: arc(k, badge.x, topLine, badge.x, badge.y, 2), k }
    }

    if (variant === 'balao') {
      return (t) => {
        const c = ride(t)
        const pose: PoseName = t < 420 ? 'reach' : Math.floor(t / 130) % 2 ? 'wave' : 'idle'
        stand(frontArt(p, pose), c)
        const h0 = hand('reach', c)
        // Sobe até a borda de cima (até 45%), corre por ela até o selo, estoura e solta o cartão.
        const k = seg(t, 420, 760)
        const up = ease.out(Math.min(1, k / 0.45))
        const side = ease.inOut(Math.max(0, (k - 0.45) / 0.55))
        const cx = lerp(h0.x, badge.x, side)
        const cyy = lerp(h0.y, topLine, up)
        const carried = t < 760
        const drop = dropFrom(t, 760)
        const sz = into(t, 880)
        const pos = carried ? { x: cx, y: cyy } : drop.pos
        card.draw(t < 880 ? tripCard() : null, { x: pos.x, y: pos.y, sx: sz, sy: sz })
        lift.draw(carried ? balloon() : null, { x: cx + 1, y: cyy - 16 })
        line(carried, cx + 5, cyy - 5, cx + 5, cyy, 1)
        pop.draw(t >= 760 && t < 920 ? balloonPop() : null, {
          x: cx,
          y: cyy - 13,
          ...(t >= 840 ? { sx: 1.5, sy: 1.5, opacity: 1 - seg(t, 840, 920) } : {}),
        })
        cry.draw(null)
        hit(t, 880)
        sparks(t, 880, badge.x + 6, badge.y)
      }
    }

    if (variant === 'pipa') {
      // Chega com a pipa recolhida na mão; a pipa sobe e voa pela borda de cima; sobre o selo, solta o
      // cartão; depois volta para a mão, recolhendo a linha.
      return (t) => {
        const c = ride(t)
        const pose: PoseName = t < 1000 ? 'give' : Math.floor(t / 130) % 2 ? 'wave' : 'idle'
        // Olha para a esquerda (para a pipa): o braço estendido aponta para ela e a linha sai da mão, sem
        // cruzar o corpo. A mão da pose `give` espelhada fica em (1–2, 15–16) da arte.
        // Entrando (da direita), ele traz a pipa do lado de trás do movimento, na mão direita; parado,
        // vira para a esquerda e a passa para a mão estendida (260–340), antes de ela subir.
        const turned = t >= 260
        stand(turned ? flipX(frontArt(p, pose)) : frontArt(p, 'give'), c)
        const h0 = { x: c.x + 1, y: c.feet - 30 + 15 }
        const back = { x: c.x + 22, y: c.feet - 30 + 15 }
        let kx: number
        let ky: number
        if (t < 260) [kx, ky] = [back.x, back.y - 4]
        else if (t < 340) {
          const k = ease.inOut(seg(t, 260, 340))
          kx = lerp(back.x, h0.x - 10, k)
          ky = lerp(back.y - 4, h0.y - 4, k) - 3 * Math.sin(k * Math.PI)
        } else if (t < 440) [kx, ky] = [h0.x - 10, h0.y - 4 - 10 * ease.out(seg(t, 340, 440))]
        else if (t < 760) {
          const k = ease.inOut(seg(t, 440, 760))
          kx = lerp(h0.x - 10, badge.x, k)
          ky = lerp(h0.y - 14, topLine, ease.out(Math.min(1, k / 0.3)))
        } else {
          // Volta recolhendo a linha.
          const k = ease.in(seg(t, 760, 1000))
          kx = lerp(badge.x, h0.x - 10, k)
          ky = lerp(topLine, h0.y - 4, k)
        }
        const carried = t < 760
        const drop = dropFrom(t, 760)
        const sz = into(t, 880)
        const pos = carried ? { x: kx, y: ky } : drop.pos
        lift.draw(t < 1000 ? kite() : null, {
          x: kx - 2,
          y: ky - 12,
          rot: t < 440 ? 0 : Math.sin(t / 70) * 10,
        })
        card.draw(t < 880 ? tripCard() : null, {
          x: pos.x,
          y: pos.y,
          sx: sz,
          sy: sz,
          rot: carried && t >= 260 ? Math.sin(t / 60) * 8 : 0,
        })
        line(t >= 340 && t < 1000, h0.x + 1, h0.y, kx + 2, ky - 6, 0.85, 5)
        pop.draw(null)
        cry.draw(null)
        hit(t, 880)
        sparks(t, 880, badge.x + 6, badge.y)
      }
    }

    // Arremesso (e a rara: a nuvem espirra, o cartão escapa num arco, ele pega e joga de novo).
    const sneeze = variant === 'espirro'
    const windup = sneeze ? 1040 : 260 // começa a erguer o cartão
    const release = windup + 140 // solta
    const arrive = release + 260
    return (t) => {
      const face = sneeze && t > 300 && t < 560 ? (t < 420 ? 'open' : 'sneeze') : 'calm'
      const c = ride(t, face, sneeze && t > 420 && t < 520 ? -3 : 0)
      let pose: PoseName = 'give'
      if (sneeze && t >= 420 && t < 900) pose = 'oops'
      else if (sneeze && t >= 900 && t < 1000) pose = 'idle'
      else if (t >= windup && t < windup + 70) pose = 'reach'
      else if (t >= windup + 70 && t < release + 80) pose = 'cheer'
      else if (t >= release + 80) pose = Math.floor(t / 130) % 2 ? 'wave' : 'idle'
      stand(frontArt(p, pose), c)
      cry.draw(sneeze && t > 440 && t < 760 ? bang() : null, { x: c.x + 11, y: c.feet - 40 })
      let pos: { x: number; y: number } | null = null
      let rot = 0
      if (t < 260) pos = t < 120 ? null : hand('give', c)
      else if (sneeze && t >= 420 && t < 900) {
        // O cartão escapa num arco para dentro da tela e cai na outra mão (aberta, do susto).
        const k = seg(t, 420, 880)
        const h = hand('give', c)
        const other = { x: c.x - 10, y: c.feet - 30 + 9 } // a borda do cartão na mão, a mão no meio da altura dele
        pos = arc(k, h.x, h.y, other.x, other.y, 14)
        rot = k * 360
      } else if (sneeze && t >= 900 && t < 1040) {
        // Passa de volta para a mão de arremessar, na frente do corpo.
        const k = ease.inOut(seg(t, 900, 1000))
        const a = { x: c.x - 10, y: c.feet - 30 + 9 }
        const b = hand('give', c)
        pos = { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) }
      } else if (t < windup) pos = hand('give', c)
      else if (t < release) {
        // Da mão para o alto da cabeça, passando pela pose intermediária.
        const k = ease.out(seg(t, windup, release))
        const a = hand('give', c)
        const b = hand('cheer', c)
        pos = { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) }
      } else if (t < arrive) {
        const k = ease.out(seg(t, release, arrive))
        const b = hand('cheer', c)
        pos = arc(k, b.x, b.y, badge.x, badge.y, 10)
        rot = k * 360
      }
      const sz = into(t, arrive)
      card.draw(pos ? tripCard() : null, { x: pos?.x ?? 0, y: pos?.y ?? 0, rot, sx: sz, sy: sz })
      hit(t, arrive)
      sparks(t, arrive, badge.x + 6, badge.y)
      lift.draw(null)
      pop.draw(null)
      line(false, 0, 0, 0, 0, 0)
    }
  },
}
