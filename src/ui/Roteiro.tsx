import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as RPointerEvent } from 'react'
import {
  bookingStatus,
  dayLabel,
  days as allDays,
  ddmm,
  estimateLeg,
  legDayIndex,
  legName,
  lodgingGaps,
  MODE_NAMES,
  placeStates,
  plural,
  stopWindows,
  addDays,
} from '../engine'
import type { Booking, Day, DayRef, ID, Leg, LegMode, Stop } from '../engine'
import { uid, useApp } from '../app/store'
import type { DocAction } from '../app/doc'
import { cityName, markLodging, minusNight, plusNight, removeDayChoice, swapDayChoice } from '../app/choices'
import { colorOf, sealOf } from './colors'
import { Seal, Stepper, Vehicle } from './kit'

// Roteiro (spec §17.4): a lista na ordem da viagem (destinos, trechos e dias), "+ Adicionar destino"
// e a bandeja de figurinhas. A Trilha e o cartão do dia ficam acima, na tela do Mapa.

const NEEDS_TICKET = new Set<LegMode>(['flight', 'train', 'bus', 'boat'])
const SLOT_LABEL = { morning: 'manhã', afternoon: 'tarde', evening: 'noite', any: '' } as const
const SLOT_ORDER = { morning: 0, afternoon: 1, evening: 2, any: 3 } as const

export function RoteiroList() {
  const doc = useApp((s) => s.doc)!
  const it = doc.itinerary
  const ds = useMemo(() => allDays(it, doc.places), [it, doc.places])

  const items: JSX.Element[] = []
  it.stops.forEach((s, i) => {
    const leg = it.legs[i]
    if (leg) items.push(<LegCard key={leg.id} leg={leg} days={ds} />)
    items.push(
      s.destinationId ? (
        <CityCard key={s.id} stop={s} index={i} days={ds} />
      ) : (
        <OpenCard key={s.id} stop={s} index={i} />
      ),
    )
  })
  items.push(<AddDestCard key="add" />)
  const back = it.legs[it.stops.length]
  if (back) items.push(<LegCard key={back.id} leg={back} days={ds} />)

  return <div className="list">{items}</div>
}

