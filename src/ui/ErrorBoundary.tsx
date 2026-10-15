import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { captureError } from '../app/telemetry'

// Uma tela que quebra não derruba o app em branco (spec publicação §5.6): mostra uma saída e manda o
// erro para o Sentry (quando ligado), com o pedaço da tela onde aconteceu.

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(error, {
      kind: 'tela',
      reason: (info.componentStack ?? '').trim().split('\n')[0]?.slice(0, 40) ?? '',
    })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="wrap crash">
        <h1 className="title">
          Ops, algo deu <em>errado</em>
        </h1>
        <p className="note">Suas viagens estão salvas. Recarregue para continuar de onde parou.</p>
        <button type="button" className="btn big main" onClick={() => location.reload()}>
          Recarregar
        </button>
      </div>
    )
  }
}
