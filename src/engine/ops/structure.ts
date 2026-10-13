import { fail, getStop, isOpen, newStop, nightsOf, normalize, resize, returnDays, stopIndex } from '../core'
import type { Effects, OpContext } from '../core'
import type { ID, Itinerary, Via } from '../types'
import { donate } from './nights'

export function reorderStop(
  it: Itinerary,
  before: Itinerary,
  a: { stopId: ID; toIndex: number },
  ctx: OpContext,
  eff: Effects,
) {
  const from = stopIndex(it, a.stopId)
  const to = Math.max(0, Math.min(it.stops.length - 1, Math.trunc(a.toIndex)))
  if (from === to) fail('NO_CHANGE')
  const [moved] = it.stops.splice(from, 1)
  it.stops.splice(to, 0, moved!)
  normalize(it, before, eff, ctx)
}

/** Nova cidade na posição `index`. `via` diz de onde vêm as noites (volta ou outra cidade). */
export function insertStop(
  it: Itinerary,
  before: Itinerary,
  a: { index: number; destinationId: ID; nights: number; via: Via },
  ctx: OpContext,
  eff: Effects,
) {
  if (!Number.isInteger(a.nights) || a.nights < 1) fail('MIN_ONE_NIGHT')
  const index = Math.max(0, Math.min(it.stops.length, Math.trunc(a.index)))
  const stop = newStop(ctx, a.destinationId, a.nights)
  it.stops.splice(index, 0, stop)
  if (a.via.kind === 'open') fail('INVALID', { reason: 'open-cannot-donate-here' })
  if (a.via.kind === 'stop') donate(it, before, a.via.stopId, stopIndex(it, stop.id), a.nights, eff)
  normalize(it, before, eff, ctx)
}

/**
 * Encaixa um destino no meio de uma cidade: X vira X (afterOrdinal dias) + Novo + X (resto).
 * Se `via` é a própria cidade, as noites do Novo saem do começo da segunda parte
 * (os dias cujas datas o Novo ocupa voltam à mochila; os outros mantêm a data).
 */
export function splitStopWith(
  it: Itinerary,
  before: Itinerary,
  a: { stopId: ID; afterOrdinal: number; destinationId: ID; nights: number; via: Via },
  ctx: OpContext,
  eff: Effects,
) {
  const x = getStop(it, a.stopId)
  const n = nightsOf(x)
  if (isOpen(x)) fail('INVALID', { reason: 'split-open' })
  if (x.destinationId === a.destinationId) fail('INVALID', { reason: 'same-destination' })
  if (!Number.isInteger(a.nights) || a.nights < 1) fail('MIN_ONE_NIGHT')
  if (!Number.isInteger(a.afterOrdinal) || a.afterOrdinal < 1 || a.afterOrdinal > n - 1)
    fail('OUT_OF_RANGE', { stopId: x.id, afterOrdinal: a.afterOrdinal })
  if (a.via.kind === 'open') fail('INVALID', { reason: 'open-cannot-donate-here' })

  const selfDonor = a.via.kind === 'stop' && a.via.stopId === x.id
  const cut = selfDonor ? a.nights : 0
  if (selfDonor && n - a.afterOrdinal - cut < 1)
    fail('SPLIT_TOO_SMALL', { stopId: x.id, max: n - a.afterOrdinal - 1 })
  if (selfDonor) returnDays(it, before, x.id, range(a.afterOrdinal, a.afterOrdinal + cut), eff)

  const tail = { ...x, id: ctx.newId(), days: x.days.slice(a.afterOrdinal + cut) }
  x.days = x.days.slice(0, a.afterOrdinal)
  const mid = newStop(ctx, a.destinationId, a.nights)
  const i = stopIndex(it, x.id)
  it.stops.splice(i + 1, 0, mid, tail)
  if (a.via.kind === 'stop' && !selfDonor)
    donate(it, before, a.via.stopId, stopIndex(it, mid.id), a.nights, eff)
  normalize(it, before, eff, ctx)
}

