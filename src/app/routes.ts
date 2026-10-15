import { formatRoute, parseRoute } from './routePaths'
import type { Route } from './routePaths'
import { useApp } from './store'
import type { AppState } from './store'

// Endereços de verdade (spec publicação §3.6): `/` é "Suas viagens" e `/v/<id>` é a viagem, para
// link, recarregar e favoritos funcionarem. Só no build com nuvem: o GitHub Pages não sabe responder
// a esses caminhos ao recarregar. Cidade, aba e painel não entram no endereço. O histórico continua
// do M3.8 (backButton): aqui só se troca o endereço da entrada atual (replaceState).

const routeOf = (s: AppState): Route | null =>
  s.screen === 'trip' && s.doc
    ? { kind: 'trip', id: s.doc.meta.id }
    : s.screen === 'home'
      ? { kind: 'home' }
      : null

/** Mantém o endereço igual à tela. Devolve a função que desliga. */
export function wireRoutes(): () => void {
  const sync = (s: AppState) => {
    const r = routeOf(s)
    if (!r) return
    // A volta do link de e-mail fica no endereço até o login terminar.
    if (r.kind === 'home' && parseRoute(location.pathname).kind === 'emailLink') return
    const path = formatRoute(r)
    if (location.pathname !== path) history.replaceState(history.state, '', path)
  }
  sync(useApp.getState())
  return useApp.subscribe(sync)
}
