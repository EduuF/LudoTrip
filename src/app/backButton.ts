import { useApp } from './store'
import type { AppState } from './store'

// Voltar do sistema (spec §17.14): o Voltar do Android, do navegador ou o gesto do iPhone volta um passo
// (`stepBack`) em vez de sair do app. Enquanto há algo aberto (viagem, cidade, painel, tutorial), fica
// uma entrada nossa no histórico, sem mudar a URL; cada Voltar a consome, volta um passo e a repõe se
// ainda houver algo aberto. Fechar tudo pela tela deixa a entrada lá: o próximo Voltar só a consome.
// O Escape fora de painel e tutorial (que já tratam o seu) sai do "marcar no mapa" e da cidade.

const MARK = 'ludotrip'
const inside = (s: AppState) => s.screen !== 'home' || !!s.sheet || s.tutorial
const ours = () => (history.state as Record<string, unknown> | null)?.[MARK] === true

export function wireBackButton(): () => void {
  let pushed = ours()
  const sync = () => {
    if (pushed || !inside(useApp.getState())) return
    history.pushState({ ...((history.state as object | null) ?? {}), [MARK]: true }, '')
    pushed = true
  }
  const onPop = () => {
    pushed = ours()
    const s = useApp.getState()
    if (inside(s)) s.stepBack()
    sync()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    const s = useApp.getState()
    if (s.sheet || s.tutorial || s.screen !== 'trip') return
    if (document.querySelector('[role=menu]')) return
    if (s.placing || s.mapView.kind === 'city') s.stepBack()
  }
  sync()
  const unsub = useApp.subscribe(sync)
  addEventListener('popstate', onPop)
  addEventListener('keydown', onKey)
  return () => {
    unsub()
    removeEventListener('popstate', onPop)
    removeEventListener('keydown', onKey)
  }
}
