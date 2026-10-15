import type { Account, AuthClient } from './authClient'

// Login de teste para o e2e (spec publicação §2.4): pega um token em /api/test/token, rota que só
// existe no servidor de testes (TEST_AUTH=1). Nunca entra no build publicado (VITE_AUTH=test só no e2e).

const KEY = 'ludotrip.testAuth'

export function testAuth(origin = location.origin): AuthClient {
  const read = (): Account | null => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Account | null
    } catch {
      return null
    }
  }
  let account = read()
  const subs = new Set<(a: Account | null) => void>()
  const set = (a: Account | null) => {
    account = a
    try {
      if (a) localStorage.setItem(KEY, JSON.stringify(a))
      else localStorage.removeItem(KEY)
    } catch {
      // sem armazenamento: vale só nesta aba
    }
    for (const cb of subs) cb(a)
  }
  const signIn = (uid: string, name: string) => {
    set({ uid, name, email: `${uid}@teste.invalid`, picture: null })
    return { ok: true as const }
  }
  return {
    current: () => account,
    onChange(cb) {
      subs.add(cb)
      cb(account)
      return () => void subs.delete(cb)
    },
    async token() {
      if (!account) return null
      const q = new URLSearchParams({ uid: account.uid, ...(account.name ? { name: account.name } : {}) })
      const r = await fetch(`${origin}/api/test/token?${q}`)
      return r.ok ? ((await r.json()) as { token: string }).token : null
    },
    // Quem "entra com Google": a Ana, ou quem o teste pedir (`ludotrip.testAuthNext`, para o e2e com
    // várias pessoas).
    signInWithGoogle: async () => {
      try {
        const next = JSON.parse(localStorage.getItem(`${KEY}Next`) ?? 'null') as {
          uid: string
          name: string
        } | null
        if (next) return signIn(next.uid, next.name)
      } catch {
        // sem armazenamento: a Ana
      }
      return signIn('ana', 'Ana')
    },
    sendEmailLink: async () => ({ ok: true }),
    completeEmailLink: async () => signIn('bia', 'Bia'),
    signOut: async () => set(null),
  }
}
