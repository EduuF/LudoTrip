import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { geoContains } from 'd3-geo'
import { lodgingGaps, placeStates, tripPhase } from '../engine'
import type { ID } from '../engine'
import { todayISO, useApp } from '../app/store'
import { fillOpenChoice } from '../app/choices'
import { openCenters, tripArea } from '../app/area'
import type { MapAdapter } from '../map/adapter'
import { easeInOut, reducedMotion } from '../map/adapter'
import { frame, framePoints, levelOf } from '../map/frame'
import type { BBox } from '../map/frame'
import { travelersAt } from '../map/route'
import { colorOf, sealOf } from './colors'
import { Travelers } from './kit'
import { travelersSize } from './stage/cast'
import { countries, decoKinds, f1, placeLabels, relax, rng } from './mapBits'
import type { DecoKind, Rect } from './mapBits'
import { Cloud, Deco } from './MapDeco'
import { useCanEdit } from './useCanEdit'

// A camada da viagem sobre o mapa (spec §17.2), no traço da v1: trilha pontilhada sobre areia com a
// parte já percorrida em vermelho, fases numeradas (estrela quando o destino está pronto), pílulas sem
// sobreposição, decoração em pixel art semeada pela viagem, seta para casa e o grupo em pixel, que anda
// pela trilha quando o dia escolhido muda. Posições vêm do adaptador.

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

/** Comprimento aproximado de uma curva quadrática (como na v1). */
function qLen(a: [number, number], c: [number, number], b: [number, number]): number {
  let L = 0
  let px = a[0]
  let py = a[1]
  for (let i = 1; i <= 24; i++) {
    const t = i / 24
    const u = 1 - t
    const x = u * u * a[0] + 2 * u * t * c[0] + t * t * b[0]
    const y = u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]
    L += Math.hypot(x - px, y - py)
    px = x
    py = y
  }
  return L
}

