import { useEffect, useState } from 'react'
import {
  bookingStatus,
  dayLabel,
  days as allDays,
  findVisit,
  legName,
  lodgingGaps,
  MODE_NAMES,
  placeStates,
  plural,
  stopWindows,
  tripRange,
} from '../engine'
import type { Booking, ID, LegMode, Lodging, PlaceKind, Rarity, Slot } from '../engine'
import { uid, useApp } from '../app/store'
import type { DocAction } from '../app/doc'
import {
  aboardChoice,
  askStartDate,
  cityName,
  endOptions,
  insertOptions,
  markLodging,
  moveOnce,
  sameDay,
  scheduleOnce,
  splitOptions,
  suggestGap,
} from '../app/choices'
import { DayPicker, TimelinePicker } from './TimelinePicker'
import { AutoTaskSheet, TaskAboutSheet, TaskSection, TaskSheet } from './TaskViews'
import { fold } from '../providers/countries'
import { searchOnline } from '../providers/places'
import type { OnlinePlace } from '../providers/places'
import { RARITY } from './rarity'
import { colorOf, sealOf } from './colors'
import { NoteBox, OptButton, SheetFrame, Stepper, Vehicle } from './kit'
import { PlaceSearch } from './PlaceSearch'
import type { PlacePick } from './PlaceSearch'
import { PLACE_KIND_ORDER, PLACE_KINDS } from './placeKinds'
import { NO_DOC_SHEETS } from './sheetTypes'
import { PrivacySheet } from './Consent'
import type { SheetSpec } from './sheetTypes'
import { AccountSheet, AdoptSheet, CloudSaveSheet, InstallSheet, SignInSheet, TripCloudRow } from './Entrar'
import { sheetLabel } from './sheetLabel'
import { cueDone, cueLodging } from './stage/cues'
import {
  HistorySheet,
  InviteSheet,
  MemberSheet,
  PeopleSheet,
  PendingInviteSheet,
  ViewingSheet,
} from './People'

// Painéis com as ações em palavras (o mesmo caminho dos gestos, para quem não arrasta),
// e os painéis de criar: atividade, hospedagem e "Sua viagem".

const MODES: LegMode[] = ['flight', 'train', 'bus', 'car', 'boat', 'walk', 'bike', 'moto']

/** Painéis que editam algo e salvam sozinhos: terminam em "Pronto ✓" (os de escolha, em "Fechar"). */
const EDITORS = new Set<SheetSpec['kind']>([
  'task',
  'autoTask',
  'visit',
  'sticker',
  'leg',
  'lodging',
  'trip',
  'people',
])

export function Sheets() {
  const sheet = useApp((s) => s.sheet)
  const stack = useApp((s) => s.sheetBack)
  const dir = useApp((s) => s.sheetDir)
  const doc = useApp((s) => s.doc)
  const close = useApp((s) => s.closeSheet)
  const backSheet = useApp((s) => s.backSheet)
  if (!sheet || (!doc && !NO_DOC_SHEETS.has(sheet.kind))) return null
  const under = stack[stack.length - 1]
  return (
    // Refaz o foco quando o painel troca por outro (não quando um campo do mesmo painel muda).
    <SheetFrame
      onClose={close}
      focusKey={`${sheet.kind}:${'title' in sheet ? sheet.title : ''}:${stack.length}`}
      label={sheetLabel(sheet, doc).kind}
      back={under ? { name: sheetLabel(under, doc).name, go: () => backSheet() } : undefined}
      depth={stack.length}
      dir={dir}
      editor={EDITORS.has(sheet.kind) && !(sheet.kind === 'task' && !sheet.taskId)}
    >
      {sheet.kind === 'choice' ? (
        <ChoiceBody sheet={sheet} />
      ) : sheet.kind === 'signin' ? (
        <SignInSheet
          key={sheet.step ?? 'start'}
          reason={sheet.reason}
          confirmEmail={sheet.step === 'confirmEmail'}
        />
      ) : sheet.kind === 'account' ? (
        <AccountSheet />
      ) : sheet.kind === 'adopt' ? (
        <AdoptSheet trips={sheet.trips} />
      ) : sheet.kind === 'install' ? (
        <InstallSheet />
      ) : sheet.kind === 'cloudSave' ? (
        <CloudSaveSheet />
      ) : sheet.kind === 'privacy' ? (
        <PrivacySheet />
      ) : (
        <Body sheet={sheet} />
      )}
    </SheetFrame>
  )
}

/** Painel de escolha: só o título e as opções (vale também em "Suas viagens", sem viagem aberta). */
function ChoiceBody({ sheet }: { sheet: Extract<SheetSpec, { kind: 'choice' }> }) {
  return (
    <>
      <h2>{sheet.title}</h2>
      {sheet.sub ? <p className="sub">{sheet.sub}</p> : null}
      {sheet.options.map((o, i) => (
        <OptButton key={i} o={o} />
      ))}
    </>
  )
}

