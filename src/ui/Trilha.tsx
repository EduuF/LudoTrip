import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent as RMouseEvent,
  PointerEvent as RPointerEvent,
} from 'react'
import {
  addDays,
  bookingStatus,
  days as allDays,
  ddmm,
  lodgingGaps,
  MODE_NAMES,
  plural,
  preview,
  timeline,
  tripPhase,
  weekday,
  worlds,
} from '../engine'
import type { Command, ID, Itinerary } from '../engine'
import { useApp, todayISO } from '../app/store'
import { markTrilhaHintSeen, trilhaHintSeen } from '../app/tutorial'
import { blockIntent, boundaryCommand, endIntent, shelfIntent } from '../app/trilha/intent'
import type { BlockIntent, ShelfIntent } from '../app/trilha/intent'
import { cityName, previewLines } from '../app/choices'
import { colorOf, sealOf } from './colors'
import { useCanEdit } from './useCanEdit'
import { PixelTrash, Vehicle } from './kit'
import { isCoarse, MOUSE_DISTANCE } from './pointer'

// A Trilha (spec §17.3): régua de datas, blocos por cidade, pegadores, levantar e arrastar.
// Mouse e dedo seguem normas diferentes (ver pointer.ts): o mouse levanta um bloco ao mover 6 px e rola
// a faixa pela régua ou pela roda; o dedo segura 450 ms para levantar, rola a faixa pelos blocos e passa
// os dias pela régua (a barra de dias da v1).

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
// Segurar ~450 ms no toque (iOS e Material levantam entre 400 e 500 ms); o bloco "infla" enquanto espera.
const LIFT_MS = 450
const MOVE_TOLERANCE = 9

type Drag =
  | { kind: 'handle'; index: number; startX: number; cmd: Command | null; text: string; bad?: boolean }
  | { kind: 'end'; startX: number; cmd: Command | null; text: string; bad?: boolean }
  | {
      kind: 'block'
      stopId: ID
      startX: number
      grabDay: number
      dx: number
      intent: BlockIntent
      trash: boolean
      text: string
      bad?: boolean
    }
  | { kind: 'shelf'; destId: ID; x: number; y: number; intent: ShelfIntent | null; text: string }

interface Pending {
  kind: 'block' | 'shelf'
  id: ID
  pointerId: number
  x: number
  y: number
  timer: number
  el: HTMLElement
  /** Mouse ou caneta: levanta ao mover, sem esperar. */
  mouse: boolean
}

type Scrub = { mode: 'scrub' } | { mode: 'pan'; x: number; left: number; moved: boolean }