/** Lixeira: a cidade vira noites em aberto com as mesmas datas; as visitas voltam à mochila. */
export function removeStop(
  it: Itinerary,
  before: Itinerary,
  a: { stopId: ID },
  ctx: OpContext,
  eff: Effects,
) {
  const x = getStop(it, a.stopId)
  if (isOpen(x)) fail('ALREADY_OPEN', { stopId: x.id })
  returnDays(it, before, x.id, range(0, nightsOf(x)), eff)
  x.destinationId = null
  x.days = x.days.map(() => [])
  delete x.tentative
  normalize(it, before, eff, ctx)
}

/** Preenche noites em aberto (todas ou parte) com um destino. */
export function fillOpen(
  it: Itinerary,
  before: Itinerary,
  a: { stopId: ID; destinationId: ID; nights?: number; side?: 'start' | 'end' },
  ctx: OpContext,
  eff: Effects,
) {
  const o = getStop(it, a.stopId)
  if (!isOpen(o)) fail('NOT_OPEN', { stopId: o.id })
  const k = a.nights ?? nightsOf(o)
  if (!Number.isInteger(k) || k < 1 || k > nightsOf(o))
    fail('OUT_OF_RANGE', { stopId: o.id, max: nightsOf(o) })
  if (k === nightsOf(o)) {
    o.destinationId = a.destinationId
  } else {
    const stop = newStop(ctx, a.destinationId, k)
    const i = stopIndex(it, o.id)
    if ((a.side ?? 'start') === 'start') {
      o.days = o.days.slice(k)
      it.stops.splice(i, 0, stop)
    } else {
      o.days = o.days.slice(0, nightsOf(o) - k)
      it.stops.splice(i + 1, 0, stop)
    }
  }
  normalize(it, before, eff, ctx)
}

/** A vizinha ocupa as noites em aberto (dias vazios na ponta encostada); se os dois lados forem a mesma cidade, viram uma só. */
export function stretchInto(
  it: Itinerary,
  before: Itinerary,
  a: { stopId: ID; side: 'before' | 'after' },
  ctx: OpContext,
  eff: Effects,
) {
  const o = getStop(it, a.stopId)
  if (!isOpen(o)) fail('NOT_OPEN', { stopId: o.id })
  const i = stopIndex(it, o.id)
  const neighbor = a.side === 'before' ? it.stops[i - 1] : it.stops[i + 1]
  if (!neighbor) fail('NOT_FOUND', { side: a.side })
  const n = nightsOf(o)
  it.stops.splice(i, 1)
  resize(it, before, neighbor!.id, a.side === 'before' ? 'end' : 'start', n, eff)
  normalize(it, before, eff, ctx)
}

/** Remove as noites em aberto e encurta a viagem; as cidades seguintes antecipam com os planos. */
export function closeOpen(it: Itinerary, before: Itinerary, a: { stopId: ID }, ctx: OpContext, eff: Effects) {
  const o = getStop(it, a.stopId)
  if (!isOpen(o)) fail('NOT_OPEN', { stopId: o.id })
  if (it.stops.length === 1) fail('INVALID', { reason: 'only-stop' })
  it.stops.splice(stopIndex(it, o.id), 1)
  normalize(it, before, eff, ctx)
}

/** Troca o destino de uma cidade (as visitas ficam: viram bate-volta se forem de outro lugar). */
export function setDestination(
  it: Itinerary,
  before: Itinerary,
  a: { stopId: ID; destinationId: ID },
  ctx: OpContext,
  eff: Effects,
) {
  const x = getStop(it, a.stopId)
  if (isOpen(x)) fail('INVALID', { reason: 'use-fill-open' })
  if (x.destinationId === a.destinationId) fail('NO_CHANGE')
  x.destinationId = a.destinationId
  normalize(it, before, eff, ctx)
}

export const range = (from: number, to: number): number[] =>
  Array.from({ length: Math.max(0, to - from) }, (_, k) => from + k)

// Reexporta para quem precisa crescer uma parada sem passar por setNights.
export { resize }
