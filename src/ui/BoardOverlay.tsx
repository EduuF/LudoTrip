import { useMemo, useRef } from 'react'
import { geoContains } from 'd3-geo'
import { lodgingGaps, placeStates, tripPhase } from '../engine'
import type { ID } from '../engine'
import { todayISO, useApp } from '../app/store'
import type { MapAdapter } from '../map/adapter'
import { frame, framePoints, levelOf } from '../map/frame'
import type { BBox } from '../map/frame'
import { colorOf, sealOf } from './colors'
import { Travelers } from './kit'
import { countries, decoKinds, f1, placeLabels, relax, rng } from './mapBits'
import type { DecoKind, Rect } from './mapBits'
import { Cloud, Deco } from './MapDeco'

// A camada da viagem sobre o mapa (spec §17.2), no traço da v1: trilha pontilhada sobre areia,
// fases numeradas (estrela quando o destino está pronto), pílulas sem sobreposição, decoração em
// pixel art semeada pela viagem, seta para casa e o grupo em pixel. Posições vêm do adaptador.

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

interface Props {
  adapter: MapAdapter
  /** Muda a cada movimento do mapa (redesenha). */
  tick: number
  /** O mapa parou: pode reescolher lados dos rótulos e semear decoração. */
  settled: boolean
}

