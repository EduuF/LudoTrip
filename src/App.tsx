import { CloudBadge } from './ui/CloudBadge'
import { ThemeToggle } from './ui/ThemeToggle'
import { Faces, ShareButton, ViewingTag } from './ui/People'
import { canEdit } from './app/people'
import { useCallback, useEffect, useState } from 'react'
import { wireBackButton } from './app/backButton'
import { wireRoutes } from './app/routes'
import { useApp } from './app/store'
import type { Tab } from './app/store'
import { resetTrilhaHint } from './app/tutorial'
import { Atividades } from './ui/Atividades'
import { Create } from './ui/Create'
import { Home } from './ui/Home'
import { InviteScreen } from './ui/InviteScreen'
import { Celebrations, Petals, PopMenu, Toast } from './ui/kit'
import { Mapa } from './ui/Mapa'
import { Sheets } from './ui/Sheets'
import { Tarefas } from './ui/Tarefas'
import { Tutorial } from './ui/Tutorial'
import { docHealth } from './app/tasks'
import { animMode, setAnimMode } from './ui/stage/palco'

// Casca do app (spec §17.1): HUD de uma linha (voltar, nome, tema, Desfazer e um menu com o resto),
// abas embaixo, painéis e comemorações. A contagem e o nível ficam no mapa (e o nível nas Tarefas).
// A tela principal é o Mapa: mapa, trilha, cartão do dia e roteiro numa tela só (spec §17.2).

function Hud() {
  const doc = useApp((s) => s.doc)!
  const goHome = useApp((s) => s.goHome)
  const exitCity = useApp((s) => s.exitCity)
  const inCity = useApp((s) => s.tab === 'mapa' && s.mapView.kind === 'city')
  const undo = useApp((s) => s.undo)
  const canUndo = useApp((s) => s.undoStack.length > 0)
  const sound = useApp((s) => s.sound)
  const toggleSound = useApp((s) => s.toggleSound)
  const setTutorial = useApp((s) => s.setTutorial)
  const setTab = useApp((s) => s.setTab)
  const openSheet = useApp((s) => s.openSheet)
  const [menu, setMenu] = useState(false)
  const closeMenu = useCallback(() => setMenu(false), [])
  const say = useApp((s) => s.say)
  const [anim, setAnim] = useState(animMode)
  return (
    <header className="hud">
      <div className="hud-in">
        <div className="hud-top">
          {/* Volta um nível (spec §17.14): da cidade, à viagem toda; da viagem, a "Suas viagens". */}
          <button
            type="button"
            className="hud-btn"
            onClick={inCity ? exitCity : goHome}
            aria-label={inCity ? 'Voltar à viagem toda' : 'Suas viagens'}
            title={inCity ? 'Voltar à viagem toda' : 'Suas viagens'}
          >
            ‹
          </button>
          <button
            type="button"
            className="hud-name"
            onClick={() => openSheet({ kind: 'trip' })}
            aria-label={`${doc.meta.name}: nome, quem vai e datas`}
          >
            {doc.meta.name}
          </button>
          <Faces />
          <div className="hud-menu">
            <button
              type="button"
              className="hud-btn"
              aria-label="Mais opções"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              ⋯
            </button>
            {menu ? (
              <PopMenu onClose={closeMenu}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false)
                    setTab('mapa')
                    resetTrilhaHint()
                    setTutorial(true)
                  }}
                >
                  Como jogar
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false)
                    toggleSound()
                  }}
                >
                  {sound ? '♪ Desligar sons' : '♪ Ligar sons'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    // Animações (docs/animacoes.md): completas, ou só um brilho discreto.
                    const next = anim === 'full' ? 'discreet' : 'full'
                    setAnimMode(next)
                    setAnim(next)
                    setMenu(false)
                    say(next === 'full' ? 'Animações completas.' : 'Animações discretas: só um brilho.')
                  }}
                >
                  {anim === 'full' ? '✦ Animações discretas' : '✦ Animações completas'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false)
                    openSheet({ kind: 'privacy' })
                  }}
                >
                  Privacidade
                </button>
              </PopMenu>
            ) : null}
          </div>
        </div>
        {/* Segunda linha (retorno do staging): ações com nome, nada espremido nem escondido. */}
        <div className="hud-actions">
          <ViewingTag />
          <ShareButton />
          <CloudBadge />
          <ThemeToggle />
          {/* Quem só vê não tem o que desfazer: o botão nem aparece (spec publicação §4.6). */}
          {canEdit(doc) ? (
            <button type="button" className="hud-btn" onClick={undo} disabled={!canUndo}>
              ↶ Desfazer
            </button>
          ) : null}
        </div>
      </div>
    </header>
  )
}

