import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { bookingStatus, days as allDays, legName, lodgingGaps, tripPhase } from '../engine'
import type { Booking } from '../engine'
import { todayISO, useApp } from '../app/store'
import { markLodging } from '../app/choices'
import { colorOf } from './colors'
import { DayRow } from './Roteiro'

// O cartão do dia (spec §17.2, como a "barra de dias" da v1): o dia escolhido na trilha,
// onde se está, onde se dorme e as figurinhas do dia. Antes da viagem começa no dia 1; durante, em hoje.

export function DayCard() {
  const doc = useApp((s) => s.doc)!
  const cursor = useApp((s) => s.cursorDay)
  const setCursorDay = useApp((s) => s.setCursorDay)
  const it = doc.itinerary
  const ds = useMemo(() => allDays(it, doc.places), [it, doc.places])
  if (!ds.length) return null

  const phase = tripPhase(it, todayISO())
  const i = Math.max(0, Math.min(ds.length - 1, cursor ?? (phase.kind === 'during' ? phase.day - 1 : 0)))
  const d = ds[i]!
  const names = { destinations: doc.destinations, places: doc.places }
  const destName = (id: string | null) => doc.destinations.find((x) => x.id === id)?.name ?? ''
  const leg = d.travelLegId ? it.legs.find((l) => l.id === d.travelLegId) : undefined

  let where: string
  if (d.kind === 'departure') where = leg ? `volta: ${legName(it, leg, names)}` : 'dia da volta'
  else if (d.kind === 'aboard') where = leg ? `a bordo: ${legName(it, leg, names)}` : 'noite a bordo'
  else if (d.kind === 'open') where = 'noite em aberto'
  else if (leg) where = `chega em ${destName(d.destinationId)}`
  else where = `em ${destName(d.destinationId)}`

  // Onde se dorme nesta noite.
  const stop = d.stopId ? it.stops.find((s) => s.id === d.stopId) : undefined
  let night: JSX.Element | null = null
  if (d.kind === 'stop' && stop?.destinationId) {
    if (stop.lodging === 'friends') night = <span className="pill">宿 casa de amigos</span>
    else if (stop.lodging === 'onboard') night = <span className="pill">宿 a bordo</span>
    else {
      const gap = lodgingGaps(it, doc.bookings).find((g) => g.stopId === stop.id)
      if (gap?.missing.some((m) => m.ordinal === d.ordinal))
        night = (
          <button type="button" className="pill warn" onClick={() => markLodging(stop.id)}>
            宿 sem hospedagem · marcar reservada
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
          <span className="pill ok">宿 {b.title} 済</span>
        ) : (
          <span className="pill">宿 hospedagem em {destName(stop.destinationId)}</span>
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
      <DayRow day={d} compact />
    </section>
  )
}
