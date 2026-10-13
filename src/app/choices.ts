import {
  addDays,
  dayLabel,
  days as allDays,
  ddmm,
  describeEffects,
  describeError,
  legName,
  lodgingGaps,
  plural,
  preview,
  stopName,
  stopWindows,
  suggestDonors,
  suggestReceivers,
  tripRange,
} from '../engine'
import type { Command, ID, ISODate, Itinerary, Leg, Stop, Via } from '../engine'
import type { TripDoc } from './doc'
import { uid, useApp } from './store'
import type { Opt } from '../ui/sheetTypes'

// Escolhas em vez de erros (spec §5.1): cada opção mostra antes o que vai acontecer.

const S = () => useApp.getState()
const doc = () => S().doc!
const names = (d: TripDoc) => ({ destinations: d.destinations, places: d.places })
export const cityName = (stopId: ID, d = doc()) => stopName(d.itinerary, stopId, names(d))

const list = (l: string[]) =>
  l.length === 1 ? l[0]! : l.length === 2 ? `${l[0]} e ${l[1]}` : `${l[0]} e mais ${l.length - 1}`

/** "13/04 a 20/04" (chegada e saída). */
export function windowText(it: Itinerary, stopId: ID): string {
  const w = stopWindows(it).find((x) => x.stopId === stopId)
  if (!w) return ''
  if (!w.start || !w.end) return `dia ${w.startIndex + 1} a ${w.startIndex + w.nights + 1}`
  return `${ddmm(w.start)} a ${ddmm(w.end)}`
}

/** Linhas da prévia de um comando, no presente ("Gion volta para a mochila."). */
export function previewLines(cmd: Command, d = doc()): { ok: boolean; lines: string[] } {
  const p = preview(d.itinerary, cmd)
  if (!p.ok) return { ok: false, lines: [describeError(p.error!, d.itinerary, names(d)) ?? 'Não muda nada.'] }
  const lines: string[] = []
  if (!p.returned.length) lines.push('Nenhum plano sai.')
  const t = describeEffects(p.effects!, d.itinerary, p.state!, names(d), 'preview')
  if (t) lines.push(t)
  // Quem anda junto: as outras cidades (a própria cidade movida não entra).
  const self = 'stopId' in cmd ? cmd.stopId : null
  const shifted = p.shifted.filter((id) => id !== self)
  if (shifted.length) {
    const who = [...new Set(shifted.map((id) => cityName(id, d)))]
    lines.push(`${list(who)} ${who.length === 1 ? 'anda' : 'andam'} junto, com os planos.`)
  }
  return { ok: true, lines }
}

export function cmdOpt(
  label: string,
  command: Command,
  opts: { main?: boolean; extra?: string; stamp?: boolean } = {},
): Opt {
  const p = previewLines(command)
  return {
    label,
    detail: p.ok && opts.extra ? [...p.lines, opts.extra] : p.lines,
    run: () => S().act({ type: 'engine', command }),
    main: opts.main,
    disabled: !p.ok,
  }
}

function newEnd(delta: number): string {
  const end = tripRange(doc().itinerary).end
  return end ? dayLabel(addDays(end, delta)) : 'mais tarde'
}

function returnTicketNote(): string | undefined {
  const d = doc()
  const last = d.itinerary.legs[d.itinerary.legs.length - 1]
  const from = d.itinerary.stops.find((s) => s.id === last?.from)?.destinationId
  const b = d.bookings.find(
    (x) =>
      x.kind === 'transport' && !x.archived && x.toDestinationId === 'home' && x.fromDestinationId === from,
  )
  return b?.kind === 'transport' ? `Sua passagem de volta é de ${ddmm(b.date)}.` : undefined
}

/** Cidades que podem ceder `nights` noites (ou noites em aberto), da mais próxima. */
export function donorStops(it: Itinerary, exceptId: ID | null, around: number, nights: number): Stop[] {
  return it.stops
    .map((s, i) => ({ s, d: Math.abs(i - around) }))
    .filter(
      ({ s }) =>
        s.id !== exceptId && (s.destinationId ? s.days.length - nights >= 1 : s.days.length >= nights),
    )
    .sort((a, b) => a.d - b.d)
    .map(({ s }) => s)
}

