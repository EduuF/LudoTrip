import { lazy, Suspense, useEffect, useState } from 'react'
import { days as allDays, placeStates, plural, timeline, tripPhase, worlds } from '../engine'
import { countdownTo, todayISO, useApp } from '../app/store'

// O painel do mapa (spec §17.2): o mapa da viagem (ou da cidade aberta) com a contagem regressiva e o
// resumo por cima, mais "+ Destino". O mapa em si carrega sob demanda (d3, contornos e MapLibre).

const MapCanvas = lazy(() => import('./MapCanvas').then((m) => ({ default: m.MapCanvas })))

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

  if (phase.kind === 'undated')
    return (
      <>
        <div className="lbl">SEM DATA AINDA</div>
        <button
          type="button"
          className="btn small"
          style={{ marginTop: 6 }}
          onClick={() => openSheet({ kind: 'end', date: null })}
        >
          Escolher a data de ida
        </button>
      </>
    )
  if (phase.kind === 'before') {
    const [y, m, d] = phase.start.split('-').map(Number) as [number, number, number]
    const { days, hh, mm, ss } = countdownTo(phase.start, now)
    return (
      <div role="timer" aria-label={`Faltam ${days} dias para a viagem`}>
        <div className="lbl">PARTIDA · FALTAM</div>
        <div className="big">
          <b>{days}</b>
          <span>{days === 1 ? 'dia' : 'dias'}</span>
        </div>
        <div className="clock">
          {hh}:{mm}:{ss} · {String(d).padStart(2, '0')} {MONTHS[m - 1]} {y}
        </div>
      </div>
    )
  }
  if (phase.kind === 'during') {
    const city = doc.destinations.find((d) => d.id === phase.destinationId)?.name
    return (
      <>
        <div className="lbl">EM VIAGEM · 旅行中</div>
        <div className="big">
          <b>{phase.day}</b>
          <span>/ {phase.totalDays}</span>
        </div>
        <div className="clock">{city ? `hoje em ${city}` : 'aproveitem cada dia'}</div>
      </>
    )
  }
  return (
    <>
      <div className="lbl">VIAGEM COMPLETA</div>
      <div className="big">
        <b>{phase.totalDays}</b>
        <span>dias vividos</span>
      </div>
    </>
  )
}

/** Cabeçalho dentro da cidade: voltar, nome, dias e lugares. */
function CityHead({ destId }: { destId: string }) {
  const doc = useApp((s) => s.doc)!
  const exitCity = useApp((s) => s.exitCity)
  const it = doc.itinerary
  const d = doc.destinations.find((x) => x.id === destId)
  const nDays = allDays(it, doc.places).filter((x) => x.destinationId === destId).length
  const states = placeStates(it, doc.places)
  const mine = doc.places.filter((p) => p.destinationId === destId)
  const placed = mine.filter((p) => states.get(p.id)?.days.length).length
  return (
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
          {nDays ? `${plural(nDays, 'dia', 'dias')} · ` : 'bate-volta · '}
          {placed}/{mine.length} lugares com dia
        </span>
      </div>
    </div>
  )
}

export function MapPanel() {
  const doc = useApp((s) => s.doc)!
  const openSheet = useApp((s) => s.openSheet)
  const mapView = useApp((s) => s.mapView)
  const it = doc.itinerary
  const nights = timeline(it).total
  const places = new Set(it.stops.map((s) => s.destinationId).filter(Boolean)).size
  const countries = worlds(it, doc.destinations).length
  const first = doc.destinations.find((d) => d.id === it.stops.find((s) => s.destinationId)?.destinationId)
  const wm = doc.scope?.localName ?? first?.localName ?? doc.scope?.name ?? first?.name ?? ''
  const line = [
    doc.scope?.name,
    plural(nights, 'noite', 'noites'),
    plural(places, 'lugar', 'lugares'),
    countries > 1 ? plural(countries, 'país', 'países') : null,
  ]
    .filter(Boolean)
    .join(' · ')

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
          <div className="map-line">{line}</div>
        </div>
      )}
      <span className="map-wm" aria-hidden="true">
        {mapView.kind === 'city'
          ? (doc.destinations.find((d) => d.id === mapView.destId)?.localName ?? '')
          : wm}
      </span>
      <div className="map-acts">
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
          + Destino
        </button>
      </div>
    </section>
  )
}
