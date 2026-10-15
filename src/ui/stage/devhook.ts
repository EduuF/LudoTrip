// Só em desenvolvimento: `window.__palco.demo(momento, variação)` toca um momento no app de verdade,
// ancorado nos elementos reais (o botão de passagem do roteiro, o painel da hospedagem, o "Marcar como
// feita" da atividade, o selo do topo, o cartão "VIAGEM CRIADA!" e a contagem do mapa). Usado pela tira
// de quadros do avaliador (scripts/filmstrip.mjs).

import { useApp } from '../../app/store'
import { cueBigDay, cueCloud, cueLodging, cueTicket, MOMENTS } from './cues'
import { force, freeze, activeRuns, stopAll } from './palco'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** O botão visível cujo texto contém `text`. */
function button(text: string, within: ParentNode = document): HTMLElement | null {
  return (
    [...within.querySelectorAll<HTMLElement>('button')].find(
      (b) => b.textContent?.includes(text) && b.getBoundingClientRect().width > 0,
    ) ?? null
  )
}

/** Quantas mudanças o demo fez no documento (desfeitas no `reset`). */
let changed = 0

/** O toque de verdade: o Palco lembra o botão (pointerdown) e o app executa a ação (click). */
function press(el: Element | null) {
  tap(el)
  ;(el as HTMLElement | null)?.click()
}

/** Faz o toque "de mentira" (o Palco lembra o último botão tocado). */
function tap(el: Element | null) {
  el?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  return el
}

async function demo(id: keyof typeof MOMENTS, variant: string | null) {
  stopAll()
  force(id, variant)
  const S = useApp.getState()
  const doc = S.doc
  if (!doc && id !== 'nuvem') throw new Error('abra uma viagem antes')
  const it = doc!.itinerary
  switch (id) {
    // Passagem, hospedagem e atividade: o toque de verdade no botão real (o mesmo caminho da pessoa,
    // inclusive o que acontece com o painel depois); a mudança é desfeita no `reset`.
    case 'passagem': {
      const pill =
        [...document.querySelectorAll<HTMLElement>('button.ticket:not(.on)')].find(
          (b) => b.getBoundingClientRect().width > 0,
        ) ?? null
      if (pill) {
        pill.scrollIntoView({ block: 'center' })
        await wait(300)
        press(pill)
        changed++
      } else {
        const any = [...document.querySelectorAll<HTMLElement>('button.ticket')].find(
          (b) => b.getBoundingClientRect().width > 0,
        )
        any?.scrollIntoView({ block: 'center' })
        await wait(300)
        tap(any ?? document.querySelector('.map-acts .btn'))
        cueTicket(doc!)
      }
      break
    }
    case 'hospedagem': {
      const gap = document.querySelector<HTMLElement>('button.pill.warn')
      if (gap) {
        gap.scrollIntoView({ block: 'center' })
        await wait(200)
        gap.click()
        await wait(450)
        const box = document.querySelector<HTMLInputElement>('.sheet input[type=checkbox]')
        if (box && !box.checked) box.click()
        await wait(80)
        press(button('Marcar reservada'))
        changed++
      } else {
        const stop = it.stops.find((s) => s.destinationId)!
        S.openSheet({ kind: 'lodging', stopId: stop.id })
        await wait(450)
        tap(button('Marcar reservada') ?? button('Já reservei') ?? document.querySelector('.sheet .btn'))
        cueLodging(doc!, stop.destinationId)
      }
      break
    }
    case 'feita': {
      const visit = it.stops.flatMap((s) => s.days.flat())[0]!
      S.openSheet({ kind: 'visit', visitId: visit.id })
      await wait(450)
      if (visit.visited) {
        press(document.querySelector('.done-toggle'))
        changed++
        await wait(150)
      }
      press(document.querySelector('.done-toggle'))
      changed++
      break
    }
    case 'nuvem':
      cueCloud(doc, document.querySelector('.cloud-badge') ?? document.querySelector('.hud-actions .hud-btn'))
      break
    case 'criada':
      useApp.setState((s) => ({
        celebrations: [...s.celebrations, { id: Date.now(), kind: 'created', name: doc!.meta.name }],
      }))
      await wait(60)
      break
    case 'grande-dia':
      scrollTo(0, 0)
      await wait(300)
      cueBigDay(doc!, document.querySelector('.map-head'), document.querySelector('.mappanel'), true)
      break
  }
  await wait(120)
  force(id, null)
  const run = activeRuns()[0]
  return run ? { variant: run.variant, duration: run.duration } : null
}

/** A caixa (na tela) do momento em andamento, para recortar a foto com uma margem ao redor. */
function box() {
  const run = activeRuns()[0]
  if (!run) return null
  const r = run.stage.el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}

;(window as unknown as { __palco: unknown }).__palco = {
  ...((window as unknown as { __palco?: object }).__palco ?? {}),
  demo,
  /** Fecha painéis e comemorações e encerra os momentos (entre uma tira e outra). */
  reset() {
    stopAll()
    for (; changed > 0; changed--) useApp.getState().undo()
    useApp.setState({ celebrations: [], sheet: null, tutorial: false })
    scrollTo(0, 0)
  },
  freeze,
  box,
  stopAll,
  moments: Object.fromEntries(
    Object.entries(MOMENTS).map(([k, m]) => [k, { rare: m.rare, durations: m.duration }]),
  ),
}
