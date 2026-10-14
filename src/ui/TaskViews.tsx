import { useEffect, useState } from 'react'
import { addDays, dayLabel, describeIssue, health } from '../engine'
import type { ID } from '../engine'
import { todayISO, uid, useApp } from '../app/store'
import type { TripDoc } from '../app/doc'
import { aboutLabel, autoKey, dueGroup, isAbout, linkHref } from '../app/tasks'
import type { Task, TaskAbout } from '../app/tasks'
import { issueQuick, issueWhere } from './autoTasks'
import { NoteBox, OptButton } from './kit'
import { DayPicker, TimelinePicker } from './TimelinePicker'

// Tarefas (spec §17.11): o painel de uma tarefa escrita por quem viaja (criar e editar), o de uma
// tarefa que o app vê sozinho (prazo, quem faz, anotações, "Não preciso"), o "Presa a" e a seção
// "TAREFAS" que aparece no painel de cada coisa (atividade, destino, trecho, dia).

/** Fora do seletor: um `[]` novo a cada leitura faria o painel redesenhar sem parar. */
const NO_TASKS: Task[] = []

const names = (d: TripDoc) => ({ destinations: d.destinations, places: d.places })

/** "até sex 01/03" (vermelho se venceu). */
export function DueTag({ due }: { due?: string }) {
  if (!due) return null
  const late = dueGroup(due, todayISO()) === 'late'
  return (
    <span className={`due${late ? ' late' : ''}`}>
      {late ? 'venceu' : 'até'} {dayLabel(due)}
    </span>
  )
}