/** "… Adicionar destino … Volta": mais um lugar antes de voltar para casa. */
function AddDestCard() {
  const openSheet = useApp((s) => s.openSheet)
  const count = useApp((s) => s.doc!.itinerary.stops.length)
  return (
    <button
      type="button"
      className="card add-dest"
      onClick={() =>
        openSheet({
          kind: 'dest',
          title: 'Que destino entra no fim da viagem?',
          pick: (destId) => openSheet({ kind: 'insert', index: count, destId, nights: 1 }),
        })
      }
    >
      <b>+ Adicionar destino</b>
      <span>Mais um lugar antes da volta. Para pôr no meio, use "+ Parar no caminho" num trecho.</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Cidade
// ---------------------------------------------------------------------------

function CityCard({ stop, index, days }: { stop: Stop; index: number; days: Day[] }) {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const openSheet = useApp((s) => s.openSheet)
  const openStop = useApp((s) => s.openStop)
  const setOpenStop = useApp((s) => s.setOpenStop)
  const it = doc.itinerary
  const dest = doc.destinations.find((d) => d.id === stop.destinationId)
  const w = stopWindows(it).find((x) => x.stopId === stop.id)!
  const n = stop.days.length
  const open = openStop === stop.id
  const dates =
    w.start && w.end
      ? `${dayLabel(w.start)} → ${dayLabel(w.end)}`
      : `dia ${w.startIndex + 1} → dia ${w.startIndex + n + 1}`
  const color = colorOf(doc.destinations, stop.destinationId)

  const lodgings = doc.bookings.filter(
    (b): b is Extract<Booking, { kind: 'lodging' }> =>
      b.kind === 'lodging' && !b.archived && b.destinationId === stop.destinationId,
  )
  const gap = lodgingGaps(it, doc.bookings).find((g) => g.stopId === stop.id)
  const pills: JSX.Element[] = []
  if (stop.lodging === 'friends' || stop.lodging === 'onboard')
    pills.push(
      <span key="l" className="pill">
        {stop.lodging === 'friends' ? 'casa de amigos' : 'a bordo'}
      </span>,
    )
  else {
    for (const b of lodgings) {
      const st = bookingStatus(b, it)
      if (st.stopId !== stop.id) continue
      pills.push(
        <button
          key={b.id}
          type="button"
          className={`pill ${st.state === 'ok' ? 'ok' : 'bad'}`}
          onClick={() => act({ type: 'removeBooking', id: b.id })}
          aria-label={`${b.title}. Toque para desmarcar`}
        >
          {b.title} · {ddmm(b.checkin)} a {ddmm(b.checkout)} {st.state === 'ok' ? '済' : '· fora das datas'}
        </button>,
      )
    }
    if (gap && w.start && w.end) {
      pills.push(
        <button key="gap" type="button" className="pill warn" onClick={() => markLodging(stop.id)}>
          {gap.partial
            ? `${gap.missing.map((m) => m.label).join(', ')} sem hospedagem`
            : 'Hospedagem: falta reservar'}{' '}
          · marcar reservada
        </button>,
      )
    }
  }

  return (
    <article className="card" id={`c-${stop.id}`} style={{ ['--c' as string]: color } as CSSProperties}>
      <div className="c-head">
        <Seal text={sealOf(dest)} color={color} />
        <div className="c-title">
          <h3>{dest?.name}</h3>
          <div className="dates">{dates}</div>
          {stop.tentative ? (
            <div className="note">noites incertas: as datas depois ficam estimadas</div>
          ) : null}
        </div>
      </div>
      <div className="row">
        <Stepper
          value={n}
          min={0}
          label={`Noites em ${dest?.name}`}
          onMinus={() => minusNight(stop.id)}
          onPlus={() => plusNight(stop.id)}
        />
        <span className="spacer" />
        <button
          type="button"
          className="btn small"
          onClick={() => openSheet({ kind: 'city', stopId: stop.id })}
        >
          Mais ações
        </button>
      </div>
      {pills.length ? <div className="pills">{pills}</div> : null}
      <button
        type="button"
        className="link"
        aria-expanded={open}
        onClick={() => setOpenStop(open ? null : stop.id)}
        style={{ alignSelf: 'flex-start' }}
      >
        {open ? 'Fechar os dias' : `Planejar os dias (${n}) e colar figurinhas`}
      </button>
      {open ? (
        <div className="days">
          {days
            .filter((d) => d.stopId === stop.id && d.kind === 'stop')
            .map((d) => (
              <DayRow key={d.index} day={d} menu={() => dayMenu(stop, d)} />
            ))}
          {index === it.stops.length - 1
            ? days
                .filter((d) => d.kind === 'departure')
                .map((d) => <DayRow key="dep" day={d} title="dia da volta" />)
            : null}
        </div>
      ) : null}
    </article>
  )

  function dayMenu(s: Stop, d: Day) {
    openSheet({
      kind: 'choice',
      title: d.label,
      options: [
        {
          label: 'Remover este dia',
          detail: ['Depois você escolhe para onde vai a noite.'],
          run: () => removeDayChoice(s.id, d.ordinal),
        },
        ...(s.days.length > 1
          ? [
              {
                label: 'Trocar com outro dia',
                detail: ['As figurinhas trocam de dia; as datas ficam.'],
                run: () => swapDayChoice(s.id, d.ordinal),
              },
            ]
          : []),
      ],
    })
  }
}

export function DayRow({
  day,
  menu,
  title,
  compact,
}: {
  day: Day
  menu?: () => void
  title?: string
  /** Sem a coluna da data (o cartão do dia já a mostra). */
  compact?: boolean
}) {
  const doc = useApp((s) => s.doc)!
  const openSheet = useApp((s) => s.openSheet)
  const trips = day.dayTrips.map((x) => doc.destinations.find((d) => d.id === x)?.name).filter(Boolean)
  const visits = [...day.visits].sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot])
  return (
    <div
      className={`day${compact ? ' compact' : ''}`}
      data-dayref={day.ref ? JSON.stringify(day.ref) : undefined}
    >
      {compact ? null : (
        <div className="d">
          {day.label}
          {title ? <small>{title}</small> : null}
          {trips.length ? <small>bate-volta: {trips.join(', ')}</small> : null}
        </div>
      )}
      <div className="slots">
        {visits.map((v) => {
          const p = doc.places.find((x) => x.id === v.placeId)
          return (
            <button
              key={v.id}
              type="button"
              className={`mini r-${p?.rarity ?? 'want'}${v.visited ? ' visited' : ''}`}
              onClick={() => openSheet({ kind: 'visit', visitId: v.id })}
            >
              {SLOT_LABEL[v.slot] ? <span className="slot">{SLOT_LABEL[v.slot]}</span> : null}
              {p?.name ?? 'Figurinha'}
              {v.visited ? ' 済' : ''}
            </button>
          )
        })}
        {day.ref ? (
          <button type="button" className="mini add" onClick={() => pickStickerFor(day)}>
            + colar
          </button>
        ) : null}
      </div>
      {menu ? (
        <button type="button" className="icon-btn" aria-label={`Opções de ${day.label}`} onClick={menu}>
          ⋯
        </button>
      ) : (
        <span />
      )}
    </div>
  )

  function pickStickerFor(d: Day) {
    const st = useApp.getState()
    const dd = st.doc!
    const states = placeStates(dd.itinerary, dd.places)
    const here = d.destinationId
    const sorted = [...dd.places].sort(
      (a, b) =>
        Number(!!states.get(a.id)?.days.length) - Number(!!states.get(b.id)?.days.length) ||
        Number(b.destinationId === here) - Number(a.destinationId === here),
    )
    openSheet({
      kind: 'choice',
      title: `Colar qual figurinha em ${d.label}?`,
      options: sorted.map((p) => {
        const s = states.get(p.id)
        const where = dd.destinations.find((x) => x.id === p.destinationId)?.name ?? ''
        return {
          label: p.name,
          detail: [
            `${where}${p.destinationId !== here ? ' · bate-volta' : ''} · ${p.rarity === 'must' ? 'Imperdível' : p.rarity === 'want' ? 'Quero' : 'Se der'}${s?.days.length ? ` · já em ${s.days.map((x) => x.label).join(', ')}` : ''}`,
          ],
          run: () =>
            st.act({
              type: 'engine',
              command: { type: 'scheduleVisit', visitId: uid('v'), placeId: p.id, day: d.ref! },
            }),
          main: !s?.days.length && p.destinationId === here,
        }
      }),
    })
  }
}