export function BoardOverlay({ adapter, tick, settled }: Props) {
  const doc = useApp((s) => s.doc)!
  const enterCity = useApp((s) => s.enterCity)
  const cursor = useApp((s) => s.cursorDay)
  const it = doc.itinerary
  const [W, H] = adapter.size()
  const labelCand = useRef(new Map<ID, number>())
  const decoCache = useRef<{ key: string; list: { kind: DecoKind; lon: number; lat: number }[] } | null>(null)

  const phase = tripPhase(it, todayISO())
  const dayIndex = cursor ?? (phase.kind === 'during' ? phase.day - 1 : 0)

  const model = useMemo(() => {
    void tick
    const destById = new Map(doc.destinations.map((d) => [d.id, d]))
    const pts = framePoints(doc)
    if (!pts.length) return null

    // Fases: cada destino com noites é um nó; repetir um destino soma números ao mesmo nó.
    const phases = new Map<ID, number[]>()
    const firstStop = new Map<ID, ID>()
    const seq: ID[] = []
    const stopSeq = new Map<ID, number>()
    it.stops.forEach((s, i) => {
      const id = s.destinationId
      if (!id || !pts.some((p) => p.destId === id)) return
      phases.set(id, [...(phases.get(id) ?? []), i + 1])
      if (!firstStop.has(id)) firstStop.set(id, s.id)
      if (seq[seq.length - 1] !== id) seq.push(id)
      stopSeq.set(s.id, seq.length - 1)
    })
    // Bate-volta: ligado à parada onde a atividade está marcada.
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

    // Trilha: curvas entre fases seguidas (idas e voltas repetidas ganham curvaturas diferentes),
    // com o comprimento acumulado em cada fase para o grupo andar por ela.
    let route = ''
    const seqLen: number[] = []
    let total = 0
    seq.forEach((id, i) => {
      const n = byId.get(id)
      if (!n) {
        seqLen.push(total)
        return
      }
      if (!route) {
        route = `M${f1(n.x)},${f1(n.y)}`
        seqLen.push(0)
        return
      }
      const p = byId.get(seq[i - 1]!)
      if (!p) {
        seqLen.push(total)
        return
      }
      const mx = (p.x + n.x) / 2
      const my = (p.y + n.y) / 2
      const dx = n.x - p.x
      const dy = n.y - p.y
      const bend = i % 2 ? 0.22 : -0.22
      const c: [number, number] = [mx - dy * bend, my + dx * bend]
      route += ` Q${f1(c[0])},${f1(c[1])} ${f1(n.x)},${f1(n.y)}`
      total += qLen([p.x, p.y], c, [n.x, n.y])
      seqLen.push(total)
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
    const pos = travelersAt(doc, dayIndex)
    const spriteAt = pos?.kind === 'at' ? byId.get(pos.destId) : undefined
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
    const country = tripArea(doc).mainCountry
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

    return {
      nodes,
      byId,
      seq,
      stopSeq,
      seqLen,
      total,
      route,
      home,
      labels,
      decos,
      clouds,
      path,
      land,
      destById,
    }
  }, [doc, it, adapter, tick, settled, W, H, dayIndex])

  // ---------------------------------------------------------------------------
  // O grupo anda pela trilha quando o dia escolhido muda (fração do caminho; sobrevive ao zoom).
  // ---------------------------------------------------------------------------
  const target = useMemo(() => {
    if (!model) return null
    const pos = travelersAt(doc, dayIndex)
    if (!pos) return null
    const fracAt = (stopId: ID) => {
      const i = model.stopSeq.get(stopId)
      return i === undefined ? null : model.total > 0 ? model.seqLen[i]! / model.total : 0
    }
    if (pos.kind === 'at') {
      const f = fracAt(pos.stopId)
      if (f !== null) return { frac: f }
      const n = model.byId.get(pos.destId)
      return n ? { xy: [n.x, n.y] as [number, number] } : null
    }
    if (pos.to === 'home' && pos.from !== 'home') {
      const i = model.stopSeq.get(pos.from)
      const n = i !== undefined ? model.byId.get(model.seq[i]!) : undefined
      if (!n) return null
      const h = model.home ?? { x: n.x, y: n.y }
      return { frac: 1, xy: [n.x + (h.x - n.x) * pos.t, n.y + (h.y - n.y) * pos.t] as [number, number] }
    }
    if (pos.from === 'home' || pos.to === 'home') return null
    const a = fracAt(pos.from)
    const b = fracAt(pos.to)
    if (a === null || b === null) return null
    return { frac: a + (b - a) * pos.t }
  }, [model, doc, dayIndex])

  const pathRef = useRef<SVGPathElement>(null)
  const maskRef = useRef<SVGPathElement>(null)
  const spriteRef = useRef<SVGGElement>(null)
  const state = useRef<{ frac: number; xy: [number, number] | null }>({ frac: 0, xy: null })
  const anim = useRef(0)
  const [heart, setHeart] = useState(0)

  const place = (frac: number, xy: [number, number] | null) => {
    const p = pathRef.current
    const total = p?.getTotalLength?.() ?? 0
    let x: number
    let y: number
    if (xy) [x, y] = xy
    else if (p && total > 0) {
      const pt = p.getPointAtLength(Math.max(0, Math.min(total, frac * total)))
      x = pt.x
      y = pt.y
    } else return
    spriteRef.current?.setAttribute('transform', `translate(${f1(x)},${f1(y - 18)})`)
    if (maskRef.current) maskRef.current.style.strokeDasharray = `${frac * total} ${total + 40}`
  }

  // Mapa mexeu ou redesenhou: recoloca o grupo na mesma fração do caminho.
  useLayoutEffect(() => {
    place(state.current.frac, state.current.xy)
  })

  // Dia mudou: anda até lá (0,45 s a 2,4 s, conforme a distância), com coraçãozinho ao chegar.
  useEffect(() => {
    if (!target) return
    cancelAnimationFrame(anim.current)
    const from = state.current.frac
    const toFrac = target.frac ?? from
    const toXY = target.xy ?? null
    const dist = Math.abs(toFrac - from)
    if (reducedMotion() || (dist < 0.001 && !toXY && !state.current.xy)) {
      state.current = { frac: toFrac, xy: toXY }
      place(toFrac, toXY)
      return
    }
    const fromXY = state.current.xy
    const dur = Math.min(2400, 450 + dist * 4000)
    const t0 = performance.now()
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / dur)
      const e = easeInOut(u)
      const frac = from + (toFrac - from) * e
      let xy: [number, number] | null = null
      if (toXY || fromXY) {
        const p = pathRef.current
        const total = p?.getTotalLength?.() ?? 0
        const at = (fr: number, over: [number, number] | null): [number, number] | null => {
          if (over) return over
          if (!p || !total) return null
          const pt = p.getPointAtLength(Math.max(0, Math.min(total, fr * total)))
          return [pt.x, pt.y]
        }
        const a = at(from, fromXY)
        const b = at(toFrac, toXY)
        if (a && b) xy = [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e]
      }
      state.current = { frac, xy: u < 1 ? xy : toXY }
      place(frac, xy)
      if (u < 1) anim.current = requestAnimationFrame(step)
      else if (dist > 0.001 || toXY) setHeart((h) => h + 1)
    }
    anim.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(anim.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.frac, target?.xy?.[0], target?.xy?.[1]])

  if (!model) return <OpenPhases adapter={adapter} />

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
      <defs>
        <mask id="trail-done" maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
          <path
            ref={maskRef}
            d={model.route}
            fill="none"
            stroke="#fff"
            strokeWidth="26"
            strokeLinecap="round"
          />
        </mask>
      </defs>
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
        ref={pathRef}
        d={model.route}
        fill="none"
        stroke="var(--ink-soft)"
        strokeWidth="3.6"
        strokeDasharray="1 8"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d={model.route}
        fill="none"
        stroke="var(--beni)"
        strokeWidth="4"
        strokeDasharray="1 8"
        strokeLinecap="round"
        mask="url(#trail-done)"
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
      <OpenPhases adapter={adapter} />
      {target ? (
        <g ref={spriteRef} className="travelers" aria-hidden="true">
          <g className="bob">
            <svg
              x={-travelersSize(travelers, 30).width / 2}
              y={-2 - travelersSize(travelers, 30).height}
              width={travelersSize(travelers, 30).width}
              height={travelersSize(travelers, 30).height}
              overflow="visible"
            >
              <Travelers count={travelers} height={30} />
            </svg>
            {heart ? (
              <text
                key={heart}
                className="heart"
                y="-28"
                textAnchor="middle"
                fontSize="14"
                fill="var(--beni)"
              >
                ♥
              </text>
            ) : null}
          </g>
        </g>
      ) : null}
    </g>
  )
}

