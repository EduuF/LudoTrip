// Log estruturado (spec publicação §5.6): uma linha JSON por requisição e por ação, pesquisável no
// Workers Logs. Nunca e-mail, nome, token ou texto digitado: a pessoa aparece como `uidHash`.

export type LogFields = Record<string, string | number | boolean | null | undefined>

export function log(fields: LogFields): void {
  console.log(JSON.stringify(fields))
}

export function logError(fields: LogFields): void {
  console.error(JSON.stringify(fields))
}

/** 8 hex do SHA-256 do uid: dá para seguir uma pessoa nos logs sem saber quem ela é. */
export async function uidHash(uid: string | null | undefined): Promise<string | null> {
  if (!uid) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uid))
  return [...new Uint8Array(digest).slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
