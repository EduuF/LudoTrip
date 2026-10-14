import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { ALL_TRIPS } from './fixtures/trips'
import { counterIds } from './fixtures/build'
import { toCommand } from './fixtures/arbitrary'
import { addDays } from './dates'
import { allVisits, timeline } from './core'
import { dispatch } from './commands'
import type { Command } from './commands'
import { applyUndo, deepEqual } from './patch'
import type { Patch } from './patch'
import { days } from './derive'
import type { ID, Itinerary } from './types'

// Invariantes da spec §16, conferidas depois de cada passo de sequências aleatórias de comandos
// (válidos e inválidos) sobre as 6 viagens de teste.

const RUNS = Number(process.env.INVARIANT_RUNS ?? 1000)

/** Ações que podem mudar o total de noites. */
function mayChangeTotal(cmd: Command): boolean {
  if (cmd.type === 'setTripEnd' || cmd.type === 'closeOpen') return true
  const via = 'via' in cmd ? cmd.via : undefined
  return !!via && !Array.isArray(via) && via.kind === 'return'
}

/** Posição (índice do dia) e cidade de cada visita agendada em dias. */
function positions(it: Itinerary): Map<ID, { index: number; stopId: ID | null }> {
  const out = new Map<ID, { index: number; stopId: ID | null }>()
  for (const d of days(it))
    for (const v of d.visits) if (d.kind !== 'departure') out.set(v.id, { index: d.index, stopId: d.stopId })
  return out
}

const sameTrip = (a: Itinerary, b: Itinerary) => deepEqual({ ...a, version: 0 }, { ...b, version: 0 })

function check(before: Itinerary, after: Itinerary, cmd: Command, returned: ID[], inverse: Patch) {
  const where = `${cmd.type} ${JSON.stringify(cmd)}`
  // 1. Toda cidade tem ≥ 1 noite (inteira).
  for (const s of after.stops) expect(s.days.length, where).toBeGreaterThanOrEqual(1)
  // 2. O total de noites só muda quando a pessoa mexe na volta.
  if (!mayChangeTotal(cmd)) expect(timeline(after).total, where).toBe(timeline(before).total)
  // 3. Um trecho para cada par em sequência, mais a ida e a volta.
  const chain = ['home', ...after.stops.map((s) => s.id), 'home']
  expect(
    after.legs.map((l) => [l.from, l.to]),
    where,
  ).toEqual(chain.slice(0, -1).map((x, i) => [x, chain[i + 1]]))
  const legIds = [...after.legs, ...after.archivedLegs].map((l) => l.id)
  expect(new Set(legIds).size, where).toBe(legIds.length)
  for (const l of after.archivedLegs) expect(l.aboard, where).toEqual([])
  // 4. Nenhuma visita some: ou continua, ou ficou sem dia, ou foi tirada de propósito.
  const ids = (it: Itinerary) => allVisits(it).map((v) => v.visit.id)
  const a = ids(after)
  expect(new Set(a).size, where).toBe(a.length)
  const added = cmd.type === 'scheduleVisit' || cmd.type === 'addWaypoint' ? [cmd.visitId] : []
  const removed = cmd.type === 'unscheduleVisit' || cmd.type === 'removeWaypoint' ? [cmd.visitId] : []
  expect([...a, ...returned, ...removed].sort(), where).toEqual([...ids(before), ...added].sort())
  // 7. Desfazer volta exatamente ao estado anterior.
  const undo = applyUndo(after, inverse)
  expect(undo.ok && sameTrip(undo.state, before), where).toBe(true)
  // 8. Os dias são contínuos.
  const ds = days(after)
  expect(
    ds.map((x) => x.index),
    where,
  ).toEqual([...Array(timeline(after).total + 1).keys()])
  if (after.start) for (const x of ds) expect(x.date, where).toBe(addDays(after.start, x.index))
  // 9. Nada de cidades iguais lado a lado (nem dois espaços em aberto).
  for (let i = 1; i < after.stops.length; i++)
    expect(after.stops[i]!.destinationId, where).not.toBe(after.stops[i - 1]!.destinationId)
  // 10. Regra da ponta: cada cidade anda inteira (um só deslocamento); quem foi editado mantém as datas.
  const pa = positions(before)
  const pb = positions(after)
  const deltas = new Map<ID | null, Set<number>>()
  for (const [id, p] of pa) {
    const q = pb.get(id)
    if (!q) continue
    const set = deltas.get(p.stopId) ?? new Set<number>()
    set.add(q.index - p.index)
    deltas.set(p.stopId, set)
  }
  const cut = cmd.type === 'removeDay' || cmd.type === 'splitStopWith' ? cmd.stopId : undefined
  const reshuffles = cmd.type === 'swapDays' || cmd.type === 'moveVisit'
  for (const [stopId, set] of deltas)
    if (stopId !== cut && !reshuffles) expect(set.size, `${where} cidade ${stopId}`).toBeLessThanOrEqual(1)
  const keep: (ID | undefined)[] = []
  if (cmd.type === 'setNights') keep.push(cmd.stopId)
  if (cmd.type === 'moveBoundary') keep.push(before.stops[cmd.index]?.id, before.stops[cmd.index + 1]?.id)
  if (cmd.type === 'shiftStop') {
    const i = before.stops.findIndex((s) => s.id === cmd.stopId)
    keep.push(before.stops[i - 1]?.id, before.stops[i + 1]?.id)
  }
  for (const id of keep)
    if (id && deltas.has(id)) expect([...deltas.get(id)!], `${where} ponta ${id}`).toEqual([0])
  // 11. Noites em aberto nunca têm visitas.
  for (const s of after.stops) if (s.destinationId === null) expect(s.days.flat(), where).toEqual([])
  expect(after.returned.length, where).toBeLessThanOrEqual(50)
}

describe.each(Object.entries(ALL_TRIPS))('invariantes: %s', (_name, make) => {
  it(`${RUNS} sequências aleatórias de até 30 comandos`, () => {
    const trip = make()
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.nat(), fc.nat(), fc.nat(), fc.nat(), fc.nat()), { minLength: 1, maxLength: 30 }),
        (steps) => {
          const ctx = counterIds('r')
          const history: { state: Itinerary; inverse: Patch }[] = []
          let state = trip.itinerary
          steps.forEach((step, n) => {
            const cmd = toCommand(state, trip, step, n)
            const snapshot = JSON.stringify(state)
            const r = dispatch(state, cmd, ctx)
            expect(JSON.stringify(state), 'o estado recebido não muda').toBe(snapshot)
            if (!r.ok) return
            check(
              state,
              r.state,
              cmd,
              r.effects.returned.map((x) => x.visit.id),
              r.inverse,
            )
            history.push({ state, inverse: r.inverse })
            state = r.state
          })
          // Desfazer tudo, do último para o primeiro, devolve a viagem original.
          for (const h of [...history].reverse()) {
            const u = applyUndo(state, h.inverse)
            expect(u.ok).toBe(true)
            if (u.ok) state = u.state
          }
          expect(sameTrip(state, trip.itinerary)).toBe(true)
        },
      ),
      { numRuns: RUNS },
    )
  }, 180_000)
})
