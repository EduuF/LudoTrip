import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  addDays,
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
  tripPhase,
} from '../engine'
import type { Booking, Day, DayRef, ID, Leg, LegMode, Stop, Visit } from '../engine'
import { todayISO, useApp } from '../app/store'
import {
  addDestination,
  buyTicket,
  cityName,
  minusNight,
  plusNight,
  removeDayChoice,
  shiftCity,
  swapDayChoice,
} from '../app/choices'
import { chipHandlers, useChipDrag } from './chipDragCtx'
import type { ChipItem } from './chipDragCtx'
import { colorOf, sealOf } from './colors'
import { isCoarse } from './pointer'
import { RARITY } from './rarity'
import { Seal, Stepper, Vehicle } from './kit'

// Roteiro (spec §17.4): a lista na ordem da viagem, em acordeão: um destino aberto por vez (o do dia
// escolhido), os outros em uma linha. Aberto, o cartão mostra os dias com as atividades e "+ Atividade",
// onde se dorme, o catálogo de atividades do destino (arrastáveis até um dia) e um "⋯" com o raro (ordem,
// chegar antes ou depois, tirar). Entre os destinos, o trecho em uma linha, com a passagem.

const NEEDS_TICKET = new Set<LegMode>(['flight', 'train', 'bus', 'boat'])
const SLOT_LABEL = { morning: 'manhã', afternoon: 'tarde', evening: 'noite', any: '' } as const
const SLOT_ORDER = { morning: 0, afternoon: 1, evening: 2, any: 3 } as const
/** Ordem no dia: pelo horário quando há (em minutos), senão pelo turno (qualquer hora por último). */
const visitKey = (v: Visit) => {
  if (v.time) {
    const [h, m] = v.time.split(':').map(Number) as [number, number]
    return h * 60 + m
  }
  return [8 * 60, 13 * 60, 19 * 60, 24 * 60][SLOT_ORDER[v.slot]]! + 0.5
}

