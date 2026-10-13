import { reducedMotion } from './adapter'
import type { LonLat, MapAdapter, MovePhase } from './adapter'
import type { BBox } from './frame'
import { seigaihaImage, TILES_URL, washiStyle } from './style/washi'
import type { Theme } from './style/washi'

// Adaptador "tiles": MapLibre GL com o estilo washi sobre os tiles do OpenFreeMap. Carregado sob demanda;
// devolve null quando não há WebGL ou rede (aí o papel continua).

function webglOk(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

async function reachable(url: string, ms = 4000): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'force-cache' })
    return r.ok
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

export async function tilesAdapter(el: HTMLElement, theme: Theme): Promise<MapAdapter | null> {
  if (!webglOk()) return null
  if (!(await reachable(TILES_URL))) return null
  const [maplibregl, { default: workerUrl }] = await Promise.all([
    import('maplibre-gl'),
    // O worker vem como arquivo próprio (o Vite empacota com as dependências dele).
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
    import('maplibre-gl/dist/maplibre-gl.css'),
  ])
  if (workerUrl) maplibregl.setWorkerUrl(workerUrl)
  const map = new maplibregl.Map({
    container: el,
    style: washiStyle(theme),
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxPitch: 0,
    renderWorldCopies: false,
    fadeDuration: 200,
  })
  map.touchZoomRotate.disableRotation()
  // O crédito (OpenFreeMap © OpenMapTiles, dados © OpenStreetMap) é desenhado pelo MapCanvas.
  map.on('styleimagemissing', (e: { id: string }) => {
    if (e.id !== 'seigaiha' || map.hasImage('seigaiha')) return
    const img = seigaihaImage(theme)
    if (img) map.addImage('seigaiha', img, { pixelRatio: 2 })
  })
  await new Promise<void>((resolve) => (map.loaded() ? resolve() : map.once('load', () => resolve())))

  const subs = new Set<(p: MovePhase) => void>()
  const onMove = () => subs.forEach((cb) => cb('move'))
  const onEnd = () => subs.forEach((cb) => cb('end'))
  map.on('move', onMove)
  map.on('moveend', onEnd)

  return {
    kind: 'tiles',
    project(ll: LonLat) {
      const p = map.project(ll)
      return [p.x, p.y]
    },
    unproject(xy) {
      const ll = map.unproject(xy)
      return [ll.lng, ll.lat]
    },
    fit(bbox: BBox, { padding = 24, animate = false } = {}) {
      map.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        { padding, duration: animate && !reducedMotion() ? 900 : 0, essential: true },
      )
    },
    onMove(cb) {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    size() {
      const c = map.getContainer()
      return [c.clientWidth, c.clientHeight]
    },
    resize() {
      map.resize()
    },
    destroy() {
      subs.clear()
      map.remove()
    },
  }
}
