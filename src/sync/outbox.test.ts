import { describe, expect, it } from 'vitest'
import { createOutbox } from './outbox'
import type { OutboxIO } from './outbox'
import type { PendingOp } from './protocol'

function fakeIO(fail: { set?: number; entries?: number } = {}) {
  const data = new Map<string, unknown>()
  const io: OutboxIO = {
    open: () => ({}),
    entries: async () => {
      if (fail.entries && fail.entries-- > 0) throw new Error('abort')
      return [...data]
    },
    set: async (k, v) => {
      if (fail.set && fail.set-- > 0) throw new Error('QuotaExceeded')
      data.set(k, v)
    },
    del: async (k) => void data.delete(k),
  }
  return { io, data }
}

const op = (opId: string, tripId = 't1', at = 1000): PendingOp => ({
  opId,
  tripId,
  at,
  action: { type: 'rename', name: opId },
})

describe('fila de saída', () => {
  it('guarda em ordem, separa por viagem e sai ao confirmar', async () => {
    const { io, data } = fakeIO()
    const box = createOutbox(io)
    await box.push(op('a'))
    await box.push(op('b', 't2'))
    await box.push(op('c'))
    expect((await box.pending('t1')).map((x) => x.opId)).toEqual(['a', 'c'])
    expect(await box.count()).toBe(3)
    await box.ack('a')
    expect((await box.pending('t1')).map((x) => x.opId)).toEqual(['c'])
    expect(data.size).toBe(2)
    await box.clear('t2')
    expect(await box.count()).toBe(1)
    await box.clear()
    expect(await box.count()).toBe(0)
  })

  it('o relógio voltando no tempo não muda a ordem', async () => {
    const box = createOutbox(fakeIO().io)
    await box.push(op('primeira', 't1', 5000))
    await box.push(op('segunda', 't1', 1000))
    expect((await box.pending('t1')).map((x) => x.opId)).toEqual(['primeira', 'segunda'])
  })

  it('sobrevive a uma nova aba (outra instância lê o mesmo armazenamento)', async () => {
    const { io } = fakeIO()
    await createOutbox(io).push(op('a'))
    expect((await createOutbox(io).pending('t1')).map((x) => x.opId)).toEqual(['a'])
  })

  it('sem IndexedDB, a fila continua na memória e avisa que não é durável', async () => {
    const box = createOutbox(fakeIO({ set: 1 }).io)
    await box.push(op('a'))
    expect(box.durable).toBe(false)
    expect((await box.pending('t1')).map((x) => x.opId)).toEqual(['a'])
    await box.ack('a')
    expect(await box.count()).toBe(0)
  })
})
