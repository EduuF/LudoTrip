import './lab.css'
import { ALL_TRIPS } from '../engine/fixtures/trips'
import {
  addDays,
  allVisits,
  applyUndo,
  bookingStatus,
  dayLabel,
  days as allDays,
  ddmm,
  deepEqual,
  describeEffects,
  describeError,
  describeIssue,
  describeUndoRefusal,
  diffDays,
  dispatch,
  estimateLeg,
  findVisit,
  health,
  legDayIndex,
  legName,
  lodgingGaps,
  MODE_NAMES,
  placeStates,
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
  Day,
  DayRef,
  Destination,
  ID,
  ISODate,
  Issue,
  Itinerary,
  Leg,
  LegMode,
  Patch,
  Place,
  Rarity,
  Slot,
  Stop,
  Via,
} from '../engine'

// Laboratório do motor: uma tela simples para testar as regras de edição com o motor de verdade.
// Não é o visual final (isso é o M2). Nada aqui decide regra: tudo passa por dispatch().

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

type TripKey = keyof typeof ALL_TRIPS
type Tab = 'roteiro' | 'mochila' | 'quests' | 'registro'

interface Saved {
  it: Itinerary
  destinations: Destination[]
  places: Place[]
  bookings: Booking[]
  seq: number
  log: LogEntry[]
}
interface LogEntry {
  n: number
  cmd: string
  ok: boolean
  text: string
}
interface Check {
  label: string
  ok: boolean
}
interface Opt {
  label: string
  detail?: string[]
  run: () => void
  main?: boolean
  disabled?: boolean
}
type Sheet =
  | { kind: 'choice'; title: string; sub?: string; options: Opt[] }
  | { kind: 'dest'; title: string; pick: (destId: ID) => void }
  | { kind: 'days'; title: string; prefer?: ID | null; pick: (ref: DayRef) => void }
  | { kind: 'items'; ref: DayRef }
  | { kind: 'visit'; visitId: ID }
  | { kind: 'times'; legId: ID }
  | { kind: 'split'; stopId: ID; destId: ID; nights: number; after: number }
  | { kind: 'insert'; index: number; destId: ID; nights: number }
  | { kind: 'fill'; stopId: ID; destId: ID; nights: number; side: 'start' | 'end' }
  | { kind: 'end'; date: ISODate | null }

const TRIP_NAMES = Object.fromEntries(
  (Object.keys(ALL_TRIPS) as TripKey[]).map((k) => [k, ALL_TRIPS[k]().name]),
) as Record<TripKey, string>

const STORE = 'ludotrip-lab-1'

const S = {
  key: 'japao' as TripKey,
  data: null as unknown as Saved,
  undo: [] as { inverse: Patch; text: string }[],
  tab: 'roteiro' as Tab,
  sheet: null as Sheet | null,
  toast: null as { text: string; warn: boolean; undo: boolean; id: number } | null,
  open: new Set<ID>(),
  focus: null as string | null,
  checks: [] as Check[],
  resetArmed: false,
  showLog: false,
}

function fresh(key: TripKey): Saved {
  const t = ALL_TRIPS[key]()
  return {
    it: t.itinerary,
    destinations: t.destinations,
    places: t.places,
    bookings: t.bookings,
    seq: 0,
    log: [],
  }
}

function load(key: TripKey): Saved {
  try {
    const raw = localStorage.getItem(`${STORE}:${key}`)
    if (raw) return JSON.parse(raw) as Saved
  } catch {
    /* sem armazenamento: começa do zero */
  }
  return fresh(key)
}

function save() {
  try {
    localStorage.setItem(`${STORE}:${S.key}`, JSON.stringify(S.data))
    localStorage.setItem(`${STORE}:last`, S.key)
  } catch {
    /* sem armazenamento: segue só na memória */
  }
}

function switchTrip(key: TripKey) {
  S.key = key
  S.data = load(key)
  S.undo = []
  S.checks = []
  S.open.clear()
  S.sheet = null
  S.toast = null
}

// ---------------------------------------------------------------------------
// Atalhos
// ---------------------------------------------------------------------------

const it = () => S.data.it
const names = () => ({ destinations: S.data.destinations, places: S.data.places })
const dest = (id: ID | null | undefined) => S.data.destinations.find((d) => d.id === id)
const place = (id: ID) => S.data.places.find((p) => p.id === id)
const sName = (stopId: ID, state = it()) => stopName(state, stopId, names())
const nextId = () => `lab${++S.data.seq}`
const h = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
const listNames = (l: string[]) =>
  l.length === 1 ? l[0]! : l.length === 2 ? `${l[0]} e ${l[1]}` : `${l[0]} e mais ${l.length - 1}`

function windowText(stopId: ID, state = it()): string {
  const w = stopWindows(state).find((x) => x.stopId === stopId)
  if (!w) return ''
  if (!w.start || !w.end) return `dia ${w.startIndex + 1} a ${w.startIndex + w.nights + 1}`
  return `${ddmm(w.start)} a ${ddmm(w.end)}`
}

/** Noites (não datas de entrada e saída): "qua 03/04" ou "qua 03/04 a qui 04/04". */
function nightsText(stopId: ID): string {
  const ds = allDays(it()).filter((d) => d.stopId === stopId && d.kind !== 'departure')
  const a = ds[0]
  const b = ds.at(-1)
  if (!a || !b) return ''
  return a === b ? a.label : `${a.label} a ${b.label}`
}

const COLORS = ['--sakura', '--ai', '--matcha', '--gold', '--beni', '--ink-soft']
const colorOf = (destId: ID | null) => {
  const i = S.data.destinations.findIndex((d) => d.id === destId)
  return i < 0 ? 'var(--ink-soft)' : `var(${COLORS[i % COLORS.length]})`
}

const sealOf = (d: Destination | undefined) => (d?.localName ?? d?.name ?? '?').slice(0, 1)

// ---------------------------------------------------------------------------
// Comandos, Desfazer e conferências
// ---------------------------------------------------------------------------

let toastSeq = 0
function toast(text: string, warn = false, undo = false) {
  const id = ++toastSeq
  S.toast = { text, warn, undo, id }
  setTimeout(() => {
    if (S.toast?.id === id) {
      S.toast = null
      render()
    }
  }, 6000)
}

function lead(cmd: Command): string | null {
  const st = it()
  switch (cmd.type) {
    case 'setNights':
      return `${sName(cmd.stopId)}: ${plural(cmd.nights, 'noite', 'noites')}.`
    case 'shiftStop':
      return `${sName(cmd.stopId)} andou 1 dia ${cmd.by > 0 ? 'para frente' : 'para trás'}.`
    case 'reorderStop':
      return `${sName(cmd.stopId)} mudou de lugar.`
    case 'removeStop':
      return `${sName(cmd.stopId)} foi para a lixeira.`
    case 'fillOpen':
      return `${dest(cmd.destinationId)?.name ?? 'Cidade'} entrou nas noites em aberto.`
    case 'stretchInto': {
      const i = st.stops.findIndex((x) => x.id === cmd.stopId)
      const n = st.stops[cmd.side === 'before' ? i - 1 : i + 1]
      return n ? `${sName(n.id)} ficou com as noites em aberto.` : null
    }
    case 'closeOpen':
      return 'Viagem encurtada.'
    case 'insertStop':
      return `${dest(cmd.destinationId)?.name ?? 'Cidade'} entrou no roteiro.`
    case 'splitStopWith':
      return `${dest(cmd.destinationId)?.name ?? 'Cidade'} encaixada em ${sName(cmd.stopId)}.`
    case 'removeDay':
      return 'Dia removido.'
    case 'swapDays':
      return 'Dias trocados.'
    case 'setLegMode':
      return `Agora de ${MODE_NAMES[cmd.mode]}.`
    case 'setLegTimes':
      return 'Horários salvos.'
    case 'setLegNightsAboard':
      return `Noites a bordo: ${cmd.nights}.`
    case 'scheduleVisit':
      return `${place(cmd.placeId)?.name ?? 'Item'} agendado.`
    case 'unscheduleVisit':
      return 'Tirado do dia; continua na mochila.'
    case 'moveVisit':
      return 'Item movido.'
    case 'setVisitMeta':
      return 'Salvo.'
    case 'setLock':
      return cmd.lock === 'fixed' ? 'Volta marcada.' : 'Volta livre.'
    case 'setTripStart':
      return cmd.date ? null : 'Sem data: os dias viram dia 1, dia 2…'
    case 'setTripEnd':
      return st.start ? null : 'Volta mudada.'
    default:
      return null
  }
}