const donorLabel = (it: Itinerary, s: Stop) =>
  s.destinationId
    ? `Tirar de ${cityName(s.id)} (${windowText(it, s.id)})`
    : `Usar as noites em aberto (${windowText(it, s.id)})`

// ---------------------------------------------------------------------------
// Hospedagem
// ---------------------------------------------------------------------------

/** Marca como reservada a hospedagem das noites ainda descobertas de um destino (com carimbo). */
export function markLodging(stopId: ID) {
  const d = doc()
  const it = d.itinerary
  const s = it.stops.find((x) => x.id === stopId)
  const w = stopWindows(it).find((x) => x.stopId === stopId)
  const gap = lodgingGaps(it, d.bookings).find((g) => g.stopId === stopId)
  if (!s?.destinationId || !w?.start || !gap?.missing.length) return
  const name = d.destinations.find((x) => x.id === s.destinationId)?.name ?? 'destino'
  S().act(
    {
      type: 'addBooking',
      booking: {
        id: uid('h'),
        kind: 'lodging',
        title: `Hospedagem em ${name}`,
        destinationId: s.destinationId,
        checkin: addDays(w.start, gap.missing[0]!.ordinal),
        checkout: addDays(w.start, gap.missing[gap.missing.length - 1]!.ordinal + 1),
        status: 'booked',
      },
    },
    { stamp: true },
  )
}

// ---------------------------------------------------------------------------
// Noites de uma cidade
// ---------------------------------------------------------------------------

export function plusNight(stopId: ID) {
  const it = doc().itinerary
  const s = it.stops.find((x) => x.id === stopId)
  if (!s) return
  const n = s.days.length
  const back: Command = { type: 'setNights', stopId, nights: n + 1, via: { kind: 'return' } }
  if (it.lock === 'free') return S().act({ type: 'engine', command: back })
  const donors = suggestDonors(it, stopId, 1).map((o, k) =>
    cmdOpt(
      donorLabel(
        it,
        it.stops.find((x) => x.id === o.stopId)!,
      ),
      { type: 'setNights', stopId, nights: n + 1, via: o.via },
      { main: k === 0 },
    ),
  )
  S().openSheet({
    kind: 'choice',
    title: 'De onde sai essa noite?',
    sub: `${cityName(stopId)} fica com ${n + 1} noites. A volta está marcada 🔒.`,
    options: [...donors, cmdOpt(`Adiar a volta (${newEnd(1)})`, back, { extra: returnTicketNote() })],
  })
}

export function minusNight(stopId: ID) {
  const it = doc().itinerary
  const s = it.stops.find((x) => x.id === stopId)
  if (!s) return
  const n = s.days.length
  if (n === 1)
    return S().openSheet({
      kind: 'choice',
      title: `${cityName(stopId)} tem só 1 noite.`,
      options: [
        {
          ...cmdOpt('Tirar do roteiro', { type: 'removeStop', stopId }),
          detail: ['A noite fica em aberto, com as mesmas datas. A mochila dele fica guardada.'],
        },
      ],
    })
  if (it.lock === 'free')
    return S().act({
      type: 'engine',
      command: { type: 'setNights', stopId, nights: n - 1, via: { kind: 'return' } },
    })
  S().openSheet({
    kind: 'choice',
    title: 'Para onde vai essa noite?',
    sub: `${cityName(stopId)} fica com ${n - 1} noites. A volta está marcada 🔒.`,
    options: suggestReceivers(it, stopId, 1).map((o, k) =>
      cmdOpt(
        o.via.kind === 'open'
          ? 'Deixar a noite em aberto'
          : `Dar para ${cityName(o.stopId!)} (${o.side === 'before' ? 'antes' : 'depois'})`,
        { type: 'setNights', stopId, nights: n - 1, via: o.via },
        { main: k === 0 },
      ),
    ),
  })
}

