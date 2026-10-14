import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { days as allDays, plural } from '../engine'
import type { DayRef, ID, Stop } from '../engine'
import { useApp } from '../app/store'
import { cityName, windowText } from '../app/choices'
import { dayGroups, gapText, norm, SEARCH_FROM } from './timeline'
import type { Group } from './timeline'
import { colorOf, sealOf } from './colors'
import { Seal } from './kit'

// Escolher onde e quando (spec §17.10): a viagem como uma linha do tempo, um destino por linha, com
// frestas "+" entre eles, uma sugestão fixada no topo e busca quando a viagem é longa. Substitui as
// listas de frases ("Entre A e B", "Depois de X", um botão por dia), que não escalam.

function Search({ q, setQ, label }: { q: string; setQ: (q: string) => void; label: string }) {
  return (
    <input
      className="input tl-search"
      type="search"
      value={q}
      onChange={(e) => setQ(e.target.value)}
      placeholder="Buscar destino…"
      aria-label={label}
      autoComplete="off"
    />
  )
}

/** Centraliza a linha marcada ao abrir (a sugestão ou a posição atual). */
function useCenter(dep: unknown) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('.tl-mark')?.scrollIntoView?.({ block: 'center' })
  }, [dep])
  return ref
}

export interface TimelineProps {
  /** Fresta sugerida (fixada no topo e marcada na lista). */
  suggest?: number | null
  /** Por que a sugestão ("no caminho"). */
  suggestWhy?: string
  /** Frestas que não mudam nada (a posição atual, ao mudar a ordem). */
  here?: number[]
  /** Tocar numa fresta. Sem isto, as frestas não aparecem. */
  onGap?: (index: number) => void
  /** Tocar num destino (quando `stopOk` aceita). */
  onStop?: (stop: Stop) => void
  stopOk?: (stop: Stop) => boolean
  /** O que tocar no destino faz ("no meio", "cede"). */
  stopTag?: (stop: Stop) => string
  /** Só estes destinos aparecem (modo "de onde sai a noite"). */
  only?: (stop: Stop) => boolean
}

