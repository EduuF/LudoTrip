import {
  describeIssue,
  health,
  legName,
  MODE_NAMES,
  progress,
  stopName,
  XP,
  days as allDays,
} from '../engine'
import type { Issue } from '../engine'
import { useApp } from '../app/store'
import { askStartDate, buyTicket, markLodging, scheduleOnce } from '../app/choices'
import { LevelLine } from './LevelLine'

// Tarefas: a Saúde do roteiro com textos de quem viaja e resolução num toque (spec §17.6, §17.12).
// Cada tarefa diz o que falta, tem a ação que resolve (quando há) e "Ir para …" que leva ao lugar dela.

const SEV = { alert: 'PRECISA RESOLVER', warn: 'ATENÇÃO', info: 'PARA FAZER' } as const
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
  const openStopCard = useApp((s) => s.openStopCard)
  const setCursorDay = useApp((s) => s.setCursorDay)
  const it = doc.itinerary
  const issues = health(it, doc)
  const p = progress(it, doc)
  const names = { destinations: doc.destinations, places: doc.places }
  const label = { ticket: 'Passagens', lodging: 'Hospedagens', must: 'Imperdíveis' }
  const dated = !!it.start

  /** Para onde "Ir para …" leva: o cartão do destino (aberto), o trecho, a atividade ou o dia. */
  const where = (i: Issue): { label: string; go: () => void } | null => {
    const d = i.data ?? {}
    const stop = (id: string) => ({
      label: `Ir para ${stopName(it, id, names)}`,
      go: () => {
        openStopCard(id)
        focusOn(`c-${id}`, 'mapa')
      },
    })
    const leg = (id: string) => {
      const l = it.legs.find((x) => x.id === id)
      return {
        label: l ? `Ir para o trecho ${legName(it, l, names)}` : 'Ir para o trecho',
        go: () => focusOn(`l-${id}`, 'mapa'),
      }
    }
    if (i.target.kind === 'stop') return stop(i.target.id)
    if (i.target.kind === 'leg') return leg(i.target.id)
    if (i.target.kind === 'place') {
      const place = doc.places.find((x) => x.id === i.target.id)
      return {
        label: `Ir para ${place?.name ?? 'a atividade'}`,
        go: () => focusOn(`p-${i.target.id}`, 'atividades'),
      }
    }
    if (i.target.kind === 'booking') {
      if (d.stopId) return stop(String(d.stopId))
      if (d.legId) return leg(String(d.legId))
      // Reserva sem lugar no roteiro: as reservas ficam em "Sua viagem".
      return { label: 'Ver as reservas', go: () => openSheet({ kind: 'trip' }) }
    }
    if (i.target.kind === 'anchor') {
      const a = it.anchors.find((x) => x.id === i.target.id)
      const day = a ? allDays(it).find((x) => x.date === a.date) : undefined
      if (!day) return null
      return {
        label: `Ver ${day.label}`,
        go: () => {
          useApp.getState().setTab('mapa')
          setCursorDay(day.index)
        },
      }
    }
    return null
  }

  const quick = (i: Issue): { label: string; run: () => void } | null => {
    if (i.kind === 'transport-missing')
      return dated
        ? { label: 'Marcar comprada', run: () => buyTicket(i.target.id) }
        : {
            label: 'Escolher a data de ida',
            run: () => askStartDate('Para marcar a passagem, escolha primeiro a data de ida.'),
          }
    if (i.kind === 'lodging-missing' || i.kind === 'lodging-partial')
      return dated
        ? { label: 'Marcar reservada', run: () => markLodging(i.target.id) }
        : {
            label: 'Escolher a data de ida',
            run: () => askStartDate('Para anotar a hospedagem, escolha primeiro a data de ida.'),
          }
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
            placeId: place.id,
            pick: (ref) => scheduleOnce(place.id, ref),
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
        label: 'Tirar a reserva do roteiro',
        run: () => act({ type: 'setBooking', id: i.target.id, patch: { archived: true } }),
      }
    return null
  }

  return (
    <>
      <h1 className="title">
        Tarefas <em>da viagem</em>
      </h1>
      <LevelLine />
      <div className="pills" style={{ marginTop: 6 }}>
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
            const w = where(i)
            // XP só onde ele é dado de fato (com a ação que resolve, na viagem com datas).
            const reward = dated || i.kind === 'must-unscheduled' ? REWARD[i.kind] : undefined
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
                  {w ? (
                    <button type="button" className="btn small ghost" onClick={w.go}>
                      {w.label}
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
