// Momento "chegou alguém" (colaboração, spec publicação §4.3–4.4), no topo da viagem. Quem chega entra
// pela borda direita, no vão livre da faixa de botões (☁️ · ☾ · ↶), freia, vira de frente e acena com um
// balão curto. Depois dá um pulinho (só até onde cabe embaixo dos botões de cima) e se desfaz numa
// baforada clara; dela sai um coraçãozinho que voa fino, rente à borda de cima dos botões, e entra nos
// rostos do grupo (ou no "+"), que dão um pulinho.
// O palco cobre as duas linhas do topo, do alvo até a borda direita; o chão é a borda de baixo da faixa.
// Variações: com a mala de rodinhas (vai viajar) · com o mapa (vem ajudar) · correndo · deslizando de meia.
// Rara: tropeça numa pedrinha, cai, se levanta sem graça ("Ops!"), e segue como as outras.

import { flipX } from '../art'
import type { Art } from '../art'
import { frontArt, castFor, type PoseName } from '../cast'
import { ease, lerp, seg } from '../motion'
import type { MomentDef } from '../palco'
import { heart, mapFolded, mapOpen, pebble, poofBig, poofCloud, puff, rollingBag } from '../props'
import { on } from '../scene'
import { gait, sideArt } from '../side'

export interface ArrivalCtx {
  /** Índice do viajante que chega (o mesmo bonequinho do mapa). */
  index: number
  /** Vai viajar (traz a mala) ou só ajuda (traz o mapa). */
  travels: boolean
  /** O que o balão diz ("Bia!", "Eu vou!"). */
  line: string
  /** Caixa do alvo (rostos ou "+"), em px a partir do canto de cima à esquerda do palco. */
  targetX?: number
  targetY?: number
  targetW?: number
  targetH?: number
  /** Topo da faixa de botões, onde começa o vão livre e a borda de baixo dos botões de cima (px). */
  rowTop?: number
  freeX?: number
  ceiling?: number
  /** O alvo dá um pulinho quando o coração entra nele. */
  onHit?: () => void
}

/**
 * A parte comum, em ms a partir do fim da entrada: vira (0–30), acena com o balão (30–630), agacha
 * (630–740), comemora (740–940: a causa da baforada, em dois tempos), se desfaz numa nuvem (940–1090) e
 * o coração voa até o alvo (940–1130), que pulsa. Total com a entrada de 360 ms: 1500 ms.
 */
const S = { turn: 30, wave: 630, crouch: 740, poof: 940, hit: 1130, end: 1140 }
/** Quanto dura a entrada de cada variação (a rara inclui o tombo e o "Ops!"). */
const INTRO: Record<string, number> = { mala: 360, mapa: 360, correndo: 360, deslize: 360, tropeco: 1000 }