/**
 * Noites em aberto num país ("Japão, cidades em aberto"): uma fase tracejada no meio do país, fora da
 * trilha. Tocar escolhe a cidade (quem só vê não tem o toque).
 */
function OpenPhases({ adapter }: { adapter: MapAdapter }) {
  const doc = useApp((s) => s.doc!)
  const edit = useCanEdit()
  const [W] = adapter.size()
  const list = openCenters(doc).flatMap((o) => {
    const xy = adapter.project([o.lon, o.lat])
    const n = doc.itinerary.stops.findIndex((s) => s.id === o.stopId) + 1
    return xy ? [{ ...o, n, x: xy[0], y: xy[1] }] : []
  })
  return (
    <>
      {list.map((o) => {
        const label = `${o.name} · cidades em aberto`
        const w = label.length * 7 + 20
        const choose = () => edit && fillOpenChoice(o.stopId)
        return (
          <g
            key={o.stopId}
            className="node open"
            {...(edit
              ? {
                  onClick: choose,
                  role: 'button',
                  tabIndex: 0,
                  onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && choose(),
                  'aria-label': `${o.name}: escolher cidade`,
                }
              : { 'aria-label': label })}
          >
            <g
              transform={`translate(${f1(Math.min(Math.max(o.x, w / 2 + 4), W - w / 2 - 4))},${f1(o.y - 30)})`}
            >
              <rect
                x={-w / 2}
                y="-11"
                width={w}
                height="22"
                rx="11"
                fill="var(--paper)"
                stroke="var(--ink)"
                strokeWidth="1.6"
                strokeDasharray="4 3"
              />
              <text textAnchor="middle" y="4" fill="var(--ink)" className="pillbox">
                {label}
              </text>
            </g>
            <circle
              cx={o.x}
              cy={o.y}
              r="14"
              fill="var(--paper)"
              stroke="var(--ink)"
              strokeWidth="2.2"
              strokeDasharray="4 3"
            />
            <text
              x={o.x}
              y={o.y + 4.5}
              textAnchor="middle"
              fill="var(--ink)"
              style={{ font: '12.5px var(--f-pixel)' }}
            >
              {o.n}
            </text>
          </g>
        )
      })}
    </>
  )
}
