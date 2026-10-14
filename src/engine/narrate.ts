import { addDays, dayLabel, ddmm } from './dates'
import { nightsOf } from './core'
import type { Effects, EngineError } from './core'
import { legDayIndex, stopWindows, tripRange } from './derive'
import type { Issue } from './derive'
import type { Booking, Destination, ID, Itinerary, Leg, LegMode, Place } from './types'

// Mensagens em português (spec §5.1.3): curtas, exatas, com as palavras de quem viaja.
// Nunca "parada", "trava", "trecho órfão" ou "vizinha".

export interface Names {
  destinations: Destination[]
  places: Place[]
}

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

export const MODE_NAMES: Record<LegMode, string> = {
  flight: 'avião',
  train: 'trem',
  bus: 'ônibus',
  car: 'carro',
  boat: 'barco',
  walk: 'a pé',
  bike: 'bike',
  moto: 'moto',
}

/** Nome do destino de uma parada ("Noites em aberto" quando não tem destino). */
export function stopName(it: Itinerary, stopId: unknown, names: Names): string {
  const stop = it.stops.find((s) => s.id === stopId)
  if (!stop) return 'Esse destino'
  if (!stop.destinationId) return 'Noites em aberto'
  return names.destinations.find((d) => d.id === stop.destinationId)?.name ?? 'Esse destino'
}

function endName(it: Itinerary, end: ID | 'home', names: Names): string {
  if (end === 'home') return it.home?.name ?? 'casa'
  return stopName(it, end, names)
}

/** "Kyoto → Tóquio" */
export function legName(it: Itinerary, leg: Leg, names: Names): string {
  return `${endName(it, leg.from, names)} → ${endName(it, leg.to, names)}`
}

function listNames(list: string[]): string {
  if (list.length === 1) return list[0]!
  if (list.length === 2) return `${list[0]} e ${list[1]}`
  return `${list[0]} e mais ${list.length - 1}`
}

/**
 * O que aconteceu (aviso com Desfazer) ou o que vai acontecer (prévia de uma escolha).
 * Null quando não há nada a contar.
 */
export function describeEffects(
  eff: Effects,
  before: Itinerary,
  after: Itinerary,
  names: Names,
  tense: 'done' | 'preview' = 'done',
): string | null {
  const done = tense === 'done'
  const parts: string[] = []

  const placeNames = [
    ...new Set(
      eff.returned.map((r) => names.places.find((p) => p.id === r.visit.placeId)?.name ?? 'Um item'),
    ),
  ]
  if (placeNames.length) {
    const one = eff.returned.length === 1
    const verb = done ? (one ? 'ficou' : 'ficaram') : one ? 'fica' : 'ficam'
    parts.push(`${listNames(placeNames)} ${verb} sem dia.`)
  }

  for (const m of eff.merged) {
    if (!m.destinationId) continue
    const kept = after.stops.find((s) => s.id === m.keptStopId)
    if (!kept) continue
    parts.push(
      `${stopName(after, kept.id, names)} ${done ? 'virou' : 'vira'} uma só: ${plural(nightsOf(kept), 'noite', 'noites')}.`,
    )
  }

  // A ida e a volta continuam existindo (só mudam de cidade e herdam o meio): não vale aviso.
  const homeLeg = (l: Leg) => l.from === 'home' || l.to === 'home'
  for (const id of eff.legsArchived) {
    const leg = after.archivedLegs.find((l) => l.id === id)
    if (leg && !homeLeg(leg))
      parts.push(
        `${legName(before, leg, names)} ${done ? 'saiu' : 'sai'} do roteiro; os dados ficam guardados.`,
      )
  }
  for (const id of eff.legsRestored) {
    const leg = after.legs.find((l) => l.id === id)
    if (leg && !homeLeg(leg))
      parts.push(`${legName(after, leg, names)} ${done ? 'voltou' : 'volta'} com os dados.`)
  }

  const a = tripRange(before)
  const b = tripRange(after)
  const now = done ? 'agora' : 'vai para'
  if (a.start !== b.start && b.start) parts.push(`Ida ${now} ${dayLabel(b.start)}.`)
  else if (a.end !== b.end && b.end) parts.push(`Volta ${now} ${dayLabel(b.end)}.`)
  else if (!b.start && a.nights !== b.nights)
    parts.push(`${done ? 'Agora são' : 'Passam a ser'} ${plural(b.nights, 'noite', 'noites')}.`)

  return parts.length ? parts.join(' ') : null
}

