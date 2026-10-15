import { useState } from 'react'
import { describeIssue, health, XP } from '../engine'
import type { ID, Issue } from '../engine'
import { todayISO, useApp } from '../app/store'
import { aboutLabel, autoKey, docHealth, docProgress, dueGroup } from '../app/tasks'
import type { DueGroup, Task } from '../app/tasks'
import { issueQuick, issueWhere } from './autoTasks'
import { LevelLine } from './LevelLine'
import { DueTag, TaskLine } from './TaskViews'
import { CloudQuest } from './Entrar'
import { useCanEdit } from './useCanEdit'

// Tarefas (spec §17.6, §17.11): uma lista só, por prazo, com o que o app vê sozinho (passagem por
// comprar, hospedagem, imperdível sem dia…) e o que quem viaja escreve (com prazo, link, itens, quem faz).

const SEV = { alert: 'PRECISA RESOLVER', warn: 'ATENÇÃO', info: 'PARA FAZER' } as const
const REWARD: Partial<Record<Issue['kind'], number>> = {
  'transport-missing': XP.ticket,
  'lodging-missing': XP.lodging,
  'lodging-partial': XP.lodging,
  'must-unscheduled': XP.must,
}
const GROUPS: [DueGroup, string][] = [
  ['late', 'VENCIDAS'],
  ['week', 'ESTA SEMANA'],
  ['later', 'MAIS TARDE'],
  ['none', 'SEM PRAZO'],
]

type Row =
  | { kind: 'auto'; issue: Issue; key: string; due?: string; who?: ID }
  | { kind: 'user'; task: Task; due?: string; who?: ID }

