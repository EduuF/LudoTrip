import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { LegMode } from '../engine'
import { setLocalBack, useApp } from '../app/store'
import type { Opt } from './sheetTypes'
import { currentTheme } from '../app/theme'
import { palette, petalBurst, takeBursts } from './petals'
import type { Petal } from './petals'
import { H as CAST_H, STRIDE, W as CAST_W, castFor, sprite, travelersSize } from './stage/cast'

// Peças visuais da casa (guia de vibe): pixel art, selos, pétalas, painel, aviso e comemorações.

const reduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

// ---------------------------------------------------------------------------
// Veículos em pixel art
// ---------------------------------------------------------------------------

const VEHICLES: Record<LegMode, string[]> = {
  flight: [
    '.....#.....',
    '.....##....',
    '#...####...',
    '##########.',
    '#....####..',
    '.....##....',
    '.....#.....',
  ],
  train: ['.#######.', '#########', '#.#.#.#.#', '#########', '#########', '.#.....#.'],
  bus: ['##########', '#.#.#.#.##', '##########', '##########', '.##....##.'],
  car: ['..#####...', '.#.#..#.#.', '##########', '##########', '.##....##.'],
  boat: ['....#.....', '....##....', '....###...', '....#.....', '#########.', '.#######..'],
  walk: ['..##..', '..##..', '.####.', '#.##.#', '..##..', '.#..#.', '#....#'],
  bike: ['....##....', '.....#....', '.##.###...', '#..#.#.##.', '#..#...#..#', '.##.....##.'],
  moto: ['......##..', '.....###..', '.#######..', '#..###..#.', '#..#....#.', '.##.....##'],
}

export function Vehicle({ mode, px = 2 }: { mode: LegMode; px?: number }) {
  const rows = VEHICLES[mode]
  const w = Math.max(...rows.map((r) => r.length))
  return (
    <svg
      width={w * px}
      height={rows.length * px}
      viewBox={`0 0 ${w} ${rows.length}`}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      {rows.flatMap((r, y) =>
        [...r].map((c, x) =>
          c === '#' ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill="currentColor" />
          ) : null,
        ),
      )}
    </svg>
  )
}

