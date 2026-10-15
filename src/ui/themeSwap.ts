// A troca de Dia/Noite com graça (retorno do staging): ao tocar no botão, uma lanterna de papel ou
// uma lâmpada desce pendurada num fio logo abaixo dele; o bonequinho dos viajantes desce junto, sopra a
// lanterna (ou desenrosca a lâmpada) e o tema troca nesse momento. Depois de um instante, ele sobe
// puxando o fio e leva a lanterna/lâmpada embora. Nada fica na tela entre uma troca e outra.
//
// Regras: a camada nunca recebe toque (pointer-events: none); a linha do tempo é feita com setTimeout
// (as animações do navegador param em abas em segundo plano, o relógio não), então `done` sempre chega;
// o botão fica travado até lá (sem duas animações por cima uma da outra).

export type SwapKind = 'lantern' | 'bulb'

/** Momentos da animação (ms). */
export const SWAP = { drop: 360, act: 460, hold: 1000, end: 1500 } as const

const SVGNS = 'http://www.w3.org/2000/svg'

/** O bonequinho dos viajantes, 12 × 16 pixels. */
const SPRITE = [
  '....KKKK....',
  '...KHHHHK...',
  '..KHHHHHHK..',
  '..KSSSSSSK..',
  '..KSKSSKSK..',
  '..KSSSSSSK..',
  '...KSSSSK...',
  '..KRRRRRRK..',
  '.KRRRRRRRRK.',
  '.KSRRRRRRSK.',
  '.KSRRRRRRSK.',
  '..KBBBBBBK..',
  '..KBBKKBBK..',
  '..KBBKKBBK..',
  '..KKK..KKK..',
]
const COLORS: Record<string, string> = {
  K: '#241a28',
  H: '#3a2c3a',
  S: '#f2c9a8',
  R: '#c4313a',
  B: '#2b3f6b',
}

function spriteSvg(): SVGSVGElement {
  const s = document.createElementNS(SVGNS, 'svg')
  s.setAttribute('width', '26')
  s.setAttribute('height', '35')
  s.setAttribute('viewBox', '0 0 12 15')
  s.setAttribute('shape-rendering', 'crispEdges')
  SPRITE.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === '.') return
      const r = document.createElementNS(SVGNS, 'rect')
      r.setAttribute('x', String(x))
      r.setAttribute('y', String(y))
      r.setAttribute('width', '1')
      r.setAttribute('height', '1')
      r.setAttribute('fill', COLORS[c]!)
      s.appendChild(r)
    }),
  )
  return s
}

const LANTERN = `
  <g class="prop">
    <ellipse class="glow" cx="23" cy="26" rx="26" ry="28" fill="#f2c14e"/>
    <rect x="15" y="0" width="16" height="5" fill="#241a28"/>
    <ellipse class="paper" cx="23" cy="26" rx="15" ry="21" fill="#e9573f" stroke="#241a28" stroke-width="2"/>
    <path d="M9 18 H37 M8 26 H38 M9 34 H37" stroke="#241a28" stroke-width="1.2" opacity=".6"/>
    <text x="23" y="31" font-size="12" text-anchor="middle" fill="#fff" font-family="'Shippori Mincho B1', serif">旅</text>
    <rect x="15" y="47" width="16" height="5" fill="#241a28"/>
  </g>`

const BULB = `
  <g class="prop">
    <circle class="glow" cx="23" cy="24" r="17" fill="#f2c14e"/>
    <g class="screw">
      <rect x="17" y="0" width="12" height="10" rx="2" fill="#9a95a3" stroke="#241a28" stroke-width="1.5"/>
      <path d="M17 3 H29 M17 6 H29" stroke="#241a28" stroke-width="1"/>
      <circle class="paper" cx="23" cy="24" r="13" fill="#ffe7a3" stroke="#241a28" stroke-width="1.5"/>
      <path d="M19 24 q2 -5 4 0 q2 5 4 0" stroke="#c98a1a" stroke-width="1.4" fill="none"/>
    </g>
  </g>`