const TABS: { id: Tab; k: string; label: string }[] = [
  { id: 'mapa', k: '図', label: 'Mapa' },
  { id: 'atividades', k: '帖', label: 'Atividades' },
  { id: 'tarefas', k: '任', label: 'Tarefas' },
]

function Tabs() {
  const doc = useApp((s) => s.doc)!
  const tab = useApp((s) => s.tab)
  const setTab = useApp((s) => s.setTab)
  const exitCity = useApp((s) => s.exitCity)
  const inCity = useApp((s) => s.mapView.kind === 'city')
  const urgent = docHealth(doc).filter((i) => i.severity !== 'info').length
  return (
    <nav className="tabs" aria-label="Telas da viagem">
      <div className="tabs-in">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'on' : ''}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => {
              // Tocar de novo a aba "Mapa" dentro da cidade volta à viagem toda (spec §17.14).
              if (t.id === 'mapa' && tab === 'mapa' && inCity) return exitCity()
              setTab(t.id)
              scrollTo(0, 0)
            }}
          >
            <span className="k" aria-hidden="true">
              {t.k}
            </span>
            {t.label}
            {t.id === 'tarefas' && urgent ? <span className="badge">{urgent}</span> : null}
          </button>
        ))}
      </div>
    </nav>
  )
}

function Trip() {
  const tab = useApp((s) => s.tab)
  const focus = useApp((s) => s.focus)
  const clearFocus = useApp((s) => s.clearFocus)
  const name = useApp((s) => s.doc?.meta.name)
  useEffect(() => {
    if (name) document.title = `${name} · LudoTrip`
  }, [name])

  // "Ver" em qualquer tela: rola até o cartão e pisca (depois que a aba certa desenhou).
  useEffect(() => {
    if (!focus) return
    const el = document.getElementById(focus)
    clearFocus()
    if (!el) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
    el.classList.remove('flash')
    void el.offsetWidth
    el.classList.add('flash')
  }, [focus, clearFocus])

  return (
    <>
      <Hud />
      {/* As três abas ficam montadas (o mapa não é recriado a cada ida e volta); as inativas ficam escondidas. */}
      <main className={`wrap${tab === 'mapa' ? ' wide' : ''}`}>
        <div hidden={tab !== 'mapa'}>
          <Mapa />
        </div>
        <div hidden={tab !== 'atividades'}>
          <Atividades />
        </div>
        <div hidden={tab !== 'tarefas'}>
          <Tarefas />
        </div>
      </main>
      <Tabs />
      <Toast />
      <Sheets />
      {tab === 'mapa' ? <Tutorial /> : null}
    </>
  )
}

export default function App() {
  const ready = useApp((s) => s.ready)
  const screen = useApp((s) => s.screen)
  const init = useApp((s) => s.init)
  useEffect(() => {
    void init()
  }, [init])
  useEffect(() => wireBackButton(), [])
  // Endereços /v/<id> só no build com nuvem (o GitHub Pages não os conhece ao recarregar).
  const cloudEnabled = useApp((s) => s.cloudEnabled)
  useEffect(() => (ready && cloudEnabled ? wireRoutes() : undefined), [ready, cloudEnabled])
  return (
    <>
      <Petals />
      {!ready ? null : screen === 'trip' ? (
        <Trip />
      ) : screen === 'create' ? (
        <Create />
      ) : screen === 'invite' ? (
        <InviteScreen />
      ) : (
        <Home />
      )}
      {screen !== 'trip' ? <Toast /> : null}
      {screen === 'home' || screen === 'invite' ? <Sheets /> : null}
      <Celebrations />
    </>
  )
}
