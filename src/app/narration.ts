import { describeEffects, MODE_NAMES, plural, stopName } from '../engine'
import type { Command, Effects } from '../engine'
import type { DocAction, TripDoc } from './doc'

// O aviso depois de cada ação: o que você fez + o que aconteceu junto (spec §5.1.3).

const names = (doc: TripDoc) => ({ destinations: doc.destinations, places: doc.places })

function leadForCommand(cmd: Command, doc: TripDoc): string | null {
  const it = doc.itinerary
  const city = (id: string) => stopName(it, id, names(doc))
  const dest = (id: string) => doc.destinations.find((d) => d.id === id)?.name ?? 'O destino'
  switch (cmd.type) {
    case 'setNights':
      return `${city(cmd.stopId)}: ${plural(cmd.nights, 'noite', 'noites')}.`
    case 'moveBoundary': {
      const l = it.stops[cmd.index]
      const r = it.stops[cmd.index + 1]
      if (!l || !r) return null
      return `${city(l.id)} ${plural(l.days.length + cmd.k, 'noite', 'noites')} · ${city(r.id)} ${plural(r.days.length - cmd.k, 'noite', 'noites')}.`
    }
    case 'shiftStop':
      return `${city(cmd.stopId)} chega ${plural(Math.abs(cmd.by), 'dia', 'dias')} ${cmd.by > 0 ? 'depois' : 'antes'}.`
    case 'reorderStop':
      return `${city(cmd.stopId)} mudou de lugar na viagem.`
    case 'removeStop':
      return `${city(cmd.stopId)} saiu do roteiro. As atividades ficam guardadas.`
    case 'fillOpen':
      return `${dest(cmd.destinationId)} entrou nas noites em aberto.`
    case 'stretchInto': {
      const i = it.stops.findIndex((s) => s.id === cmd.stopId)
      const n = it.stops[cmd.side === 'before' ? i - 1 : i + 1]
      return n ? `${city(n.id)} ficou com as noites em aberto.` : null
    }
    case 'closeOpen':
      return 'Viagem encurtada.'
    case 'insertStop':
      return `${dest(cmd.destinationId)} entrou no roteiro.`
    case 'splitStopWith':
      return `${dest(cmd.destinationId)} no meio de ${city(cmd.stopId)}.`
    case 'removeDay':
      return 'Dia removido.'
    case 'swapDays':
      return 'Dias trocados.'
    case 'setLegMode':
      return `Agora de ${MODE_NAMES[cmd.mode]}.`
    case 'setLegTimes':
      return 'Horários salvos.'
    case 'setLegNightsAboard':
      return `${plural(cmd.nights, 'noite', 'noites')} a bordo.`
    case 'scheduleVisit': {
      const p = doc.places.find((x) => x.id === cmd.placeId)
      return `${p?.name ?? 'Atividade'} marcada no dia.`
    }
    case 'unscheduleVisit':
      return 'Atividade tirada do dia; continua no catálogo do destino.'
    case 'moveVisit':
      return 'Atividade mudou de dia.'
    case 'setVisitMeta':
      return cmd.note !== undefined
        ? cmd.note
          ? 'Anotação do dia salva.'
          : 'Anotação do dia apagada.'
        : cmd.time !== undefined
          ? cmd.time
            ? 'Horário salvo.'
            : 'Sem horário.'
          : 'Salvo.'
    case 'setLock':
      return cmd.lock === 'fixed' ? 'Volta marcada 🔒.' : 'Volta livre.'
    case 'setTripStart':
      return cmd.date ? null : 'Sem data: os dias viram dia 1, dia 2…'
    case 'setTentative':
      return cmd.tentative ? 'Noites incertas: as datas depois ficam estimadas.' : 'Noites confirmadas.'
    case 'setLodging':
      return cmd.lodging === 'friends'
        ? 'Com amigos: não precisa de reserva.'
        : cmd.lodging === 'onboard'
          ? 'A bordo: não precisa de reserva.'
          : 'A hospedagem voltou para as tarefas.'
    case 'setTravelers':
      return 'Quem vai: salvo.'
    case 'setHome':
      return cmd.home ? `Saída e volta por ${cmd.home.name}.` : 'Sem cidade de saída.'
    default:
      return null
  }
}

function leadFor(action: DocAction, doc: TripDoc): string | null {
  switch (action.type) {
    case 'engine':
      return leadForCommand(action.command, doc)
    case 'addPlace':
      return `Atividade nova: ${action.place.name.trim()}.`
    case 'setPlace':
      return action.patch.lat !== undefined
        ? 'Lugar marcado no mapa.'
        : action.patch.rarity
          ? 'Prioridade trocada.'
          : action.patch.kind
            ? 'Tipo do lugar salvo.'
            : action.patch.note !== undefined
              ? 'Anotação geral salva.'
              : 'Atividade salva.'
    case 'removePlace': {
      const p = doc.places.find((x) => x.id === action.id)
      return `${p?.name ?? 'Atividade'} apagada.`
    }
    case 'removeDestination': {
      const d = doc.destinations.find((x) => x.id === action.id)
      return `${d?.name ?? 'Destino'} apagado.`
    }
    case 'addDestination':
      return `${action.destination.name} entrou nos destinos.`
    case 'addBooking':
      if (action.booking.kind === 'lodging')
        return action.booking.status === 'booked'
          ? 'Hospedagem reservada 済.'
          : 'Hospedagem anotada (ainda não reservada).'
      return 'Passagem comprada 済.'
    case 'setBooking':
      return action.patch.archived
        ? 'Reserva tirada do roteiro (fica em "Sua viagem").'
        : action.patch.archived === false
          ? 'Reserva de volta ao roteiro.'
          : 'Reserva salva.'
    case 'removeBooking': {
      const b = doc.bookings.find((x) => x.id === action.id)
      return b?.kind === 'lodging' ? 'Hospedagem desmarcada.' : 'Passagem desmarcada.'
    }
    case 'rename':
      return `Viagem agora se chama ${action.name.trim()}.`
    case 'batch':
      return action.actions.map((a) => leadFor(a, doc)).find(Boolean) ?? null
  }
}

/** Texto do aviso. Une a intenção ("Kyoto chega 1 dia depois.") e as consequências ("Gion ficou sem dia."). */
export function narrate(action: DocAction, before: TripDoc, after: TripDoc, effects: Effects): string {
  const merged =
    action.type === 'engine' &&
    action.command.type === 'stretchInto' &&
    effects.merged.some((m) => m.destinationId)
  const lead = merged ? null : leadFor(action, before)
  const consequences = describeEffects(effects, before.itinerary, after.itinerary, names(after))
  return [lead, consequences].filter(Boolean).join(' ') || 'Feito.'
}
