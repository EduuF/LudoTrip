import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent, ReactNode } from 'react'
import type { DayRef } from '../engine'
import { useApp } from '../app/store'
import { moveOnce, sameDay, scheduleOnce } from '../app/choices'
import { ChipDragCtx } from './chipDragCtx'
import type { ChipItem } from './chipDragCtx'
import { MOUSE_DISTANCE } from './pointer'
import { RARITY } from './rarity'

// Arrastar atividades no roteiro (spec §17.4, §17.10): uma do catálogo até um dia (mais um dia), uma de
// um dia para outro, ou de um dia para o catálogo (tira do dia). Mouse arrasta depois de 6 px; o dedo segura 300 ms. Um
// provedor só para a tela do Mapa: dá para levar do cartão do dia a qualquer dia do roteiro.

const TOUCH_HOLD_MS = 300
const TOUCH_TOLERANCE = 9

interface Pend {
  item: ChipItem
  x: number
  y: number
  timer: number
  el: HTMLElement
  pid: number
  mouse: boolean
}
interface Lift {
  item: ChipItem
  x: number
  y: number
}

export function ChipDragProvider({ children }: { children: ReactNode }) {
  const act = useApp((s) => s.act)
  const places = useApp((s) => s.doc?.places)
  const [lift, setLift] = useState<Lift | null>(null)
  const liftRef = useRef<Lift | null>(null)
  const pend = useRef<Pend | null>(null)
  const hover = useRef<HTMLElement | null>(null)
  const edgeY = useRef<number | null>(null)
  const headHover = useRef<{ id: string | null; t: number }>({ id: null, t: 0 })

  // Com algo levantado, o dedo não rola a página; perto das bordas, a página rola sozinha.
  useEffect(() => {
    const block = (e: TouchEvent) => {
      if (liftRef.current && e.cancelable) e.preventDefault()
    }
    addEventListener('touchmove', block, { passive: false })
    let raf = 0
    const loop = () => {
      const y = edgeY.current
      if (y !== null && liftRef.current) {
        if (y < 120) scrollBy(0, -10)
        else if (y > innerHeight - 160) scrollBy(0, 10)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      removeEventListener('touchmove', block)
      cancelAnimationFrame(raf)
    }
  }, [])

  const setHover = (el: HTMLElement | null) => {
    if (!el && headHover.current.id) {
      clearTimeout(headHover.current.t)
      headHover.current = { id: null, t: 0 }
    }
    if (hover.current === el) return
    hover.current?.classList.remove('drop')
    el?.classList.add('drop')
    hover.current = el
  }

  const liftNow = (p: Pend) => {
    try {
      p.el.setPointerCapture(p.pid)
    } catch {
      /* o dedo já saiu */
    }
    if (!p.mouse) navigator.vibrate?.(12)
    const l = { item: p.item, x: p.x, y: p.y }
    liftRef.current = l
    setLift(l)
  }

  const drop = (item: ChipItem, target: HTMLElement | null) => {
    if (!target) return
    const ref = target.dataset.dayref
    if (ref) {
      const day = JSON.parse(ref) as DayRef
      // Do catálogo, sempre mais um dia; de um dia, muda de dia. O mesmo dia duas vezes só avisa.
      if (item.kind === 'loose') scheduleOnce(item.placeId, day)
      else if (!sameDay(item.from, day)) moveOnce(item.visitId, item.placeId, day)
      return
    }
    if (target.dataset.loose !== undefined && item.kind === 'visit')
      act({ type: 'engine', command: { type: 'unscheduleVisit', visitId: item.visitId } })
  }

  const moveTo = (x: number, y: number) => {
    const l = liftRef.current
    if (!l) return
    edgeY.current = y
    setLift({ ...l, x, y })
    const el = document.elementFromPoint?.(x, y) ?? null
    const under = el?.closest<HTMLElement>('[data-dayref],[data-loose]') ?? null
    setHover(under)
    // Pairar 400 ms sobre um destino fechado abre o cartão dele (o dia-alvo fica à vista).
    const head = el?.closest<HTMLElement>('[data-stophead]')?.dataset.stophead ?? null
    if (head !== headHover.current.id) {
      clearTimeout(headHover.current.t)
      headHover.current = {
        id: head,
        t: head ? window.setTimeout(() => useApp.getState().openStopCard(head), 400) : 0,
      }
    }
  }

  const finish = (item: ChipItem) => {
    const target = hover.current
    setHover(null)
    liftRef.current = null
    setLift(null)
    edgeY.current = null
    drop(item, target)
  }

  const down = (e: RPointerEvent<HTMLElement>, item: ChipItem) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if (pend.current) clearTimeout(pend.current.timer)
    const mouse = e.pointerType !== 'touch'
    const p: Pend = {
      item,
      x: e.clientX,
      y: e.clientY,
      timer: 0,
      el: e.currentTarget,
      pid: e.pointerId,
      mouse,
    }
    if (!mouse)
      p.timer = window.setTimeout(() => {
        if (pend.current !== p) return
        pend.current = null
        liftNow(p)
      }, TOUCH_HOLD_MS)
    pend.current = p
  }

  const move = (e: RPointerEvent<HTMLElement>) => {
    const p = pend.current
    if (p && !liftRef.current) {
      const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y)
      if (p.mouse) {
        if (dist <= MOUSE_DISTANCE) return
        pend.current = null
        liftNow(p)
      } else {
        if (dist > TOUCH_TOLERANCE) {
          clearTimeout(p.timer)
          pend.current = null
        }
        return
      }
    }
    moveTo(e.clientX, e.clientY)
  }

  const up = (e: RPointerEvent<HTMLElement>, item: ChipItem, onTap: () => void) => {
    const p = pend.current
    if (p) clearTimeout(p.timer)
    pend.current = null
    if (liftRef.current) return finish(item)
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) <= TOUCH_TOLERANCE) onTap()
  }

  // O navegador cancela o ponteiro quando acha que o dedo quer rolar; com algo levantado, o arraste
  // segue pelos eventos de toque até o dedo soltar (como na trilha).
  const cancel = (e: RPointerEvent<HTMLElement>) => {
    if (pend.current) clearTimeout(pend.current.timer)
    pend.current = null
    const l = liftRef.current
    if (!l) return
    if (e.pointerType !== 'touch') {
      setHover(null)
      liftRef.current = null
      setLift(null)
      return
    }
    const item = l.item
    const onMove = (ev: TouchEvent) => {
      const t = ev.touches[0]
      if (!t) return
      if (ev.cancelable) ev.preventDefault()
      moveTo(t.clientX, t.clientY)
    }
    const onEnd = (ev: TouchEvent) => {
      removeEventListener('touchmove', onMove)
      removeEventListener('touchend', onEnd)
      removeEventListener('touchcancel', onEnd)
      if (ev.type === 'touchend') finish(item)
      else {
        setHover(null)
        liftRef.current = null
        setLift(null)
      }
    }
    addEventListener('touchmove', onMove, { passive: false })
    addEventListener('touchend', onEnd)
    addEventListener('touchcancel', onEnd)
  }

  const ghost = lift ? places?.find((p) => p.id === lift.item.placeId) : null
  return (
    <ChipDragCtx.Provider value={{ lifted: lift?.item ?? null, down, move, up, cancel }}>
      {children}
      {lift && ghost ? (
        <div className={`drag-ghost mini r-${ghost.rarity}`} style={{ left: lift.x, top: lift.y }}>
          {RARITY[ghost.rarity].gems} {ghost.name}
        </div>
      ) : null}
    </ChipDragCtx.Provider>
  )
}
