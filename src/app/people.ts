import type { Traveler } from '../engine'
import type { Role } from '../sync/protocol'
import type { Member, PendingInvite, People } from '../sync/peopleApi'
import type { TripDoc } from './doc'

// Regras puras de quem participa (spec publicação §4): o que cada papel pode, os textos e os rostos.

export const ROLE_NAMES: Record<Role, string> = { owner: 'Dono', editor: 'Planeja junto', viewer: 'Só vê' }

/** Só vê não edita. Viagem do aparelho (sem nuvem) sempre edita. */
export const canEdit = (doc: TripDoc | null): boolean => doc?.meta.cloud?.role !== 'viewer'

/** Que convites este papel pode criar: o Dono, os dois; Planeja junto, só "Só ver"; Só vê, nenhum. */
export const invitableRoles = (me: Role): Exclude<Role, 'owner'>[] =>
  me === 'owner' ? ['editor', 'viewer'] : me === 'editor' ? ['viewer'] : []

/** "agora", "há 5 min", "há 2 h", "há 3 dias". */
export function ago(at: number, now = Date.now()): string {
  const min = Math.floor((now - at) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
}

/** "em 3 dias" (quando um convite vence, quando uma apagada some). */
export function inDays(at: number, now = Date.now()): string {
  const d = Math.ceil((at - now) / 86400000)
  if (d <= 0) return 'hoje'
  return d === 1 ? 'amanhã' : `em ${d} dias`
}

export const expired = (inv: PendingInvite, now = Date.now()) => inv.expiresAt <= now

/** "Link · enviado há 2 h · Planeja junto · vai viajar" (ou "convite vencido"). */
export function inviteLine(inv: PendingInvite, now = Date.now()): string {
  const how = inv.email ? `E-mail ${inv.email}` : 'Link'
  const parts = [how, `enviado ${ago(inv.createdAt, now)}`, ROLE_NAMES[inv.role]]
  if (inv.travelerId) parts.push('vai viajar')
  if (expired(inv, now)) parts.push('convite vencido')
  return parts.join(' · ')
}

/** O convite que reservou este viajante, se ele ainda não tem conta. */
export const inviteFor = (t: Traveler, people: People | null): PendingInvite | undefined =>
  t.userId ? undefined : people?.invites.find((i) => i.travelerId === t.id)

/** Os rostos do topo: quem está com a viagem aberta primeiro, depois o Dono, depois por chegada. */
export function faces(people: People | null, myUid: string | null): { shown: Member[]; more: number } {
  if (!people) return { shown: [], more: 0 }
  const online = new Set(people.online)
  const rank = (m: Member) => (online.has(m.uid) ? 0 : 2) + (m.role === 'owner' ? 0 : 1)
  const list = [...people.members].sort((a, b) => rank(a) - rank(b) || a.joinedAt - b.joinedAt)
  // Sozinho na viagem: nada de rosto (só o "+").
  if (list.length === 1 && list[0]!.uid === myUid) return { shown: [], more: 0 }
  return { shown: list.slice(0, 3), more: Math.max(0, list.length - 3) }
}

/** A inicial para o rosto sem foto. */
export const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase()

/** O primeiro nome de quem fez algo (avisos ao vivo). */
export function nameOf(uid: string, people: People | null): string | null {
  return people?.members.find((m) => m.uid === uid)?.name ?? null
}

/** A mensagem que quem só vê manda ao Dono pedindo para planejar junto. */
export const askToPlan = (tripName: string, ownerName: string | null) =>
  `Oi${ownerName ? `, ${ownerName}` : ''}! Pode me passar para "Planeja junto" em ${tripName} no LudoTrip? Quero ajudar a planejar.`