// ---------------------------------------------------------------------------
// Noites em aberto
// ---------------------------------------------------------------------------

function OpenCard({ stop, index }: { stop: Stop; index: number }) {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const openSheet = useApp((s) => s.openSheet)
  const it = doc.itinerary
  const n = stop.days.length
  const prev = it.stops[index - 1]
  const next = it.stops[index + 1]
  const same = prev?.destinationId && prev.destinationId === next?.destinationId
  const ds = allDays(it).filter((d) => d.stopId === stop.id && d.kind === 'open')
  const when = ds.length
    ? ds.length === 1
      ? ds[0]!.label
      : `${ds[0]!.label} a ${ds[ds.length - 1]!.label}`
    : ''
  return (
    <article className="card open-nights" id={`c-${stop.id}`}>
      <div className="c-title">
        <h3>{plural(n, 'noite em aberto', 'noites em aberto')}</h3>
        <div className="dates">{when}</div>
      </div>
      <div className="row">
        <button
          type="button"
          className="btn small main"
          onClick={() =>
            openSheet({
              kind: 'dest',
              title: 'Que destino fica nessas noites?',
              pick: (destId) =>
                n === 1
                  ? act({
                      type: 'engine',
                      command: { type: 'fillOpen', stopId: stop.id, destinationId: destId },
                    })
                  : openSheet({ kind: 'fill', stopId: stop.id, destId, nights: n, side: 'start' }),
            })
          }
        >
          + Escolher destino
        </button>
        {same ? (
          <button
            type="button"
            className="btn small"
            onClick={() =>
              act({ type: 'engine', command: { type: 'stretchInto', stopId: stop.id, side: 'before' } })
            }
          >
            Juntar {cityName(prev.id)}
          </button>
        ) : (
          <>
            {prev?.destinationId ? (
              <button
                type="button"
                className="btn small"
                onClick={() =>
                  act({ type: 'engine', command: { type: 'stretchInto', stopId: stop.id, side: 'before' } })
                }
              >
                Esticar {cityName(prev.id)}
              </button>
            ) : null}
            {next?.destinationId ? (
              <button
                type="button"
                className="btn small"
                onClick={() =>
                  act({ type: 'engine', command: { type: 'stretchInto', stopId: stop.id, side: 'after' } })
                }
              >
                Esticar {cityName(next.id)}
              </button>
            ) : null}
          </>
        )}
        {it.lock === 'free' && it.stops.length > 1 ? (
          <button
            type="button"
            className="btn small ghost"
            onClick={() => act({ type: 'engine', command: { type: 'closeOpen', stopId: stop.id } })}
          >
            Encurtar a viagem
          </button>
        ) : null}
      </div>
    </article>
  )
}

