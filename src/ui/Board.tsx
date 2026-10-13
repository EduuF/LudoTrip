import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { geoContains, geoMercator, geoPath } from 'd3-geo'
import type { GeoPermissibleObjects } from 'd3-geo'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import world from 'world-atlas/countries-50m.json'
import { lodgingGaps, placeStates, timeline, tripPhase } from '../engine'
import type { ID } from '../engine'
import { todayISO, useApp } from '../app/store'
import { colorOf, sealOf } from './colors'
import { Travelers } from './kit'

// Tabuleiro gerado na hora para qualquer viagem (spec §17.2), no traço da v1:
// terra com contorno e sombra, mar com seigaiha, trilha pontilhada, fases numeradas e o grupo em pixel.

const W = 1000
/** Altura do desenho: acompanha a proporção do painel (o mapa ocupa quase metade da tela do celular). */
const H_DEFAULT = 720

let countriesCache: Feature<Geometry>[] | null = null
function countries(): Feature<Geometry>[] {
  if (!countriesCache) {
    const topo = world as unknown as Topology<{ countries: GeometryCollection }>
    countriesCache = (feature(topo, topo.objects.countries) as FeatureCollection<Geometry>).features
  }
  return countriesCache
}

function rng(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    return ((h >>> 0) % 10000) / 10000
  }
}

interface Node {
  destId: ID
  x: number
  y: number
  ox: number
  oy: number
  phases: number[]
  firstStop: ID
  dayTrip: boolean
  base?: ID
}

function relax(nodes: Node[], min: number, pad: number, H: number) {
  for (let k = 0; k < 140; k++) {
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!
        const b = nodes[j]!
        let dx = b.x - a.x
        let dy = b.y - a.y
        let d = Math.hypot(dx, dy)
        if (d < min) {
          if (d < 0.01) {
            dx = i % 2 ? 1 : -1
            dy = 0.5
            d = Math.hypot(dx, dy)
          }
          const push = (min - d) / 2
          dx /= d
          dy /= d
          a.x -= dx * push
          a.y -= dy * push
          b.x += dx * push
          b.y += dy * push
        }
      }
    for (const n of nodes) {
      n.x += (n.ox - n.x) * 0.02
      n.y += (n.oy - n.y) * 0.02
      n.x = Math.max(pad, Math.min(W - pad, n.x))
      n.y = Math.max(pad, Math.min(H - pad, n.y))
    }
  }
}

type Rect = { x: number; y: number; w: number; h: number }
function placeLabels(
  items: { x: number; y: number; w: number; h: number; gap: number }[],
  occ: Rect[],
  H: number,
) {
  const ov = (a: Rect, b: Rect) =>
    Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  return items.map(({ x, y, w, h, gap }) => {
    const cands: [number, number][] = [
      [x, y + gap + h / 2],
      [x, y - gap - h / 2],
      [x + gap + w / 2 + 4, y],
      [x - gap - w / 2 - 4, y],
      [x + w / 2, y + gap + h / 2],
      [x - w / 2, y + gap + h / 2],
    ]
    let best: [number, number, Rect] = [x, y + gap + h / 2, { x: x - w / 2, y: y + gap, w, h }]
    let bestS = Infinity
    for (const [cx, cy] of cands) {
      const r = { x: cx - w / 2, y: cy - h / 2, w, h }
      let s = occ.reduce((a, o) => a + ov(r, o), 0)
      if (r.x < 4 || r.y < 4 || r.x + r.w > W - 4 || r.y + r.h > H - 4) s += w * h
      if (s < bestS) {
        bestS = s
        best = [cx, cy, r]
      }
      if (s === 0) break
    }
    occ.push(best[2])
    return { cx: best[0], cy: best[1] }
  })
}

const f1 = (n: number) => n.toFixed(1)

