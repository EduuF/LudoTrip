// Os limites anti-abuso (spec publicação §4.7) num lugar só.

/** Viagens por conta. */
export const MAX_TRIPS = 100
/** Pessoas por viagem (contando o Dono). */
export const MAX_MEMBERS = 20
/** Convites ainda sem uso, por viagem. */
export const MAX_PENDING_INVITES = 10
/** Quanto tempo vale um convite. */
export const INVITE_MS = 7 * 24 * 60 * 60 * 1000
/** Quanto tempo uma viagem apagada para todos fica em "Apagadas". */
export const DELETED_MS = 30 * 24 * 60 * 60 * 1000
