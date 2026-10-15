import { useEffect, useState } from 'react'
import { authClient, useApp } from '../app/store'
import type { SignInResult } from '../auth/authClient'
import { ConsentToggle } from './Consent'

// Entrar e "Sua conta" (spec publicação §3.3, §3.5). O login nunca é barreira: o painel diz por que
// entrar ("para convidar"), não mostra erro quando a pessoa fecha a janela do Google, e depois de
// entrar a pessoa volta ao que estava fazendo (o store retoma a intenção).

type Step =
  | { s: 'start' }
  | { s: 'email'; value: string }
  | { s: 'sent'; email: string; at: number }
  | { s: 'confirm'; value: string }
  | { s: 'busy' }

const MESSAGES: Partial<Record<Exclude<SignInResult, { ok: true }>['reason'], string>> = {
  offline: 'Sem internet. Sua viagem continua salva aqui. Tente quando a conexão voltar.',
  invalid: 'Esse e-mail não parece certo. Confira e tente de novo.',
  error: 'Não deu para entrar agora. Tente de novo daqui a pouco.',
}

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

export function SignInSheet({ reason, confirmEmail }: { reason: string; confirmEmail?: boolean }) {
  const say = useApp((s) => s.say)
  const completeEmailLink = useApp((s) => s.completeEmailLink)
  const [step, setStep] = useState<Step>(confirmEmail ? { s: 'confirm', value: '' } : { s: 'start' })
  const [online, setOnline] = useState(() => navigator.onLine)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    addEventListener('online', on)
    addEventListener('offline', off)
    return () => {
      removeEventListener('online', on)
      removeEventListener('offline', off)
    }
  }, [])
  // "Reenviar" libera depois de 60 s.
  useEffect(() => {
    if (step.s !== 'sent') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [step.s])

  const auth = authClient()
  if (!auth) return <p className="sub">Entrar não está disponível agora.</p>

  const report = (r: SignInResult, back: Step) => {
    if (r.ok) return
    setStep(back)
    // Fechar a janela do Google não é erro: volta calado.
    if (r.reason === 'cancelled') return
    const text = MESSAGES[r.reason] ?? MESSAGES.error!
    say(text, true)
  }

  const google = async () => {
    setStep({ s: 'busy' })
    report(await auth.signInWithGoogle(), { s: 'start' })
  }

  const send = async (email: string) => {
    setStep({ s: 'busy' })
    const r = await auth.sendEmailLink(email.trim())
    if (r.ok) setStep({ s: 'sent', email: email.trim(), at: Date.now() })
    else report(r, { s: 'email', value: email })
  }

  const confirm = async (email: string) => {
    setStep({ s: 'busy' })
    const r = await completeEmailLink(email.trim())
    if (!r.ok) report(r, { s: 'confirm', value: email })
  }

  if (step.s === 'confirm')
    return (
      <>
        <h2>Confirme seu e-mail</h2>
        <p className="sub">Por segurança, o link pede o e-mail para o qual ele foi enviado.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (looksLikeEmail(step.value)) void confirm(step.value)
          }}
        >
          <input
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            aria-label="Seu e-mail"
            placeholder="seu@email.com"
            value={step.value}
            autoFocus
            onChange={(e) => setStep({ s: 'confirm', value: e.target.value })}
          />
          <button type="submit" className="btn main" disabled={!looksLikeEmail(step.value) || !online}>
            Confirmar e entrar
          </button>
        </form>
      </>
    )

  if (step.s === 'sent') {
    const wait = Math.max(0, 60 - Math.floor((now - step.at) / 1000))
    return (
      <>
        <h2>Veja seu e-mail ✉️</h2>
        <p className="sub">
          Enviamos um link para <b>{step.email}</b>. Abra o link <b>neste mesmo celular</b> para entrar.
        </p>
        <p className="sub">Não chegou? Olhe também a caixa de spam.</p>
        <div className="row">
          <button
            type="button"
            className="btn small"
            disabled={wait > 0 || !online}
            onClick={() => void send(step.email)}
          >
            {wait > 0 ? `Reenviar (${wait} s)` : 'Reenviar'}
          </button>
          <button
            type="button"
            className="btn small ghost"
            onClick={() => setStep({ s: 'email', value: step.email })}
          >
            Trocar e-mail
          </button>
        </div>
      </>
    )
  }

  const busy = step.s === 'busy'
  return (
    <>
      <h2>Entrar {reason}</h2>
      <p className="sub">
        Suas viagens ficam guardadas na sua conta: você abre em qualquer aparelho, planeja junto com quem
        quiser e nunca perde nada.
      </p>
      {!online ? <p className="sub warn-text">Sem internet. Sua viagem continua salva aqui.</p> : null}
      <button type="button" className="btn big main" disabled={busy || !online} onClick={() => void google()}>
        Continuar com Google
      </button>
      {step.s === 'email' ? (
        <form
          className="signin-email"
          onSubmit={(e) => {
            e.preventDefault()
            if (looksLikeEmail(step.value)) void send(step.value)
          }}
        >
          <input
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            aria-label="Seu e-mail"
            placeholder="seu@email.com"
            value={step.value}
            autoFocus
            onChange={(e) => setStep({ s: 'email', value: e.target.value })}
          />
          <button type="submit" className="btn main" disabled={!looksLikeEmail(step.value) || !online}>
            Enviar link
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="btn big"
          disabled={busy || !online}
          onClick={() => setStep({ s: 'email', value: '' })}
        >
          Receber link por e-mail
        </button>
      )}
      <p className="sub small-print">Sem senha para lembrar. Você pode sair quando quiser.</p>
    </>
  )
}

