import {
  addDays,
  dayLabel,
  days as allDays,
  ddmm,
  describeEffects,
  describeError,
  haversineKm,
  legDayIndex,
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
import type {
  Booking,
  Command,
  DayRef,
  Destination,
  ID,
  ISODate,
  Itinerary,
  Leg,
  Slot,
  Stop,
  Via,
} from '../engine'
import type { DocAction, TripDoc } from './doc'
import { uid, useApp } from './store'
import type { Opt } from '../ui/sheetTypes'
import { cueLodging, cueTicket } from '../ui/stage/cues'

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

/** Linhas da prévia de um comando, no presente ("Gion fica sem dia."). */
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

/** "Adiar a volta (sex 26/04)"; sem datas, "Mais 1 noite na viagem" (nada de "mais tarde"). */
function laterLabel(nights: number): string {
  return doc().itinerary.start
    ? `Adiar a volta (${newEnd(nights)})`
    : `Mais ${plural(nights, 'noite', 'noites')} na viagem`
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

/** Quantos destinos aparecem por extenso numa escolha de "de onde sai a noite" (spec §17.10). */
export const NEAREST_SHOWN = 3

/** As opções dos 3 destinos mais próximos e, se houver mais, "Outro destino…": a linha do tempo só
 *  com os que servem. `after` roda depois da escolha feita pela linha do tempo. */
export function nearest(
  stops: Stop[],
  make: (s: Stop, k: number) => Opt,
  pick: { title: string; tag: string },
  after?: () => void,
): Opt[] {
  const top = stops.slice(0, NEAREST_SHOWN).map(make)
  if (stops.length <= NEAREST_SHOWN) return top
  return [
    ...top,
    {
      label: 'Outro destino…',
      detail: [`Mais ${stops.length - NEAREST_SHOWN}: escolha na linha da viagem.`],
      run: () =>
        S().openSheet({
          kind: 'pickStop',
          title: pick.title,
          tag: pick.tag,
          ok: stops.map((x) => x.id),
          pick: (id) => {
            const k = stops.findIndex((x) => x.id === id)
            if (k >= 0) make(stops[k]!, k).run()
            after?.()
          },
        }),
    },
  ]
}

const DONOR_PICK = { title: 'De qual destino sai?', tag: 'cede' }

// ---------------------------------------------------------------------------
// Hospedagem
// ---------------------------------------------------------------------------

/** Sem data de ida, o que precisa de data abre "Sua viagem" dizendo por quê (nunca um botão sem efeito). */
export function askStartDate(why: string) {
  S().openSheet({ kind: 'trip' })
  S().say(why)
}

/** Marca a passagem de um trecho como comprada (comprar a volta marca a volta). */
export function buyTicket(legId: ID) {
  const d = doc()
  const it = d.itinerary
  const leg = it.legs.find((l) => l.id === legId)
  const idx = leg ? legDayIndex(it, leg.id) : null
  if (!leg || idx === null) return
  if (!it.start) return askStartDate('Para marcar a passagem, escolha primeiro a data de ida.')
  const end = (e: ID | 'home') =>
    e === 'home' ? 'home' : (it.stops.find((s) => s.id === e)?.destinationId ?? null)
  const from = end(leg.from)
  const to = end(leg.to)
  if (!from || !to) return
  const booking: Booking = {
    id: uid('k'),
    kind: 'transport',
    title: `Passagem ${legName(it, leg, names(d))}`,
    fromDestinationId: from,
    toDestinationId: to,
    date: addDays(it.start, idx),
    mode: leg.mode,
    status: 'booked',
  }
  const actions: DocAction[] = [{ type: 'addBooking', booking }]
  if (leg.to === 'home' && it.lock === 'free')
    actions.push({ type: 'engine', command: { type: 'setLock', lock: 'fixed' } })
  if (S().act(actions.length > 1 ? { type: 'batch', actions } : actions[0]!, { stamp: true }))
    cueTicket(doc())
}

/** Marca como reservada a hospedagem das noites ainda descobertas de um destino (com carimbo). */
export function markLodging(stopId: ID, title?: string, status: 'planned' | 'booked' = 'booked') {
  const d = doc()
  const it = d.itinerary
  const s = it.stops.find((x) => x.id === stopId)
  const w = stopWindows(it).find((x) => x.stopId === stopId)
  const gap = lodgingGaps(it, d.bookings).find((g) => g.stopId === stopId)
  if (!s?.destinationId || !gap?.missing.length) return
  if (!w?.start) return askStartDate('Para anotar a hospedagem, escolha primeiro a data de ida.')
  const name = d.destinations.find((x) => x.id === s.destinationId)?.name ?? 'destino'
  // Só as noites seguidas a partir da primeira que falta (uma reserva não cobre um buraco do meio).
  const run = [gap.missing[0]!]
  for (const m of gap.missing.slice(1)) if (m.ordinal === run[run.length - 1]!.ordinal + 1) run.push(m)
  const ok = S().act(
    {
      type: 'addBooking',
      booking: {
        id: uid('h'),
        kind: 'lodging',
        title: title?.trim() || `Hospedagem em ${name}`,
        destinationId: s.destinationId,
        checkin: addDays(w.start, run[0]!.ordinal),
        checkout: addDays(w.start, run[run.length - 1]!.ordinal + 1),
        status,
      },
    },
    { stamp: status === 'booked' },
  )
  if (ok && status === 'booked') cueLodging(doc(), s.destinationId)
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
  const donors = nearest(
    suggestDonors(it, stopId, 1).map((o) => it.stops.find((x) => x.id === o.stopId)!),
    (d, k) =>
      cmdOpt(
        donorLabel(it, d),
        { type: 'setNights', stopId, nights: n + 1, via: { kind: 'stop', stopId: d.id } },
        { main: k === 0 },
      ),
    DONOR_PICK,
  )
  S().openSheet({
    kind: 'choice',
    title: 'De onde sai essa noite?',
    sub: `${cityName(stopId)} fica com ${n + 1} noites. A volta está marcada 🔒.`,
    options: [...donors, cmdOpt(laterLabel(1), back, { extra: returnTicketNote() })],
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
          detail: ['A noite fica em aberto, com as mesmas datas. As atividades ficam guardadas.'],
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
    title: `Tirar a noite de ${day?.label ?? 'este dia'}?`,
    sub: 'As atividades desse dia continuam no catálogo do destino, sem dia.',
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
    sub: 'As atividades trocam de dia; as datas ficam.',
    options: ds.map((d) =>
      cmdOpt(`${d.label} · ${plural(d.visits.length, 'atividade', 'atividades')}`, {
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
  const reopen = () => S().openSheet({ kind: 'leg', legId: leg.id })
  if (delta > 0) {
    if (it.lock === 'free') options.push(cmdOpt(laterLabel(1), back, { main: true }))
    const first = !options.length
    options.push(
      ...nearest(
        donorStops(it, null, toIdx - 0.5, 1),
        (s, k) =>
          cmdOpt(
            donorLabel(it, s),
            { type: 'setLegNightsAboard', legId: leg.id, nights: n, via: { kind: 'stop', stopId: s.id } },
            { main: first && k === 0 },
          ),
        DONOR_PICK,
        reopen,
      ),
    )
    if (it.lock === 'fixed') options.push(cmdOpt(laterLabel(1), back))
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
    // Escolhido, volta ao painel do trecho (é um editor; a escolha é só um passo dele).
    // ("Outro destino…" abre a linha do tempo, que volta ao trecho depois da escolha.)
    options: options.map((o) =>
      o.label === 'Outro destino…'
        ? o
        : {
            ...o,
            run: () => {
              o.run()
              reopen()
            },
          },
    ),
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
    out.push(cmdOpt(laterLabel(nights), { ...base, via: { kind: 'return' } }, { main: true }))
  out.push(
    cmdOpt(
      `Tirar de ${cityName(stopId)} mesmo`,
      { ...base, via: { kind: 'stop', stopId } },
      { main: it.lock === 'fixed' },
    ),
  )
  out.push(
    ...nearest(
      donorStops(it, stopId, i, nights),
      (d) => cmdOpt(donorLabel(it, d), { ...base, via: { kind: 'stop', stopId: d.id } }),
      DONOR_PICK,
    ),
  )
  if (it.lock === 'fixed') out.push(cmdOpt(laterLabel(nights), { ...base, via: { kind: 'return' } }))
  return out
}

export function insertOptions(index: number, destId: ID, nights: number): Opt[] {
  const it = doc().itinerary
  const base = { type: 'insertStop' as const, index, destinationId: destId, nights }
  const out: Opt[] = []
  if (it.lock === 'free')
    out.push(cmdOpt(laterLabel(nights), { ...base, via: { kind: 'return' } }, { main: true }))
  const first = !out.length
  out.push(
    ...nearest(
      donorStops(it, null, index - 0.5, nights),
      (d, k) =>
        cmdOpt(
          donorLabel(it, d),
          { ...base, via: { kind: 'stop', stopId: d.id } },
          { main: first && k === 0 },
        ),
      DONOR_PICK,
    ),
  )
  if (it.lock === 'fixed') out.push(cmdOpt(laterLabel(nights), { ...base, via: { kind: 'return' } }))
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
    const opts = nearest(
      [...it.stops].filter((s) => s.days.length + delta >= 1).sort((a, b) => b.days.length - a.days.length),
      (s, k) =>
        cmdOpt(
          `Tirar ${plural(-delta, 'noite', 'noites')} de ${cityName(s.id)} (${windowText(it, s.id)})`,
          { ...base, takeFrom: [{ stopId: s.id, nights: -delta }] },
          { main: k === 0 },
        ),
      { title: 'De qual destino saem as noites?', tag: 'cede' },
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
  if (delta > 0 && !it.stops.some((s) => s.destinationId))
    return [
      {
        label: 'Ainda não há destino para ganhar as noites.',
        detail: ['Escolha um destino para as noites em aberto e tente de novo.'],
        run: () => {},
        disabled: true,
      },
    ]
  if (delta > 0)
    return nearest(
      [...it.stops].reverse().filter((s) => s.destinationId),
      (s, k) =>
        cmdOpt(
          `${cityName(s.id)} ganha ${plural(delta, 'noite', 'noites')}`,
          { ...base, takeFrom: [{ stopId: s.id, nights: 0 }] },
          { main: k === 0 },
        ),
      { title: 'Qual destino ganha as noites?', tag: 'ganha' },
    )
  return []
}

/** "+ Adicionar destino" (cartão do fim do roteiro): o destino e, na linha do tempo, onde ele entra. */
export function addDestination() {
  S().openSheet({
    kind: 'dest',
    title: 'Que destino entra na viagem?',
    pick: (destId) => S().openSheet({ kind: 'where', destId }),
  })
}

// ---------------------------------------------------------------------------
// Atividade em vários dias (spec §17.10)
// ---------------------------------------------------------------------------

export const sameDay = (a: DayRef | null | undefined, b: DayRef) =>
  !!a &&
  a.kind === b.kind &&
  (a.kind === 'departure' ||
    (a.kind === 'stop' && b.kind === 'stop' && a.stopId === b.stopId && a.ordinal === b.ordinal) ||
    (a.kind === 'leg' && b.kind === 'leg' && a.legId === b.legId && a.ordinal === b.ordinal))

/** Se a atividade já está nesse dia, avisa e devolve o rótulo do dia; senão null. */
function alreadyThere(placeId: ID, day: DayRef, exceptVisit?: ID): boolean {
  const d = doc()
  const hit = allDays(d.itinerary).find((x) => sameDay(x.ref, day))
  if (!hit?.visits.some((v) => v.placeId === placeId && v.id !== exceptVisit)) return false
  const name = d.places.find((p) => p.id === placeId)?.name ?? 'Essa atividade'
  S().say(`${name} já está em ${hit.label}.`, true)
  return true
}

/** Põe a atividade em mais um dia (o dia novo começa limpo). No mesmo dia duas vezes, só avisa. */
export function scheduleOnce(placeId: ID, day: DayRef, slot?: Slot, opts?: { keep?: boolean }): boolean {
  if (alreadyThere(placeId, day)) return false
  return S().act(
    {
      type: 'engine',
      command: { type: 'scheduleVisit', visitId: uid('v'), placeId, day, ...(slot ? { slot } : {}) },
    },
    opts,
  )
}

/** Muda a atividade de dia (com as anotações dela). No dia em que ela já está, só avisa. */
export function moveOnce(visitId: ID, placeId: ID, to: DayRef, opts?: { keep?: boolean }): boolean {
  if (alreadyThere(placeId, to, visitId)) return false
  return S().act({ type: 'engine', command: { type: 'moveVisit', visitId, to } }, opts)
}

// ---------------------------------------------------------------------------
// Sugestão "no caminho": onde um destino entra com o menor desvio (spec §17.10)
// ---------------------------------------------------------------------------

type Pt = { lat: number; lon: number }
const pt = (o: { lat?: number; lon?: number } | null | undefined): Pt | null =>
  o && o.lat !== undefined && o.lon !== undefined ? { lat: o.lat, lon: o.lon } : null

/** A fresta (índice de inserção, 0..stops.length) de menor desvio em linha reta; sem coordenadas, o fim. */
export function suggestGap(it: Itinerary, destinations: Destination[], destId: ID): number {
  const end = it.stops.length
  const x = pt(destinations.find((d) => d.id === destId))
  if (!x || !end) return end
  const at = it.stops.map((s) => pt(destinations.find((d) => d.id === s.destinationId)))
  const home = pt(it.home)
  if (!at.some(Boolean)) return end
  let best = end
  let bestCost = Infinity
  for (let i = 0; i <= end; i++) {
    let a: Pt | null = null
    for (let k = i - 1; k >= 0 && !a; k--) a = at[k] ?? null
    let b: Pt | null = null
    for (let k = i; k < end && !b; k++) b = at[k] ?? null
    a ??= home
    b ??= home
    if (!a && !b) continue
    const cost =
      a && b ? haversineKm(a, x) + haversineKm(x, b) - haversineKm(a, b) : haversineKm((a ?? b)!, x)
    if (cost < bestCost - 1e-6) {
      bestCost = cost
      best = i
    }
  }
  return best
}

/** "+ Escolher destino" para noites em aberto (cartão do roteiro e cartão do dia). */
export function fillOpenChoice(stopId: ID) {
  const s = doc().itinerary.stops.find((x) => x.id === stopId)
  if (!s) return
  const n = s.days.length
  S().openSheet({
    kind: 'dest',
    title: 'Que destino fica nessas noites?',
    pick: (destId) =>
      n === 1
        ? S().act({ type: 'engine', command: { type: 'fillOpen', stopId, destinationId: destId } })
        : S().openSheet({ kind: 'fill', stopId, destId, nights: n, side: 'start' }),
  })
}
