/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" no build da Cloudflare: liga contas e nuvem. Ausente no GitHub Pages (tudo no aparelho). */
  readonly VITE_CLOUD?: string
  /** "test" só no e2e: login simulado contra /api/test/token. */
  readonly VITE_AUTH?: string
  readonly VITE_APP_VERSION?: string
  /** Chaves públicas do app web no Firebase (vão no site de qualquer jeito). */
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  /** Erros (Sentry) e métricas (PostHog UE). Sem elas, nada é carregado nem enviado. */
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_POSTHOG_KEY?: string
  /** "production" ou "staging". */
  readonly VITE_APP_ENV?: string
}
