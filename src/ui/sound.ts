// Sons de 8 bits da v1. Desligados por padrão; só tocam depois de um toque de quem usa.

let ctx: AudioContext | null = null
let enabled = false

export const setSound = (on: boolean) => {
  enabled = on
}

function tone(seq: [number, number][], type: OscillatorType = 'square', vol = 0.05) {
  if (!enabled) return
  try {
    ctx = ctx ?? new AudioContext()
    let t = ctx.currentTime
    for (const [f, d] of seq) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = type
      o.frequency.value = f
      g.gain.setValueAtTime(vol, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + d)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + d)
      t += d * 0.9
    }
  } catch {
    /* sem áudio: segue em silêncio */
  }
}

export const sfx = {
  coin: () =>
    tone([
      [988, 0.08],
      [1319, 0.22],
    ]),
  stamp: () => tone([[110, 0.12]], 'triangle', 0.12),
  pop: () => tone([[880, 0.06]], 'triangle', 0.06),
  enter: () => tone([[392, 0.06], [523, 0.08], [784, 0.14]]),
  step: () => tone([[660, 0.04]], 'triangle', 0.05),
  level: () =>
    tone([
      [523, 0.1],
      [659, 0.1],
      [784, 0.1],
      [1047, 0.12],
      [784, 0.08],
      [1047, 0.3],
    ]),
  puf: () =>
    tone(
      [
        [220, 0.05],
        [165, 0.08],
      ],
      'sawtooth',
      0.03,
    ),
}