function exec(cmd: Command): boolean {
  const before = it()
  const r = dispatch(before, cmd, { newId: nextId })
  const n = (S.data.log[0]?.n ?? 0) + 1
  if (!r.ok) {
    const text = describeError(r.error, before, names()) ?? 'Nada mudou.'
    S.data.log.unshift({ n, cmd: JSON.stringify(cmd), ok: false, text: `${r.error.code}: ${text}` })
    toast(text, true)
    save()
    return false
  }
  // Quando duas partes viram uma só, o aviso da fusão já conta tudo.
  const merged = cmd.type === 'stretchInto' && r.effects.merged.some((m) => m.destinationId)
  const text =
    [merged ? null : lead(cmd), describeEffects(r.effects, before, r.state, names())]
      .filter(Boolean)
      .join(' ') || 'Feito.'
  S.checks = runChecks(
    before,
    r.state,
    cmd,
    r.effects.returned.map((x) => x.visit.id),
    r.inverse,
  )
  S.data.it = r.state
  S.undo.push({ inverse: r.inverse, text })
  S.data.log.unshift({ n, cmd: JSON.stringify(cmd), ok: true, text })
  S.sheet = null
  toast(text, false, true)
  save()
  return true
}

function undo() {
  const last = S.undo.pop()
  if (!last) return toast(describeUndoRefusal('NOTHING_TO_UNDO'), true)
  const u = applyUndo(it(), last.inverse)
  if (!u.ok) return toast(describeUndoRefusal(u.code), true)
  S.data.it = u.state
  S.data.log.unshift({
    n: (S.data.log[0]?.n ?? 0) + 1,
    cmd: '{"type":"desfazer"}',
    ok: true,
    text: `Desfeito: ${last.text}`,
  })
  S.sheet = null
  toast('Desfeito.')
  save()
}

function runChecks(
  before: Itinerary,
  after: Itinerary,
  cmd: Command,
  returned: ID[],
  inverse: Patch,
): Check[] {
  const ids = (x: Itinerary) => allVisits(x).map((v) => v.visit.id)
  const added = cmd.type === 'scheduleVisit' || cmd.type === 'addWaypoint' ? [cmd.visitId] : []
  const removed = cmd.type === 'unscheduleVisit' || cmd.type === 'removeWaypoint' ? [cmd.visitId] : []
  const conserved = deepEqual(
    [...ids(after), ...returned, ...removed].sort(),
    [...ids(before), ...added].sort(),
  )
  const chain = ['home', ...after.stops.map((s) => s.id), 'home']
  const legsOk =
    after.legs.length === chain.length - 1 &&
    after.legs.every((l, i) => l.from === chain[i] && l.to === chain[i + 1])
  const contiguous = allDays(after).every((d, i) => d.index === i)
  const openEmpty = after.stops.every((s) => s.destinationId !== null || s.days.every((d) => !d.length))
  const noTwins = after.stops.every(
    (s, i) => i === 0 || s.destinationId !== after.stops[i - 1]!.destinationId,
  )
  const nights = after.stops.every((s) => s.days.length >= 1)
  const u = applyUndo(after, inverse)
  const undoOk = u.ok && deepEqual({ ...u.state, version: 0 }, { ...before, version: 0 })
  return [
    { label: 'Toda cidade tem pelo menos 1 noite', ok: nights },
    { label: 'Um trecho entre cada par de cidades, mais ida e volta', ok: legsOk },
    { label: 'Nenhum item sumiu: continua num dia ou voltou para a mochila', ok: conserved },
    { label: 'Dias seguidos, sem buraco', ok: contiguous },
    { label: 'Noites em aberto sem planos', ok: openEmpty },
    { label: 'Nenhuma cidade repetida lado a lado', ok: noTwins },
    { label: 'Desfazer volta exatamente ao estado anterior', ok: undoOk },
  ]
}

// ---------------------------------------------------------------------------
// Prévias e escolhas ("De onde sai essa noite?")
// ---------------------------------------------------------------------------

function cmdOpt(label: string, cmd: Command, opts: { main?: boolean; extra?: string } = {}): Opt {
  const p = preview(it(), cmd)
  if (!p.ok) {
    return {
      label,
      detail: [describeError(p.error!, it(), names()) ?? 'Não muda nada.'],
      run: () => {},
      disabled: true,
    }
  }
  const detail: string[] = []
  if (!p.returned.length) detail.push('Nenhum plano sai.')
  const t = describeEffects(p.effects!, it(), p.state!, names(), 'preview')
  if (t) detail.push(t)
  if (p.shifted.length) {
    const list = listNames(p.shifted.map((id) => sName(id)))
    detail.push(`${list} ${p.shifted.length === 1 ? 'anda' : 'andam'} junto, com os planos.`)
  }
  if (opts.extra) detail.push(opts.extra)
  return { label, detail, run: () => exec(cmd), main: opts.main }
}

function returnTicketNote(): string | undefined {
  const last = it().legs.at(-1)
  if (!last) return undefined
  const fromDest = it().stops.find((s) => s.id === last.from)?.destinationId
  const b = S.data.bookings.find(
    (x) =>
      x.kind === 'transport' &&
      !x.archived &&
      x.toDestinationId === 'home' &&
      x.fromDestinationId === fromDest,
  )
  return b && b.kind === 'transport' ? `Sua passagem de volta é de ${ddmm(b.date)}.` : undefined
}

function newEndLabel(delta: number): string {
  const end = tripRange(it()).end
  return end ? dayLabel(addDays(end, delta)) : 'mais tarde'
}

function plusNight(s: Stop) {
  const n = s.days.length
  const back: Command = { type: 'setNights', stopId: s.id, nights: n + 1, via: { kind: 'return' } }
  if (it().lock === 'free') return exec(back)
  const donors = suggestDonors(it(), s.id, 1).map((o, k) => {
    const st = it().stops.find((x) => x.id === o.stopId)!
    const label = st.destinationId
      ? `Tirar de ${sName(st.id)} (${windowText(st.id)})`
      : `Usar a noite em aberto (${windowText(st.id)})`
    return cmdOpt(label, { type: 'setNights', stopId: s.id, nights: n + 1, via: o.via }, { main: k === 0 })
  })
  S.sheet = {
    kind: 'choice',
    title: 'De onde sai essa noite?',
    sub: `${sName(s.id)} fica com ${n + 1} noites. A volta está marcada.`,
    options: [...donors, cmdOpt(`Adiar a volta (${newEndLabel(1)})`, back, { extra: returnTicketNote() })],
  }
}

function minusNight(s: Stop) {
  const n = s.days.length
  if (n === 1) {
    S.sheet = {
      kind: 'choice',
      title: `${sName(s.id)} tem só 1 noite.`,
      options: [
        cmdOpt('Mandar para a lixeira (fica a noite em aberto)', { type: 'removeStop', stopId: s.id }),
      ],
    }
    return
  }
  if (it().lock === 'free')
    return exec({ type: 'setNights', stopId: s.id, nights: n - 1, via: { kind: 'return' } })
  S.sheet = {
    kind: 'choice',
    title: 'Para onde vai essa noite?',
    sub: `${sName(s.id)} fica com ${n - 1} noites. A volta está marcada.`,
    options: suggestReceivers(it(), s.id, 1).map((o, k) => {
      const label =
        o.via.kind === 'open'
          ? 'Deixar em aberto'
          : `Dar para ${sName(o.stopId!)} (${o.side === 'before' ? 'antes' : 'depois'})`
      return cmdOpt(label, { type: 'setNights', stopId: s.id, nights: n - 1, via: o.via }, { main: k === 0 })
    }),
  }
}

function removeDayOptions(s: Stop, ord: number) {
  const i = it().stops.findIndex((x) => x.id === s.id)
  const vias: [string, Via][] = []
  if (s.days.length === 1) vias.push(['Mandar a cidade para a lixeira', { kind: 'open' }])
  else {
    if (it().lock === 'free') vias.push(['Antecipar a volta', { kind: 'return' }])
    vias.push(['Deixar a noite em aberto', { kind: 'open' }])
    const prev = it().stops[i - 1]
    const next = it().stops[i + 1]
    if (prev) vias.push([`${sName(prev.id)} fica com a noite (antes)`, { kind: 'stop', stopId: prev.id }])
    if (next) vias.push([`${sName(next.id)} fica com a noite (depois)`, { kind: 'stop', stopId: next.id }])
  }
  const day = allDays(it()).find((d) => d.stopId === s.id && d.ordinal === ord)
  S.sheet = {
    kind: 'choice',
    title: `Remover ${day?.label ?? 'este dia'}?`,
    sub: 'Os planos desse dia voltam para a mochila.',
    options: vias.map(([label, via], k) =>
      cmdOpt(label, { type: 'removeDay', stopId: s.id, ordinal: ord, via }, { main: k === 0 }),
    ),
  }
}

