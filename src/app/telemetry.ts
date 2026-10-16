// Telemetria (spec publicação §5.6–5.7): erros no Sentry e métricas de uso no PostHog (UE).
// - Sem chaves (testes, GitHub Pages): nada é carregado nem enviado.
// - Métricas ligadas por padrão (opt-out, retorno do staging): estatísticas de uso sem conteúdo, por
//   legítimo interesse. Quem desliga em "Privacidade" não manda mais nada (o PostHog nem carrega).
// - Nunca texto digitado nem nomes: os eventos levam só chaves permitidas, com valores curtos.
// - A pessoa aparece como um código (hash do uid), nunca e-mail.
// LGPD: o mínimo para um app pequeno; precisa de atenção se o app escalar (spec §6.4).

export type EventName =
  | 'app_aberto'
  | 'viagem_criada'
  | 'edicao'
  | 'login_oferecido'
  | 'login_feito'
  | 'viagens_subiram'
  | 'conflito'
  | 'offline_fila'
  | 'painel_aberto'
  | 'animacao'
  // Colaboração (M5)
  | 'convite_iniciado'
  | 'convite_criado'
  | 'convite_cancelado'
  | 'convite_aberto'
  | 'convite_aceito'
  | 'pessoa_chegou'
  | 'membro_removido'
  | 'saiu_da_viagem'
  | 'viagem_passada'
  | 'viagem_apagada'
  | 'viagem_recuperada'
  | 'historico_aberto'

type Props = Record<string, string | number | boolean>

/** Chaves que um evento pode levar: nada de texto livre. */
const ALLOWED = new Set([
  'type',
  'trigger',
  'method',
  'count',
  'reason',
  'status',
  'kind',
  'cloud',
  'pending',
  'momento',
  'variacao',
  'minima',
  'role',
  'travels',
  'traveler',
  'ok',
  'already',
])
const MAX_VALUE = 40

const CONSENT_KEY = 'ludotrip.consent'

interface PostHogLike {
  capture(event: string, props?: Props): void
  identify(id: string): void
  reset(): void
  opt_out_capturing(): void
}
interface SentryLike {
  captureException(e: unknown, ctx?: { extra?: Props }): void
  setUser(u: { id: string } | null): void
}

let posthog: PostHogLike | null = null
let sentry: SentryLike | null = null
let userHash: string | null = null

const env = () => import.meta.env as ImportMetaEnv & Record<string, string | undefined>

/** As estatísticas de uso estão ligadas? Sim, a menos que a pessoa tenha desligado. */
export function getConsent(): 'yes' | 'no' {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'no' ? 'no' : 'yes'
  } catch {
    return 'yes'
  }
}

/** As métricas podem existir neste build (há chave do PostHog)? */
export const metricsAvailable = () => !!env().VITE_POSTHOG_KEY

/** Deixa só as chaves permitidas, com valores curtos. */
export function cleanProps(props: Props = {}): Props {
  const out: Props = {}
  for (const [k, v] of Object.entries(props)) {
    if (!ALLOWED.has(k)) continue
    if (typeof v === 'string' && v.length > MAX_VALUE) continue
    out[k] = v
  }
  return out
}

async function loadPostHog() {
  const key = env().VITE_POSTHOG_KEY
  if (!key || posthog) return
  const { default: ph } = await import('posthog-js')
  ph.init(key, {
    api_host: 'https://eu.i.posthog.com',
    person_profiles: 'identified_only',
    // Só os eventos que o app manda (o clique automático levaria textos da tela, como nomes de viagens).
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_surveys: true,
    session_recording: { maskAllInputs: true, maskTextSelector: '*' },
  })
  // Quem desligou e ligou de novo: o PostHog lembra do "desligado" no armazenamento dele.
  if (ph.has_opted_out_capturing()) ph.opt_in_capturing()
  posthog = ph as unknown as PostHogLike
  if (userHash) posthog.identify(userHash)
}

export async function setConsent(v: 'yes' | 'no'): Promise<void> {
  try {
    localStorage.setItem(CONSENT_KEY, v)
  } catch {
    // vale só nesta aba
  }
  if (v === 'yes') await loadPostHog()
  else if (posthog) {
    posthog.opt_out_capturing()
    posthog.reset()
    posthog = null
  }
}

/** Liga o que este build e a pessoa permitem. Chamado uma vez, ao abrir o app. */
export async function initTelemetry(): Promise<void> {
  const dsn = env().VITE_SENTRY_DSN
  if (dsn) {
    const S = await import('@sentry/react')
    S.init({
      dsn,
      release: env().VITE_APP_VERSION,
      environment: env().VITE_APP_ENV ?? 'dev',
      sendDefaultPii: false,
      tracesSampleRate: 0,
    })
    sentry = S as unknown as SentryLike
  }
  if (getConsent() !== 'no') await loadPostHog()
}

export function track(event: EventName, props?: Props): void {
  try {
    posthog?.capture(event, cleanProps(props))
  } catch {
    // métrica nunca quebra o app
  }
}

export function captureError(e: unknown, extra?: Props): void {
  try {
    sentry?.captureException(e, extra ? { extra: cleanProps(extra) } : undefined)
  } catch {
    // idem
  }
}

/** Quem está usando, como um código (hash do uid). null ao sair. */
export async function identify(uid: string | null): Promise<void> {
  if (!uid) {
    userHash = null
    sentry?.setUser(null)
    posthog?.reset()
    return
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ludotrip:${uid}`))
  userHash = [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('')
  sentry?.setUser({ id: userHash })
  posthog?.identify(userHash)
}