export function PixelTrash({ px = 3 }: { px?: number }) {
  const rows = ['..####..', '########', '.######.', '.#.##.#.', '.#.##.#.', '.#.##.#.', '.######.']
  return (
    <svg
      width={8 * px}
      height={rows.length * px}
      viewBox={`0 0 8 ${rows.length}`}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      {rows.flatMap((r, y) =>
        [...r].map((c, x) =>
          c === '#' ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill="currentColor" />
          ) : null,
        ),
      )}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Viajantes: o elenco 24 × 30 (stage/cast), 1 a 4 lado a lado; 5 ou mais: a Kombi
// ---------------------------------------------------------------------------

const KOMBI = [
  '..##############..',
  '.#..............#.',
  '#.hh.hh.hh.hh.hh.#',
  '#.ss.ss.ss.ss.ss.#',
  '##################',
  '#kkkkkkkkkkkkkkkk#',
  '##################',
  '.##............##.',
]

export function Travelers({ count, height = 30 }: { count: number; height?: number }) {
  const size = travelersSize(count, height)
  if (count >= 5) {
    const col: Record<string, string> = { '#': '#241a28', h: '#3a2a2a', s: '#f3c9a8', k: '#e2809f', '.': '' }
    return (
      <svg
        width={size.width}
        height={size.height}
        viewBox="0 0 18 8"
        shapeRendering="crispEdges"
        role="img"
        aria-label="Uma galera na Kombi"
      >
        <rect x="1" y="1" width="16" height="6" fill="#f6edeb" />
        {KOMBI.flatMap((r, y) =>
          [...r].map((c, x) =>
            col[c] ? <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={col[c]} /> : null,
          ),
        )}
      </svg>
    )
  }
  const n = Math.max(1, count)
  return (
    <svg
      width={size.width}
      height={size.height}
      viewBox={`0 0 ${(n - 1) * STRIDE + CAST_W} ${CAST_H}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`${n} ${n === 1 ? 'viajante' : 'viajantes'}`}
    >
      {Array.from({ length: n }, (_, i) => (
        <g key={i} transform={`translate(${i * STRIDE} 0)`}>
          {sprite(castFor(i), 'idle').map((r, k) => (
            <rect key={k} x={r.x} y={r.y} width={r.w + 0.02} height={1.02} fill={r.c} />
          ))}
        </g>
      ))}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Pétalas ao fundo (com vento) e explosão de pétalas
// ---------------------------------------------------------------------------

export function Petals() {
  const ref = useRef<HTMLCanvasElement>(null)
  const country = useApp((s) => s.doc?.scope?.country)
  const theme = useApp((s) => s.theme)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, devicePixelRatio || 1)
    let W = 0
    let H = 0
    const resize = () => {
      W = cv.width = innerWidth * dpr
      H = cv.height = innerHeight * dpr
    }
    resize()
    addEventListener('resize', resize)
    // Pétalas de sakura, folhas tropicais ou de outono, pelo país da viagem; cores pelo modo dia/noite.
    const { colors, shape } = palette(country, currentTheme())
    const dim = currentTheme() === 'dark' ? 0.8 : 1
    const make = (top: boolean): Petal => ({
      x: Math.random() * W,
      y: top ? -20 * dpr : Math.random() * H,
      v: (0.35 + Math.random() * 0.6) * dpr,
      vx: 0,
      s: (7 + Math.random() * 8) * dpr,
      a: Math.random() * 6.28,
      w: 0.01 + Math.random() * 0.02,
      r: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 0.03,
      o: 0.35 + Math.random() * 0.35,
      t: Math.floor(Math.random() * colors.length),
    })
    const still = reduced()
    const P: Petal[] = still ? [] : Array.from({ length: 22 }, () => make(false))
    const B: Petal[] = []
    let raf = 0
    let tick = 0
    const draw = (p: Petal) => {
      ctx.save()
      ctx.globalAlpha = dim * p.o * (p.life === undefined ? 1 : Math.min(1, p.life / 40))
      ctx.fillStyle = colors[p.t]!
      ctx.translate(p.x, p.y)
      ctx.rotate(p.r)
      ctx.scale(1, Math.abs(Math.cos(p.a)) * 0.6 + 0.4)
      const s = p.s / 2
      ctx.beginPath()
      ctx.moveTo(0, -s)
      if (shape === 'leaf') {
        ctx.quadraticCurveTo(s * 0.95, -s * 0.1, 0, s * 1.1)
        ctx.quadraticCurveTo(-s * 0.95, -s * 0.1, 0, -s)
      } else {
        ctx.quadraticCurveTo(s * 1.1, -s * 0.6, s * 0.25, s)
        ctx.lineTo(0, s * 0.7)
        ctx.lineTo(-s * 0.25, s)
        ctx.quadraticCurveTo(-s * 1.1, -s * 0.6, 0, -s)
      }
      ctx.fill()
      ctx.restore()
    }
    const frame = () => {
      tick++
      const gust = Math.sin(tick / 240) * 0.6 + Math.sin(tick / 97) * 0.25
      ctx.clearRect(0, 0, W, H)
      for (const q of takeBursts())
        for (let i = 0; i < q.n; i++) {
          const ang = Math.random() * Math.PI * 2
          const sp = (2 + Math.random() * 5) * dpr
          B.push({
            ...make(false),
            x: q.x * dpr,
            y: q.y * dpr,
            vx: Math.cos(ang) * sp,
            v: Math.sin(ang) * sp - 2 * dpr,
            o: 0.9,
            life: 90 + Math.random() * 50,
          })
        }
      for (const p of P) {
        p.y += p.v
        p.a += p.w
        p.x += (Math.sin(p.a) * 0.6 + gust) * dpr
        p.r += p.vr
        if (p.y > H + 30 * dpr || p.x < -40 * dpr || p.x > W + 40 * dpr) Object.assign(p, make(true))
        draw(p)
      }
      for (let i = B.length - 1; i >= 0; i--) {
        const p = B[i]!
        p.vx *= 0.97
        p.v = p.v * 0.97 + 0.12 * dpr
        p.x += p.vx
        p.y += p.v
        p.r += p.vr * 4
        p.a += p.w * 3
        p.life! -= 1
        if (p.life! <= 0) B.splice(i, 1)
        else draw(p)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', resize)
    }
  }, [country, theme])
  return <canvas className="petals" ref={ref} aria-hidden="true" />
}

// ---------------------------------------------------------------------------
// Peças pequenas
// ---------------------------------------------------------------------------

export function Seal({ text, color, small }: { text: string; color?: string; small?: boolean }) {
  return (
    <span
      className={`seal${small ? ' sm' : ''}`}
      style={color ? ({ '--c': color } as React.CSSProperties) : undefined}
      aria-hidden="true"
    >
      {text.slice(0, 1)}
    </span>
  )
}

export function Stepper({
  value,
  min = 1,
  max = 99,
  label,
  onMinus,
  onPlus,
  unit = ['noite', 'noites'],
}: {
  value: number
  min?: number
  max?: number
  label: string
  onMinus: () => void
  onPlus: () => void
  unit?: [string, string]
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="Menos" onClick={onMinus} disabled={value <= min}>
        −
      </button>
      <span>
        {value} {value === 1 ? unit[0] : unit[1]}
      </span>
      <button type="button" aria-label="Mais" onClick={onPlus} disabled={value >= max}>
        +
      </button>
    </div>
  )
}

export function OptButton({ o }: { o: Opt }) {
  return (
    <button type="button" className={`opt${o.main ? ' main' : ''}`} disabled={o.disabled} onClick={o.run}>
      <b>{o.label}</b>
      {(o.detail ?? []).map((d, i) => (
        <span key={i}>{d}</span>
      ))}
    </button>
  )
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select, textarea, a[href]'
/** Ações que não devem receber o foco inicial (Enter não pode apagar nada sem querer). */
const DESTRUCTIVE = /^(Tirar|Apagar|Desmarcar|Encurtar)/

/**
 * Painel que sobe de baixo (spec §17.9, §17.12): Escape fecha, Tab fica dentro dele, o foco inicial
 * evita a busca (no celular abriria o teclado) e as ações destrutivas, é refeito quando um painel
 * troca por outro (`focusKey`) e volta ao botão que abriu ao fechar.
 */
export function SheetFrame({
  children,
  onClose,
  focusKey,
  label,
  back,
  depth = 0,
  dir = 'in',
  editor,
}: {
  children: ReactNode
  onClose: () => void
  focusKey?: unknown
  /** O que este painel é ("NOVA TAREFA"), no cabeçalho (spec §17.13). */
  label?: string
  /** "‹ Gion": o painel de baixo, quando este foi aberto a partir de outro. */
  back?: { name: string; go: () => void }
  /** Profundidade na pilha: troca a chave do conteúdo para a animação repetir. */
  depth?: number
  dir?: 'in' | 'back'
  /** Painel que edita algo (salva sozinho): termina em "Pronto ✓", que volta ao anterior ou fecha. */
  editor?: boolean
}) {
  const panel = useRef<HTMLDivElement>(null)
  const guard = useApp((s) => s.sheetGuard)
  const setGuard = useApp((s) => s.setSheetGuard)
  const [asking, setAsking] = useState<(() => void) | null>(null)
  // Sair com algo digitado e não criado pergunta antes (Criar ou Descartar).
  const leave = (then: () => void) => (guard ? setAsking(() => then) : then())
  const close = () => leave(onClose)
  const goBack = back ? () => leave(back.go) : undefined
  // Voltar do sistema (spec §17.14): um passo, como o "‹" do cabeçalho.
  useEffect(() => {
    setLocalBack(goBack ?? close)
    return () => setLocalBack(null)
  })
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        return close()
      }
      if (e.key !== 'Tab' || !panel.current) return
      const all = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (!all.length) return
      const first = all[0]!
      const last = all[all.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })
  useEffect(() => {
    setAsking(null)
    const all = [
      ...(panel.current?.querySelectorAll<HTMLElement>(
        '.sheet-body button:not([disabled]), .sheet-body input:not([type=search]):not([disabled]), .sheet-body select',
      ) ?? []),
    ]
    const safe = all.find((el) => !DESTRUCTIVE.test(el.textContent?.trim() ?? ''))
    ;(safe ?? all[0])?.focus({ preventScroll: true })
  }, [focusKey])
  return (
    <>
      <button type="button" className="scrim" aria-label="Fechar" onClick={close} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} ref={panel}>
        <div className="sheet-in">
          <div className="grip" />
          {label || back ? (
            <div className="sheet-head">
              {back ? (
                <button
                  type="button"
                  className="sheet-back"
                  onClick={goBack}
                  aria-label={`Voltar para ${back.name}`}
                >
                  ‹ <span>{back.name}</span>
                </button>
              ) : (
                <span />
              )}
              {label ? <span className="sheet-kind">{label}</span> : null}
            </div>
          ) : null}
          {asking && guard ? (
            <div className="sheet-ask" role="alert">
              <span>
                Criar “<b>{guard.text}</b>”?
              </span>
              <button
                type="button"
                className="btn small main"
                onClick={() => {
                  const then = asking
                  guard.create()
                  setAsking(null)
                  then()
                }}
              >
                Criar
              </button>
              <button
                type="button"
                className="btn small ghost"
                onClick={() => {
                  const then = asking
                  setGuard(null)
                  setAsking(null)
                  then()
                }}
              >
                Descartar
              </button>
            </div>
          ) : null}
          <div key={`${depth}:${String(focusKey)}`} className={`sheet-body slide-${dir}`}>
            {children}
          </div>
          {editor ? (
            <button type="button" className="btn main" onClick={goBack ?? close}>
              Pronto ✓
            </button>
          ) : (
            <button type="button" className="btn ghost" onClick={close}>
              Fechar
            </button>
          )}
        </div>
      </div>
    </>
  )
}

/** Menu "⋯": Escape e toque fora fecham; o foco vai ao primeiro item. */
export function PopMenu({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      onClose()
    }
    const onDown = (e: PointerEvent) => {
      // O botão "⋯" que abriu fica de fora: ele mesmo fecha.
      const t = e.target as Node
      if (!box.current?.contains(t) && !box.current?.parentElement?.contains(t)) onClose()
    }
    addEventListener('keydown', onKey)
    addEventListener('pointerdown', onDown)
    return () => {
      removeEventListener('keydown', onKey)
      removeEventListener('pointerdown', onDown)
    }
  }, [onClose])
  return (
    <div className="popmenu" role="menu" ref={box}>
      {children}
    </div>
  )
}

export function Toast() {
  const toast = useApp((s) => s.toast)
  // Com um painel aberto, o aviso vai para o topo: nunca por cima do painel (nem do "Desfazer" por engano).
  const sheetOpen = useApp((s) => !!s.sheet)
  const canUndo = useApp((s) => s.undoStack.length > 0)
  const undo = useApp((s) => s.undo)
  if (!toast) return null
  return (
    <div
      className={`toast${toast.warn ? ' warn' : ''}${sheetOpen ? ' top' : ''}`}
      role="status"
      key={toast.id}
    >
      <p>{toast.text}</p>
      {toast.action || (toast.undo && canUndo) ? (
        <button type="button" onClick={toast.action ?? undo}>
          {toast.actionLabel ?? 'Desfazer'}
        </button>
      ) : null}
    </div>
  )
}

export function Celebrations() {
  const list = useApp((s) => s.celebrations)
  const dismiss = useApp((s) => s.dismiss)
  useEffect(() => {
    const timers = list.map((c) => {
      if (c.kind === 'burst') petalBurst(innerWidth / 2, innerHeight - 160, 28)
      if (c.kind === 'page' || c.kind === 'created') petalBurst(innerWidth / 2, innerHeight / 2, 60)
      if (c.kind === 'level') petalBurst(innerWidth / 2, innerHeight / 2, 80)
      const ms = c.kind === 'level' || c.kind === 'created' ? 2600 : c.kind === 'page' ? 2200 : 1400
      return setTimeout(() => dismiss(c.id), reduced() ? 900 : ms)
    })
    return () => timers.forEach(clearTimeout)
  }, [list, dismiss])
  return (
    <>
      {list.map((c) => {
        switch (c.kind) {
          case 'xp':
            return (
              <div key={c.id} className="xpfloat" aria-hidden="true">
                +{c.amount} XP
              </div>
            )
          case 'stamp':
            return (
              <div key={c.id} className="bigstamp" aria-hidden="true">
                済
              </div>
            )
          case 'level':
            return (
              <button key={c.id} type="button" className="levelup" onClick={() => dismiss(c.id)}>
                <span className="box" role="status">
                  <b>NOVO NÍVEL!</b>
                  <span>
                    nível {c.level} · {c.name}
                  </span>
                  <small>toque para continuar</small>
                </span>
              </button>
            )
          case 'page':
            return (
              <button key={c.id} type="button" className="levelup" onClick={() => dismiss(c.id)}>
                <span className="box" role="status">
                  <b>TUDO COM DIA!</b>
                  <span>{c.name}: todas as atividades já têm dia marcado</span>
                </span>
              </button>
            )
          case 'created':
            return (
              <button key={c.id} type="button" className="levelup" onClick={() => dismiss(c.id)}>
                <span className="box" role="status">
                  <b>VIAGEM CRIADA!</b>
                  <span>{c.name}</span>
                  <small>o mapa e a trilha já estão prontos para mexer</small>
                </span>
              </button>
            )
          default:
            return null
        }
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// Anotações: caixa de texto que salva ao sair (e ao fechar o painel), com Desfazer.
// ---------------------------------------------------------------------------

export function NoteBox({
  id,
  label,
  value,
  placeholder,
  save,
  line,
  inputMode,
  after,
}: {
  id: string
  label: string
  value: string
  placeholder: string
  save: (text: string) => void
  /** Uma linha (título, link) em vez da caixa de várias linhas; Enter confirma. */
  line?: boolean
  inputMode?: 'url' | 'text'
  /** Ao lado do campo (ex.: "Abrir ↗"). */
  after?: ReactNode
}) {
  const [text, setText] = useState(value)
  const latest = useRef({ text, value, save })
  latest.current = { text, value, save }
  // Mudou por fora (Copiar de…, Desfazer): a caixa acompanha.
  useEffect(() => setText(value), [value])
  // Fechar o painel com algo digitado também salva.
  useEffect(
    () => () => {
      const l = latest.current
      if (l.text.trim() !== l.value) l.save(l.text.trim())
    },
    [],
  )
  const commit = () => text.trim() !== value && save(text.trim())
  if (line)
    return (
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <div className="row">
          <input
            className="input"
            id={id}
            style={{ flex: 1 }}
            inputMode={inputMode}
            value={text}
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          {after}
        </div>
      </div>
    )
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <textarea
        className="input memo-box"
        id={id}
        rows={3}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
    </label>
  )
}
