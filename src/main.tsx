import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/app.css'
import App from './App.tsx'
import { setupCloud } from './app/cloudSetup'
import { initTelemetry } from './app/telemetry'
import { ErrorBoundary } from './ui/ErrorBoundary'

void initTelemetry().catch(() => undefined)

// A nuvem (se ligada neste build) entra antes da primeira tela; sem ela, o app abre igual.
void setupCloud()
  .catch(() => undefined)
  .then(() =>
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    ),
  )
