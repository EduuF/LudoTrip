import type { AuthClient } from './authClient'

// Login de verdade com o Firebase (M4.10). Até lá, sem login: o app funciona no aparelho.
export async function firebaseAuth(): Promise<AuthClient | null> {
  return null
}
