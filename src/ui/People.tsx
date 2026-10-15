import { useEffect, useState } from 'react'
import { useApp, uid } from '../app/store'
import {
  ago,
  askToPlan,
  canEdit,
  expired,
  faces,
  initial,
  inviteFor,
  inviteLine,
  invitableRoles,
  ROLE_NAMES,
} from '../app/people'
import type { HistoryItem, Member, PendingInvite } from '../sync/peopleApi'
import type { Role } from '../sync/protocol'

// Colaboração (spec publicação §4): os rostos no topo, PESSOAS, CONVIDAR (3 toques), o membro, o
// convite aguardando, o Histórico e "Você está vendo".

const copy = (text: string) =>
  navigator.clipboard?.writeText(text).then(
    () => true,
    () => false,
  ) ?? Promise.resolve(false)

function Face({
  m,
  online,
  size = 28,
}: {
  m: Pick<Member, 'name' | 'photo'>
  online?: boolean
  size?: number
}) {
  return (
    <span
      className={`face${online ? ' online' : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {m.photo ? <img src={m.photo} alt="" referrerPolicy="no-referrer" /> : initial(m.name)}
    </span>
  )
}

/** No topo da viagem: até 3 rostos + "+N" (abre PESSOAS) e o "+" (abre CONVIDAR). */
export function Faces() {
  const cloudEnabled = useApp((s) => s.cloudEnabled)
  const people = useApp((s) => s.people)
  const me = useApp((s) => s.account?.uid ?? null)
  const doc = useApp((s) => s.doc)
  const openSheet = useApp((s) => s.openSheet)
  const startInvite = useApp((s) => s.startInvite)
  if (!cloudEnabled || !doc) return null
  const { shown, more } = faces(people, me)
  const online = new Set(people?.online ?? [])
  const role = doc.meta.cloud?.role
  const canInvite = !role || invitableRoles(role).length > 0
  return (
    <div className="faces-row">
      {shown.length ? (
        <button
          type="button"
          className="hud-btn faces"
          aria-label={`Pessoas: ${people!.members.map((m) => m.name).join(', ')}`}
          onClick={() => openSheet({ kind: 'people' })}
        >
          {shown.map((m) => (
            <Face key={m.uid} m={m} online={online.has(m.uid)} size={24} />
          ))}
          {more ? <span className="face more">+{more}</span> : null}
        </button>
      ) : null}
      {canInvite ? (
        <button
          type="button"
          className="hud-btn invite-plus"
          aria-label="Chamar alguém"
          onClick={startInvite}
        >
          +
        </button>
      ) : null}
    </div>
  )
}

/** A etiqueta "Você está vendo" no topo de quem só vê. */
export function ViewingTag() {
  const doc = useApp((s) => s.doc)
  const openSheet = useApp((s) => s.openSheet)
  if (canEdit(doc)) return null
  return (
    <button type="button" className="hud-btn viewing-tag" onClick={() => openSheet({ kind: 'viewing' })}>
      👁 Você está vendo
    </button>
  )
}

export function ViewingSheet() {
  const doc = useApp((s) => s.doc)!
  const people = useApp((s) => s.people)
  const say = useApp((s) => s.say)
  const owner = people?.members.find((m) => m.role === 'owner')?.name ?? null
  return (
    <>
      <h2>Você está vendo</h2>
      <p className="sub">
        Você acompanha {doc.meta.name}: vê tudo na hora, mas não muda nada. Para planejar junto, peça
        {owner ? ` a ${owner}` : ' ao Dono'}.
      </p>
      <button
        type="button"
        className="btn main"
        onClick={() =>
          void copy(askToPlan(doc.meta.name, owner)).then((ok) =>
            say(ok ? `Mensagem copiada: mande para ${owner ?? 'o Dono'}.` : askToPlan(doc.meta.name, owner)),
          )
        }
      >
        Pedir para planejar junto
      </button>
    </>
  )
}

// ---------------------------------------------------------------------------
// PESSOAS
// ---------------------------------------------------------------------------

export function PeopleSheet() {
  const doc = useApp((s) => s.doc)!
  const people = useApp((s) => s.people)
  const me = useApp((s) => s.account?.uid ?? null)
  const openSheet = useApp((s) => s.openSheet)
  const startInvite = useApp((s) => s.startInvite)
  const loadPeople = useApp((s) => s.loadPeople)
  const cloud = doc.meta.cloud
  useEffect(() => {
    void loadPeople()
  }, [loadPeople])
  const role = cloud?.role
  const canInvite = !role || invitableRoles(role).length > 0
  const online = new Set(people?.online ?? [])
  return (
    <>
      <h2>Pessoas</h2>
      {cloud ? (
        <section className="people-block">
          <h3>Quem planeja</h3>
          {!people ? <p className="sub">Carregando…</p> : null}
          {people?.members.map((m) => (
            <button
              key={m.uid}
              type="button"
              className="person"
              onClick={() => openSheet({ kind: 'member', uid: m.uid })}
            >
              <Face m={m} online={online.has(m.uid)} />
              <span className="person-text">
                <b>
                  {m.name}
                  {m.uid === me ? ' (você)' : ''}
                </b>
                <small>
                  {ROLE_NAMES[m.role]}
                  {online.has(m.uid) ? ' · online agora' : ''}
                </small>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
        </section>
      ) : (
        <p className="sub">
          📱 Esta viagem está só neste aparelho. Para planejar com alguém, ela vai para a sua conta.
        </p>
      )}
      {canInvite ? (
        <button type="button" className="btn main" onClick={startInvite}>
          + Chamar alguém
        </button>
      ) : null}
      <section className="people-block">
        <h3>Quem vai</h3>
        <TravelersEditor />
      </section>
      {people?.invites.length ? (
        <section className="people-block">
          <h3>Convites aguardando</h3>
          {people.invites.map((i) => (
            <button
              key={i.id}
              type="button"
              className="person"
              onClick={() => openSheet({ kind: 'pendingInvite', inviteId: i.id })}
            >
              <span className="face invite" aria-hidden="true">
                ✉
              </span>
              <span className="person-text">
                <b>{travelerOf(i, doc)?.name ?? 'Convite'}</b>
                <small>{inviteLine(i)}</small>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
        </section>
      ) : null}
    </>
  )
}

const travelerOf = (i: PendingInvite, doc: { itinerary: { travelers: { id: string; name: string }[] } }) =>
  i.travelerId ? doc.itinerary.travelers.find((t) => t.id === i.travelerId) : undefined

/** Quem vai (os bonequinhos do mapa): um de cada vez, para duas pessoas editando não se atropelarem. */
function TravelersEditor() {
  const doc = useApp((s) => s.doc)!
  const people = useApp((s) => s.people)
  const act = useApp((s) => s.act)
  const editable = canEdit(doc)
  const list = doc.itinerary.travelers
  const [names, setNames] = useState<Record<string, string>>({})
  const save = (id: string) => {
    const n = names[id]?.trim()
    const cur = list.find((t) => t.id === id)
    if (n && cur && n !== cur.name)
      act({ type: 'engine', command: { type: 'setTraveler', id, name: n } }, { keep: true })
    setNames((x) => {
      const { [id]: _drop, ...rest } = x
      void _drop
      return rest
    })
  }
  return (
    <div className="field">
      {list.map((t, i) => {
        const inv = inviteFor(t, people)
        const member = t.userId ? people?.members.find((m) => m.uid === t.userId) : undefined
        const tag = member
          ? ROLE_NAMES[member.role]
          : inv
            ? expired(inv)
              ? 'convite vencido'
              : 'convite aguardando'
            : null
        return (
          <div key={t.id} className="row traveler-row">
            {editable && !member ? (
              <input
                className="input"
                style={{ flex: 1 }}
                value={names[t.id] ?? t.name}
                aria-label={`Viajante ${i + 1}`}
                onChange={(e) => setNames((x) => ({ ...x, [t.id]: e.target.value }))}
                onBlur={() => save(t.id)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            ) : (
              <span className="traveler-name" style={{ flex: 1 }}>
                {member ? <Face m={member} size={22} /> : null} {t.name}
              </span>
            )}
            {tag ? <small className="pill">{tag}</small> : null}
            {editable && list.length > 1 ? (
              <button
                type="button"
                className="icon-btn"
                aria-label={`Tirar ${t.name} de Quem vai`}
                onClick={() =>
                  act({ type: 'engine', command: { type: 'removeTraveler', id: t.id } }, { keep: true })
                }
              >
                ×
              </button>
            ) : null}
          </div>
        )
      })}
      {editable ? (
        <button
          type="button"
          className="btn small ghost"
          style={{ alignSelf: 'flex-start' }}
          onClick={() =>
            act(
              {
                type: 'engine',
                command: {
                  type: 'addTraveler',
                  traveler: { id: uid('t'), name: `Viajante ${list.length + 1}` },
                },
              },
              { keep: true },
            )
          }
        >
          + Mais uma pessoa
        </button>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CONVIDAR: o que vai fazer → vai viajar? → como enviar
// ---------------------------------------------------------------------------

type InviteStep =
  | { s: 'role' }
  | { s: 'travels'; role: Exclude<Role, 'owner'> }
  | { s: 'busy' }
  | { s: 'send'; url: string; travels: boolean }

export function InviteSheet() {
  const doc = useApp((s) => s.doc)!
  const createInvite = useApp((s) => s.createInvite)
  const returnToSheet = useApp((s) => s.returnToSheet)
  const say = useApp((s) => s.say)
  const roles = invitableRoles(doc.meta.cloud?.role ?? 'owner')
  const [step, setStep] = useState<InviteStep>(() =>
    roles.length === 1 ? { s: 'travels', role: roles[0]! } : { s: 'role' },
  )
  const make = async (role: Exclude<Role, 'owner'>, travels: boolean) => {
    setStep({ s: 'busy' })
    const url = await createInvite(role, travels)
    if (!url) return setStep({ s: 'travels', role })
    setStep({ s: 'send', url, travels })
  }
  const canShare = typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches

  if (step.s === 'role')
    return (
      <>
        <h2>O que essa pessoa vai fazer?</h2>
        <button type="button" className="opt main" onClick={() => setStep({ s: 'travels', role: 'editor' })}>
          <b>Planejar junto</b>
          <span>Muda o roteiro, as atividades e as tarefas, como você.</span>
        </button>
        <button type="button" className="opt" onClick={() => setStep({ s: 'travels', role: 'viewer' })}>
          <b>Só ver</b>
          <span>Acompanha tudo na hora, sem mudar nada.</span>
        </button>
      </>
    )
  if (step.s === 'travels')
    return (
      <>
        <h2>Essa pessoa vai viajar?</h2>
        <p className="sub">{step.role === 'editor' ? 'Para planejar junto.' : 'Para acompanhar.'}</p>
        <button type="button" className="opt main" onClick={() => void make(step.role, true)}>
          <b>Sim, vai</b>
          <span>Ela entra em Quem vai e aparece no mapa já agora.</span>
        </button>
        <button type="button" className="opt" onClick={() => void make(step.role, false)}>
          <b>Não, só ajuda</b>
        </button>
      </>
    )
  if (step.s === 'busy')
    return (
      <>
        <h2>Criando o convite…</h2>
      </>
    )
  return (
    <>
      <h2>Como enviar?</h2>
      <p className="sub">
        O link vale para uma pessoa e por 7 dias.
        {step.travels ? ' O bonequinho "Convidado" já está no mapa.' : ''}
      </p>
      <p className="invite-link" aria-label="Link do convite">
        {step.url}
      </p>
      {canShare ? (
        <button
          type="button"
          className="btn main"
          onClick={() =>
            void navigator
              .share({
                title: doc.meta.name,
                text: `Vem planejar ${doc.meta.name} comigo no LudoTrip!`,
                url: step.url,
              })
              .catch(() => undefined)
          }
        >
          Enviar link
        </button>
      ) : null}
      <button
        type="button"
        className={`btn${canShare ? ' ghost' : ' main'}`}
        onClick={() => void copy(step.url).then((ok) => say(ok ? 'Link copiado' : step.url))}
      >
        Copiar link
      </button>
      <button type="button" className="btn ghost" disabled aria-describedby="email-soon">
        Por e-mail
      </button>
      <small id="email-soon" className="sub">
        Por e-mail: em breve.
      </small>
      <button type="button" className="btn" onClick={() => returnToSheet({ kind: 'people' })}>
        Pronto ✓
      </button>
    </>
  )
}

// ---------------------------------------------------------------------------
// Um membro
// ---------------------------------------------------------------------------

export function MemberSheet({ uid: who }: { uid: string }) {
  const doc = useApp((s) => s.doc)!
  const people = useApp((s) => s.people)
  const me = useApp((s) => s.account?.uid ?? null)
  const setMemberRole = useApp((s) => s.setMemberRole)
  const removeMember = useApp((s) => s.removeMember)
  const leaveTrip = useApp((s) => s.leaveTrip)
  const transferTrip = useApp((s) => s.transferTrip)
  const m = people?.members.find((x) => x.uid === who)
  const traveler = doc.itinerary.travelers.find((t) => t.userId === who)
  const [also, setAlso] = useState(!!traveler)
  const [confirm, setConfirm] = useState<'transfer' | 'remove' | 'leave' | null>(null)
  if (!m) return <h2>Esta pessoa não está mais na viagem.</h2>
  const iAmOwner = people?.me === 'owner'
  const online = people?.online.includes(m.uid)
  const self = m.uid === me
  return (
    <>
      <div className="row member-head">
        <Face m={m} online={online} size={44} />
        <span className="person-text">
          <h2>{m.fullName ?? m.name}</h2>
          <small>
            {ROLE_NAMES[m.role]} · entrou {ago(m.joinedAt)}
            {online ? ' · online agora' : ''}
          </small>
        </span>
      </div>

      {iAmOwner && !self ? (
        <>
          <div className="field">
            <span>Papel</span>
            <div className="seg" role="radiogroup" aria-label="Papel">
              {(['editor', 'viewer'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={m.role === r}
                  className={m.role === r ? 'on' : ''}
                  onClick={() => m.role !== r && void setMemberRole(m.uid, r)}
                >
                  {ROLE_NAMES[r]}
                </button>
              ))}
            </div>
          </div>
          {confirm === 'transfer' ? (
            <div className="confirm-box">
              <p className="sub">
                {m.name} vira o Dono: pode chamar e tirar pessoas e apagar a viagem. Você continua planejando
                junto.
              </p>
              <div className="row">
                <button type="button" className="btn main" onClick={() => void transferTrip(m.uid)}>
                  Passar para {m.name}
                </button>
                <button type="button" className="btn ghost" onClick={() => setConfirm(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn ghost" onClick={() => setConfirm('transfer')}>
              Passar a viagem para {m.name}…
            </button>
          )}
          {confirm === 'remove' ? (
            <div className="confirm-box">
              {traveler ? (
                <label className="toggle-row">
                  <span>
                    <b>Também sai de Quem vai?</b>
                    <small>Tira o bonequinho de {m.name} do mapa.</small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={also}
                    onChange={(e) => setAlso(e.target.checked)}
                  />
                </label>
              ) : null}
              <div className="row">
                <button type="button" className="btn warn" onClick={() => void removeMember(m.uid, also)}>
                  Tirar {m.name}
                </button>
                <button type="button" className="btn ghost" onClick={() => setConfirm(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn ghost" onClick={() => setConfirm('remove')}>
              Tirar da viagem…
            </button>
          )}
        </>
      ) : null}

      {self && m.role === 'owner' ? (
        <p className="sub">Você é o Dono. Para sair, passe a viagem para alguém antes.</p>
      ) : null}
      {self && m.role !== 'owner' ? (
        confirm === 'leave' ? (
          <div className="confirm-box">
            <p className="sub">{doc.meta.name} some das suas viagens. Para voltar, só com um convite novo.</p>
            <div className="row">
              <button type="button" className="btn warn" onClick={() => void leaveTrip()}>
                Sair de {doc.meta.name}
              </button>
              <button type="button" className="btn ghost" onClick={() => setConfirm(null)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn ghost" onClick={() => setConfirm('leave')}>
            Sair da viagem…
          </button>
        )
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Um convite aguardando
// ---------------------------------------------------------------------------

export function PendingInviteSheet({ inviteId }: { inviteId: string }) {
  const doc = useApp((s) => s.doc)!
  const people = useApp((s) => s.people)
  const cancelInvite = useApp((s) => s.cancelInvite)
  const resendInvite = useApp((s) => s.resendInvite)
  const say = useApp((s) => s.say)
  const [url, setUrl] = useState<string | null>(null)
  const inv = people?.invites.find((i) => i.id === inviteId)
  if (!inv && !url) return <h2>Este convite não está mais aguardando.</h2>
  const t = inv ? travelerOf(inv, doc) : undefined
  // Reenviar: um link novo com o mesmo papel (o antigo para de valer). O "Convidado" continua.
  const resend = async () => {
    if (!inv) return
    const next = await resendInvite(inv)
    if (next) setUrl(next)
  }
  return (
    <>
      <h2>{t?.name ?? 'Convite'}</h2>
      {inv ? <p className="sub">{inviteLine(inv)}</p> : null}
      {url ? (
        <>
          <p className="sub">Link novo (o antigo não vale mais):</p>
          <p className="invite-link">{url}</p>
          <button
            type="button"
            className="btn main"
            onClick={() => void copy(url).then((ok) => say(ok ? 'Link copiado' : url))}
          >
            Copiar link
          </button>
        </>
      ) : (
        <>
          <p className="sub">
            {inv && expired(inv)
              ? 'Este convite venceu sem ninguém entrar.'
              : 'O link só aparece quando é criado. Se perdeu, mande um novo.'}
          </p>
          <button type="button" className="btn main" onClick={() => void resend()}>
            Reenviar (link novo)
          </button>
          <button type="button" className="btn ghost" onClick={() => inv && void cancelInvite(inv)}>
            {t ? `Cancelar e tirar ${t.name}` : 'Cancelar o convite'}
          </button>
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------

const dayOf = (at: number, now = new Date()) => {
  const d = new Date(at)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(d, now)) return 'Hoje'
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (same(d, y)) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
}
const hhmm = (at: number) => new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export function HistorySheet() {
  const loadHistory = useApp((s) => s.loadHistory)
  const [items, setItems] = useState<HistoryItem[] | null>(null)
  const [more, setMore] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    void loadHistory().then((r) => {
      if (!r) return setFailed(true)
      setItems(r.items)
      setMore(r.more)
    })
  }, [loadHistory])
  const next = async () => {
    const r = await loadHistory(items?.at(-1)?.seq)
    if (!r) return
    setItems((x) => [...(x ?? []), ...r.items])
    setMore(r.more)
  }
  let last = ''
  return (
    <>
      <h2>Histórico</h2>
      {failed ? <p className="sub">Sem internet: o Histórico aparece quando a conexão voltar.</p> : null}
      {!items && !failed ? <p className="sub">Carregando…</p> : null}
      {items && !items.length ? (
        <p className="sub">Nada mudou ainda desde que a viagem foi para a nuvem.</p>
      ) : null}
      <ul className="history">
        {items?.map((h) => {
          const day = dayOf(h.at)
          const head = day !== last
          last = day
          return (
            <li key={h.seq}>
              {head ? <h3>{day}</h3> : null}
              <span>
                <b>{h.name}</b> · {hhmm(h.at)} · {h.text}
              </span>
            </li>
          )
        })}
      </ul>
      {more ? (
        <button type="button" className="btn ghost" onClick={() => void next()}>
          Ver mais
        </button>
      ) : null}
    </>
  )
}
