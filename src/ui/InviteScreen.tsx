import { useEffect } from 'react'
import { useApp } from '../app/store'
import { Travelers } from './kit'

// /convite/<token> (spec publicação §4.4): a prévia abre sem conta e mostra pouco (nome da viagem,
// quem chamou, datas e destinos). "Entrar e participar" leva a ENTRAR e, depois, direto à viagem.

const day = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) : null

export function InviteScreen() {
  const invite = useApp((s) => s.invite)
  const account = useApp((s) => s.account)
  const acceptInvite = useApp((s) => s.acceptInvite)
  const openInvite = useApp((s) => s.openInvite)
  const goHome = useApp((s) => s.goHome)
  const result = invite?.result
  useEffect(() => {
    document.title = result?.ok ? `Convite · ${result.preview.tripName}` : 'Convite · LudoTrip'
  }, [result])
  if (!invite) return null

  let body
  if (!result) body = <p className="sub">Abrindo o convite…</p>
  else if (!result.ok) {
    const who = result.inviter ?? 'quem te chamou'
    const text =
      result.reason === 'deleted'
        ? 'Esta viagem foi apagada.'
        : result.reason === 'full'
          ? 'Esta viagem já está cheia (20 pessoas).'
          : result.reason === 'offline'
            ? 'Sem internet: não deu para abrir o convite.'
            : `Este convite não vale mais. Peça outro a ${who}.`
    body = (
      <>
        <h1 className="invite-title">{text}</h1>
        {result.reason === 'offline' ? (
          <button type="button" className="btn big main" onClick={() => void openInvite(invite.token)}>
            Tentar de novo
          </button>
        ) : null}
        <button type="button" className="btn big" onClick={goHome}>
          Suas viagens
        </button>
      </>
    )
  } else {
    const p = result.preview
    const start = day(p.start)
    const end = day(p.end)
    body = (
      <>
        <p className="invite-who">
          <b>{p.inviter}</b> te chamou para {p.role === 'editor' ? 'planejar junto' : 'acompanhar'}
        </p>
        <h1 className="invite-title">{p.tripName}</h1>
        {start ? <p className="sub">{end && end !== start ? `${start} → ${end}` : start}</p> : null}
        {p.destinations.length ? (
          <p className="invite-route" aria-label="Destinos">
            {p.destinations.join(' → ')}
          </p>
        ) : null}
        <div className="invite-cast" aria-hidden="true">
          <Travelers count={p.travels ? 3 : 2} height={45} />
        </div>
        <p className="sub">
          {p.role === 'editor'
            ? 'Você vai poder mudar o roteiro, as atividades e as tarefas junto com o grupo.'
            : 'Você vai ver tudo na hora, sem mudar nada.'}
          {p.travels ? ' Você aparece em Quem vai, no mapa.' : ''}
        </p>
        <button
          type="button"
          className="btn big main"
          disabled={invite.busy}
          onClick={() => void acceptInvite()}
        >
          {invite.busy
            ? 'Entrando…'
            : account
              ? `Participar como ${account.name?.split(' ')[0] ?? account.email}`
              : 'Entrar e participar'}
        </button>
        <button type="button" className="btn ghost" onClick={goHome}>
          Agora não
        </button>
      </>
    )
  }
  return (
    <div className="wrap invite-screen">
      <span className="wm" aria-hidden="true">
        招
      </span>
      <p className="invite-brand">
        Ludo<em>Trip</em> · convite
      </p>
      {body}
    </div>
  )
}
