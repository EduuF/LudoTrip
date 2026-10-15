import type { Identity } from './auth'
import type { AppEnv } from './env'

export const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })

/** Recusa com um motivo curto e estável (a tela traduz em frase com saída). */
export const fail = (status: number, reason: string) => json({ reason }, status)

export interface Ctx {
  request: Request
  url: URL
  env: AppEnv
  exec: ExecutionContext
  reqId: string
  /** A pessoa, se o token veio e é válido. */
  who: Identity | null
}
