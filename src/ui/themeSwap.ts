// A troca de Dia/Noite com graça (v2, aprovada no protótipo): ao tocar no botão, uma corda desce
// inteira logo abaixo dele com uma lanterna de papel ou uma lâmpada (sorteadas), que balança e para. Um
// dos viajantes desce pela corda mão por mão, sopra a lanterna (ou risca um fósforo), ou dá duas
// voltinhas na lâmpada, e a página escurece como um pôr do sol, ou clareia como um nascer do sol
// (daylight.ts). Ele pisca ou comemora, sobe, e a corda sobe levando tudo. Nada fica na tela depois.
//
// Regras: a camada nunca recebe toque (pointer-events: none); a linha do tempo é feita com setTimeout
// (as animações do navegador param em abas em segundo plano, o relógio não), então `done` sempre chega;
// o botão fica travado até lá (sem duas animações por cima uma da outra).

import { FADE, startDaylight } from './daylight'
import { CAST, H, W, sprite, toSvgRects, type Person, type PoseName } from './stage/cast'

export type SwapKind = 'lantern' | 'bulb'

/** Linha do tempo (ms). A luz da página começa em `light` e leva `FADE`; o fim é quando ela acaba. */
export const SWAP = {
  rope: [0, 600], // a corda desce
  sway: [450, 1300], // o objeto balança e para
  down: [700, 1450], // o bonequinho desce, mão por mão
  act: [1450, 1950], // a ação
  light: 1650, // começa o pôr/nascer do sol (o tema troca aqui)
  react: [1950, 2350], // pisca para a pessoa (ou comemora)
  up: [2350, 3050], // sobe pela corda
  ropeUp: [3050, 3700], // a corda sobe levando tudo
  end: 1650 + FADE, // fim da luz: o botão volta
} as const

const SVGNS = 'http://www.w3.org/2000/svg'
const ROPE = 180 // comprimento da corda (px)
const PROP_Y = ROPE - 2
const ON_ROPE_Y = ROPE - 66 // onde o bonequinho para, ao lado do objeto
const RIG_W = 110

const LANTERN = `
  <ellipse class="glow" cx="23" cy="26" rx="27" ry="29" fill="#ffc94a" opacity="0"/>
  <rect x="15" y="0" width="16" height="5" fill="#241a28"/>
  <ellipse class="paper" cx="23" cy="26" rx="15" ry="21" fill="#7a3a3a" stroke="#241a28" stroke-width="2"/>
  <ellipse class="flame" cx="23" cy="30" rx="4" ry="7" fill="#ffd23f" opacity="0"/>
  <path d="M9 18 H37 M8 26 H38 M9 34 H37" stroke="#241a28" stroke-width="1.2" opacity=".55"/>
  <text x="23" y="31" font-size="12" text-anchor="middle" fill="#fff" font-family="'Shippori Mincho B1', serif">旅</text>
  <rect x="15" y="47" width="16" height="5" fill="#241a28"/>`

const BULB = `
  <circle class="glow" cx="23" cy="25" r="20" fill="#ffd96b" opacity="0"/>
  <g class="screw">
    <rect x="17" y="0" width="12" height="10" rx="2" fill="#9a95a3" stroke="#241a28" stroke-width="1.5"/>
    <path d="M17 3 H29 M17 6 H29" stroke="#241a28" stroke-width="1"/>
    <circle class="paper" cx="23" cy="24" r="13" fill="#c9c3cf" stroke="#241a28" stroke-width="1.5"/>
    <path d="M19 24 q2 -5 4 0 q2 5 4 0" stroke="#c98a1a" stroke-width="1.4" fill="none"/>
  </g>`

