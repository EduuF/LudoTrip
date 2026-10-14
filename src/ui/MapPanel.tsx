import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { days as allDays, placeStates, plural, tripPhase } from '../engine'
import { countdownTo, todayISO, useApp } from '../app/store'
import { reducedMotion } from '../map/adapter'
import { citySpots, DAY_COLORS } from '../map/spots'
import { LevelLine } from './LevelLine'

// O painel do mapa (spec §17.2): o mapa da viagem (ou da cidade aberta) com a contagem regressiva e o
// resumo por cima, "+ Adicionar destino" / "+ Atividade aqui" e "▶ Ver a viagem" (os dias passam sozinhos e o grupo
// anda pelo mapa). A porta de shoji fecha e abre ao entrar e sair da cidade. O mapa em si carrega sob
// demanda (d3, contornos e MapLibre).

const MapCanvas = lazy(() => import('./MapCanvas').then((m) => ({ default: m.MapCanvas })))

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
const PLAY_MS = 1400
const PLAY_MS_REDUCED = 900

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

  if (phase.kind === 'undated')
    return (
      <>
        <div className="lbl">SEM DATA AINDA</div>
        <button
          type="button"
          className="btn small"
          style={{ marginTop: 6 }}
          onClick={() => openSheet({ kind: 'trip' })}
        >
          Escolher a data de ida
        </button>
      </>
    )
  // Compacta (cobre pouco do mapa no celular): rótulo, número e unidade numa linha; relógio e data embaixo.
  const open = () => openSheet({ kind: 'trip' })
  if (phase.kind === 'before') {
    const [y, m, d] = phase.start.split('-').map(Number) as [number, number, number]
    const { days, hh, mm, ss } = countdownTo(phase.start, now)
    return (
      <button
        type="button"
        className="cd-open"
        onClick={open}
        aria-label={`Faltam ${days} dias para a viagem. Toque para mudar as datas`}
      >
        <span className="cd-row">
          <span className="lbl">FALTAM</span>
          <b>{days}</b>
          <span>{days === 1 ? 'dia' : 'dias'}</span>
        </span>
        <span className="clock">
          {hh}:{mm}:{ss} · {String(d).padStart(2, '0')} {MONTHS[m - 1]} {y}
        </span>
      </button>
    )
  }
  if (phase.kind === 'during') {
    const city = doc.destinations.find((d) => d.id === phase.destinationId)?.name
    return (
      <button
        type="button"
        className="cd-open"
        onClick={open}
        aria-label="Em viagem. Toque para ver as datas"
      >
        <span className="cd-row">
          <span className="lbl">EM VIAGEM</span>
          <b>{phase.day}</b>
          <span>/ {phase.totalDays}</span>
        </span>
        <span className="clock">{city ? `hoje em ${city}` : 'aproveitem cada dia'}</span>
      </button>
    )
  }
  return (
    <button
      type="button"
      className="cd-open"
      onClick={open}
      aria-label="Viagem completa. Toque para ver as datas"
    >
      <span className="cd-row">
        <span className="lbl">VIAGEM COMPLETA</span>
        <b>{phase.totalDays}</b>
        <span>dias vividos</span>
      </span>
    </button>
  )
}

/** Cabeçalho dentro da cidade: voltar, nome, dias e lugares; fichas de dias (filtro) e o que falta marcar. */
function CityHead({ destId }: { destId: string }) {
  const doc = useApp((s) => s.doc)!
  const exitCity = useApp((s) => s.exitCity)
  const cursor = useApp((s) => s.cursorDay)
  const setCursorDay = useApp((s) => s.setCursorDay)
  const setPlacing = useApp((s) => s.setPlacing)
  const openSheet = useApp((s) => s.openSheet)
  const say = useApp((s) => s.say)
  const it = doc.itinerary
  const d = doc.destinations.find((x) => x.id === destId)
  const ds = allDays(it, doc.places)
  const city = citySpots(doc, destId)
  const states = placeStates(it, doc.places)
  const mine = doc.places.filter((p) => p.destinationId === destId)
  const placed = mine.filter((p) => states.get(p.id)?.days.length).length
  const chipDays = [
    ...city.cityDays.map((x) => x.index),
    ...city.trails.map((t) => t.dayIndex).filter((i) => !city.cityDays.some((x) => x.index === i)),
  ].sort((a, b) => a - b)
  const trailColor = (i: number) => {
    const t = city.trails.find((x) => x.dayIndex === i)
    return t ? DAY_COLORS[t.ordinal % DAY_COLORS.length] : null
  }
  return (
    <>
      <div className="city-head">
        <button type="button" className="btn small" onClick={exitCity}>
          ◀ Mapa
        </button>
        <div className="city-t">
          <b>
            {d?.name}
            {d?.localName && d.localName !== d.name ? <span className="local"> {d.localName}</span> : null}
          </b>
          <span>
            {city.cityDays.length ? `${plural(city.cityDays.length, 'dia', 'dias')} · ` : 'bate-volta · '}
            {placed}/{mine.length} lugares com dia
          </span>
        </div>
      </div>
      <div className="city-days" role="group" aria-label="Dias nesta cidade">
        <button
          type="button"
          className={chipDays.includes(cursor ?? -1) ? '' : 'on'}
          aria-pressed={!chipDays.includes(cursor ?? -1)}
          onClick={() => setCursorDay(null)}
        >
          Todos
        </button>
        {chipDays.map((i) => {
          const day = ds[i]
          const c = trailColor(i)
          return (
            <button
              key={i}
              type="button"
              className={cursor === i ? 'on' : ''}
              aria-pressed={cursor === i}
              aria-label={`Ver o dia ${day?.label ?? i + 1} no mapa`}
              onClick={() => setCursorDay(i)}
            >
              {c ? <i style={{ background: c }} /> : null}
              {day?.label ?? `dia ${i + 1}`}
            </button>
          )
        })}
        {city.unplaced.length ? (
          <button
            type="button"
            className="warn"
            onClick={() =>
              openSheet({
                kind: 'choice',
                title: 'Sem lugar no mapa',
                sub: 'Toque numa atividade e depois no mapa, onde ela fica.',
                options: city.unplaced.map((p) => ({
                  label: p.name,
                  detail: ['Marcar no mapa'],
                  run: () => {
                    setPlacing(p.id)
                    say(`Marque no mapa onde fica ${p.name}.`)
                  },
                })),
              })
            }
          >
            ⚑ {city.unplaced.length} sem lugar no mapa
          </button>
        ) : null}
      </div>
    </>
  )
}

