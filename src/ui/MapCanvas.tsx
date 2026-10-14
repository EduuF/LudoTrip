import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent, MouseEvent as RMouseEvent } from 'react'
import { useApp } from '../app/store'
import type { MapAdapter } from '../map/adapter'
import { cityFrame, frame } from '../map/frame'
import type { BBox } from '../map/frame'
import { paperAdapter } from '../map/paper'
import { tilesAdapter } from '../map/tiles'
import { currentTheme } from '../app/theme'
import { BoardOverlay } from './BoardOverlay'
import { CityOverlay } from './CityOverlay'

// O mapa de verdade (spec §8): começa no papel (instantâneo, sem rede) e troca para os tiles do
// OpenStreetMap no estilo washi assim que há WebGL e rede. A nossa camada SVG fica por cima dos dois.

const HOLD_MS = 550

export function MapCanvas() {
  const doc = useApp((s) => s.doc)!
  const mapView = useApp((s) => s.mapView)
  const placing = useApp((s) => s.placing)
  const setPlacing = useApp((s) => s.setPlacing)
  const openSheet = useApp((s) => s.openSheet)
  const act = useApp((s) => s.act)
  const box = useRef<HTMLDivElement>(null)
  const tilesEl = useRef<HTMLDivElement>(null)
  const [adapter, setAdapter] = useState<MapAdapter | null>(null)
  const [tick, setTick] = useState(0)
  const [settled, setSettled] = useState(true)
  const targetRef = useRef<BBox | null>(null)

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
    void tilesAdapter(tel, currentTheme(), targetRef.current ?? undefined).then((t) => {
      if (!t) return
      if (dead) return t.destroy()
      // Nunca uma tela vazia: se o contêiner dos tiles não tiver tamanho (CSS alheio, WebGL capenga),
      // o papel continua valendo.
      const [w, h] = t.size()
      if (el.clientWidth > 0 && el.clientHeight > 0 && !(w > 0 && h > 0)) return t.destroy()
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

  // Modo dia/noite: o mapa de tiles troca o estilo junto com o app (e com o aparelho, antes do primeiro toque).
  const theme = useApp((s) => s.theme)
  useEffect(() => {
    if (!adapter) return
    const apply = () => adapter.setTheme?.(currentTheme())
    apply()
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [adapter, theme])

  // Enquadramento: a viagem inteira ou a cidade aberta; anima quando muda com o mesmo adaptador.
  const target = useMemo<BBox | null>(() => {
    const trip = frame(doc)?.bbox ?? null
    if (mapView.kind === 'city') return cityFrame(doc, mapView.destId) ?? trip
    return trip
  }, [doc, mapView])
  targetRef.current = target
  const prev = useRef<{ adapter: MapAdapter | null; key: string }>({ adapter: null, key: '' })
  useEffect(() => {
    if (!adapter || !target) return
    const key = target.join(',')
    const same = prev.current.adapter === adapter
    if (!same || prev.current.key !== key) adapter.fit(target, { padding: 30, animate: same })
    prev.current = { adapter, key }
  }, [adapter, target])

  // Modo "marcar no mapa" (placing): um clique marca o lugar de uma atividade ou abre "Nova atividade"
  // já com o lugar. Fora do modo, segurar no mapa também abre "Nova atividade".
  const lonLatAt = (clientX: number, clientY: number) => {
    const r = box.current?.getBoundingClientRect()
    if (!r || !adapter) return null
    return adapter.unproject([clientX - r.left, clientY - r.top])
  }
  const cityId = mapView.kind === 'city' ? mapView.destId : null
  const onClick = (e: RMouseEvent<HTMLDivElement>) => {
    if (!placing || !cityId) return
    const ll = lonLatAt(e.clientX, e.clientY)
    if (!ll) return
    const what = placing
    // Sai do modo antes de abrir o painel (sair do modo não mexe no painel).
    setPlacing(null)
    if (what === 'new') openSheet({ kind: 'newActivity', destId: cityId, lon: ll[0], lat: ll[1] })
    // Marcar no mapa é um passo de "Sobre a atividade": marcado, o painel dela volta (com o lugar já salvo).
    else if (act({ type: 'setPlace', id: what, patch: { lon: ll[0], lat: ll[1] } }))
      openSheet({ kind: 'sticker', placeId: what })
  }
  const hold = useRef<{ x: number; y: number; t: number } | null>(null)
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!cityId || placing) return
    const { clientX: x, clientY: y } = e
    clearTimeout(hold.current?.t)
    hold.current = {
      x,
      y,
      t: window.setTimeout(() => {
        const ll = lonLatAt(x, y)
        hold.current = null
        if (ll) openSheet({ kind: 'newActivity', destId: cityId, lon: ll[0], lat: ll[1] })
      }, HOLD_MS),
    }
  }
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const h = hold.current
    if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 8) {
      clearTimeout(h.t)
      hold.current = null
    }
  }
  const onPointerEnd = () => {
    clearTimeout(hold.current?.t)
    hold.current = null
  }
  const placingName =
    placing === 'new'
      ? 'a atividade nova'
      : placing
        ? (doc.places.find((p) => p.id === placing)?.name ?? '')
        : ''

  const [W, H] = adapter?.size() ?? [0, 0]
  return (
    <div
      className={`board ${adapter?.kind ?? 'paper'}${placing ? ' placing' : ''}`}
      ref={box}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="map-tiles" ref={tilesEl} />
      {adapter && target ? (
        <svg
          className="map-overlay"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="group"
          aria-label={cityId ? 'Lugares no mapa da cidade' : 'Destinos no mapa'}
        >
          {cityId ? (
            <CityOverlay adapter={adapter} tick={tick} settled={settled} destId={cityId} />
          ) : (
            <BoardOverlay adapter={adapter} tick={tick} settled={settled} />
          )}
        </svg>
      ) : null}
      {placing && cityId ? (
        <div
          className="map-hint"
          // A faixa fica dentro do mapa: o clique nela não é um clique no mapa.
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          Marque no mapa onde fica {placingName}.
          <button type="button" onClick={() => setPlacing(null)}>
            {placing === 'new' ? 'Não adicionar' : 'Cancelar'}
          </button>
        </div>
      ) : null}
      {adapter?.kind === 'tiles' ? (
        <a className="map-credit" href="https://openfreemap.org" target="_blank" rel="noreferrer">
          OpenFreeMap © OpenMapTiles · dados © OpenStreetMap
        </a>
      ) : null}
      {!target ? (
        <div className="note-box">
          <p className="note">
            O mapa aparece quando a viagem tem destinos com localização. Toque em "+ Adicionar destino" e
            escolha uma das sugestões da busca.
          </p>
        </div>
      ) : null}
    </div>
  )
}