function Deco({ kind, x, y }: { kind: string; x: number; y: number }) {
  const t = `translate(${f1(x)},${f1(y)})`
  switch (kind) {
    case 'mountain':
      return (
        <g transform={t}>
          <path
            d="M-26,0 L-6,-34 L4,-20 L12,-30 L30,0 Z"
            fill="var(--hill)"
            stroke="var(--land-edge)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M-6,-34 L4,-20 L-2,-22 L-8,-18 L-12,-24 Z"
            fill="var(--snow)"
            stroke="var(--land-edge)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </g>
      )
    case 'sakura':
      return (
        <g transform={t}>
          <rect x="-2" y="-6" width="4" height="10" fill="#7a4b3a" />
          <circle cx="-6" cy="-12" r="8" fill="var(--sakura)" stroke="var(--land-edge)" strokeWidth="1.5" />
          <circle cx="6" cy="-12" r="8" fill="var(--sakura)" stroke="var(--land-edge)" strokeWidth="1.5" />
          <circle cx="0" cy="-19" r="8" fill="#f3a9c0" stroke="var(--land-edge)" strokeWidth="1.5" />
        </g>
      )
    case 'torii':
      return (
        <g transform={t}>
          <rect
            x="-14"
            y="-26"
            width="28"
            height="4"
            rx="1"
            fill="#c4313a"
            stroke="var(--land-edge)"
            strokeWidth="1.2"
          />
          <rect x="-11" y="-20" width="22" height="3" fill="#c4313a" />
          <rect
            x="-9"
            y="-22"
            width="4"
            height="22"
            fill="#c4313a"
            stroke="var(--land-edge)"
            strokeWidth="1"
          />
          <rect
            x="5"
            y="-22"
            width="4"
            height="22"
            fill="#c4313a"
            stroke="var(--land-edge)"
            strokeWidth="1"
          />
        </g>
      )
    case 'palm':
      return (
        <g transform={t}>
          <path d="M0,0 Q3,-14 1,-26" stroke="#7a4b3a" strokeWidth="4" fill="none" />
          <path
            d="M1,-26 Q-14,-30 -20,-20 M1,-26 Q14,-32 20,-20 M1,-26 Q-4,-38 -12,-36 M1,-26 Q8,-38 14,-34"
            stroke="var(--hill-dark)"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      )
    default:
      return (
        <g transform={t}>
          <rect x="-2" y="-4" width="4" height="8" fill="#7a4b3a" />
          <path
            d="M-10,-2 L0,-24 L10,-2 Z"
            fill="var(--hill-dark)"
            stroke="var(--land-edge)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </g>
      )
  }
}

