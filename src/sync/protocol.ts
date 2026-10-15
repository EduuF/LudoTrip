import type { EngineError } from '../engine'
import type { DocAction, TripDoc } from '../app/doc'

// Mensagens entre o aparelho e o TripRoom (spec publicação §5.2). O mesmo arquivo é usado pelo Worker.
// Mudou o formato de uma mensagem? Suba PROTOCOL e mantenha o servidor aceitando o anterior enquanto
// houver aparelhos com ele (o servidor manda `upgrade` só para quem estiver abaixo de MIN_PROTOCOL).

export const PROTOCOL = 1
export const MIN_PROTOCOL = 1

/** Uma ação esperando o servidor confirmar. */
export interface PendingOp {
  opId: string
  tripId: string
  action: DocAction
  /** Quando entrou na fila (ms), só para ordenar e para o "há 5 min". */
  at: number
}

export type ClientMsg =
  /** `sinceVersion`: a versão que o aparelho tem; -1 se ainda não tem nada desta viagem. */
  | { t: 'hello'; sinceVersion: number; protocol: number; schemaVersion: number; app: string }
  | { t: 'op'; opId: string; action: DocAction }

export type ServerMsg =
  /** O estado inteiro (primeira vez, ou quando faltam ações demais). */
  | { t: 'snapshot'; version: number; doc: TripDoc }
  /** Uma ação aplicada (por qualquer pessoa), na ordem do servidor. */
  | { t: 'applied'; opId: string; version: number; action: DocAction; by: string; at: number }
  /** O motor recusou uma ação deste aparelho. */
  | { t: 'rejected'; opId: string; reason: EngineError | { code: 'ROLE' | 'TOO_BIG' } }
  /** Este aparelho está numa versão antiga demais: atualizar o app. */
  | { t: 'upgrade' }
  /** A viagem não está mais disponível para esta pessoa. */
  | { t: 'gone'; reason: 'deleted' | 'removed' }

export const isServerMsg = (x: unknown): x is ServerMsg =>
  !!x && typeof x === 'object' && typeof (x as { t?: unknown }).t === 'string'