// ---------------------------------------------------------------------------
// Trecho (ponte entre cidades)
// ---------------------------------------------------------------------------

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60)
  const mm = m % 60
  return h ? `${h} h${mm ? ` ${String(mm).padStart(2, '0')}` : ''}` : `${mm} min`
}

function LegCard({ leg, days }: { leg: Leg; days: Day[] }) {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const openSheet = useApp((s) => s.openSheet)
  const it = doc.itinerary
  const names = { destinations: doc.destinations, places: doc.places }
  const idx = legDayIndex(it, leg.id)
  const date = idx !== null && it.start ? addDays(it.start, idx) : null
  const est = estimateLeg(leg, it, doc.destinations)
  const src = { user: 'sua passagem', route: 'rota real', estimate: 'estimativa', none: 'sem distância' }[
    est.source
  ]
  const legDays = days.filter((d) => d.legId === leg.id)

  const endDest = (end: ID | 'home') =>
    end === 'home' ? 'home' : (it.stops.find((s) => s.id === end)?.destinationId ?? null)
  const from = endDest(leg.from)
  const to = endDest(leg.to)

  let ticket: JSX.Element | null = null
  if (from && to) {
    const mine = doc.bookings.filter(
      (b): b is Extract<Booking, { kind: 'transport' }> =>
        b.kind === 'transport' && !b.archived && b.fromDestinationId === from && b.toDestinationId === to,
    )
    const parts: JSX.Element[] = []
    let has = false
    for (const b of mine) {
      const st = bookingStatus(b, it)
      if (st.legId !== leg.id) continue
      has = true
      if (st.state === 'ok')
        parts.push(
          <button
            key={b.id}
            type="button"
            className="ticket on"
            aria-pressed="true"
            onClick={() => act({ type: 'removeBooking', id: b.id })}
          >
            Passagem comprada <span className="hanko">済</span>
          </button>,
        )
      else if (st.state === 'wrong-mode')
        parts.push(
          <div key={b.id} className="row">
            <span className="warnline">Você tem passagem de {MODE_NAMES[b.mode]} para este trecho.</span>
            <button
              type="button"
              className="btn small"
              onClick={() =>
                act({ type: 'engine', command: { type: 'setLegMode', legId: leg.id, mode: b.mode } })
              }
            >
              Voltar para {MODE_NAMES[b.mode]}
            </button>
            <button
              type="button"
              className="btn small ghost"
              onClick={() => act({ type: 'setBooking', id: b.id, patch: { archived: true } })}
            >
              Guardar a passagem
            </button>
          </div>,
        )
      else if (st.state === 'out-of-window')
        parts.push(
          <div key={b.id} className="row">
            <span className="warnline">
              {b.title}: a passagem é de {ddmm(b.date)}
              {date ? `; o trecho agora é ${ddmm(date)}` : ''}.
            </span>
            <button
              type="button"
              className="btn small ghost"
              onClick={() => act({ type: 'setBooking', id: b.id, patch: { archived: true } })}
            >
              Guardar a passagem
            </button>
          </div>,
        )
    }
    if (!has && NEEDS_TICKET.has(leg.mode)) {
      parts.push(
        <button
          key="buy"
          type="button"
          className="ticket"
          aria-pressed="false"
          disabled={!date}
          onClick={() => {
            if (!date) return
            const booking: Booking = {
              id: uid('k'),
              kind: 'transport',
              title: `Passagem ${legName(it, leg, names)}`,
              fromDestinationId: from,
              toDestinationId: to,
              date,
              mode: leg.mode,
              status: 'booked',
            }
            const actions: DocAction[] = [{ type: 'addBooking', booking }]
            if (leg.to === 'home' && it.lock === 'free')
              actions.push({ type: 'engine', command: { type: 'setLock', lock: 'fixed' } })
            act(actions.length > 1 ? { type: 'batch', actions } : actions[0]!, { stamp: true })
          }}
        >
          Passagem: falta comprar {date ? '· marcar comprada' : '· defina a data de ida'}
        </button>,
      )
    }
    ticket = parts.length ? <>{parts}</> : null
  }

  return (
    <div className="leg" id={`l-${leg.id}`}>
      <div className="rail" aria-hidden="true" />
      <div className="body">
        <div className="t">
          <Vehicle mode={leg.mode} px={2} />
          <b>{legName(it, leg, names)}</b>
          <span className="meta">
            {date ? dayLabel(date) : idx !== null ? `dia ${idx + 1}` : ''} · {MODE_NAMES[leg.mode]}
            {leg.dep
              ? ` · ${leg.dep}${leg.arr ? `→${leg.arr}${leg.arrDayOffset ? ` (+${leg.arrDayOffset})` : ''}` : ''}`
              : ''}
          </span>
        </div>
        <div className="meta">
          {est.minutes !== null
            ? `${fmtMinutes(est.minutes)} · ${src}${est.km ? ` · ${est.km} km` : ''}`
            : src}
        </div>
        {ticket}
        {legDays.map((d) => (
          <DayRow key={d.index} day={d} title="noite a bordo" />
        ))}
        <div className="row">
          <button type="button" className="link" onClick={() => openSheet({ kind: 'leg', legId: leg.id })}>
            Editar trecho
          </button>
          {leg.to !== 'home' ? (
            <button
              type="button"
              className="link"
              onClick={() =>
                openSheet({
                  kind: 'dest',
                  title: 'Que destino entra aqui?',
                  pick: (destId) =>
                    openSheet({
                      kind: 'insert',
                      index: it.stops.findIndex((s) => s.id === leg.to),
                      destId,
                      nights: 1,
                    }),
                })
              }
            >
              + Parar no caminho
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bandeja de figurinhas soltas (arrastar até o dia, ou tocar e escolher o dia)
// ---------------------------------------------------------------------------

export function Tray({ stop }: { stop: Stop }) {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const openSheet = useApp((s) => s.openSheet)
  const it = doc.itinerary
  const states = placeStates(it, doc.places)
  const inTrip = new Set(it.stops.map((s) => s.destinationId))
  const loose = (destId: ID) =>
    doc.places.filter((p) => p.destinationId === destId && !states.get(p.id)?.days.length)
  const mine = loose(stop.destinationId!)
  const nearby = doc.destinations.filter((d) => !inTrip.has(d.id)).flatMap((d) => loose(d.id))
  const dest = doc.destinations.find((d) => d.id === stop.destinationId)

  const [lift, setLift] = useState<{ placeId: ID; x: number; y: number } | null>(null)
  const liftRef = useRef(lift)
  liftRef.current = lift
  const pend = useRef<{ placeId: ID; x: number; y: number; t: number; el: HTMLElement; pid: number } | null>(
    null,
  )
  const hover = useRef<HTMLElement | null>(null)
  const edgeY = useRef<number | null>(null)

  useEffect(() => {
    const block = (e: TouchEvent) => {
      if (liftRef.current) e.preventDefault()
    }
    addEventListener('touchmove', block, { passive: false })
    let raf = 0
    const loop = () => {
      const y = edgeY.current
      if (y !== null && liftRef.current) {
        if (y < 120) scrollBy(0, -10)
        else if (y > innerHeight - 230) scrollBy(0, 10)
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
    if (hover.current === el) return
    hover.current?.classList.remove('drop')
    el?.classList.add('drop')
    hover.current = el
  }

  const down = (e: RPointerEvent<HTMLElement>, placeId: ID) => {
    const el = e.currentTarget
    const pid = e.pointerId
    const x = e.clientX
    const y = e.clientY
    const t = window.setTimeout(() => {
      try {
        el.setPointerCapture(pid)
      } catch {
        /* o dedo já saiu */
      }
      navigator.vibrate?.(12)
      setLift({ placeId, x, y })
    }, 260)
    pend.current = { placeId, x, y, t, el, pid }
  }
  const move = (e: RPointerEvent<HTMLElement>) => {
    const p = pend.current
    if (p && !liftRef.current && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 9) {
      clearTimeout(p.t)
      pend.current = null
    }
    if (!liftRef.current) return
    edgeY.current = e.clientY
    setLift({ ...liftRef.current, x: e.clientX, y: e.clientY })
    const under =
      document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-dayref]') ?? null
    setHover(under)
  }
  const up = (e: RPointerEvent<HTMLElement>, placeId: ID) => {
    const p = pend.current
    if (p) clearTimeout(p.t)
    pend.current = null
    edgeY.current = null
    const l = liftRef.current
    if (l) {
      const target = hover.current?.dataset.dayref
      setHover(null)
      setLift(null)
      if (target)
        act({
          type: 'engine',
          command: { type: 'scheduleVisit', visitId: uid('v'), placeId, day: JSON.parse(target) as DayRef },
        })
      return
    }
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) <= 9) {
      const name = doc.places.find((x) => x.id === placeId)?.name ?? 'figurinha'
      openSheet({
        kind: 'days',
        title: `Colar ${name} em qual dia?`,
        prefer: stop.destinationId,
        pick: (ref) =>
          act({ type: 'engine', command: { type: 'scheduleVisit', visitId: uid('v'), placeId, day: ref } }),
      })
    }
  }
  const cancel = () => {
    if (pend.current) clearTimeout(pend.current.t)
    pend.current = null
    edgeY.current = null
    setHover(null)
    setLift(null)
  }

  const sticker = (placeId: ID) => {
    const p = doc.places.find((x) => x.id === placeId)!
    return (
      <button
        key={p.id}
        type="button"
        className={`sticker r-${p.rarity} loose${lift?.placeId === p.id ? ' lifted' : ''}`}
        onPointerDown={(e) => down(e, p.id)}
        onPointerMove={move}
        onPointerUp={(e) => up(e, p.id)}
        onPointerCancel={cancel}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={`${p.name}: toque para escolher o dia, ou segure e arraste até o dia`}
      >
        <span className="gems">{p.rarity === 'must' ? '✦✦✦' : p.rarity === 'want' ? '✦✦' : '✦'}</span>
        <span className="nm">{p.name}</span>
      </button>
    )
  }

  const lifted = lift ? doc.places.find((p) => p.id === lift.placeId) : null
  return (
    <div className="tray" aria-label="Figurinhas soltas">
      <div className="tray-in">
        <div className="tray-t">
          <span>
            SOLTAS · {dest?.name?.toUpperCase()} {mine.length}
          </span>
          <span className="spacer" />
          <span>arraste até o dia</span>
        </div>
        <div className="tray-row">
          {mine.map((p) => sticker(p.id))}
          {nearby.length ? (
            <span className="tray-t" style={{ alignSelf: 'center' }}>
              BATE-VOLTA
            </span>
          ) : null}
          {nearby.map((p) => sticker(p.id))}
          {!mine.length && !nearby.length ? (
            <span className="note">Todas coladas. Crie mais na Mochila.</span>
          ) : null}
        </div>
      </div>
      {lift && lifted ? (
        <div
          className={`drag-ghost sticker r-${lifted.rarity}`}
          style={{ left: lift.x, top: lift.y, width: 96 }}
        >
          <span className="nm">{lifted.name}</span>
        </div>
      ) : null}
    </div>
  )
}