function swapOptions(s: Stop, ord: number) {
  const ds = allDays(it()).filter((d) => d.stopId === s.id && d.ordinal !== ord)
  S.sheet = {
    kind: 'choice',
    title: 'Trocar com qual dia?',
    sub: 'Os planos trocam de dia; as datas ficam.',
    options: ds.map((d) =>
      cmdOpt(`${d.label} · ${plural(d.visits.length, 'item', 'itens')}`, {
        type: 'swapDays',
        stopId: s.id,
        a: ord,
        b: d.ordinal,
      }),
    ),
  }
}

/** Cidades que podem ceder `nights` noites (ou noites em aberto), da mais próxima. */
function donorStops(exceptId: ID | null, around: number, nights: number): Stop[] {
  return it()
    .stops.map((s, i) => ({ s, d: Math.abs(i - around) }))
    .filter(
      ({ s }) =>
        s.id !== exceptId && (s.destinationId ? s.days.length - nights >= 1 : s.days.length >= nights),
    )
    .sort((a, b) => a.d - b.d)
    .map(({ s }) => s)
}

function aboardOptions(leg: Leg, delta: 1 | -1) {
  const n = leg.aboard.length + delta
  const back: Command = { type: 'setLegNightsAboard', legId: leg.id, nights: n, via: { kind: 'return' } }
  const toIdx = it().stops.findIndex((s) => s.id === leg.to)
  const options: Opt[] = []
  if (delta > 0) {
    if (it().lock === 'free') options.push(cmdOpt(`Adiar a volta (${newEndLabel(1)})`, back, { main: true }))
    for (const s of donorStops(null, toIdx - 0.5, 1))
      options.push(
        cmdOpt(
          s.destinationId ? `Tirar de ${sName(s.id)} (${windowText(s.id)})` : 'Usar a noite em aberto',
          { type: 'setLegNightsAboard', legId: leg.id, nights: n, via: { kind: 'stop', stopId: s.id } },
          { main: !options.length },
        ),
      )
    if (it().lock === 'fixed') options.push(cmdOpt(`Adiar a volta (${newEndLabel(1)})`, back))
  } else {
    if (it().lock === 'free') options.push(cmdOpt('Antecipar a volta', back, { main: true }))
    for (const end of [leg.from, leg.to])
      if (end !== 'home')
        options.push(
          cmdOpt(`${sName(end)} fica com a noite`, {
            type: 'setLegNightsAboard',
            legId: leg.id,
            nights: n,
            via: { kind: 'stop', stopId: end },
          }),
        )
  }
  S.sheet = {
    kind: 'choice',
    title: delta > 0 ? 'De onde sai a noite a bordo?' : 'Para onde vai essa noite?',
    sub: `${legName(it(), leg, names())}: ${plural(n, 'noite', 'noites')} a bordo.`,
    options,
  }
}

// ---------------------------------------------------------------------------
// Reservas do laboratório (fatos: o motor nunca as muda)
// ---------------------------------------------------------------------------

const legEndDest = (end: ID | 'home'): ID | 'home' | null =>
  end === 'home' ? 'home' : (it().stops.find((s) => s.id === end)?.destinationId ?? null)

function legDate(leg: Leg): ISODate | null {
  const i = legDayIndex(it(), leg.id)
  return i === null || !it().start ? null : addDays(it().start!, i)
}

function legDayLabel(leg: Leg): string {
  const i = legDayIndex(it(), leg.id)
  if (i === null) return ''
  return it().start ? dayLabel(addDays(it().start!, i)) : `dia ${i + 1}`
}

function markTicket(leg: Leg) {
  const from = legEndDest(leg.from)
  const to = legEndDest(leg.to)
  const date = legDate(leg)
  if (!from || !to || !date) return
  S.data.bookings.push({
    id: nextId(),
    kind: 'transport',
    title: `Passagem ${legName(it(), leg, names())}`,
    fromDestinationId: from,
    toDestinationId: to,
    date,
    mode: leg.mode,
    status: 'booked',
  })
  if (leg.to === 'home' && it().lock === 'free') {
    exec({ type: 'setLock', lock: 'fixed' })
    toast('Passagem de volta comprada: a volta ficou marcada.', false, true)
  } else toast('Passagem comprada.')
  save()
}

function archiveBooking(id: ID) {
  const b = S.data.bookings.find((x) => x.id === id)
  if (b) b.archived = true
  toast('Reserva arquivada.')
  save()
}

function markLodging(stopId: ID) {
  const s = it().stops.find((x) => x.id === stopId)
  const w = stopWindows(it()).find((x) => x.stopId === stopId)
  if (!s?.destinationId || !w?.start || !w.end) return
  S.data.bookings.push({
    id: nextId(),
    kind: 'lodging',
    title: `Hospedagem em ${sName(stopId)}`,
    destinationId: s.destinationId,
    checkin: w.start,
    checkout: w.end,
    status: 'booked',
  })
  toast('Hospedagem marcada.')
  save()
}

// ---------------------------------------------------------------------------
// Ações de interface (registro de handlers por render)
// ---------------------------------------------------------------------------

const ACTIONS = new Map<string, (v?: string) => void>()
let actSeq = 0
const on = (fn: (v?: string) => void) => {
  const k = `a${++actSeq}`
  ACTIONS.set(k, fn)
  return k
}

function focusOn(id: string, tab: Tab = 'roteiro') {
  S.tab = tab
  S.focus = id
  if (id.startsWith('c-')) S.open.add(id.slice(2))
}

// ---------------------------------------------------------------------------
// Telas
// ---------------------------------------------------------------------------

function hud(): string {
  const ok = S.checks.filter((c) => c.ok).length
  const label = S.checks.length ? `${ok === S.checks.length ? '✓' : '✗'} ${ok}/${S.checks.length}` : '✓ —'
  return `<header class="hud">
    <div class="brand">Ludo<span>Trip</span><small class="tag">LAB</small></div>
    <div class="hud-right">
      <button class="hud-btn${S.checks.length && ok < S.checks.length ? ' bad' : ''}" data-a="${on(() => (S.tab = 'registro'))}" aria-label="Conferências do motor">${label}</button>
      <button class="hud-btn" data-a="${on(undo)}" ${S.undo.length ? '' : 'disabled'}>↶ Desfazer</button>
    </div>
  </header>`
}

function head(): string {
  const st = it()
  const r = tripRange(st)
  const first = dest(st.stops.find((s) => s.destinationId)?.destinationId)
  const fixed = st.lock === 'fixed'
  const options = (Object.keys(ALL_TRIPS) as TripKey[])
    .map((k) => `<option value="${k}"${k === S.key ? ' selected' : ''}>${h(TRIP_NAMES[k])}</option>`)
    .join('')
  return `<section class="trip">
    <div class="watermark" aria-hidden="true">${h(first?.localName ?? first?.name ?? '')}</div>
    <label class="pick" for="trip-pick">Viagem de teste
      <select id="trip-pick" data-c="${on((v) => switchTrip(v as TripKey))}">${options}</select>
    </label>
    <h1>${h(TRIP_NAMES[S.key])}</h1>
    <div class="facts">
      <div class="fact"><span class="k">Ida</span>
        <input type="date" id="ida" value="${st.start ?? ''}" data-c="${on((v) => v && exec({ type: 'setTripStart', date: v }))}">
        ${st.start ? `<button class="btn small ghost" data-a="${on(() => exec({ type: 'setTripStart', date: null }))}">Sem data</button>` : ''}
      </div>
      <div class="fact"><span class="k">Volta</span>
        <b class="px">${r.end ? dayLabel(r.end) : `dia ${r.nights + 1}`}</b>
        <button class="btn small lock${fixed ? ' on' : ''}" data-a="${on(() => exec({ type: 'setLock', lock: fixed ? 'free' : 'fixed' }))}" aria-pressed="${fixed}">${fixed ? '🔒 marcada' : 'livre'}</button>
        <button class="btn small ghost" data-a="${on(() => (S.sheet = { kind: 'end', date: r.end }))}">Mudar</button>
      </div>
      <div class="fact"><span class="k">Noites</span><b class="px">${r.nights}</b></div>
    </div>
    <p class="note">Laboratório do motor: as regras de edição de verdade, numa tela simples. Arrastar, mapa e o visual final chegam no M2.</p>
  </section>`
}

