import { canEdit } from '../app/people'
import { useApp } from '../app/store'

/** Quem só vê (spec publicação §4.6) não tem controles de edição: eles não ficam cinza, não existem. */
export const useCanEdit = (): boolean => useApp((s) => canEdit(s.doc))