function Body({ sheet }: { sheet: SheetSpec }) {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const openSheet = useApp((s) => s.openSheet)
  const patchSheet = useApp((s) => s.patchSheet)
  const it = doc.itinerary
  const destName = (id: ID) => doc.destinations.find((d) => d.id === id)?.name ?? 'Destino'

  switch (sheet.kind) {
    case 'order': {
      const s = it.stops.find((x) => x.id === sheet.stopId)
      if (!s) return <h2>Esse destino saiu do roteiro.</h2>
      const cur = it.stops.indexOf(s)
      return (
        <>
          <h2>Onde {cityName(s.id)} entra?</h2>
          <p className="sub">Toque no "+" entre dois destinos.</p>
          <TimelinePicker
            here={[cur, cur + 1]}
            onGap={(g) =>
              act({
                type: 'engine',
                command: { type: 'reorderStop', stopId: s.id, toIndex: g > cur ? g - 1 : g },
              })
            }
          />
        </>
      )
    }

    case 'leg': {
      const leg = it.legs.find((l) => l.id === sheet.legId)
      if (!leg) return <h2>Esse trecho saiu do roteiro.</h2>
      const toIdx = leg.to === 'home' ? it.stops.length : it.stops.findIndex((s) => s.id === leg.to)
      return (
        <>
          <h2>{legName(it, leg, doc)}</h2>
          <div className="modes" role="group" aria-label="Como vão">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                className={`mode${m === leg.mode ? ' on' : ''}`}
                aria-pressed={m === leg.mode}
                onClick={() =>
                  m !== leg.mode &&
                  act(
                    { type: 'engine', command: { type: 'setLegMode', legId: leg.id, mode: m } },
                    { keep: true },
                  )
                }
              >
                <Vehicle mode={m} px={1.5} /> {MODE_NAMES[m]}
              </button>
            ))}
          </div>
          <OptButton
            o={{
              label: 'Horários',
              detail: ['Com os horários, o tempo do trecho vira "sua passagem".'],
              run: () => openSheet({ kind: 'times', legId: leg.id }),
            }}
          />
          {leg.to !== 'home' ? (
            <div className="row">
              <span className="note" style={{ flex: 1 }}>
                Noite a bordo (ônibus ou trem noturno)
              </span>
              <Stepper
                value={leg.aboard.length}
                min={0}
                label="Noites a bordo"
                onMinus={() => aboardChoice(leg, -1)}
                onPlus={() => aboardChoice(leg, 1)}
              />
            </div>
          ) : (
            <p className="note">Voo noturno na volta: marque nos horários que chega no dia seguinte.</p>
          )}
          <OptButton
            o={{
              label: '+ Parar no caminho',
              detail: ['Um destino novo entre esses dois.'],
              run: () =>
                openSheet({
                  kind: 'dest',
                  title: 'Que destino entra aqui?',
                  pick: (destId) => openSheet({ kind: 'insert', index: toIdx, destId, nights: 1 }),
                }),
            }}
          />
          <TaskSection about={{ kind: 'leg', id: leg.id }} />
        </>
      )
    }

    case 'times':
      return <Times legId={sheet.legId} />

    case 'dest':
      return <DestPicker title={sheet.title} pick={sheet.pick} />

    case 'where': {
      const name = destName(sheet.destId)
      return (
        <>
          <h2>Onde {name} entra?</h2>
          <p className="sub">
            Toque no "+" entre dois destinos, ou num destino para pôr {name} no meio dele. Dica: dá para
            arrastar {name} direto na trilha.
          </p>
          <TimelinePicker
            suggest={suggestGap(it, doc.destinations, sheet.destId)}
            onGap={(i) => openSheet({ kind: 'insert', index: i, destId: sheet.destId, nights: 1 })}
            stopOk={(s) => !s.destinationId || (s.destinationId !== sheet.destId && s.days.length >= 2)}
            stopTag={(s) => (s.destinationId ? 'no meio' : 'preencher')}
            onStop={(s) =>
              s.destinationId
                ? openSheet({
                    kind: 'split',
                    stopId: s.id,
                    destId: sheet.destId,
                    nights: 1,
                    after: Math.max(1, Math.floor(s.days.length / 2)),
                  })
                : act({
                    type: 'engine',
                    command: { type: 'fillOpen', stopId: s.id, destinationId: sheet.destId },
                  })
            }
          />
        </>
      )
    }

    case 'pickStop':
      return (
        <>
          <h2>{sheet.title}</h2>
          <TimelinePicker
            only={(s) => sheet.ok.includes(s.id)}
            onStop={(s) => sheet.pick(s.id)}
            stopTag={() => sheet.tag}
          />
        </>
      )

    case 'split': {
      const s = it.stops.find((x) => x.id === sheet.stopId)
      if (!s) return <h2>Esse destino saiu do roteiro.</h2>
      const ds = allDays(it).filter((d) => d.stopId === s.id && d.kind === 'stop')
      return (
        <>
          <h2>
            {destName(sheet.destId)} no meio de {cityName(s.id)}
          </h2>
          <div className="field">
            <span>Noites em {destName(sheet.destId)}</span>
            <Stepper
              value={sheet.nights}
              max={14}
              label="Noites"
              onMinus={() => patchSheet({ nights: sheet.nights - 1 })}
              onPlus={() => patchSheet({ nights: sheet.nights + 1 })}
            />
          </div>
          <div className="field">
            <span>Quando</span>
            <div className="segs">
              {ds.slice(0, -1).map((d, k) => (
                <button
                  key={d.index}
                  type="button"
                  className={sheet.after === k + 1 ? 'on' : ''}
                  aria-pressed={sheet.after === k + 1}
                  onClick={() => patchSheet({ after: k + 1 })}
                >
                  depois de {d.label}
                </button>
              ))}
            </div>
          </div>
          <div className="group-t">DE ONDE SAEM AS NOITES?</div>
          {splitOptions(s.id, sheet.destId, sheet.nights, sheet.after).map((o, i) => (
            <OptButton key={i} o={o} />
          ))}
        </>
      )
    }

    case 'insert': {
      const a = it.stops[sheet.index - 1]
      const b = it.stops[sheet.index]
      const where = !a ? 'no começo' : !b ? 'no fim' : `entre ${cityName(a.id)} e ${cityName(b.id)}`
      return (
        <>
          <h2>
            {destName(sheet.destId)} {where}
          </h2>
          <div className="field">
            <span>Noites</span>
            <Stepper
              value={sheet.nights}
              max={30}
              label="Noites"
              onMinus={() => patchSheet({ nights: sheet.nights - 1 })}
              onPlus={() => patchSheet({ nights: sheet.nights + 1 })}
            />
          </div>
          <div className="group-t">DE ONDE SAEM AS NOITES?</div>
          {insertOptions(sheet.index, sheet.destId, sheet.nights).map((o, i) => (
            <OptButton key={i} o={o} />
          ))}
        </>
      )
    }

    case 'fill': {
      const s = it.stops.find((x) => x.id === sheet.stopId)
      if (!s) return <h2>Essas noites já mudaram.</h2>
      const n = s.days.length
      const partial = sheet.nights < n
      return (
        <>
          <h2>Quantas noites em {destName(sheet.destId)}?</h2>
          <Stepper
            value={sheet.nights}
            max={n}
            label="Noites"
            onMinus={() => patchSheet({ nights: sheet.nights - 1 })}
            onPlus={() => patchSheet({ nights: sheet.nights + 1 })}
          />
          {partial ? (
            <>
              <div className="segs">
                {(['start', 'end'] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    className={sheet.side === side ? 'on' : ''}
                    aria-pressed={sheet.side === side}
                    onClick={() => patchSheet({ side })}
                  >
                    {side === 'start' ? 'no começo' : 'no fim'}
                  </button>
                ))}
              </div>
              <p className="sub">O resto continua em aberto.</p>
            </>
          ) : null}
          <button
            type="button"
            className="btn main"
            onClick={() =>
              act({
                type: 'engine',
                command: {
                  type: 'fillOpen',
                  stopId: s.id,
                  destinationId: sheet.destId,
                  ...(partial ? { nights: sheet.nights, side: sheet.side } : {}),
                },
              })
            }
          >
            Preencher
          </button>
        </>
      )
    }

    case 'days':
      return (
        <>
          <h2>{sheet.title}</h2>
          <DayPicker prefer={sheet.prefer} placeId={sheet.placeId} pick={sheet.pick} />
        </>
      )

    case 'sticker':
      return <AboutActivity placeId={sheet.placeId} />

    case 'visit':
      return <VisitSheet visitId={sheet.visitId} />

    case 'trip':
      return <TripSheet />

    case 'newActivity':
      return <NewActivity spec={sheet} />

    case 'lodging':
      return <LodgingSheet stopId={sheet.stopId} />

    case 'task':
      return <TaskSheet taskId={sheet.taskId} about={sheet.about} />

    case 'autoTask':
      return <AutoTaskSheet taskKey={sheet.key} />

    case 'taskAbout':
      return <TaskAboutSheet taskId={sheet.taskId} step={sheet.step} destId={sheet.destId} />

    case 'people':
      return <PeopleSheet />

    case 'invite':
      return <InviteSheet />

    case 'member':
      return <MemberSheet uid={sheet.uid} />

    case 'pendingInvite':
      return <PendingInviteSheet inviteId={sheet.inviteId} />

    case 'history':
      return <HistorySheet />

    case 'viewing':
      return <ViewingSheet />
  }
}

