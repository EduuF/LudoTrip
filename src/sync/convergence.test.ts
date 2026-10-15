import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { deepEqual } from '../engine'
import { japao } from '../engine/fixtures/trips'
import { toCommand } from '../engine/fixtures/arbitrary'
import { migrate } from '../app/doc'
import type { DocAction, TripDoc } from '../app/doc'
import { createOutbox } from './outbox'
import type { OutboxIO } from './outbox'
import type { ClientMsg, ServerMsg } from './protocol'
import { answerHello, decide, recordToMsg } from './serverCore'
import type { OpLog, OpRecord } from './serverCore'
import { TripSync } from './tripSync'

// Convergência (spec publicação §7): 2–3 aparelhos editando a mesma viagem, com a rede atrasando,
// caindo e voltando em qualquer ordem. No fim, com todos conectados e as filas vazias, todo aparelho
// mostra exatamente o estado do servidor, e toda ação foi aplicada ou recusada (nenhuma some).
// O servidor simulado usa as mesmas decisões do TripRoom (serverCore).

const RUNS = Number(process.env.INVARIANT_RUNS ?? 150)
const TRIP = 'v-conv'

function startDoc(): TripDoc {
  const t = japao()
  return migrate({
    meta: { id: TRIP, name: t.name, createdAt: 0, updatedAt: 0 },
    itinerary: t.itinerary,
    destinations: t.destinations,
    places: t.places,
    bookings: t.bookings,
    seq: 0,
  })
}

interface Conn {
  up: ClientMsg[]
  down: ServerMsg[]
  alive: boolean
  opened: boolean
  handlers: { onOpen(): void; onMessage(m: ServerMsg): void; onClose(i: { code?: number }): void }
}

class Server {
  /** Limite pequeno nos testes: força também o caminho do estado inteiro (com acks). */
  readonly maxReplay: number
  constructor(maxReplay: number) {
    this.maxReplay = maxReplay
  }
  state = { doc: startDoc(), version: 0 }
  ops: OpRecord[] = []
  conns = new Set<Conn>()
  log: OpLog = {
    appliedSince: (since) => this.ops.filter((o) => o.result === 'applied' && o.version > since),
    find: (ids) => this.ops.filter((o) => ids.includes(o.opId)),
  }

  receive(conn: Conn, uid: string, msg: ClientMsg) {
    if (msg.t === 'hello') {
      conn.down.push(...answerHello(this.state, this.log, msg, this.maxReplay))
      return
    }
    const seen = this.ops.find((o) => o.opId === msg.opId)
    if (seen) return void conn.down.push(recordToMsg(seen))
    const out = decide(this.state, 'owner', msg.opId, msg.action)
    const rec: OpRecord = {
      opId: msg.opId,
      uid,
      action: msg.action,
      result: out.kind,
      reason: out.kind === 'rejected' ? out.reason : null,
      version: out.kind === 'applied' ? out.version : this.state.version,
      at: 0,
    }
    this.ops.push(rec)
    if (out.kind === 'applied') {
      this.state = { doc: out.doc, version: out.version }
      for (const c of this.conns) if (c.alive) c.down.push(recordToMsg(rec))
    } else conn.down.push(recordToMsg(rec))
  }
}

function memoryIO(): OutboxIO {
  const data = new Map<string, unknown>()
  return {
    open: () => ({}),
    entries: async () => [...data],
    set: async (k, v) => void data.set(k, v),
    del: async (k) => void data.delete(k),
  }
}

interface Device {
  sync: TripSync
  conn: Conn | null
  reconnect: (() => void) | null
  doc: TripDoc | null
  submitted: string[]
}

function makeDevice(server: Server, base: { doc: TripDoc; version: number } | null): Device {
  const dev: Device = {
    sync: null as unknown as TripSync,
    conn: null,
    reconnect: null,
    doc: null,
    submitted: [],
  }
  dev.sync = new TripSync({
    tripId: TRIP,
    outbox: createOutbox(memoryIO()),
    base,
    schemaVersion: 1,
    app: 'teste',
    onView: (v) => void (dev.doc = v.doc),
    schedule: (fn) => void (dev.reconnect = fn),
    connect: (handlers) => {
      const conn: Conn = { up: [], down: [], alive: true, opened: false, handlers }
      server.conns.add(conn)
      dev.conn = conn
      return {
        send: (m) => void (conn.alive && conn.up.push(m)),
        close: () => void (conn.alive = false),
      }
    },
  })
  return dev
}

type Step =
  | { k: 'edit'; d: number; seeds: [number, number, number, number, number]; kind: number; opId: string }
  | { k: 'open' | 'up' | 'down' | 'drop' | 'back'; d: number }

const stepArb: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({
      k: fc.constant('edit' as const),
      d: fc.nat(2),
      seeds: fc.tuple(fc.nat(), fc.nat(), fc.nat(), fc.nat(), fc.nat()),
      kind: fc.nat(9),
      opId: fc.uuid(),
    }),
  },
  { weight: 3, arbitrary: fc.record({ k: fc.constant('up' as const), d: fc.nat(2) }) },
  { weight: 3, arbitrary: fc.record({ k: fc.constant('down' as const), d: fc.nat(2) }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('open' as const), d: fc.nat(2) }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('drop' as const), d: fc.nat(2) }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('back' as const), d: fc.nat(2) }) },
)