function strip(): string {
  const st = it()
  const r = tripRange(st)
  let html = ''
  st.stops.forEach((s, i) => {
    const leg = st.legs[i]
    if (leg?.aboard.length)
      html += `<button class="blk aboard" style="width:${leg.aboard.length * 30 + 18}px" data-a="${on(() => focusOn(`l-${leg.id}`))}"><span class="nm">a bordo</span><span class="n">${leg.aboard.length}</span></button>`
    const n = s.days.length
    const cls = s.destinationId ? '' : ' open'
    const name = s.destinationId ? sName(s.id) : 'em aberto'
    html += `<button class="blk${cls}" style="width:${Math.max(n * 30 + 18, 52)}px;--c:${colorOf(s.destinationId)}" data-a="${on(() => focusOn(`c-${s.id}`))}" aria-label="${h(name)}, ${n} noites"><span class="nm">${h(name)}</span><span class="n">${s.destinationId ? n : `+${n}`}</span></button>`
  })
  return `<div class="strip-wrap" id="strip"><div class="strip">${html}</div></div>
    <div class="strip-dates"><span>${r.start ? ddmm(r.start) : 'dia 1'}</span><span>${r.end ? ddmm(r.end) : `dia ${r.nights + 1}`}</span></div>`
}

function visitChip(visitId: ID, placeId: ID, visited: boolean | undefined): string {
  const p = place(placeId)
  return `<button class="chip r-${p?.rarity ?? 'want'}${visited ? ' visited' : ''}" data-a="${on(() => (S.sheet = { kind: 'visit', visitId }))}">${h(p?.name ?? 'Item')}</button>`
}

function dayRow(d: Day, menu?: () => void): string {
  const trips = d.dayTrips.map((x) => dest(x)?.name).filter(Boolean)
  return `<div class="day">
    <div class="d">${h(d.label)}${trips.length ? `<span class="daytrip">bate-volta ${h(trips.join(', '))}</span>` : ''}</div>
    <div class="chips">${d.visits.map((v) => visitChip(v.id, v.placeId, v.visited)).join('')}
      ${d.ref ? `<button class="chip add" data-a="${on(() => (S.sheet = { kind: 'items', ref: d.ref! }))}">+ item</button>` : ''}</div>
    ${menu ? `<button class="icon-btn" aria-label="Opções de ${h(d.label)}" data-a="${on(menu)}">⋯</button>` : '<span></span>'}
  </div>`
}

function cityCard(s: Stop, i: number, ds: Day[]): string {
  const st = it()
  const d = dest(s.destinationId)
  const n = s.days.length
  const first = i === 0
  const last = i === st.stops.length - 1
  const isOpen = S.open.has(s.id)
  const w = stopWindows(st).find((x) => x.stopId === s.id)!
  const dates =
    w.start && w.end
      ? `${dayLabel(w.start)} → ${dayLabel(w.end)}`
      : `dia ${w.startIndex + 1} → dia ${w.startIndex + n + 1}`

  const lodgings = S.data.bookings.filter(
    (b) => b.kind === 'lodging' && !b.archived && b.destinationId === s.destinationId,
  )
  const gap = lodgingGaps(st, S.data.bookings).find((g) => g.stopId === s.id)
  let lodging = ''
  if (s.lodging === 'friends' || s.lodging === 'onboard')
    lodging = `<span class="pill">${s.lodging === 'friends' ? 'casa de amigos' : 'a bordo'}</span>`
  else {
    for (const b of lodgings) {
      if (b.kind !== 'lodging') continue
      const stt = bookingStatus(b, st)
      const mine = stt.stopId === s.id
      if (!mine && stt.state === 'ok') continue
      lodging += `<span class="pill ${stt.state === 'ok' ? 'ok' : 'bad'}">${h(b.title)} · ${ddmm(b.checkin)} a ${ddmm(b.checkout)}${stt.state === 'ok' ? ' ✓' : ' · fora das datas'}</span>`
    }
    if (gap)
      lodging += `<span class="pill warn">${gap.partial ? `${h(gap.missing.map((m) => m.label).join(', '))} sem hospedagem` : 'falta hospedagem'}</span>`
  }

  const daysHtml = isOpen
    ? `<div class="days">${ds
        .filter((x) => x.stopId === s.id)
        .map((x) =>
          dayRow(x, () => {
            S.sheet = {
              kind: 'choice',
              title: x.label,
              options: [
                {
                  label: 'Remover este dia',
                  detail: ['Escolha depois para onde vai a noite.'],
                  run: () => removeDayOptions(s, x.ordinal),
                },
                ...(n > 1
                  ? [
                      {
                        label: 'Trocar com outro dia',
                        detail: ['As datas ficam; os planos trocam.'],
                        run: () => swapOptions(s, x.ordinal),
                      },
                    ]
                  : []),
              ],
            }
          }),
        )
        .join('')}</div>`
    : ''

  return `<article class="card" id="c-${s.id}" style="--c:${colorOf(s.destinationId)}">
    <div class="c-head">
      <div class="seal" aria-hidden="true">${h(sealOf(d))}</div>
      <div class="c-title"><h3>${h(d?.name ?? 'Cidade')}</h3><div class="dates">${h(dates)}</div>
        ${s.tentative ? '<div class="tentative">noites incertas: as datas depois ficam estimadas</div>' : ''}</div>
    </div>
    <div class="row">
      <div class="stepper" role="group" aria-label="Noites em ${h(d?.name)}">
        <button aria-label="Menos uma noite" data-a="${on(() => minusNight(s))}">−</button>
        <span>${plural(n, 'noite', 'noites')}</span>
        <button aria-label="Mais uma noite" data-a="${on(() => plusNight(s))}">+</button>
      </div>
      <span class="spacer"></span>
      ${!first && !last ? `<button class="btn sq" aria-label="Deslocar 1 dia para trás" data-a="${on(() => exec({ type: 'shiftStop', stopId: s.id, by: -1 }))}">‹</button><button class="btn sq" aria-label="Deslocar 1 dia para frente" data-a="${on(() => exec({ type: 'shiftStop', stopId: s.id, by: 1 }))}">›</button>` : ''}
    </div>
    <div class="row">
      <button class="btn sq" aria-label="Subir na ordem" ${first ? 'disabled' : ''} data-a="${on(() => exec({ type: 'reorderStop', stopId: s.id, toIndex: i - 1 }))}">↑</button>
      <button class="btn sq" aria-label="Descer na ordem" ${last ? 'disabled' : ''} data-a="${on(() => exec({ type: 'reorderStop', stopId: s.id, toIndex: i + 1 }))}">↓</button>
      ${n >= 2 ? `<button class="btn small" data-a="${on(() => pickDest(`Encaixar qual cidade em ${sName(s.id)}?`, (destId) => (S.sheet = { kind: 'split', stopId: s.id, destId, nights: 1, after: Math.max(1, Math.floor(n / 2)) })))}">Encaixar cidade</button>` : ''}
      <button class="btn small" data-a="${on(() => exec({ type: 'removeStop', stopId: s.id }))}">Lixeira</button>
    </div>
    ${lodging ? `<div class="lodging">${lodging}</div>` : ''}
    <button class="toggle" aria-expanded="${isOpen}" data-a="${on(() => (isOpen ? S.open.delete(s.id) : S.open.add(s.id)))}">${isOpen ? 'Esconder dias' : `Ver dias (${n})`}</button>
    ${daysHtml}
  </article>`
}