// ---------------------------------------------------------------------------
// A atividade num dia (spec §17.10): anotações, turno e horário, feita — só deste dia.
// ---------------------------------------------------------------------------

const SLOTS: [Slot, string][] = [
  ['any', 'qualquer hora'],
  ['morning', 'manhã'],
  ['afternoon', 'tarde'],
  ['evening', 'noite'],
]

function VisitSheet({ visitId }: { visitId: ID }) {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const openSheet = useApp((s) => s.openSheet)
  const it = doc.itinerary
  const f = findVisit(it, visitId)
  const v = f?.list[f.index]
  if (!v) return <h2>Essa atividade não está mais aqui.</h2>
  const p = doc.places.find((x) => x.id === v.placeId)
  const ds = allDays(it, doc.places)
  const day = ds.find((d) => d.visits.some((x) => x.id === v.id))
  const where = day?.destinationId ? doc.destinations.find((d) => d.id === day.destinationId)?.name : null
  const copyFrom = ds
    .flatMap((d) =>
      d.visits.filter((x) => x.placeId === v.placeId && x.id !== v.id && x.note).map((x) => ({ d, x })),
    )
    .at(0)
  const meta = (patch: { slot?: Slot; time?: string | null; note?: string | null; visited?: boolean }) =>
    // Ainda existe? (a caixa salva também ao fechar o painel)
    !!findVisit(useApp.getState().doc!.itinerary, v.id) &&
    act({ type: 'engine', command: { type: 'setVisitMeta', visitId: v.id, ...patch } }, { keep: true })
  const about = () => p && openSheet({ kind: 'sticker', placeId: p.id })
  return (
    <>
      <h2>{p?.name ?? 'Atividade'}</h2>
      <p className="sub">
        {day?.label ?? ''}
        {where ? ` · ${where}` : ''}
        {p ? (
          <>
            {' · '}
            <button type="button" className="linkish" onClick={about}>
              {RARITY[p.rarity].gems} {PLACE_KINDS[p.kind ?? 'sight'].glyph}{' '}
              {PLACE_KINDS[p.kind ?? 'sight'].label}
            </button>
          </>
        ) : null}
      </p>
      {/* "Feita" logo abaixo do nome (retorno do staging: no fim do painel, ficava escondido). */}
      <button
        type="button"
        className={`btn ${v.visited ? 'ghost' : 'main'} done-toggle`}
        aria-pressed={!!v.visited}
        onClick={() => {
          if (meta({ visited: !v.visited }) && !v.visited) cueDone(useApp.getState().doc!, v.placeId)
        }}
      >
        {v.visited ? (
          <>
            <span aria-hidden="true">済</span> Feita · desmarcar
          </>
        ) : (
          '✓ Marcar como feita'
        )}
      </button>
      <NoteBox
        key={v.id}
        id="nota-dia"
        label={`Anotações deste dia${day ? ` (${day.label})` : ''}`}
        value={v.note ?? ''}
        placeholder="Ex.: comprar ingresso antes, abre às 9h, levar dinheiro"
        save={(t) => meta({ note: t || null })}
      />
      {!v.note && copyFrom ? (
        <button
          type="button"
          className="btn small ghost"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => meta({ note: copyFrom.x.note! })}
        >
          Copiar de {copyFrom.d.label}
        </button>
      ) : null}
      {p?.note ? (
        <p className="note">
          <b>Geral:</b> {p.note}
        </p>
      ) : null}
      <div className="field">
        <span>Quando</span>
        <div className="segs">
          {SLOTS.map(([slot, label]) => (
            <button
              key={slot}
              type="button"
              className={v.slot === slot ? 'on' : ''}
              aria-pressed={v.slot === slot}
              onClick={() => v.slot !== slot && meta({ slot })}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="row">
          <label className="note" htmlFor="hora-ativ" style={{ flex: 1 }}>
            Horário (opcional)
          </label>
          <input
            className="input time"
            type="time"
            id="hora-ativ"
            value={v.time ?? ''}
            onChange={(e) => e.target.value !== (v.time ?? '') && meta({ time: e.target.value || null })}
          />
        </div>
      </div>
      <div className="row actions">
        <button
          type="button"
          className="btn small ghost"
          onClick={() =>
            openSheet({
              kind: 'days',
              title: 'Para qual dia?',
              prefer: p?.destinationId,
              placeId: v.placeId,
              pick: (ref) =>
                moveOnce(v.id, v.placeId, ref, { keep: true }) &&
                useApp.getState().returnToSheet({ kind: 'visit', visitId: v.id }),
            })
          }
        >
          Mudar de dia
        </button>
        <button
          type="button"
          className="btn small ghost"
          onClick={() =>
            openSheet({
              kind: 'days',
              title: `Repetir ${p?.name ?? 'a atividade'} em qual dia?`,
              prefer: p?.destinationId,
              placeId: v.placeId,
              pick: (ref) =>
                scheduleOnce(v.placeId, ref, undefined, { keep: true }) &&
                useApp.getState().returnToSheet({ kind: 'visit', visitId: v.id }),
            })
          }
        >
          Repetir em outro dia
        </button>
        <button
          type="button"
          className="btn small ghost"
          onClick={() => act({ type: 'engine', command: { type: 'unscheduleVisit', visitId: v.id } })}
        >
          Tirar do dia
        </button>
      </div>
      {p ? <TaskSection about={{ kind: 'place', id: p.id }} title="TAREFAS DA ATIVIDADE" /> : null}
      {p ? (
        <OptButton
          o={{
            label: 'Sobre a atividade ▸',
            detail: ['Prioridade, tipo, lugar no mapa e anotações gerais: valem para todos os dias.'],
            run: about,
          }}
        />
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Sobre a atividade: o que vale para todos os dias (prioridade, tipo, mapa, anotações gerais).
// ---------------------------------------------------------------------------

function AboutActivity({ placeId }: { placeId: ID }) {
  const [confirmDel, setConfirmDel] = useState(false)
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const openSheet = useApp((s) => s.openSheet)
  const enterCity = useApp((s) => s.enterCity)
  const setPlacing = useApp((s) => s.setPlacing)
  const say = useApp((s) => s.say)
  const it = doc.itinerary
  const p = doc.places.find((x) => x.id === placeId)
  if (!p) return <h2>Essa atividade foi apagada.</h2>
  const destName = doc.destinations.find((d) => d.id === p.destinationId)?.name ?? 'Destino'
  const ds = allDays(it, doc.places)
  const visits = ds.flatMap((d) => d.visits.filter((v) => v.placeId === p.id).map((v) => ({ d, v })))
  const hasNotes = !!p.note || visits.some(({ v }) => v.note)
  const setPlace = (patch: { rarity?: Rarity; kind?: PlaceKind; note?: string }) =>
    useApp.getState().doc!.places.some((x) => x.id === p.id) &&
    act({ type: 'setPlace', id: p.id, patch }, { keep: true })
  return (
    <>
      <h2>{p.name}</h2>
      <p className="sub">
        {destName} · {visits.length ? `em ${visits.map(({ d }) => d.label).join(', ')}` : 'ainda sem dia'}
      </p>
      <div className="rarity-row" role="group" aria-label="Prioridade">
        {(['maybe', 'want', 'must'] as Rarity[]).map((r) => (
          <button
            key={r}
            type="button"
            className={`rar r-${r}${p.rarity === r ? ' on' : ''}`}
            aria-pressed={p.rarity === r}
            onClick={() => p.rarity !== r && setPlace({ rarity: r })}
          >
            {RARITY[r].gems} {RARITY[r].label}
          </button>
        ))}
      </div>
      <div className="kind-row" role="group" aria-label="Tipo de lugar">
        {PLACE_KIND_ORDER.map((k) => (
          <button
            key={k}
            type="button"
            className={(p.kind ?? 'sight') === k ? 'on' : ''}
            aria-pressed={(p.kind ?? 'sight') === k}
            onClick={() => (p.kind ?? 'sight') !== k && setPlace({ kind: k })}
          >
            <b>{PLACE_KINDS[k].glyph}</b> {PLACE_KINDS[k].label}
          </button>
        ))}
      </div>
      <NoteBox
        key={p.id}
        id="nota-geral"
        label="Anotações gerais (valem para todos os dias)"
        value={p.note ?? ''}
        placeholder="Ex.: site dos ingressos, preço, fecha às segundas"
        save={(t) => setPlace({ note: t })}
      />
      <TaskSection about={{ kind: 'place', id: p.id }} />
      {visits.length ? <div className="group-t">DIAS · TOQUE PARA AS ANOTAÇÕES DO DIA</div> : null}
      {visits.map(({ d, v }) => (
        <OptButton
          key={v.id}
          o={{
            label: `${d.label}${v.time ? ` · ${v.time}` : ''}${v.visited ? ' 済' : ''}`,
            detail: [v.note ? `✎ ${v.note}` : 'sem anotações'],
            run: () => openSheet({ kind: 'visit', visitId: v.id }),
          }}
        />
      ))}
      <OptButton
        o={{
          label: visits.length ? 'Pôr em mais um dia' : 'Pôr num dia',
          main: !visits.length,
          run: () =>
            openSheet({
              kind: 'days',
              title: `Pôr ${p.name} em qual dia?`,
              prefer: p.destinationId,
              placeId: p.id,
              pick: (ref) =>
                scheduleOnce(p.id, ref, undefined, { keep: true }) &&
                useApp.getState().returnToSheet({ kind: 'sticker', placeId: p.id }),
            }),
        }}
      />
      {p.lat !== undefined && p.lon !== undefined ? (
        <>
          <OptButton o={{ label: 'Ver no mapa da cidade', run: () => enterCity(p.destinationId) }} />
          <a
            className="opt"
            href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`}
            target="_blank"
            rel="noreferrer"
          >
            <b>Abrir no Google Maps</b>
            <span>Rotas, horários e fotos no app de mapas.</span>
          </a>
        </>
      ) : (
        <OptButton
          o={{
            label: 'Marcar no mapa',
            detail: ['Toque no mapa da cidade onde fica.'],
            run: () => {
              enterCity(p.destinationId)
              setPlacing(p.id)
              say(`Marque no mapa onde fica ${p.name}.`)
            },
          }}
        />
      )}
      <OptButton
        o={{
          // Com anotações, um segundo toque (as anotações de cada dia iriam junto).
          label: confirmDel ? 'Toque de novo para apagar' : 'Apagar atividade',
          detail: [
            hasNotes
              ? 'Sai de todos os dias, com as anotações. Dá para desfazer.'
              : 'Sai de todos os dias também. Dá para desfazer.',
          ],
          run: () => (hasNotes && !confirmDel ? setConfirmDel(true) : act({ type: 'removePlace', id: p.id })),
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Nova atividade: nome com sugestões perto do destino, tipo, prioridade (um toque cria e já põe no dia)
// ---------------------------------------------------------------------------

function useNearby(q: string, lat: number | undefined, lon: number | undefined, on: boolean) {
  const [web, setWeb] = useState<OnlinePlace[]>([])
  useEffect(() => {
    if (!on || q.length < 3) {
      setWeb([])
      return
    }
    const ctl = new AbortController()
    const timer = setTimeout(() => {
      void searchOnline(q, {
        ...(lat !== undefined && lon !== undefined ? { lat, lon } : {}),
        limit: 6,
        signal: ctl.signal,
      }).then((r) => {
        if (!ctl.signal.aborted) setWeb(r.filter((o) => o.kind === 'poi' || o.kind === 'park'))
      })
    }, 300)
    return () => {
      clearTimeout(timer)
      ctl.abort()
    }
  }, [q, lat, lon, on])
  return [web, setWeb] as const
}

function NewActivity({ spec }: { spec: Extract<SheetSpec, { kind: 'newActivity' }> }) {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const dest = doc.destinations.find((d) => d.id === spec.destId)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<PlaceKind>('sight')
  const [rarity, setRarity] = useState<Rarity>('want')
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(
    spec.lat !== undefined && spec.lon !== undefined ? { lat: spec.lat, lon: spec.lon } : null,
  )
  const t = name.trim()
  const [web, setWeb] = useNearby(t, dest?.lat, dest?.lon, !picked)
  const states = placeStates(doc.itinerary, doc.places)
  // Do catálogo: as do destino que ainda não estão neste dia (as sem dia primeiro).
  const inDay = new Set(
    (allDays(doc.itinerary).find((d) => spec.day && sameDay(d.ref, spec.day))?.visits ?? []).map(
      (v) => v.placeId,
    ),
  )
  const loose = doc.places
    .filter((p) => p.destinationId === spec.destId && !inDay.has(p.id))
    .sort((a, b) => Number(!!states.get(a.id)?.days.length) - Number(!!states.get(b.id)?.days.length))

  const create = () => {
    if (!t) return
    const id = uid('p')
    const add = {
      type: 'addPlace' as const,
      place: { id, destinationId: spec.destId, name: t, rarity, kind, ...(picked ?? {}) },
    }
    act(
      spec.day
        ? {
            type: 'batch',
            actions: [
              add,
              {
                type: 'engine',
                command: { type: 'scheduleVisit', visitId: uid('v'), placeId: id, day: spec.day },
              },
            ],
          }
        : add,
    )
  }
  // Sair com o nome digitado e sem criar pergunta "Criar ou Descartar" (spec §17.13).
  const setGuard = useApp((s) => s.setSheetGuard)
  useEffect(() => {
    setGuard(t ? { text: t, create } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, kind, rarity, picked])
  return (
    <>
      <h2>Nova atividade em {dest?.name ?? 'destino'}</h2>
      <p className="sub">
        {spec.day
          ? `Entra em ${spec.dayLabel ?? 'o dia'}.`
          : picked
            ? 'Já marcada no mapa. Depois você escolhe o dia.'
            : 'Sem dia por enquanto; dá para pôr num dia depois.'}
      </p>
      <input
        className="input"
        id="nova-atividade"
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          if (spec.lat === undefined) setPicked(null)
        }}
        placeholder="O que vocês querem fazer? Ex.: Fushimi Inari"
        aria-label="Nome da atividade"
        onKeyDown={(e) => e.key === 'Enter' && create()}
        autoComplete="off"
      />
      {web.length ? (
        <div className="suggest">
          {web.map((o) => (
            <button
              key={`${o.name}-${o.lat}`}
              type="button"
              onClick={() => {
                setName(o.name)
                setPicked({ lat: o.lat, lon: o.lon })
                setKind(o.placeKind ?? 'sight')
                setWeb([])
              }}
            >
              <span>{o.name}</span>
              <small>{o.detail}</small>
            </button>
          ))}
        </div>
      ) : null}
      {picked ? <small className="note">📍 com lugar no mapa da cidade</small> : null}
      <div className="kind-row" role="group" aria-label="Tipo de lugar">
        {PLACE_KIND_ORDER.map((k) => (
          <button
            key={k}
            type="button"
            className={kind === k ? 'on' : ''}
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
          >
            <b>{PLACE_KINDS[k].glyph}</b> {PLACE_KINDS[k].label}
          </button>
        ))}
      </div>
      <div className="group-t">PRIORIDADE</div>
      <div className="rarity-row" role="group" aria-label="Prioridade">
        {(['maybe', 'want', 'must'] as Rarity[]).map((r) => (
          <button
            key={r}
            type="button"
            className={`rar r-${r}${rarity === r ? ' on' : ''}`}
            aria-pressed={rarity === r}
            onClick={() => setRarity(r)}
          >
            {RARITY[r].gems} {RARITY[r].label}
          </button>
        ))}
      </div>
      <button type="button" className="btn main" disabled={!t} onClick={create}>
        Criar atividade
      </button>
      {spec.day && loose.length ? (
        <>
          <div className="group-t">DO CATÁLOGO</div>
          <div className="pills">
            {loose.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`pill r-${p.rarity}`}
                onClick={() => scheduleOnce(p.id, spec.day!)}
              >
                {RARITY[p.rarity].gems} {p.name}
                {states.get(p.id)?.days.length ? <small> · {states.get(p.id)!.days[0]!.label}</small> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Hospedagem: onde vocês dormem, com nome e "já reservei"
// ---------------------------------------------------------------------------

function LodgingSheet({ stopId }: { stopId: ID }) {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const it = doc.itinerary
  const stop = it.stops.find((s) => s.id === stopId)
  const dest = doc.destinations.find((d) => d.id === stop?.destinationId)
  const w = stopWindows(it).find((x) => x.stopId === stopId)
  const mine = doc.bookings.filter(
    (b): b is Extract<Booking, { kind: 'lodging' }> =>
      b.kind === 'lodging' && !b.archived && bookingStatus(b, it).stopId === stopId,
  )
  const gap = lodgingGaps(it, doc.bookings).find((g) => g.stopId === stopId)
  const [name, setName] = useState('')
  const [booked, setBooked] = useState(true)
  const t = name.trim()
  const [web, setWeb] = useNearby(t, dest?.lat, dest?.lon, true)
  const hotels = web.filter((o) => o.placeKind === 'lodging')
  const setGuard = useApp((s) => s.setSheetGuard)
  // O nome da hospedagem digitado e não anotado: sair pergunta "Criar ou Descartar".
  useEffect(() => {
    setGuard(t ? { text: t, create: () => markLodging(stopId, t, booked ? 'booked' : 'planned') } : null)
  }, [t, booked, stopId, setGuard])
  if (!stop || !dest) return <h2>Esse destino saiu do roteiro.</h2>
  const missing = gap?.missing ?? []
  const setLodging = (lodging: Lodging) =>
    act({ type: 'engine', command: { type: 'setLodging', stopId, lodging } }, { keep: true })
  // Com amigos ou a bordo: não precisa de reserva (a tarefa some); dá para voltar atrás aqui mesmo.
  if (stop.lodging === 'friends' || stop.lodging === 'onboard')
    return (
      <>
        <h2>Onde vocês dormem em {dest.name}?</h2>
        <p className="sub">
          {stop.lodging === 'friends' ? 'Com amigos ou família' : 'A bordo (trem, ônibus, barco, carro)'}: não
          precisa de reserva.
        </p>
        <OptButton
          o={{
            label: 'Mudar: vamos precisar de hospedagem',
            detail: ['A hospedagem volta para as tarefas.'],
            run: () => setLodging('hotel'),
          }}
        />
      </>
    )
  return (
    <>
      <h2>Onde vocês dormem em {dest.name}?</h2>
      <p className="sub">
        {w?.start && w.end ? `${dayLabel(w.start)} → ${dayLabel(w.end)} · ` : ''}
        {plural(stop.days.length, 'noite', 'noites')}
      </p>
      {mine.map((b) => (
        <div key={b.id} className="card" style={{ padding: 10 }}>
          <b>
            宿 {b.title} {b.status === 'booked' ? '済' : '· ainda não reservada'}
          </b>
          <div className="row">
            {b.status === 'booked' ? (
              <button
                type="button"
                className="btn small ghost"
                onClick={() =>
                  act({ type: 'setBooking', id: b.id, patch: { status: 'planned' } }, { keep: true })
                }
              >
                Ainda não reservei
              </button>
            ) : (
              <button
                type="button"
                className="btn small"
                onClick={() =>
                  act(
                    { type: 'setBooking', id: b.id, patch: { status: 'booked' } },
                    { stamp: true, keep: true },
                  ) && cueLodging(useApp.getState().doc!, b.kind === 'lodging' ? b.destinationId : null)
                }
              >
                Já reservei <span aria-hidden="true">済</span>
              </button>
            )}
            <button
              type="button"
              className="btn small ghost"
              onClick={() => act({ type: 'removeBooking', id: b.id }, { keep: true })}
            >
              Tirar
            </button>
          </div>
        </div>
      ))}
      {missing.length && !w?.start ? (
        <>
          <p className="note">
            Para anotar a hospedagem com as noites certas, escolha primeiro a data de ida.
          </p>
          <button
            type="button"
            className="btn main"
            onClick={() => askStartDate('Escolha a data de ida; depois volte para anotar a hospedagem.')}
          >
            Escolher a data de ida
          </button>
        </>
      ) : missing.length ? (
        <>
          <div className="group-t">
            {mine.length
              ? `FALTAM ${missing
                  .map((m) => m.label)
                  .join(', ')
                  .toUpperCase()}`
              : 'HOSPEDAGEM'}
          </div>
          <input
            className="input"
            id="hospedagem"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Hotel, pousada, casa… (ou deixe "Hospedagem em ${dest.name}")`}
            aria-label="Nome da hospedagem"
            autoComplete="off"
          />
          {hotels.length ? (
            <div className="suggest">
              {hotels.map((o) => (
                <button
                  key={`${o.name}-${o.lat}`}
                  type="button"
                  onClick={() => {
                    setName(o.name)
                    setWeb([])
                  }}
                >
                  <span>{o.name}</span>
                  <small>{o.detail}</small>
                </button>
              ))}
            </div>
          ) : null}
          <label className="row" style={{ gap: 10 }}>
            <input type="checkbox" checked={booked} onChange={(e) => setBooked(e.target.checked)} />
            <span>Já reservei (ganha o carimbo 済)</span>
          </label>
          <button
            type="button"
            className="btn main"
            // Painel-editor: continua aberto depois de anotar (a comemoração acontece sobre ele).
            onClick={() => markLodging(stopId, name, booked ? 'booked' : 'planned', true)}
          >
            {booked ? (
              <>
                Marcar reservada <span aria-hidden="true">済</span>
              </>
            ) : (
              'Anotar hospedagem'
            )}
          </button>
        </>
      ) : mine.length ? (
        <p className="note">Todas as noites têm hospedagem.</p>
      ) : null}
      {!mine.length ? (
        <>
          <div className="group-t">OU</div>
          <OptButton
            o={{
              label: 'Vamos ficar com amigos ou família',
              detail: ['Não precisa de reserva: sai das tarefas.'],
              run: () => setLodging('friends'),
            }}
          />
          <OptButton
            o={{
              label: 'Dormimos a bordo (trem, ônibus, barco, carro)',
              detail: ['Não precisa de reserva: sai das tarefas.'],
              run: () => setLodging('onboard'),
            }}
          />
        </>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Sua viagem: nome, quem vai, de onde saem e as datas
// ---------------------------------------------------------------------------

function TripSheet() {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const openSheet = useApp((s) => s.openSheet)
  const it = doc.itinerary
  const [name, setName] = useState(doc.meta.name)
  const saveName = () => {
    const n = name.trim()
    if (n && n !== doc.meta.name) act({ type: 'rename', name: n }, { keep: true })
  }
  const setHome = (p: PlacePick | null) =>
    act(
      {
        type: 'engine',
        command: {
          type: 'setHome',
          home:
            p && p.kind === 'city'
              ? {
                  name: p.name,
                  ...(p.lat !== undefined && p.lon !== undefined ? { lat: p.lat, lon: p.lon } : {}),
                  ...(p.tz ? { tz: p.tz } : {}),
                }
              : null,
        },
      },
      { keep: true },
    )
  return (
    <>
      <h2>Sua viagem</h2>
      <TripCloudRow />
      <label className="field" htmlFor="nome-viagem">
        <span>Nome</span>
        <input
          className="input"
          id="nome-viagem"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </label>
      {/* Quem vai mora em PESSOAS (spec publicação §4.2): aqui, o resumo que leva até lá. */}
      <button type="button" className="field field-link" onClick={() => openSheet({ kind: 'people' })}>
        <span>Quem vai</span>
        <span className="row">
          <b style={{ flex: 1 }}>{it.travelers.map((t) => t.name).join(', ') || 'Ninguém ainda'}</b>
          <span className="link-like">Pessoas ›</span>
        </span>
      </button>
      {doc.meta.cloud ? (
        <button type="button" className="btn small ghost" onClick={() => openSheet({ kind: 'history' })}>
          Histórico: quem mudou o quê
        </button>
      ) : null}
      <div className="field">
        <span>De onde saem (e para onde voltam)</span>
        {it.home ? (
          <span className="row">
            <span className="pill">✈ {it.home.name}</span>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Trocar ${it.home.name}`}
              onClick={() => setHome(null)}
            >
              ×
            </button>
          </span>
        ) : (
          <PlaceSearch id="casa" placeholder="Sua cidade" kinds={['city']} onPick={setHome} free={false} />
        )}
      </div>
      <Dates />
      <ArchivedBookings />
    </>
  )
}

/** Reservas tiradas do roteiro: nada some calado; "Voltar" põe de novo nas conferências. */
function ArchivedBookings() {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const archived = doc.bookings.filter((b) => b.archived)
  if (!archived.length) return null
  return (
    <>
      <div className="group-t">RESERVAS TIRADAS DO ROTEIRO</div>
      {archived.map((b) => (
        <div key={b.id} className="row">
          <span className="note" style={{ flex: 1 }}>
            {b.title}
            {'date' in b && b.date ? ` · ${dayLabel(b.date)}` : ''}
            {b.kind === 'lodging' ? ` · ${dayLabel(b.checkin)} → ${dayLabel(b.checkout)}` : ''}
          </span>
          <button
            type="button"
            className="btn small ghost"
            onClick={() => act({ type: 'setBooking', id: b.id, patch: { archived: false } }, { keep: true })}
          >
            Voltar
          </button>
        </div>
      ))}
    </>
  )
}

function Times({ legId }: { legId: ID }) {
  const doc = useApp((s) => s.doc)!
  // Os horários são um passo do editor do trecho: salvar ou limpar volta a ele.
  const act = (a: DocAction) => {
    const ok = useApp.getState().act(a, { keep: true })
    if (ok) useApp.getState().returnToSheet({ kind: 'leg', legId })
    return ok
  }
  const leg = doc.itinerary.legs.find((l) => l.id === legId)
  const [dep, setDep] = useState(leg?.dep ?? '')
  const [arr, setArr] = useState(leg?.arr ?? '')
  const [off, setOff] = useState(String(leg?.arrDayOffset ?? 0))
  if (!leg) return <h2>Esse trecho saiu do roteiro.</h2>
  return (
    <>
      <h2>Horários de {legName(doc.itinerary, leg, doc)}</h2>
      <p className="sub">Hora local de cada ponta.</p>
      <div className="row">
        <label className="field" htmlFor="dep">
          <span>Sai</span>
          <input
            className="input"
            type="time"
            id="dep"
            value={dep}
            onChange={(e) => setDep(e.target.value)}
          />
        </label>
        <label className="field" htmlFor="arr">
          <span>Chega</span>
          <input
            className="input"
            type="time"
            id="arr"
            value={arr}
            onChange={(e) => setArr(e.target.value)}
          />
        </label>
        <label className="field" htmlFor="off">
          <span>Chega em</span>
          <select className="input" id="off" value={off} onChange={(e) => setOff(e.target.value)}>
            <option value="0">o mesmo dia</option>
            <option value="1">o dia seguinte</option>
            <option value="2">2 dias depois</option>
          </select>
        </label>
      </div>
      <div className="row">
        <button
          type="button"
          className="btn main"
          onClick={() =>
            act({
              type: 'engine',
              command: {
                type: 'setLegTimes',
                legId,
                dep: dep || null,
                arr: arr || null,
                arrDayOffset: Number(off) || null,
              },
            })
          }
        >
          Salvar
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() =>
            act({
              type: 'engine',
              command: { type: 'setLegTimes', legId, dep: null, arr: null, arrDayOffset: null },
            })
          }
        >
          Limpar
        </button>
      </div>
    </>
  )
}

function Dates() {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const it = doc.itinerary
  const r = tripRange(it)
  const [end, setEnd] = useState(r.end ?? '')
  const [start, setStart] = useState(it.start ?? '')
  // Os campos acompanham a viagem (mudar a ida move a volta; Desfazer volta os dois).
  useEffect(() => setEnd(r.end ?? ''), [r.end])
  useEffect(() => setStart(it.start ?? ''), [it.start])
  const fixed = it.lock === 'fixed'
  /** Só vale data completa e plausível: digitar o ano aos poucos (0002, 0020, 0202) não move a viagem. */
  const commitStart = (v: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number(v.slice(0, 4)) < 1900 || v === it.start) return
    act({ type: 'engine', command: { type: 'setTripStart', date: v } }, { keep: true })
  }
  return (
    <>
      <div className="group-t">DATAS</div>
      <label className="field" htmlFor="ida">
        <span>Ida (primeira noite)</span>
        <input
          className="input"
          type="date"
          id="ida"
          value={start}
          onChange={(e) => {
            setStart(e.target.value)
            commitStart(e.target.value)
          }}
          onBlur={(e) => commitStart(e.target.value)}
        />
      </label>
      {it.start ? (
        <button
          type="button"
          className="btn small ghost"
          style={{ alignSelf: 'flex-start' }}
          onClick={() =>
            act({ type: 'engine', command: { type: 'setTripStart', date: null } }, { keep: true })
          }
        >
          Ainda não sei a data
        </button>
      ) : null}
      <div className="row">
        <span className="note" style={{ flex: 1 }}>
          {it.start
            ? fixed
              ? 'Volta marcada 🔒: ao mudar noites, outro destino cede.'
              : 'Volta livre: mudar noites muda a volta.'
            : fixed
              ? 'Duração marcada 🔒: ao mudar noites, outro destino cede.'
              : 'Duração livre: mudar noites muda o total da viagem.'}
        </span>
        <button
          type="button"
          className={`btn small${fixed ? ' main' : ''}`}
          aria-pressed={fixed}
          onClick={() =>
            act(
              { type: 'engine', command: { type: 'setLock', lock: fixed ? 'free' : 'fixed' } },
              { keep: true },
            )
          }
        >
          {it.start
            ? fixed
              ? '🔒 Volta marcada'
              : 'Marcar a volta'
            : fixed
              ? '🔒 Duração marcada'
              : 'Marcar a duração'}
        </button>
      </div>
      {it.start ? (
        <>
          <label className="field" htmlFor="volta">
            <span>Volta {r.end ? `(hoje: ${dayLabel(r.end)})` : ''}</span>
            <input
              className="input"
              type="date"
              id="volta"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          {end && end !== r.end ? endOptions(end).map((o, i) => <OptButton key={i} o={o} />) : null}
        </>
      ) : null}
    </>
  )
}

/** Quantos destinos aparecem como fichas; o resto, pela busca. */
const DEST_CHIPS = 8
const norm = (t: string) => fold(t).trim()

function DestPicker({ title, pick }: { title: string; pick: (destId: ID) => void }) {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  // Fichas: os guardados (fora da viagem) primeiro, depois os da viagem, do fim para o começo.
  const inTrip = doc.itinerary.stops.map((s) => s.destinationId).filter((x): x is ID => !!x)
  const saved = doc.destinations.filter((d) => !inTrip.includes(d.id))
  const trip = [...new Set([...inTrip].reverse())]
    .map((id) => doc.destinations.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => !!d)
  const chips = [...saved, ...trip].slice(0, DEST_CHIPS)
  const add = (p: PlacePick) => {
    if (p.kind !== 'city') return
    // Um destino que já está na viagem (de novo, outra vez): usa o mesmo.
    const same = doc.destinations.find(
      (d) => norm(d.name) === norm(p.name) && (!p.country || !d.country || d.country === p.country),
    )
    if (same) return pick(same.id)
    const id = uid('d-')
    const dest = {
      id,
      kind: p.destKind ?? ('city' as const),
      name: p.name,
      ...(p.localName ? { localName: p.localName } : {}),
      ...(p.country ? { country: p.country } : {}),
      ...(p.lat !== undefined && p.lon !== undefined ? { lat: p.lat, lon: p.lon } : {}),
      ...(p.tz ? { tz: p.tz } : {}),
    }
    if (act({ type: 'addDestination', destination: dest })) pick(id)
  }
  return (
    <>
      <h2>{title}</h2>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {chips.map((d) => (
          <button
            key={d.id}
            type="button"
            className="chip-dest"
            style={{ ['--c' as string]: colorOf(doc.destinations, d.id) }}
            onClick={() => pick(d.id)}
          >
            <span className="seal sm" style={{ ['--c' as string]: colorOf(doc.destinations, d.id) }}>
              {sealOf(d)}
            </span>
            {d.name}
          </button>
        ))}
      </div>
      <label className="field" htmlFor="busca-destino">
        <span>
          {doc.destinations.length > chips.length ? 'Buscar destino (da viagem ou novo)' : 'Outro destino'}
        </span>
        <PlaceSearch
          id="busca-destino"
          placeholder="Busque: Lisboa, Cusco, Seul…"
          kinds={['city']}
          within={doc.scope?.country}
          exclude={doc.destinations.map((d) => d.name)}
          mine={doc.destinations.map((d) => ({
            id: d.id,
            name: d.name,
            detail: inTrip.includes(d.id) ? 'já na viagem · de novo' : 'guardado',
          }))}
          onMine={pick}
          bias={
            doc.scope?.lat !== undefined && doc.scope.lon !== undefined
              ? { lat: doc.scope.lat, lon: doc.scope.lon }
              : undefined
          }
          onPick={add}
        />
      </label>
    </>
  )
}
