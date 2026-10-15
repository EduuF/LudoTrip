// Quem está usando o app (spec publicação §3). O login de verdade é o Firebase (firebaseAuth.ts, M4.10);
// nos testes e no e2e, um login simulado com a mesma interface. Sem conta, nada disso é necessário:
// o app funciona inteiro no aparelho.

export interface Account {
  uid: string
  name: string | null
  email: string | null
  picture: string | null
}

export type SignInResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'offline' | 'popup-blocked' | 'invalid' | 'needs-email' | 'error' }

export interface AuthClient {
  current(): Account | null
  /** Avisa sempre que a conta muda (entrar, sair, expirar). Chama já com a atual. */
  onChange(cb: (account: Account | null) => void): () => void
  /** Token de login válido agora (renovado se preciso), ou null sem conta. */
  token(): Promise<string | null>
  signInWithGoogle(): Promise<SignInResult>
  sendEmailLink(email: string): Promise<SignInResult>
  /** Volta do link de e-mail. Sem o e-mail guardado neste aparelho, devolve `needs-email`. */
  completeEmailLink(href: string, email?: string): Promise<SignInResult>
  signOut(): Promise<void>
}

/** Login em memória, para testes de tela: `signInAs` entra direto. */
export function memoryAuth(): AuthClient & { signInAs(account: Account | null): void } {
  let account: Account | null = null
  const subs = new Set<(a: Account | null) => void>()
  const set = (a: Account | null) => {
    account = a
    for (const cb of subs) cb(a)
  }
  return {
    current: () => account,
    onChange(cb) {
      subs.add(cb)
      cb(account)
      return () => void subs.delete(cb)
    },
    token: async () => (account ? `token-${account.uid}` : null),
    signInWithGoogle: async () => (
      set({ uid: 'google', name: 'Ana', email: 'ana@teste.invalid', picture: null }),
      { ok: true }
    ),
    sendEmailLink: async () => ({ ok: true }),
    completeEmailLink: async () => ({ ok: true }),
    signOut: async () => set(null),
    signInAs: set,
  }
}