/** Ações do motor e das listas do documento (atividades, nome) a partir do que o aparelho vê. */
function actionFor(
  doc: TripDoc,
  seeds: [number, number, number, number, number],
  kind: number,
  n: number,
): DocAction {
  const trip = japao()
  const place = doc.places[seeds[1] % Math.max(1, doc.places.length)]
  switch (kind) {
    case 0:
      return { type: 'rename', name: `Nome ${seeds[0] % 5}` }
    case 1:
      return {
        type: 'addPlace',
        place: { destinationId: 'd-kyoto', name: `Lugar ${seeds[0] % 7}`, rarity: 'want' },
      }
    case 2:
      return place
        ? { type: 'setPlace', id: place.id, patch: { note: `nota ${seeds[2] % 4}` } }
        : { type: 'rename', name: 'x' }
    case 3:
      return place ? { type: 'removePlace', id: place.id } : { type: 'rename', name: 'y' }
    default:
      return { type: 'engine', command: toCommand(doc.itinerary, { ...trip, places: doc.places }, seeds, n) }
  }
}

async function run(steps: Step[], devices: number, maxReplay: number) {
  const server = new Server(maxReplay)
  acksSeen = 0
  const base = { doc: server.state.doc, version: 0 }
  // O primeiro aparelho é quem subiu a viagem (tem a base); os outros abrem do zero.
  const devs = Array.from({ length: devices }, (_, i) => makeDevice(server, i === 0 ? base : null))
  for (const d of devs) await d.sync.start()
  const pick = (i: number) => devs[i % devs.length]!

  const deliverOpen = (d: Device) => {
    const c = d.conn
    if (c && c.alive && !c.opened) {
      c.opened = true
      c.handlers.onOpen()
    }
  }
  const pumpUp = (d: Device, uid: string) => {
    const c = d.conn
    if (!c || !c.alive || !c.opened) return false
    const m = c.up.shift()
    if (!m) return false
    server.receive(c, uid, m)
    return true
  }
  const pumpDown = (d: Device) => {
    const c = d.conn
    if (!c || !c.alive || !c.opened) return false
    const m = c.down.shift()
    if (!m) return false
    if (m.t === 'snapshot' && m.acks) acksSeen += m.acks.length
    c.handlers.onMessage(structuredClone(m))
    return true
  }

  // A cada passo: nenhuma ação pode estar pendente e já dentro da cópia confirmada (seria aplicada
  // duas vezes na tela).
  const checkNoDouble = () => {
    for (const d of devs)
      for (const p of d.sync.pendingOps) {
        const rec = server.ops.find((o) => o.opId === p.opId)
        if (rec?.result === 'applied')
          expect(rec.version > d.sync.version, `ação ${p.opId} duas vezes`).toBe(true)
      }
  }

  let n = 0
  for (const s of steps) {
    const d = pick(s.d)
    const uid = `u${devs.indexOf(d)}`
    if (s.k === 'edit') {
      if (!d.doc) continue // ainda não baixou: não há o que editar
      const action = actionFor(d.doc, s.seeds, s.kind, n++)
      d.submitted.push(s.opId)
      await d.sync.submit({ opId: s.opId, tripId: TRIP, action, at: n })
    } else if (s.k === 'open') deliverOpen(d)
    else if (s.k === 'up') pumpUp(d, uid)
    else if (s.k === 'down') pumpDown(d)
    else if (s.k === 'drop' && d.conn?.alive) {
      const c = d.conn
      c.alive = false
      server.conns.delete(c)
      c.handlers.onClose({})
    } else if (s.k === 'back' && d.reconnect) {
      const fn = d.reconnect
      d.reconnect = null
      fn()
    }
    checkNoDouble()
  }

  // Fim: todo mundo volta e as filas esvaziam.
  for (let round = 0; round < 10_000; round++) {
    let moved = false
    for (const [i, d] of devs.entries()) {
      if (d.reconnect) {
        const fn = d.reconnect
        d.reconnect = null
        fn()
        moved = true
      }
      if (d.conn && d.conn.alive && !d.conn.opened) {
        deliverOpen(d)
        moved = true
      }
      while (pumpUp(d, `u${i}`)) moved = true
      while (pumpDown(d)) moved = true
    }
    await Promise.resolve()
    if (!moved) break
  }

  for (const d of devs) {
    expect(d.sync.pendingOps).toEqual([])
    expect(d.sync.version).toBe(server.state.version)
    expect(deepEqual(d.doc, server.state.doc)).toBe(true)
  }
  // Nenhuma ação sumiu: toda ação enviada tem um destino registrado no servidor.
  const decided = new Set(server.ops.map((o) => o.opId))
  for (const d of devs) for (const id of d.submitted) expect(decided.has(id)).toBe(true)
  stats.applied += server.ops.filter((o) => o.result === 'applied').length
  stats.rejected += server.ops.filter((o) => o.result === 'rejected').length
  stats.noop += server.ops.filter((o) => o.result === 'noop').length
  stats.snapshotAcks += acksSeen
}

const stats = { applied: 0, rejected: 0, noop: 0, snapshotAcks: 0 }
let acksSeen = 0

describe('convergência da nuvem', () => {
  it('2 aparelhos, rede em qualquer ordem: terminam iguais ao servidor', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(stepArb, { minLength: 30, maxLength: 90 }),
        fc.constantFrom(0, 1, 3, 200),
        (steps, replay) => run(steps, 2, replay),
      ),
      { numRuns: RUNS },
    )
  })

  it('3 aparelhos, quedas e voltas: terminam iguais ao servidor', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(stepArb, { minLength: 40, maxLength: 120 }),
        fc.constantFrom(0, 1, 3, 200),
        (steps, replay) => run(steps, 3, replay),
      ),
      { numRuns: Math.ceil(RUNS / 2) },
    )
  })

  it('o teste exercita de verdade: muitas ações aplicadas e algumas recusadas', () => {
    expect(stats.applied).toBeGreaterThan(RUNS)
    expect(stats.rejected).toBeGreaterThan(0)
    expect(stats.snapshotAcks).toBeGreaterThan(0)
  })
})