export function Tarefas() {
  const doc = useApp((s) => s.doc)!
  const openSheet = useApp((s) => s.openSheet)
  const edit = useCanEdit()
  const [mine, setMine] = useState<ID | null>(null)
  const [showDone, setShowDone] = useState(false)
  const it = doc.itinerary
  const names = { destinations: doc.destinations, places: doc.places }
  const p = docProgress(doc)
  const label = { ticket: 'Passagens', lodging: 'Hospedagens', must: 'Imperdíveis' }
  const today = todayISO()
  const travelers = it.travelers
  const nameOf = (id?: ID) => travelers.find((t) => t.id === id)?.name

  const rows: Row[] = [
    ...docHealth(doc).map((issue): Row => {
      const key = autoKey(issue)
      const m = doc.taskMeta?.[key]
      return { kind: 'auto', issue, key, due: m?.due, who: m?.who }
    }),
    ...(doc.tasks ?? [])
      .filter((t) => !t.done)
      .map((task): Row => ({ kind: 'user', task, due: task.due, who: task.who })),
  ].filter((r) => !mine || !r.who || r.who === mine)
  // Pelo prazo; no mesmo prazo, as escritas por vocês primeiro (foram pedidas de propósito).
  const byDue = (a: Row, b: Row) =>
    (a.due ?? '').localeCompare(b.due ?? '') || Number(a.kind === 'auto') - Number(b.kind === 'auto')
  // A dica do que dá para fazer numa automática aparece por extenso só na primeira.
  let hinted = false
  const done = (doc.tasks ?? []).filter((t) => t.done)
  const skipped = health(it, doc).filter((i) => doc.taskMeta?.[autoKey(i)]?.skip)

  const hint = () => {
    if (hinted) return '▸'
    hinted = true
    return 'prazo, anotações ou "não preciso" ▸'
  }
  const autoRow = (r: Extract<Row, { kind: 'auto' }>) => {
    const i = r.issue
    // Quem só vê não resolve tarefas: sem o botão de resolver na hora.
    const q = edit ? issueQuick(i) : null
    const w = issueWhere(i)
    // XP só onde é dado de fato (com a ação que resolve, na viagem com datas).
    const reward = it.start || i.kind === 'must-unscheduled' ? REWARD[i.kind] : undefined
    const note = doc.taskMeta?.[r.key]?.note
    return (
      <div key={r.key} className={`quest ${i.severity}`}>
        <span className="qhead">
          {SEV[i.severity]} · o app viu
          {reward ? <span className="xp">+{reward} XP</span> : null}
        </span>
        <button
          type="button"
          className="task-open"
          aria-label={`${describeIssue(i, it, names, doc.bookings)}: prazo, anotações ou "não preciso"`}
          onClick={() => openSheet({ kind: 'autoTask', key: r.key })}
        >
          <b>{describeIssue(i, it, names, doc.bookings)}</b>
          <small>
            {[nameOf(r.who), note ? '✎' : ''].filter(Boolean).join(' · ')}
            {r.due ? ' ' : ''}
            <DueTag due={r.due} />
            {!r.due && !note && !r.who ? hint() : ''}
          </small>
        </button>
        <div className="row">
          {q ? (
            <button type="button" className="btn small" onClick={q.run}>
              {q.label}
            </button>
          ) : null}
          {w ? (
            <button type="button" className="btn small ghost" onClick={w.run}>
              {w.label}
            </button>
          ) : null}
        </div>
      </div>
    )
  }
  const userRow = (r: Extract<Row, { kind: 'user' }>) => (
    <TaskLine
      key={r.task.id}
      task={r.task}
      tag={[r.task.about.kind === 'trip' ? '' : aboutLabel(r.task.about, it, names), nameOf(r.who)]
        .filter(Boolean)
        .join(' · ')}
      onOpen={() => openSheet({ kind: 'task', taskId: r.task.id })}
    />
  )

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
      <div className="row" style={{ marginTop: 10 }}>
        {edit ? (
          <button
            type="button"
            className="btn main"
            onClick={() => openSheet({ kind: 'task', about: { kind: 'trip' } })}
          >
            + Tarefa
          </button>
        ) : null}
        {travelers.length > 1 ? (
          <div className="segs" role="group" aria-label="De quem">
            <button
              type="button"
              className={!mine ? 'on' : ''}
              aria-pressed={!mine}
              onClick={() => setMine(null)}
            >
              todas
            </button>
            {travelers.map((t) => (
              <button
                key={t.id}
                type="button"
                className={mine === t.id ? 'on' : ''}
                aria-pressed={mine === t.id}
                onClick={() => setMine(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <CloudQuest />
      {!rows.length ? (
        <div className="empty">
          <b>Tudo pronto. Boa viagem!</b>
          Nenhuma tarefa por fazer. Algo a lembrar? Toque em "+ Tarefa".
        </div>
      ) : (
        GROUPS.map(([g, title]) => {
          const mineG = rows.filter((r) => dueGroup(r.due, today) === g).sort(byDue)
          if (!mineG.length) return null
          return (
            <section key={g} className={`task-group ${g}`} aria-label={title}>
              <div className="group-t">
                {title} · {mineG.length}
              </div>
              <div className="quests">{mineG.map((r) => (r.kind === 'auto' ? autoRow(r) : userRow(r)))}</div>
            </section>
          )
        })
      )}
      {done.length || skipped.length ? (
        <section className="task-group done">
          <button
            type="button"
            className="btn small ghost"
            aria-expanded={showDone}
            onClick={() => setShowDone(!showDone)}
          >
            {showDone ? '▴' : '▾'} Feitas e "não preciso" · {done.length + skipped.length}
          </button>
          {showDone ? (
            <div className="quests">
              {done.map((t) => (
                <TaskLine key={t.id} task={t} onOpen={() => openSheet({ kind: 'task', taskId: t.id })} />
              ))}
              {skipped.map((i) => {
                const key = autoKey(i)
                const reason = doc.taskMeta?.[key]?.skip?.reason
                return (
                  <button
                    key={key}
                    type="button"
                    className="task-open skipped"
                    onClick={() => openSheet({ kind: 'autoTask', key })}
                  >
                    <b>{describeIssue(i, it, names, doc.bookings)}</b>
                    <small>não precisa{reason ? `: ${reason}` : ''} · tocar para voltar a precisar</small>
                  </button>
                )
              })}
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  )
}
