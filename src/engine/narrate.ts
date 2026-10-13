import { dayLabel } from './dates'
import { nightsOf } from './core'
import type { Effects, EngineError } from './core'
import { tripRange } from './derive'
import type { Destination, ID, Itinerary, Place } from './types'

// Mensagens em português (spec §5.1.3): curtas, exatas, com as palavras de quem viaja.
// Nunca "parada", "trava", "trecho órfão" ou "vizinha".

export interface Names {
  destinations: Destination[]
  places: Place[]
}

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

function stopName(it: Itinerary, stopId: unknown, names: Names): string {
  const stop = it.stops.find((s) => s.id === stopId)
  if (!stop) return 'Essa cidade'
  if (!stop.destinationId) return 'Noites em aberto'
  return names.destinations.find((d) => d.id === stop.destinationId)?.name ?? 'Essa cidade'
}

function endName(it: Itinerary, end: ID | 'home', names: Names): string {
  if (end === 'home') return it.home?.name ?? 'casa'
  return stopName(it, end, names)
}

function listNames(list: string[]): string {
  if (list.length === 1) return list[0]!
  if (list.length === 2) return `${list[0]} e ${list[1]}`
  return `${list[0]} e mais ${list.length - 1}`
}

/** O que aconteceu, para o aviso com Desfazer. Null quando não há nada a contar. */
export function describeEffects(
  eff: Effects,
  before: Itinerary,
  after: Itinerary,
  names: Names,
): string | null {
  const parts: string[] = []

  const placeNames = [
    ...new Set(
      eff.returned.map((r) => names.places.find((p) => p.id === r.visit.placeId)?.name ?? 'Um item'),
    ),
  ]
  if (placeNames.length)
    parts.push(
      `${listNames(placeNames)} ${eff.returned.length === 1 ? 'voltou' : 'voltaram'} para a mochila.`,
    )

  for (const m of eff.merged) {
    if (!m.destinationId) continue
    const kept = after.stops.find((s) => s.id === m.keptStopId)
    if (!kept) continue
    parts.push(
      `${stopName(after, kept.id, names)} virou uma só: ${plural(nightsOf(kept), 'noite', 'noites')}.`,
    )
  }

  for (const id of eff.legsArchived) {
    const leg = after.archivedLegs.find((l) => l.id === id)
    if (leg)
      parts.push(
        `${endName(before, leg.from, names)} → ${endName(before, leg.to, names)} saiu do roteiro; os dados ficam guardados.`,
      )
  }
  for (const id of eff.legsRestored) {
    const leg = after.legs.find((l) => l.id === id)
    if (leg)
      parts.push(`${endName(after, leg.from, names)} → ${endName(after, leg.to, names)} voltou com os dados.`)
  }

  const a = tripRange(before)
  const b = tripRange(after)
  if (a.start !== b.start && b.start) parts.push(`Ida agora ${dayLabel(b.start)}.`)
  else if (a.end !== b.end && b.end) parts.push(`Volta agora ${dayLabel(b.end)}.`)
  else if (!b.start && a.nights !== b.nights) parts.push(`Agora são ${plural(b.nights, 'noite', 'noites')}.`)

  return parts.length ? parts.join(' ') : null
}

/** Mensagem curta para quando a operação não pôde ser feita. Null quando não há o que dizer. */
export function describeError(error: EngineError, it: Itinerary, names: Names): string | null {
  const d = error.data ?? {}
  switch (error.code) {
    case 'NO_CHANGE':
      return null
    case 'NOT_FOUND':
      return 'Isso mudou enquanto você editava. Tente de novo.'
    case 'MIN_ONE_NIGHT':
      return `${stopName(it, d.stopId, names)} precisa de pelo menos 1 noite.`
    case 'DONOR_TOO_SHORT': {
      const donor = it.stops.find((s) => s.id === d.donorId)
      return `${stopName(it, d.donorId, names)} tem só ${plural(donor ? nightsOf(donor) : 1, 'noite', 'noites')}.`
    }
    case 'SAME_STOP':
      return 'Escolha outra cidade.'
    case 'NEEDS_BOTH_NEIGHBORS': {
      const first = it.stops[0]?.id === d.stopId
      return first ? 'É a primeira cidade: mude a data de ida.' : 'É a última cidade: mude a data de volta.'
    }
    case 'SPLIT_TOO_SMALL':
      return `Não cabe: ${stopName(it, d.stopId, names)} ficaria sem noites depois.`
    case 'NOT_OPEN':
      return 'Essas noites já têm cidade.'
    case 'ALREADY_OPEN':
      return 'Essas noites já estão em aberto.'
    case 'OPEN_HAS_NO_PLANS':
      return 'Escolha uma cidade para essas noites antes.'
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
          return 'É a única cidade da viagem.'
        case 'same-destination':
          return 'Já é essa cidade.'
        case 'split-open':
        case 'open-has-no-days':
        case 'use-fill-open':
          return 'Escolha uma cidade para essas noites antes.'
        case 'open-cannot-donate-here':
          return 'Escolha de qual cidade sai a noite.'
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
