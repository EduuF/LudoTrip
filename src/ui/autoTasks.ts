import { days as allDays, legName, MODE_NAMES, stopName } from '../engine'
import type { Issue } from '../engine'
import { useApp } from '../app/store'
import { askStartDate, buyTicket, markLodging, scheduleOnce } from '../app/choices'

// O que se faz com uma tarefa automática (spec §17.6, §17.11, §17.12): a ação que resolve, quando há,
// e "Ir para …", que leva ao lugar dela. Usado na aba Tarefas e no painel da tarefa.

const S = () => useApp.getState()

export interface IssueAction {
  label: string
  run: () => void
}

/** A ação que resolve a tarefa num toque (ou que leva ao que falta para resolver). */
export function issueQuick(i: Issue): IssueAction | null {
  const doc = S().doc!
  const it = doc.itinerary
  const dated = !!it.start
  if (i.kind === 'transport-missing')
    return dated
      ? { label: 'Marcar comprada', run: () => buyTicket(i.target.id) }
      : {
          label: 'Escolher a data de ida',
          run: () => askStartDate('Para marcar a passagem, escolha primeiro a data de ida.'),
        }
  if (i.kind === 'lodging-missing' || i.kind === 'lodging-partial')
    return dated
      ? { label: 'Marcar reservada', run: () => markLodging(i.target.id) }
      : {
          label: 'Escolher a data de ida',
          run: () => askStartDate('Para anotar a hospedagem, escolha primeiro a data de ida.'),
        }
  if (i.kind === 'must-unscheduled') {
    const place = doc.places.find((x) => x.id === i.target.id)
    if (!place) return null
    return {
      label: 'Pôr num dia',
      run: () =>
        S().openSheet({
          kind: 'days',
          title: `Pôr ${place.name} em qual dia?`,
          prefer: place.destinationId,
          placeId: place.id,
          pick: (ref) => scheduleOnce(place.id, ref),
        }),
    }
  }
  if (i.kind === 'booking-wrong-mode') {
    const b = doc.bookings.find((x) => x.id === i.target.id)
    const legId = String(i.data?.legId ?? '')
    if (b?.kind !== 'transport' || !legId) return null
    return {
      label: `Voltar para ${MODE_NAMES[b.mode]}`,
      run: () => S().act({ type: 'engine', command: { type: 'setLegMode', legId, mode: b.mode } }),
    }
  }
  if (i.kind.startsWith('booking-'))
    return {
      label: 'Tirar a reserva do roteiro',
      run: () => S().act({ type: 'setBooking', id: i.target.id, patch: { archived: true } }),
    }
  return null
}

/** Para onde "Ir para …" leva: o cartão do destino (aberto), o trecho, a atividade ou o dia. */
export function issueWhere(i: Issue): IssueAction | null {
  const doc = S().doc!
  const it = doc.itinerary
  const names = { destinations: doc.destinations, places: doc.places }
  const d = i.data ?? {}
  const stop = (id: string): IssueAction => ({
    label: `Ir para ${stopName(it, id, names)}`,
    run: () => {
      S().openStopCard(id)
      S().focusOn(`c-${id}`, 'mapa')
    },
  })
  const leg = (id: string): IssueAction => {
    const l = it.legs.find((x) => x.id === id)
    return {
      label: l ? `Ir para o trecho ${legName(it, l, names)}` : 'Ir para o trecho',
      run: () => S().focusOn(`l-${id}`, 'mapa'),
    }
  }
  if (i.target.kind === 'stop') return stop(i.target.id)
  if (i.target.kind === 'leg') return leg(i.target.id)
  if (i.target.kind === 'place') {
    const place = doc.places.find((x) => x.id === i.target.id)
    return {
      label: `Ir para ${place?.name ?? 'a atividade'}`,
      run: () => S().focusOn(`p-${i.target.id}`, 'atividades'),
    }
  }
  if (i.target.kind === 'booking') {
    if (d.stopId) return stop(String(d.stopId))
    if (d.legId) return leg(String(d.legId))
    // Reserva sem lugar no roteiro: as reservas ficam em "Sua viagem".
    return { label: 'Ver as reservas', run: () => S().openSheet({ kind: 'trip' }) }
  }
  if (i.target.kind === 'anchor') {
    const a = it.anchors.find((x) => x.id === i.target.id)
    const day = a ? allDays(it).find((x) => x.date === a.date) : undefined
    if (!day) return null
    return {
      label: `Ver ${day.label}`,
      run: () => {
        S().setTab('mapa')
        S().setCursorDay(day.index)
      },
    }
  }
  return null
}
