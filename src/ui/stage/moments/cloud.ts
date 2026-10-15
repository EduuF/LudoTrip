// Momento "guardada na nuvem", na faixa de botões do topo da viagem (☁️ · ☾ · ↶): um viajante chega de
// lado numa nuvenzinha pelo vão livre à direita, manda o cartão da viagem até o selo ☁️, que o recebe
// com um pulinho, e sai de lado por onde veio. O palco é a faixa (do selo até a borda) e desce um pouco
// abaixo dela, para caber a nuvem.
// Variações: arremesso · avião de papel (o cartão dobrado) · chute (de perfil, como uma bola).
// Rara: a nuvem espirra, o cartão escapa, ele pega e joga de novo.
// O que voa é sempre pequeno e passa em arco rápido por cima dos botões, sem invadir o título.

import { flipX } from '../art'
import { frontArt, type PoseName } from '../cast'
import { arc, ease, lerp, seg } from '../motion'
import type { MomentDef, Stage } from '../palco'
import { bang, cloud, paperPlane, sneezePuff, tripCard } from '../props'
import { party, twinkle } from '../scene'
import { sideArt } from '../side'

export interface CloudCtx {
  travelers: number
  /** Centro do selo, em px a partir da esquerda da faixa. */
  badgeX?: number
  /** Centro vertical do selo, em px a partir do topo da faixa. */
  badgeY?: number
  /** Topo dos botões da faixa, em px a partir do topo da faixa (o voo passa acima das letras). */
  buttonsTop?: number
  /** Onde começa o vão livre (depois do último botão), em px a partir da esquerda da faixa. */
  freeX?: number
  /** Chamado quando o cartão chega ao selo (o selo dá um pulinho). */
  onHit?: () => void
}

/** Gotinhas do espirro (com contorno, para contrastar com a luz). */
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
 * Tempo de cada variação (ms, no ritmo de referência): até `knee` é a ação (desacelerada por SLOW, a
 * pedido do mantenedor: "muito rápida"); depois do acerto, a espera e a saída correm no ritmo normal.
 */
const TIMES: Record<string, { knee: number; end: number }> = {
  arremesso: { knee: 700, end: 1200 },
  aviao: { knee: 900, end: 1300 },
  chute: { knee: 900, end: 1300 },
  espirro: { knee: 1450, end: 1650 },
}
const SLOW = 1.6
const realDuration = (v: string) => {
  const { knee, end } = TIMES[v] ?? TIMES.arremesso!
  return Math.round(knee * SLOW + (end - knee))
}
const toRef = (v: string, t: number) => {
  const { knee } = TIMES[v] ?? TIMES.arremesso!
  return t < knee * SLOW ? t / SLOW : knee + (t - knee * SLOW)
}

export const cloudMoment: MomentDef<CloudCtx> = {
  id: 'nuvem',
  variants: () => ['arremesso', 'aviao', 'chute'],
  rare: 'espirro',
  duration: realDuration,
  // O boneco um pouco maior que o botão vizinho; a nuvem e os pés passam abaixo da faixa.
  figure: (r) => Math.min(46, Math.max(30, r.height * 1.1)),
  size: (r, s) => ({ w: Math.round(r.width / s), h: Math.round(r.height / s) + 22 }),
  place: 'over',
  ownLight: true,
  build(stage, variant, ctx, rng) {
    const scene = buildScene(stage, variant, ctx, rng)
    return (t) => scene(toRef(variant, t))
  },
}