export function BoardOverlay({ adapter, tick, settled }: Props) {
  const doc = useApp((s) => s.doc)!
  const enterCity = useApp((s) => s.enterCity)
  const it = doc.itinerary
  const [W, H] = adapter.size()
  const labelCand = useRef(new Map<ID, number>())
  const decoCache = useRef<{ key: string; list: { kind: DecoKind; lon: number; lat: number }[] } | null>(null)

  const model = useMemo(() => {
    void tick
    const destById = new Map(doc.destinations.map((d) => [d.id, d]))
    const pts = framePoints(doc)
    if (!pts.length) return null

    // Fases: cada destino com noites é um nó; repetir um destino soma números ao mesmo nó.
    const phases = new Map<ID, number[]>()
    const firstStop = new Map<ID, ID>()
    const seq: ID[] = []
    it.stops.forEach((s, i) => {
      const id = s.destinationId
      if (!id || !pts.some((p) => p.destId === id)) return
      phases.set(id, [...(phases.get(id) ?? []), i + 1])
      if (!firstStop.has(id)) firstStop.set(id, s.id)
      if (seq[seq.length - 1] !== id) seq.push(id)
    })
    // Bate-volta: ligado à parada onde a figurinha está colada.
    const states = placeStates(it, doc.places)
    const baseOf = (destId: ID): ID | undefined => {
      const placed = doc.places.find((p) => p.destinationId === destId && states.get(p.id)?.days.length)
      const base =
        placed &&
        it.stops.find((s) => s.days.some((day) => day.some((v) => v.placeId === placed.id)))?.destinationId
      return base && phases.has(base) ? base : undefined
    }

    const nodes: Node[] = []
    for (const p of pts) {
      const xy = adapter.project([p.lon, p.lat])
      if (!xy) continue
      nodes.push({
        destId: p.destId,
        x: xy[0],
        y: xy[1],
        ox: xy[0],
        oy: xy[1],
        phases: phases.get(p.destId) ?? [],
        firstStop: firstStop.get(p.destId) ?? '',
        dayTrip: p.dayTrip,
        base: p.dayTrip ? baseOf(p.destId) : undefined,
      })
    }
    relax(nodes, 36, 22, W, H)
    const byId = new Map(nodes.map((n) => [n.destId, n]))

    // Trilha: curvas entre fases seguidas; idas e voltas repetidas ganham curvaturas diferentes.
    let route = ''
    seq.forEach((id, i) => {
      const n = byId.get(id)
      if (!n) return
      if (!route) {
        route = `M${f1(n.x)},${f1(n.y)}`
        return
      }
      const p = byId.get(seq[i - 1]!)
      if (!p) return
      const mx = (p.x + n.x) / 2
      const my = (p.y + n.y) / 2
      const dx = n.x - p.x
      const dy = n.y - p.y
      const bend = i % 2 ? 0.22 : -0.22
      route += ` Q${f1(mx - dy * bend)},${f1(my + dx * bend)} ${f1(n.x)},${f1(n.y)}`
    })

    // Casa: seta saindo do mapa na direção dela (nunca entra no enquadramento).
    let home: { x: number; y: number; name: string; ax: number; ay: number; w: number } | null = null
    const first = byId.get(seq[0] ?? '')
    if (it.home?.lat !== undefined && it.home.lon !== undefined && first) {
      const hp = adapter.project([it.home.lon, it.home.lat])
      if (hp) {
        let [hx, hy] = hp
        const inside = hx > 24 && hx < W - 24 && hy > 24 && hy < H - 24
        if (!inside) {
          const dx = hx - first.x
          const dy = hy - first.y
          const t = Math.min(
            dx > 0 ? (W - 52 - first.x) / dx : dx < 0 ? (52 - first.x) / dx : Infinity,
            dy > 0 ? (H - 40 - first.y) / dy : dy < 0 ? (40 - first.y) / dy : Infinity,
          )
          hx = first.x + dx * t
          hy = first.y + dy * t
        }
        home = { x: hx, y: hy, name: it.home.name, ax: first.x, ay: first.y, w: it.home.name.length * 7 + 34 }
      }
    }

    // Rótulos em pílulas sem sobreposição (nem com o grupo em pixel, nem com a seta de casa).
    const occ: Rect[] = nodes.map((n) => ({ x: n.x - 15, y: n.y - 15, w: 30, h: 30 }))
    const phaseNow = tripPhase(it, todayISO())
    const hereId = (phaseNow.kind === 'during' ? phaseNow.destinationId : seq[0]) ?? null
    const spriteAt = hereId ? byId.get(hereId) : undefined
    if (spriteAt) occ.push({ x: spriteAt.x - 24, y: spriteAt.y - 48, w: 48, h: 32 })
    if (home) occ.push({ x: home.x - home.w / 2, y: home.y - 12, w: home.w, h: 24 })
    const fixed = settled ? undefined : nodes.map((n) => labelCand.current.get(n.destId))
    const labels = placeLabels(
      nodes.map((n) => {
        const name = destById.get(n.destId)?.name ?? ''
        return { x: n.x, y: n.y, w: name.length * 7 + 20, h: 22, gap: 17 }
      }),
      occ,
      W,
      H,
      fixed,
    )
    if (settled) labels.forEach((l, i) => labelCand.current.set(nodes[i]!.destId, l.cand))

    // Decoração semeada pela viagem, em coordenadas (anda junto com o mapa), só em terra e longe das fases.
    const fr = frame(doc)
    const level = fr ? levelOf(fr.bbox) : 'world'
    const country = doc.scope?.country ?? destById.get(seq[0] ?? '')?.country
    const key = `${doc.meta.id}:${level}:${fr?.bbox.map((v) => v.toFixed(2)).join(',')}`
    if (settled && fr && level !== 'city' && decoCache.current?.key !== key) {
      const R = rng(key)
      const kinds = decoKinds(country)
      const land = countries()
      const [w0, s0, e0, n0] = fr.bbox as BBox
      const list: { kind: DecoKind; lon: number; lat: number }[] = []
      const want = level === 'region' ? 7 : 10
      for (let k = 0; k < 220 && list.length < want; k++) {
        const lon = w0 + R() * (e0 - w0)
        const lat = s0 + R() * (n0 - s0)
        const xy = adapter.project([lon, lat])
        if (!xy) continue
        if (
          occ.some(
            (o) => xy[0] > o.x - 30 && xy[0] < o.x + o.w + 30 && xy[1] > o.y - 30 && xy[1] < o.y + o.h + 36,
          )
        )
          continue
        if (
          list.some((d) => {
            const q = adapter.project([d.lon, d.lat])
            return !!q && Math.hypot(q[0] - xy[0], q[1] - xy[1]) < 54
          })
        )
          continue
        if (!land.some((f) => geoContains(f, [lon, lat]))) continue
        list.push({ kind: kinds[Math.floor(R() * kinds.length)]!, lon, lat })
      }
      decoCache.current = { key, list }
    }
    const decos = (level === 'city' ? [] : (decoCache.current?.list ?? []))
      .map((d) => ({ kind: d.kind, xy: adapter.project([d.lon, d.lat]) }))
      .filter((d): d is { kind: DecoKind; xy: [number, number] } => !!d.xy)
      .map((d) => ({ kind: d.kind, x: d.xy[0], y: d.xy[1] }))

    const Rc = rng(`${doc.meta.id}:clouds`)
    const clouds = [0, 1, 2].map(() => ({ x: 40 + Rc() * (W - 80), y: 20 + Rc() * (H - 60) }))

    // Contornos só no papel (nos tiles a terra já está lá).
    const path = adapter.geoPath?.()
    const land = path
      ? countries().filter((f) => {
          const [[x0, y0], [x1, y1]] = path.bounds(f)
          return x1 >= 0 && x0 <= W && y1 >= 0 && y0 <= H && Number.isFinite(x0)
        })
      : []

    return { nodes, byId, seq, route, home, labels, decos, clouds, spriteAt, path, land, destById }
  }, [doc, it, adapter, tick, settled, W, H])

  if (!model) return null

  // Fases prontas: hospedagem em todas as noites e imperdíveis com dia.
  const gaps = new Set(lodgingGaps(it, doc.bookings).map((g) => g.stopId))
  const states = placeStates(it, doc.places)
  const ready = (destId: ID) =>
    it.stops.filter((s) => s.destinationId === destId).every((s) => !gaps.has(s.id)) &&
    doc.places
      .filter((p) => p.destinationId === destId && p.rarity === 'must')
      .every((p) => states.get(p.id)?.days.length)
  const travelers = it.travelers.length || 1

  return (
    <g>
      {model.path ? (
        <>
          <g transform="translate(0,5)" opacity="0.16">
            {model.land.map((f, i) => (
              <path key={i} d={model.path!(f) ?? ''} fill="var(--ink)" />
            ))}
          </g>
          <g>
            {model.land.map((f, i) => (
              <path
                key={i}
                d={model.path!(f) ?? ''}
                fill="var(--land)"
                stroke="var(--land-edge)"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            ))}
          </g>
        </>
      ) : null}
      {model.clouds.map((c, i) => (
        <Cloud key={i} x={c.x} y={c.y} s={0.6} delay={i * 13} />
      ))}
      {model.decos.map((d, i) => (
        <Deco key={i} kind={d.kind} x={d.x} y={d.y} s={0.72} />
      ))}
      {model.home ? (
        <g>
          <line
            x1={model.home.ax}
            y1={model.home.ay}
            x2={model.home.x}
            y2={model.home.y}
            stroke="var(--ai)"
            strokeWidth="2.2"
            strokeDasharray="2 8"
            strokeLinecap="round"
          />
          <g transform={`translate(${f1(model.home.x)},${f1(model.home.y)})`}>
            <rect x={-model.home.w / 2} y="-12" width={model.home.w} height="24" rx="12" fill="var(--ai)" />
            <text textAnchor="middle" y="4.5" fill="#fff" style={{ font: '700 12px var(--f-body)' }}>
              ✈ {model.home.name}
            </text>
          </g>
        </g>
      ) : null}
      <path
        d={model.route}
        fill="none"
        stroke="#e9d8b4"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      <path
        d={model.route}
        fill="none"
        stroke="var(--beni)"
        strokeWidth="3.6"
        strokeDasharray="1 8"
        strokeLinecap="round"
      />
      {model.nodes
        .filter((n) => n.dayTrip && n.base)
        .map((n) => {
          const b = model.byId.get(n.base!)
          if (!b) return null
          return (
            <line
              key={`t-${n.destId}`}
              x1={b.x}
              y1={b.y}
              x2={n.x}
              y2={n.y}
              stroke="var(--ink-soft)"
              strokeWidth="2"
              strokeDasharray="2 5"
              strokeLinecap="round"
            />
          )
        })}
      {model.nodes.map((n, i) => {
        const d = model.destById.get(n.destId)
        if (!d) return null
        const lab = model.labels[i]!
        const w = d.name.length * 7 + 20
        const done = !n.dayTrip && ready(n.destId)
        const color = colorOf(doc.destinations, n.destId)
        return (
          <g
            key={n.destId}
            className="node"
            onClick={() => enterCity(n.destId)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && enterCity(n.destId)}
            aria-label={`${d.name}: entrar no mapa da cidade`}
          >
            <g transform={`translate(${f1(lab.cx)},${f1(lab.cy)})`}>
              <rect
                x={-w / 2}
                y="-11"
                width={w}
                height="22"
                rx="11"
                fill="var(--paper)"
                stroke="var(--ink)"
                strokeWidth="1.6"
              />
              <text textAnchor="middle" y="4" fill="var(--ink)" className="pillbox">
                {d.name}
              </text>
            </g>
            {n.dayTrip ? (
              <circle
                cx={n.x}
                cy={n.y}
                r="8"
                fill="var(--paper)"
                stroke="var(--ink)"
                strokeWidth="2"
                strokeDasharray="3 2"
              />
            ) : done ? (
              <path
                transform={`translate(${f1(n.x)},${f1(n.y)}) scale(0.7)`}
                d="M0,-24 L6,-8 L23,-8 L9,2 L14,19 L0,9 L-14,19 L-9,2 L-23,-8 L-6,-8 Z"
                fill="var(--gold)"
                stroke="var(--ink)"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
            ) : (
              <>
                <circle cx={n.x} cy={n.y + 2} r="14" fill="var(--ink)" opacity="0.25" />
                <circle cx={n.x} cy={n.y} r="14" fill={color} stroke="var(--ink)" strokeWidth="2.2" />
              </>
            )}
            {!n.dayTrip ? (
              <text
                x={n.x}
                y={n.y + 4.5}
                textAnchor="middle"
                fill={done ? 'var(--ink)' : '#fff'}
                style={{ font: '12.5px var(--f-pixel)' }}
              >
                {n.phases.length > 2 ? `${n.phases[0]}+` : n.phases.join('·') || sealOf(d)}
              </text>
            ) : null}
          </g>
        )
      })}
      {model.spriteAt ? (
        <g
          transform={`translate(${f1(model.spriteAt.x)},${f1(model.spriteAt.y - 18)})`}
          className="travelers"
        >
          <g className="bob">
            <svg
              x={-(Math.min(travelers, 4) * 6 * 2.4) / 2 - (travelers >= 5 ? 8 : 0)}
              y={-24}
              width={travelers >= 5 ? 44 : Math.min(travelers, 4) * 6 * 2.4}
              height={travelers >= 5 ? 20 : 22}
              overflow="visible"
            >
              <Travelers count={travelers} px={2.4} />
            </svg>
          </g>
        </g>
      ) : null}
    </g>
  )
}
