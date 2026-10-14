import { days as allDays, health, legName, progress, stopName } from '../engine'
import type { DayRef, ID, ISODate, Issue, Itinerary } from '../engine'
import type { Destination, Place } from '../engine'
import type { TripDoc } from './doc'

// Tarefas (spec §17.11): as que quem viaja escreve, presas à viagem, a um destino, a um trecho, a um dia
// ou a uma atividade, e o que se acrescenta às que o app vê sozinho (prazo, quem faz, anotações e
// "Não preciso"). Funções puras: o documento guarda, a interface mostra.

/** Ao que a tarefa está presa. Destino (e não a parada): Kyoto duas vezes na viagem tem as mesmas tarefas. */
export type TaskAbout =
  | { kind: 'trip' }
  | { kind: 'dest'; id: ID }
  | { kind: 'leg'; id: ID }
  | { kind: 'place'; id: ID }
  | { kind: 'day'; ref: DayRef }

export interface TaskItem {
  id: ID
  text: string
  done?: boolean
}

export interface Task {
  id: ID
  title: string
  about: TaskAbout
  due?: ISODate
  note?: string
  link?: string
  /** Quem faz (id de um viajante). */
  who?: ID
  items?: TaskItem[]
  done?: boolean
  createdAt: number
  /** O que ela prendia antes de sumir ("Gion"): virou tarefa da viagem. */
  wasAbout?: string
}

/** O que se acrescenta a uma tarefa automática (chave `tipo:alvo`). */
export interface TaskMeta {
  due?: ISODate
  note?: string
  who?: ID
  /** "Não preciso", com o motivo (opcional). */
  skip?: { reason?: string }
}

export const TASK_XP = 5

/** Chave estável de uma tarefa automática: o tipo e o alvo (`transport-missing:l3`). */
export const autoKey = (i: Issue) => `${i.kind}:${i.target.id}`

interface Names {
  destinations: Destination[]
  places: Place[]
}

const sameRef = (a: DayRef | null, b: DayRef) => !!a && JSON.stringify(a) === JSON.stringify(b)

/** O alvo ainda existe? (destino na lista, trecho no roteiro, atividade, dia planejável). */
export function aboutExists(about: TaskAbout, it: Itinerary, names: Names): boolean {
  switch (about.kind) {
    case 'trip':
      return true
    case 'dest':
      return names.destinations.some((d) => d.id === about.id)
    case 'leg':
      return it.legs.some((l) => l.id === about.id)
    case 'place':
      return names.places.some((p) => p.id === about.id)
    case 'day':
      return allDays(it).some((d) => sameRef(d.ref, about.ref))
  }
}

/** "Kyoto", "trecho Kyoto → Tóquio", "Gion", "sáb 13/04", "a viagem". */
export function aboutLabel(about: TaskAbout, it: Itinerary, names: Names): string {
  switch (about.kind) {
    case 'trip':
      return 'a viagem'
    case 'dest':
      return names.destinations.find((d) => d.id === about.id)?.name ?? 'um destino'
    case 'leg': {
      const l = it.legs.find((x) => x.id === about.id)
      return l ? `trecho ${legName(it, l, names)}` : 'um trecho'
    }
    case 'place':
      return names.places.find((p) => p.id === about.id)?.name ?? 'uma atividade'
    case 'day': {
      const d = allDays(it).find((x) => sameRef(x.ref, about.ref))
      if (!d) return 'um dia'
      const where = d.stopId ? stopName(it, d.stopId, names) : ''
      return where ? `${d.label} · ${where}` : d.label
    }
  }
}

/**
 * Nada some calado: tarefas presas a algo que deixou de existir viram "da viagem", lembrando o que
 * prendiam. Devolve null quando nada mudou.
 */
export function rehome(
  tasks: Task[],
  before: { it: Itinerary; names: Names },
  after: { it: Itinerary; names: Names },
): Task[] | null {
  let changed = false
  const out = tasks.map((t) => {
    if (t.about.kind === 'trip' || aboutExists(t.about, after.it, after.names)) return t
    changed = true
    return { ...t, about: { kind: 'trip' as const }, wasAbout: aboutLabel(t.about, before.it, before.names) }
  })
  return changed ? out : null
}

/** A tarefa é desta coisa? (para a seção "TAREFAS" do painel dela). */
export function isAbout(t: Task, about: TaskAbout): boolean {
  if (t.about.kind !== about.kind) return false
  if (about.kind === 'trip') return true
  if (about.kind === 'day') return t.about.kind === 'day' && sameRef(t.about.ref, about.ref)
  return 'id' in t.about && t.about.id === about.id
}

export type DueGroup = 'late' | 'week' | 'later' | 'none'

/** Vencida, esta semana (até 7 dias), mais tarde, sem prazo. */
export function dueGroup(due: ISODate | undefined, today: ISODate): DueGroup {
  if (!due) return 'none'
  if (due < today) return 'late'
  const [y, m, d] = today.split('-').map(Number) as [number, number, number]
  const week = new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10)
  return due <= week ? 'week' : 'later'
}

/** Link digitado sem "https://" também abre. Devolve null se não parece um endereço. */
export function linkHref(link: string | undefined): string | null {
  const t = link?.trim()
  if (!t) return null
  if (/^https?:\/\//i.test(t)) return t
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return `https://${t}`
  return null
}

/** As pendências que o app vê, sem as marcadas "Não preciso". */
export function docHealth(doc: TripDoc): Issue[] {
  return health(doc.itinerary, doc).filter((i) => !doc.taskMeta?.[autoKey(i)]?.skip)
}

/** Progresso e XP: "Não preciso" conta como resolvida (sem XP do que não foi feito); +5 por tarefa feita. */
export function docProgress(doc: TripDoc) {
  const done = (doc.tasks ?? []).filter((t) => t.done).length
  return progress(doc.itinerary, {
    ...doc,
    skip: (key) => !!doc.taskMeta?.[key]?.skip,
    extraXp: done * TASK_XP,
  })
}
