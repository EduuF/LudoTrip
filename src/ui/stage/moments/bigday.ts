// Momento "o grande dia" (uma vez por viagem): ao abrir a viagem no dia da ida, uma plataforma surge logo
// abaixo da contagem do mapa, de borda a borda (recortada no mapa), e os viajantes passam por ela.
// Variações pelo 1º trecho: malas e aceno (padrão) · portão de embarque (voo) · porta-malas da Kombi
// (carro). Rara: alguém esquece a mala (que fica à vista onde foi esquecida), volta correndo e busca.
// Regras do avaliador: ninguém antes da plataforma; fila sem atropelo; mala sempre atrás de quem puxa;
// aceno em dois tempos com o braço no alto; balão de fala parado, saindo de alguém, dentro do palco;
// o que fica parado evita rótulos e pinos do mapa; a plataforma fecha logo depois de o último sair.

import { bar, flipX } from '../art'
import type { LegMode } from '../../../engine'
import { frontArt, type Person, type PoseName } from '../cast'
import { arc, ease, lerp, seg, squash } from '../motion'
import type { MomentDef } from '../palco'
import { bang, gate, kombi, suitcase } from '../props'
import { on, party, twinkle } from '../scene'
import { gait, sideArt } from '../side'

export interface BigDayCtx {
  travelers: number
  mode?: LegMode
  /** Faixas (em px, a partir da esquerda do palco) com rótulos ou pinos do mapa. */
  avoid?: [number, number][]
}

const BAGS = ['#e9573f', '#2b3f6b', '#557a3e', '#e2809f']
const H = 72
const OPEN = 260 // a plataforma termina de abrir
const CLOSE = 260 // e leva isto para fechar
const DUR: Record<string, number> = { malas: 2800, portao: 3600, 'porta-malas': 2700, esqueceu: 3400 }

