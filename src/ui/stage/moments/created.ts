// Momento "viagem criada" (2,7 s): numa faixa dentro do cartão "VIAGEM CRIADA!" (um toque pula).
// Espera o cartão terminar de surgir; o veículo do 1º trecho chega e freia; os viajantes chegam andando de
// perfil, param na porta (ou sobem a escada / a prancha), viram de costas, dão um passo em arco e somem
// dentro dela (o rosto aparece na janela); o veículo dá um tranco e parte, saindo da faixa; o cenário
// esmaece no fim (sem tempo morto).
// Variações pelo 1º trecho: Kombi (carro, ônibus, moto, bicicleta, a pé) · avião (escada, decola) · trem
// (plataforma) · barco (prancha). Rara: o veículo parte sem eles; susto, correm atrás (um perde o
// chapéu), ele freia e eles pulam para dentro.

import { bar, type Art } from '../art'
import type { LegMode } from '../../../engine'
import { frontArt, type Person } from '../cast'
import { arc, ease, fade, lerp, seg, squash } from '../motion'
import type { MomentDef, Stage } from '../palco'
import { bang, boat, kombi, plane, puff, ramp, stairs, strawHat, train, type VehicleOpts } from '../props'
import { on, party } from '../scene'
import { gait, sideArt } from '../side'

export interface CreatedCtx {
  travelers: number
  mode?: LegMode
}

type Ride = 'kombi' | 'aviao' | 'trem' | 'barco'

const rideFor = (m?: LegMode): Ride =>
  m === 'flight' ? 'aviao' : m === 'train' ? 'trem' : m === 'boat' ? 'barco' : 'kombi'

const VEHICLE: Record<Ride, (people: Person[], o: VehicleOpts) => Art> = {
  kombi,
  aviao: plane,
  trem: train,
  barco: boat,
}

/**
 * Geometria de cada veículo (pixels da arte, já com a margem do contorno): a porta (recorte de quem entra)
 * e quanto ele afunda abaixo do chão (rodas na estrada, casco na água).
 */
const GEO: Record<Ride, { door: { x: number; y: number; w: number; h: number }; sink: number }> = {
  kombi: { door: { x: 7, y: 4, w: 7, h: 23 }, sink: 1 },
  aviao: { door: { x: 17, y: 15, w: 9, h: 23 }, sink: 0 },
  trem: { door: { x: 8, y: 10, w: 7, h: 27 }, sink: 0 },
  barco: { door: { x: 13, y: 9, w: 7, h: 25 }, sink: 7 },
}

const DELAY = 220 // o cartão "VIAGEM CRIADA!" termina de surgir
const DURATION = 2700
const DURATION_RARE = 3000
const PAUSE = 100 // parado de costas, virado para a porta
const STEP = 110 // o passo em arco para dentro
const GONE = 100 // dentro da porta, escurecendo
const ARRIVE = 300 // o veículo chega e freia

