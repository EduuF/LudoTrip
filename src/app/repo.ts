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

export function localRepo(): TripRepo {
  const fallback = memoryRepo()
  let store: ReturnType<typeof createStore> | null = null
  try {
    store = createStore('ludotrip', 'trips')
  } catch {
    store = null
  }
  const safe = async <T>(
    fn: (s: NonNullable<typeof store>) => Promise<T>,
    plan: () => Promise<T>,
  ): Promise<T> => {
    if (!store) return plan()
    try {
      return await fn(store)
    } catch {
      store = null
      return plan()
    }
  }
  return {
    list: () =>
      safe(
        async (s) => {
          const ids = (await keys(s)) as string[]
          const docs = await Promise.all(ids.map((id) => get<TripDoc>(id, s)))
          return docs
            .filter((d): d is TripDoc => !!d)
            .map((d) => d.meta)
            .sort((a, b) => b.updatedAt - a.updatedAt)
        },
        () => fallback.list(),
      ),
    load: (id) =>
      safe(
        async (s) => (await get<TripDoc>(id, s)) ?? null,
        () => fallback.load(id),
      ),
    save: (doc) =>
      safe(
        (s) => set(doc.meta.id, doc, s),
        () => fallback.save(doc),
      ),
    remove: (id) =>
      safe(
        (s) => del(id, s),
        () => fallback.remove(id),
      ),
  }
}