/** Texto de uma pendência da Saúde do roteiro (vira quest). */
export function describeIssue(issue: Issue, it: Itinerary, names: Names, bookings: Booking[]): string {
  const legText = (id: unknown) => {
    const l = it.legs.find((x) => x.id === id)
    return l ? legName(it, l, names) : 'Esse trecho'
  }
  const d = issue.data ?? {}
  const booking = bookings.find((b) => b.id === issue.target.id)
  switch (issue.kind) {
    case 'booking-orphan':
      return `${booking?.title ?? 'Reserva'}: ${booking?.kind === 'lodging' ? 'esse destino' : 'esse trecho'} não está mais no roteiro.`
    case 'booking-out-of-window': {
      if (booking?.kind === 'lodging') {
        const w = stopWindows(it).find((x) => x.stopId === d.stopId)
        const when = w?.start && w.end ? ` (${ddmm(w.start)} a ${ddmm(w.end)})` : ''
        return `${booking.title}: as datas não batem com ${stopName(it, d.stopId, names)}${when}.`
      }
      if (booking?.kind === 'transport') {
        const idx = legDayIndex(it, String(d.legId))
        const legDate = idx === null || !it.start ? null : addDays(it.start, idx)
        return legDate
          ? `${booking.title}: a passagem é de ${ddmm(booking.date)}; o trecho agora é ${ddmm(legDate)}.`
          : `${booking.title}: a data não bate com o roteiro.`
      }
      return `${booking?.title ?? 'Reserva'}: fora das datas da viagem.`
    }
    case 'booking-wrong-mode':
      return booking?.kind === 'transport'
        ? `Você tem passagem de ${MODE_NAMES[booking.mode]} para ${legText(d.legId)}.`
        : 'Essa passagem é de outro meio.'
    case 'anchor-outside': {
      const a = it.anchors.find((x) => x.id === issue.target.id)
      const dest = names.destinations.find((x) => x.id === a?.destinationId)?.name ?? 'o lugar'
      return a ? `${a.title} (${ddmm(a.date)}) ficou fora de ${dest}.` : 'Um compromisso ficou fora do lugar.'
    }
    case 'lodging-partial': {
      const nights = (d.nights as string[] | undefined) ?? []
      const list = nights.length <= 2 ? nights.join(' e ') : `${nights[0]} e mais ${nights.length - 1}`
      return `${stopName(it, issue.target.id, names)}: ${list} sem hospedagem.`
    }
    case 'lodging-missing': {
      const n = ((d.nights as string[] | undefined) ?? []).length
      return `${stopName(it, issue.target.id, names)}: falta hospedagem (${plural(n, 'noite', 'noites')}).`
    }
    case 'open-nights': {
      const n = Number(d.nights ?? 0)
      const when = n > 1 ? `${String(d.from)} a ${String(d.to)}` : String(d.from)
      return `${plural(n, 'noite', 'noites')} em aberto (${when}).`
    }
    case 'long-drive': {
      const h = Math.round((Number(d.minutes ?? 0) / 60) * 2) / 2
      return `${legText(issue.target.id)}: ~${String(h).replace('.', ',')} h de carro num dia.`
    }
    case 'outside-resource': {
      const r = it.resources.find((x) => x.id === d.resourceId)
      return `${legText(issue.target.id)} fica fora do período de ${r?.title ?? 'um recurso'}.`
    }
    case 'transport-missing': {
      const l = it.legs.find((x) => x.id === issue.target.id)
      return `${legText(issue.target.id)}: falta a passagem${l ? ` de ${MODE_NAMES[l.mode]}` : ''}.`
    }
    case 'must-unscheduled': {
      const p = names.places.find((x) => x.id === issue.target.id)
      return `${p?.name ?? 'Um item'} é imperdível e ainda não tem dia.`
    }
  }
}

/** Mensagem curta para quando a operação não pôde ser feita. Null quando não há o que dizer. */
export function describeError(error: EngineError, it: Itinerary, names: Names): string | null {
  const d = error.data ?? {}
  switch (error.code) {
    case 'NO_CHANGE':
      return null
    case 'NOT_FOUND':
      return 'Isso mudou enquanto você editava. Tente de novo.'
    case 'CHANGED_SINCE':
      return describeUndoRefusal('CHANGED_SINCE')
    case 'MIN_ONE_NIGHT':
      return `${stopName(it, d.stopId, names)} precisa de pelo menos 1 noite.`
    case 'DONOR_TOO_SHORT': {
      const donor = it.stops.find((s) => s.id === d.donorId)
      return `${stopName(it, d.donorId, names)} tem só ${plural(donor ? nightsOf(donor) : 1, 'noite', 'noites')}.`
    }
    case 'SAME_STOP':
      return 'Escolha outro destino.'
    case 'NEEDS_BOTH_NEIGHBORS': {
      const first = it.stops[0]?.id === d.stopId
      return first ? 'É o primeiro destino: mude a data de ida.' : 'É o último destino: mude a data de volta.'
    }
    case 'SPLIT_TOO_SMALL':
      return `Não cabe: ${stopName(it, d.stopId, names)} ficaria sem noites depois.`
    case 'NOT_OPEN':
      return 'Essas noites já têm destino.'
    case 'ALREADY_OPEN':
      return 'Essas noites já estão em aberto.'
    case 'OPEN_HAS_NO_PLANS':
      return 'Escolha um destino para essas noites antes.'
    case 'NO_START':
      return 'Escolha a data de ida antes.'
    case 'INVALID_DATE':
      return 'Essa data não existe.'
    case 'TAKE_FROM_MISMATCH':
      return `Escolha de onde saem ${plural(Number(d.needed ?? 0), 'noite', 'noites')}.`
    case 'OUT_OF_RANGE':
      return 'Esse dia não existe mais.'
    case 'INVALID':
      switch (d.reason) {
        case 'only-stop':
          return 'É o único destino da viagem.'
        case 'same-destination':
          return 'Já é esse destino.'
        case 'split-open':
        case 'open-has-no-days':
        case 'use-fill-open':
          return 'Escolha um destino para essas noites antes.'
        case 'open-cannot-donate-here':
          return 'Escolha de qual destino sai a noite.'
        case 'home-leg-aboard':
          return 'Na volta, marque a chegada no dia seguinte.'
        default:
          return 'Isso não deu certo.'
      }
  }
}

/** Quando o Desfazer é recusado. */
export function describeUndoRefusal(code: 'CHANGED_SINCE' | 'NOTHING_TO_UNDO'): string {
  return code === 'CHANGED_SINCE' ? 'Alguém mudou isso depois. Não dá para desfazer.' : 'Nada para desfazer.'
}
