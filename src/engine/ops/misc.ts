import { fail, findVisit, getLeg, getStop } from '../core'
import type { Anchor, ID, Itinerary, LegMode, Lodging, Pace, Resource, Traveler } from '../types'

export function setParticipants(
  it: Itinerary,
  _b: Itinerary,
  a: { target: { kind: 'stop' | 'leg' | 'visit'; id: ID }; ids: ID[] | null },
) {
  const obj =
    a.target.kind === 'stop'
      ? getStop(it, a.target.id)
      : a.target.kind === 'leg'
        ? getLeg(it, a.target.id)
        : (() => {
            const f = findVisit(it, a.target.id)
            if (!f) fail('NOT_FOUND', { visitId: a.target.id })
            return f!.list[f!.index]!
          })()
  if (a.ids === null) delete obj.participants
  else obj.participants = [...a.ids]
}

export function addResource(it: Itinerary, _b: Itinerary, a: { resource: Resource }) {
  if (it.resources.some((r) => r.id === a.resource.id)) fail('INVALID', { reason: 'duplicate-id' })
  it.resources.push(a.resource)
}

export function removeResource(it: Itinerary, _b: Itinerary, a: { id: ID }) {
  if (!it.resources.some((r) => r.id === a.id)) fail('NOT_FOUND', { id: a.id })
  it.resources = it.resources.filter((r) => r.id !== a.id)
}

export function addAnchor(it: Itinerary, _b: Itinerary, a: { anchor: Anchor }) {
  if (it.anchors.some((x) => x.id === a.anchor.id)) fail('INVALID', { reason: 'duplicate-id' })
  it.anchors.push(a.anchor)
}

export function removeAnchor(it: Itinerary, _b: Itinerary, a: { id: ID }) {
  if (!it.anchors.some((x) => x.id === a.id)) fail('NOT_FOUND', { id: a.id })
  it.anchors = it.anchors.filter((x) => x.id !== a.id)
}

export function setTentative(it: Itinerary, _b: Itinerary, a: { stopId: ID; tentative: boolean }) {
  const s = getStop(it, a.stopId)
  if (a.tentative) s.tentative = true
  else delete s.tentative
}

export function setLodging(it: Itinerary, _b: Itinerary, a: { stopId: ID; lodging: Lodging }) {
  const s = getStop(it, a.stopId)
  if (s.lodging === a.lodging) fail('NO_CHANGE')
  s.lodging = a.lodging
}

export function setPace(it: Itinerary, _b: Itinerary, a: { pace: Pace }) {
  if (it.pace === a.pace) fail('NO_CHANGE')
  it.pace = a.pace
}

export function setDefaultMode(it: Itinerary, _b: Itinerary, a: { mode: LegMode }) {
  if (it.defaultMode === a.mode) fail('NO_CHANGE')
  it.defaultMode = a.mode
}

export function setTravelers(it: Itinerary, _b: Itinerary, a: { travelers: Traveler[] }) {
  it.travelers = a.travelers.map((t) => ({ ...t }))
}

/** De onde a viagem sai e para onde volta (nome e lugar); null tira a casa. */
export function setHome(it: Itinerary, _b: Itinerary, a: { home: NonNullable<Itinerary['home']> | null }) {
  if (a.home === null) {
    if (!it.home) fail('NO_CHANGE')
    delete it.home
    return
  }
  const name = a.home.name.trim()
  if (!name) fail('INVALID', { reason: 'empty-name' })
  it.home = { ...a.home, name }
}
