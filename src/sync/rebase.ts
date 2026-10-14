import type { EngineError } from '../engine'
import { runDoc } from '../app/doc'
import type { TripDoc } from '../app/doc'
import type { PendingOp } from './protocol'

export interface Rebased {
  doc: TripDoc
  /** Ações pendentes que não cabem mais no estado do servidor (viram painel de escolha). */
  refused: { op: PendingOp; reason: EngineError }[]
}

/**
 * O que a tela mostra numa viagem da nuvem: o estado do servidor com as ações deste aparelho ainda
 * não confirmadas por cima, na ordem em que foram feitas e com os mesmos opIds (os ids criados são
 * os mesmos que o servidor vai criar). "Nada mudou" não é recusa: a ação já estava valendo.
 */
export function rebase(server: TripDoc, pending: PendingOp[]): Rebased {
  let doc = server
  const refused: Rebased['refused'] = []
  for (const op of pending) {
    const r = runDoc(doc, op.action, { opId: op.opId })
    if (r.ok) doc = r.doc
    else if (r.error.code !== 'NO_CHANGE') refused.push({ op, reason: r.error })
  }
  return { doc, refused }
}
