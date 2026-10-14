import { describe, expect, it } from 'vitest'
import { localRepo } from './repo'
import type { RepoIO } from './repo'
import type { TripDoc } from './doc'

const docOf = (id: string, updatedAt = 1): TripDoc =>
  ({
    meta: { id, name: id, createdAt: 0, updatedAt },
    itinerary: {} as TripDoc['itinerary'],
    destinations: [],
    places: [],
    bookings: [],
    seq: 0,
  }) as TripDoc

/** Um IndexedDB de mentira que falha nas operações marcadas. */
function fakeIO(fail: { set?: number; keys?: number } = {}) {
  const data = new Map<string, unknown>()
  const io: RepoIO = {
    open: () => ({}),
    keys: async () => {
      if (fail.keys && fail.keys-- > 0) throw new Error('abort')
      return [...data.keys()]
    },
    get: async (id) => data.get(id) as never,
    set: async (id, v) => {
      if (fail.set && fail.set-- > 0) throw new Error('QuotaExceeded')
      data.set(id, v)
    },
    del: async (id) => void data.delete(id),
  }
  return { io, data }
}

describe('repositório do aparelho', () => {
  it('uma falha ao salvar não desliga o aparelho: avisa e a próxima vez salva de verdade', async () => {
    const { io, data } = fakeIO({ set: 1 })
    const repo = localRepo(io)
    await expect(repo.save(docOf('a'))).rejects.toThrow()
    // Ainda dá para abrir nesta sessão (ficou na memória).
    expect((await repo.list()).map((m) => m.id)).toEqual(['a'])
    await repo.save(docOf('a', 2))
    expect(data.has('a')).toBe(true)
  })

  it('uma falha ao listar não esconde as viagens nas próximas vezes', async () => {
    const { io } = fakeIO({ keys: 1 })
    const repo = localRepo(io)
    await repo.save(docOf('a'))
    expect(await repo.list()).toHaveLength(1)
    expect((await repo.list()).map((m) => m.id)).toEqual(['a'])
  })
})
