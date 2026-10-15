import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { bookingStatus, days as allDays, legName, lodgingGaps, tripPhase } from '../engine'
import type { Booking, ID } from '../engine'
import { todayISO, useApp } from '../app/store'
import { fillOpenChoice } from '../app/choices'
import { colorOf } from './colors'
import { DayRow } from './Roteiro'
import { TaskSection } from './TaskViews'

// O cartão do dia (spec §17.2, como a "barra de dias" da v1): o dia escolhido na trilha,
// onde se está, onde se dorme e as atividades do dia. Antes da viagem começa no dia 1; durante, em hoje.

export function DayCard() {
  const doc = useApp((s) => s.doc)!
  const cursor = useApp((s) => s.cursorDay)
  const setCursorDay = useApp((s) => s.setCursorDay)
  const openSheet = useApp((s) => s.openSheet)
  const it = doc.itinerary
  const ds = useMemo(() => allDays(it, doc.places), [it, doc.places])
  if (!ds.length) return null

  const phase = tripPhase(it, todayISO())
  const i = Math.max(0, Math.min(ds.length - 1, cursor ?? (phase.kind === 'during' ? phase.day - 1 : 0)))
  const d = ds[i]!
  const names = { destinations: doc.destinations, places: doc.places }
  const destName = (id: string | null) => doc.destinations.find((x) => x.id === id)?.name ?? ''
  const leg = d.travelLegId ? it.legs.find((l) => l.id === d.travelLegId) : undefined
  const stop = d.stopId ? it.stops.find((s) => s.id === d.stopId) : undefined
  const lastDest = [...it.stops].reverse().find((s) => s.destinationId)?.destinationId ?? null
  const legTo = (l: typeof leg): ID | null =>
    l && l.to !== 'home' ? (it.stops.find((s) => s.id === l.to)?.destinationId ?? null) : null

  let where: string
  let actDest: ID | null = d.destinationId
  if (d.kind === 'departure') {
    where = leg ? `volta: ${legName(it, leg, names)}` : 'dia da volta'
    actDest = lastDest
  } else if (d.kind === 'aboard') {
    where = leg ? `a bordo: ${legName(it, leg, names)}` : 'noite a bordo'
    actDest = legTo(leg)
  } else if (d.kind === 'open')
    where = stop?.openIn ? `${stop.openIn.name} · cidades em aberto` : 'noite em aberto'
  else if (leg) where = `chega em ${destName(d.destinationId)}`
  else where = `em ${destName(d.destinationId)}`

  // Onde se dorme nesta noite.
  let night: JSX.Element | null = null
  if (d.kind === 'stop' && stop?.destinationId) {
    const openLodging = () => openSheet({ kind: 'lodging', stopId: stop.id })
    if (stop.lodging === 'friends' || stop.lodging === 'onboard')
      night = (
        <button type="button" className="pill" onClick={openLodging}>
          <span aria-hidden="true">宿</span> {stop.lodging === 'friends' ? 'com amigos' : 'a bordo'}
        </button>
      )
    else {
      const gap = lodgingGaps(it, doc.bookings).find((g) => g.stopId === stop.id)
      if (gap?.missing.some((m) => m.ordinal === d.ordinal))
        night = (
          <button type="button" className="pill warn" onClick={openLodging}>
            <span aria-hidden="true">宿</span> onde vocês dormem?
          </button>
        )
      else {
        const b = doc.bookings.find(
          (x): x is Extract<Booking, { kind: 'lodging' }> =>
            x.kind === 'lodging' &&
            !x.archived &&
            x.destinationId === stop.destinationId &&
            bookingStatus(x, it).stopId === stop.id &&
            (!d.date || (x.checkin <= d.date && d.date < x.checkout)),
        )
        night = b ? (
          <button type="button" className={`pill${b.status === 'booked' ? ' ok' : ''}`} onClick={openLodging}>
            宿 {b.title} {b.status === 'booked' ? '済' : '· ainda não reservada'}
          </button>
        ) : (
          <button type="button" className="pill" onClick={openLodging}>
            宿 hospedagem em {destName(stop.destinationId)}
          </button>
        )
      }
    }
  } else if (d.kind === 'aboard') night = <span className="pill">宿 noite a bordo</span>

  return (
    <section
      className="daycard"
      aria-label="Dia escolhido"
      style={{ ['--c' as string]: colorOf(doc.destinations, d.destinationId) } as CSSProperties}
    >
      <div className="dc-top">
        <button
          type="button"
          className="icon-btn"
          aria-label="Dia anterior"
          disabled={i === 0}
          onClick={() => setCursorDay(i - 1)}
        >
          ‹
        </button>
        <div className="dc-num">
          DIA <b>{i + 1}</b> de {ds.length}
        </div>
        <div className="dc-title">
          <h4>{d.label}</h4>
          <span>{where}</span>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Dia seguinte"
          disabled={i === ds.length - 1}
          onClick={() => setCursorDay(i + 1)}
        >
          ›
        </button>
      </div>
      {night ? <div className="pills">{night}</div> : null}
      {d.kind === 'open' && d.stopId ? (
        <div className="row">
          <button type="button" className="btn small main" onClick={() => fillOpenChoice(d.stopId!)}>
            {stop?.openIn ? '+ Escolher cidade' : '+ Escolher destino'}
          </button>
        </div>
      ) : null}
      <DayRow day={d} destId={actDest} compact />
      {d.ref ? <TaskSection about={{ kind: 'day', ref: d.ref }} title="TAREFAS DO DIA" compact /> : null}
    </section>
  )
}
