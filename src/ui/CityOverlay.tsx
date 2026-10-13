import { useMemo, useRef } from 'react'
import type { ID } from '../engine'
import { useApp } from '../app/store'
import type { MapAdapter } from '../map/adapter'
import { citySpots, DAY_COLORS } from '../map/spots'
import { colorOf } from './colors'
import { Travelers } from './kit'
import { f1, placeLabels, relax, smoothPath } from './mapBits'
import type { Rect } from './mapBits'
import { PLACE_KINDS } from './placeKinds'

// A camada da cidade (v1 "mapa local"): cada figurinha com coordenadas é um ponto com o selo do tipo,
// os dias viram trilhas pontilhadas coloridas e, com um dia escolhido, o resto esmaece.
// O grupo em pixel fica no primeiro lugar do dia.

interface Node {
  id: ID
  x: number
  y: number
  ox: number
  oy: number
}

interface Props {
  adapter: MapAdapter
  tick: number
  settled: boolean
  destId: ID
}

export function CityOverlay({ adapter, tick, settled, destId }: Props) {
  const doc = useApp((s) => s.doc)!
  const cursor = useApp((s) => s.cursorDay)
  const openSheet = useApp((s) => s.openSheet)
  const [W, H] = adapter.size()
  const labelCand = useRef(new Map<ID, number>())
  const city = useMemo(() => citySpots(doc, destId), [doc, destId])
  const dest = doc.destinations.find((d) => d.id === destId)
  const color = colorOf(doc.destinations, destId)
  // Só filtra quando o dia escolhido é desta cidade (ou de um bate-volta a ela).
  const filter =
    cursor !== null &&
    (city.cityDays.some((d) => d.index === cursor) || city.trails.some((t) => t.dayIndex === cursor))
      ? cursor
      : null

  const model = useMemo(() => {
    void tick
    const nodes: Node[] = []
    for (const s of city.spots) {
      const xy = adapter.project([s.lon, s.lat])
      if (!xy) continue
      nodes.push({ id: s.place.id, x: xy[0], y: xy[1], ox: xy[0], oy: xy[1] })
    }
    relax(nodes, 30, 18, W, H)
    const pos = new Map(nodes.map((n) => [n.id, n]))
    const trails = city.trails.map((t) => ({
      ...t,
      d: smoothPath(
        t.spots
          .map((id) => pos.get(id))
          .filter((n): n is Node => !!n)
          .map((n) => [n.x, n.y] as [number, number]),
      ),
      on: filter === null || filter === t.dayIndex,
    }))
    const occ: Rect[] = nodes.map((n) => ({ x: n.x - 14, y: n.y - 14, w: 28, h: 28 }))
    const fixed = settled ? undefined : nodes.map((n) => labelCand.current.get(n.id))
    const nameOf = (id: ID) => city.spots.find((s) => s.place.id === id)?.place.name ?? ''
    const labels = placeLabels(
      nodes.map((n) => ({
        x: n.x,
        y: n.y,
        w: Math.min(150, nameOf(n.id).length * 6.4 + 16),
        h: 20,
        gap: 15,
      })),
      occ,
      W,
      H,
      fixed,
    )
    if (settled) labels.forEach((l, i) => labelCand.current.set(nodes[i]!.id, l.cand))
    const center =
      dest?.lat !== undefined && dest.lon !== undefined ? adapter.project([dest.lon, dest.lat]) : null
    const firstOfDay = filter !== null ? city.trails.find((t) => t.dayIndex === filter)?.spots[0] : undefined
    const at = firstOfDay ? pos.get(firstOfDay) : undefined
    const sprite: [number, number] | null = at ? [at.x, at.y] : center
    return { nodes, trails, labels, sprite }
  }, [city, adapter, tick, settled, W, H, filter, dest])

  const travelers = doc.itinerary.travelers.length || 1
  const trunc = (s: string) => (s.length > 22 ? `${s.slice(0, 21)}…` : s)

  return (
    <g>
      {model.trails
        .filter((t) => t.d && t.spots.length >= 2)
        .map((t) => (
          <path
            key={t.dayIndex}
            d={t.d}
            fill="none"
            stroke={DAY_COLORS[t.ordinal % DAY_COLORS.length]}
            strokeWidth={t.on ? 5 : 3}
            strokeDasharray="0 10"
            strokeLinecap="round"
            opacity={t.on ? 1 : 0.25}
          />
        ))}
      {model.nodes.map((n, i) => {
        const s = city.spots.find((x) => x.place.id === n.id)
        if (!s) return null
        const dim = filter !== null && !s.days.includes(filter)
        const k = PLACE_KINDS[s.place.kind ?? 'sight']
        const lab = model.labels[i]!
        const w = Math.min(150, s.place.name.length * 6.4 + 16)
        const placed = s.days.length > 0
        const open = () => openSheet({ kind: 'sticker', placeId: n.id })
        return (
          <g
            key={n.id}
            className={`node spot${dim ? ' dim' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${s.place.name}${placed ? '' : ', sem dia'}`}
            onClick={open}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && open()}
          >
            {Math.hypot(n.x - n.ox, n.y - n.oy) > 10 ? (
              <>
                <line x1={n.ox} y1={n.oy} x2={n.x} y2={n.y} stroke="var(--ink-soft)" strokeWidth="1" />
                <circle cx={n.ox} cy={n.oy} r="2" fill="var(--ink-soft)" />
              </>
            ) : null}
            <circle cx={n.x} cy={n.y + 2} r="12" fill="var(--ink)" opacity="0.25" />
            <circle
              cx={n.x}
              cy={n.y}
              r="12"
              fill={placed ? color : 'var(--paper)'}
              stroke="var(--ink)"
              strokeWidth="2"
              strokeDasharray={placed ? undefined : '3 2'}
            />
            <text
              x={n.x}
              y={n.y + 4.5}
              textAnchor="middle"
              fill={placed ? '#fff' : 'var(--ink)'}
              style={{ font: '800 11px var(--f-display)' }}
            >
              {k.glyph}
            </text>
            {s.visited ? (
              <g transform={`translate(${f1(n.x + 9)},${f1(n.y - 9)})`}>
                <circle r="6" fill="var(--matcha)" stroke="var(--paper)" strokeWidth="1.5" />
                <path d="M-2.5,0 L-0.5,2 L2.5,-2" fill="none" stroke="#fff" strokeWidth="1.6" />
              </g>
            ) : null}
            <g transform={`translate(${f1(lab.cx)},${f1(lab.cy)})`}>
              <rect
                x={-w / 2}
                y="-10"
                width={w}
                height="20"
                rx="10"
                fill="var(--paper)"
                stroke="var(--ink)"
                strokeWidth="1.4"
              />
              <text textAnchor="middle" y="3.5" fill="var(--ink)" style={{ font: '700 11px var(--f-body)' }}>
                {trunc(s.place.name)}
              </text>
            </g>
          </g>
        )
      })}
      {model.sprite ? (
        <g transform={`translate(${f1(model.sprite[0])},${f1(model.sprite[1] - 16)})`} className="travelers">
          <g className="bob">
            <svg
              x={-(Math.min(travelers, 4) * 6 * 2.2) / 2 - (travelers >= 5 ? 8 : 0)}
              y={-22}
              width={travelers >= 5 ? 40 : Math.min(travelers, 4) * 6 * 2.2}
              height={20}
              overflow="visible"
            >
              <Travelers count={travelers} px={2.2} />
            </svg>
          </g>
        </g>
      ) : null}
    </g>
  )
}
