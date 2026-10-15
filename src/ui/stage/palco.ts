// O Palco (docs/animacoes.md): toca os momentos de diversão com um contrato só.
//
// - A cena é uma função do tempo: `render(t)` desenha o instante t (ms) sem depender do anterior, então dá
//   para congelar qualquer quadro (o avaliador e os testes usam isso) e o fim nunca depende do navegador
//   pintar: um relógio (setTimeout) encerra e limpa, mesmo com a aba em segundo plano.
// - A camada nunca recebe toque e nasce colada ao elemento que motivou o momento; a escala vem dele
//   (`fitScale`), com 1 pixel de arte = um número inteiro de pixels da tela.
// - Variações: sorteio sem repetir a última, com uma rara (~1 em 12); da 3ª repetição em 1 minuto em
//   diante, ou com "Animações: discretas", só um brilho; com "reduzir movimento", nada.

import { toSvgRects, type Art } from './art'
import { sparkle } from './props'
import { track } from '../../app/telemetry'

// ---------------------------------------------------------------------------
// Preferências e escala
// ---------------------------------------------------------------------------

export type AnimMode = 'full' | 'discreet'
const MODE_KEY = 'ludotrip.anim'

export function animMode(): AnimMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'discreet' ? 'discreet' : 'full'
  } catch {
    return 'full'
  }
}