export function AccountSheet() {
  const account = useApp((s) => s.account)
  const pendingCount = useApp((s) => s.pendingCount)
  const signOut = useApp((s) => s.signOut)
  const [asking, setAsking] = useState<number | null>(null)
  if (!account) return <p className="sub">Você não está numa conta.</p>
  const leave = async () => {
    const n = await pendingCount()
    if (n > 0) return setAsking(n)
    await signOut()
  }
  return (
    <>
      <div className="account-who">
        {account.picture ? (
          <img src={account.picture} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="seal">{(account.name ?? account.email ?? '?').slice(0, 1)}</span>
        )}
        <span>
          <b>{account.name ?? 'Sua conta'}</b>
          {account.email ? <span className="sub">{account.email}</span> : null}
        </span>
      </div>
      <ConsentToggle />
      {asking ? (
        <>
          <p className="sub warn-text">
            {asking === 1
              ? '1 alteração ainda não foi enviada.'
              : `${asking} alterações ainda não foram enviadas.`}{' '}
            Se sair agora, elas se perdem.
          </p>
          <button type="button" className="btn main" onClick={() => setAsking(null)}>
            Esperar enviar
          </button>
          <button type="button" className="btn ghost" onClick={() => void signOut()}>
            Sair mesmo assim
          </button>
        </>
      ) : (
        <button type="button" className="btn" onClick={() => void leave()}>
          Sair da conta
        </button>
      )}
    </>
  )
}

/**
 * Aparelho que já teve outra conta (spec publicação §3.5): a pessoa escolhe o que é dela. Nada vem
 * marcado: num computador compartilhado, levar viagens de outra pessoa seria pior que não levar.
 */
export function AdoptSheet({ trips }: { trips: { id: string; name: string }[] }) {
  const uploadTrips = useApp((s) => s.uploadTrips)
  const closeSheet = useApp((s) => s.closeSheet)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setChosen((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  return (
    <>
      <h2>Levar estas viagens para a sua conta?</h2>
      <p className="sub">Este aparelho já foi usado com outra conta. Marque só as viagens que são suas.</p>
      <div className="adopt-list">
        {trips.map((t) => (
          <label key={t.id} className="adopt-row">
            <input type="checkbox" checked={chosen.has(t.id)} onChange={() => toggle(t.id)} />
            <span>{t.name}</span>
          </label>
        ))}
      </div>
      <button
        type="button"
        className="btn main"
        disabled={!chosen.size}
        onClick={() => {
          closeSheet()
          void uploadTrips([...chosen])
        }}
      >
        {chosen.size > 1 ? `Levar ${chosen.size} viagens` : 'Levar para a minha conta'}
      </button>
      <button type="button" className="btn ghost" onClick={closeSheet}>
        Deixar todas só neste aparelho
      </button>
    </>
  )
}

/** Instalar o app (spec publicação §3.2, §6.6): no iPhone, o Safari só guarda de vez o que está instalado. */
export function InstallSheet() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
  return (
    <>
      <h2>Instale o LudoTrip no celular</h2>
      <p className="sub">
        Ele abre como um app, funciona sem internet e{' '}
        {ios ? 'o iPhone não apaga suas viagens.' : 'fica a um toque.'}
      </p>
      {ios ? (
        <ol className="install-steps">
          <li>
            Toque em <b>Compartilhar</b> <span aria-hidden="true">⬆️</span> na barra do Safari.
          </li>
          <li>
            Role e toque em <b>Adicionar à Tela de Início</b> <span aria-hidden="true">➕</span>.
          </li>
          <li>
            Toque em <b>Adicionar</b>. Pronto: o LudoTrip aparece entre os seus apps.
          </li>
        </ol>
      ) : (
        <ol className="install-steps">
          <li>
            Toque no menu <b>⋮</b> do navegador.
          </li>
          <li>
            Toque em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>).
          </li>
          <li>Confirme. O LudoTrip aparece entre os seus apps.</li>
        </ol>
      )}
    </>
  )
}

