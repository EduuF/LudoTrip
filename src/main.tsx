import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/app.css'
import App from './App.tsx'
import { setupCloud } from './app/cloudSetup'
import { initTelemetry } from './app/telemetry'
import { ErrorBoundary } from './ui/ErrorBoundary'

void initTelemetry().catch(() => undefined)

// Só em desenvolvimento: /#palco abre a galeria do elenco e dos objetos (docs/animacoes.md).
const gallery = import.meta.env.DEV && location.hash === '#palco'

// A nuvem (se ligada neste build) entra antes da primeira tela; sem ela, o app abre igual.
void setupCloud()
  .catch(() => undefined)
  .then(async () => {
    if (import.meta.env.DEV) await import('./ui/stage/devhook')
    if (gallery) {
      const { Gallery } = await import('./ui/stage/Gallery')
      return createRoot(document.getElementById('root')!).render(<Gallery />)
    }

    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    )
  })