/** Dá para animar? (sem animações no navegador ou com "reduzir movimento", troca sem animação) */
export function canAnimate(): boolean {
  if (typeof window === 'undefined' || typeof Element === 'undefined') return false
  if (typeof Element.prototype.animate !== 'function') return false
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

const A = (el: Element | null, frames: Keyframe[], duration: number, opts: KeyframeAnimationOptions = {}) => {
  if (!el) return
  try {
    el.animate(frames, { duration, fill: 'forwards', ...opts })
  } catch {
    // efeito visual: nunca impede a troca
  }
}

function svg(w: number, h: number, viewBox: string, html: string, cls: string): SVGSVGElement {
  const s = document.createElementNS(SVGNS, 'svg')
  s.setAttribute('width', String(w))
  s.setAttribute('height', String(h))
  s.setAttribute('viewBox', viewBox)
  s.setAttribute('class', cls)
  s.innerHTML = html
  return s
}

/**
 * Toca a troca de tema ancorada no botão. `flip` troca o tema no começo do pôr/nascer do sol; `done`
 * chega no fim (sempre, pelo relógio). `person` é quem desce a corda (de preferência um dos viajantes da
 * viagem). Devolve uma função que encerra tudo na hora.
 */
export function playThemeSwap(
  anchor: HTMLElement,
  toDark: boolean,
  flip: () => void,
  done: () => void,
  kind: SwapKind = Math.random() < 0.5 ? 'lantern' : 'bulb',
  person: Person = CAST[Math.floor(Math.random() * CAST.length)]!,
): () => void {
  const r = anchor.getBoundingClientRect()
  const layer = document.createElement('div')
  layer.className = `theme-swap ${kind}`
  layer.setAttribute('aria-hidden', 'true')
  const vw = window.innerWidth || RIG_W
  layer.style.left = `${Math.round(Math.min(Math.max(r.left + r.width / 2 - RIG_W / 2, 0), vw - RIG_W))}px`
  layer.style.top = `${Math.round(r.bottom)}px`

  const rope = document.createElement('div')
  rope.className = 'swap-rope'
  const prop = svg(60, 72, '0 -2 46 56', kind === 'lantern' ? LANTERN : BULB, 'swap-prop')
  const frameHtml = (pose: PoseName) => toSvgRects(sprite(person, pose))
  const guy = svg(W * 2, (H + 1) * 2, `0 -1 ${W} ${H + 1}`, frameHtml('climbA'), 'swap-guy')
  guy.setAttribute('shape-rendering', 'crispEdges')
  guy.style.opacity = '0'
  layer.append(rope, prop, guy)
  document.body.appendChild(layer)
  const frame = (pose: PoseName) => {
    guy.innerHTML = frameHtml(pose)
  }

  const glow = prop.querySelector('.glow')
  const paper = prop.querySelector('.paper')
  const flame = prop.querySelector('.flame')
  const screw = prop.querySelector('.screw')
  // Antes da ação: aceso (indo para a noite) ou apagado (indo para o dia).
  const LIT = kind === 'lantern' ? '#e9573f' : '#ffe7a3'
  const OFF = kind === 'lantern' ? '#7a3a3a' : '#c9c3cf'
  paper?.setAttribute('fill', toDark ? LIT : OFF)
  glow?.setAttribute('opacity', toDark ? '0.45' : '0')
  flame?.setAttribute('opacity', toDark ? '1' : '0')
  if (toDark)
    A(
      flame,
      [{ transform: 'scale(1,1)' }, { transform: 'scale(.85,1.12)' }, { transform: 'scale(1,1)' }],
      260,
      {
        iterations: 6,
        fill: 'none',
        easing: 'ease-in-out',
      },
    )

  const timers: number[] = []
  const at = (ms: number, fn: () => void) => void timers.push(window.setTimeout(fn, ms))

  // 1. A corda desce inteira (desacelerando, com um quique leve).
  const drop = 'cubic-bezier(.22,.7,.3,1)'
  A(
    rope,
    [{ height: '0px' }, { height: `${ROPE + 6}px`, offset: 0.82 }, { height: `${ROPE}px` }],
    SWAP.rope[1],
    {
      easing: drop,
    },
  )
  A(
    prop,
    [
      { transform: 'translateY(-56px)' },
      { transform: `translateY(${PROP_Y + 6}px)`, offset: 0.82 },
      { transform: `translateY(${PROP_Y}px)` },
    ],
    SWAP.rope[1],
    { easing: drop },
  )
  // 2. Balança como um pêndulo e para.
  at(SWAP.sway[0], () =>
    A(
      prop,
      [0, 9, -6, 3, -1, 0].map((deg) => ({ transform: `translateY(${PROP_Y}px) rotate(${deg}deg)` })),
      SWAP.sway[1] - SWAP.sway[0],
      { easing: 'ease-out' },
    ),
  )

  // 3. O bonequinho desce pela corda de costas, mão por mão (5 pegadas), e vira de frente no fim.
  const climb = 'cubic-bezier(.3,.6,.3,1)'
  at(SWAP.down[0], () => {
    guy.style.opacity = '1'
    const steps = 5
    const each = (SWAP.down[1] - SWAP.down[0]) / steps
    for (let i = 0; i <= steps; i++)
      at(i * each, () => {
        frame(i === steps ? 'idle' : i % 2 ? 'climbB' : 'climbA')
        A(guy, [{ transform: `translateY(${-34 + ((ON_ROPE_Y + 34) * i) / steps}px)` }], each * 0.7, {
          easing: climb,
        })
      })
  })

  // 4. A ação.
  const still = `translateY(${ON_ROPE_Y}px)`
  at(SWAP.act[0], () => {
    if (kind === 'lantern' && toDark) {
      // Inspira, enche as bochechas e sopra: a chama tremula, encolhe e apaga.
      frame('inhale')
      A(guy, [{ transform: `${still} scale(1)` }, { transform: `${still} scale(1.08)` }], 200, {
        easing: 'ease-in',
      })
      at(200, () => {
        frame('blow')
        A(
          guy,
          [
            { transform: `${still} scale(1.08)` },
            { transform: `translateY(${ON_ROPE_Y + 2}px) scale(.97) rotate(6deg)` },
          ],
          160,
        )
        for (let wave = 0; wave < 2; wave++)
          for (let i = 0; i < 4; i++)
            at(wave * 140 + i * 30, () => {
              const d = document.createElement('i')
              d.className = 'swap-puff'
              const s = 4 + (i % 2) * 2
              d.style.width = d.style.height = `${s}px`
              d.style.top = `${ON_ROPE_Y + 26}px`
              layer.appendChild(d)
              A(
                d,
                [
                  { transform: 'translate(0,0)', opacity: 0.95 },
                  { transform: `translate(${-4 - i * 3}px, ${30 + i * 6}px) scale(1.6)`, opacity: 0 },
                ],
                420,
                { easing: 'ease-out' },
              )
            })
        A(
          flame,
          [
            { opacity: 1, transform: 'scale(1)' },
            { opacity: 1, transform: 'scale(1.2,.7) skewX(-12deg)', offset: 0.35 },
            { opacity: 0.6, transform: 'scale(.6)', offset: 0.7 },
            { opacity: 0, transform: 'scale(.2)' },
          ],
          360,
        )
        A(glow, [{ opacity: 0.45 }, { opacity: 0 }], 380)
        at(220, () => paper?.setAttribute('fill', OFF))
      })
    } else if (kind === 'lantern') {
      // Risca um fósforo: faísca, e a chama cresce devagar.
      frame('reach')
      at(120, () => {
        const sp = document.createElement('i')
        sp.className = 'swap-spark'
        sp.style.top = `${ON_ROPE_Y + 52}px`
        layer.appendChild(sp)
        A(
          sp,
          [
            { opacity: 0, transform: 'rotate(45deg) scale(.4)' },
            { opacity: 1, transform: 'rotate(45deg) scale(1.4)', offset: 0.3 },
            { opacity: 0, transform: 'rotate(90deg) scale(.6)' },
          ],
          300,
        )
        at(160, () => {
          flame?.setAttribute('opacity', '1')
          A(
            flame,
            [
              { transform: 'scale(.1)' },
              { transform: 'scale(1.25)', offset: 0.6 },
              { transform: 'scale(1)' },
            ],
            380,
            {
              easing: 'ease-out',
            },
          )
          A(glow, [{ opacity: 0 }, { opacity: 0.45 }], 420)
          paper?.setAttribute('fill', LIT)
        })
      })
    } else {
      // Lâmpada: duas voltinhas; ela pisca e apaga (ou acende com o brilho crescendo).
      frame('reach')
      for (let i = 0; i < 2; i++)
        at(i * 170, () => {
          A(
            screw,
            [
              { transform: 'rotate(0deg)' },
              { transform: `rotate(${toDark ? -28 : 28}deg)` },
              { transform: 'rotate(0deg)' },
            ],
            160,
            {
              easing: 'ease-in-out',
              fill: 'none',
            },
          )
          frame(i % 2 ? 'reach' : 'idle')
        })
      at(340, () => {
        frame('reach')
        if (toDark) {
          A(
            glow,
            [{ opacity: 0.45 }, { opacity: 0.1 }, { opacity: 0.45 }, { opacity: 0.05 }, { opacity: 0 }],
            260,
          )
          at(180, () => paper?.setAttribute('fill', OFF))
        } else {
          paper?.setAttribute('fill', LIT)
          A(glow, [{ opacity: 0 }, { opacity: 0.3 }, { opacity: 0.05 }, { opacity: 0.5 }], 300)
        }
      })
    }
  })

  // 5. A luz da página: o tema troca aqui, deslizando como um pôr/nascer do sol.
  let flipped = false
  let endLight: (() => void) | null = null
  at(SWAP.light, () => {
    flipped = true
    endLight = startDaylight(toDark, flip)
  })

  // 6. Pisca para a pessoa (de dia, um pulinho de alegria e um aceno).
  at(SWAP.react[0], () => {
    frame(toDark ? 'blink' : 'cheer')
    if (!toDark) at(160, () => frame('wave'))
    A(
      guy,
      [
        { transform: still },
        { transform: `translateY(${ON_ROPE_Y - (toDark ? 0 : 6)}px)` },
        { transform: still },
      ],
      300,
      {
        easing: 'ease-out',
      },
    )
    at(toDark ? 180 : 340, () => frame(toDark ? 'wave' : 'idle'))
  })

  // 7. Sobe pela corda.
  at(SWAP.up[0], () => {
    const steps = 5
    const each = (SWAP.up[1] - SWAP.up[0]) / steps
    for (let i = 1; i <= steps; i++)
      at((i - 1) * each, () => {
        frame(i % 2 ? 'climbB' : 'climbA')
        A(
          guy,
          [
            {
              transform: `translateY(${ON_ROPE_Y - ((ON_ROPE_Y + 40) * i) / steps}px)`,
              opacity: i === steps ? 0 : 1,
            },
          ],
          each * 0.7,
          {
            easing: climb,
          },
        )
      })
  })

  // 8. A corda sobe e leva tudo.
  at(SWAP.ropeUp[0], () => {
    const ms = SWAP.ropeUp[1] - SWAP.ropeUp[0]
    const pull = 'cubic-bezier(.5,0,.75,0)'
    A(rope, [{ height: `${ROPE}px` }, { height: '0px' }], ms, { easing: pull })
    A(
      prop,
      [
        { transform: `translateY(${PROP_Y}px) rotate(0deg)`, opacity: 1 },
        { transform: `translateY(${PROP_Y * 0.55}px) rotate(-5deg)`, opacity: 1, offset: 0.45 },
        { transform: 'translateY(-50px) rotate(3deg)', opacity: 0 },
      ],
      ms,
      { easing: pull },
    )
  })
  // A corda já subiu: a camada sai antes da luz acabar.
  at(SWAP.ropeUp[1] + 40, () => layer.remove())

  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    timers.forEach((t) => clearTimeout(t))
    layer.remove()
    endLight?.()
    done()
  }
  at(SWAP.end + 40, finish)
  return () => {
    // Encerrado antes da hora (a tela saiu): o tema ainda troca, e o botão volta.
    if (finished) return
    if (!flipped) {
      flipped = true
      flip()
    }
    finish()
  }
}
