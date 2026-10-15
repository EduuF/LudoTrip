import type { AuthClient } from '../auth/authClient'
import { httpCloudApi } from '../sync/cloudApi'
import { createOutbox } from '../sync/outbox'
import { configureCloud } from './store'

// Liga a nuvem (spec publicação §2) quando o build pede (VITE_CLOUD=1). O login de verdade (Firebase)
// é carregado sob demanda, para não pesar a primeira carga de quem só usa no aparelho.

export async function setupCloud(): Promise<void> {
  if (import.meta.env.VITE_CLOUD !== '1') return
  const auth: AuthClient | null =
    import.meta.env.VITE_AUTH === 'test'
      ? (await import('../auth/testAuth')).testAuth()
      : await import('../auth/firebaseAuth').then((m) => m.firebaseAuth()).catch(() => null)
  // Sem login disponível (ex.: sem rede na primeira vez), o app segue só no aparelho.
  if (!auth) return
  const app = import.meta.env.VITE_APP_VERSION ?? 'dev'
  configureCloud({ auth, api: httpCloudApi(auth, location.origin, app), outbox: createOutbox(), app })
}