/** Dá para animar? (sem animações no navegador ou com "reduzir movimento", troca sem animação) */
export function canAnimate(): boolean {
  if (typeof window === 'undefined' || typeof Element === 'undefined') return false
  if (typeof Element.prototype.animate !== 'function') return false
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

const anim = (el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) => {
  try {
    el.animate(frames, opts)
  } catch {
    // efeito visual: nunca impede a troca
  }
}

/**
 * Toca a troca de tema ancorada no botão. `flip` troca o tema no momento da ação; `done` chega no fim
 * (sempre, pelo relógio). Devolve uma função que encerra tudo na hora.
 */
export function playThemeSwap(
  anchor: HTMLElement,
  toDark: boolean,
  flip: () => void,
  done: () => void,
  kind: SwapKind = Math.random() < 0.5 ? 'lantern' : 'bulb',
): () => void {
  const r = anchor.getBoundingClientRect()
  const layer = document.createElement('div')
  layer.className = `theme-swap ${kind}`
  layer.setAttribute('aria-hidden', 'true')
  layer.style.left = `${Math.round(r.left + r.width / 2 - 40)}px`
  layer.style.top = `${Math.round(r.bottom)}px`

  const rope = document.createElement('div')
  rope.className = 'swap-rope'
  const prop = document.createElementNS(SVGNS, 'svg')
  prop.setAttribute('class', 'swap-prop')
  prop.setAttribute('width', '46')
  prop.setAttribute('height', '56')
  prop.setAttribute('viewBox', '0 -2 46 58')
  prop.innerHTML = kind === 'lantern' ? LANTERN : BULB
  const guy = spriteSvg()
  guy.setAttribute('class', 'swap-guy')
  layer.append(rope, prop, guy)

  const wipe = document.createElement('div')
  wipe.className = 'theme-swap-wipe'
  wipe.setAttribute('aria-hidden', 'true')
  document.body.append(wipe, layer)

  const glow = prop.querySelector('.glow')
  const paper = prop.querySelector('.paper')
  const screw = prop.querySelector('.screw')
  // Antes da ação: a lanterna/lâmpada acesa (indo para a noite) ou apagada (indo para o dia).
  glow?.setAttribute('opacity', toDark ? '0.35' : '0')
  if (!toDark) paper?.setAttribute('fill', kind === 'lantern' ? '#7a3a3a' : '#c9c3cf')

  const DROP = 96 // quanto o fio desce, em px
  const ease = 'cubic-bezier(.3,.7,.3,1)'
  anim(rope, [{ height: '0px' }, { height: `${DROP}px` }], {
    duration: SWAP.drop,
    easing: ease,
    fill: 'forwards',
  })
  anim(
    prop,
    [
      { transform: 'translateY(-60px)', opacity: 0 },
      { transform: `translateY(${DROP - 4}px)`, opacity: 1 },
    ],
    {
      duration: SWAP.drop,
      easing: ease,
      fill: 'forwards',
    },
  )
  anim(
    guy,
    [
      { transform: 'translateY(-40px)', opacity: 0 },
      { transform: `translateY(${DROP - 26}px)`, opacity: 1 },
    ],
    {
      duration: SWAP.drop,
      easing: ease,
      fill: 'forwards',
    },
  )

  const timers: number[] = []
  let flipped = false
  const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms))

  // A ação: soprar a lanterna (noite) ou acendê-la (dia); girar a lâmpada meia volta.
  at(SWAP.drop - 40, () => {
    anim(
      guy,
      [
        { transform: `translateY(${DROP - 26}px)` },
        { transform: `translateY(${DROP - 28}px) scaleX(1.12)` },
        { transform: `translateY(${DROP - 26}px)` },
      ],
      {
        duration: 260,
        fill: 'forwards',
      },
    )
    if (kind === 'bulb' && screw)
      anim(
        screw,
        [
          { transform: 'rotate(0deg)' },
          { transform: `rotate(${toDark ? -180 : 180}deg)` },
          { transform: 'rotate(0deg)' },
        ],
        {
          duration: 320,
          easing: 'ease-in-out',
        },
      )
    if (kind === 'lantern')
      for (let i = 0; i < 6; i++) {
        const puff = document.createElement('i')
        puff.className = 'swap-puff'
        puff.style.background = toDark ? '#dfe6ee' : '#f2c14e'
        puff.style.top = `${DROP + 8 + (i % 3) * 6}px`
        layer.appendChild(puff)
        anim(
          puff,
          [
            { transform: 'translate(0,0)', opacity: 1 },
            { transform: `translate(${12 + i * 4}px, ${(i - 3) * 4}px)`, opacity: 0 },
          ],
          {
            duration: 320,
            easing: 'ease-out',
            fill: 'forwards',
          },
        )
      }
  })
  at(SWAP.act, () => {
    if (glow)
      anim(glow, [{ opacity: toDark ? 0.35 : 0 }, { opacity: toDark ? 0 : 0.4 }], {
        duration: 220,
        fill: 'forwards',
      })
    paper?.setAttribute(
      'fill',
      toDark ? (kind === 'lantern' ? '#7a3a3a' : '#c9c3cf') : kind === 'lantern' ? '#e9573f' : '#ffe7a3',
    )
    anim(prop, [{ rotate: '0deg' }, { rotate: '7deg' }, { rotate: '-4deg' }, { rotate: '0deg' }], {
      duration: 420,
    })
    // A noite cai de cima para baixo; o dia sobe.
    wipe.style.background = toDark ? '#13111d' : '#f6edeb'
    anim(
      wipe,
      [
        { opacity: 0.8, clipPath: toDark ? 'inset(0 0 100% 0)' : 'inset(100% 0 0 0)' },
        { opacity: 0.8, clipPath: 'inset(0 0 0 0)', offset: 0.6 },
        { opacity: 0, clipPath: 'inset(0 0 0 0)' },
      ],
      { duration: 420, easing: 'ease-in', fill: 'forwards' },
    )
    flipped = true
    flip()
  })
  // A saída: o bonequinho sobe puxando o fio e leva a lanterna/lâmpada.
  at(SWAP.hold, () => {
    const up = SWAP.end - SWAP.hold
    anim(rope, [{ height: `${DROP}px` }, { height: '0px' }], {
      duration: up,
      easing: 'ease-in',
      fill: 'forwards',
    })
    anim(
      prop,
      [
        { transform: `translateY(${DROP - 4}px)`, opacity: 1 },
        { transform: 'translateY(-50px)', opacity: 0 },
      ],
      {
        duration: up,
        easing: 'ease-in',
        fill: 'forwards',
      },
    )
    anim(
      guy,
      [
        { transform: `translateY(${DROP - 26}px)`, opacity: 1 },
        { transform: 'translateY(-60px)', opacity: 0 },
      ],
      {
        duration: up - 60,
        easing: 'ease-in',
        fill: 'forwards',
      },
    )
  })
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    timers.forEach((t) => clearTimeout(t))
    layer.remove()
    wipe.remove()
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