/**
 * Onde a viagem está, no painel "Sua viagem" (spec publicação §3.1–3.2): 📱 ou ☁️, "Guardar na nuvem" e
 * "Abrir em outro aparelho" (que é o desejo; a conta é o caminho).
 */
export function TripCloudRow() {
  const doc = useApp((s) => s.doc)
  const cloudEnabled = useApp((s) => s.cloudEnabled)
  const account = useApp((s) => s.account)
  const saveToCloud = useApp((s) => s.saveToCloud)
  const openSignIn = useApp((s) => s.openSignIn)
  const say = useApp((s) => s.say)
  const [how, setHow] = useState(false)
  if (!cloudEnabled || !doc || doc.meta.example) return null
  const cloud = !!doc.meta.cloud
  const link = `${location.origin}${import.meta.env.BASE_URL}v/${encodeURIComponent(doc.meta.id)}`
  const other = () => {
    if (!account) return openSignIn('para abrir em outro aparelho', { kind: 'tripSheet' })
    if (!cloud) void saveToCloud(doc.meta.id)
    setHow(true)
  }
  return (
    <div className="cloud-row">
      <p className="sub">{cloud ? '☁️ Salva na sua conta' : '📱 Só neste aparelho'}</p>
      <div className="row">
        {!cloud ? (
          <button type="button" className="btn small" onClick={() => void saveToCloud(doc.meta.id)}>
            Guardar na nuvem
          </button>
        ) : null}
        <button type="button" className="btn small ghost" onClick={other}>
          Abrir em outro aparelho
        </button>
      </div>
      {how && account ? (
        <div className="cloud-how">
          <p className="sub">
            No outro aparelho, abra o LudoTrip e entre com <b>{account.email ?? 'a mesma conta'}</b>. A viagem
            estará lá.
          </p>
          <button
            type="button"
            className="btn small"
            onClick={() =>
              void navigator.clipboard?.writeText(link).then(
                () => say('Link da viagem copiado.'),
                () => say(link),
              )
            }
          >
            Copiar o link da viagem
          </button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * A missão "Guardar a viagem na nuvem ☁️" (spec publicação §3.2) na aba Tarefas, onde a pessoa já
 * procura o que falta fazer. Nunca vira pop-up; "Não preciso" esconde para esta viagem.
 */
export function CloudQuest() {
  const doc = useApp((s) => s.doc)
  const cloudEnabled = useApp((s) => s.cloudEnabled)
  const saveToCloud = useApp((s) => s.saveToCloud)
  const id = doc?.meta.id ?? ''
  const key = `ludotrip.cloudQuestSkip.${id}`
  const [skipped, setSkipped] = useState(() => {
    try {
      return localStorage.getItem(key) === '1'
    } catch {
      return false
    }
  })
  if (!cloudEnabled || !doc || doc.meta.cloud || doc.meta.example || skipped) return null
  return (
    <div className="quest info cloud-quest">
      <span className="qhead">PARA FAZER · o app viu</span>
      <b>Guardar a viagem na nuvem ☁️</b>
      <small>Para abrir em outro aparelho, planejar junto e nunca perder.</small>
      <div className="row">
        <button type="button" className="btn small" onClick={() => void saveToCloud(id)}>
          Guardar na nuvem
        </button>
        <button
          type="button"
          className="btn small ghost"
          onClick={() => {
            setSkipped(true)
            try {
              localStorage.setItem(key, '1')
            } catch {
              // vale só nesta aba
            }
          }}
        >
          Não preciso
        </button>
      </div>
    </div>
  )
}