export function TimelinePicker({
  suggest = null,
  suggestWhy = 'No caminho',
  here = [],
  onGap,
  onStop,
  stopOk = () => true,
  stopTag,
  only,
}: TimelineProps) {
  const doc = useApp((s) => s.doc)!
  const it = doc.itinerary
  const [q, setQ] = useState('')
  const box = useCenter(suggest)
  const stops = it.stops
  const shown = stops.filter((s) => !only || only(s))
  const hit = (s: Stop) => !q.trim() || norm(cityName(s.id)).includes(norm(q.trim()))
  // Com busca, ficam os destinos achados e as frestas vizinhas a eles.
  const visible = new Set(shown.filter(hit).map((s) => s.id))
  const gapVisible = (i: number) =>
    !q.trim() || (stops[i - 1] && visible.has(stops[i - 1]!.id)) || (stops[i] && visible.has(stops[i]!.id))

  const gap = (i: number) => {
    if (!onGap || !gapVisible(i)) return null
    const isHere = here.includes(i)
    const isSug = suggest === i
    return (
      <button
        key={`g${i}`}
        type="button"
        className={`tl-gap${isSug ? ' sug tl-mark' : ''}${isHere ? ' here' : ''}`}
        disabled={isHere}
        aria-label={isHere ? `Está aqui: ${gapText(stops, i)}` : `Pôr ${gapText(stops, i)}`}
        onClick={() => onGap(i)}
      >
        <span className="tl-plus" aria-hidden="true">
          {isHere ? '•' : '+'}
        </span>
        {isSug ? <span className="tl-why">{suggestWhy.toLowerCase()}</span> : null}
        {isHere ? <span className="tl-why">está aqui</span> : null}
      </button>
    )
  }

  const stopRow = (s: Stop) => {
    if (!visible.has(s.id)) return null
    const color = colorOf(doc.destinations, s.destinationId)
    const dest = doc.destinations.find((d) => d.id === s.destinationId)
    const name = cityName(s.id)
    const can = !!onStop && stopOk(s)
    const body = (
      <>
        {s.destinationId ? <Seal text={sealOf(dest)} color={color} /> : <span className="tl-open">?</span>}
        <span className="tl-t">
          <b>{name}</b>
          <small>
            {windowText(it, s.id)} · {plural(s.days.length, 'noite', 'noites')}
          </small>
        </span>
        {can && stopTag ? <span className="tl-tag">{stopTag(s)}</span> : null}
      </>
    )
    return can ? (
      <button
        key={s.id}
        type="button"
        className="tl-stop on"
        style={{ ['--c' as string]: color } as CSSProperties}
        aria-label={`${name}${stopTag ? `: ${stopTag(s)}` : ''}`}
        onClick={() => onStop!(s)}
      >
        {body}
      </button>
    ) : (
      <div key={s.id} className="tl-stop" style={{ ['--c' as string]: color } as CSSProperties}>
        {body}
      </div>
    )
  }

  const rows: (JSX.Element | null)[] = []
  if (onGap)
    rows.push(
      <div key="ida" className="tl-end">
        ✈ Ida
      </div>,
    )
  stops.forEach((s, i) => {
    rows.push(gap(i))
    if (!only || only(s)) rows.push(stopRow(s))
  })
  rows.push(gap(stops.length))
  if (onGap)
    rows.push(
      <div key="volta" className="tl-end">
        ✈ Volta
      </div>,
    )

  return (
    <>
      {suggest !== null && onGap ? (
        <div className="tl-suggest">
          <span>
            ★ {suggestWhy}: <b>{gapText(stops, suggest)}</b>
          </span>
          <button type="button" className="btn small main" onClick={() => onGap(suggest)}>
            Pôr aqui
          </button>
        </div>
      ) : null}
      {shown.length >= SEARCH_FROM ? <Search q={q} setQ={setQ} label="Buscar destino na viagem" /> : null}
      <div className="tl" ref={box}>
        {rows}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Pôr em qual dia? Os destinos em acordeão (o preferido aberto), os dias em fichas.
// ---------------------------------------------------------------------------

export function DayPicker({
  prefer,
  placeId,
  pick,
}: {
  prefer?: ID | null
  /** Marca (e desliga) os dias em que essa atividade já está. */
  placeId?: ID
  pick: (ref: DayRef) => void
}) {
  const doc = useApp((s) => s.doc)!
  const it = doc.itinerary
  const ds = useMemo(() => allDays(it, doc.places), [it, doc.places])
  const groups = useMemo(() => dayGroups(ds, it.stops), [ds, it.stops])
  const first = groups.find((g) => prefer && g.destinationId === prefer) ?? groups[0]
  const [open, setOpen] = useState<Set<string>>(
    () =>
      new Set(groups.filter((g) => (prefer ? g.destinationId === prefer : g === first)).map((g) => g.key)),
  )
  const [q, setQ] = useState('')
  const box = useCenter(null)
  const nameOf = (g: Group) =>
    g.stopId ? cityName(g.stopId) : g.days[0]?.kind === 'departure' ? 'Volta' : 'A bordo'
  const hit = (g: Group) => !q.trim() || norm(nameOf(g)).includes(norm(q.trim()))
  return (
    <>
      {groups.length >= SEARCH_FROM ? <Search q={q} setQ={setQ} label="Buscar destino na viagem" /> : null}
      <div className="tl" ref={box}>
        {groups.filter(hit).map((g) => {
          const isOpen = open.has(g.key) || (!!q.trim() && groups.filter(hit).length === 1)
          const color = colorOf(doc.destinations, g.destinationId)
          const dest = doc.destinations.find((d) => d.id === g.destinationId)
          return (
            <div key={g.key} className={`tl-group${isOpen ? ' open' : ''}${g === first ? ' tl-mark' : ''}`}>
              <button
                type="button"
                className="tl-stop on"
                aria-expanded={isOpen}
                style={{ ['--c' as string]: color } as CSSProperties}
                onClick={() =>
                  setOpen((o) => {
                    const n = new Set(o)
                    if (n.has(g.key)) n.delete(g.key)
                    else n.add(g.key)
                    return n
                  })
                }
              >
                <Seal text={sealOf(dest)} color={color} />
                <span className="tl-t">
                  <b>{nameOf(g)}</b>
                  <small>
                    {g.days[0]!.label}
                    {g.days.length > 1 ? ` → ${g.days[g.days.length - 1]!.label}` : ''} ·{' '}
                    {plural(g.days.length, 'dia', 'dias')}
                  </small>
                </span>
                <span className="chev" aria-hidden="true">
                  {isOpen ? '▴' : '▾'}
                </span>
              </button>
              {isOpen ? (
                <div className="tl-days">
                  {g.days.map((d) => {
                    const there = !!placeId && d.visits.some((v) => v.placeId === placeId)
                    const n = d.visits.length
                    const tag = d.kind === 'aboard' ? 'a bordo' : d.kind === 'departure' ? 'volta' : ''
                    return (
                      <button
                        key={d.index}
                        type="button"
                        className={`tl-day${there ? ' there' : ''}`}
                        disabled={there}
                        aria-label={`${d.label}${tag ? ` (${tag})` : ''}: ${there ? 'já está aqui' : n ? plural(n, 'atividade', 'atividades') : 'dia livre'}`}
                        onClick={() => pick(d.ref!)}
                      >
                        <b>{d.label}</b>
                        <small>{there ? 'já está' : tag || (n ? `${n} ativ.` : 'livre')}</small>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </>
  )
}
