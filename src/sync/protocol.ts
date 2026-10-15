import type { EngineError } from '../engine'
import type { DocAction, TripDoc } from '../app/doc'

// Mensagens entre o aparelho e o TripRoom (spec publicação §5.2). O mesmo arquivo é usado pelo Worker.
// Mudou o formato de uma mensagem? Suba PROTOCOL e mantenha o servidor aceitando o anterior enquanto
// houver aparelhos com ele (o servidor manda `upgrade` só para quem estiver abaixo de MIN_PROTOCOL).

export const PROTOCOL = 1
/** Subprotocolo do WebSocket: o navegador manda `[WS_PROTOCOL, token]` (o token nunca vai na URL). */
export const WS_PROTOCOL = 'ludotrip.v1'
export const MIN_PROTOCOL = 1
/** Quantos ids de ações pendentes o `hello` leva, no máximo. */
export const MAX_HELLO_PENDING = 500

/** Uma ação esperando o servidor confirmar. */
export interface PendingOp {
  opId: string
  tripId: string
  action: DocAction
  /** Quando entrou na fila (ms), só para ordenar e para o "há 5 min". */
  at: number
}

/** Papel numa viagem (spec §4.1): Dono, Planeja junto, Só vê. */
export type Role = 'owner' | 'editor' | 'viewer'

export type RejectReason = EngineError | { code: 'ROLE' | 'TOO_BIG' }

/** O que o servidor já decidiu sobre uma ação que o aparelho ainda acha pendente. */
export type Ack =
  { opId: string; result: 'applied' | 'noop' } | { opId: string; result: 'rejected'; reason: RejectReason }

export type ClientMsg =
  | {
      t: 'hello'
      /** A versão que o aparelho tem; -1 se ainda não tem nada desta viagem. */
      sinceVersion: number
      protocol: number
      schemaVersion: number
      app: string
      /** Ações ainda sem resposta: o servidor diz quais já processou (nunca aplicar duas vezes). */
      pending?: string[]
    }
  | { t: 'op'; opId: string; action: DocAction }

export type ServerMsg =
  /** O estado inteiro, com o que o servidor já decidiu sobre as pendentes do `hello`. */
  | { t: 'snapshot'; version: number; doc: TripDoc; acks?: Ack[] }
  /**
   * Uma ação aplicada (por qualquer pessoa), na ordem do servidor. `noop`: nada mudou, só confirma
   * para quem mandou (a versão não muda).
   */
  | {
      t: 'applied'
      opId: string
      version: number
      action: DocAction
      by: string
      at: number
      noop?: true
    }
  /** O motor recusou uma ação deste aparelho. */
  | { t: 'rejected'; opId: string; reason: RejectReason }
  /** Este aparelho está numa versão antiga demais: atualizar o app. */
  | { t: 'upgrade' }
  /** A viagem não está mais disponível para esta pessoa (`by`: primeiro nome de quem apagou). */
  | { t: 'gone'; reason: 'deleted' | 'removed'; by?: string }
  // Colaboração (M5). Só acréscimos: aparelhos antigos ignoram um `t` que não conhecem.
  /** Quem está com a viagem aberta agora (uids). */
  | { t: 'presence'; online: string[] }
  /** Membros ou convites mudaram: reler a lista de pessoas. */
  | { t: 'people' }
  /** O papel desta pessoa mudou (vale já nesta conexão). */
  | { t: 'role'; role: Role }
  /** Alguém aceitou um convite. */
  | { t: 'joined'; uid: string; name: string }

export const isServerMsg = (x: unknown): x is ServerMsg =>
  !!x && typeof x === 'object' && typeof (x as { t?: unknown }).t === 'string'
