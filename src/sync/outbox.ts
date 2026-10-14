import { createStore, del, entries, set } from 'idb-keyval'
import type { PendingOp } from './protocol'

// A fila de saída (spec publicação §5.4): ações de viagens da nuvem que o servidor ainda não confirmou.
// Fica no aparelho (IndexedDB), sobrevive a fechar o app e reiniciar o celular. Se o IndexedDB falhar,
// a fila continua na memória desta aba e `durable` fica false (a tela avisa).

export interface OutboxIO {
  open(): unknown
  entries(store: unknown): Promise<[IDBValidKey, unknown][]>
  set(key: string, value: unknown, store: unknown): Promise<void>
  del(key: string, store: unknown): Promise<void>
}

const idb: OutboxIO = {
  open: () => createStore('ludotrip-outbox', 'ops'),
  entries: (s) => entries(s as ReturnType<typeof createStore>),
  set: (k, v, s) => set(k, v, s as ReturnType<typeof createStore>),
  del: (k, s) => del(k, s as ReturnType<typeof createStore>),
}

export interface Outbox {
  push(op: PendingOp): Promise<void>
  /** As pendentes de uma viagem, na ordem em que foram feitas. */
  pending(tripId: string): Promise<PendingOp[]>
  /** O servidor confirmou (ou recusou de vez): sai da fila. */
  ack(opId: string): Promise<void>
  count(tripId?: string): Promise<number>
  /** Esvazia a fila de uma viagem, ou toda ("Sair da conta"). */
  clear(tripId?: string): Promise<void>
  readonly durable: boolean
}

export function createOutbox(io: OutboxIO = idb): Outbox {
  const memory = new Map<string, PendingOp>()
  let store: unknown = null
  let durable = true
  /**
   * Chave que ordena pela ordem de chegada: sempre maior que a última da fila, mesmo se o relógio do
   * aparelho voltar no tempo (a ordem das ações é o que garante o resultado).
   */
  const nextKey = async (op: PendingOp) => {
    const last = (await all()).at(-1)?.[0]
    const after = last ? Number(last) + 1 : 0
    return String(Math.max(op.at, after)).padStart(15, '0')
  }
  const open = () => {
    if (!store) {
      try {
        store = io.open()
      } catch {
        store = null
      }
    }
    return store
  }
  const all = async (): Promise<[string, PendingOp][]> => {
    const s = open()
    let stored: [string, PendingOp][] = []
    if (s) {
      try {
        stored = (await io.entries(s)) as [string, PendingOp][]
      } catch {
        durable = false
        store = null
      }
    }
    const extra = [...memory].filter(([k]) => !stored.some(([x]) => x === k))
    return [...stored, ...extra].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  }

  return {
    get durable() {
      return durable
    },
    async push(op) {
      const key = await nextKey(op)
      const s = open()
      try {
        if (!s) throw new Error('sem armazenamento')
        await io.set(key, op, s)
      } catch {
        durable = false
        store = null
        memory.set(key, op)
      }
    },
    async pending(tripId) {
      return (await all()).map(([, op]) => op).filter((op) => op.tripId === tripId)
    },
    async ack(opId) {
      for (const [key, op] of await all()) {
        if (op.opId !== opId) continue
        memory.delete(key)
        const s = open()
        if (s) await io.del(key, s).catch(() => undefined)
      }
    },
    async count(tripId) {
      return (await all()).filter(([, op]) => !tripId || op.tripId === tripId).length
    },
    async clear(tripId) {
      for (const [key, op] of await all()) {
        if (tripId && op.tripId !== tripId) continue
        memory.delete(key)
        const s = open()
        if (s) await io.del(key, s).catch(() => undefined)
      }
    },
  }
}