function openCard(s: Stop, i: number): string {
  const st = it()
  const n = s.days.length
  const prev = st.stops[i - 1]
  const next = st.stops[i + 1]
  const same = prev && next && prev.destinationId === next.destinationId && prev.destinationId
  const btns: string[] = []
  btns.push(
    `<button class="btn small main" data-a="${on(() =>
      pickDest('Qual cidade?', (destId) => {
        if (n === 1) exec({ type: 'fillOpen', stopId: s.id, destinationId: destId })
        else S.sheet = { kind: 'fill', stopId: s.id, destId, nights: n, side: 'start' }
      }),
    )}">+ Escolher cidade</button>`,
  )
  if (same)
    btns.push(
      `<button class="btn small" data-a="${on(() => exec({ type: 'stretchInto', stopId: s.id, side: 'before' }))}">Juntar ${h(sName(prev.id))}</button>`,
    )
  else {
    if (prev?.destinationId)
      btns.push(
        `<button class="btn small" data-a="${on(() => exec({ type: 'stretchInto', stopId: s.id, side: 'before' }))}">Esticar ${h(sName(prev.id))}</button>`,
      )
    if (next?.destinationId)
      btns.push(
        `<button class="btn small" data-a="${on(() => exec({ type: 'stretchInto', stopId: s.id, side: 'after' }))}">Esticar ${h(sName(next.id))}</button>`,
      )
  }
  if (st.lock === 'free' && st.stops.length > 1)
    btns.push(
      `<button class="btn small ghost" data-a="${on(() => exec({ type: 'closeOpen', stopId: s.id }))}">Encurtar a viagem</button>`,
    )
  return `<article class="card open-nights" id="c-${s.id}">
    <div class="c-title"><h3>${plural(n, 'noite em aberto', 'noites em aberto')}</h3><div class="dates">${h(nightsText(s.id))}</div></div>
    <div class="row">${btns.join('')}</div>
  </article>`
}

const MODES: LegMode[] = ['flight', 'train', 'bus', 'car', 'boat', 'walk', 'bike', 'moto']
const NEEDS_TICKET = new Set<LegMode>(['flight', 'train', 'bus', 'boat'])

function fmtMinutes(m: number): string {
  const hh = Math.floor(m / 60)
  const mm = m % 60
  return hh ? `${hh} h${mm ? ` ${String(mm).padStart(2, '0')}` : ''}` : `${mm} min`
}

function ticketHtml(leg: Leg): string {
  const from = legEndDest(leg.from)
  const to = legEndDest(leg.to)
  if (!from || !to)
    return '<span class="meta">Escolha a cidade das noites em aberto para ver a passagem.</span>'
  const mine = S.data.bookings.filter(
    (b): b is Extract<Booking, { kind: 'transport' }> =>
      b.kind === 'transport' && !b.archived && b.fromDestinationId === from && b.toDestinationId === to,
  )
  const parts: string[] = []
  let bought = false
  for (const b of mine) {
    const stt = bookingStatus(b, it())
    if (stt.legId !== leg.id) continue
    if (stt.state === 'ok') {
      bought = true
      parts.push(`<span class="pill ok ticket bought">${h(b.title)} ✓</span>`)
    } else if (stt.state === 'wrong-mode') {
      bought = true
      parts.push(`<span class="warnline">Você tem passagem de ${MODE_NAMES[b.mode]} para este trecho.</span>
        <div class="row"><button class="btn small" data-a="${on(() => exec({ type: 'setLegMode', legId: leg.id, mode: b.mode }))}">Voltar para ${MODE_NAMES[b.mode]}</button>
        <button class="btn small ghost" data-a="${on(() => archiveBooking(b.id))}">Arquivar passagem</button></div>`)
    } else if (stt.state === 'out-of-window') {
      const d = legDate(leg)
      parts.push(`<span class="warnline">${h(b.title)}: a passagem é de ${ddmm(b.date)}${d ? `; o trecho agora é ${ddmm(d)}` : ''}.</span>
        <div class="row"><button class="btn small ghost" data-a="${on(() => archiveBooking(b.id))}">Arquivar passagem</button></div>`)
    }
  }
  if (!bought && NEEDS_TICKET.has(leg.mode)) {
    const can = !!legDate(leg)
    parts.push(
      `<button class="btn small" ${can ? '' : 'disabled'} data-a="${on(() => markTicket(leg))}">Passagem: falta comprar · marcar comprada</button>${can ? '' : '<span class="meta">Defina a data de ida para marcar passagens.</span>'}`,
    )
  }
  return parts.join('')
}

function legCard(leg: Leg, ds: Day[]): string {
  const st = it()
  const isOpen = S.open.has(leg.id)
  const est = estimateLeg(leg, st, S.data.destinations)
  const src = { user: 'sua passagem', route: 'rota real', estimate: 'estimativa', none: 'sem distância' }[
    est.source
  ]
  const time =
    est.minutes !== null ? `${fmtMinutes(est.minutes)} · ${src}${est.km ? ` · ${est.km} km` : ''}` : src
  const home = leg.to === 'home'
  const legDays = ds.filter((d) => d.legId === leg.id)
  const departure = home ? ds.find((d) => d.kind === 'departure') : undefined
  const toIdx = home ? st.stops.length : st.stops.findIndex((s) => s.id === leg.to)
  const details = isOpen
    ? `<div class="modes" role="group" aria-label="Meio de transporte">${MODES.map(
        (m) =>
          `<button class="mode${m === leg.mode ? ' on' : ''}" aria-pressed="${m === leg.mode}" data-a="${on(() => m !== leg.mode && exec({ type: 'setLegMode', legId: leg.id, mode: m }))}">${MODE_NAMES[m]}</button>`,
      ).join('')}</div>
      <div class="row">
        <button class="btn small" data-a="${on(() => (S.sheet = { kind: 'times', legId: leg.id }))}">Horários</button>
        <button class="btn small" data-a="${on(() => pickDest('Qual cidade entra aqui?', (destId) => (S.sheet = { kind: 'insert', index: toIdx, destId, nights: 1 })))}">+ Cidade aqui</button>
        ${
          home
            ? ''
            : `<div class="stepper" role="group" aria-label="Noites a bordo"><button aria-label="Menos uma noite a bordo" ${leg.aboard.length ? '' : 'disabled'} data-a="${on(() => aboardOptions(leg, -1))}">−</button><span>${leg.aboard.length} a bordo</span><button aria-label="Mais uma noite a bordo" data-a="${on(() => aboardOptions(leg, 1))}">+</button></div>`
        }
      </div>
      ${legDays.length ? `<div class="days">${legDays.map((d) => dayRow(d)).join('')}</div>` : ''}
      ${departure ? `<div class="days"><div class="group-t">DIA DA VOLTA</div>${dayRow(departure)}</div>` : ''}`
    : ''
  return `<div class="leg" id="l-${leg.id}">
    <div class="rail" aria-hidden="true"></div>
    <div class="body">
      <div class="t"><b>${h(legName(st, leg, names()))}</b><span class="meta">${h(legDayLabel(leg))} · ${MODE_NAMES[leg.mode]}${leg.dep ? ` · ${leg.dep}${leg.arr ? `→${leg.arr}${leg.arrDayOffset ? ` (+${leg.arrDayOffset})` : ''}` : ''}` : ''}</span></div>
      <div class="meta">${h(time)}</div>
      ${ticketHtml(leg)}
      <button class="toggle" aria-expanded="${isOpen}" data-a="${on(() => (isOpen ? S.open.delete(leg.id) : S.open.add(leg.id)))}">${isOpen ? 'Fechar trecho' : 'Editar trecho'}</button>
      ${details}
    </div>
  </div>`
}

function roteiro(): string {
  const st = it()
  const ds = allDays(st, S.data.places)
  let list = ''
  st.stops.forEach((s, i) => {
    const leg = st.legs[i]
    if (leg) list += legCard(leg, ds)
    list += s.destinationId ? cityCard(s, i, ds) : openCard(s, i)
  })
  const home = st.legs[st.stops.length]
  if (home) list += legCard(home, ds)
  return strip() + `<div class="list">${list}</div>`
}

const RARITY_LABEL: Record<Rarity, string> = { maybe: 'Se der', want: 'Quero', must: 'Imperdível' }
const NEXT_RARITY: Record<Rarity, Rarity> = { maybe: 'want', want: 'must', must: 'maybe' }