/** "▶ Ver a viagem": os dias passam sozinhos; qualquer toque para. Dentro da cidade, segue a cidade do dia. */
function usePlay() {
  const playing = useApp((s) => s.playing)
  const setPlaying = useApp((s) => s.setPlaying)
  useEffect(() => {
    if (!playing) return
    const st = useApp.getState()
    const doc = st.doc
    if (!doc) return
    const total = allDays(doc.itinerary, doc.places).length
    if ((st.cursorDay ?? 0) >= total - 1) st.setCursorDay(0)
    const ms = reducedMotion() ? PLAY_MS_REDUCED : PLAY_MS
    const timer = setInterval(() => {
      const s = useApp.getState()
      const d = s.doc
      if (!d) return setPlaying(false)
      const ds = allDays(d.itinerary, d.places)
      const next = (s.cursorDay ?? -1) + 1
      if (next >= ds.length) return setPlaying(false)
      s.setCursorDay(next)
      const dest = ds[next]?.destinationId
      if (s.mapView.kind === 'city' && dest && dest !== s.mapView.destId) s.enterCity(dest)
    }, ms)
    const stop = (e: Event) => {
      // Toques no próprio botão (■ Parar) já tratam; qualquer outro toque para a simulação.
      if ((e.target as HTMLElement | null)?.closest?.('.play')) return
      setPlaying(false)
    }
    document.addEventListener('pointerdown', stop, true)
    return () => {
      clearInterval(timer)
      document.removeEventListener('pointerdown', stop, true)
    }
  }, [playing, setPlaying])
  return { playing, toggle: () => setPlaying(!playing) }
}

/** Porta de shoji ao entrar e sair da cidade (guia de vibe). */
function useShoji(key: string) {
  const [open, setOpen] = useState(false)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (reducedMotion()) return
    setOpen(true)
    const t = setTimeout(() => setOpen(false), 760)
    return () => clearTimeout(t)
  }, [key])
  return open
}

export function MapPanel() {
  const doc = useApp((s) => s.doc)!
  const openSheet = useApp((s) => s.openSheet)
  const mapView = useApp((s) => s.mapView)
  const setPlacing = useApp((s) => s.setPlacing)
  const it = doc.itinerary
  const first = doc.destinations.find((d) => d.id === it.stops.find((s) => s.destinationId)?.destinationId)
  const wm = doc.scope?.localName ?? first?.localName ?? doc.scope?.name ?? first?.name ?? ''
  const { playing, toggle } = usePlay()
  const shoji = useShoji(mapView.kind === 'city' ? mapView.destId : 'trip')
  const canPlay = allDays(it, doc.places).length > 1

  return (
    <section className="mappanel" aria-label="Mapa da viagem">
      <Suspense fallback={<div className="board" />}>
        <MapCanvas />
      </Suspense>
      {mapView.kind === 'city' ? (
        <CityHead destId={mapView.destId} />
      ) : (
        <div className="map-head">
          <Countdown />
          <LevelLine />
        </div>
      )}
      <span className="map-wm" aria-hidden="true">
        {mapView.kind === 'city'
          ? (doc.destinations.find((d) => d.id === mapView.destId)?.localName ?? '')
          : wm}
      </span>
      {canPlay ? (
        <div className="map-play">
          <button type="button" className={`btn small play${playing ? ' on' : ''}`} onClick={toggle}>
            {playing ? '■ Parar' : '▶ Ver a viagem'}
          </button>
        </div>
      ) : null}
      <div className="map-acts">
        {mapView.kind === 'city' ? (
          <button type="button" className="btn small" onClick={() => setPlacing('new')}>
            + Atividade aqui
          </button>
        ) : (
          <button
            type="button"
            className="btn small"
            onClick={() =>
              openSheet({
                kind: 'dest',
                title: 'Que destino entra na viagem?',
                pick: (destId) => openSheet({ kind: 'where', destId }),
              })
            }
          >
            + Adicionar destino
          </button>
        )}
      </div>
      <div className={`shoji${shoji ? ' on' : ''}`} aria-hidden="true">
        <div />
        <div />
      </div>
    </section>
  )
}