export function setAnimMode(m: AnimMode) {
  try {
    if (m === 'full') localStorage.removeItem(MODE_KEY)
    else localStorage.setItem(MODE_KEY, m)
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

export const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Pixels de tela (CSS) por pixel de arte para que uma figura de `units` pixels de arte tenha mais ou menos
 * `cssHeight` px, com cada pixel de arte ocupando um número inteiro de pixels do aparelho (nada borrado).
 */
export function fitScale(cssHeight: number, units = 30): number {
  const dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1
  const dev = Math.max(1, Math.round((cssHeight / units) * dpr))
  return dev / dpr
}

// ---------------------------------------------------------------------------
// Atores
// ---------------------------------------------------------------------------

const SVGNS = 'http://www.w3.org/2000/svg'

export interface Pose {
  /** Posição do canto de cima à esquerda, em pixels de arte do palco. */
  x: number
  y: number
  flip?: boolean
  /** Graus (objetos girando; personagens de pé não giram). */
  rot?: number
  /** Amassar/esticar (1 = normal), a partir da base. */
  sx?: number
  sy?: number
  opacity?: number
  /** Mostra só a fração da esquerda (0–1): o futon desenrolando. */
  reveal?: number
  /** Mostra só este retângulo da arte (pixels de arte): quem entra pela porta some dentro dela. */
  clip?: { x: number; y: number; w: number; h: number }
}

export interface Actor {
  readonly el: SVGSVGElement
  /** Último lugar desenhado (para testes de enquadramento). */
  readonly box: { x: number; y: number; w: number; h: number; visible: boolean }
  /** Desenha a arte na pose; `null` esconde. */
  draw(art: Art | null, pose?: Pose): void
}

export interface Stage {
  /** Tamanho do palco em pixels de arte. */
  w: number
  h: number
  /** Pixels de tela por pixel de arte. */
  s: number
  el: HTMLElement
  actors: Actor[]
  /** Cria um ator (ordem de criação = ordem de desenho, salvo `z`). */
  actor(z?: number): Actor
  /** O fundo atrás do palco é escuro (a cena pode acender uma luz no ator). */
  dark: boolean
  /** Uma luz circular (atrás dos atores), centrada em (x, y), com raio r (pixels de arte). */
  light(): { set(x: number, y: number, r: number, opacity?: number): void }
  /** Um balão de fala em HTML (fonte pixel), centrado em (x, y). */
  say(): { el: HTMLElement; show(text: string | null, x?: number, y?: number, opacity?: number): void }
}

function makeActor(stage: Stage, z = 0): Actor {
  const el = document.createElementNS(SVGNS, 'svg')
  el.setAttribute('shape-rendering', 'crispEdges')
  el.setAttribute('aria-hidden', 'true')
  el.style.position = 'absolute'
  el.style.left = '0'
  el.style.top = '0'
  el.style.overflow = 'visible'
  el.style.zIndex = String(z)
  el.style.display = 'none'
  stage.el.appendChild(el)
  let current: Art | null = null
  const box = { x: 0, y: 0, w: 0, h: 0, visible: false }
  return {
    el,
    box,
    draw(art, pose) {
      if (!art || !pose || pose.opacity === 0) {
        el.style.display = 'none'
        box.visible = false
        return
      }
      if (art !== current) {
        el.innerHTML = toSvgRects(art.runs)
        el.setAttribute('viewBox', `0 0 ${art.w} ${art.h}`)
        el.setAttribute('width', String(art.w * stage.s))
        el.setAttribute('height', String(art.h * stage.s))
        current = art
      }
      const s = stage.s
      const x = Math.round(pose.x)
      const y = Math.round(pose.y)
      const parts = [`translate(${x * s}px, ${y * s}px)`]
      const sx = (pose.flip ? -1 : 1) * (pose.sx ?? 1)
      const sy = pose.sy ?? 1
      if (pose.rot) parts.push(`rotate(${pose.rot}deg)`)
      if (sx !== 1 || sy !== 1) parts.push(`scale(${sx}, ${sy})`)
      el.style.transformOrigin = `${(art.w * s) / 2}px ${art.h * s}px`
      el.style.transform = parts.join(' ')
      el.style.opacity = String(pose.opacity ?? 1)
      const c = pose.clip
      el.style.clipPath = c
        ? `inset(${c.y * s}px ${(art.w - c.x - c.w) * s}px ${(art.h - c.y - c.h) * s}px ${c.x * s}px)`
        : pose.reveal !== undefined && pose.reveal < 1
          ? `inset(0 ${(1 - pose.reveal) * 100}% 0 0)`
          : ''
      el.style.display = ''
      Object.assign(box, { x, y, w: art.w, h: art.h, visible: true })
    },
  }
}

// ---------------------------------------------------------------------------
// Momentos
// ---------------------------------------------------------------------------

export type Place =
  /** Em pé sobre o elemento (o topo dele é o chão). */
  | 'on'
  /** Logo abaixo do elemento (pendurado, como no Dia/Noite). */
  | 'below'
  /** Dentro do elemento (ocupa a largura dele; o fundo dele é o chão). */
  | 'inside'
  /** Exatamente sobre a caixa do elemento (a versão mínima, e cenas que usam uma faixa da tela). */
  | 'over'

export interface MomentDef<Ctx> {
  id: string
  /** Variações que cabem neste contexto (ao menos uma). */
  variants(ctx: Ctx): string[]
  rare: string
  duration(variant: string): number
  /** Altura de uma figura do elenco (30 px de arte), em px de tela, a partir do elemento. */
  figure(anchor: DOMRect): number
  /** Tamanho do palco em pixels de arte (pode depender do elemento e da escala). */
  size(anchor: DOMRect, s: number): { w: number; h: number }
  place: Place
  /** Recorta a cena na caixa do palco (quem entra pela borda aparece só ao entrar). */
  clip?: boolean
  /** Mede o vão livre acima do elemento e encolhe a cena para não cobrir texto (sem vão: versão mínima). */
  fitGap?: boolean
  /** A cena acende a própria luz (`stage.light`), presa ao ator; sem a luz de palco automática. */
  ownLight?: boolean
  /** Monta a cena e devolve o desenho de cada instante. */
  build(stage: Stage, variant: string, ctx: Ctx, rng: () => number): (t: number) => void
}

/** Um momento em andamento. */
export interface Run {
  id: string
  variant: string
  minimal: boolean
  stage: Stage
  duration: number
  render(t: number): void
  stop(): void
}

const rectOf = (a: Element | DOMRect): DOMRect => (a instanceof Element ? a.getBoundingClientRect() : a)

const active = new Set<Run>()
const lastVariant = new Map<string, string>()
const history = new Map<string, number[]>()
const forced = new Map<string, string>()
let frozen: number | null = null

/** Gerador pseudoaleatório com semente (a cena é a mesma a cada quadro). */
export function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Escolhe a variação: a rara ~1 em 12, nunca a mesma duas vezes seguidas (quando há outra). */
export function pick(id: string, options: string[], rare: string, rnd: () => number = Math.random): string {
  const f = forced.get(id)
  if (f) return f
  const last = lastVariant.get(id)
  const pool = options.length > 1 ? options.filter((v) => v !== last) : options
  const v = rnd() < 1 / 12 && last !== rare ? rare : pool[Math.floor(rnd() * pool.length)]!
  lastVariant.set(id, v)
  return v
}

/** Quantas vezes o momento tocou no último minuto (para o teto de frequência). */
function recent(id: string, now: number): number {
  const list = (history.get(id) ?? []).filter((t) => now - t < 60_000)
  list.push(now)
  history.set(id, list)
  return list.length
}

function mount(anchor: Element | DOMRect, place: Place, w: number, h: number, s: number): HTMLElement {
  const r = rectOf(anchor)
  const el = document.createElement('div')
  el.className = 'palco'
  el.setAttribute('aria-hidden', 'true')
  const cw = w * s
  const ch = h * s
  if (place === 'inside' && anchor instanceof Element) {
    el.style.position = 'absolute'
    el.style.left = '0'
    el.style.bottom = '0'
    el.style.width = `${cw}px`
    el.style.height = `${ch}px`
    if (getComputedStyle(anchor).position === 'static') (anchor as HTMLElement).style.position = 'relative'
    anchor.appendChild(el)
    return el
  }
  const vw = innerWidth || cw
  const vh = innerHeight || ch
  const left = Math.min(Math.max(r.left + r.width / 2 - cw / 2, 4), Math.max(4, vw - cw - 4))
  if (place === 'over') {
    el.style.position = 'fixed'
    el.style.left = `${Math.round(r.left)}px`
    el.style.top = `${Math.round(r.top)}px`
    el.style.width = `${cw}px`
    el.style.height = `${ch}px`
    document.body.appendChild(el)
    return el
  }
  const top = place === 'on' ? r.top - ch + Math.round(s) : r.bottom
  el.style.position = 'fixed'
  el.style.left = `${Math.round(left)}px`
  el.style.top = `${Math.round(Math.min(Math.max(top, 0), Math.max(0, vh - ch)))}px`
  el.style.width = `${cw}px`
  el.style.height = `${ch}px`
  document.body.appendChild(el)
  return el
}

function makeStage(el: HTMLElement, w: number, h: number, s: number, dark = false): Stage {
  const stage: Stage = {
    w,
    h,
    s,
    el,
    dark,
    actors: [],
    light() {
      const d = document.createElement('div')
      d.style.cssText = 'position:absolute;z-index:-1;pointer-events:none;border-radius:50%;opacity:0'
      d.style.background =
        'radial-gradient(circle, rgba(255, 246, 236, 0.42), rgba(255, 246, 236, 0.16) 40%, transparent 60%)'
      el.appendChild(d)
      return {
        set(x, y, r, opacity = 1) {
          d.style.left = `${(x - r) * s}px`
          d.style.top = `${(y - r) * s}px`
          d.style.width = d.style.height = `${2 * r * s}px`
          d.style.opacity = String(opacity)
        },
      }
    },
    actor(z = 0) {
      const a = makeActor(stage, z)
      stage.actors.push(a)
      return a
    },
    say() {
      const b = document.createElement('div')
      b.className = 'palco-say'
      b.style.fontSize = `${Math.max(11, Math.round(7 * s))}px`
      b.style.display = 'none'
      el.appendChild(b)
      return {
        el: b,
        show(text, x = 0, y = 0, opacity = 1) {
          if (!text) {
            b.style.display = 'none'
            return
          }
          if (b.textContent !== text) b.textContent = text
          b.style.display = ''
          b.style.left = `${x * s}px`
          b.style.top = `${y * s}px`
          b.style.opacity = String(opacity)
        },
      }
    },
  }
  return stage
}

const OBSTACLE =
  'input, textarea, select, button, label, img, [role="button"], h1, h2, h3, p, small, b, strong'

/** Tem texto próprio visível (não só de filhos)? */
const ownText = (el: Element) =>
  [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0)

/**
 * Quantos px livres há acima do elemento (até `max`), na largura da cena: para no primeiro texto, campo,
 * botão ou imagem. Fundos (painel, mapa, página) não contam.
 */
export function freeAbove(r: DOMRect, width: number, max = 120): number {
  if (typeof document.elementsFromPoint !== 'function') return max
  const cx = r.left + r.width / 2
  const xs = [-0.45, -0.2, 0, 0.2, 0.45].map((k) => cx + k * width)
  for (let d = 2; d <= max; d += 2) {
    const y = r.top - d
    if (y < 0) return d
    for (const x of xs) {
      const el = document.elementFromPoint(Math.min(Math.max(x, 0), innerWidth - 1), y)
      if (!el || el.closest('.palco, .scrim')) continue
      if (el.matches(OBSTACLE) || ownText(el)) return d - 2
    }
  }
  return max
}

/** A versão mínima de qualquer momento: um brilho no elemento (0,4 s). */
const TWINKLE = 420
function buildTwinkle(stage: Stage): (t: number) => void {
  const a = stage.actor()
  const b = stage.actor()
  return (t) => {
    const k = Math.min(1, t / TWINKLE)
    const pop = k < 0.4 ? k / 0.4 : 1
    // No canto de cima à direita do elemento, como um reflexo.
    a.draw(sparkle(), {
      x: stage.w - 6,
      y: -3 - pop,
      sx: pop,
      sy: pop,
      opacity: 1 - Math.max(0, k - 0.6) / 0.4,
    })
    b.draw(sparkle('#f6c6d4'), { x: stage.w - 11, y: -1 - pop * 2, opacity: k > 0.25 ? 1 - k : 0 })
  }
}

export interface PlayOptions {
  /** Chamado ao fim (sempre chega, pelo relógio). */
  onEnd?: () => void
}

/**
 * Toca um momento ancorado num elemento. Devolve o momento em andamento (ou `null` quando nada se move:
 * "reduzir movimento" ou elemento fora da tela).
 */
export function play<Ctx>(
  def: MomentDef<Ctx>,
  ctx: Ctx,
  anchor: Element | DOMRect | null,
  opts: PlayOptions = {},
): Run | null {
  if (!anchor || typeof document === 'undefined') return null
  if (reducedMotion()) {
    track('animacao', { momento: def.id, variacao: 'nenhuma', minima: true })
    return null
  }
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  // Variação forçada (o avaliador): sempre a versão completa pedida.
  const forcedVariant = forced.get(def.id)
  let minimal = !forcedVariant && (animMode() === 'discreet' || recent(def.id, now) >= 3)
  // Dentro de um elemento, vale o tamanho de layout (o cartão pode estar no meio de um "pop" com escala).
  const rect =
    def.place === 'inside' && anchor instanceof HTMLElement
      ? new DOMRect(0, 0, anchor.offsetWidth, anchor.offsetHeight)
      : rectOf(anchor)
  // Fora da tela (rolou, aba escondida): nada a mostrar.
  if (def.place !== 'inside' && (rect.bottom < 0 || rect.top > innerHeight || !rect.width)) return null
  let s = fitScale(def.figure(rect))
  let variant = 'brilho'
  let duration = TWINKLE
  let size = { w: Math.max(12, Math.round(rect.width / s)), h: Math.max(12, Math.round(rect.height / s)) }
  if (!minimal) {
    size = def.size(rect, s)
    // Vão livre acima do chão: a cena encolhe para caber; sem espaço, a versão mínima.
    if (def.fitGap && def.place === 'on') {
      const gap = freeAbove(rect, size.w * s)
      const dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1
      const fit = Math.floor((gap / size.h) * dpr) / dpr
      if (fit < s) s = fit
      if (s * 30 < 16) minimal = true
    }
  }
  if (!minimal) {
    variant = pick(def.id, def.variants(ctx), def.rare)
    duration = def.duration(variant)
  } else {
    s = 1
    size = { w: Math.max(12, Math.round(rect.width)), h: Math.max(12, Math.round(rect.height)) }
  }
  const place: Place = minimal ? (def.place === 'inside' ? 'inside' : 'over') : def.place
  const el = mount(anchor, place, size.w, size.h, s)
  if (!minimal && def.clip) el.style.overflow = 'hidden'
  // Sobre fundo escuro (o fundo escurecido de um painel, a faixa do topo, um cartão escuro), o elenco
  // escuro some: uma luz suave de palco atrás da cena dá contraste sem costuras nem halos nas partículas.
  // A luz acende junto com a cena (nada aparece antes de quem a motiva).
  let spot: HTMLElement | null = null
  const dark = darkBehind(el)
  if (dark && !def.ownLight) {
    spot = document.createElement('div')
    spot.style.cssText =
      'position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:0;background:radial-gradient(ellipse 60% 75% at 50% 78%, rgba(255, 246, 236, 0.42), rgba(255, 246, 236, 0.16) 55%, transparent 75%)'
    el.appendChild(spot)
  }
  const stage = makeStage(el, size.w, size.h, s, dark)
  const render = minimal ? buildTwinkle(stage) : def.build(stage, variant, ctx, seeded(Math.floor(now)))
  track('animacao', { momento: def.id, variacao: variant, minima: minimal })

  let raf = 0
  let timer = 0
  let done = false
  const start = now
  const run: Run = {
    id: def.id,
    variant,
    minimal,
    stage,
    duration,
    render: (t) => {
      try {
        const tt = Math.min(Math.max(0, t), duration)
        // Saída garantida: o palco inteiro esmaece nos últimos 140 ms (nada fica na tela).
        el.style.opacity = String(Math.min(1, (duration - tt) / 140))
        if (spot) spot.style.opacity = String(Math.min(1, tt / 200))
        render(tt)
      } catch {
        // efeito visual: um erro de desenho nunca afeta o app
      }
    },
    stop() {
      if (done) return
      done = true
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      el.remove()
      active.delete(run)
      opts.onEnd?.()
    },
  }
  active.add(run)
  run.render(0)
  const tick = () => {
    if (done || frozen !== null) return
    if (anchor instanceof Element && place === 'inside' && !anchor.isConnected) return run.stop()
    run.render(performance.now() - start)
    raf = requestAnimationFrame(tick)
  }
  if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick)
  timer = window.setTimeout(() => frozen === null && run.stop(), duration + 30)
  return run
}

/** O que está atrás do palco é escuro? (olha o fundo do primeiro elemento opaco sob o centro dele) */
function darkBehind(stageEl: HTMLElement): boolean {
  if (typeof document.elementFromPoint !== 'function') return false
  const r = stageEl.getBoundingClientRect()
  let el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  while (el) {
    const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)
    if (m && m.length >= 3) {
      const [rr, gg, bb, a = '1'] = m.map(Number) as [number, number, number, number?]
      if (Number(a) > 0.3) return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb < 110
    }
    el = el.parentElement
  }
  return false
}

