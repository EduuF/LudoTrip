import { geoMercator, geoPath } from 'd3-geo'
import type { GeoPermissibleObjects } from 'd3-geo'
import { easeInOut, reducedMotion } from './adapter'
import type { LonLat, MapAdapter, MovePhase } from './adapter'
import type { BBox } from './frame'

// Adaptador "papel": projeção Mercator do d3 enquadrada na área do mapa. Funciona sem rede e sem WebGL,
// é o primeiro desenho (antes dos tiles chegarem) e o dublê dos testes.

const corners = (b: BBox): GeoPermissibleObjects =>
  ({
    type: 'MultiPoint',
    coordinates: [
      [b[0], b[1]],
      [b[2], b[3]],
      [b[0], b[3]],
      [b[2], b[1]],
    ],
  }) as GeoPermissibleObjects

export function paperAdapter(el: HTMLElement): MapAdapter {
  const proj = geoMercator()
  const subs = new Set<(p: MovePhase) => void>()
  let size: [number, number] = measure()
  let last: { bbox: BBox; padding: number } | null = null
  let raf = 0

  function measure(): [number, number] {
    const r = el.getBoundingClientRect()
    return [Math.max(1, r.width), Math.max(1, r.height)]
  }
  const emit = (p: MovePhase) => subs.forEach((cb) => cb(p))
  const target = (bbox: BBox, padding: number) => {
    const p = geoMercator().fitExtent(
      [
        [padding, padding],
        [size[0] - padding, size[1] - padding],
      ],
      corners(bbox),
    )
    return { k: p.scale(), t: p.translate() }
  }

  return {
    kind: 'paper',
    project(ll: LonLat) {
      const p = proj(ll)
      return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? [p[0], p[1]] : null
    },
    unproject(xy) {
      const ll = proj.invert?.(xy)
      return ll ? [ll[0], ll[1]] : null
    },
    fit(bbox, { padding = 24, animate = false } = {}) {
      const first = !last
      last = { bbox, padding }
      const to = target(bbox, padding)
      cancelAnimationFrame(raf)
      if (first || !animate || reducedMotion()) {
        proj.scale(to.k).translate(to.t)
        emit('end')
        return
      }
      const from = { k: proj.scale(), t: proj.translate() }
      const t0 = performance.now()
      const dur = 700
      const step = (now: number) => {
        const u = Math.min(1, (now - t0) / dur)
        const e = easeInOut(u)
        proj
          .scale(Math.exp(Math.log(from.k) + (Math.log(to.k) - Math.log(from.k)) * e))
          .translate([from.t[0] + (to.t[0] - from.t[0]) * e, from.t[1] + (to.t[1] - from.t[1]) * e])
        emit(u < 1 ? 'move' : 'end')
        if (u < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    },
    onMove(cb) {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    size: () => size,
    resize() {
      size = measure()
      if (last) {
        const to = target(last.bbox, last.padding)
        proj.scale(to.k).translate(to.t)
        emit('end')
      }
    },
    destroy() {
      cancelAnimationFrame(raf)
      subs.clear()
    },
    geoPath: () => geoPath(proj),
  }
}
