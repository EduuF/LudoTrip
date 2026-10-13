import { addDays, describeIssue, health, legDayIndex, legName, MODE_NAMES, progress, XP } from '../engine'
import type { Booking, Issue } from '../engine'
import { uid, useApp } from '../app/store'
import type { DocAction } from '../app/doc'
import { markLodging } from '../app/choices'

// Tarefas: a Saúde do roteiro com textos de quem viaja e resolução num toque (spec §17.6).

const SEV = { alert: 'URGENTE', warn: 'ATENÇÃO', info: 'TAREFA' } as const
const REWARD: Partial<Record<Issue['kind'], number>> = {
  'transport-missing': XP.ticket,
  'lodging-missing': XP.lodging,
  'lodging-partial': XP.lodging,
  'must-unscheduled': XP.must,
}

export function Tarefas() {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const openSheet = useApp((s) => s.openSheet)
  const focusOn = useApp((s) => s.focusOn)
  const it = doc.itinerary
  const issues = health(it, doc)
  const p = progress(it, doc)
  const names = { destinations: doc.destinations, places: doc.places }
  const label = { ticket: 'Passagens', lodging: 'Hospedagens', must: 'Imperdíveis' }

  const goTo = (i: Issue) => {
    const d = i.data ?? {}
    if (i.target.kind === 'stop') {
      return focusOn(`c-${i.target.id}`, 'mapa')
    }
    if (i.target.kind === 'leg') return focusOn(`l-${i.target.id}`, 'mapa')
    if (i.target.kind === 'place') return focusOn(`p-${i.target.id}`, 'atividades')
    if (i.target.kind === 'booking') {
      if (d.stopId) return focusOn(`c-${String(d.stopId)}`, 'mapa')
      if (d.legId) return focusOn(`l-${String(d.legId)}`, 'mapa')
    }
  }

  const quick = (i: Issue): { label: string; run: () => void } | null => {
    if (i.kind === 'transport-missing') {
      const leg = it.legs.find((l) => l.id === i.target.id)
      const idx = leg ? legDayIndex(it, leg.id) : null
      if (!leg || idx === null || !it.start) return null
      const end = (e: string) =>
        e === 'home' ? 'home' : (it.stops.find((s) => s.id === e)?.destinationId ?? null)
      const from = end(leg.from)
      const to = end(leg.to)
      if (!from || !to) return null
      return {
        label: 'Marcar comprada',
        run: () => {
          const booking: Booking = {
            id: uid('k'),
            kind: 'transport',
            title: `Passagem ${legName(it, leg, names)}`,
            fromDestinationId: from,
            toDestinationId: to,
            date: addDays(it.start!, idx),
            mode: leg.mode,
            status: 'booked',
          }
          const actions: DocAction[] = [{ type: 'addBooking', booking }]
          if (leg.to === 'home' && it.lock === 'free')
            actions.push({ type: 'engine', command: { type: 'setLock', lock: 'fixed' } })
          act(actions.length > 1 ? { type: 'batch', actions } : actions[0]!, { stamp: true })
        },
      }
    }
    if (i.kind === 'lodging-missing' || i.kind === 'lodging-partial')
      return { label: 'Marcar reservada', run: () => markLodging(i.target.id) }
    if (i.kind === 'must-unscheduled') {
      const place = doc.places.find((x) => x.id === i.target.id)
      if (!place) return null
      return {
        label: 'Pôr num dia',
        run: () =>
          openSheet({
            kind: 'days',
            title: `Pôr ${place.name} em qual dia?`,
            prefer: place.destinationId,
            pick: (ref) =>
              act({
                type: 'engine',
                command: { type: 'scheduleVisit', visitId: uid('v'), placeId: place.id, day: ref },
              }),
          }),
      }
    }
    if (i.kind === 'booking-wrong-mode') {
      const b = doc.bookings.find((x) => x.id === i.target.id)
      const legId = String(i.data?.legId ?? '')
      if (b?.kind !== 'transport' || !legId) return null
      return {
        label: `Voltar para ${MODE_NAMES[b.mode]}`,
        run: () => act({ type: 'engine', command: { type: 'setLegMode', legId, mode: b.mode } }),
      }
    }
    if (i.kind.startsWith('booking-'))
      return {
        label: 'Guardar a reserva no arquivo',
        run: () => act({ type: 'setBooking', id: i.target.id, patch: { archived: true } }),
      }
    return null
  }

  return (
    <>
      <h1 className="title">
        Tarefas <em>da viagem</em>
      </h1>
      <div className="pills" style={{ marginTop: 6 }}>
        <span className="pill">
          NÍVEL {p.level} · {p.levelName}
        </span>
        {p.tasks
          .filter((t) => t.total)
          .map((t) => (
            <span key={t.kind} className={`pill${t.done === t.total ? ' ok' : ''}`}>
              {label[t.kind]} {t.done}/{t.total}
            </span>
          ))}
      </div>
      {!issues.length ? (
        <div className="empty">
          <b>Tudo pronto. Boa viagem!</b>
          Nenhuma pendência no roteiro.
        </div>
      ) : (
        <div className="quests">
          {issues.map((i, k) => {
            const q = quick(i)
            const reward = REWARD[i.kind]
            return (
              <div key={`${i.kind}-${i.target.id}-${k}`} className={`quest ${i.severity}`}>
                <span className="qhead">
                  {SEV[i.severity]}
                  {reward ? <span className="xp">+{reward} XP</span> : null}
                </span>
                <p>{describeIssue(i, it, names, doc.bookings)}</p>
                <div className="row">
                  {q ? (
                    <button type="button" className="btn small" onClick={q.run}>
                      {q.label}
                    </button>
                  ) : null}
                  <button type="button" className="btn small ghost" onClick={() => goTo(i)}>
                    Ver
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
