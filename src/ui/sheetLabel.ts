import { days as allDays, describeIssue, findVisit, health, legName } from '../engine'
import type { TripDoc } from '../app/doc'
import { cityName } from '../app/choices'
import { aboutLabel, autoKey } from '../app/tasks'
import type { SheetSpec } from './sheetTypes'

// O que cada painel é (spec §17.13): o tipo em letras pequenas no cabeçalho ("NOVA TAREFA") e o nome,
// que vira o "‹ Gion" do painel aberto a partir dele. Nunca mais um painel que parece o anterior.

export interface SheetLabel {
  kind: string
  name: string
}

export function sheetLabel(spec: SheetSpec, doc: TripDoc | null): SheetLabel {
  if (spec.kind === 'signin') return { kind: 'ENTRAR', name: spec.reason }
  if (spec.kind === 'account') return { kind: 'SUA CONTA', name: 'Sua conta' }
  if (!doc) return { kind: '', name: '' }
  return docLabel(spec, doc)
}

function docLabel(spec: SheetSpec, doc: TripDoc): SheetLabel {
  const it = doc.itinerary
  const names = { destinations: doc.destinations, places: doc.places }
  const dest = (id?: string | null) => doc.destinations.find((d) => d.id === id)?.name ?? 'destino'
  const leg = (id: string) => {
    const l = it.legs.find((x) => x.id === id)
    return l ? legName(it, l, names) : 'trecho'
  }
  switch (spec.kind) {
    case 'choice':
      return { kind: 'ESCOLHA', name: spec.title }
    case 'leg':
      return { kind: 'TRECHO', name: leg(spec.legId) }
    case 'times':
      return { kind: 'HORÁRIOS', name: leg(spec.legId) }
    case 'dest':
    case 'pickStop':
      return { kind: 'DESTINO', name: spec.title }
    case 'where':
      return { kind: 'ONDE ENTRA', name: dest(spec.destId) }
    case 'insert':
      return { kind: 'NOITES', name: dest(spec.destId) }
    case 'split':
      return { kind: 'NO MEIO DE', name: `${dest(spec.destId)} em ${cityName(spec.stopId, doc)}` }
    case 'fill':
      return { kind: 'NOITES EM ABERTO', name: dest(spec.destId) }
    case 'order':
      return { kind: 'ORDEM', name: cityName(spec.stopId, doc) }
    case 'days':
      return { kind: 'ESCOLHER O DIA', name: spec.title }
    case 'sticker':
      return { kind: 'ATIVIDADE', name: doc.places.find((p) => p.id === spec.placeId)?.name ?? 'Atividade' }
    case 'visit': {
      const f = findVisit(it, spec.visitId)
      const v = f?.list[f.index]
      const p = doc.places.find((x) => x.id === v?.placeId)
      const day = allDays(it).find((d) => d.visits.some((x) => x.id === spec.visitId))
      return {
        kind: 'ATIVIDADE NO DIA',
        name: [p?.name ?? 'Atividade', day?.label].filter(Boolean).join(' · '),
      }
    }
    case 'newActivity':
      return { kind: 'NOVA ATIVIDADE', name: dest(spec.destId) }
    case 'lodging':
      return { kind: 'HOSPEDAGEM', name: cityName(spec.stopId, doc) }
    case 'trip':
      return { kind: 'SUA VIAGEM', name: doc.meta.name }
    case 'task': {
      const t = spec.taskId ? doc.tasks?.find((x) => x.id === spec.taskId) : undefined
      if (!spec.taskId)
        return { kind: 'NOVA TAREFA', name: `para ${aboutLabel(spec.about ?? { kind: 'trip' }, it, names)}` }
      return { kind: 'TAREFA', name: t?.title ?? 'Tarefa' }
    }
    case 'autoTask': {
      const i = health(it, doc).find((x) => autoKey(x) === spec.key)
      return { kind: 'TAREFA DO APP', name: i ? describeIssue(i, it, names, doc.bookings) : 'Tarefa' }
    }
    case 'taskAbout':
      return { kind: 'PRESA A', name: doc.tasks?.find((x) => x.id === spec.taskId)?.title ?? 'Tarefa' }
    case 'signin':
    case 'account':
      return sheetLabel(spec, null)
  }
}
