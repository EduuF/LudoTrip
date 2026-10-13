import { useEffect, useState } from 'react'
import { describeIssue, health, plural, progress, timeline, tripPhase, worlds } from '../engine'
import { countdownTo, todayISO, useApp } from '../app/store'
import { Board } from './Board'
import { Travelers } from './kit'

// Mundo (spec §17.2): a contagem regressiva, o tabuleiro e o que falta.

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

function Countdown() {
  const doc = useApp((s) => s.doc)!
  const openSheet = useApp((s) => s.openSheet)
  const it = doc.itinerary
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const phase = tripPhase(it, todayISO(now))
  const first = doc.destinations.find((d) => d.id === it.stops.find((s) => s.destinationId)?.destinationId)
  const wm = first?.localName ?? first?.name ?? ''

  if (phase.kind === 'undated')
    return (
      <div className="countdown">
        <div className="lbl">SEM DATA AINDA</div>
        <div className="big">
          <b>?</b>
          <span>dias</span>
        </div>
        <button
          type="button"
          className="btn small"
          style={{ marginTop: 8 }}
          onClick={() => openSheet({ kind: 'end', date: null })}
        >
          Escolher a data de ida
        </button>
        <span className="wm" aria-hidden="true">
          {wm}
        </span>
      </div>
    )
  if (phase.kind === 'before') {
    const [y, m, d] = phase.start.split('-').map(Number) as [number, number, number]
    const { days, hh, mm, ss } = countdownTo(phase.start, now)
    return (
      <div className="countdown" role="timer" aria-label={`Faltam ${days} dias para a viagem`}>
        <div className="lbl">PARTIDA · FALTAM</div>
        <div className="big">
          <b>{days}</b>
          <span>{days === 1 ? 'dia' : 'dias'}</span>
        </div>
        <div className="clock">
          {hh}:{mm}:{ss} · {String(d).padStart(2, '0')} {MONTHS[m - 1]} {y}
        </div>
        <span className="wm" aria-hidden="true">
          {wm}
        </span>
      </div>
    )
  }
  if (phase.kind === 'during') {
    const city = doc.destinations.find((d) => d.id === phase.destinationId)?.name
    return (
      <div className="countdown">
        <div className="lbl">EM VIAGEM · 旅行中</div>
        <div className="big">
          <b>{phase.day}</b>
          <span>/ {phase.totalDays}</span>
        </div>
        <div className="clock">{city ? `hoje em ${city}` : 'aproveitem cada dia'}</div>
        <span className="wm" aria-hidden="true">
          {wm}
        </span>
      </div>
    )
  }
  return (
    <div className="countdown">
      <div className="lbl">VIAGEM COMPLETA</div>
      <div className="big">
        <b>{phase.totalDays}</b>
        <span>dias vividos</span>
      </div>
      <div className="clock">お疲れさま!</div>
    </div>
  )
}

export function Mundo() {
  const doc = useApp((s) => s.doc)!
  const setTab = useApp((s) => s.setTab)
  const it = doc.itinerary
  const p = progress(it, doc)
  const cities = new Set(it.stops.map((s) => s.destinationId).filter(Boolean)).size
  const countries = worlds(it, doc.destinations).length
  const issues = health(it, doc).slice(0, 3)
  const names = { destinations: doc.destinations, places: doc.places }

  return (
    <>
      <Countdown />
      <Board />
      <div className="stats">
        <div className="stat">
          <b>{timeline(it).total}</b>
          <span>noites</span>
        </div>
        <div className="stat">
          <b>{cities}</b>
          <span>{cities === 1 ? 'cidade' : 'cidades'}</span>
        </div>
        <div className="stat">
          <b>{countries || '–'}</b>
          <span>{countries === 1 ? 'país' : 'países'}</span>
        </div>
      </div>
      <h2 className="sec">
        Quem vai <small>{plural(it.travelers.length, 'viajante', 'viajantes')}</small>
      </h2>
      <div className="row">
        <Travelers count={it.travelers.length || 1} px={5} />
        <span className="note">{it.travelers.map((t) => t.name).join(', ')}</span>
      </div>
      <h2 className="sec">
        Próximas quests{' '}
        <small>
          LV {p.level} · {p.levelName}
        </small>
      </h2>
      {issues.length ? (
        <div className="quests">
          {issues.map((i, k) => (
            <div key={k} className={`quest ${i.severity}`}>
              <p>{describeIssue(i, it, names, doc.bookings)}</p>
            </div>
          ))}
          <button
            type="button"
            className="btn small"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setTab('quests')}
          >
            Ver todas as quests
          </button>
        </div>
      ) : (
        <p className="note">Nada pendente. Viagem redonda!</p>
      )}
    </>
  )
}
