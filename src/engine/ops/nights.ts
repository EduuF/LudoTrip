import { fail, getStop, isOpen, newStop, nightsOf, normalize, resize, stopIndex } from '../core'
import type { Effects, OpContext } from '../core'
import type { ID, Itinerary, Via } from '../types'

const assertInt = (n: number, min: number, data: Record<string, unknown>) => {
  if (!Number.isInteger(n) || n < min) fail(min >= 1 ? 'MIN_ONE_NIGHT' : 'INVALID', data)
}

/**
 * Muda as noites de uma cidade. `via` diz de onde vem (ou para onde vai) a diferença.
 * Regra da ponta: o dia entra/sai no fim se a contraparte está depois (ou é a volta),
 * e no começo se a contraparte está antes.
 */
export function setNights(
  it: Itinerary,
  before: Itinerary,
  a: { stopId: ID; nights: number; via: Via },
  ctx: OpContext,
  eff: Effects,
) {
  assertInt(a.nights, 1, { stopId: a.stopId })
  const x = getStop(it, a.stopId)
  const delta = a.nights - nightsOf(x)
  if (delta === 0) fail('NO_CHANGE')

  if (a.via.kind === 'return') {
    resize(it, before, x.id, 'end', delta, eff)
  } else if (a.via.kind === 'open') {
    if (delta > 0) fail('INVALID', { reason: 'open-cannot-donate-here' })
    resize(it, before, x.id, 'end', delta, eff)
    it.stops.splice(stopIndex(it, x.id) + 1, 0, newStop(ctx, null, -delta))
  } else {
    const y = getStop(it, a.via.stopId)
    if (y.id === x.id) fail('SAME_STOP')
    const yAfter = stopIndex(it, y.id) > stopIndex(it, x.id)
    if (delta > 0) {
      donate(it, before, y.id, stopIndex(it, x.id), delta, eff)
      resize(it, before, x.id, yAfter ? 'end' : 'start', delta, eff)
    } else {
      resize(it, before, x.id, yAfter ? 'end' : 'start', delta, eff)
      resize(it, before, y.id, yAfter ? 'start' : 'end', -delta, eff)
    }
  }
  normalize(it, before, eff, ctx)
}

/** Arrasta a divisa entre duas cidades vizinhas: uma ganha `k` dias na ponta encostada e a outra perde. */
export function moveBoundary(
  it: Itinerary,
  before: Itinerary,
  a: { index: number; k: number },
  ctx: OpContext,
  eff: Effects,
) {
  const left = it.stops[a.index]
  const right = it.stops[a.index + 1]
  if (!left || !right) fail('NOT_FOUND', { index: a.index })
  if (!Number.isInteger(a.k) || a.k === 0) fail('NO_CHANGE')
  if (nightsOf(left!) + a.k < 1) fail('MIN_ONE_NIGHT', { stopId: left!.id })
  if (nightsOf(right!) - a.k < 1) fail('MIN_ONE_NIGHT', { stopId: right!.id })
  resize(it, before, left!.id, 'end', a.k, eff)
  resize(it, before, right!.id, 'start', -a.k, eff)
  normalize(it, before, eff, ctx)
}

/** Desloca a janela inteira de uma cidade: o conteúdo anda junto; as vizinhas ajustam as pontas encostadas. */
export function shiftStop(
  it: Itinerary,
  before: Itinerary,
  a: { stopId: ID; by: number },
  ctx: OpContext,
  eff: Effects,
) {
  const i = stopIndex(it, a.stopId)
  const prev = it.stops[i - 1]
  const next = it.stops[i + 1]
  if (!prev || !next) fail('NEEDS_BOTH_NEIGHBORS', { stopId: a.stopId })
  if (!Number.isInteger(a.by) || a.by === 0) fail('NO_CHANGE')
  if (a.by > 0 && nightsOf(next!) - a.by < 1)
    fail('DONOR_TOO_SHORT', { donorId: next!.id, max: nightsOf(next!) - 1 })
  if (a.by < 0 && nightsOf(prev!) + a.by < 1)
    fail('DONOR_TOO_SHORT', { donorId: prev!.id, max: nightsOf(prev!) - 1 })
  resize(it, before, prev!.id, 'end', a.by, eff)
  resize(it, before, next!.id, 'start', -a.by, eff)
  normalize(it, before, eff, ctx)
}

/** Usado por outras operações: a cidade `donorId` cede `nights` noites na ponta voltada para `towardIndex`. */
export function donate(
  it: Itinerary,
  before: Itinerary,
  donorId: ID,
  towardIndex: number,
  nights: number,
  eff: Effects,
) {
  const donor = getStop(it, donorId)
  if (isOpen(donor) ? nightsOf(donor) - nights < 0 : nightsOf(donor) - nights < 1)
    fail('DONOR_TOO_SHORT', { donorId, max: isOpen(donor) ? nightsOf(donor) : nightsOf(donor) - 1 })
  const donorIdx = stopIndex(it, donorId)
  const edge = donorIdx < towardIndex ? 'end' : 'start'
  if (isOpen(donor) && nightsOf(donor) === nights) {
    it.stops.splice(donorIdx, 1)
    return
  }
  resize(it, before, donorId, edge, -nights, eff)
}
