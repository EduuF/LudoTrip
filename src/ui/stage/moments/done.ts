// Momento "atividade feita" (0,8 s): em pé sobre o botão tocado (o topo dele é o chão).
// Variações pelo tipo da atividade: foto com flash (padrão) · selfie em grupo (2 ou mais viajantes) ·
// comer (comida) · pular de alegria (imperdível). Rara: um gato aparece na polaroid.

import { frontArt, type PoseName } from '../cast'
import { arc, ease, lerp, seg, squash } from '../motion'
import type { MomentDef } from '../palco'
import { bang, flash, heart, onigiri, phone, photoFrame, polaroid, sparkle } from '../props'
import { on, party, twinkle } from '../scene'

export interface DoneCtx {
  travelers: number
  kind?: string
  must?: boolean
}

const W = 70
const H = 46

export const doneMoment: MomentDef<DoneCtx> = {
  id: 'feita',
  variants: (c) => {
    if (c.kind === 'food') return ['comer']
    if (c.must) return ['pulo']
    return c.travelers >= 2 ? ['foto', 'selfie'] : ['foto']
  },
  rare: 'gato',
  duration: (v) => (v === 'gato' ? 1000 : 800),
  figure: (r) => Math.min(36, Math.max(24, r.height * 0.85)),
  size: () => ({ w: W, h: H }),
  place: 'on',
  fitGap: true,
  build(stage, variant, ctx, rng) {
    const ps = party(ctx.travelers)
    const p = ps[Math.floor(rng() * ps.length)]!
    const g = H
    const behind = stage.actor(1)
    const people = [stage.actor(2), stage.actor(2), stage.actor(2)]
    const fl = stage.actor(6)
    const pic = stage.actor(5)
    const top = stage.actor(7)
    const hold = stage.actor(4)
    const sparks = twinkle(stage)
    const idle = frontArt(p, 'idle')

    if (variant === 'comer') {
      // Leva o onigiri do peito à boca, três mordidas mastigando (a boca abre e fecha), a última ponta some
      // na última mastigada, bochecha cheia, e o joinha; um coração sobe.
      return (t) => {
        const x = 18
        const chew = Math.floor((t - 200) / 90) % 2 ? 'blink' : 'eat'
        let pose: PoseName = 'camLow'
        if (t >= 120 && t < 560) pose = t < 200 ? 'eat' : chew
        else if (t >= 560 && t < 640) pose = 'blink'
        else if (t >= 640) pose = 'thumb'
        people[0]!.draw(frontArt(p, pose), on(idle, x, g, squash(t, 200, 120, 0.08)))
        // Do peito (mãos em camLow) até a boca (mãos em eat), com ease.out.
        const up = ease.out(seg(t, 120, 200))
        const bites = t < 200 ? 0 : t < 340 ? 1 : t < 480 ? 2 : 3
        pic.draw(t < 560 ? onigiri(bites) : null, { x: x + 7, y: lerp(g - 30 + 16, g - 30 + 8, up) })
        const hk = seg(t, 480, 780)
        top.draw(hk > 0 && hk < 1 ? heart() : null, {
          x: x + 9,
          y: g - 38 - hk * 8,
          opacity: 1 - hk * 0.8,
          ...squash(t, 480, 140, -0.2),
        })
        fl.draw(null)
        behind.draw(null)
        hold.draw(null)
      }
    }

    if (variant === 'pulo') {
      // Dois pulos de alegria (agacha, sobe, aterrissa amassando), com brilhos no alto.
      return (t) => {
        const x = 22
        const hop = (a: number, b: number, h: number) =>
          t > a && t < b ? -h * Math.sin(seg(t, a, b) * Math.PI) : 0
        const y = hop(120, 380, 9) + hop(420, 640, 6)
        const air = y < -0.5
        const crouch = (t > 60 && t < 120) || (t > 380 && t < 420) ? 2 : 0
        const pose: PoseName = air ? 'cheer' : t < 60 ? 'idle' : t >= 660 ? 'thumb' : 'blink'
        const sq = !air ? squash(t, t < 380 ? 60 : 380, 100, 0.14) : {}
        people[0]!.draw(frontArt(p, pose), on(idle, x, g + y + crouch, sq))
        fl.draw(t > 230 && t < 330 ? sparkle() : null, { x: x - 2, y: g - 40 })
        top.draw(t > 520 && t < 620 ? sparkle('#f6c6d4') : null, { x: x + 24, y: g - 38 })
        pic.draw(null)
        behind.draw(null)
        hold.draw(null)
      }
    }

    if (variant === 'selfie') {
      // O grupo se espreme; quem está no meio ergue o celular (passando pelo braço estendido); flash na
      // tela; a moldura da foto salta do celular e cai ao lado.
      const group = ps.slice(0, 3)
      const lead = Math.min(1, group.length - 1)
      return (t) => {
        const squeeze = ease.out(seg(t, 0, 180))
        let lx = 0
        group.forEach((q, i) => {
          const x = 4 + i * (20 - squeeze * 5)
          if (i === lead) lx = x
          const pose: PoseName =
            i === lead ? (t < 120 ? 'idle' : t < 200 ? 'give' : 'wave') : t > 200 ? 'cheer' : 'idle'
          people[i]!.draw(frontArt(q, pose), on(frontArt(q, 'idle'), x, g))
        })
        // O celular na mão: no braço estendido (give) e depois no alto (wave).
        const ph = t < 120 ? null : t < 200 ? { x: lx + 21, y: g - 30 + 11 } : { x: lx + 18, y: g - 30 - 1 }
        hold.draw(ph ? phone() : null, { x: ph?.x ?? 0, y: ph?.y ?? 0 })
        fl.draw(t > 200 && t < 280 ? flash() : null, { x: lx + 15, y: g - 30 - 4 })
        // A moldura salta da tela (cresce a partir dela) e cai em arco à direita.
        if (t < 280) pic.draw(null)
        else {
          const g0 = ease.back(seg(t, 280, 400))
          const k = ease.out(seg(t, 400, 720))
          const pt = arc(k, lx + 16, g - 34, W - 18, g - 12, 6)
          const sz = lerp(0.4, 1, Math.min(1, Math.max(0, g0)))
          pic.draw(photoFrame(group), { x: pt.x, y: pt.y, sx: sz, sy: sz, rot: k * -12 })
        }
        sparks(t, 640, W - 12, g - 16)
        behind.draw(null)
      }
    }

    // Foto com flash (e a rara: a polaroid cai como paisagem e, assentada, vira o gato; susto e joinha).
    const cat = variant === 'gato'
    return (t) => {
      const x = 6
      // Mira (agacha 2 px), coice no flash (2 px para trás), câmera baixada no peito, joinha com a câmera.
      const dy = t < 140 ? 2 : 0
      const dx = t >= 150 && t < 240 ? -2 : 0
      let pose: PoseName = t < 450 ? 'photo' : t < 550 ? 'camLow' : 'thumbCam'
      if (cat) pose = t < 450 ? 'photo' : t < 720 ? 'camLow' : t < 940 ? 'oopsCam' : 'thumbCam'
      people[0]!.draw(frontArt(p, pose), on(idle, x + dx, g + dy, squash(t, 0, 140, 0.1)))
      fl.draw(t > 150 && t < 240 ? flash() : null, { x: x + 7 + dx, y: g - 30 + 5 })
      // A polaroid sai do alto da câmera crescendo (por trás do rosto até 260 ms), depois cai em arco.
      const src = { x: x + 7, y: g - 30 + 4 }
      const photo = cat && t >= 720 ? 'cat' : 'view'
      if (t < 220) {
        pic.draw(null)
        behind.draw(null)
      } else if (t < 340) {
        const sz = lerp(0.4, 1, ease.out(seg(t, 220, 340)))
        const pose2 = { x: src.x, y: src.y - 14 * sz, sx: sz, sy: sz }
        ;(t < 260 ? behind : pic).draw(polaroid('view', ps), pose2)
        ;(t < 260 ? pic : behind).draw(null)
      } else {
        behind.draw(null)
        const k = ease.out(seg(t, 340, 720))
        const pt = arc(k, src.x, src.y - 14, 46, g - 15, 8)
        const settle = k < 1 ? -200 * k : -200 + 8 * Math.sin(seg(t, 720, 820) * Math.PI)
        const reveal = cat && t >= 720 && t < 840 ? -2 * Math.sin(seg(t, 720, 840) * Math.PI) : 0
        pic.draw(polaroid(photo, ps), { x: pt.x, y: pt.y + reveal, rot: (settle % 360) / 20 })
      }
      // O "!" entre a cabeça e a foto: o olho vai da pessoa para o gato.
      top.draw(cat && t >= 720 && t < 940 ? bang() : null, { x: x + 20, y: g - 36 })
      sparks(t, cat ? 720 : 640, cat ? 52 : 50, g - 18)
      hold.draw(null)
    }
  },
}