export function Trilha() {
  const doc = useApp((s) => s.doc)!
  const editable = useCanEdit()
  const act = useApp((s) => s.act)
  const openSheet = useApp((s) => s.openSheet)
  const say = useApp((s) => s.say)
  const focusOn = useApp((s) => s.focusOn)
  const cursor = useApp((s) => s.cursorDay)
  const setCursorDay = useApp((s) => s.setCursorDay)
  const it = doc.itinerary
  const total = timeline(it).total
  const coarse = isCoarse()

  const scrollRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const trashRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(360)
  const [zoom, setZoom] = useState<'dias' | 'tudo'>(total <= 9 ? 'tudo' : 'dias')
  const [drag, setDrag] = useState<Drag | null>(null)
  const [shake, setShake] = useState<ID | null>(null)
  const [charging, setCharging] = useState<ID | null>(null)
  const [panning, setPanning] = useState(false)
  const [nudge, setNudge] = useState(true)
  // A dica some depois do primeiro arraste (lembrado no aparelho); "Como jogar" mostra de novo.
  const [hint, setHint] = useState(() => !trilhaHintSeen())
  const tutorial = useApp((s) => s.tutorial)
  useEffect(() => {
    if (tutorial) setHint(true)
  }, [tutorial])
  const learned = () => {
    if (!hint) return
    markTrilhaHintSeen()
    setHint(false)
  }
  const dragRef = useRef<Drag | null>(null)
  const pending = useRef<Pending | null>(null)
  dragRef.current = drag

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const dw = zoom === 'dias' ? 40 : Math.max(12, Math.floor((width - 36) / (total + 1)))

  // Enquanto algo está levantado, o dedo não rola a página nem a trilha.
  useEffect(() => {
    const block = (e: TouchEvent) => {
      if (dragRef.current && e.cancelable) e.preventDefault()
    }
    addEventListener('touchmove', block, { passive: false })
    return () => removeEventListener('touchmove', block)
  }, [])

  // A roda do mouse sobre a trilha rola a faixa (só quando ela transborda e o gesto é mais vertical
  // que horizontal, para não brigar com o trackpad).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Os pegadores acenam ao abrir a viagem: "isto se arrasta".
  useEffect(() => {
    const t = setTimeout(() => setNudge(false), 1400)
    return () => clearTimeout(t)
  }, [])

  // O dia escolhido fica à vista (ao tocar, arrastar a régua ou "ver a viagem").
  useEffect(() => {
    const el = scrollRef.current
    if (cursor === null || !el || typeof el.scrollTo !== 'function') return
    const x = cursor * dw + 18
    const left = el.scrollLeft
    const w = el.clientWidth
    if (x < left + 30) el.scrollTo({ left: Math.max(0, x - 60), behavior: 'smooth' })
    else if (x + dw > left + w - 30) el.scrollTo({ left: x + dw + 60 - w, behavior: 'smooth' })
  }, [cursor, dw])

  // Rolagem automática perto das bordas enquanto arrasta.
  const edgeX = useRef<number | null>(null)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const el = scrollRef.current
      const x = edgeX.current
      if (
        el &&
        x !== null &&
        dragRef.current &&
        dragRef.current.kind !== 'handle' &&
        dragRef.current.kind !== 'end'
      ) {
        const r = el.getBoundingClientRect()
        if (x < r.left + 36) el.scrollLeft -= 9
        else if (x > r.right - 36) el.scrollLeft += 9
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const dayAt = (clientX: number) => {
    const r = innerRef.current?.getBoundingClientRect()
    return r ? (clientX - r.left) / dw : 0
  }

  // Régua: com o dedo, arrastar passa os dias (o grupo anda no mapa, como a barra de dias da v1);
  // com o mouse, arrastar rola a faixa e o clique escolhe o dia.
  const scrub = useRef<Scrub | null>(null)
  const panned = useRef(false)
  const scrubTo = (clientX: number) =>
    setCursorDay(Math.max(0, Math.min(timeline(it).total, Math.floor(dayAt(clientX)))))
  const capture = (e: RPointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ponteiro sintético (testes) */
    }
  }
  const onScrubDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (e.pointerType === 'touch') {
      capture(e)
      scrub.current = { mode: 'scrub' }
      scrubTo(e.clientX)
    } else
      scrub.current = { mode: 'pan', x: e.clientX, left: scrollRef.current?.scrollLeft ?? 0, moved: false }
  }
  const onScrubMove = (e: RPointerEvent<HTMLDivElement>) => {
    const s = scrub.current
    if (!s) return
    if (s.mode === 'scrub') return scrubTo(e.clientX)
    const dx = e.clientX - s.x
    if (!s.moved && Math.abs(dx) > 4) {
      // Só captura o ponteiro quando rola de verdade: um clique parado continua chegando ao dia.
      s.moved = true
      capture(e)
      setPanning(true)
    }
    if (s.moved && scrollRef.current) scrollRef.current.scrollLeft = s.left - dx
  }
  const onScrubEnd = () => {
    const s = scrub.current
    scrub.current = null
    setPanning(false)
    // Depois de rolar, o clique que o navegador dispara em cima do dia não vale.
    panned.current = s?.mode === 'pan' && s.moved
    if (panned.current) setTimeout(() => (panned.current = false), 0)
  }

  // O que desenhar: durante "empurrar" ou pegadores, a prévia; senão, o roteiro atual.
  const view: Itinerary = useMemo(() => {
    if (!drag) return it
    const cmd =
      drag.kind === 'handle' || drag.kind === 'end'
        ? drag.cmd
        : drag.kind === 'block' && drag.intent.kind === 'shift' && !drag.trash
          ? ({ type: 'shiftStop', stopId: drag.stopId, by: drag.intent.by } as Command)
          : null
    if (!cmd) return it
    const p = preview(it, cmd)
    return p.ok && p.state ? p.state : it
  }, [drag, it])

  const tl = timeline(view)
  const segs = tl.segments
  const stopStart = (id: ID) => segs.find((s) => s.kind === 'stop' && s.id === id)?.startIndex ?? 0
  const today = todayISO()
  const phase = tripPhase(it, today)

  // Bate-voltas por dia (bandeirinha na régua), pela prévia quando há arraste.
  const dayTrips = useMemo(() => {
    const m = new Map<number, ID[]>()
    for (const d of allDays(view, doc.places)) if (d.dayTrips.length) m.set(d.index, d.dayTrips)
    return m
  }, [view, doc.places])

  // Alertas na própria trilha: hotel fora das datas ou noites sem hospedagem em parte.
  const warned = useMemo(() => {
    const out = new Set<ID>()
    for (const g of lodgingGaps(it, doc.bookings)) if (g.partial) out.add(g.stopId)
    for (const b of doc.bookings) {
      if (b.archived) continue
      const st = bookingStatus(b, it)
      if (st.state === 'out-of-window' && st.stopId) out.add(st.stopId)
    }
    return out
  }, [it, doc.bookings])

  // Resumo da viagem no cabeçalho ("23 noites · 6 destinos · 2 países"); o nome do lugar é a marca-d'água do mapa.
  const summary = useMemo(() => {
    const places = new Set(it.stops.map((s) => s.destinationId).filter(Boolean)).size
    const countries = worlds(it, doc.destinations).length
    return [
      plural(total, 'noite', 'noites'),
      places ? plural(places, 'destino', 'destinos') : null,
      countries > 1 ? plural(countries, 'país', 'países') : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }, [it, doc.destinations, total])

  // ---------------------------------------------------------------------------
  // Textos do balão
  // ---------------------------------------------------------------------------

  const blockText = useCallback(
    (stopId: ID, intent: BlockIntent, trash: boolean): { text: string; bad?: boolean } => {
      const name = cityName(stopId)
      if (trash) return { text: `Soltar aqui tira ${name} do roteiro. As atividades ficam guardadas.` }
      if (intent.kind === 'shift') {
        const lines = previewLines({ type: 'shiftStop', stopId, by: intent.by })
        const n = it.stops.find((s) => s.id === stopId)?.days.length ?? 0
        return {
          text: `${name} chega ${plural(Math.abs(intent.by), 'dia', 'dias')} ${intent.by > 0 ? 'depois' : 'antes'}, ${n === 1 ? 'a mesma noite' : `as mesmas ${n} noites`}. ${lines.lines.join(' ')}`,
          bad: !lines.ok,
        }
      }
      if (intent.kind === 'reorder') {
        const others = it.stops.filter((s) => s.id !== stopId)
        const where =
          intent.toIndex === 0
            ? 'para o começo da viagem'
            : `para depois de ${cityName(others[intent.toIndex - 1]!.id)}`
        const lines = previewLines({ type: 'reorderStop', stopId, toIndex: intent.toIndex })
        return {
          text: `${name} vai ${where}. ${lines.lines.filter((l) => l !== 'Nenhum plano sai.').join(' ')}`.trim(),
          bad: !lines.ok,
        }
      }
      if (intent.reason === 'first')
        return { text: 'É o primeiro destino: para chegar antes, mude a data de ida.', bad: true }
      if (intent.reason === 'last')
        return { text: 'É o último destino: para chegar depois, mude a volta.', bad: true }
      if (intent.reason === 'short') return { text: 'Arraste mais para passar o destino ao lado.', bad: true }
      return { text: 'Arraste para mudar a data ou a ordem. Solte na lixeira para tirar.' }
    },
    [it],
  )

  const shelfText = useCallback(
    (destId: ID, intent: ShelfIntent | null): string => {
      const dest = doc.destinations.find((d) => d.id === destId)?.name ?? 'O destino'
      if (!intent)
        return `Solte ${dest} na trilha: no meio de um destino, entre dois ou nas noites em aberto.`
      if (intent.kind === 'fill') return `${dest} nas noites em aberto.`
      if (intent.kind === 'split') {
        const start = stopStart(intent.stopId)
        const label = it.start
          ? `${weekday(addDays(it.start, start + intent.afterOrdinal - 1))} ${ddmm(addDays(it.start, start + intent.afterOrdinal - 1))}`
          : `dia ${start + intent.afterOrdinal}`
        return `${dest} no meio de ${cityName(intent.stopId)}, depois de ${label}.`
      }
      const a = it.stops[intent.index - 1]
      const b = it.stops[intent.index]
      if (!a) return `${dest} no começo da viagem.`
      if (!b) return `${dest} no fim da viagem.`
      return `${dest} entre ${cityName(a.id)} e ${cityName(b.id)}.`
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [it, doc.destinations],
  )

  // ---------------------------------------------------------------------------
  // Pegadores (noites)
  // ---------------------------------------------------------------------------

  const onHandleDown = (e: RPointerEvent<HTMLButtonElement>, index: number | 'end') => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ponteiro sintético (testes) */
    }
    setDrag(
      index === 'end'
        ? { kind: 'end', startX: e.clientX, cmd: null, text: 'Arraste para mudar a volta.' }
        : {
            kind: 'handle',
            index,
            startX: e.clientX,
            cmd: null,
            text: 'Arraste para passar noites de uma cidade para a outra.',
          },
    )
  }
  const onHandleMove = (e: RPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d || (d.kind !== 'handle' && d.kind !== 'end')) return
    const k = (e.clientX - d.startX) / dw
    if (d.kind === 'end') {
      const intent = endIntent(it, k)
      if (intent.kind === 'locked')
        return setDrag({
          ...d,
          cmd: null,
          text: 'A volta está marcada 🔒. Toque em VOLTA para liberar ou mudar a data.',
          bad: true,
        })
      if (intent.kind === 'none')
        return setDrag({ ...d, cmd: null, text: 'Arraste para mudar a volta.', bad: false })
      const p = previewLines(intent.command)
      return setDrag({ ...d, cmd: intent.command, text: p.lines.join(' '), bad: !p.ok })
    }
    const cmd = boundaryCommand(it, d.index, k)
    if (!cmd || cmd.type !== 'moveBoundary')
      return setDrag({
        ...d,
        cmd: null,
        text: 'Arraste para passar noites de uma cidade para a outra.',
        bad: false,
      })
    const l = it.stops[d.index]!
    const r = it.stops[d.index + 1]!
    const head = `${cityName(l.id)} ${l.days.length + cmd.k} · ${cityName(r.id)} ${r.days.length - cmd.k}.`
    const p = previewLines(cmd)
    setDrag({ ...d, cmd, text: `${head} ${p.lines.join(' ')}`, bad: !p.ok })
  }
  /** Teclado (spec §17.12): ← → passam uma noite pela divisa (ou mudam a volta). */
  const onHandleKey = (e: KeyboardEvent<HTMLElement>, index: number | 'end') => {
    const k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!k) return
    e.preventDefault()
    if (index === 'end') {
      const intent = endIntent(it, k)
      if (intent.kind === 'locked') return say('A volta está marcada 🔒. Mude em "Sua viagem".', true)
      if (intent.kind === 'command') act({ type: 'engine', command: intent.command })
      return
    }
    const cmd = boundaryCommand(it, index, k)
    if (cmd) act({ type: 'engine', command: cmd })
    else say('Cada destino precisa de pelo menos 1 noite.', true)
  }
  const onHandleUp = () => {
    const d = dragRef.current
    setDrag(null)
    if (!d || (d.kind !== 'handle' && d.kind !== 'end')) return
    if (d.cmd && !d.bad) {
      act({ type: 'engine', command: d.cmd })
      learned()
    } else if (d.bad) say(d.text, true)
  }

  // ---------------------------------------------------------------------------
  // Levantar (bloco da trilha ou cidade da prateleira)
  // ---------------------------------------------------------------------------

  const cancelPending = () => {
    if (pending.current) clearTimeout(pending.current.timer)
    pending.current = null
    setCharging(null)
  }

  /** Levanta de verdade: captura o ponteiro, vibra (no toque) e marca o levantado na hora, antes de o
   *  React desenhar, para o primeiro movimento do dedo já não rolar a página. */
  const lift = (p: Pending) => {
    try {
      p.el.setPointerCapture(p.pointerId)
    } catch {
      /* o dedo já saiu */
    }
    if (!p.mouse) navigator.vibrate?.(12)
    let d: Drag
    if (p.kind === 'block') {
      const grabDay = dayAt(p.x)
      const intent = blockIntent(it, p.id, 0, grabDay)
      d = {
        kind: 'block',
        stopId: p.id,
        startX: p.x,
        grabDay,
        dx: 0,
        intent,
        trash: false,
        ...blockText(p.id, intent, false),
      }
    } else d = { kind: 'shelf', destId: p.id, x: p.x, y: p.y, intent: null, text: shelfText(p.id, null) }
    dragRef.current = d
    setDrag(d)
  }

  const onLiftDown = (e: RPointerEvent<HTMLElement>, kind: 'block' | 'shelf', id: ID) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    cancelPending()
    const mouse = e.pointerType !== 'touch'
    const p: Pending = {
      kind,
      id,
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      timer: 0,
      el: e.currentTarget,
      mouse,
    }
    pending.current = p
    // Mouse e caneta levantam ao mover (ver liftMove); o dedo segura, com o bloco inflando.
    if (mouse) return
    p.timer = window.setTimeout(() => {
      if (pending.current !== p) return
      pending.current = null
      setCharging(null)
      lift(p)
    }, LIFT_MS)
    setCharging(id)
  }

  const overTrash = (x: number, y: number) => {
    const r = trashRef.current?.getBoundingClientRect()
    return !!r && x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 12 && y <= r.bottom + 12
  }

  const overStrip = (y: number) => {
    const r = innerRef.current?.getBoundingClientRect()
    return !!r && y >= r.top - 10 && y <= r.top + 140
  }

  const liftMove = (x: number, y: number) => {
    const p = pending.current
    if (p && !dragRef.current) {
      const dist = Math.hypot(x - p.x, y - p.y)
      if (p.mouse) {
        if (dist <= MOUSE_DISTANCE) return
        pending.current = null
        lift(p)
      } else {
        if (dist > MOVE_TOLERANCE) cancelPending()
        return
      }
    }
    const d = dragRef.current
    if (!d) return
    edgeX.current = x
    if (d.kind === 'block') {
      const dx = x - d.startX
      const trash = overTrash(x, y)
      const intent = blockIntent(it, d.stopId, dx / dw, d.grabDay + dx / dw)
      setDrag({ ...d, dx, intent, trash, ...blockText(d.stopId, intent, trash) })
    } else if (d.kind === 'shelf') {
      const intent = overStrip(y) ? shelfIntent(it, dayAt(x)) : null
      setDrag({ ...d, x, y, intent, text: shelfText(d.destId, intent) })
    }
  }
  const onLiftMove = (e: RPointerEvent<HTMLElement>) => liftMove(e.clientX, e.clientY)

  const liftUp = (x: number, y: number, kind: 'block' | 'shelf', id: ID) => {
    const p = pending.current
    const d = dragRef.current
    cancelPending()
    edgeX.current = null
    if (!d) {
      // Toque (ou clique) simples.
      if (p && Math.hypot(x - p.x, y - p.y) <= MOVE_TOLERANCE) {
        if (kind === 'block') {
          // Como na v1: o cursor vai ao primeiro dia do destino, e o roteiro rola até o cartão dele.
          setCursorDay(stopStart(id))
          focusOn(`c-${id}`, 'mapa')
        } else openSheet({ kind: 'where', destId: id })
      }
      return
    }
    dragRef.current = null
    setDrag(null)
    learned()
    if (d.kind === 'block') {
      if (d.trash) {
        act({ type: 'engine', command: { type: 'removeStop', stopId: d.stopId } }, { burst: true })
        return
      }
      if (d.intent.kind === 'shift')
        act({ type: 'engine', command: { type: 'shiftStop', stopId: d.stopId, by: d.intent.by } })
      else if (d.intent.kind === 'reorder')
        act({ type: 'engine', command: { type: 'reorderStop', stopId: d.stopId, toIndex: d.intent.toIndex } })
      else {
        setShake(d.stopId)
        setTimeout(() => setShake(null), 400)
        if (d.bad) say(d.text, true)
      }
      return
    }
    if (d.kind === 'shelf') {
      const intent = d.intent
      if (!intent) return
      if (intent.kind === 'split')
        openSheet({
          kind: 'split',
          stopId: intent.stopId,
          destId: d.destId,
          nights: 1,
          after: intent.afterOrdinal,
        })
      else if (intent.kind === 'insert')
        openSheet({ kind: 'insert', index: intent.index, destId: d.destId, nights: 1 })
      else {
        const open = it.stops.find((s) => s.id === intent.stopId)
        if (open && open.days.length > 1)
          openSheet({
            kind: 'fill',
            stopId: intent.stopId,
            destId: d.destId,
            nights: open.days.length,
            side: 'start',
          })
        else
          act({
            type: 'engine',
            command: { type: 'fillOpen', stopId: intent.stopId, destinationId: d.destId },
          })
      }
    }
  }
  const onLiftUp = (e: RPointerEvent<HTMLElement>, kind: 'block' | 'shelf', id: ID) =>
    liftUp(e.clientX, e.clientY, kind, id)

  // No toque, o navegador cancela o ponteiro se achar que o dedo quer rolar. Com algo já levantado,
  // o arraste não cai: segue pelos eventos de toque do documento até o dedo soltar.
  const onLiftCancel = (e: RPointerEvent<HTMLElement>) => {
    const d = dragRef.current
    if (e.pointerType === 'touch' && d && (d.kind === 'block' || d.kind === 'shelf')) {
      const kind = d.kind
      const id = d.kind === 'block' ? d.stopId : d.destId
      const move = (ev: TouchEvent) => {
        const t = ev.touches[0]
        if (!t) return
        if (ev.cancelable) ev.preventDefault()
        liftMove(t.clientX, t.clientY)
      }
      const end = (ev: TouchEvent) => {
        removeEventListener('touchmove', move)
        removeEventListener('touchend', end)
        removeEventListener('touchcancel', end)
        const t = ev.changedTouches[0]
        if (t && ev.type === 'touchend') liftUp(t.clientX, t.clientY, kind, id)
        else {
          dragRef.current = null
          setDrag(null)
        }
      }
      addEventListener('touchmove', move, { passive: false })
      addEventListener('touchend', end)
      addEventListener('touchcancel', end)
      return
    }
    cancelPending()
    edgeX.current = null
    if (d?.kind === 'block' || d?.kind === 'shelf') {
      dragRef.current = null
      setDrag(null)
    }
  }

  // ---------------------------------------------------------------------------
  // Desenho
  // ---------------------------------------------------------------------------

  const innerW = (tl.total + 1) * dw
  const startLabel = it.start
    ? `${MONTHS[Number(it.start.slice(5, 7)) - 1]} ${it.start.slice(0, 4)}`
    : 'SEM DATA'
  const lifted = drag?.kind === 'block' ? drag : null
  const shelfDrag = drag?.kind === 'shelf' ? drag : null
  const homeLeg = it.legs[0]
  const backLeg = it.legs[it.legs.length - 1]

  const destsInTrip = new Set(it.stops.map((s) => s.destinationId).filter(Boolean))
  // Só os destinos guardados (fora da trilha): os da trilha entram no meio de outro pelo "+ Adicionar destino".
  const shelf = doc.destinations.filter((d) => !destsInTrip.has(d.id))
  const blockHint = !editable
    ? `${coarse ? 'Toque' : 'Clique'} para ver os dias no roteiro.`
    : coarse
      ? 'Toque para ver os dias no roteiro; segure e arraste para mudar a data ou a ordem.'
      : 'Clique para ver os dias no roteiro; arraste para mudar a data ou a ordem.'
  const chipHint = coarse
    ? 'toque para escolher onde entra, ou segure e arraste para a trilha'
    : 'clique para escolher onde entra, ou arraste para a trilha'

  return (
    <section className="trilha" aria-label="Trilha da viagem">
      <div className="tr-head">
        <span className="tr-month">
          {startLabel}
          {summary ? <small> · {summary}</small> : null}
        </span>
        <div className="seg" role="group" aria-label="Zoom da trilha">
          <button
            type="button"
            className={zoom === 'dias' ? 'on' : ''}
            aria-pressed={zoom === 'dias'}
            onClick={() => setZoom('dias')}
          >
            Dias
          </button>
          <button
            type="button"
            className={zoom === 'tudo' ? 'on' : ''}
            aria-pressed={zoom === 'tudo'}
            onClick={() => setZoom('tudo')}
          >
            Ver tudo
          </button>
        </div>
      </div>
      {drag && (drag.kind !== 'block' || drag.dx !== 0 || drag.trash) ? (
        <div className={`tr-balloon${'bad' in drag && drag.bad ? ' bad' : ''}`} role="status">
          {drag.text}
        </div>
      ) : null}
      <div className="tr-scroll" ref={scrollRef}>
        <div className="tr-inner" ref={innerRef} style={{ width: innerW }}>
          <button
            type="button"
            className="tr-flag"
            style={{ left: 0 }}
            onClick={() => openSheet({ kind: 'trip' })}
            aria-label="Ida: mudar as datas"
          >
            {homeLeg ? <Vehicle mode={homeLeg.mode} px={1} /> : null} IDA {it.start ? ddmm(it.start) : ''}
          </button>
          <button
            type="button"
            className="tr-flag end"
            style={{ left: innerW }}
            onClick={() => openSheet({ kind: 'trip' })}
            aria-label="Volta: mudar as datas"
          >
            VOLTA {it.start ? ddmm(addDays(it.start, tl.total)) : ''} {it.lock === 'fixed' ? '🔒' : ''}{' '}
            {backLeg ? <Vehicle mode={backLeg.mode} px={1} /> : null}
          </button>

          {segs.map((seg) => {
            const left = seg.startIndex * dw
            const w = Math.max(seg.nights * dw - 3, 8)
            if (seg.kind === 'leg') {
              const leg = view.legs.find((l) => l.id === seg.id)
              if (!seg.nights || !leg) return null
              return (
                <div
                  key={seg.id}
                  className="tr-blk aboard"
                  style={{ left, width: w }}
                  aria-label={`${plural(seg.nights, 'noite', 'noites')} a bordo`}
                >
                  <span className="nm">
                    <Vehicle mode={leg.mode} px={1} />
                  </span>
                  <span className="n">{seg.nights}</span>
                </div>
              )
            }
            const stop = view.stops.find((s) => s.id === seg.id)!
            const dest = doc.destinations.find((d) => d.id === stop.destinationId)
            const isLifted = lifted?.stopId === stop.id
            const style: CSSProperties = {
              left,
              width: w,
              ['--c' as string]: colorOf(doc.destinations, stop.destinationId),
              ...(isLifted && lifted.intent.kind !== 'shift'
                ? { transform: `translate(${lifted.dx}px, -8px) rotate(-1.5deg)` }
                : {}),
            }
            const target =
              shelfDrag?.intent && 'stopId' in shelfDrag.intent && shelfDrag.intent.stopId === stop.id
            const cls = [
              'tr-blk',
              stop.destinationId ? '' : 'open',
              isLifted ? 'lifted' : '',
              shake === stop.id ? 'shake' : '',
              charging === stop.id ? 'charging' : '',
              warned.has(stop.id) ? 'warn' : '',
              target ? 'target' : '',
            ]
              .filter(Boolean)
              .join(' ')
            const label = stop.destinationId
              ? `${dest?.name}, ${plural(seg.nights, 'noite', 'noites')}`
              : stop.openIn
                ? `${stop.openIn.name}, ${plural(seg.nights, 'noite', 'noites')}, cidades em aberto`
                : `${plural(seg.nights, 'noite', 'noites')} em aberto`
            return (
              <button
                key={seg.id}
                type="button"
                className={cls}
                style={style}
                aria-label={`${label}. ${blockHint}`}
                // Teclado (Enter, espaço): abre o destino, como o toque. Quem só vê não arrasta: o clique abre.
                onClick={(e) => {
                  if (e.detail !== 0 && editable) return
                  setCursorDay(stopStart(stop.id))
                  focusOn(`c-${stop.id}`, 'mapa')
                }}
                {...(editable
                  ? {
                      onPointerDown: (e: RPointerEvent<HTMLButtonElement>) => onLiftDown(e, 'block', stop.id),
                      onPointerMove: onLiftMove,
                      onPointerUp: (e: RPointerEvent<HTMLButtonElement>) => onLiftUp(e, 'block', stop.id),
                      onPointerCancel: onLiftCancel,
                      onContextMenu: (e: RMouseEvent) => e.preventDefault(),
                    }
                  : {})}
              >
                <span className="nm">
                  <b>{stop.destinationId ? sealOf(dest) : '+'}</b>
                  {w > 64 ? (stop.destinationId ? dest?.name : (stop.openIn?.name ?? 'em aberto')) : null}
                </span>
                <span className="n">{seg.nights}</span>
                {w >= 56 ? (
                  <span className="tr-grip" aria-hidden="true">
                    ⋮⋮
                  </span>
                ) : null}
              </button>
            )
          })}

          {/* Veículo de cada trecho entre cidades */}
          {view.legs.slice(1, -1).map((leg) => {
            const toStart = stopStart(leg.to as ID)
            const seg = segs.find((s) => s.kind === 'leg' && s.id === leg.id)
            const x = (seg && seg.nights ? seg.startIndex : toStart) * dw
            return (
              <span key={leg.id} className="tr-veh" style={{ left: x }} title={MODE_NAMES[leg.mode]}>
                <Vehicle mode={leg.mode} px={1.4} />
              </span>
            )
          })}

          {/* Pegadores das divisas e da volta: pílulas com setas, que acenam ao abrir a viagem */}
          {(editable ? view.stops.slice(0, -1) : []).map((s, i) => {
            const next = view.stops[i + 1]!
            const x = stopStart(next.id) * dw
            const active = drag?.kind === 'handle' && drag.index === i
            return (
              <button
                key={`h-${s.id}`}
                type="button"
                className={`tr-handle${active ? ' active' : ''}${nudge ? ' nudge' : ''}`}
                style={{ left: x }}
                aria-label={`Divisa entre ${cityName(s.id)} e ${cityName(next.id)}: arraste, ou use as setas ← →, para passar noites`}
                onKeyDown={(e) => onHandleKey(e, i)}
                title={`Arraste: noites de ${cityName(s.id)} ⇄ ${cityName(next.id)}`}
                onPointerDown={(e) => onHandleDown(e, i)}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onPointerCancel={() => setDrag(null)}
              >
                <i />
              </button>
            )
          })}
          {editable ? (
            <button
              type="button"
              className={`tr-handle${it.lock === 'fixed' ? ' locked' : ''}${drag?.kind === 'end' ? ' active' : ''}${nudge ? ' nudge' : ''}`}
              style={{ left: tl.departureIndex * dw }}
              aria-label={
                it.lock === 'fixed' ? 'Volta marcada' : 'Volta: arraste, ou use as setas ← →, para mudar'
              }
              onKeyDown={(e) => onHandleKey(e, 'end')}
              title={it.lock === 'fixed' ? 'Volta marcada' : 'Arraste: a volta'}
              onPointerDown={(e) => onHandleDown(e, 'end')}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={() => setDrag(null)}
            >
              <i />
            </button>
          ) : null}

          {/* Marcas do que vai acontecer ao soltar */}
          {lifted?.intent.kind === 'reorder' ? (
            <span
              className="tr-caret"
              style={{
                left:
                  (() => {
                    const others = segs.filter((s) => s.kind === 'stop' && s.id !== lifted.stopId)
                    const t = lifted.intent.toIndex
                    const ref = others[t]
                    if (ref) return ref.startIndex
                    const last = others[others.length - 1]
                    return last ? last.startIndex + last.nights : 0
                  })() * dw,
              }}
            />
          ) : null}
          {shelfDrag?.intent?.kind === 'split' ? (
            <span
              className="tr-cut"
              style={{ left: (stopStart(shelfDrag.intent.stopId) + shelfDrag.intent.afterOrdinal) * dw }}
            />
          ) : null}
          {shelfDrag?.intent?.kind === 'insert' ? (
            <span
              className="tr-caret"
              style={{
                left:
                  (it.stops[shelfDrag.intent.index]
                    ? stopStart(it.stops[shelfDrag.intent.index]!.id)
                    : tl.departureIndex) * dw,
              }}
            />
          ) : null}

          <div
            className={`tr-ruler${panning ? ' panning' : ''}`}
            role="group"
            aria-label={
              coarse
                ? 'Dias da viagem: toque ou arraste para ver cada dia'
                : 'Dias da viagem: clique para ver o dia; arraste para rolar a trilha'
            }
            onPointerDown={onScrubDown}
            onPointerMove={onScrubMove}
            onPointerUp={onScrubEnd}
            onPointerCancel={onScrubEnd}
          >
            {Array.from({ length: tl.total + 1 }, (_, i) => {
              const date = view.start ? addDays(view.start, i) : null
              const wd = date ? weekday(date) : ''
              const isWeekend = wd === 'sáb' || wd === 'dom'
              const isToday = phase.kind === 'during' && phase.day - 1 === i
              const newMonth = date && (i === 0 || date.slice(8) === '01')
              const trips = dayTrips.get(i) ?? []
              const tripNames = trips
                .map((id) => doc.destinations.find((d) => d.id === id)?.name)
                .filter(Boolean)
                .join(', ')
              const cls = [
                'tr-day',
                isWeekend ? 'we' : '',
                isToday ? 'today' : '',
                i === tl.total ? 'ret' : '',
                cursor === i ? 'cur' : '',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <button
                  key={i}
                  type="button"
                  className={cls}
                  style={{ width: dw }}
                  aria-label={`${date ? `${wd} ${ddmm(date)}` : `dia ${i + 1}`}${tripNames ? `, bate-volta: ${tripNames}` : ''}`}
                  aria-pressed={cursor === i}
                  onClick={() => {
                    if (!panned.current) setCursorDay(i)
                  }}
                >
                  <i>
                    {date
                      ? newMonth && dw >= 26
                        ? MONTHS[Number(date.slice(5, 7)) - 1]
                        : dw >= 22
                          ? wd[0]!.toUpperCase()
                          : ''
                      : 'D'}
                  </i>
                  <b>{date ? (dw >= 18 || i % 2 === 0 ? date.slice(8) : '') : i + 1}</b>
                  {trips.length ? (
                    <span className="tr-trips" aria-hidden="true">
                      {trips.map((id) => (
                        <em
                          key={id}
                          className="tr-trip"
                          style={{ background: colorOf(doc.destinations, id) }}
                        />
                      ))}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {editable ? (
        <div className="shelf" aria-label="Destinos guardados: arraste para a trilha">
          {shelf.length ? <span className="shelf-t">GUARDADOS · ARRASTE PARA A TRILHA</span> : null}
          {shelf.map((d) => (
            <button
              key={d.id}
              type="button"
              className="chip-dest"
              style={{ ['--c' as string]: colorOf(doc.destinations, d.id) }}
              onPointerDown={(e) => onLiftDown(e, 'shelf', d.id)}
              onPointerMove={onLiftMove}
              onPointerUp={(e) => onLiftUp(e, 'shelf', d.id)}
              onClick={(e) => e.detail === 0 && openSheet({ kind: 'where', destId: d.id })}
              onPointerCancel={onLiftCancel}
              onContextMenu={(e) => e.preventDefault()}
              aria-label={`${d.name}: ${chipHint}`}
            >
              <span className="seal sm" style={{ ['--c' as string]: colorOf(doc.destinations, d.id) }}>
                {sealOf(d)}
              </span>
              {d.name}
            </button>
          ))}
          <button
            type="button"
            className="chip-dest add"
            onClick={() =>
              openSheet({
                kind: 'dest',
                title: 'Que destino entra na viagem?',
                pick: (destId) => openSheet({ kind: 'where', destId }),
              })
            }
          >
            + Adicionar destino
          </button>
        </div>
      ) : null}
      {hint && editable ? (
        <p className="tr-hint">
          {coarse
            ? 'Segure um destino para arrastar · toque para ver os dias · ◂▸ muda as noites.'
            : 'Arraste um destino para mudar a data ou a ordem · clique para ver os dias · ◂▸ muda as noites · arraste a régua para rolar.'}
        </p>
      ) : null}

      {lifted ? (
        <div className={`trash${lifted.trash ? ' hot' : ''}`} ref={trashRef} aria-hidden="true">
          <span>
            <PixelTrash px={4} />
            Tirar do roteiro
          </span>
        </div>
      ) : null}
      {shelfDrag ? (
        <div
          className="drag-ghost chip-dest"
          style={{
            left: shelfDrag.x,
            top: shelfDrag.y,
            ['--c' as string]: colorOf(doc.destinations, shelfDrag.destId),
          }}
        >
          {doc.destinations.find((d) => d.id === shelfDrag.destId)?.name}
        </div>
      ) : null}
    </section>
  )
}