export function shiftCity(stopId: ID, by: 1 | -1) {
  const it = doc().itinerary
  const i = it.stops.findIndex((s) => s.id === stopId)
  if (i === 0 && by < 0) return S().say('É o primeiro destino: para chegar antes, mude a data de ida.', true)
  if (i === it.stops.length - 1 && by > 0)
    return S().say('É o último destino: para chegar depois, mude a volta.', true)
  S().act({ type: 'engine', command: { type: 'shiftStop', stopId, by } })
}

// ---------------------------------------------------------------------------
// Dias
// ---------------------------------------------------------------------------

export function removeDayChoice(stopId: ID, ordinal: number) {
  const it = doc().itinerary
  const i = it.stops.findIndex((x) => x.id === stopId)
  const s = it.stops[i]
  if (!s) return
  const vias: [string, Via][] = []
  if (s.days.length === 1) vias.push(['Tirar o destino do roteiro', { kind: 'open' }])
  else {
    if (it.lock === 'free') vias.push(['Antecipar a volta', { kind: 'return' }])
    vias.push(['Deixar a noite em aberto', { kind: 'open' }])
    const prev = it.stops[i - 1]
    const next = it.stops[i + 1]
    if (prev) vias.push([`${cityName(prev.id)} fica com a noite (antes)`, { kind: 'stop', stopId: prev.id }])
    if (next) vias.push([`${cityName(next.id)} fica com a noite (depois)`, { kind: 'stop', stopId: next.id }])
  }
  const day = allDays(it).find((d) => d.stopId === stopId && d.ordinal === ordinal)
  S().openSheet({
    kind: 'choice',
    title: `Remover ${day?.label ?? 'este dia'}?`,
    sub: 'As figurinhas desse dia voltam para o álbum.',
    options: vias.map(([label, via], k) =>
      cmdOpt(label, { type: 'removeDay', stopId, ordinal, via }, { main: k === 0 }),
    ),
  })
}

export function swapDayChoice(stopId: ID, ordinal: number) {
  const it = doc().itinerary
  const ds = allDays(it).filter((d) => d.stopId === stopId && d.ordinal !== ordinal && d.kind === 'stop')
  S().openSheet({
    kind: 'choice',
    title: 'Trocar com qual dia?',
    sub: 'As figurinhas trocam de dia; as datas ficam.',
    options: ds.map((d) =>
      cmdOpt(`${d.label} · ${plural(d.visits.length, 'figurinha', 'figurinhas')}`, {
        type: 'swapDays',
        stopId,
        a: ordinal,
        b: d.ordinal,
      }),
    ),
  })
}

// ---------------------------------------------------------------------------
// Trechos
// ---------------------------------------------------------------------------

export function aboardChoice(leg: Leg, delta: 1 | -1) {
  const it = doc().itinerary
  const n = leg.aboard.length + delta
  const back: Command = { type: 'setLegNightsAboard', legId: leg.id, nights: n, via: { kind: 'return' } }
  const toIdx = leg.to === 'home' ? it.stops.length : it.stops.findIndex((s) => s.id === leg.to)
  const options: Opt[] = []
  if (delta > 0) {
    if (it.lock === 'free') options.push(cmdOpt(`Adiar a volta (${newEnd(1)})`, back, { main: true }))
    for (const s of donorStops(it, null, toIdx - 0.5, 1))
      options.push(
        cmdOpt(
          donorLabel(it, s),
          { type: 'setLegNightsAboard', legId: leg.id, nights: n, via: { kind: 'stop', stopId: s.id } },
          { main: !options.length },
        ),
      )
    if (it.lock === 'fixed') options.push(cmdOpt(`Adiar a volta (${newEnd(1)})`, back))
  } else {
    if (it.lock === 'free') options.push(cmdOpt('Antecipar a volta', back, { main: true }))
    for (const end of [leg.from, leg.to])
      if (end !== 'home')
        options.push(
          cmdOpt(`${cityName(end)} fica com a noite`, {
            type: 'setLegNightsAboard',
            legId: leg.id,
            nights: n,
            via: { kind: 'stop', stopId: end },
          }),
        )
  }
  S().openSheet({
    kind: 'choice',
    title: delta > 0 ? 'De onde sai a noite a bordo?' : 'Para onde vai essa noite?',
    sub: `${legName(it, leg, names(doc()))}: ${plural(n, 'noite', 'noites')} a bordo.`,
    options,
  })
}