function mochila(): string {
  const st = it()
  const states = placeStates(st, S.data.places)
  const inTrip = [...new Set(st.stops.map((s) => s.destinationId).filter((x): x is ID => !!x))]
  const others = S.data.destinations.filter((d) => !inTrip.includes(d.id)).map((d) => d.id)
  const section = (destId: ID, saved: boolean) => {
    const d = dest(destId)
    const items = S.data.places.filter((p) => p.destinationId === destId)
    const withDay = items.filter((p) => states.get(p.id)?.days.length).length
    const rows = items
      .map((p) => {
        const s = states.get(p.id)!
        const chips = [
          ...s.days.map((x) => `<span class="pill ok">${h(x.label)}</span>`),
          s.days.length > 1 ? `<span class="pill">×${s.days.length}</span>` : '',
          s.returnedFrom ? `<span class="pill warn">voltou de ${h(s.returnedFrom)}</span>` : '',
          s.visited ? '<span class="pill ok">✓ visitado</span>' : '',
        ].join('')
        const glow = p.rarity === 'must' && !s.days.length
        return `<div class="item${glow ? ' glow' : ''}" id="p-${p.id}">
          <div class="top"><span class="nm">${h(p.name)}</span>
            <button class="rar ${p.rarity}" aria-label="Raridade: ${RARITY_LABEL[p.rarity]}. Tocar para trocar" data-a="${on(
              () => {
                p.rarity = NEXT_RARITY[p.rarity]
                save()
              },
            )}">${RARITY_LABEL[p.rarity]}</button></div>
          ${chips ? `<div class="row">${chips}</div>` : ''}
          <div class="row"><button class="btn small" data-a="${on(
            () =>
              (S.sheet = {
                kind: 'days',
                title: `Agendar ${p.name}`,
                prefer: p.destinationId,
                pick: (ref) => exec({ type: 'scheduleVisit', visitId: nextId(), placeId: p.id, day: ref }),
              }),
          )}">+ Agendar</button></div>
        </div>`
      })
      .join('')
    return `<section class="dest"><h2>${h(d?.name ?? '?')} <small>${saved ? 'destino guardado · ' : ''}${withDay}/${items.length} com dia</small></h2>
      <div class="items">${rows || '<p class="note">Mochila vazia.</p>'}</div>
      <form class="addform" data-f="${on((v) => {
        const name = (v ?? '').trim()
        if (!name) return
        S.data.places.push({ id: nextId(), destinationId: destId, name, rarity: 'want' })
        toast(`${name} entrou na mochila de ${d?.name ?? 'destino'}.`)
        save()
      })}"><input type="text" name="nome" id="novo-${destId}" placeholder="Novo item em ${h(d?.name ?? '')}" aria-label="Novo item em ${h(d?.name ?? '')}"><button class="btn small">Adicionar</button></form>
    </section>`
  }
  return `<p class="note">Toque na raridade para trocar (Se der · Quero · Imperdível). Imperdível sem dia brilha e vira quest.</p>
    ${inTrip.map((id) => section(id, false)).join('')}${others.map((id) => section(id, true)).join('')}`
}

function issueTarget(i: Issue): (() => void) | null {
  const d = i.data ?? {}
  switch (i.target.kind) {
    case 'stop':
      return () => focusOn(`c-${i.target.id}`)
    case 'leg':
      return () => {
        S.open.add(i.target.id)
        focusOn(`l-${i.target.id}`)
      }
    case 'place':
      return () => focusOn(`p-${i.target.id}`, 'mochila')
    case 'booking':
      if (d.stopId) return () => focusOn(`c-${String(d.stopId)}`)
      if (d.legId) return () => focusOn(`l-${String(d.legId)}`)
      return null
    default:
      return null
  }
}

function quests(): string {
  const st = it()
  const issues = health(st, {
    destinations: S.data.destinations,
    places: S.data.places,
    bookings: S.data.bookings,
  })
  if (!issues.length) return '<div class="empty">Nenhuma pendência. Viagem redonda.</div>'
  const sev = { alert: 'URGENTE', warn: 'ATENÇÃO', info: 'QUEST' }
  return `<div class="quests">${issues
    .map((i) => {
      const go = issueTarget(i)
      const extra: string[] = []
      if (i.target.kind === 'booking') {
        const b = S.data.bookings.find((x) => x.id === i.target.id)
        if (i.kind === 'booking-wrong-mode' && b?.kind === 'transport' && i.data?.legId)
          extra.push(
            `<button class="btn small" data-a="${on(() => exec({ type: 'setLegMode', legId: String(i.data!.legId), mode: b.mode }))}">Voltar para ${MODE_NAMES[b.mode]}</button>`,
          )
        extra.push(
          `<button class="btn small ghost" data-a="${on(() => archiveBooking(i.target.id))}">Arquivar reserva</button>`,
        )
      }
      if ((i.kind === 'lodging-missing' || i.kind === 'lodging-partial') && st.start)
        extra.push(
          `<button class="btn small" data-a="${on(() => markLodging(i.target.id))}">Marcar hospedagem</button>`,
        )
      if (i.kind === 'transport-missing') {
        const leg = st.legs.find((l) => l.id === i.target.id)
        if (leg && legDate(leg))
          extra.push(
            `<button class="btn small" data-a="${on(() => markTicket(leg))}">Marcar comprada</button>`,
          )
      }
      if (i.kind === 'must-unscheduled') {
        const p = place(i.target.id)
        if (p)
          extra.push(
            `<button class="btn small" data-a="${on(
              () =>
                (S.sheet = {
                  kind: 'days',
                  title: `Agendar ${p.name}`,
                  prefer: p.destinationId,
                  pick: (ref) => exec({ type: 'scheduleVisit', visitId: nextId(), placeId: p.id, day: ref }),
                }),
            )}">+ Agendar</button>`,
          )
      }
      return `<div class="quest ${i.severity}"><span class="qhead">${sev[i.severity]}</span><p>${h(describeIssue(i, st, names(), S.data.bookings))}</p>
        <div class="row">${go ? `<button class="btn small ghost" data-a="${on(go)}">Ver</button>` : ''}${extra.join('')}</div></div>`
    })
    .join('')}</div>`
}

function registro(): string {
  const checks = S.checks.length
    ? `<ul class="checks">${S.checks.map((c) => `<li class="${c.ok ? 'ok' : 'no'}"><span class="m">${c.ok ? '✓' : '✗'}</span>${h(c.label)}</li>`).join('')}</ul>`
    : '<p class="note">Faça uma edição: depois de cada uma, o laboratório confere as regras abaixo.</p>'
  const text = JSON.stringify({ viagem: S.key, registro: [...S.data.log].reverse() }, null, 1)
  const log = S.data.log.length
    ? S.data.log
        .slice(0, 80)
        .map(
          (e) =>
            `<div class="log-e${e.ok ? '' : ' fail'}"><code>#${e.n} ${h(e.cmd)}</code><p>${h(e.text)}</p></div>`,
        )
        .join('')
    : '<p class="note">Nenhum comando ainda.</p>'
  return `<h2 class="sec">Conferências da última edição</h2>${checks}
    <h2 class="sec">Registro do motor</h2>
    <p class="note">Cada toque vira um comando serializável. Se algo parecer errado, copie o registro e mande junto com o que você esperava.</p>
    <div class="row" style="margin-top:10px">
      <button class="btn small" data-a="${on(() => {
        S.showLog = true
        navigator.clipboard?.writeText(text).then(
          () => toast('Registro copiado.'),
          () => toast('Não deu para copiar; o texto está selecionável abaixo.', true),
        )
      })}">Copiar registro</button>
      <button class="btn small ghost" data-a="${on(() => {
        if (!S.resetArmed) {
          S.resetArmed = true
          return
        }
        S.resetArmed = false
        S.data = fresh(S.key)
        S.undo = []
        S.checks = []
        save()
        toast('Viagem de teste recomeçada.')
      })}">${S.resetArmed ? 'Toque de novo para recomeçar' : 'Recomeçar esta viagem'}</button>
    </div>
    ${S.showLog ? `<textarea id="log-text" readonly aria-label="Registro em texto">${h(text)}</textarea>` : ''}
    <div class="log">${log}</div>`
}

// ---------------------------------------------------------------------------
// Painéis
// ---------------------------------------------------------------------------

function pickDest(title: string, pick: (destId: ID) => void) {
  S.sheet = { kind: 'dest', title, pick }
}

function optHtml(o: Opt): string {
  return `<button class="opt${o.main ? ' main' : ''}" ${o.disabled ? 'disabled' : ''} data-a="${on(o.run)}"><b>${h(o.label)}</b>${(o.detail ?? []).map((d) => `<span>${h(d)}</span>`).join('')}</button>`
}

function seg<T extends string | number>(items: [T, string][], value: T, set: (v: T) => void): string {
  return `<div class="seg">${items
    .map(
      ([v, label]) =>
        `<button class="${v === value ? 'on' : ''}" aria-pressed="${v === value}" data-a="${on(() => set(v))}">${h(label)}</button>`,
    )
    .join('')}</div>`
}

