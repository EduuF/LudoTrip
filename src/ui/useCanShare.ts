import { useApp } from '../app/store'
import { invitableRoles } from '../app/people'

/** Dá para compartilhar esta viagem? Com nuvem; a viagem do aparelho sobe antes; quem só vê, não. */
export function useCanShare(): boolean {
  const cloudEnabled = useApp((s) => s.cloudEnabled)
  const role = useApp((s) => (s.doc ? (s.doc.meta.cloud?.role ?? 'owner') : null))
  return cloudEnabled && !!role && invitableRoles(role).length > 0
}
