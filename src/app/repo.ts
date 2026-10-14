import { createStore, del, get, keys, set } from 'idb-keyval'
import type { TripDoc, TripMeta } from './doc'

// Onde as viagens ficam guardadas. Hoje: o próprio aparelho (IndexedDB), com memória como plano B
// (aba anônima, armazenamento bloqueado). No M3 entra o Firebase atrás da mesma interface.

export interface TripRepo {
  list(): Promise<TripMeta[]>
  load(id: string): Promise<TripDoc | null>
  save(doc: TripDoc): Promise<void>
  remove(id: string): Promise<void>
}

export function memoryRepo(): TripRepo {
  const data = new Map<string, TripDoc>()
  return {
    list: async () => [...data.values()].map((d) => d.meta).sort((a, b) => b.updatedAt - a.updatedAt),
    load: async (id) => structuredClone(data.get(id) ?? null),
    save: async (doc) => void data.set(doc.meta.id, structuredClone(doc)),
    remove: async (id) => void data.delete(id),
  }
}

/** As operações do IndexedDB (idb-keyval), trocáveis nos testes. */
export interface RepoIO {
  open(): unknown
  keys(store: unknown): Promise<IDBValidKey[]>
  get<T>(id: string, store: unknown): Promise<T | undefined>
  set(id: string, value: unknown, store: unknown): Promise<void>
  del(id: string, store: unknown): Promise<void>
}

const idb: RepoIO = {
  open: () => createStore('ludotrip', 'trips'),
  keys: (s) => keys(s as ReturnType<typeof createStore>),
  get: (id, s) => get(id, s as ReturnType<typeof createStore>),
  set: (id, v, s) => set(id, v, s as ReturnType<typeof createStore>),
  del: (id, s) => del(id, s as ReturnType<typeof createStore>),
}

/** Salvar no aparelho falhou (a viagem ficou só na memória desta aba). */
export class SaveError extends Error {}

/**
 * O aparelho (IndexedDB), com a memória da aba como plano B. Uma falha nunca desliga o aparelho
 * para sempre: cada operação tenta de novo, leituras tentam duas vezes, e o que não deu para salvar
 * fica na memória (aparece na lista e abre) até a próxima vez que salvar der certo.
 */
export function localRepo(io: RepoIO = idb): TripRepo {
  const fallback = memoryRepo()
  let store: unknown = null
  const open = () => {
    if (store) return store
    try {
      store = io.open()
    } catch {
      store = null
    }
    return store
  }
  const read = async <T>(fn: (s: unknown) => Promise<T>, plan: () => Promise<T>): Promise<T> => {
    for (let k = 0; k < 2; k++) {
      const s = open()
      if (!s) break
      try {
        return await fn(s)
      } catch {
        store = null
      }
    }
    return plan()
  }
  const unsaved = new Set<string>()
  return {
    async list() {
      const mine = await read(
        async (s) => {
          const ids = (await io.keys(s)) as string[]
          const docs = await Promise.all(ids.map((id) => io.get<TripDoc>(id, s)))
          return docs.filter((d): d is TripDoc => !!d).map((d) => d.meta)
        },
        async () => [] as TripMeta[],
      )
      const extra = (await fallback.list()).filter(
        (m) => unsaved.has(m.id) || !mine.some((x) => x.id === m.id),
      )
      return [...mine.filter((m) => !extra.some((x) => x.id === m.id)), ...extra].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      )
    },
    async load(id) {
      if (unsaved.has(id)) return fallback.load(id)
      return read(
        async (s) => (await io.get<TripDoc>(id, s)) ?? (await fallback.load(id)),
        () => fallback.load(id),
      )
    },
    async save(doc) {
      const s = open()
      try {
        if (!s) throw new Error('sem armazenamento')
        await io.set(doc.meta.id, doc, s)
        unsaved.delete(doc.meta.id)
        await fallback.remove(doc.meta.id)
      } catch {
        store = null
        unsaved.add(doc.meta.id)
        await fallback.save(doc)
        throw new SaveError('Não consegui salvar no aparelho.')
      }
    },
    async remove(id) {
      unsaved.delete(id)
      await fallback.remove(id)
      await read(
        (s) => io.del(id, s),
        async () => {},
      )
    },
  }
}
