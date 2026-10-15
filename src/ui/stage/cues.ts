// Onde cada momento do Palco nasce no app (docs/animacoes.md): o elemento que a pessoa tocou, o selo da
// nuvem, o cartão "VIAGEM CRIADA!" e a contagem do mapa. As funções aqui só leem o documento para o
// contexto (quantos viajantes, o 1º trecho, o tipo da atividade) e chamam o Palco; nunca mudam dados.

import type { ID } from '../../engine'
import type { TripDoc } from '../../app/doc'
import { bigDayMoment } from './moments/bigday'
import { cloudMoment } from './moments/cloud'
import { createdMoment } from './moments/created'
import { doneMoment } from './moments/done'
import { lodgingMoment } from './moments/lodging'
import { ticketMoment } from './moments/ticket'
import { glint, play, type MomentDef } from './palco'

// O último botão tocado (a reação nasce onde a pessoa tocou). Se o painel fechou depois do toque, vale o
// lugar onde o botão estava.
let lastTap: { el: Element; rect: DOMRect } | null = null
if (typeof document !== 'undefined')
  document.addEventListener(
    'pointerdown',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('button, [role="button"], [role="menuitem"]')
      lastTap = el ? { el, rect: el.getBoundingClientRect() } : null
    },
    true,
  )

function tapAnchor(): Element | DOMRect | null {
  const focused = document.activeElement
  const el = lastTap?.el.isConnected ? lastTap.el : focused && focused !== document.body ? focused : null
  // Dentro de um painel aberto, o chão é a borda de cima do painel (acima dele só há o fundo escurecido):
  // a cena fica sobre o painel, na direção do botão, sem cobrir nada de dentro dele.
  const sheet = el?.closest('.sheet')
  if (el && sheet) {
    const r = el.getBoundingClientRect()
    return new DOMRect(r.left, sheet.getBoundingClientRect().top, r.width, r.height)
  }
  return el ?? lastTap?.rect ?? null
}

/** Toca depois que a tela se redesenhou com a mudança (o painel pode ter fechado com o toque). */
const afterPaint = (f: () => void) => setTimeout(f, 0)

const travelers = (doc: TripDoc) => doc.itinerary.travelers.length || 1
const firstMode = (doc: TripDoc) => doc.itinerary.legs[0]?.mode

/** Todos os momentos, para o avaliador e a galeria. */
export const MOMENTS = {
  passagem: ticketMoment,
  hospedagem: lodgingMoment,
  feita: doneMoment,
  nuvem: cloudMoment,
  criada: createdMoment,
  'grande-dia': bigDayMoment,
} as const satisfies Record<string, MomentDef<never>>

export function cueTicket(doc: TripDoc) {
  afterPaint(() => play(ticketMoment, { travelers: travelers(doc) }, tapAnchor()))
}

export function cueLodging(doc: TripDoc, destinationId: ID | null | undefined) {
  const dest = doc.destinations.find((d) => d.id === destinationId)
  const mode = firstMode(doc)
  const ctx = {
    travelers: travelers(doc),
    country: dest?.country,
    outdoors: dest?.kind === 'park' || mode === 'walk' || mode === 'bike',
  }
  afterPaint(() => play(lodgingMoment, ctx, tapAnchor()))
}

export function cueDone(doc: TripDoc, placeId: ID) {
  const place = doc.places.find((p) => p.id === placeId)
  const ctx = { travelers: travelers(doc), kind: place?.kind, must: place?.rarity === 'must' }
  afterPaint(() => play(doneMoment, ctx, tapAnchor()))
}

/**
 * O cartão chega ao selo da nuvem. Na faixa de botões do topo, a cena usa a faixa inteira (do selo até a
 * borda, com o vão livre à direita dos botões); fora dela (o cartão em "Suas viagens"), só um brilho.
 */
export function cueCloud(doc: TripDoc | null, anchor: Element | null) {
  if (!anchor) return
  const row = anchor.closest('.hud-actions')
  if (!row) return glint(anchor)
  const a = anchor.getBoundingClientRect()
  const r = row.getBoundingClientRect()
  const last = [...row.children].at(-1)?.getBoundingClientRect()
  const right = Math.max(r.right, innerWidth - 4)
  const band = new DOMRect(a.left, r.top, right - a.left, r.height)
  play(
    cloudMoment,
    {
      travelers: doc ? travelers(doc) : 1,
      badgeX: a.width / 2,
      freeX: (last ? last.right : a.right) - a.left + 6,
      onHit: () => {
        try {
          anchor.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }],
            {
              duration: 260,
              easing: 'ease-out',
            },
          )
        } catch {
          // efeito visual
        }
      },
    },
    band,
  )
}

/** Dentro do cartão "VIAGEM CRIADA!" (some junto se a pessoa tocar para continuar). */
export function cueCreated(doc: TripDoc | null, host: HTMLElement | null) {
  if (!doc || !host) return
  const run = play(createdMoment, { travelers: travelers(doc), mode: firstMode(doc) }, host)
  // Sem a cena completa (discretas, repetição, reduzir movimento), a faixa se recolhe.
  if (!run || run.minimal) {
    run?.stop()
    host.style.display = 'none'
  }
}

const BIG_DAY_KEY = 'ludotrip.grande-dia.'

/** Uma vez por viagem, no dia da ida: abaixo da contagem do mapa, na largura do mapa. */
export function cueBigDay(doc: TripDoc, countdown: Element | null, map: Element | null, force = false) {
  if (!countdown || !map) return
  const key = BIG_DAY_KEY + doc.meta.id
  try {
    if (!force && localStorage.getItem(key)) return
    localStorage.setItem(key, '1')
  } catch {
    // sem armazenamento: pode repetir numa próxima visita, sem problema
  }
  const c = countdown.getBoundingClientRect()
  const m = map.getBoundingClientRect()
  const top = c.bottom + 6
  // Rótulos e pinos do mapa na altura da plataforma: o que fica parado (portão, Kombi, balão) evita.
  const avoid = [...map.querySelectorAll('svg rect[rx], svg text, svg circle')]
    .map((e) => e.getBoundingClientRect())
    .filter((r) => r.width && r.bottom > top && r.top < top + 80)
    .map((r) => [r.left - m.left - 10, r.right - m.left + 10] as [number, number])
  play(
    bigDayMoment,
    { travelers: travelers(doc), mode: firstMode(doc), avoid },
    new DOMRect(m.left, c.top, m.width, c.height + 6),
  )
}
