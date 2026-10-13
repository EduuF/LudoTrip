import { useEffect } from 'react'
import { health, progress, tripPhase } from './engine'
import { countdownTo, todayISO, useApp } from './app/store'
import type { Tab } from './app/store'
import { nextChoice, THEME_GLYPH, THEME_LABEL } from './app/theme'
import { Atividades } from './ui/Atividades'
import { Create } from './ui/Create'
import { Home } from './ui/Home'
import { Celebrations, Petals, Toast } from './ui/kit'
import { Mapa } from './ui/Mapa'
import { Sheets } from './ui/Sheets'
import { Tarefas } from './ui/Tarefas'
import { Tutorial } from './ui/Tutorial'

// Casca do app (spec §17.1): HUD com contagem e nível, abas embaixo, painéis e comemorações.
// A tela principal é o Mapa: mapa, trilha, cartão do dia e roteiro numa tela só (spec §17.2).

function Hud() {
  const doc = useApp((s) => s.doc)!
  const goHome = useApp((s) => s.goHome)
  const undo = useApp((s) => s.undo)
  const canUndo = useApp((s) => s.undoStack.length > 0)
  const sound = useApp((s) => s.sound)
  const toggleSound = useApp((s) => s.toggleSound)
  const theme = useApp((s) => s.theme)
  const setTheme = useApp((s) => s.setTheme)
  const setTutorial = useApp((s) => s.setTutorial)
  const setTab = useApp((s) => s.setTab)
  const openSheet = useApp((s) => s.openSheet)
  const it = doc.itinerary
  const p = progress(it, doc)
  const phase = tripPhase(it, todayISO())
  const cd =
    phase.kind === 'before'
      ? `FALTAM ${countdownTo(phase.start).days} ${countdownTo(phase.start).days === 1 ? 'DIA' : 'DIAS'}`
      : phase.kind === 'during'
        ? `DIA ${phase.day}/${phase.totalDays}`
        : phase.kind === 'after'
          ? 'VIAGEM COMPLETA'
          : 'SEM DATA'
  return (
    <header className="hud">
      <div className="hud-in">
        <div className="hud-top">
          <button type="button" className="hud-btn" onClick={goHome} aria-label="Suas viagens">
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
          <button
            type="button"
            className="hud-btn"
            aria-label="Como jogar"
            onClick={() => {
              setTab('mapa')
              setTutorial(true)
            }}
          >
            ?
          </button>
          <button
            type="button"
            className="hud-btn"
            aria-label={THEME_LABEL[theme]}
            title={THEME_LABEL[theme]}
            onClick={() => setTheme(nextChoice(theme))}
          >
            {THEME_GLYPH[theme]}
          </button>
          <button
            type="button"
            className="hud-btn"
            aria-pressed={sound}
            onClick={toggleSound}
            aria-label={sound ? 'Desligar sons' : 'Ligar sons'}
            title={sound ? 'Sons ligados' : 'Sons desligados'}
          >
            {sound ? '♪' : '♪̸'}
          </button>
          <button type="button" className="hud-btn" onClick={undo} disabled={!canUndo}>
            ↶ Desfazer
          </button>
        </div>
        <div className="hud-bottom">
          <button
            type="button"
            className="cd-chip"
            onClick={() => openSheet({ kind: 'trip' })}
            aria-label={`${cd}. Toque para mudar as datas`}
          >
            {cd}
          </button>
          <span className="lv">NÍVEL {p.level}</span>
          <span
            className="xpbar"
            role="progressbar"
            aria-label={`Preparo: ${p.levelName}`}
            aria-valuenow={Math.round(p.ratio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <i style={{ width: `${Math.round(p.inLevel * 100)}%` }} />
          </span>
          <span>{p.xp} XP</span>
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
  const urgent = health(doc.itinerary, doc).filter((i) => i.severity !== 'info').length
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
  return (
    <>
      <Petals />
      {!ready ? null : screen === 'trip' ? <Trip /> : screen === 'create' ? <Create /> : <Home />}
      {screen !== 'trip' ? <Toast /> : null}
      <Celebrations />
    </>
  )
}
