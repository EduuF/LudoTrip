import { f1 } from './mapBits'
import type { DecoKind } from './mapBits'

// Decoração em pixel art do mapa (portada da v1): montanhas, cerejeiras, torii, palmeiras,
// pinheiros, castelos, cactos e nuvens.

export function Deco({ kind, x, y, s = 1 }: { kind: DecoKind; x: number; y: number; s?: number }) {
  const t = `translate(${f1(x)},${f1(y)}) scale(${s})`
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
    case 'castle':
      return (
        <g transform={t}>
          <rect
            x="-14"
            y="-18"
            width="28"
            height="18"
            fill="var(--paper)"
            stroke="var(--land-edge)"
            strokeWidth="1.8"
          />
          <path
            d="M-14,-18 v-6 h5 v4 h4 v-4 h5 v4 h4 v-4 h5 v4 h5 v6 Z"
            fill="var(--paper)"
            stroke="var(--land-edge)"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <rect x="-3" y="-9" width="6" height="9" fill="var(--land-edge)" />
          <path d="M0,-24 v-8 l8,3 l-8,3" fill="#c4313a" stroke="var(--land-edge)" strokeWidth="1" />
        </g>
      )
    case 'cactus':
      return (
        <g transform={t}>
          <rect
            x="-4"
            y="-26"
            width="8"
            height="26"
            rx="4"
            fill="var(--hill-dark)"
            stroke="var(--land-edge)"
            strokeWidth="1.5"
          />
          <path
            d="M-4,-14 h-6 v-8"
            fill="none"
            stroke="var(--hill-dark)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M4,-18 h6 v-6"
            fill="none"
            stroke="var(--hill-dark)"
            strokeWidth="5"
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

export function Cloud({ x, y, s = 1, delay = 0 }: { x: number; y: number; s?: number; delay?: number }) {
  return (
    <g className="cloud" style={{ animationDelay: `-${delay}s` }}>
      <path
        transform={`translate(${f1(x)},${f1(y)}) scale(${s})`}
        d="M-40,8 Q-44,-8 -26,-10 Q-22,-26 -4,-22 Q6,-34 22,-22 Q40,-24 40,-6 Q52,0 42,10 Z"
        fill="#ffffff"
        opacity="0.85"
        stroke="#c9c2d6"
        strokeWidth="2"
      />
    </g>
  )
}