function build(stage: Stage, variant: string, ctx: CreatedCtx): (t: number) => void {
  const ps = party(ctx.travelers)
  const n = ps.length
  const rare = variant === 'esquecidos'
  const ride: Ride = rare ? rideFor(ctx.mode) : (variant as Ride)
  const geo = GEO[ride]
  const W = stage.w
  const g = stage.h - 3
  const floor = stage.actor(0)
  const water = stage.actor(0)
  const deck = stage.actor(1)
  const marks = Array.from({ length: Math.ceil(W / 8) + 1 }, () => stage.actor(1))
  const rampA = stage.actor(2)
  const veh = stage.actor(3)
  const plankTop = stage.actor(3) // a prancha, por cima do casco (criada depois: fica na frente)
  const walkers = ps.map(() => stage.actor(4))
  const fx = [stage.actor(5), stage.actor(5), stage.actor(5)]
  const hat = stage.actor(6)
  const cries = ps.map(() => stage.actor(7))
  const sample = VEHICLE[ride]([], {})
  const MOVE = 64 // quanto o veículo anda sem eles, na rara
  const park0 = Math.round(W * (ride === 'aviao' ? 0.3 : 0.42))
  // Na rara, estaciona onde, depois de andar, ainda cabe inteiro na faixa (nada parado cortado).
  const park = rare ? Math.min(park0, W - 4 - MOVE - VEHICLE[ride]([], {}).w) : park0
  const top = () => g + geo.sink - sample.h
  const sill = () => top() + geo.door.y + geo.door.h - 1 // a soleira da porta (onde se pisa)
  const doorCenter = (vx: number) => vx + geo.door.x + geo.door.w / 2
  // Onde se anda: o chão, ou a plataforma do trem (rente à soleira).
  const walkY = ride === 'trem' ? sill() + 1 : g
  // Barco: a prancha vai da quina do píer até a soleira; avião: a escada até a soleira.
  const pierEnd = park - 6
  const rampFrom = ride === 'barco' ? pierEnd - 2 : park + geo.door.x - 13
  const climb = ride === 'aviao' || ride === 'barco' ? 220 : 0
  const deckWalk = ride === 'barco' ? 120 : 0 // no barco: 2 ou 3 passos no convés até a porta
  const CYCLE = PAUSE + STEP + GONE // tempo de cada um na porta

  // Tempos: o último embarca por volta de 1450 ms de cena, qualquer que seja o tamanho do grupo.
  const stagger = 200
  const start = (i: number) => ARRIVE + i * stagger
  const stopX = (vx: number) => (climb ? rampFrom - 14 : doorCenter(vx) - 18)
  const dist = stopX(park) + 26
  // O primeiro chega a tempo de o último (com a fila na porta) embarcar por volta de 1450 ms.
  const speed = Math.min(0.32, Math.max(0.1, dist / Math.max(200, 1450 - climb - n * CYCLE - start(0))))
  const arrive = (i: number) => start(i) + dist / speed
  // Fila: ninguém começa a subir/entrar antes de a porta ficar livre.
  const climbStart: number[] = []
  ps.forEach((_, i) =>
    climbStart.push(Math.max(arrive(i), i ? climbStart[i - 1]! + climb + deckWalk + CYCLE : 0)),
  )
  const doorStart = (i: number) => climbStart[i]! + climb + deckWalk
  // Rara: correm atrás e pulam para dentro, um de cada vez.
  const riderIn = (i: number) => 1350 + i * (n > 1 ? Math.min(250, 500 / (n - 1)) : 0)
  const boarded = (i: number) => (rare ? riderIn(i) : doorStart(i) + CYCLE)
  const leave = rare ? riderIn(n - 1) + 150 : Math.max(boarded(n - 1) + 120, 1300)
  const away = Math.min(leave + 650, (rare ? DURATION_RARE : DURATION) - DELAY - 250)

  const vx = (T: number) => {
    // Chega pela direita e freia; na rara, sai cedo (eles ainda longe), anda e freia de novo.
    let base = lerp(W + 6, park, ease.out(seg(T, 0, ARRIVE)))
    if (rare && T > 450) base = park + ease.inOut(seg(T, 450, 1000)) * MOVE
    return T < leave ? base : base + ease.inOut(seg(T, leave, away)) * (W + 12 - base)
  }
  const restX = rare ? park + MOVE : park

  const groundArt = bar(W, 3, ride === 'barco' ? '#8a5a3a' : ride === 'trem' ? '#6e5b69' : '#9a95a3')
  const markArt = bar(
    ride === 'trem' ? 2 : 4,
    1,
    ride === 'barco' ? '#ffffff' : ride === 'trem' ? '#c4915e' : '#f6edeb',
  )

  return (t) => {
    const T = t - DELAY
    // O cenário surge com o cartão e esmaece nos últimos 250 ms (sem tempo morto).
    const total = rare ? DURATION_RARE : DURATION
    const show = Math.min(1, Math.max(0, T / 120)) * fade(t, total - 250, total)
    floor.draw(T >= 0 ? (ride === 'barco' ? bar(pierEnd, 3, '#8a5a3a') : groundArt) : null, {
      x: 0,
      y: g,
      opacity: show,
    })
    water.draw(T >= 0 && ride === 'barco' ? bar(W - pierEnd, 4, '#9db4f0') : null, {
      x: pierEnd,
      y: g,
      opacity: show,
    })
    deck.draw(T >= 0 && ride === 'trem' ? bar(park + 4, g - walkY + 1, '#c9c3cf') : null, {
      x: 0,
      y: walkY,
      opacity: show,
    })
    marks.forEach((m, i) => {
      const x = ride === 'barco' ? pierEnd + i * 8 + Math.round(Math.sin(t / 200 + i) * 2) : i * 10
      m.draw(T >= 0 && (ride !== 'barco' || x > pierEnd) ? markArt : null, { x, y: g + 1, opacity: show })
    })
    if (T < 0) {
      veh.draw(null)
      rampA.draw(null)
      walkers.forEach((a) => a.draw(null))
      return
    }

    const x = vx(T)
    const inside = ps.filter((_, i) => T >= boarded(i))
    const doorOpen = ps.some((_, i) => T >= (rare ? riderIn(i) - 300 : doorStart(i)) && T < boarded(i) + 60)
    // Decolagem pela posição na pista: passou de park + 25, o nariz sobe e ele ganha altura.
    const lift = ride === 'aviao' && T >= leave ? ease.in(seg(x, restX + 25, restX + 25 + W * 0.3)) : 0
    const art = VEHICLE[ride](inside, { door: doorOpen, gearUp: lift > 0.05 })
    const bob = ride === 'barco' ? Math.round(Math.sin(t / 180)) : 0
    const arriveSq = squash(T, ARRIVE - 20, 140, 0.04)
    const brake = rare ? squash(T, 1000, 180, 0.07) : {}
    const tug = squash(T, leave - 120, 150, 0.06)
    veh.draw(
      art,
      on(art, x, g + geo.sink + bob - lift * 26, {
        rot: -lift * 10,
        opacity: show,
        ...arriveSq,
        ...tug,
        ...brake,
      }),
    )

    // Escada do avião / prancha do barco: encostam no chão e na soleira; saem antes da partida.
    const rampOut = 1 - seg(T, leave - 200, leave - 40)
    if (ride === 'aviao') {
      const st = stairs()
      rampA.draw(
        rampOut > 0 && T > ARRIVE ? st : null,
        on(st, rampFrom - (1 - rampOut) * 6, g, { opacity: rampOut * show }),
      )
    } else if (ride === 'barco') {
      // Da quina do píer até a amurada (2 px para dentro da borda do casco), por cima do barco.
      const dx = x + 2 - (pierEnd - 2)
      const dy = g - (top() + 34)
      const r = ramp(Math.max(2, Math.round(dx)), dy)
      plankTop.draw(rampOut > 0 && T > ARRIVE ? r : null, {
        x: pierEnd - 3,
        y: top() + 33 + bob,
        opacity: rampOut * show,
      })
      rampA.draw(null)
    } else rampA.draw(null)
    if (ride !== 'barco') plankTop.draw(null)

    // Efeitos da partida: fumacinha (Kombi), vapor (barco), traços de vento (trem e avião). Freio da rara: poeira.
    fx.forEach((s, i) => {
      if (rare && T > 1000 && T < 1300) {
        const k = seg(T, 1000 + i * 40, 1260)
        return s.draw(k > 0 && k < 1 ? puff(2) : null, {
          x: x + 4 + i * 12 - k * 6,
          y: g - 5 - k * 4,
          opacity: 1 - k,
        })
      }
      const k = seg(T, leave + i * 110, leave + i * 110 + 420)
      // O efeito some junto com a fonte: nada solto depois que o veículo saiu.
      if (k <= 0 || k >= 1 || x > W - 4) return s.draw(null)
      if (ride === 'trem' || ride === 'aviao')
        return s.draw(bar(4, 1, '#c9c3cf'), { x: x - 8 - k * 10, y: top() + 14 + i * 5, opacity: 1 - k })
      const sx = ride === 'barco' ? x + 37 : x - 4
      const sy = ride === 'barco' ? top() - 2 : g - 6
      s.draw(puff(i % 2 ? 2 : 3), { x: sx - k * 6, y: sy - k * 8, opacity: 1 - k })
    })

    // Os viajantes: andam de perfil, sobem (escada/prancha), viram de costas, passo em arco e somem dentro.
    ps.forEach((p, i) => {
      const a = walkers[i]!
      const cry = cries[i]!
      cry.draw(null)
      const s0 = rare ? 120 + i * 140 : start(i)
      const dc = doorCenter(x)
      const db = sill()
      const door = { x: x + geo.door.x, y: top() + geo.door.y + bob }
      const enterClip = (fx2: number, fy2: number) => ({
        x: door.x - fx2,
        y: door.y - fy2,
        w: geo.door.w,
        h: geo.door.h,
      })
      const back = frontArt(p, 'back')
      if (T < s0 || T >= boarded(i)) return a.draw(null)

      if (rare) {
        // Andando; o veículo sai (450 ms) e já andou uns 25 px quando eles percebem (650): susto de frente
        // com "!" por 150 ms; depois correm e pulam na porta.
        const walkTo = (tt: number) => -24 + (tt - s0) * 0.16
        if (T < 650) {
          const w = gait(p, T + i * 60, 'walk', 90)
          return a.draw(w, on(w, walkTo(T), walkY))
        }
        if (T < 800) {
          cry.draw(bang(), { x: walkTo(650) + 11, y: walkY - 40 })
          return a.draw(frontArt(p, 'oops'), on(frontArt(p, 'idle'), walkTo(650), walkY))
        }
        const runEnd = riderIn(i) - 260
        const target = doorCenter(restX) - 18 - (ride === 'aviao' ? 0 : 0)
        if (T < runEnd) {
          const fxp = Math.min(walkTo(650) + (T - 800) * 0.24, target - i * 26)
          const run = gait(p, T + i * 50, 'run', 75)
          return a.draw(run, on(run, fxp, walkY))
        }
        // Pulo para dentro: no máximo 6 px acima da soleira; some recortado pela porta.
        const k = seg(T, runEnd, riderIn(i) - 60)
        const from = Math.min(walkTo(650) + (runEnd - 800) * 0.24, target - i * 26)
        const pt = arc(k, from, walkY - 30, dc - 12, db - 29, Math.max(2, walkY - db) + 6 - (walkY - db))
        return a.draw(back, {
          x: pt.x,
          y: pt.y,
          clip: k > 0.6 ? enterClip(pt.x, pt.y) : undefined,
          opacity: 1 - seg(T, riderIn(i) - 120, riderIn(i)),
        })
      }

      const tA = climbStart[i]!
      const sx = stopX(x)
      // Quantos ainda esperam à frente: cada um fica uma mala atrás do outro.
      // Fila: quem ainda não sumiu na porta está à frente; cada um espera 26 px atrás do outro. Quando o
      // da frente some, quem espera dá os passos até o novo lugar (180 ms), sem pular.
      const aheadAt = (tt: number) => ps.filter((_, j) => j < i && boarded(j) > tt).length
      const freed = ps
        .map((_, j) => j)
        .filter((j) => j < i && boarded(j) <= T)
        .map((j) => boarded(j))
      const lastFree = freed.length ? Math.max(...freed) : -1e9
      const stepK = seg(T, lastFree, lastFree + 180)
      const spot = lerp(sx - 26 * aheadAt(lastFree - 1), sx - 26 * aheadAt(T), stepK)
      if (T < tA) {
        const wx = -24 + (T - s0) * speed
        if (wx < spot) {
          const w = gait(p, T + i * 60, 'walk', Math.round(18 / speed))
          return a.draw(w, on(w, wx, walkY))
        }
        const moving = stepK > 0 && stepK < 1
        const st = moving ? gait(p, T, 'walk', 90) : sideArt(p, 'stand')
        return a.draw(st, on(st, spot, walkY))
      }
      const climbTo = ride === 'barco' ? { x: x + 2 - 12, y: top() + 34 } : { x: dc - 18, y: db + 1 }
      if (T < tA + climb) {
        // Sobe a escada / a prancha, de perfil, até a soleira (no barco, até a amurada).
        const k = seg(T, tA, tA + climb)
        const w = gait(p, T, 'walk', 90)
        return a.draw(w, on(w, lerp(sx, climbTo.x, k), lerp(walkY, climbTo.y, k)))
      }
      if (T < tA + climb + deckWalk) {
        const k = seg(T, tA + climb, tA + climb + deckWalk)
        const w = gait(p, T, 'walk', 90)
        return a.draw(w, on(w, lerp(climbTo.x, dc - 18, k), db + 1))
      }
      const fy0 = (climb ? db + 1 : walkY) - 30
      const fx0 = climb ? dc - 18 : sx
      const t0 = tA + climb + deckWalk
      if (T < t0 + PAUSE) return a.draw(back, { x: fx0, y: fy0, ...(climb ? { sy: 0.93, sx: 1.04 } : {}) }) // abaixa antes de entrar
      // Passo em arco para dentro da porta; já dentro, recortado pela porta e escurecendo.
      const k = ease.out(seg(T, t0 + PAUSE, t0 + PAUSE + STEP))
      const pt = arc(k, fx0, fy0, dc - 12, db - 29, 3)
      a.draw(back, {
        x: pt.x,
        y: pt.y,
        clip: T >= t0 + PAUSE + STEP * 0.6 ? enterClip(pt.x, pt.y) : undefined,
        opacity: 1 - seg(T, t0 + PAUSE + STEP, boarded(i)),
      })
    })

    // Rara: o chapéu está na cabeça do primeiro desde a entrada; sobe 1 px (antecipação), voa e cai atrás.
    if (rare) {
      const walkTo0 = (tt: number) => -24 + (tt - 120) * 0.16
      const headX =
        (T < 800 ? walkTo0(Math.min(T, 650)) : walkTo0(650) + (Math.min(T, 1000) - 800) * 0.24) + 7
      if (T < 120) hat.draw(null)
      else if (T < 1000) hat.draw(strawHat(), { x: headX, y: walkY - 33 - (T >= 980 ? 1 : 0) })
      else {
        const x0 = walkTo0(650) + (1000 - 800) * 0.24 + 7
        const hk = seg(T, 1000, 1400)
        const pt = arc(hk, x0, walkY - 34, x0 - 22, g - 5, 8)
        hat.draw(strawHat(), { x: pt.x, y: pt.y, rot: hk < 1 ? hk * -300 : 0, opacity: show })
      }
    } else hat.draw(null)
  }
}

export const createdMoment: MomentDef<CreatedCtx> = {
  id: 'criada',
  variants: (c) => [rideFor(c.mode)],
  rare: 'esquecidos',
  duration: (v) => (v === 'esquecidos' ? DURATION_RARE : DURATION),
  figure: (r) => Math.min(40, Math.max(22, r.height * 0.55)),
  size: (r, s) => ({ w: Math.round(r.width / s), h: Math.round(r.height / s) }),
  place: 'inside',
  build: (stage, variant, ctx) => build(stage, variant, ctx),
}