function stepper(
  value: number,
  min: number,
  max: number,
  set: (v: number) => void,
  unit: [string, string],
): string {
  return `<div class="stepper"><button aria-label="Menos" ${value <= min ? 'disabled' : ''} data-a="${on(() => set(value - 1))}">−</button><span>${plural(value, unit[0], unit[1])}</span><button aria-label="Mais" ${value >= max ? 'disabled' : ''} data-a="${on(() => set(value + 1))}">+</button></div>`
}

function daysPicker(title: string, prefer: ID | null | undefined, pick: (ref: DayRef) => void): string {
  const ds = allDays(it(), S.data.places).filter((d) => d.ref)
  const row = (d: Day) =>
    `<button class="opt" data-a="${on(() => pick(d.ref!))}"><b>${h(d.label)} · ${h(d.kind === 'aboard' ? 'a bordo' : d.kind === 'departure' ? `dia da volta` : (dest(d.destinationId)?.name ?? ''))}</b><span>${d.visits.length ? h(d.visits.map((v) => place(v.placeId)?.name).join(', ')) : 'dia livre'}</span></button>`
  const near = prefer ? ds.filter((d) => d.destinationId === prefer) : []
  const rest = ds.filter((d) => !near.includes(d))
  return `<h2>${h(title)}</h2>
    ${near.length ? `<div class="group-t">EM ${h((dest(prefer)?.name ?? '').toUpperCase())}</div>${near.map(row).join('')}` : ''}
    ${rest.length ? `<div class="group-t">${near.length ? 'OUTROS DIAS (BATE-VOLTA)' : 'DIAS'}</div>${rest.map(row).join('')}` : ''}`
}

function sheetBody(sh: Sheet): string {
  const st = it()
  switch (sh.kind) {
    case 'choice':
      return `<h2>${h(sh.title)}</h2>${sh.sub ? `<p class="sub">${h(sh.sub)}</p>` : ''}${sh.options.map(optHtml).join('')}`
    case 'dest': {
      const list = S.data.destinations
        .map(
          (d) =>
            `<button class="opt" data-a="${on(() => sh.pick(d.id))}"><b>${h(d.name)}${d.localName ? ` · ${h(d.localName)}` : ''}</b></button>`,
        )
        .join('')
      return `<h2>${h(sh.title)}</h2>${list}
        <form class="addform" data-f="${on((v) => {
          const name = (v ?? '').trim()
          if (!name) return
          const id = `d-${nextId()}`
          S.data.destinations.push({ id, name, kind: 'city' })
          save()
          sh.pick(id)
        })}"><input type="text" name="nome" id="nova-cidade" placeholder="Outra cidade" aria-label="Outra cidade"><button class="btn small">Usar</button></form>`
    }
    case 'days':
      return daysPicker(sh.title, sh.prefer, sh.pick)
    case 'items': {
      const day = allDays(st, S.data.places).find((d) => deepEqual(d.ref, sh.ref))
      const here = day?.destinationId
      const items = [...S.data.places].sort(
        (a, b) => Number(b.destinationId === here) - Number(a.destinationId === here),
      )
      return `<h2>O que fazer em ${h(day?.label ?? 'este dia')}?</h2>${items
        .map(
          (p) =>
            `<button class="opt" data-a="${on(() => exec({ type: 'scheduleVisit', visitId: nextId(), placeId: p.id, day: sh.ref }))}"><b>${h(p.name)}</b><span>${h(dest(p.destinationId)?.name ?? '')} · ${RARITY_LABEL[p.rarity]}${p.destinationId !== here ? ' · bate-volta' : ''}</span></button>`,
        )
        .join('')}`
    }
    case 'visit': {
      const f = findVisit(st, sh.visitId)
      const v = f?.list[f.index]
      if (!v) return '<h2>Esse item não está mais aqui.</h2>'
      const slots: [Slot, string][] = [
        ['any', 'qualquer hora'],
        ['morning', 'manhã'],
        ['afternoon', 'tarde'],
        ['evening', 'noite'],
      ]
      return `<h2>${h(place(v.placeId)?.name ?? 'Item')}</h2>
        <div class="field"><span>Turno</span>${seg(slots, v.slot, (slot) => exec({ type: 'setVisitMeta', visitId: v.id, slot }))}</div>
        ${optHtml({ label: 'Mover para outro dia', run: () => (S.sheet = { kind: 'days', title: 'Mover para qual dia?', prefer: place(v.placeId)?.destinationId, pick: (ref) => exec({ type: 'moveVisit', visitId: v.id, to: ref }) }) })}
        ${optHtml({ label: v.visited ? 'Desmarcar visitado' : 'Marcar visitado', run: () => exec({ type: 'setVisitMeta', visitId: v.id, visited: !v.visited }) })}
        ${optHtml({ label: 'Tirar do dia', detail: ['Continua na mochila.'], run: () => exec({ type: 'unscheduleVisit', visitId: v.id }) })}`
    }
    case 'times': {
      const leg = st.legs.find((l) => l.id === sh.legId)
      if (!leg) return '<h2>Esse trecho saiu do roteiro.</h2>'
      return `<h2>Horários de ${h(legName(st, leg, names()))}</h2>
        <p class="sub">Horário local de cada ponta. Com horários, o tempo do trecho vira "sua passagem".</p>
        <div class="row"><label class="field" for="dep"><span>Sai</span><input type="time" id="dep" value="${leg.dep ?? ''}"></label>
        <label class="field" for="arr"><span>Chega</span><input type="time" id="arr" value="${leg.arr ?? ''}"></label>
        <label class="field" for="off"><span>Chega em</span><select id="off"><option value="0">o mesmo dia</option><option value="1"${leg.arrDayOffset === 1 ? ' selected' : ''}>o dia seguinte</option><option value="2"${leg.arrDayOffset === 2 ? ' selected' : ''}>2 dias depois</option></select></label></div>
        <div class="row"><button class="btn main" data-a="${on(() => {
          const val = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value || null
          const off = Number(val('off') ?? 0)
          exec({
            type: 'setLegTimes',
            legId: leg.id,
            dep: val('dep'),
            arr: val('arr'),
            arrDayOffset: off || null,
          })
        })}">Salvar</button>
        <button class="btn ghost" data-a="${on(() => exec({ type: 'setLegTimes', legId: leg.id, dep: null, arr: null, arrDayOffset: null }))}">Limpar</button></div>`
    }
    case 'split': {
      const s = st.stops.find((x) => x.id === sh.stopId)
      if (!s) return '<h2>Essa cidade saiu do roteiro.</h2>'
      const n = s.days.length
      const ds = allDays(st).filter((d) => d.stopId === s.id)
      const afterItems: [number, string][] = Array.from({ length: n - 1 }, (_, k) => [
        k + 1,
        `depois de ${ds[k]?.label ?? `dia ${k + 1}`}`,
      ])
      const base = {
        type: 'splitStopWith' as const,
        stopId: s.id,
        afterOrdinal: sh.after,
        destinationId: sh.destId,
        nights: sh.nights,
      }
      const i = st.stops.indexOf(s)
      const options: Opt[] = []
      if (st.lock === 'free')
        options.push(
          cmdOpt(
            `Adiar a volta (${newEndLabel(sh.nights)})`,
            { ...base, via: { kind: 'return' } },
            { main: true },
          ),
        )
      options.push(
        cmdOpt(
          `Tirar de ${sName(s.id)} mesmo`,
          { ...base, via: { kind: 'stop', stopId: s.id } },
          { main: st.lock === 'fixed' },
        ),
      )
      for (const d of donorStops(s.id, i, sh.nights))
        options.push(
          cmdOpt(
            d.destinationId ? `Tirar de ${sName(d.id)} (${windowText(d.id)})` : 'Usar as noites em aberto',
            { ...base, via: { kind: 'stop', stopId: d.id } },
          ),
        )
      if (st.lock === 'fixed')
        options.push(
          cmdOpt(`Adiar a volta (${newEndLabel(sh.nights)})`, { ...base, via: { kind: 'return' } }),
        )
      return `<h2>Encaixar ${h(dest(sh.destId)?.name)} em ${h(sName(s.id))}</h2>
        <div class="field"><span>Noites em ${h(dest(sh.destId)?.name)}</span>${stepper(sh.nights, 1, 14, (v) => (sh.nights = v), ['noite', 'noites'])}</div>
        <div class="field"><span>Quando</span>${seg(afterItems, sh.after, (v) => (sh.after = v))}</div>
        <div class="group-t">DE ONDE SAEM AS NOITES?</div>${options.map(optHtml).join('')}`
    }
    case 'insert': {
      const options: Opt[] = []
      const base = {
        type: 'insertStop' as const,
        index: sh.index,
        destinationId: sh.destId,
        nights: sh.nights,
      }
      if (st.lock === 'free')
        options.push(
          cmdOpt(
            `Adiar a volta (${newEndLabel(sh.nights)})`,
            { ...base, via: { kind: 'return' } },
            { main: true },
          ),
        )
      for (const d of donorStops(null, sh.index - 0.5, sh.nights))
        options.push(
          cmdOpt(
            d.destinationId ? `Tirar de ${sName(d.id)} (${windowText(d.id)})` : 'Usar as noites em aberto',
            { ...base, via: { kind: 'stop', stopId: d.id } },
            { main: !options.length },
          ),
        )
      if (st.lock === 'fixed')
        options.push(
          cmdOpt(`Adiar a volta (${newEndLabel(sh.nights)})`, { ...base, via: { kind: 'return' } }),
        )
      return `<h2>${h(dest(sh.destId)?.name)} entra aqui</h2>
        <div class="field"><span>Noites</span>${stepper(sh.nights, 1, 14, (v) => (sh.nights = v), ['noite', 'noites'])}</div>
        <div class="group-t">DE ONDE SAEM AS NOITES?</div>${options.map(optHtml).join('')}`
    }
    case 'fill': {
      const s = st.stops.find((x) => x.id === sh.stopId)
      if (!s) return '<h2>Essas noites já mudaram.</h2>'
      const n = s.days.length
      const partial = sh.nights < n
      return `<h2>Quantas noites em ${h(dest(sh.destId)?.name)}?</h2>
        <div class="field"><span>Noites</span>${stepper(sh.nights, 1, n, (v) => (sh.nights = v), ['noite', 'noites'])}</div>
        ${
          partial
            ? `<div class="field"><span>Onde</span>${seg<'start' | 'end'>(
                [
                  ['start', 'no começo'],
                  ['end', 'no fim'],
                ],
                sh.side,
                (v) => (sh.side = v),
              )}</div><p class="sub">O resto continua em aberto.</p>`
            : ''
        }
        <div class="row"><button class="btn main" data-a="${on(() => exec({ type: 'fillOpen', stopId: s.id, destinationId: sh.destId, ...(partial ? { nights: sh.nights, side: sh.side } : {}) }))}">Preencher</button></div>`
    }
    case 'end': {
      const r = tripRange(st)
      if (!st.start || !r.end) return '<h2>Defina a data de ida antes.</h2>'
      const target = sh.date ?? r.end
      const delta = diffDays(r.end, target)
      const base = { type: 'setTripEnd' as const, date: target }
      let options: Opt[] = []
      if (delta < 0) {
        options = [...st.stops]
          .filter((s) => s.days.length + delta >= 1)
          .sort((a, b) => b.days.length - a.days.length)
          .map((s, k) =>
            cmdOpt(
              `Tirar ${plural(-delta, 'noite', 'noites')} de ${sName(s.id)} (${windowText(s.id)})`,
              { ...base, takeFrom: [{ stopId: s.id, nights: -delta }] },
              { main: k === 0 },
            ),
          )
        if (!options.length)
          options = [
            {
              label: 'Nenhuma cidade tem tantas noites sobrando.',
              detail: ['Use a lixeira numa cidade ou escolha outra data.'],
              run: () => {},
              disabled: true,
            },
          ]
      } else if (delta > 0) {
        options = [...st.stops]
          .reverse()
          .filter((s) => s.destinationId)
          .map((s, k) =>
            cmdOpt(
              `${sName(s.id)} ganha ${plural(delta, 'noite', 'noites')}`,
              { ...base, takeFrom: [{ stopId: s.id, nights: 0 }] },
              { main: k === 0 },
            ),
          )
      }
      return `<h2>Mudar a volta</h2>
        <label class="field" for="volta"><span>Nova data de volta</span><input type="date" id="volta" value="${target}" data-c="${on((v) => v && (sh.date = v))}"></label>
        ${delta === 0 ? '<p class="sub">Escolha uma data diferente da atual.</p>' : `<div class="group-t">${delta < 0 ? 'DE ONDE SAEM AS NOITES?' : 'QUEM GANHA AS NOITES?'}</div>`}
        ${options.map(optHtml).join('')}`
    }
  }
}