// ---------------------------------------------------------------------------
// Pôr uma cidade no meio de outra, entre duas, ou mudar a volta
// ---------------------------------------------------------------------------

export function splitOptions(stopId: ID, destId: ID, nights: number, after: number): Opt[] {
  const it = doc().itinerary
  const s = it.stops.find((x) => x.id === stopId)
  if (!s) return []
  const i = it.stops.indexOf(s)
  const base = { type: 'splitStopWith' as const, stopId, afterOrdinal: after, destinationId: destId, nights }
  const out: Opt[] = []
  if (it.lock === 'free')
    out.push(
      cmdOpt(`Adiar a volta (${newEnd(nights)})`, { ...base, via: { kind: 'return' } }, { main: true }),
    )
  out.push(
    cmdOpt(
      `Tirar de ${cityName(stopId)} mesmo`,
      { ...base, via: { kind: 'stop', stopId } },
      { main: it.lock === 'fixed' },
    ),
  )
  for (const d of donorStops(it, stopId, i, nights))
    out.push(cmdOpt(donorLabel(it, d), { ...base, via: { kind: 'stop', stopId: d.id } }))
  if (it.lock === 'fixed')
    out.push(cmdOpt(`Adiar a volta (${newEnd(nights)})`, { ...base, via: { kind: 'return' } }))
  return out
}

export function insertOptions(index: number, destId: ID, nights: number): Opt[] {
  const it = doc().itinerary
  const base = { type: 'insertStop' as const, index, destinationId: destId, nights }
  const out: Opt[] = []
  if (it.lock === 'free')
    out.push(
      cmdOpt(`Adiar a volta (${newEnd(nights)})`, { ...base, via: { kind: 'return' } }, { main: true }),
    )
  for (const d of donorStops(it, null, index - 0.5, nights))
    out.push(
      cmdOpt(donorLabel(it, d), { ...base, via: { kind: 'stop', stopId: d.id } }, { main: !out.length }),
    )
  if (it.lock === 'fixed')
    out.push(cmdOpt(`Adiar a volta (${newEnd(nights)})`, { ...base, via: { kind: 'return' } }))
  return out
}

export function endOptions(target: ISODate): Opt[] {
  const it = doc().itinerary
  const r = tripRange(it)
  if (!r.end) return []
  const [y1, m1, d1] = r.end.split('-').map(Number) as [number, number, number]
  const [y2, m2, d2] = target.split('-').map(Number) as [number, number, number]
  const delta = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5)
  const base = { type: 'setTripEnd' as const, date: target }
  if (delta < 0) {
    const opts = [...it.stops]
      .filter((s) => s.days.length + delta >= 1)
      .sort((a, b) => b.days.length - a.days.length)
      .map((s, k) =>
        cmdOpt(
          `Tirar ${plural(-delta, 'noite', 'noites')} de ${cityName(s.id)} (${windowText(it, s.id)})`,
          { ...base, takeFrom: [{ stopId: s.id, nights: -delta }] },
          { main: k === 0 },
        ),
      )
    return opts.length
      ? opts
      : [
          {
            label: 'Nenhum destino tem tantas noites sobrando.',
            detail: ['Tire um destino do roteiro ou escolha outra data.'],
            run: () => {},
            disabled: true,
          },
        ]
  }
  if (delta > 0)
    return [...it.stops]
      .reverse()
      .filter((s) => s.destinationId)
      .map((s, k) =>
        cmdOpt(
          `${cityName(s.id)} ganha ${plural(delta, 'noite', 'noites')}`,
          { ...base, takeFrom: [{ stopId: s.id, nights: 0 }] },
          { main: k === 0 },
        ),
      )
  return []
}
