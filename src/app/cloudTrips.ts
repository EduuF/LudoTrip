import { describeError } from '../engine'
import type { EngineError } from '../engine'
import type { RemoteTrip } from '../sync/cloudApi'
import type { RejectReason } from '../sync/protocol'
import type { CloudMeta, TripDoc, TripMeta } from './doc'

// Regras puras da lista e das cópias das viagens da nuvem (spec publicação §3.1, §5.3).

/** A cópia guardada no aparelho leva a marca da nuvem; a que vai para o servidor, nunca. */
export const withCloud = (doc: TripDoc, cloud: CloudMeta): TripDoc => ({
  ...doc,
  meta: { ...doc.meta, cloud },
})

export function stripCloud(doc: TripDoc): TripDoc {
  if (!doc.meta.cloud) return doc
  const { cloud: _cloud, ...meta } = doc.meta
  void _cloud
  return { ...doc, meta }
}

export interface Merged {
  trips: TripMeta[]
  /** Cópias de viagens que não são mais desta conta (apagadas ou removido): tirar do aparelho. */
  drop: TripMeta[]
}

/**
 * "Suas viagens": as do aparelho (📱), as cópias da nuvem (☁️) e as da conta ainda não baixadas aqui.
 * `remote` null: sem internet ou sem conta (mostra as cópias que há, sem apagar nada).
 */
export function mergeTrips(local: TripMeta[], remote: RemoteTrip[] | null, signedIn: boolean): Merged {
  const guest = local.filter((m) => !m.cloud)
  const copies = signedIn ? local.filter((m) => m.cloud) : []
  if (!signedIn) return { trips: sort(guest), drop: [] }
  if (!remote) return { trips: sort([...guest, ...copies]), drop: [] }
  const byId = new Map(remote.map((r) => [r.id, r]))
  const drop = copies.filter((m) => !byId.has(m.id))
  const kept = copies
    .filter((m) => byId.has(m.id))
    .map((m) => {
      const r = byId.get(m.id)!
      return { ...m, name: r.name, updatedAt: Math.max(r.updatedAt, m.updatedAt) }
    })
  const fresh = remote
    .filter((r) => !copies.some((m) => m.id === r.id))
    .map((r): TripMeta => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      cloud: { owner: r.owner, role: r.role, version: -1 },
    }))
  // Uma viagem 📱 que já subiu (mesmo id) aparece uma vez só, como ☁️.
  const guestOnly = guest.filter((m) => !byId.has(m.id))
  return { trips: sort([...guestOnly, ...kept, ...fresh]), drop }
}

const sort = (list: TripMeta[]) => [...list].sort((a, b) => b.updatedAt - a.updatedAt)

/** A frase de uma ação deste aparelho que o servidor não aplicou. */
export function describeRefusal(reason: RejectReason, doc: TripDoc): string {
  if (reason.code === 'ROLE') return 'Você só pode ver esta viagem.'
  if (reason.code === 'TOO_BIG') return 'A viagem ficou grande demais para guardar (limite de 1 MB).'
  return describeError(reason as EngineError, doc.itinerary, doc) ?? 'Alguém mudou isso antes.'
}
