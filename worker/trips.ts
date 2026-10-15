import { fail } from './http'
import type { Ctx } from './http'

// Rotas das viagens da nuvem (M4.6).
export async function tripRoutes(c: Ctx): Promise<Response> {
  if (!c.who) return fail(401, 'auth')
  return fail(404, 'not-found')
}