export function Board() {
  const doc = useApp((s) => s.doc)!
  const focusOn = useApp((s) => s.focusOn)
  const setOpenStop = useApp((s) => s.setOpenStop)
  const setCursorDay = useApp((s) => s.setCursorDay)
  const it = doc.itinerary

  // O desenho segue a proporção do painel, sem cortar nem esticar.
  const box = useRef<HTMLDivElement>(null)
  const [H, setH] = useState(H_DEFAULT)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width > 0 && height > 0) setH(Math.round(Math.max(520, Math.min(1400, (W * height) / width))))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const model = useMemo(() => {
    const destById = new Map(doc.destinations.map((d) => [d.id, d]))
    const located = (id: ID | null) => {
      const d = id ? destById.get(id) : undefined
      return d && d.lat !== undefined && d.lon !== undefined ? d : null
    }
    // Ordem das fases: cada cidade é um nó; repetir uma cidade soma números ao mesmo nó.
    const seq: ID[] = []
    const phases = new Map<ID, number[]>()
    const firstStop = new Map<ID, ID>()
    it.stops.forEach((s, i) => {
      if (!located(s.destinationId)) return
      const id = s.destinationId!
      phases.set(id, [...(phases.get(id) ?? []), i + 1])
      if (!firstStop.has(id)) firstStop.set(id, s.id)
      if (seq[seq.length - 1] !== id) seq.push(id)
    })
    // Bate-voltas: destinos sem noites com figurinha colada em algum dia.
    const states = placeStates(it, doc.places)
    const trips: { destId: ID; base: ID }[] = []
    for (const d of doc.destinations) {
      if (phases.has(d.id) || !located(d.id)) continue
      const placed = doc.places.find((p) => p.destinationId === d.id && states.get(p.id)?.days.length)
      if (!placed) continue
      const base = it.stops.find((s) =>
        s.days.some((day) => day.some((v) => v.placeId === placed.id)),
      )?.destinationId
      if (base && phases.has(base)) trips.push({ destId: d.id, base })
    }
    const ids = [...phases.keys(), ...trips.map((t) => t.destId)]
    if (!ids.length) return null

    const coords = ids.map((id) => [located(id)!.lon!, located(id)!.lat!] as [number, number])
    const lons = coords.map((c) => c[0])
    const lats = coords.map((c) => c[1])
    const cx = (Math.min(...lons) + Math.max(...lons)) / 2
    const cy = (Math.min(...lats) + Math.max(...lats)) / 2
    const spanX = Math.max(Math.max(...lons) - Math.min(...lons), 4)
    const spanY = Math.max(Math.max(...lats) - Math.min(...lats), 3)
    // Enquadra os cantos (MultiPoint não depende da orientação do polígono).
    const box = {
      type: 'MultiPoint',
      coordinates: [
        [cx - spanX / 2, cy - spanY / 2],
        [cx + spanX / 2, cy + spanY / 2],
        [cx - spanX / 2, cy + spanY / 2],
        [cx + spanX / 2, cy - spanY / 2],
      ],
    } as GeoPermissibleObjects
    const projection = geoMercator().fitExtent(
      [
        [110, 100],
        [W - 110, H - 100],
      ],
      box,
    )
    const path = geoPath(projection)
    const land = countries().filter((f) => {
      const [[x0, y0], [x1, y1]] = path.bounds(f)
      return x1 >= 0 && x0 <= W && y1 >= 0 && y0 <= H && Number.isFinite(x0)
    })

    const nodes: Node[] = ids.map((id) => {
      const [x, y] = projection([located(id)!.lon!, located(id)!.lat!])!
      const trip = trips.find((t) => t.destId === id)
      return {
        destId: id,
        x,
        y,
        ox: x,
        oy: y,
        phases: phases.get(id) ?? [],
        firstStop: firstStop.get(id) ?? '',
        dayTrip: !!trip,
        base: trip?.base,
      }
    })
    relax(nodes, 58, 40, H)
    const byId = new Map(nodes.map((n) => [n.destId, n]))

    // Trilha: curvas entre fases seguidas; ida e volta repetidas ganham curvaturas diferentes.
    let route = ''
    seq.forEach((id, i) => {
      const n = byId.get(id)!
      if (i === 0) {
        route = `M${f1(n.x)},${f1(n.y)}`
        return
      }
      const p = byId.get(seq[i - 1]!)!
      const mx = (p.x + n.x) / 2
      const my = (p.y + n.y) / 2
      const dx = n.x - p.x
      const dy = n.y - p.y
      const bend = (i % 2 ? 0.22 : -0.22) * 1
      route += ` Q${f1(mx - dy * bend)},${f1(my + dx * bend)} ${f1(n.x)},${f1(n.y)}`
    })

    // Casa: seta saindo do tabuleiro em direção a ela.
    let home: { x: number; y: number; name: string; ax: number; ay: number } | null = null
    const first = byId.get(seq[0] ?? '')
    if (it.home?.lat !== undefined && it.home.lon !== undefined && first) {
      const hp = projection([it.home.lon, it.home.lat])
      if (hp) {
        let [hx, hy] = hp
        const inside = hx > 30 && hx < W - 30 && hy > 30 && hy < H - 30
        if (!inside) {
          const dx = hx - first.x
          const dy = hy - first.y
          const t = Math.min(
            dx > 0 ? (W - 60 - first.x) / dx : dx < 0 ? (60 - first.x) / dx : Infinity,
            dy > 0 ? (H - 50 - first.y) / dy : dy < 0 ? (50 - first.y) / dy : Infinity,
          )
          hx = first.x + dx * t
          hy = first.y + dy * t
        }
        home = { x: hx, y: hy, name: it.home.name, ax: first.x, ay: first.y }
      }
    }

    // Rótulos em pílulas sem sobreposição (nem com o grupo em pixel, nem com a seta de casa).
    const occ: Rect[] = nodes.map((n) => ({ x: n.x - 22, y: n.y - 22, w: 44, h: 44 }))
    const phaseNow = tripPhase(it, todayISO())
    const spriteAt = byId.get((phaseNow.kind === 'during' ? phaseNow.destinationId : seq[0]) ?? '')
    if (spriteAt) occ.push({ x: spriteAt.x - 34, y: spriteAt.y - 66, w: 68, h: 46 })
    if (home)
      occ.push({
        x: home.x - (home.name.length * 9 + 40) / 2,
        y: home.y - 16,
        w: home.name.length * 9 + 40,
        h: 32,
      })
    const labels = placeLabels(
      nodes.map((n) => {
        const name = destById.get(n.destId)!.name
        return { x: n.x, y: n.y, w: name.length * 9.5 + 26, h: 30, gap: 24 }
      }),
      occ,
      H,
    )

    // Decoração semeada pela viagem, só em terra e longe das fases.
    const R = rng(doc.meta.id)
    const country = located(seq[0] ?? null)?.country
    const kinds =
      country === 'JP'
        ? ['sakura', 'torii', 'mountain', 'sakura', 'pine']
        : country === 'BR'
          ? ['palm', 'mountain', 'palm', 'pine']
          : ['pine', 'mountain', 'pine']
    const decos: { kind: string; x: number; y: number }[] = []
    for (let k = 0; k < 160 && decos.length < 10; k++) {
      const x = 40 + R() * (W - 80)
      const y = 60 + R() * (H - 100)
      if (occ.some((o) => x > o.x - 40 && x < o.x + o.w + 40 && y > o.y - 40 && y < o.y + o.h + 50)) continue
      if (decos.some((d) => Math.hypot(d.x - x, d.y - y) < 70)) continue
      const ll = projection.invert?.([x, y])
      if (!ll || !land.some((f) => geoContains(f, ll))) continue
      decos.push({ kind: kinds[Math.floor(R() * kinds.length)]!, x, y })
    }
    const clouds = [0, 1, 2].map(() => ({ x: 80 + R() * (W - 160), y: 40 + R() * (H - 120) }))

    return { land, path, nodes, labels, route, home, decos, clouds, byId, seq }
  }, [doc.destinations, doc.places, doc.meta.id, it, H])

  if (!model) {
    return (
      <div className="board" ref={box}>
        <div className="note-box">
          <p className="note">
            O mapa aparece quando a viagem tem destinos com localização. Toque em + Destino e escolha da
            lista.
          </p>
        </div>
      </div>
    )
  }

  // Fases prontas: hospedagem em todas as noites e imperdíveis com dia.
  const gaps = new Set(lodgingGaps(it, doc.bookings).map((g) => g.stopId))
  const states = placeStates(it, doc.places)
  const ready = (destId: ID) =>
    it.stops.filter((s) => s.destinationId === destId).every((s) => !gaps.has(s.id)) &&
    doc.places
      .filter((p) => p.destinationId === destId && p.rarity === 'must')
      .every((p) => states.get(p.id)?.days.length)

  const phase = tripPhase(it, todayISO())
  const hereId = phase.kind === 'during' ? phase.destinationId : model.seq[0]
  const here = hereId ? model.byId.get(hereId) : undefined
  const travelers = it.travelers.length || 1

  return (
    <div className="board" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mapa da viagem">
        <defs>
          <pattern id="seigaiha" width="40" height="20" patternUnits="userSpaceOnUse">
            <g fill="none" stroke="var(--sea-line)" strokeWidth="1.4">
              <circle cx="20" cy="20" r="18" />
              <circle cx="20" cy="20" r="12" />
              <circle cx="20" cy="20" r="6" />
              <circle cx="0" cy="10" r="18" />
              <circle cx="0" cy="10" r="12" />
              <circle cx="0" cy="10" r="6" />
              <circle cx="40" cy="10" r="18" />
              <circle cx="40" cy="10" r="12" />
              <circle cx="40" cy="10" r="6" />
            </g>
          </pattern>
        </defs>
        <rect width={W} height={H} fill="var(--sea)" />
        <rect width={W} height={H} fill="url(#seigaiha)" />
        {model.clouds.map((c, i) => (
          <g key={i} className="cloud" style={{ animationDelay: `-${i * 13}s` }}>
            <path
              transform={`translate(${f1(c.x)},${f1(c.y)}) scale(0.9)`}
              d="M-40,8 Q-44,-8 -26,-10 Q-22,-26 -4,-22 Q6,-34 22,-22 Q40,-24 40,-6 Q52,0 42,10 Z"
              fill="#ffffff"
              opacity="0.85"
              stroke="#c9c2d6"
              strokeWidth="2"
            />
          </g>
        ))}
        <g transform="translate(0,7)" opacity="0.16">
          {model.land.map((f, i) => (
            <path key={i} d={model.path(f) ?? ''} fill="var(--ink)" />
          ))}
        </g>
        <g>
          {model.land.map((f, i) => (
            <path
              key={i}
              d={model.path(f) ?? ''}
              fill="var(--land)"
              stroke="var(--land-edge)"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
          ))}
        </g>
        {model.decos.map((d, i) => (
          <Deco key={i} {...d} />
        ))}
        {model.home ? (
          <g>
            <line
              x1={model.home.ax}
              y1={model.home.ay}
              x2={model.home.x}
              y2={model.home.y}
              stroke="var(--ai)"
              strokeWidth="3"
              strokeDasharray="2 10"
              strokeLinecap="round"
            />
            <g transform={`translate(${f1(model.home.x)},${f1(model.home.y)})`}>
              <rect
                x={-(model.home.name.length * 9 + 40) / 2}
                y="-16"
                width={model.home.name.length * 9 + 40}
                height="32"
                rx="16"
                fill="var(--ai)"
              />
              <text textAnchor="middle" y="6" fill="#fff" style={{ font: '700 15px var(--f-body)' }}>
                ✈ {model.home.name}
              </text>
            </g>
          </g>
        ) : null}
        <path
          d={model.route}
          fill="none"
          stroke="#e9d8b4"
          strokeWidth="16"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />
        <path
          d={model.route}
          fill="none"
          stroke="var(--beni)"
          strokeWidth="5"
          strokeDasharray="1 12"
          strokeLinecap="round"
        />
        {model.nodes
          .filter((n) => n.dayTrip && n.base)
          .map((n) => {
            const b = model.byId.get(n.base!)!
            return (
              <line
                key={`t-${n.destId}`}
                x1={b.x}
                y1={b.y}
                x2={n.x}
                y2={n.y}
                stroke="var(--ink-soft)"
                strokeWidth="2.5"
                strokeDasharray="2 7"
                strokeLinecap="round"
              />
            )
          })}
        {model.nodes.map((n, i) => {
          const d = doc.destinations.find((x) => x.id === n.destId)!
          const lab = model.labels[i]!
          const w = d.name.length * 9.5 + 26
          const done = !n.dayTrip && ready(n.destId)
          const color = colorOf(doc.destinations, n.destId)
          const go = () => {
            if (!n.firstStop) return
            const seg = timeline(it).segments.find((s) => s.kind === 'stop' && s.id === n.firstStop)
            if (seg) setCursorDay(seg.startIndex)
            setOpenStop(n.firstStop)
            focusOn(`c-${n.firstStop}`, 'mapa')
          }
          return (
            <g
              key={n.destId}
              className="node"
              onClick={go}
              role="button"
              aria-label={`${d.name}: abrir no roteiro`}
            >
              <g transform={`translate(${f1(lab.cx)},${f1(lab.cy)})`}>
                <rect
                  x={-w / 2}
                  y="-15"
                  width={w}
                  height="30"
                  rx="15"
                  fill="var(--paper)"
                  stroke="var(--ink)"
                  strokeWidth="2"
                />
                <text textAnchor="middle" y="5.5" fill="var(--ink)" className="pillbox">
                  {d.name}
                </text>
              </g>
              {n.dayTrip ? (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r="11"
                  fill="var(--paper)"
                  stroke="var(--ink)"
                  strokeWidth="2.5"
                  strokeDasharray="4 3"
                />
              ) : done ? (
                <path
                  transform={`translate(${f1(n.x)},${f1(n.y)})`}
                  d="M0,-24 L6,-8 L23,-8 L9,2 L14,19 L0,9 L-14,19 L-9,2 L-23,-8 L-6,-8 Z"
                  fill="var(--gold)"
                  stroke="var(--ink)"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
              ) : (
                <>
                  <circle cx={n.x} cy={n.y + 3} r="20" fill="var(--ink)" opacity="0.25" />
                  <circle cx={n.x} cy={n.y} r="20" fill={color} stroke="var(--ink)" strokeWidth="3" />
                </>
              )}
              {!n.dayTrip ? (
                <text
                  x={n.x}
                  y={n.y + 6}
                  textAnchor="middle"
                  fill={done ? 'var(--ink)' : '#fff'}
                  style={{ font: '17px var(--f-pixel)' }}
                >
                  {n.phases.length > 2 ? `${n.phases[0]}+` : n.phases.join('·') || sealOf(d)}
                </text>
              ) : null}
            </g>
          )
        })}
        {here ? (
          <g transform={`translate(${f1(here.x)},${f1(here.y - 26)})`}>
            <g className="bob">
              <svg
                x={-(Math.min(travelers, 4) * 6 * 3.2) / 2 - (travelers >= 5 ? 10 : 0)}
                y={-34}
                width={travelers >= 5 ? 58 : Math.min(travelers, 4) * 6 * 3.2}
                height={travelers >= 5 ? 26 : 29}
                overflow="visible"
              >
                <Travelers count={travelers} px={3.2} />
              </svg>
            </g>
          </g>
        ) : null}
      </svg>
    </div>
  )
}