export function RoteiroList() {
  const doc = useApp((s) => s.doc)!
  const openStop = useApp((s) => s.openStop)
  const collapsed = useApp((s) => s.stopCollapsed)
  const cursor = useApp((s) => s.cursorDay)
  const it = doc.itinerary
  const ds = useMemo(() => allDays(it, doc.places), [it, doc.places])

  // Qual cartão está aberto: o escolhido; senão o do dia do cursor (como o cartão do dia); senão o primeiro.
  const phase = tripPhase(it, todayISO())
  const defaultDay = phase.kind === 'during' ? phase.day - 1 : 0
  const cursorStop = ds[Math.max(0, Math.min(ds.length - 1, cursor ?? defaultDay))]?.stopId ?? null
  const current = collapsed
    ? null
    : (openStop ?? cursorStop ?? it.stops.find((s) => s.destinationId)?.id ?? null)

  const items: JSX.Element[] = []
  it.stops.forEach((s, i) => {
    const leg = it.legs[i]
    if (leg) items.push(<LegCard key={leg.id} leg={leg} days={ds} />)
    items.push(
      s.destinationId ? (
        <CityCard key={s.id} stop={s} index={i} days={ds} open={current === s.id} />
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
  return (
    <button type="button" className="card add-dest" onClick={addDestination}>
      <span className="plus" aria-hidden="true">
        +
      </span>
      <span className="txt">
        <b>Adicionar destino</b>
        <span>Mais um lugar na viagem: você escolhe onde ele entra, com uma sugestão no caminho.</span>
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Destino
// ---------------------------------------------------------------------------

function CityCard({ stop, index, days, open }: { stop: Stop; index: number; days: Day[]; open: boolean }) {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const openSheet = useApp((s) => s.openSheet)
  const toggleStop = useApp((s) => s.toggleStop)
  const it = doc.itinerary
  const dest = doc.destinations.find((d) => d.id === stop.destinationId)
  const w = stopWindows(it).find((x) => x.stopId === stop.id)!
  const n = stop.days.length
  const dates =
    w.start && w.end
      ? `${dayLabel(w.start)} → ${dayLabel(w.end)}`
      : `dia ${w.startIndex + 1} → dia ${w.startIndex + n + 1}`
  const color = colorOf(doc.destinations, stop.destinationId)
  const name = dest?.name ?? 'Destino'
  const mine = days.filter((d) => d.stopId === stop.id && d.kind === 'stop')
  const last = index === it.stops.length - 1
  const departure = last ? days.filter((d) => d.kind === 'departure') : []
  const acts = [...mine, ...departure].reduce((k, d) => k + d.visits.length, 0)

  // Onde se dorme: hospedagens desta parada e o que ainda falta.
  const lodgings = doc.bookings.filter(
    (b): b is Extract<Booking, { kind: 'lodging' }> =>
      b.kind === 'lodging' && !b.archived && bookingStatus(b, it).stopId === stop.id,
  )
  const gap = lodgingGaps(it, doc.bookings).find((g) => g.stopId === stop.id)
  const openLodging = () => openSheet({ kind: 'lodging', stopId: stop.id })
  const pills: JSX.Element[] = []
  if (stop.lodging === 'friends' || stop.lodging === 'onboard')
    pills.push(
      <button key="l" type="button" className="pill ok" onClick={openLodging}>
        <span aria-hidden="true">宿</span> {stop.lodging === 'friends' ? 'com amigos' : 'a bordo'}
      </button>,
    )
  else {
    for (const b of lodgings)
      pills.push(
        <button
          key={b.id}
          type="button"
          className={`pill ${b.status === 'booked' ? 'ok' : ''}`}
          onClick={openLodging}
          aria-label={`${b.title}. Toque para mudar`}
        >
          宿 {b.title} {b.status === 'booked' ? '済' : '· ainda não reservada'}
        </button>,
      )
    // Sem datas também: o painel explica o que falta (a data de ida) e oferece "com amigos".
    if (gap)
      pills.push(
        <button key="gap" type="button" className="pill warn" onClick={openLodging}>
          <span aria-hidden="true">宿</span>{' '}
          {gap.partial ? `${gap.missing.map((m) => m.label).join(', ')}: ` : ''}onde vocês dormem?
        </button>,
      )
  }
  // Fechado, o cartão resume em uma linha, em palavras: noites, atividades e se há onde dormir.
  const lodgingNote =
    stop.lodging === 'friends' || stop.lodging === 'onboard' || (lodgings.length && !gap)
      ? 'hospedagem ok'
      : gap
        ? 'falta hospedagem'
        : ''
  const summary = [plural(n, 'noite', 'noites'), plural(acts, 'atividade', 'atividades'), lodgingNote]
    .filter(Boolean)
    .join(' · ')

  const menu = () =>
    openSheet({
      kind: 'choice',
      title: `${name} · ${plural(n, 'noite', 'noites')}`,
      options: [
        {
          label: 'Mudar a ordem',
          detail: ['Escolha depois de qual destino ele vem.'],
          run: () => openSheet({ kind: 'order', stopId: stop.id }),
        },
        ...(index > 0 && index < it.stops.length - 1
          ? [
              {
                label: 'Chegar 1 dia antes',
                detail: ['Mesmas noites; o anterior cede um dia.'],
                run: () => shiftCity(stop.id, -1),
              },
              {
                label: 'Chegar 1 dia depois',
                detail: ['Mesmas noites; o anterior ganha um dia.'],
                run: () => shiftCity(stop.id, 1),
              },
            ]
          : []),
        {
          label: 'Tirar do roteiro',
          detail: ['As noites ficam em aberto, com as mesmas datas. As atividades ficam guardadas.'],
          run: () =>
            act({ type: 'engine', command: { type: 'removeStop', stopId: stop.id } }, { burst: true }),
        },
      ],
    })

  return (
    <article
      className={`card${open ? ' open' : ' closed'}`}
      id={`c-${stop.id}`}
      style={{ ['--c' as string]: color } as CSSProperties}
    >
      <div className="c-head" data-stophead={stop.id}>
        <h3 className="c-h">
          <button
            type="button"
            className="c-toggle"
            aria-expanded={open}
            aria-label={`${name}: ${open ? 'fechar' : 'abrir'} os dias`}
            onClick={() => toggleStop(stop.id, open)}
          >
            <Seal text={sealOf(dest)} color={color} />
            <span className="c-title">
              <span className="nm">{name}</span>
              <span className="dates">
                {dates}
                {open ? '' : ` · ${summary}`}
              </span>
            </span>
            <span className="chev" aria-hidden="true">
              {open ? '▴' : '▾'}
            </span>
          </button>
        </h3>
        <button type="button" className="icon-btn" aria-label={`Mais opções de ${name}`} onClick={menu}>
          ⋯
        </button>
      </div>
      {open ? (
        <>
          <div className="row">
            <Stepper
              value={n}
              min={0}
              label={`Noites em ${name}`}
              onMinus={() => minusNight(stop.id)}
              onPlus={() => plusNight(stop.id)}
            />
            <span className="spacer" />
            {pills}
          </div>
          <div className="days">
            {mine.map((d) => (
              <DayRow key={d.index} day={d} destId={stop.destinationId} menu={() => dayMenu(d)} />
            ))}
            {departure.map((d) => (
              <DayRow key="dep" day={d} destId={stop.destinationId} title="dia da volta" />
            ))}
          </div>
          <CatalogRow destId={stop.destinationId!} />
        </>
      ) : null}
    </article>
  )

  function dayMenu(d: Day) {
    openSheet({
      kind: 'choice',
      title: d.label,
      options: [
        {
          label: 'Tirar esta noite',
          detail: ['Depois você escolhe para onde vai a noite.'],
          run: () => removeDayChoice(stop.id, d.ordinal),
        },
        ...(stop.days.length > 1
          ? [
              {
                label: 'Trocar com outro dia',
                detail: ['As atividades trocam de dia; as datas ficam.'],
                run: () => swapDayChoice(stop.id, d.ordinal),
              },
            ]
          : []),
      ],
    })
  }
}

/** Um dia: as atividades por turno e "+ Atividade" (um "+" discreto quando o dia já tem atividades).
 *  As atividades arrastam para outro dia (ou para "sem dia"). */
export function DayRow({
  day,
  destId,
  menu,
  title,
  compact,
}: {
  day: Day
  /** Destino das atividades novas deste dia. */
  destId: ID | null
  menu?: () => void
  title?: string
  /** Sem a coluna da data (o cartão do dia já a mostra). */
  compact?: boolean
}) {
  const doc = useApp((s) => s.doc)!
  const openSheet = useApp((s) => s.openSheet)
  const drag = useChipDrag()
  const trips = day.dayTrips.map((x) => doc.destinations.find((d) => d.id === x)?.name).filter(Boolean)
  const visits = [...day.visits].sort((a, b) => visitKey(a) - visitKey(b))
  const add = () =>
    openSheet({ kind: 'newActivity', destId: destId!, day: day.ref as DayRef, dayLabel: day.label })
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
          const item: ChipItem = { kind: 'visit', visitId: v.id, placeId: v.placeId, from: day.ref ?? null }
          const lifted = drag?.lifted?.kind === 'visit' && drag.lifted.visitId === v.id
          return (
            <button
              key={v.id}
              type="button"
              className={`mini r-${p?.rarity ?? 'want'}${v.visited ? ' visited' : ''}${lifted ? ' lifted' : ''}`}
              {...chipHandlers(drag, item, () => openSheet({ kind: 'visit', visitId: v.id }))}
            >
              {v.time || SLOT_LABEL[v.slot] ? (
                <span className="slot">{v.time ?? SLOT_LABEL[v.slot]}</span>
              ) : null}
              {p?.name ?? 'Atividade'}
              {v.note ? (
                <span className="memo" aria-label="com anotações">
                  ✎
                </span>
              ) : null}
              {v.visited ? ' 済' : ''}
            </button>
          )
        })}
        {day.ref && destId ? (
          visits.length ? (
            <button
              type="button"
              className="mini add icon"
              aria-label={`Atividade em ${day.label}`}
              onClick={add}
            >
              +
            </button>
          ) : (
            <button type="button" className="mini add" onClick={add}>
              + Atividade
            </button>
          )
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
}

// ---------------------------------------------------------------------------
// Catálogo do destino (spec §17.10): todas as atividades, as sem dia primeiro. Arrastar uma ficha até
// um dia sempre põe a atividade em mais um dia; tocar abre "Sobre a atividade". Também é onde se solta
// uma atividade de um dia para tirá-la do dia.
// ---------------------------------------------------------------------------

/** Quantas fichas com dia aparecem antes do "+ N com dia". */
const CATALOG_PLACED = 4

function CatalogRow({ destId }: { destId: ID }) {
  const doc = useApp((s) => s.doc)!
  const openSheet = useApp((s) => s.openSheet)
  const drag = useChipDrag()
  const [all, setAll] = useState(false)
  const it = doc.itinerary
  const states = placeStates(it, doc.places)
  const inTrip = new Set(it.stops.map((s) => s.destinationId))
  const daysOf = (id: ID) => states.get(id)?.days ?? []
  const mine = doc.places.filter((p) => p.destinationId === destId)
  const loose = mine.filter((p) => !daysOf(p.id).length)
  const placed = mine.filter((p) => daysOf(p.id).length)
  const nearby = doc.destinations
    .filter((d) => !inTrip.has(d.id))
    .flatMap((d) => doc.places.filter((p) => p.destinationId === d.id && !daysOf(p.id).length))
  const dropZone = drag?.lifted?.kind === 'visit'
  if (!mine.length && !nearby.length && !dropZone) return null
  const coarse = isCoarse()
  const name = doc.destinations.find((d) => d.id === destId)?.name ?? 'destino'
  const shown = all ? placed : placed.slice(0, CATALOG_PLACED)

  const chip = (placeId: ID, tag?: string) => {
    const p = doc.places.find((x) => x.id === placeId)!
    const ds = daysOf(p.id)
    const item: ChipItem = { kind: 'loose', placeId }
    const lifted = drag?.lifted?.kind === 'loose' && drag.lifted.placeId === p.id
    const when = ds.length === 1 ? ds[0]!.label : ds.length ? `${ds.length} dias` : ''
    return (
      <button
        key={p.id}
        type="button"
        className={`mini r-${p.rarity} loose${ds.length ? ' placed' : ''}${lifted ? ' lifted' : ''}`}
        aria-label={`${p.name}${when ? `, em ${when}` : ', sem dia'}: ${coarse ? 'toque para ver, ou segure e arraste até um dia' : 'clique para ver, ou arraste até um dia'}`}
        {...chipHandlers(drag, item, () => openSheet({ kind: 'sticker', placeId: p.id }))}
      >
        <span className="gems">{RARITY[p.rarity].gems}</span>
        {p.name}
        {tag || when ? <span className="slot">{tag ?? when}</span> : null}
      </button>
    )
  }
  return (
    <div className="loose-row" data-loose="">
      <span className="loose-t">
        {dropZone
          ? 'SOLTE AQUI PARA TIRAR DO DIA'
          : `ATIVIDADES DE ${name.toUpperCase()} · ${coarse ? 'segure e arraste até um dia' : 'arraste até um dia'}`}
      </span>
      <div className="slots">
        {loose.map((p) => chip(p.id))}
        {nearby.map((p) => chip(p.id, 'bate-volta'))}
        {shown.map((p) => chip(p.id))}
        {placed.length > shown.length ? (
          <button type="button" className="mini add" onClick={() => setAll(true)}>
            + {placed.length - shown.length} com dia
          </button>
        ) : null}
      </div>
    </div>
  )
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
// Trecho (ponte entre destinos): uma linha tocável, a passagem ao lado
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
  const src = { user: 'sua passagem', route: 'rota real', estimate: 'estimativa', none: '' }[est.source]
  const legDays = days.filter((d) => d.legId === leg.id)
  const title = legName(it, leg, names)

  const endDest = (end: ID | 'home') =>
    end === 'home' ? 'home' : (it.stops.find((s) => s.id === end)?.destinationId ?? null)
  const from = endDest(leg.from)
  const to = endDest(leg.to)

  const extras: JSX.Element[] = []
  let ticket: JSX.Element | null = null
  if (from && to) {
    const mine = doc.bookings.filter(
      (b): b is Extract<Booking, { kind: 'transport' }> =>
        b.kind === 'transport' && !b.archived && b.fromDestinationId === from && b.toDestinationId === to,
    )
    let has = false
    for (const b of mine) {
      const st = bookingStatus(b, it)
      if (st.legId !== leg.id) continue
      has = true
      if (st.state === 'ok' || st.state === 'undated')
        // Parece selo, então não desmarca num toque: abre um painel curto com "Desmarcar".
        ticket = (
          <button
            key={b.id}
            type="button"
            className="ticket on"
            aria-label="Passagem comprada: ver ou desmarcar"
            onClick={() =>
              openSheet({
                kind: 'choice',
                title: 'Passagem comprada 済',
                sub: `${b.title}${b.date ? ` · ${ddmm(b.date)}` : ''}`,
                options: [
                  {
                    label: 'Desmarcar a compra',
                    detail: ['O trecho volta a "falta comprar". Dá para desfazer.'],
                    run: () => act({ type: 'removeBooking', id: b.id }),
                  },
                ],
              })
            }
          >
            Passagem comprada{' '}
            <span className="hanko" aria-hidden="true">
              済
            </span>
          </button>
        )
      else if (st.state === 'wrong-mode')
        extras.push(
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
        extras.push(
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
    if (!has && NEEDS_TICKET.has(leg.mode))
      ticket = (
        <button
          type="button"
          className="ticket"
          aria-pressed="false"
          aria-label={date ? 'Passagem: falta comprar. Toque para marcar comprada' : undefined}
          onClick={() => buyTicket(leg.id)}
        >
          Passagem: falta comprar{date ? '' : ' · escolher a data'}
        </button>
      )
  }

  const meta = [
    date ? dayLabel(date) : idx !== null ? `dia ${idx + 1}` : '',
    MODE_NAMES[leg.mode],
    leg.dep
      ? `${leg.dep}${leg.arr ? `→${leg.arr}${leg.arrDayOffset ? ` (+${leg.arrDayOffset})` : ''}` : ''}`
      : '',
    est.minutes !== null ? `${fmtMinutes(est.minutes)}${src ? ` (${src})` : ''}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="leg" id={`l-${leg.id}`}>
      <div className="rail" aria-hidden="true" />
      <div className="body">
        <div className="leg-row">
          <button
            type="button"
            className="leg-line"
            aria-label={`${title}: editar trecho`}
            onClick={() => openSheet({ kind: 'leg', legId: leg.id })}
          >
            <Vehicle mode={leg.mode} px={2} />
            <b>{title}</b>
            <span className="meta">{meta}</span>
          </button>
          {ticket}
        </div>
        {extras}
        {legDays.map((d) => (
          <DayRow key={d.index} day={d} destId={to === 'home' ? null : to} title="noite a bordo" />
        ))}
      </div>
    </div>
  )
}
