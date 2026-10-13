import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../app/store'
import type { MapAdapter } from '../map/adapter'
import { cityFrame, frame } from '../map/frame'
import type { BBox } from '../map/frame'
import { paperAdapter } from '../map/paper'
import { tilesAdapter } from '../map/tiles'
import type { Theme } from '../map/style/washi'
import { BoardOverlay } from './BoardOverlay'

// O mapa de verdade (spec §8): começa no papel (instantâneo, sem rede) e troca para os tiles do
// OpenStreetMap no estilo washi assim que há WebGL e rede. A nossa camada SVG fica por cima dos dois.

function currentTheme(): Theme {
  const t = document.documentElement.dataset.theme
  if (t === 'dark') return 'dark'
  if (t === 'light') return 'light'
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function MapCanvas() {
  const doc = useApp((s) => s.doc)!
  const mapView = useApp((s) => s.mapView)
  const box = useRef<HTMLDivElement>(null)
  const tilesEl = useRef<HTMLDivElement>(null)
  const [adapter, setAdapter] = useState<MapAdapter | null>(null)
  const [tick, setTick] = useState(0)
  const [settled, setSettled] = useState(true)

  useLayoutEffect(() => {
    const el = box.current
    const tel = tilesEl.current
    if (!el || !tel) return
    const paper = paperAdapter(el)
    let live: MapAdapter = paper
    let dead = false
    setAdapter(paper)
    const ro = new ResizeObserver(() => {
      live.resize()
      setTick((t) => t + 1)
    })
    ro.observe(el)
    void tilesAdapter(tel, currentTheme()).then((t) => {
      if (!t) return
      if (dead) return t.destroy()
      live = t
      setAdapter(t)
    })
    return () => {
      dead = true
      ro.disconnect()
      paper.destroy()
      if (live !== paper) live.destroy()
    }
  }, [])

  useEffect(() => {
    if (!adapter) return
    return adapter.onMove((p) => {
      setSettled(p === 'end')
      setTick((t) => t + 1)
    })
  }, [adapter])

  // Enquadramento: a viagem inteira ou a cidade aberta; anima quando muda com o mesmo adaptador.
  const target = useMemo<BBox | null>(() => {
    const trip = frame(doc)?.bbox ?? null
    if (mapView.kind === 'city') return cityFrame(doc, mapView.destId) ?? trip
    return trip
  }, [doc, mapView])
  const prev = useRef<{ adapter: MapAdapter | null; key: string }>({ adapter: null, key: '' })
  useEffect(() => {
    if (!adapter || !target) return
    const key = target.join(',')
    const same = prev.current.adapter === adapter
    if (!same || prev.current.key !== key) adapter.fit(target, { padding: 30, animate: same })
    prev.current = { adapter, key }
  }, [adapter, target])

  const [W, H] = adapter?.size() ?? [0, 0]
  return (
    <div className={`board ${adapter?.kind ?? 'paper'}`} ref={box}>
      <div className="map-tiles" ref={tilesEl} />
      {adapter && target ? (
        <svg
          className="map-overlay"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="group"
          aria-label="Destinos no mapa"
        >
          <BoardOverlay adapter={adapter} tick={tick} settled={settled} />
        </svg>
      ) : null}
      {adapter?.kind === 'tiles' ? (
        <a className="map-credit" href="https://openfreemap.org" target="_blank" rel="noreferrer">
          OpenFreeMap © OpenMapTiles · dados © OpenStreetMap
        </a>
      ) : null}
      {!target ? (
        <div className="note-box">
          <p className="note">
            O mapa aparece quando a viagem tem destinos com localização. Toque em + Destino e escolha da
            lista.
          </p>
        </div>
      ) : null}
    </div>
  )
}