/** Só o brilho no canto de um elemento (onde não cabe uma cena). */
const GLINT: MomentDef<null> = {
  id: 'brilho',
  variants: () => ['brilho'],
  rare: 'brilho',
  duration: () => TWINKLE,
  figure: () => 30,
  size: (r) => ({ w: Math.max(12, Math.round(r.width)), h: Math.max(12, Math.round(r.height)) }),
  place: 'over',
  build: (stage) => buildTwinkle(stage),
}

export const glint = (anchor: Element | null) => play(GLINT, null, anchor)

// ---------------------------------------------------------------------------
// Ganchos de desenvolvimento (avaliador e testes)
// ---------------------------------------------------------------------------

/** Os momentos em andamento (testes). */
export const activeRuns = () => [...active]

/** Encerra tudo na hora (troca de tela, testes). */
export function stopAll() {
  for (const r of [...active]) r.stop()
}

/** Força uma variação (o avaliador tira os quadros de cada uma). `null` volta ao sorteio. */
export function force(id: string, variant: string | null) {
  if (variant) forced.set(id, variant)
  else forced.delete(id)
}

/** Congela todos os momentos no instante t (ms); `null` solta e encerra. */
export function freeze(t: number | null) {
  frozen = t
  if (t === null) return stopAll()
  for (const r of active) r.render(t)
}

/** Zera o histórico de variações e repetições (testes). */
export function resetPalco() {
  stopAll()
  lastVariant.clear()
  history.clear()
  forced.clear()
  frozen = null
}

if (import.meta.env?.DEV && typeof window !== 'undefined')
  (window as unknown as { __palco: unknown }).__palco = { force, freeze, activeRuns, stopAll, setAnimMode }