export const bigDayMoment: MomentDef<BigDayCtx> = {
  id: 'grande-dia',
  variants: (c) => [c.mode === 'flight' ? 'portao' : c.mode === 'car' ? 'porta-malas' : 'malas'],
  rare: 'esqueceu',
  duration: (v) => DUR[v] ?? 2800,
  figure: () => 30,
  size: (r, s) => ({ w: Math.round(r.width / s), h: H }),
  place: 'below',
  clip: true,
  build(stage, variant, ctx) {
    const ps = party(ctx.travelers)
    const n = ps.length
    const W = stage.w
    const g = H - 4
    const s = stage.s
    const end = DUR[variant] ?? 2800
    const floor = stage.actor(0)
    const edge = stage.actor(0)
    const prop = stage.actor(2)
    const front = stage.actor(6)
    const walkers = ps.map(() => ({ me: stage.actor(4), bag: stage.actor(3), behind: stage.actor(1) }))
    const cry = stage.actor(7)
    const lone = stage.actor(3)
    const bubble = stage.say()
    const sparks = twinkle(stage)
    const avoid = (ctx.avoid ?? []).map(([a, b]) => [a / s, b / s] as [number, number])

    /** O primeiro x (pixels de arte) da lista em que um objeto de largura `w` não fica sobre rótulo/pino. */
    const clearAt = (w: number, prefs: number[]) =>
      prefs.map((k) => Math.round(W * k)).find((x) => !avoid.some(([a, b]) => x < b && x + w > a)) ??
      Math.round(W * prefs[0]!)

    /** Balão de fala parado, dentro do palco (4 px das bordas), saindo da cabeça de quem fala. */
    // Também desvia de rótulos e pinos (4 px de folga): tenta sobre a cabeça e, se não der, ao lado.
    // A largura real do balão (medida na tela, em pixels de arte); sem medida, uma estimativa folgada.
    const TEXT = 'Hoje é o dia!'
    bubble.show(TEXT, 0, 0, 0)
    const half = (bubble.el.offsetWidth ? bubble.el.offsetWidth / s : 84) / 2
    bubble.show(null)
    const inside = (x: number) => Math.min(Math.max(x, half + 4), W - half - 4)
    /** O balão centrado em x não encosta em rótulo nem pino (4 px de folga)? */
    const bubbleFree = (x: number) => !avoid.some(([a, b]) => x - half - 4 < b && x + half + 4 > a)
    // O balão sai da cabeça de quem fala; se encostar num rótulo, desliza no máximo até a borda do corpo
    // dele (±12 px), nunca para cima de outra pessoa ou objeto.
    const SLIDE = [0, -6, 6, -12, 12]
    /** Há onde pôr o balão sobre esta cabeça (deslizando no máximo até a borda do corpo)? */
    const canSay = (headX: number) => SLIDE.some((d) => bubbleFree(inside(headX + d)))
    const say = (on: boolean, headX: number) => {
      const cx = SLIDE.map((d) => inside(headX + d)).find(bubbleFree) ?? inside(headX)
      bubble.show(on ? TEXT : null, cx, g - 32)
    }
    /** O primeiro x da lista em que um grupo de largura `w` fica livre E o balão sobre `head(x)` também. */
    const clearWithSpeech = (w: number, prefs: number[], head: (x: number) => number) =>
      prefs
        .map((k) => Math.round(W * k))
        .find((x) => !avoid.some(([a, b]) => x < b && x + w > a) && canSay(head(x)))

    /** A plataforma abre (do centro para as bordas, de borda a borda) e fecha em `closeAt`. */
    const platform = (t: number, closeAt: number) => {
      const k = Math.max(0, ease.out(seg(t, 0, OPEN))) * (1 - ease.in(seg(t, closeAt, closeAt + CLOSE)))
      floor.draw(k > 0 ? bar(W, 4, '#c4915e') : null, { x: 0, y: g, sx: k })
      edge.draw(k > 0 ? bar(W, 1, '#8a5a3a') : null, { x: 0, y: g + 3, sx: k })
      return t >= OPEN && t < closeAt
    }
    const hide = () => {
      walkers.forEach((w) => {
        w.me.draw(null)
        w.bag.draw(null)
        w.behind.draw(null)
      })
      prop.draw(null)
      front.draw(null)
      cry.draw(null)
      lone.draw(null)
      say(false, 0)
    }

    /** Andando (ou correndo) para a direita, puxando a mala (atrás, nas rodinhas). */
    const pulling = (i: number, p: Person, t: number, x: number, run = false, y = g) => {
      const art = gait(p, t + i * 70, run ? 'run' : 'walk', run ? 75 : 110, 'pull')
      walkers[i]!.me.draw(art, on(art, x, y))
      walkers[i]!.bag.draw(suitcase(BAGS[i % 4]), on(suitcase(), x - 10, y, { rot: -8 }))
    }
    /** De frente, com a mala em pé do lado esquerdo (o mesmo lado de quando puxa). */
    const standing = (i: number, p: Person, x: number, pose: PoseName, sq = {}) => {
      walkers[i]!.me.draw(frontArt(p, pose), on(frontArt(p, 'idle'), x, g, sq))
      walkers[i]!.bag.draw(suitcase(BAGS[i % 4]), on(suitcase(), x - 11, g))
    }
    /** Aceno em dois tempos, com o braço sempre no alto. */
    const waving = (t: number): PoseName => (Math.floor(t / 140) % 2 ? 'wave2' : 'wave')

    if (variant === 'portao') {
      // Fila: cada um anda até o portão; se alguém está passando, para uma mala atrás e espera. No portão:
      // pausa, a luz pisca verde, passa com um pulinho e segue; o primeiro a passar diz a frase.
      // O portão e o lugar de quem fala (o primeiro a passar, mais à direita do grupo) escolhidos juntos.
      const speakerHead = (x: number) => x + 30 + (n - 1) * 26 + 12
      const gx =
        clearWithSpeech(28, [0.45, 0.35, 0.28, 0.22, 0.55, 0.62], speakerHead) ??
        clearAt(28, [0.28, 0.22, 0.35, 0.45])
      const v = 0.3
      const PAUSE = 200
      const LIGHT = 240
      const t0 = (i: number) => OPEN + 40 + i * 260
      const reach = (i: number) => t0(i) + (gx - 20 + 26) / v
      const gateStart: number[] = []
      ps.forEach((_, i) => gateStart.push(Math.max(reach(i), i ? gateStart[i - 1]! + PAUSE + LIGHT : 0)))
      const gateEnd = (i: number) => gateStart[i]! + PAUSE + LIGHT
      const v2 = 0.3
      // O lugar de espera depois do portão: quem passa primeiro vai mais longe (ninguém cruza ninguém).
      // Onde o grupo para depois do portão: o primeiro (quem fala) fica mais longe; o lugar é escolhido
      // para que o balão sobre a cabeça dele fique livre de rótulos, e o grupo caiba na plataforma.
      const firstAt = (r0: number) => r0 + (n - 1) * 26
      const r0 =
        [30, 34, 40, 48, 56, 64, 72, 22]
          .map((d) => gx + d)
          .find((r) => firstAt(r) + 24 <= W - 4 && canSay(firstAt(r) + 12)) ?? gx + 30
      const rest = (i: number) => r0 + (n - 1 - i) * 26
      const atRest = (i: number) => gateEnd(i) + (rest(i) - (gx + 4)) / v2
      // A fala espera a calma: começa quando o último já passou e todos estão parados, e dura 700 ms.
      const speakAt = atRest(n - 1) + 120
      const goAll = speakAt + 700
      const exitAt = goAll + 100 + (W + 14 - rest(n - 1)) / 0.45
      const closeAt = Math.min(end - CLOSE - 20, exitAt + 60)
      return (t) => {
        const ready = platform(t, closeAt)
        // O portão surge com a plataforma e afunda depois que o último passa.
        const up =
          Math.max(0, ease.out(seg(t, 180, 300))) * (1 - seg(t, gateEnd(n - 1) + 150, gateEnd(n - 1) + 300))
        prop.draw(up > 0 ? gate(false) : null, on(gate(), gx, g, { sy: up }))
        if (!ready) return hide()
        let lit = false
        ps.forEach((p, i) => {
          const w = walkers[i]!
          w.behind.draw(null)
          if (t < t0(i)) return (w.me.draw(null), w.bag.draw(null))
          const gs = gateStart[i]!
          if (t < gs) {
            // Andando até o portão, ou parado uma mala atrás de quem está passando.
            const busy = i > 0 && t < gateEnd(i - 1)
            const stop = busy ? gx - 20 - 34 : gx - 20
            const x = Math.min(-26 + (t - t0(i)) * v, stop)
            if (x >= stop && t > t0(i) + 100) {
              const art = sideArt(p, 'stand', 'pull', 'down')
              w.me.draw(art, on(art, x, g))
              w.bag.draw(suitcase(BAGS[i % 4]), on(suitcase(), x - 10, g))
              return
            }
            return pulling(i, p, t, x)
          }
          if (t < gs + PAUSE) {
            const art = sideArt(p, 'stand', 'pull', 'down')
            w.me.draw(art, on(art, gx - 20, g))
            w.bag.draw(suitcase(BAGS[i % 4]), on(suitcase(), gx - 30, g))
            return
          }
          if (t < gateEnd(i)) {
            // A luz pisca verde (verde, apagada, verde a cada 80 ms) enquanto passa, com um pulinho.
            const k = seg(t, gs + PAUSE, gateEnd(i))
            lit = Math.floor((t - gs - PAUSE) / 80) % 2 === 0
            const x = lerp(gx - 20, gx + 4, k)
            pulling(i, p, t, x, false, g - 2 * Math.sin(k * Math.PI))
            return
          }
          if (t < atRest(i)) return pulling(i, p, t, gx + 4 + (t - gateEnd(i)) * v2)
          if (t < goAll) return standing(i, p, rest(i), waving(t + i * 70), squash(t, atRest(i), 140, 0.1))
          if (t < goAll + 100) {
            const art = sideArt(p, 'stand', 'pull', 'down')
            w.me.draw(art, on(art, rest(i), g))
            w.bag.draw(
              suitcase(BAGS[i % 4]),
              on(suitcase(), rest(i) - 10, g, { rot: -8 * seg(t, goAll, goAll + 100) }),
            )
            return
          }
          const x = rest(i) + (t - goAll - 100) * 0.45
          if (x > W + 14) return (w.me.draw(null), w.bag.draw(null))
          pulling(i, p, t, x, true)
        })
        front.draw(lit && up >= 1 ? gate(true) : null, on(gate(), gx, g))
        say(t >= speakAt && t < goAll, rest(0) + 12)
        cry.draw(null)
        lone.draw(null)
      }
    }

    if (variant === 'porta-malas') {
      // A Kombi espera com a tampa de trás aberta. Cada um chega com a mala na mão, joga no porta-malas e
      // passa por trás da Kombi (camada de baixo); o rosto aparece na janela. A tampa fecha, alguém fala
      // (o balão fica parado e some quando ela parte) e a Kombi parte.
      const kx = clearAt(50, [0.3, 0.2, 0.45, 0.55])
      const v = 0.3
      const t0 = (i: number) => OPEN + 40 + i * 230
      const arrive = (i: number) => t0(i) + (kx - 24 + 26) / v
      const toss = (i: number) => arrive(i) + 220
      const gone = (i: number) => toss(i) + 220
      const closeHatch = gone(n - 1) + 80
      const drive = closeHatch + 520
      const away = Math.min(drive + 420, end - CLOSE - 40)
      const closeAt = away + 40
      return (t) => {
        const ready = platform(t, closeAt)
        const x = kx + ease.inOut(seg(t, drive, away)) * (W + 6 - kx)
        const inside = ps.filter((_, i) => t >= gone(i))
        const open = t < closeHatch
        const van = kombi(inside, { hatch: open })
        // A Kombi aparece com a plataforma (que abre embaixo dela).
        const vanIn = t >= 160 && t < away
        prop.draw(vanIn ? van : null, on(van, open ? x - 10 : x, g + 1, squash(t, closeHatch, 180, 0.08)))
        if (!ready) return hide()
        ps.forEach((p, i) => {
          const w = walkers[i]!
          if (t < t0(i) || t >= gone(i)) {
            w.me.draw(null)
            w.bag.draw(null)
            w.behind.draw(null)
            return
          }
          const sx = kx - 24
          if (t < arrive(i)) {
            const fx = -26 + (t - t0(i)) * v
            const art = gait(p, t + i * 60, 'walk', 100, 'carry')
            w.me.draw(art, on(art, fx, g))
            w.bag.draw(suitcase(BAGS[i % 4]), { x: fx + 11, y: g - 30 + 15 })
            w.behind.draw(null)
            return
          }
          if (t < toss(i)) {
            // Ergue e joga a mala em arco para dentro do porta-malas (o vão aberto na traseira).
            const k = ease.out(seg(t, arrive(i) + 60, toss(i)))
            const art = sideArt(p, 'stand', k > 0 ? 'up' : 'carry', 'down')
            w.me.draw(art, on(art, sx, g))
            const pt = arc(k, sx + 11, g - 15, kx - 2, g - 30, 8)
            w.bag.draw(k < 1 ? suitcase(BAGS[i % 4]) : null, { x: pt.x, y: pt.y, rot: k * 90 })
            w.behind.draw(null)
            return
          }
          // Passa por trás da Kombi (desenhado na camada de baixo) e some do outro lado.
          w.me.draw(null)
          w.bag.draw(null)
          const art = gait(p, t, 'walk', 90)
          w.behind.draw(art, on(art, lerp(sx, kx + 6, seg(t, toss(i), gone(i))), g))
        })
        say(t >= closeHatch + 60 && t < drive && inside.length > 0, kx + 32)
        sparks(t, closeHatch, kx + 4, g - 22)
        front.draw(null)
        cry.draw(null)
        lone.draw(null)
      }
    }

    // Malas e aceno (e a rara: a primeira esquece a mala na ponta esquerda, percebe, volta correndo, pega e
    // volta; os outros viram para olhar e batem o pé esperando).
    const rare = variant === 'esqueceu'
    const v = 0.24
    const spacing = 28
    const groupW = (n - 1) * spacing + 24
    const prefs = rare ? [0.45, 0.55, 0.35, 0.25, 0.15] : [0.3, 0.4, 0.2, 0.5, 0.1]
    const left = clearWithSpeech(groupW, prefs, (x) => x + (n - 1) * spacing + 12) ?? clearAt(groupW, prefs)
    const spot = (i: number) => left + (n - 1 - i) * spacing // 1º a entrar, lugar mais à direita
    const t0 = (i: number) => OPEN + 40 + i * 200
    const arrive = (i: number) => t0(i) + (spot(i) + 28) / v
    const greet = arrive(n - 1) + 120
    const bagX = 6 // onde a mala foi solta (esquecida)
    const forgetter = n - 1 // o último a entrar fica à esquerda: volta sem cruzar ninguém
    const dropAt = (16 + 28) / v + 0 // quando ele passa por x ≈ 16 (relativo ao início dele)
    // Tempos da rara (a que esquece é a primeira, a da esquerda: não cruza ninguém).
    const notice = arrive(forgetter) + 80
    const runBack = notice + 260
    const atBag = runBack + (spot(forgetter) - (bagX + 11)) / 0.4
    const grabbed = atBag + 100
    const backAgain = grabbed + (spot(forgetter) - (bagX + 11)) / 0.4
    const cheerFrom = rare ? Math.max(greet, backAgain + 60) : greet
    const turn = cheerFrom + 600
    const exitDone = (i: number) => turn + 100 + (W + 30 - spot(i)) / 0.5
    const closeAt = Math.min(end - CLOSE - 20, exitDone(forgetter) + 40)
    return (t) => {
      if (!platform(t, closeAt)) return hide()
      // A mala solta: aparece quando ele a solta (quica 1 px ao assentar) e fica à vista até ele voltar.
      const dropped = t0(forgetter) + dropAt
      lone.draw(
        rare && t >= dropped && t < atBag ? suitcase(BAGS[forgetter % 4]) : null,
        on(suitcase(), bagX, g - (t < dropped + 120 ? 1 : 0)),
      )
      let cryOn = false
      ps.forEach((p, i) => {
        const w = walkers[i]!
        w.behind.draw(null)
        const forgot = rare && i === forgetter
        const sx = spot(i)
        if (t < t0(i)) return (w.me.draw(null), w.bag.draw(null))
        if (t < arrive(i)) {
          const x = Math.min(-28 + (t - t0(i)) * v, sx)
          const dropped = t0(i) + dropAt
          if (forgot && t >= dropped && t < dropped + 120) {
            // Solta o puxador (a mão abre) e a mala fica.
            const art = sideArt(p, 'stand', 'down', 'down')
            w.me.draw(art, on(art, x, g))
            w.bag.draw(null)
          } else if (forgot && t >= dropped) {
            const art = gait(p, t, 'walk', 110)
            w.me.draw(art, on(art, x, g))
            w.bag.draw(null)
          } else pulling(i, p, t, x)
          return
        }
        if (forgot && t < backAgain) {
          if (t < runBack) {
            // Percebe: susto com "!".
            cryOn = t >= notice
            w.me.draw(
              frontArt(p, t >= notice ? 'oops' : 'idle'),
              on(frontArt(p, 'idle'), sx, g, squash(t, notice, 120, 0.1)),
            )
            w.bag.draw(null)
            return
          }
          if (t < atBag) {
            const art = flipX(gait(p, t, 'run', 75))
            w.me.draw(art, on(art, lerp(sx, bagX + 11, seg(t, runBack, atBag)), g))
            w.bag.draw(null)
            return
          }
          if (t < grabbed) {
            const art = sideArt(p, 'stand', 'pull', 'down')
            w.me.draw(art, on(art, bagX + 11, g))
            w.bag.draw(
              suitcase(BAGS[forgetter % 4]),
              on(suitcase(), bagX + 1, g, { rot: -8 * seg(t, atBag, grabbed) }),
            )
            return
          }
          return pulling(i, p, t, lerp(bagX + 11, sx, seg(t, grabbed, backAgain)), true)
        }
        if (rare && !forgot && t < backAgain && t >= notice) {
          // Vira para olhar a amiga e bate o pé esperando (o pé sobe a cada 160 ms).
          const tap = Math.floor((t - notice) / 160) % 2 ? 'walkB' : 'stand'
          const art = flipX(sideArt(p, tap, 'down', 'down'))
          w.me.draw(art, on(art, sx, g))
          w.bag.draw(suitcase(BAGS[i % 4]), on(suitcase(), sx - 11, g))
          return
        }
        if (t < turn) {
          const pose: PoseName = t < cheerFrom ? 'idle' : waving(t + i * 70)
          return standing(i, p, sx, pose, squash(t, arrive(i), 140, 0.1))
        }
        // Vira de perfil e pega a mala (100 ms), depois segue até a borda direita.
        if (t < turn + 100) {
          const art = sideArt(p, 'stand', 'pull', 'down')
          w.me.draw(art, on(art, sx, g))
          w.bag.draw(
            suitcase(BAGS[i % 4]),
            on(suitcase(), sx - 10, g, { rot: -8 * seg(t, turn, turn + 100) }),
          )
          return
        }
        const x = sx + (t - turn - 100) * 0.5
        if (x > W + 30) return (w.me.draw(null), w.bag.draw(null))
        pulling(i, p, t, x, true)
      })
      cry.draw(cryOn ? bang() : null, { x: spot(forgetter) + 11, y: g - 40 })
      say(t >= cheerFrom && t < turn, spot(0) + 12)
      sparks(t, cheerFrom, spot(0) + 12, g - 40)
      prop.draw(null)
      front.draw(null)
    }
  },
}