/** A cena no tempo de referência. */
function buildScene(stage: Stage, variant: string, ctx: CloudCtx, rng: () => number): (t: number) => void {
  const ps = party(ctx.travelers)
  const p = ps[Math.floor(rng() * ps.length)]!
  const { w: W, h: H, s } = stage
  const rider = stage.actor(3)
  const puff = stage.actor(2)
  const card = stage.actor(5)
  const cry = stage.actor(6)
  const drops = Array.from({ length: 4 }, () => stage.actor(6))
  const blast = stage.actor(6)
  // Sobre a faixa escura: uma luz circular presa ao viajante e um brilho pequeno no selo no acerto.
  const glow = stage.dark ? stage.light() : null
  const badgeGlow = stage.dark ? stage.light() : null
  let hitAt = Infinity
  const sparks = twinkle(stage)
  const { end } = TIMES[variant] ?? TIMES.arremesso!
  // O alvo vem do retângulo real do selo (centro do cartão no centro do selo).
  const badge = { x: (ctx.badgeX ?? 18) / s - 6, y: (ctx.badgeY ?? 19) / s - 5 }
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
    glow?.set(x + 13, cy - 11, 26, Math.min(1, enter * 1.3) * (1 - leave))
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
    // O espirro: uma baforada sai da boca da nuvem para a esquerda (cresce, anda 6 px e some encolhendo).
    const bk = seg(t, 420, 600)
    const bsz = bk < 0.6 ? lerp(0.6, 1.2, bk / 0.6) : lerp(1.2, 0, (bk - 0.6) / 0.4)
    blast.draw(variant === 'espirro' && bk > 0 && bk < 1 ? sneezePuff() : null, {
      x: x - 6 - bk * 6,
      y: cy + 6,
      sx: bsz,
      sy: bsz,
    })
    drops.forEach((d, i) => {
      const k = seg(t, 420 + i * 20, 640 + i * 20)
      d.draw(variant === 'espirro' && k > 0 && k < 1 ? DROP[i % 2]! : null, {
        x: x - 4 - k * (8 + i * 2),
        y: cy + 7 + (i - 1.5) * 3 + k * 2,
        opacity: 1 - Math.max(0, k - 0.7) / 0.3,
      })
    })
    return { x: x + 1, feet: cy + 5 + jolt }
  }
  const stand = (art: ReturnType<typeof frontArt>, c: { x: number; feet: number }) =>
    rider.draw(art, { x: c.x, y: c.feet - 30 })
  /** Onde a mão segura o cartão em cada pose (pixels da arte do elenco). */
  const hand = (pose: PoseName, c: { x: number; feet: number }) => {
    const top = c.feet - 30
    if (pose === 'give') return { x: c.x + 19, y: top + 11 }
    if (pose === 'reach') return { x: c.x + 17, y: top + 17 }
    return { x: c.x + 7, y: top - 4 } // 'cheer': acima da cabeça, entre as mãos
  }
  /** Entrando no selo: encolhe nos últimos 60 ms. */
  const into = (t: number, at: number) => (t > at - 60 ? lerp(1, 0.5, seg(t, at - 60, at)) : 1)
  // O voo do cartão por cima dos botões: sobe, gira e fica "fino" (metade do tamanho), corre rente à
  // borda de cima dos botões (a base no máximo 3 px abaixo do topo deles, acima das letras) e só desce
  // no selo. A escala parte da base (transform-origin embaixo): base visual = y + altura da arte.
  const cruiseY = (ctx.buttonsTop ?? 2 * s) / s + 3 - tripCard().h
  const fly = (k: number, from: { x: number; y: number }) => {
    const rise = ease.out(seg(k, 0, 0.25))
    const run = ease.inOut(seg(k, 0.25, 0.8))
    const down = ease.in(seg(k, 0.8, 1))
    const xRun = lerp(from.x, badge.x + 10, run)
    return {
      x: k < 0.8 ? lerp(from.x, xRun, k < 0.25 ? 0 : 1) : lerp(badge.x + 10, badge.x, down),
      y: k < 0.25 ? lerp(from.y, cruiseY, rise) : k < 0.8 ? cruiseY : lerp(cruiseY, badge.y, down),
      sz: lerp(1, 0.5, rise),
    }
  }
  const waving = (t: number): PoseName => (Math.floor(t / 130) % 2 ? 'wave' : 'idle')
  const quiet = () => cry.draw(null)

  if (variant === 'aviao') {
    // Dobra o cartão num avião de papel (encolhe e vira avião na mão), ergue e lança; o avião plana em
    // arco pelo vão acima dos botões, mergulha no selo e entra nele.
    const fold = 260
    const release = 500
    const arrive = 860
    return (t) => {
      const c = ride(t)
      const pose: PoseName =
        t < fold + 160 ? 'give' : t < release ? 'cheer' : t < arrive + 40 ? 'wave' : waving(t)
      stand(frontArt(p, pose), c)
      let art = t < fold + 80 ? tripCard() : paperPlane()
      let pos: { x: number; y: number } | null = null
      let rot = 0
      let sz = 1
      if (t < 120) pos = null
      else if (t < fold + 160) {
        pos = hand('give', c)
        // Dobrando: o cartão encolhe e vira avião.
        if (t >= fold && t < fold + 80) sz = lerp(1, 0.6, seg(t, fold, fold + 80))
      } else if (t < release) {
        const k = ease.out(seg(t, fold + 160, release))
        const a = hand('give', c)
        const b = hand('cheer', c)
        pos = { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) }
      } else if (t < arrive) {
        const k = ease.inOut(seg(t, release, arrive))
        const b = hand('cheer', c)
        const top = Math.max(1, Math.min(b.y, badge.y) - 8)
        pos = arc(k, b.x, b.y, badge.x + 2, badge.y + 2, Math.max(0, Math.min(b.y, badge.y) - top))
        // De frente para a esquerda, com uma oscilação suave; mergulha no fim.
        rot = k > 0.8 ? lerp(0, -35, (k - 0.8) / 0.2) : Math.sin(k * 9) * 6
        sz = into(t, arrive)
      } else art = paperPlane()
      card.draw(pos ? flipX(art) : null, { x: pos?.x ?? 0, y: pos?.y ?? 0, rot, sx: sz, sy: sz })
      hit(t, arrive)
      sparks(t, arrive, badge.x + 6, badge.y)
      quiet()
    }
  }

  if (variant === 'chute') {
    // Vira de perfil (olhando para o selo), solta o cartão na frente dos pés, recua a perna (antecipação)
    // e chuta: o cartão voa girando em arco pelo vão acima dos botões e entra no selo.
    const turn = 260
    const drop = 340
    const windup = 460
    const kick = 540
    const contact = 640 // o pé encosta no cartão por 100 ms antes de ele sair
    const arrive = 860
    return (t) => {
      const c0 = ride(t)
      // Nesta variação ele fica 4 px mais à direita na nuvem: o cartão cabe inteiro na frente dos pés.
      const c = { x: c0.x + 4, feet: c0.feet }
      const top = c.feet - 30
      // Perfil para a esquerda (espelhado): os dedos do pé ficam em x ≈ 9 da arte (7 no chute).
      let art = frontArt(p, t < turn ? 'give' : waving(t))
      if (t >= turn && t < drop) art = flipX(sideArt(p, 'stand', 'carry', 'down'))
      else if (t >= drop && t < windup) art = flipX(sideArt(p, 'stand', 'down', 'down'))
      else if (t >= windup && t < kick)
        art = flipX(sideArt(p, 'walkC', 'back', 'fwd')) // perna para trás
      else if (t >= kick && t < contact + 120)
        art = flipX(sideArt(p, 'runA', 'runBack', 'runFwd', { mouth: 'open' }))
      rider.draw(art, { x: c.x, y: top })
      // O cartão inteiro sobre a nuvem: a borda direita 2 px antes dos dedos, a base na linha da nuvem.
      const foot = { x: c.x - 5, y: c.feet - 12 }
      let pos: { x: number; y: number } | null = null
      let rot = 0
      if (t < 120) pos = null
      else if (t < turn) pos = hand('give', c)
      else if (t < drop) pos = { x: c.x - 4, y: top + 12 }
      else if (t < kick) {
        // Cai da mão até os pés (com um quique de 1 px ao assentar).
        const k = ease.in(seg(t, drop, drop + 100))
        pos = {
          x: lerp(c.x - 4, foot.x, k),
          y: lerp(top + 12, foot.y, k) - (t > drop + 100 && t < drop + 160 ? 1 : 0),
        }
      } else if (t < contact) pos = foot
      let sz = 1
      if (t >= contact && t < arrive) {
        const f = fly(seg(t, contact, arrive), foot)
        pos = { x: f.x, y: f.y }
        sz = f.sz
        rot = -seg(t, contact, arrive) * 720
      }
      card.draw(pos ? tripCard() : null, { x: pos?.x ?? 0, y: pos?.y ?? 0, rot, sx: sz, sy: sz })
      hit(t, arrive)
      sparks(t, arrive, badge.x + 6, badge.y)
      quiet()
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
    else if (t >= release + 80) pose = waving(t)
    stand(frontArt(p, pose), c)
    // O "!" ao lado da cabeça (do lado de dentro da tela), longe dos botões do topo.
    cry.draw(sneeze && t > 440 && t < 760 ? bang() : null, { x: c.x - 6, y: c.feet - 30 + 2 })
    let pos: { x: number; y: number } | null = null
    let rot = 0
    if (t < 260) pos = t < 120 ? null : hand('give', c)
    else if (sneeze && t >= 420 && t < 900) {
      // O cartão escapa num arco para dentro da tela e cai na outra mão (aberta, do susto).
      const k = seg(t, 420, 880)
      const h = hand('give', c)
      const other = { x: c.x - 10, y: c.feet - 30 + 9 }
      pos = arc(k, h.x, h.y, other.x, other.y, 14)
      rot = k * 360
    } else if (sneeze && t >= 900 && t < 1040) {
      const k = ease.inOut(seg(t, 900, 1000))
      const a = { x: c.x - 10, y: c.feet - 30 + 9 }
      const b = hand('give', c)
      pos = { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) }
    } else if (t < windup) pos = hand('give', c)
    else if (t < release) {
      const k = ease.out(seg(t, windup, release))
      const a = hand('give', c)
      const b = hand('cheer', c)
      pos = { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) }
    }
    let sz = 1
    if (t >= release && t < arrive) {
      const f = fly(seg(t, release, arrive), hand('cheer', c))
      pos = { x: f.x, y: f.y }
      sz = f.sz
      rot = seg(t, release, arrive) * 360
    }
    card.draw(pos ? tripCard() : null, { x: pos?.x ?? 0, y: pos?.y ?? 0, rot, sx: sz, sy: sz })
    hit(t, arrive)
    sparks(t, arrive, badge.x + 6, badge.y)
  }
}