function sheet(): string {
  if (!S.sheet) return ''
  return `<button class="scrim" aria-label="Fechar" data-a="${on(() => (S.sheet = null))}"></button>
    <div class="sheet" role="dialog" aria-modal="true"><div class="sheet-in"><div class="grip"></div>${sheetBody(S.sheet)}
    <button class="btn ghost" data-a="${on(() => (S.sheet = null))}">Fechar</button></div></div>`
}

function toastHtml(): string {
  if (!S.toast) return ''
  return `<div class="toast${S.toast.warn ? ' warn' : ''}" role="status"><p>${h(S.toast.text)}</p>${
    S.toast.undo && S.undo.length ? `<button data-a="${on(undo)}">Desfazer</button>` : ''
  }</div>`
}

function tabs(): string {
  const st = it()
  const n = health(st, {
    destinations: S.data.destinations,
    places: S.data.places,
    bookings: S.data.bookings,
  }).filter((i) => i.severity !== 'info').length
  const t = (id: Tab, k: string, label: string, badge = '') =>
    `<button class="${S.tab === id ? 'on' : ''}" aria-current="${S.tab === id}" data-a="${on(() => {
      S.tab = id
      window.scrollTo(0, 0)
    })}"><span class="k">${k}</span>${label}${badge}</button>`
  return `<nav class="tabs">${t('roteiro', '旅', 'Roteiro')}${t('mochila', '袋', 'Mochila')}${t('quests', '任', 'Quests', n ? `<span class="badge">${n}</span>` : '')}${t('registro', '録', 'Registro')}</nav>`
}

const app = document.getElementById('app')!

function petals(): string {
  return `<div class="petals" aria-hidden="true">${Array.from(
    { length: 9 },
    (_, i) =>
      `<i style="left:${(i * 37) % 100}%;animation-duration:${9 + (i % 4) * 3}s;animation-delay:-${i * 2.3}s;transform:scale(${0.6 + (i % 3) * 0.25})"></i>`,
  ).join('')}</div>`
}

function render() {
  const stripScroll = document.getElementById('strip')?.scrollLeft ?? 0
  ACTIONS.clear()
  actSeq = 0
  const body =
    S.tab === 'roteiro'
      ? roteiro()
      : S.tab === 'mochila'
        ? mochila()
        : S.tab === 'quests'
          ? quests()
          : registro()
  app.innerHTML = `${petals()}${hud()}<div class="wrap">${head()}${body}</div>${tabs()}${toastHtml()}${sheet()}`
  const stripEl = document.getElementById('strip')
  if (stripEl) stripEl.scrollLeft = stripScroll
  if (S.focus) {
    const el = document.getElementById(S.focus)
    S.focus = null
    if (el) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
      el.classList.add('flash')
    }
  }
  if (S.showLog) {
    const ta = document.getElementById('log-text') as HTMLTextAreaElement | null
    ta?.select()
  }
}

document.addEventListener('click', (e) => {
  const el = (e.target as Element).closest<HTMLElement>('[data-a]')
  if (!el || el.hasAttribute('disabled') || el.tagName === 'SELECT' || el.tagName === 'INPUT') return
  const fn = ACTIONS.get(el.dataset.a!)
  if (!fn) return
  e.preventDefault()
  fn()
  render()
})
document.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement
  const fn = el.dataset?.c ? ACTIONS.get(el.dataset.c) : undefined
  if (!fn) return
  fn(el.value)
  render()
})
document.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement
  const fn = form.dataset?.f ? ACTIONS.get(form.dataset.f) : undefined
  if (!fn) return
  e.preventDefault()
  fn(String(new FormData(form).get('nome') ?? ''))
  render()
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.sheet) {
    S.sheet = null
    render()
  }
})

let start: TripKey = 'japao'
try {
  const last = localStorage.getItem(`${STORE}:last`)
  if (last && last in ALL_TRIPS) start = last as TripKey
} catch {
  /* sem armazenamento */
}
switchTrip(start)
render()