/** Prazo: data e atalhos. */
function DueField({ value, onChange }: { value?: string; onChange: (due: string | null) => void }) {
  const doc = useApp((s) => s.doc)!
  const start = doc.itinerary.start
  const today = todayISO()
  const [text, setText] = useState(value ?? '')
  const commit = (v: string) => {
    if (v === (value ?? '')) return
    if (!v) return onChange(null)
    if (/^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0, 4)) >= 1900) onChange(v)
  }
  const pick = (v: string | null) => {
    setText(v ?? '')
    onChange(v)
  }
  return (
    <div className="field">
      <label htmlFor="prazo">Prazo</label>
      <input
        className="input"
        type="date"
        id="prazo"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          commit(e.target.value)
        }}
        onBlur={(e) => commit(e.target.value)}
      />
      <div className="segs">
        <button type="button" onClick={() => pick(today)}>
          hoje
        </button>
        <button type="button" onClick={() => pick(addDays(today, 7))}>
          em 1 semana
        </button>
        {start && addDays(start, -30) > today ? (
          <button type="button" onClick={() => pick(addDays(start, -30))}>
            1 mês antes da viagem
          </button>
        ) : null}
        {value ? (
          <button type="button" onClick={() => pick(null)}>
            sem prazo
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** Quem faz (só com mais de 1 viajante). */
function WhoField({ value, onChange }: { value?: ID; onChange: (who: ID | null) => void }) {
  const travelers = useApp((s) => s.doc!.itinerary.travelers)
  if (travelers.length < 2) return null
  return (
    <div className="field">
      <span>Quem faz</span>
      <div className="segs" role="group" aria-label="Quem faz">
        <button
          type="button"
          className={!value ? 'on' : ''}
          aria-pressed={!value}
          onClick={() => value && onChange(null)}
        >
          qualquer um
        </button>
        {travelers.map((t) => (
          <button
            key={t.id}
            type="button"
            className={value === t.id ? 'on' : ''}
            aria-pressed={value === t.id}
            onClick={() => value !== t.id && onChange(t.id)}
          >
            {t.name}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tarefa escrita por quem viaja
// ---------------------------------------------------------------------------

export function TaskSheet({ taskId, about }: { taskId?: ID; about?: TaskAbout }) {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const openSheet = useApp((s) => s.openSheet)
  const t = taskId ? doc.tasks?.find((x) => x.id === taskId) : undefined
  if (!taskId) return <NewTask about={about ?? { kind: 'trip' }} />
  if (!t) return <h2>Essa tarefa foi apagada.</h2>
  const set = (patch: Parameters<typeof setTaskPatch>[0]) => setTaskPatch(patch, t.id, act)
  const href = linkHref(t.link)
  const items = t.items ?? []
  return (
    <>
      <h2>{t.done ? `✓ ${t.title}` : t.title}</h2>
      <p className="sub">
        {Date.now() - t.createdAt < 60_000 ? 'Criada ✓ · ' : ''}tudo aqui salva sozinho; "Pronto" volta.
      </p>
      <NoteBox
        line
        key={`titulo-${t.id}`}
        id="titulo-tarefa"
        label="Tarefa"
        value={t.title}
        placeholder="O que precisa fazer?"
        save={(title) => title && set({ title })}
      />
      <button
        type="button"
        className="btn small ghost"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => openSheet({ kind: 'taskAbout', taskId: t.id })}
      >
        Presa a: {aboutLabel(t.about, doc.itinerary, names(doc))} ▸
      </button>
      {t.wasAbout ? <p className="note">Era de {t.wasAbout}, que saiu da viagem.</p> : null}
      <DueField key={`due-${t.due ?? ''}`} value={t.due} onChange={(due) => set({ due })} />
      <WhoField value={t.who} onChange={(who) => set({ who })} />
      <NoteBox
        line
        key={`link-${t.id}`}
        id="link-tarefa"
        label="Link (site, fila, reserva)"
        inputMode="url"
        value={t.link ?? ''}
        placeholder="ex.: sankan.kunaicho.go.jp"
        save={(link) => set({ link })}
        after={
          href ? (
            <a className="btn small" href={href} target="_blank" rel="noreferrer">
              Abrir ↗
            </a>
          ) : null
        }
      />
      <div className="field">
        <span>Itens {items.length ? `· ${items.filter((i) => i.done).length}/${items.length}` : ''}</span>
        {items.map((i) => (
          <div key={i.id} className="row">
            <button
              type="button"
              className={`check${i.done ? ' on' : ''}`}
              aria-pressed={!!i.done}
              aria-label={`${i.text}: ${i.done ? 'feito' : 'marcar feito'}`}
              onClick={() => set({ items: items.map((x) => (x.id === i.id ? { ...x, done: !x.done } : x)) })}
            >
              {i.done ? '✓' : ''}
            </button>
            <span className={`item${i.done ? ' done' : ''}`} style={{ flex: 1 }}>
              {i.text}
            </span>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Tirar ${i.text}`}
              onClick={() => set({ items: items.filter((x) => x.id !== i.id) })}
            >
              ×
            </button>
          </div>
        ))}
        <input
          className="input"
          aria-label="Novo item"
          placeholder="+ item (Enter adiciona)"
          onKeyDown={(e) => {
            const v = (e.target as HTMLInputElement).value.trim()
            if (e.key !== 'Enter' || !v) return
            ;(e.target as HTMLInputElement).value = ''
            set({ items: [...items, { id: uid('i'), text: v }] })
          }}
        />
      </div>
      <NoteBox
        key={`nota-${t.id}`}
        id="nota-tarefa"
        label="Anotações"
        value={t.note ?? ''}
        placeholder="Ex.: abre às 10h (horário do Japão); precisa do passaporte"
        save={(note) => set({ note })}
      />
      <OptButton
        o={{
          label: t.done ? 'Desmarcar (ainda falta)' : 'Marcar como feita ✓',
          run: () => set({ done: !t.done }),
        }}
      />
      <OptButton
        o={{
          label: 'Apagar tarefa',
          detail: ['Dá para desfazer.'],
          run: () => act({ type: 'removeTask', id: t.id }),
        }}
      />
    </>
  )
}

function setTaskPatch(
  patch: Partial<Omit<Task, 'id' | 'createdAt' | 'due' | 'who'>> & { due?: string | null; who?: ID | null },
  id: ID,
  act: ReturnType<typeof useApp.getState>['act'],
) {
  // Ainda existe? (a caixa de anotações salva também ao fechar o painel)
  if (!useApp.getState().doc?.tasks?.some((t) => t.id === id)) return
  act({ type: 'setTask', id, patch }, { keep: true })
}

function NewTask({ about }: { about: TaskAbout }) {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const openSheet = useApp((s) => s.openSheet)
  const [title, setTitle] = useState('')
  const setGuard = useApp((s) => s.setSheetGuard)
  // Sair com o nome digitado e sem criar pergunta "Criar ou Descartar" (spec §17.13).
  useEffect(() => {
    const t = title.trim()
    setGuard(t ? { text: t, create: () => create() } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title])
  const create = () => {
    const t = title.trim()
    if (!t) return
    const id = uid('t')
    // Criada, o painel "Nova tarefa" vira o da tarefa (o "‹ voltar" continua indo para onde se veio).
    if (act({ type: 'addTask', task: { id, title: t, about, createdAt: Date.now() } }, { keep: true }))
      openSheet({ kind: 'task', taskId: id }, { replace: true })
  }
  return (
    <>
      <h2>Nova tarefa</h2>
      <p className="sub">
        Presa a {aboutLabel(about, doc.itinerary, names(doc))}. Depois: prazo, link, itens.
      </p>
      <input
        className="input"
        id="nova-tarefa"
        aria-label="O que precisa fazer"
        placeholder="O que precisa fazer? Ex.: entrar na fila online do ingresso"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && create()}
        autoComplete="off"
      />
      <button type="button" className="btn main" disabled={!title.trim()} onClick={create}>
        Criar tarefa
      </button>
    </>
  )
}

// ---------------------------------------------------------------------------
// "Presa a": viagem, destino, trecho, dia ou atividade (escolhidos na linha do tempo)
// ---------------------------------------------------------------------------

export function TaskAboutSheet({
  taskId,
  step,
  destId,
}: {
  taskId: ID
  step?: 'dest' | 'leg' | 'day' | 'place' | 'placeIn'
  destId?: ID
}) {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const openSheet = useApp((s) => s.openSheet)
  const it = doc.itinerary
  const pick = (about: TaskAbout) => {
    act({ type: 'setTask', id: taskId, patch: { about } }, { keep: true })
    useApp.getState().returnToSheet({ kind: 'task', taskId })
  }
  const go = (s: typeof step, d?: ID) =>
    openSheet({ kind: 'taskAbout', taskId, step: s, ...(d ? { destId: d } : {}) })
  if (step === 'dest')
    return (
      <>
        <h2>Presa a qual destino?</h2>
        <TimelinePicker
          only={(s) => !!s.destinationId}
          onStop={(s) => pick({ kind: 'dest', id: s.destinationId! })}
          stopTag={() => 'este'}
        />
      </>
    )
  if (step === 'leg')
    return (
      <>
        <h2>Presa a qual trecho?</h2>
        <p className="sub">Toque no "+" entre os dois destinos do trecho.</p>
        <TimelinePicker onGap={(i) => it.legs[i] && pick({ kind: 'leg', id: it.legs[i]!.id })} />
      </>
    )
  if (step === 'day')
    return (
      <>
        <h2>Presa a qual dia?</h2>
        <DayPicker pick={(ref) => pick({ kind: 'day', ref })} />
      </>
    )
  if (step === 'place')
    return (
      <>
        <h2>De qual destino é a atividade?</h2>
        <TimelinePicker
          only={(s) => !!s.destinationId}
          onStop={(s) => go('placeIn', s.destinationId!)}
          stopTag={() => 'ver'}
        />
      </>
    )
  if (step === 'placeIn') {
    const mine = doc.places.filter((p) => p.destinationId === destId)
    return (
      <>
        <h2>Presa a qual atividade?</h2>
        {mine.length ? (
          <div className="pills">
            {mine.map((p) => (
              <button
                key={p.id}
                type="button"
                className="pill"
                onClick={() => pick({ kind: 'place', id: p.id })}
              >
                {p.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="note">Esse destino ainda não tem atividades.</p>
        )}
      </>
    )
  }
  return (
    <>
      <h2>Presa a quê?</h2>
      <OptButton
        o={{
          label: 'A viagem toda',
          detail: ['Documentos, seguro, câmbio…'],
          run: () => pick({ kind: 'trip' }),
        }}
      />
      <OptButton
        o={{ label: 'Um destino', detail: ['Ex.: confirmar o check-in tardio'], run: () => go('dest') }}
      />
      <OptButton
        o={{ label: 'Um trecho', detail: ['Ex.: imprimir o cartão de embarque'], run: () => go('leg') }}
      />
      <OptButton
        o={{ label: 'Um dia', detail: ['Ex.: levar dinheiro para o mercado'], run: () => go('day') }}
      />
      <OptButton
        o={{
          label: 'Uma atividade',
          detail: ['Ex.: entrar na fila online do ingresso'],
          run: () => go('place'),
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Tarefa que o app vê sozinho: prazo, quem faz, anotações e "Não preciso"
// ---------------------------------------------------------------------------

export function AutoTaskSheet({ taskKey }: { taskKey: string }) {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const [reason, setReason] = useState('')
  const [asking, setAsking] = useState(false)
  const issue = health(doc.itinerary, doc).find((i) => autoKey(i) === taskKey)
  const meta = doc.taskMeta?.[taskKey] ?? {}
  if (!issue) return <h2>Essa tarefa já está resolvida.</h2>
  const set = (patch: {
    due?: string | null
    note?: string
    who?: ID | null
    skip?: { reason?: string } | null
  }) => act({ type: 'setTaskMeta', key: taskKey, patch }, { keep: true })
  const q = issueQuick(issue)
  const w = issueWhere(issue)
  return (
    <>
      <h2>{describeIssue(issue, doc.itinerary, names(doc), doc.bookings)}</h2>
      <p className="sub">O app viu sozinho: some quando estiver resolvida.</p>
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
      <DueField key={`due-${meta.due ?? ''}`} value={meta.due} onChange={(due) => set({ due })} />
      <WhoField value={meta.who} onChange={(who) => set({ who })} />
      <NoteBox
        key={`nota-${taskKey}`}
        id="nota-auto"
        label="Anotações"
        value={meta.note ?? ''}
        placeholder="Ex.: comprar no site da JR; reembolsável até 7 dias antes"
        save={(note) => useApp.getState().doc && set({ note })}
      />
      {meta.skip ? (
        <OptButton
          o={{
            label: 'Voltar a precisar',
            detail: [`Hoje: não precisa${meta.skip.reason ? ` (${meta.skip.reason})` : ''}.`],
            run: () => set({ skip: null }),
          }}
        />
      ) : asking ? (
        <div className="field">
          <label htmlFor="motivo">Por quê? (opcional)</label>
          <input
            className="input"
            id="motivo"
            placeholder="Ex.: paga a bordo; já tenho; mudamos de ideia"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            type="button"
            className="btn main"
            onClick={() => set({ skip: reason.trim() ? { reason: reason.trim() } : {} })}
          >
            Não preciso
          </button>
        </div>
      ) : (
        <OptButton
          o={{
            label: 'Não preciso…',
            detail: ['Sai da lista e conta como resolvida (sem XP). Dá para voltar atrás.'],
            run: () => setAsking(true),
          }}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Seção "TAREFAS" no painel de cada coisa
// ---------------------------------------------------------------------------

export function TaskSection({
  about,
  title = 'TAREFAS',
  compact,
}: {
  about: TaskAbout
  title?: string
  /** No roteiro: só aparece quando há tarefas, sem "+ Tarefa" (que fica no menu ⋯). */
  compact?: boolean
}) {
  const tasks = useApp((s) => s.doc?.tasks) ?? NO_TASKS
  const openSheet = useApp((s) => s.openSheet)
  const mine = tasks.filter((t) => isAbout(t, about))
  if (compact && !mine.length) return null
  return (
    <div className="task-section">
      <div className="group-t">
        {title}
        {mine.length ? ` · ${mine.filter((t) => !t.done).length} por fazer` : ''}
      </div>
      {mine.map((t) => (
        <TaskLine key={t.id} task={t} onOpen={() => openSheet({ kind: 'task', taskId: t.id })} />
      ))}
      {compact ? null : (
        <button
          type="button"
          className="btn small ghost"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => openSheet({ kind: 'task', about })}
        >
          + Tarefa
        </button>
      )}
    </div>
  )
}

/** Uma tarefa escrita, em uma linha: marcar feita e abrir. */
export function TaskLine({ task, onOpen, tag }: { task: Task; onOpen: () => void; tag?: string }) {
  const act = useApp((s) => s.act)
  const items = task.items ?? []
  return (
    <div className={`task-line${task.done ? ' done' : ''}`}>
      <button
        type="button"
        className={`check${task.done ? ' on' : ''}`}
        aria-pressed={!!task.done}
        aria-label={`${task.title}: ${task.done ? 'feita (desmarcar)' : 'marcar como feita'}`}
        onClick={() => act({ type: 'setTask', id: task.id, patch: { done: !task.done } }, { keep: true })}
      >
        {task.done ? '✓' : ''}
      </button>
      <button type="button" className="task-open" onClick={onOpen} aria-label={`${task.title}: abrir`}>
        <b>{task.title}</b>
        <small>
          {[
            tag,
            items.length ? `${items.filter((i) => i.done).length}/${items.length} itens` : '',
            task.link ? 'link' : '',
            task.note ? '✎' : '',
          ]
            .filter(Boolean)
            .join(' · ')}
          {task.due ? ' · ' : ''}
          <DueTag due={task.due} />
        </small>
      </button>
    </div>
  )
}