export const arrivalMoment: MomentDef<ArrivalCtx> = {
  id: 'chegou',
  variants: (c) => (c.travels ? ['mala', 'correndo', 'deslize'] : ['mapa', 'correndo', 'deslize']),
  rare: 'tropeco',
  duration: (v) => (INTRO[v] ?? 360) + S.end,
  // Do tamanho dos botões do topo, como na nuvem.
  figure: (r) => Math.min(46, Math.max(30, (r.height / 2) * 1.1)),
  size: (r, s) => ({ w: Math.round(r.width / s), h: Math.round(r.height / s) }),
  place: 'over',
  clip: true,
  ownLight: true,
  build(stage, variant, ctx) {
    const { w: W, h: H, s } = stage
    const p = castFor(ctx.index || 0)
    const g = H
    const rare = variant === 'tropeco'
    const withBag = variant === 'mala' || (rare && ctx.travels)
    const withMap = variant === 'mapa' || (rare && !ctx.travels)
    // Quem só vem ajudar não diz "Eu vou!".
    const line = withMap && ctx.line === 'Eu vou!' ? 'Vim ajudar!' : ctx.line
    const intro = INTRO[variant] ?? 360

    const shadow = stage.actor(1)
    const bag = stage.actor(2)
    const me = stage.actor(3)
    const held = stage.actor(4)
    const dust = [stage.actor(5), stage.actor(5)]
    const poof = [stage.actor(6), stage.actor(6), stage.actor(6), stage.actor(6)]
    const love = stage.actor(7)
    const pop = stage.actor(7)
    const glow = stage.dark ? stage.light() : null
    const say = stage.say()

    // Lugar de parar: no vão livre, perto da borda direita (com a mala de pé à direita, mais para dentro).
    const rest = Math.max(Math.round((ctx.freeX ?? 0) / s) + 30, W - (withBag ? 40 : 27))
    const tx = (ctx.targetX ?? 12) / s
    const ty = (ctx.targetY ?? 12) / s
    const th = (ctx.targetH ?? 24) / s
    const rowTop = (ctx.rowTop ?? 0) / s
    // Quanto dá para subir sem encostar nos botões de cima (4 px de tela de folga), em pixels de arte.
    const ceiling = (ctx.ceiling ?? 0) / s
    const headroom = Math.max(0, Math.floor(g - 30 - ceiling - 4 / s))
    const jumpH = Math.min(6, headroom)
    const front = (pose: PoseName) => frontArt(p, pose)
    const idle = front('idle')
    let hitDone = false

    const light = (cx: number, cy: number, o: number) => glow?.set(cx, cy, 24, o)
    /** A mala de rodinhas puxada (inclinada 35°, rodinhas no chão, puxador na mão de trás) ou de pé. */
    const drawBag = (x: number, tilt: number) => {
      if (!withBag) return bag.draw(null)
      const art = rollingBag()
      bag.draw(art, on(art, x + lerp(21, 20, tilt), g, { rot: -35 * tilt }))
    }
    /** Fala parada, à esquerda da cabeça, no vão livre (sem vão: a cena segue sem o balão). */
    const speak = (text: string | null, x: number) => {
      if (!text) return say.show(null)
      say.show(text, 0, 0)
      const bw = say.el.getBoundingClientRect().width / s
      const cx = x - 2 - bw / 2
      const fits = cx - bw / 2 >= Math.round((ctx.freeX ?? 0) / s) - 2
      say.show(fits ? text : null, cx, Math.max(g - 16, rowTop + 16))
    }

    // ---- Entradas -------------------------------------------------------------------------------------

    /** Correndo, com a mala ou com o mapa: entra de perfil (virado para a esquerda), corpo primeiro. */
    const enterRun = (t: number) => {
      const x = lerp(W + 2, rest, ease.out(seg(t, 0, 300)))
      let art: Art
      if (t < 300) {
        if (withBag) art = gait(p, t, 'walk', 90, 'pull')
        else if (withMap) art = gait(p, t, 'run', 80, 'carry')
        else art = gait(p, t, 'run', 75)
      } else {
        // Freada: pernas juntas, um amassado de 2 px, poeira nos calcanhares.
        art = sideArt(p, 'stand', withBag ? 'pull' : withMap ? 'carry' : 'back', 'fwd')
      }
      const f = flipX(art)
      const sq = t >= 300 ? { sy: 1 - 0.08 * Math.sin(seg(t, 300, 360) * Math.PI) } : {}
      me.draw(f, on(f, x, g, sq))
      drawBag(x, 1)
      if (withMap) held.draw(mapFolded(), { x: x + 3, y: g - 30 + 12 })
      else held.draw(null)
      const k = seg(t, 300, 400)
      dust.forEach((d, i) =>
        d.draw(t >= 300 ? puff(i ? 2 : 3) : null, {
          x: x + 15 + i * 5 + k * 2,
          y: g - 6 - k * 2,
          opacity: 1 - k,
        }),
      )
      light(x + 12, g - 15, Math.min(1, t / 120))
    }

    /**
     * Deslizando de meia: de lado, braços abertos, um pé à frente e o corpo inclinado para trás, com um
     * risco de brilho no chão atrás do pé; freia na ponta do pé (amassado de 100 ms). Altura zero.
     */
    const SHINE: Art = { w: 10, h: 1, runs: [{ x: 0, y: 0, w: 10, c: '#fffbe6' }] }
    const enterSlide = (t: number) => {
      const x = lerp(W + 2, rest, ease.out(seg(t, 0, 260)))
      const sliding = t < 260
      const art = flipX(sideArt(p, sliding ? 'walkA' : 'stand', 'fwd', 'back', { mouth: 'open' }))
      me.draw(art, on(art, x, g, sliding ? { rot: 4 } : { sy: 0.9 }))
      // O brilho atrás do pé (à direita, de onde ela vem), que some na freada.
      dust[0]!.draw(t < 300 ? SHINE : null, { x: x + 14, y: g - 1, opacity: 0.7 * (1 - seg(t, 220, 300)) })
      dust[1]!.draw(null)
      bag.draw(null)
      held.draw(null)
      light(x + 12, g - 15, Math.min(1, t / 120))
    }

    /** A rara: tropeça na pedrinha que já estava no chão, cai de frente, levanta e diz "Ops!". */
    const stone = { x: rest + 3, y: g - 4 }
    const enterTrip = (t: number) => {
      shadow.draw(pebble(), { x: stone.x, y: stone.y })
      // A poeira só existe no tombo (cada quadro desenha do zero: nada sobra de um quadro anterior).
      dust.forEach((d) => d.draw(null))
      if (t < 260) {
        const x = lerp(W + 2, rest, ease.out(seg(t, 0, 260)))
        const f = flipX(
          withBag ? gait(p, t, 'walk', 80, 'pull') : gait(p, t, 'run', 75, withMap ? 'carry' : undefined),
        )
        me.draw(f, on(f, x, g))
        drawBag(x, 1)
        held.draw(withMap ? mapFolded() : null, { x: x + 3, y: g - 30 + 12 })
        light(x + 12, g - 15, Math.min(1, t / 120))
        dust.forEach((d) => d.draw(null))
        return say.show(null)
      }
      const x = rest
      // No solavanco ela solta o puxador: a mala volta para as rodinhas com um quique de 2 px (35° → 15° →
      // de pé, em 100 ms). O mapa escapa da mão e cai à frente (e é recolhido de joelhos).
      if (withBag) {
        const k = seg(t, 270, 370)
        const art = rollingBag()
        const tilt = k < 0.5 ? lerp(1, 0.43, k * 2) : lerp(0.43, 0, (k - 0.5) * 2)
        const bounce = -Math.round(2 * Math.sin(seg(t, 320, 370) * Math.PI))
        bag.draw(art, on(art, x + lerp(21, 20, tilt), g + bounce, { rot: -35 * tilt }))
      } else bag.draw(null)
      const tripArt = flipX(sideArt(p, 'runA', 'runFwd', 'runBack', { eyes: 'closed', mouth: 'open' }))
      if (t < 340) {
        // O pé bate na pedra: o corpo dá um solavanco de 2 px para a frente (contato de 80 ms).
        me.draw(tripArt, on(tripArt, x - 2, g, { rot: -8 }))
        held.draw(withMap ? mapFolded() : null, { x: x + 1, y: g - 30 + 12 })
        light(x + 10, g - 15, 1)
      } else if (t < 640) {
        // Cai girando a partir dos pés e fica deitada (220 ms); a poeira sobe além da cabeça e nos pés.
        const lying = seg(t, 340, 420)
        me.draw(tripArt, on(tripArt, x - 2, g, { rot: -lerp(8, 80, ease.in(lying)) }))
        held.draw(withMap ? mapFolded() : null, { x: x - 14, y: g - 9 })
        light(lerp(x + 10, x + 2, lying), lerp(g - 15, g - 6, lying), 1)
        // Cheia de 420 a 540 ms (a causa aparece), encolhe até 620 ms e é apagada.
        const k = seg(t, 400, 620)
        const sz = t < 420 ? lerp(0.6, 1.3, seg(t, 400, 420)) : t < 540 ? 1.3 : lerp(1.3, 0, seg(t, 540, 620))
        // Uma além da cabeça deitada (fora do rosto, com 2+ px de folga) e uma nos pés; a base no chão.
        dust.forEach((d, i) =>
          d.draw(k > 0 && k < 1 ? poofCloud() : null, {
            x: i ? x + 16 + k * 3 : x - 34 - k * 3,
            y: g - 7,
            sx: sz,
            sy: sz,
          }),
        )
      } else if (t < 720) {
        // De joelhos: de frente, agachada a partir dos pés (pega o mapa do chão).
        me.draw(front('reach'), on(idle, x, g, { sy: 0.75 }))
        held.draw(withMap ? mapFolded() : null, { x: x + 3, y: g - 9 })
        dust.forEach((d) => d.draw(null))
        light(x + 12, g - 12, 1)
      } else if (t < 780) {
        // Levanta num pulinho.
        const y = -Math.round(3 * Math.sin(seg(t, 720, 780) * Math.PI))
        me.draw(front('idle'), on(idle, x, g + y))
        held.draw(withMap ? mapFolded() : null, { x: x + 3, y: g - 30 + 17 + y })
        light(x + 12, g - 15, 1)
      } else {
        // "Ops!", parada, sem graça (braços abertos e de volta, a cada 110 ms).
        const pose: PoseName = 'oops'
        me.draw(front(pose), on(idle, x, g))
        held.draw(withMap ? mapFolded() : null, { x: x + 3, y: g - 30 + 17 })
        light(x + 12, g - 15, 1)
      }
      speak(t >= 780 ? 'Ops!' : null, x)
    }

    // ---- Parte comum: acena, pulinho, se desfaz, o coração voa até o alvo -----------------------------

    const after = (u: number) => {
      const x = rest
      // A poeira da freada termina junto com a virada.
      const dk = seg(u, -60, S.turn)
      dust.forEach((d, i) =>
        d.draw(!rare && variant !== 'deslize' && dk < 1 ? puff(2) : null, {
          x: x + 16 + i * 5,
          y: g - 8 - dk * 2,
          opacity: 1 - dk,
        }),
      )
      if (u < S.poof && rare) shadow.draw(pebble(), { x: stone.x, y: stone.y })
      else shadow.draw(null)

      if (u < S.wave) {
        const pose: PoseName = u < S.turn ? 'idle' : Math.floor((u - S.turn) / 140) % 2 ? 'wave2' : 'wave'
        me.draw(front(pose), on(idle, x, g))
        drawBag(x, rare ? 0 : 1 - ease.out(seg(u, 0, 60)))
        if (withMap) {
          // Desdobra o mapa na mão que não acena (a da esquerda): do dobrado ao aberto em 120 ms.
          const k = ease.out(seg(u, 0, 120))
          if (k < 0.5) held.draw(mapFolded(), { x: x + 3, y: g - 30 + 17 })
          else held.draw(mapOpen(), { x: x - 7, y: g - 30 + 19, sx: lerp(0.5, 1, (k - 0.5) * 2) })
        } else held.draw(null)
        light(x + 12, g - 15, 1)
        speak(u >= S.turn ? line : null, x)
        return
      }
      say.show(null)

      if (u < S.crouch) {
        // Antecipação: agacha a partir dos pés (3–4 px).
        me.draw(front('blink'), on(idle, x, g, { sy: 0.88 }))
        drawBag(x, 0)
        if (withMap) held.draw(mapOpen(), { x: x - 7, y: g - 30 + 22 })
        light(x + 12, g - 13, 1)
        return
      }

      if (u < S.poof) {
        // Comemora em dois tempos (braços abertos esticando ↔ de volta amassando, a cada 100 ms), com um
        // pulinho só até onde cabe; o mapa vai na mão. É a causa da baforada.
        const beat = Math.floor((u - S.crouch) / 100) % 2
        const y = -Math.round(jumpH * Math.sin(seg(u, S.crouch, S.poof) * Math.PI))
        me.draw(
          // Esticar só para os lados: a folga de cima já está toda no pulinho.
          front(beat ? 'yay2' : 'yay'),
          on(idle, x, g + y, beat ? { sx: 1.04 } : {}),
        )
        drawBag(x, 0)
        if (withMap) held.draw(mapOpen(), { x: x - 13, y: g - 30 + 12 + y })
        light(x + 12, g - 15 + y, 1)
      } else {
        me.draw(null)
        bag.draw(null)
        held.draw(null)
      }

      // Uma nuvem só no lugar do corpo e uma menor sobre a mala ou o mapa; somem encolhendo.
      const pk = seg(u, S.poof, S.poof + 150)
      const top = g - 30 - jumpH
      const small = withBag ? { x: x + 21, y: g - 12 } : withMap ? { x: x - 11, y: top + 12 } : null
      poof.forEach((a, i) => {
        if (pk <= 0 || pk >= 1 || i > 1 || (i === 1 && !small)) return a.draw(null)
        const sz = pk < 0.3 ? lerp(0.7, 1.15, pk / 0.3) : lerp(1.15, 0, (pk - 0.3) / 0.7)
        if (i === 0) a.draw(poofBig(), { x: x + 12 - 8.5, y: top + 8, sx: sz, sy: sz })
        else a.draw(poofCloud(), { x: small!.x, y: small!.y, sx: sz, sy: sz })
      })
      if (u >= S.poof) light(x + 12, g - 18, 1 - pk)

      // O coração: sobe, fica fino (metade), corre rente à borda de cima dos botões e só nos últimos 20%
      // sobe até a borda de baixo do alvo, entrando nele (recortado pela borda).
      const hk = seg(u, S.poof, S.hit)
      const hArt = heart()
      if (hk > 0 && hk < 1) {
        // No cruzeiro, o coração (pela metade) passa no meio do vão entre as duas linhas de botões.
        const cruise = (ceiling + rowTop) / 2 - (hArt.h * 3) / 4
        const bottomOfTarget = ty + th / 2
        const rise = ease.out(seg(hk, 0, 0.25))
        const run = ease.inOut(seg(hk, 0.25, 0.8))
        const up = ease.in(seg(hk, 0.8, 1))
        const from = { x: x + 8, y: top + 4 }
        const endX = tx - hArt.w / 2
        const hx = hk < 0.25 ? from.x : hk < 0.8 ? lerp(from.x, endX, run) : endX
        const endY = bottomOfTarget - hArt.h
        const hy = hk < 0.25 ? lerp(from.y, cruise, rise) : hk < 0.8 ? cruise : lerp(cruise, endY, up)
        const sz = lerp(1, 0.5, rise)
        // Escala a partir da base: a base visual fica em hy + h; o que passa da borda do alvo some.
        const hidden = hk < 0.8 ? 0 : Math.max(0, hArt.h - (hy + hArt.h - bottomOfTarget) / sz)
        const cut = Math.min(hArt.h, hidden)
        love.draw(hArt, {
          x: hx,
          y: hy,
          sx: sz,
          sy: sz,
          ...(cut > 0 ? { clip: { x: 0, y: cut, w: hArt.w, h: Math.max(0, hArt.h - cut) } } : {}),
        })
      } else love.draw(null)

      if (u >= S.hit && !hitDone) {
        hitDone = true
        ctx.onHit?.()
      }
      pop.draw(null)
    }

    return (t) => {
      if (t < intro) {
        love.draw(null)
        pop.draw(null)
        poof.forEach((a) => a.draw(null))
        if (variant === 'deslize') enterSlide(t)
        else if (rare) enterTrip(t)
        else enterRun(t)
        if (!rare) say.show(null)
        return
      }
      after(t - intro)
    }
  },
}
