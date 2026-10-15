/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" no build da Cloudflare: liga contas e nuvem. Ausente no GitHub Pages (tudo no aparelho). */
  readonly VITE_CLOUD?: string
  /** "test" só no e2e: login simulado contra /api/test/token. */
  readonly VITE_AUTH?: string
  readonly VITE_APP_VERSION?: string
}
