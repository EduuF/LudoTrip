import { initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getRedirectResult,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth'
import type { User } from 'firebase/auth'
import type { Account, AuthClient, SignInResult } from './authClient'

// Login de verdade (spec publicação §2.3, §3.3): Firebase Auth, só para login. `authDomain` é o
// próprio domínio do app — o Worker repassa /__/auth/* ao Firebase —, para o Safari não bloquear o
// login (https://firebase.google.com/docs/auth/web/redirect-best-practices, opção 3).
// Carregado sob demanda (import dinâmico em cloudSetup): quem usa sem conta não baixa o Firebase.

const EMAIL_KEY = 'ludotrip.emailForSignIn'

const toAccount = (u: User | null): Account | null =>
  u ? { uid: u.uid, name: u.displayName, email: u.email, picture: u.photoURL } : null

/** Traduz o erro do Firebase para o que a tela sabe mostrar. */
function reasonOf(e: unknown): Exclude<SignInResult, { ok: true }>['reason'] {
  const code = (e as { code?: string })?.code ?? ''
  if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'].includes(code))
    return 'cancelled'
  if (code === 'auth/popup-blocked') return 'popup-blocked'
  if (code === 'auth/network-request-failed') return 'offline'
  if (['auth/invalid-email', 'auth/invalid-action-code', 'auth/expired-action-code'].includes(code))
    return 'invalid'
  return 'error'
}

/** O app aberto como app instalado (tela de início): pop-up não funciona bem, usa redirecionamento. */
const standalone = () =>
  matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as { standalone?: boolean }).standalone === true

export async function firebaseAuth(): Promise<AuthClient | null> {
  const env = import.meta.env
  const apiKey = env.VITE_FIREBASE_API_KEY
  const projectId = env.VITE_FIREBASE_PROJECT_ID
  if (!apiKey || !projectId) return null
  const app = initializeApp({
    apiKey,
    projectId,
    authDomain: location.host,
    appId: env.VITE_FIREBASE_APP_ID,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  })
  const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  })
  auth.languageCode = 'pt-BR'
  // Volta de um login por redirecionamento: o resultado entra pelo onAuthStateChanged.
  void getRedirectResult(auth).catch(() => undefined)

  const google = () => {
    const p = new GoogleAuthProvider()
    p.setCustomParameters({ prompt: 'select_account' })
    return p
  }

  return {
    current: () => toAccount(auth.currentUser),
    onChange: (cb) => onAuthStateChanged(auth, (u) => cb(toAccount(u))),
    async token() {
      try {
        return (await auth.currentUser?.getIdToken()) ?? null
      } catch {
        return null
      }
    },
    async signInWithGoogle() {
      if (!navigator.onLine) return { ok: false, reason: 'offline' }
      try {
        if (standalone()) {
          await signInWithRedirect(auth, google())
          return { ok: true }
        }
        await signInWithPopup(auth, google())
        return { ok: true }
      } catch (e) {
        const reason = reasonOf(e)
        // Pop-up bloqueado: tenta pelo redirecionamento (a página volta já logada).
        if (reason === 'popup-blocked') {
          try {
            await signInWithRedirect(auth, google())
            return { ok: true }
          } catch (e2) {
            return { ok: false, reason: reasonOf(e2) }
          }
        }
        return { ok: false, reason }
      }
    },
    async sendEmailLink(email) {
      if (!navigator.onLine) return { ok: false, reason: 'offline' }
      try {
        await sendSignInLinkToEmail(auth, email, {
          url: `${location.origin}${import.meta.env.BASE_URL}entrar/link`,
          handleCodeInApp: true,
        })
        try {
          localStorage.setItem(EMAIL_KEY, email)
        } catch {
          // sem armazenamento: na volta, o app pede o e-mail de novo
        }
        return { ok: true }
      } catch (e) {
        return { ok: false, reason: reasonOf(e) }
      }
    },
    async completeEmailLink(href, email) {
      if (!isSignInWithEmailLink(auth, href)) return { ok: false, reason: 'invalid' }
      let stored: string | null = null
      try {
        stored = localStorage.getItem(EMAIL_KEY)
      } catch {
        stored = null
      }
      // Aberto noutro aparelho ou navegador: o Firebase exige confirmar o e-mail (fixação de sessão).
      const address = email ?? stored
      if (!address) return { ok: false, reason: 'needs-email' }
      try {
        await signInWithEmailLink(auth, address, href)
        try {
          localStorage.removeItem(EMAIL_KEY)
        } catch {
          // ok
        }
        return { ok: true }
      } catch (e) {
        return { ok: false, reason: reasonOf(e) }
      }
    },
    signOut: () => signOut(auth),
  }
}
