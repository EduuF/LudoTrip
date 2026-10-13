import type { StyleSpecification } from 'maplibre-gl'

// Estilo "washi" para os tiles do OpenStreetMap (OpenFreeMap, esquema OpenMapTiles): papel, mar com
// seigaiha, contornos de tinta, parques matcha, fronteiras tracejadas, ruas só de perto, sem rótulos
// (os nomes vêm da nossa camada SVG). As cores espelham os tokens do app.css.

export type Theme = 'light' | 'dark'

const PALETTE = {
  light: {
    land: '#fbf5ec',
    sea: '#dce8ee',
    seaLine: '#c3d6e0',
    river: '#b4cbd8',
    ink: '#3a2c3a',
    park: '#e2eacb',
    wood: '#e6ecd6',
    grass: '#edf1de',
    sand: '#f4ead6',
    ice: '#ffffff',
    road1: '#e2d6c6',
    road2: '#ebe2d5',
    road3: '#f1eae0',
    rail: '#c9bcc2',
  },
  dark: {
    land: '#2a2438',
    sea: '#141a2e',
    seaLine: '#222b46',
    river: '#2b3a58',
    ink: '#e9dce6',
    park: '#2f3d30',
    wood: '#2c3530',
    grass: '#2f3833',
    sand: '#3a3330',
    ice: '#3c3f52',
    road1: '#3f3850',
    road2: '#383245',
    road3: '#332e3f',
    rail: '#5a4f60',
  },
} as const

export const TILES_URL = 'https://tiles.openfreemap.org/planet'

export function washiStyle(theme: Theme): StyleSpecification {
  const c = PALETTE[theme]
  return {
    version: 8,
    sources: { ofm: { type: 'vector', url: TILES_URL } },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': c.land } },
      {
        id: 'landcover',
        type: 'fill',
        source: 'ofm',
        'source-layer': 'landcover',
        paint: {
          'fill-color': [
            'match',
            ['get', 'class'],
            'wood',
            c.wood,
            'grass',
            c.grass,
            'farmland',
            c.grass,
            'sand',
            c.sand,
            'ice',
            c.ice,
            c.land,
          ],
          'fill-opacity': 0.9,
        },
      },
      {
        id: 'park',
        type: 'fill',
        source: 'ofm',
        'source-layer': 'park',
        paint: { 'fill-color': c.park, 'fill-opacity': 0.85 },
      },
      {
        id: 'park-edge',
        type: 'line',
        source: 'ofm',
        'source-layer': 'park',
        minzoom: 11,
        paint: { 'line-color': c.ink, 'line-opacity': 0.3, 'line-width': 1, 'line-dasharray': [3, 2] },
      },
      { id: 'water', type: 'fill', source: 'ofm', 'source-layer': 'water', paint: { 'fill-color': c.sea } },
      {
        id: 'water-pattern',
        type: 'fill',
        source: 'ofm',
        'source-layer': 'water',
        paint: { 'fill-pattern': 'seigaiha', 'fill-opacity': 0.7 },
      },
      {
        id: 'water-edge',
        type: 'line',
        source: 'ofm',
        'source-layer': 'water',
        paint: {
          'line-color': c.ink,
          'line-opacity': 0.75,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 10, 1.6, 14, 2.2],
        },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'ofm',
        'source-layer': 'waterway',
        minzoom: 8,
        paint: {
          'line-color': c.river,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 14, 3],
        },
      },
      {
        id: 'road-major',
        type: 'line',
        source: 'ofm',
        'source-layer': 'transportation',
        minzoom: 9,
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]],
        paint: {
          'line-color': c.road1,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 14, 4],
        },
      },
      {
        id: 'road-mid',
        type: 'line',
        source: 'ofm',
        'source-layer': 'transportation',
        minzoom: 11,
        filter: ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary']]],
        paint: {
          'line-color': c.road2,
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.7, 15, 3],
        },
      },
      {
        id: 'road-minor',
        type: 'line',
        source: 'ofm',
        'source-layer': 'transportation',
        minzoom: 13,
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service']]],
        paint: {
          'line-color': c.road3,
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.5, 16, 2.2],
        },
      },
      {
        id: 'rail',
        type: 'line',
        source: 'ofm',
        'source-layer': 'transportation',
        minzoom: 11,
        filter: ['==', ['get', 'class'], 'rail'],
        paint: { 'line-color': c.rail, 'line-width': 1.2, 'line-dasharray': [4, 3] },
      },
      {
        id: 'boundary-state',
        type: 'line',
        source: 'ofm',
        'source-layer': 'boundary',
        minzoom: 6,
        filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
        paint: { 'line-color': c.ink, 'line-opacity': 0.22, 'line-width': 1, 'line-dasharray': [2, 2] },
      },
      {
        id: 'boundary-country',
        type: 'line',
        source: 'ofm',
        'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
        paint: {
          'line-color': c.ink,
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1, 8, 2.2],
          'line-dasharray': [3, 2],
        },
      },
    ],
  }
}

/** O padrão seigaiha (ondas) do mar, como imagem para o `fill-pattern`. */
export function seigaihaImage(theme: Theme): ImageData | null {
  const pr = 2
  const S = 24 // largura de um ladrilho, em px de tela (o desenho original tem 40 × 20)
  const k = S / 40
  const cv = document.createElement('canvas')
  cv.width = S * pr
  cv.height = (S / 2) * pr
  const ctx = cv.getContext('2d')
  if (!ctx) return null
  ctx.scale(pr * k, pr * k)
  ctx.strokeStyle = PALETTE[theme].seaLine
  ctx.lineWidth = 1.4 / k
  for (const [cx, cy] of [
    [20, 20],
    [0, 10],
    [40, 10],
  ] as const)
    for (const r of [18, 12, 6]) {
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
    }
  return ctx.getImageData(0, 0, cv.width, cv.height)
}
