import { useEffect, useState } from 'react'
import {
  allVisits,
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
import type { Booking, ID, LegMode, PlaceKind, Rarity, Slot } from '../engine'
import { uid, useApp } from '../app/store'
import { aboardChoice, cityName, endOptions, insertOptions, markLodging, splitOptions } from '../app/choices'
import { searchOnline } from '../providers/places'
import type { OnlinePlace } from '../providers/places'
import { RARITY } from './rarity'
import { colorOf, sealOf } from './colors'
import { OptButton, SheetFrame, Stepper, Vehicle } from './kit'
import { PlaceSearch } from './PlaceSearch'
import type { PlacePick } from './PlaceSearch'
import { PLACE_KIND_ORDER, PLACE_KINDS } from './placeKinds'
import type { SheetSpec } from './sheetTypes'

// Painéis com as ações em palavras (o mesmo caminho dos gestos, para quem não arrasta),
// e os painéis de criar: atividade, hospedagem e "Sua viagem".

const MODES: LegMode[] = ['flight', 'train', 'bus', 'car', 'boat', 'walk', 'bike', 'moto']

export function Sheets() {
  const sheet = useApp((s) => s.sheet)
  const close = useApp((s) => s.closeSheet)
  if (!sheet) return null
  return (
    <SheetFrame onClose={close}>
      <Body sheet={sheet} />
    </SheetFrame>
  )
}

function Body({ sheet }: { sheet: SheetSpec }) {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const openSheet = useApp((s) => s.openSheet)
  const patchSheet = useApp((s) => s.patchSheet)
  const enterCity = useApp((s) => s.enterCity)
  const setPlacing = useApp((s) => s.setPlacing)
  const say = useApp((s) => s.say)
  const it = doc.itinerary
  const destName = (id: ID) => doc.destinations.find((d) => d.id === id)?.name ?? 'Destino'

  switch (sheet.kind) {
    case 'choice':
      return (
        <>
          <h2>{sheet.title}</h2>
          {sheet.sub ? <p className="sub">{sheet.sub}</p> : null}
          {sheet.options.map((o, i) => (
            <OptButton key={i} o={o} />
          ))}
        </>
      )

    case 'order': {
      const s = it.stops.find((x) => x.id === sheet.stopId)
      if (!s) return <h2>Esse destino saiu do roteiro.</h2>
      const others = it.stops.filter((x) => x.id !== s.id)
      const cur = it.stops.indexOf(s)
      return (
        <>
          <h2>Onde {cityName(s.id)} entra?</h2>
          <OptButton
            o={{
              label: 'No começo da viagem',
              disabled: cur === 0,
              run: () => act({ type: 'engine', command: { type: 'reorderStop', stopId: s.id, toIndex: 0 } }),
            }}
          />
          {others.map((o, k) => (
            <OptButton
              key={o.id}
              o={{
                label: `Depois de ${cityName(o.id)}`,
                disabled: k + 1 === cur,
                run: () =>
                  act({ type: 'engine', command: { type: 'reorderStop', stopId: s.id, toIndex: k + 1 } }),
              }}
            />
          ))}
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
                  act({ type: 'engine', command: { type: 'setLegMode', legId: leg.id, mode: m } })
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
        </>
      )
    }

    case 'times':
      return <Times legId={sheet.legId} />

    case 'dest':
      return <DestPicker title={sheet.title} pick={sheet.pick} />

    case 'where': {
      const name = destName(sheet.destId)
      const opts = [
        {
          label: 'No começo da viagem',
          run: () => openSheet({ kind: 'insert', index: 0, destId: sheet.destId, nights: 1 }),
        },
        ...it.stops.slice(0, -1).map((s, i) => ({
          label: `Entre ${cityName(s.id)} e ${cityName(it.stops[i + 1]!.id)}`,
          run: () => openSheet({ kind: 'insert', index: i + 1, destId: sheet.destId, nights: 1 }),
        })),
        {
          label: 'No fim da viagem',
          run: () => openSheet({ kind: 'insert', index: it.stops.length, destId: sheet.destId, nights: 1 }),
        },
        ...it.stops
          .filter((s) => s.destinationId && s.destinationId !== sheet.destId && s.days.length >= 2)
          .map((s) => ({
            label: `No meio de ${cityName(s.id)}`,
            run: () =>
              openSheet({
                kind: 'split',
                stopId: s.id,
                destId: sheet.destId,
                nights: 1,
                after: Math.max(1, Math.floor(s.days.length / 2)),
              }),
          })),
        ...it.stops
          .filter((s) => !s.destinationId)
          .map((s) => ({
            label: `Nas ${plural(s.days.length, 'noite', 'noites')} em aberto`,
            run: () =>
              act({
                type: 'engine',
                command: { type: 'fillOpen', stopId: s.id, destinationId: sheet.destId },
              }),
          })),
      ]
      return (
        <>
          <h2>Onde {name} entra?</h2>
          <p className="sub">Dica: segure {name} na prateleira e solte direto na trilha.</p>
          {opts.map((o, i) => (
            <OptButton key={i} o={o} />
          ))}
        </>
      )
    }

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

    case 'days': {
      const ds = allDays(it, doc.places).filter((d) => d.ref)
      const near = sheet.prefer ? ds.filter((d) => d.destinationId === sheet.prefer) : []
      const rest = ds.filter((d) => !near.includes(d))
      const row = (d: (typeof ds)[number]) => (
        <OptButton
          key={d.index}
          o={{
            label: `${d.label} · ${d.kind === 'aboard' ? 'a bordo' : d.kind === 'departure' ? 'dia da volta' : d.destinationId ? destName(d.destinationId) : ''}`,
            detail: [
              d.visits.length
                ? d.visits.map((v) => doc.places.find((p) => p.id === v.placeId)?.name).join(', ')
                : 'dia livre',
            ],
            run: () => sheet.pick(d.ref!),
          }}
        />
      )
      return (
        <>
          <h2>{sheet.title}</h2>
          {near.length ? <div className="group-t">EM {destName(sheet.prefer!).toUpperCase()}</div> : null}
          {near.map(row)}
          {rest.length ? (
            <div className="group-t">{near.length ? 'OUTROS DIAS (BATE-VOLTA)' : 'DIAS'}</div>
          ) : null}
          {rest.map(row)}
        </>
      )
    }

    case 'sticker': {
      const p = doc.places.find((x) => x.id === sheet.placeId)
      if (!p) return <h2>Essa atividade foi apagada.</h2>
      const st = placeStates(it, doc.places).get(p.id)
      const visits = allVisits(it).filter((v) => v.visit.placeId === p.id && !v.where.startsWith('w:'))
      const ds = allDays(it)
      const visitDay = (id: string) => ds.find((d) => d.visits.some((v) => v.id === id))
      return (
        <>
          <h2>{p.name}</h2>
          <p className="sub">
            {destName(p.destinationId)} ·{' '}
            {st?.days.length ? `em ${st.days.map((d) => d.label).join(', ')}` : 'ainda sem dia'}
          </p>
          <div className="rarity-row" role="group" aria-label="Prioridade">
            {(['maybe', 'want', 'must'] as Rarity[]).map((r) => (
              <button
                key={r}
                type="button"
                className={`rar r-${r}${p.rarity === r ? ' on' : ''}`}
                aria-pressed={p.rarity === r}
                onClick={() => p.rarity !== r && act({ type: 'setPlace', id: p.id, patch: { rarity: r } })}
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
                onClick={() =>
                  (p.kind ?? 'sight') !== k && act({ type: 'setPlace', id: p.id, patch: { kind: k } })
                }
              >
                <b>{PLACE_KINDS[k].glyph}</b> {PLACE_KINDS[k].label}
              </button>
            ))}
          </div>
          <OptButton
            o={{
              label: st?.days.length ? 'Pôr em mais um dia' : 'Pôr num dia',
              main: !st?.days.length,
              run: () =>
                openSheet({
                  kind: 'days',
                  title: `Pôr ${p.name} em qual dia?`,
                  prefer: p.destinationId,
                  pick: (ref) =>
                    act({
                      type: 'engine',
                      command: { type: 'scheduleVisit', visitId: uid('v'), placeId: p.id, day: ref },
                    }),
                }),
            }}
          />
          {visits.map((v) => (
            <OptButton
              key={v.visit.id}
              o={{
                label: `Tirar de ${visitDay(v.visit.id)?.label ?? 'um dia'}`,
                detail: ['Continua na lista, sem dia.'],
                run: () => act({ type: 'engine', command: { type: 'unscheduleVisit', visitId: v.visit.id } }),
              }}
            />
          ))}
          {visits.length ? (
            <OptButton
              o={{
                label: st?.visited ? 'Desmarcar como feita' : 'Marcar como feita 済',
                run: () =>
                  act({
                    type: 'batch',
                    actions: visits.map((v) => ({
                      type: 'engine' as const,
                      command: { type: 'setVisitMeta' as const, visitId: v.visit.id, visited: !st?.visited },
                    })),
                  }),
              }}
            />
          ) : null}
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
              label: 'Apagar atividade',
              detail: ['Sai de todos os dias também. Dá para desfazer.'],
              run: () => act({ type: 'removePlace', id: p.id }),
            }}
          />
        </>
      )
    }

    case 'visit': {
      const f = findVisit(it, sheet.visitId)
      const v = f?.list[f.index]
      if (!v) return <h2>Essa atividade não está mais aqui.</h2>
      const p = doc.places.find((x) => x.id === v.placeId)
      const slots: [Slot, string][] = [
        ['any', 'qualquer hora'],
        ['morning', 'manhã'],
        ['afternoon', 'tarde'],
        ['evening', 'noite'],
      ]
      return (
        <>
          <h2>{p?.name ?? 'Atividade'}</h2>
          <div className="field">
            <span>Turno</span>
            <div className="segs">
              {slots.map(([slot, label]) => (
                <button
                  key={slot}
                  type="button"
                  className={v.slot === slot ? 'on' : ''}
                  aria-pressed={v.slot === slot}
                  onClick={() =>
                    v.slot !== slot &&
                    act({ type: 'engine', command: { type: 'setVisitMeta', visitId: v.id, slot } })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <OptButton
            o={{
              label: 'Mudar de dia',
              run: () =>
                openSheet({
                  kind: 'days',
                  title: 'Para qual dia?',
                  prefer: p?.destinationId,
                  pick: (ref) =>
                    act({ type: 'engine', command: { type: 'moveVisit', visitId: v.id, to: ref } }),
                }),
            }}
          />
          <OptButton
            o={{
              label: v.visited ? 'Desmarcar como feita' : 'Marcar como feita 済',
              run: () =>
                act({
                  type: 'engine',
                  command: { type: 'setVisitMeta', visitId: v.id, visited: !v.visited },
                }),
            }}
          />
          {p ? (
            <OptButton
              o={{
                label: 'Detalhes da atividade',
                detail: ['Prioridade, tipo, lugar no mapa.'],
                run: () => openSheet({ kind: 'sticker', placeId: p.id }),
              }}
            />
          ) : null}
          <OptButton
            o={{
              label: 'Tirar do dia',
              detail: ['Continua na lista, sem dia.'],
              run: () => act({ type: 'engine', command: { type: 'unscheduleVisit', visitId: v.id } }),
            }}
          />
        </>
      )
    }

    case 'trip':
      return <TripSheet />

    case 'newActivity':
      return <NewActivity spec={sheet} />

    case 'lodging':
      return <LodgingSheet stopId={sheet.stopId} />
  }
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
  const loose = doc.places.filter((p) => p.destinationId === spec.destId && !states.get(p.id)?.days.length)

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
          <div className="group-t">JÁ NA LISTA, SEM DIA</div>
          <div className="pills">
            {loose.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`pill r-${p.rarity}`}
                onClick={() =>
                  act({
                    type: 'engine',
                    command: { type: 'scheduleVisit', visitId: uid('v'), placeId: p.id, day: spec.day! },
                  })
                }
              >
                {RARITY[p.rarity].gems} {p.name}
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
  if (!stop || !dest) return <h2>Esse destino saiu do roteiro.</h2>
  const missing = gap?.missing ?? []
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
                onClick={() => act({ type: 'setBooking', id: b.id, patch: { status: 'planned' } })}
              >
                Ainda não reservei
              </button>
            ) : (
              <button
                type="button"
                className="btn small"
                onClick={() =>
                  act({ type: 'setBooking', id: b.id, patch: { status: 'booked' } }, { stamp: true })
                }
              >
                Já reservei 済
              </button>
            )}
            <button
              type="button"
              className="btn small ghost"
              onClick={() => act({ type: 'removeBooking', id: b.id })}
            >
              Tirar
            </button>
          </div>
        </div>
      ))}
      {missing.length ? (
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
            onClick={() => markLodging(stopId, name, booked ? 'booked' : 'planned')}
          >
            {booked ? 'Marcar reservada 済' : 'Anotar hospedagem'}
          </button>
        </>
      ) : mine.length ? (
        <p className="note">Todas as noites têm hospedagem.</p>
      ) : (
        <p className="note">Sem datas ainda: escolha a data de ida para anotar a hospedagem.</p>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Sua viagem: nome, quem vai, de onde saem e as datas
// ---------------------------------------------------------------------------

function TripSheet() {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const it = doc.itinerary
  const [name, setName] = useState(doc.meta.name)
  const [people, setPeople] = useState(it.travelers.map((t) => t.name))
  const saveName = () => {
    const n = name.trim()
    if (n && n !== doc.meta.name) act({ type: 'rename', name: n }, { keep: true })
  }
  const savePeople = (list: string[]) => {
    const names = list.map((n) => n.trim()).filter(Boolean)
    if (!names.length) return
    const travelers = names.map((n, i) => ({ ...(it.travelers[i] ?? { id: `t${i + 1}` }), name: n }))
    if (JSON.stringify(travelers) !== JSON.stringify(it.travelers))
      act({ type: 'engine', command: { type: 'setTravelers', travelers } }, { keep: true })
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
      <div className="field">
        <span>Quem vai</span>
        {people.map((n, i) => (
          <div key={i} className="row">
            <input
              className="input"
              style={{ flex: 1 }}
              value={n}
              aria-label={`Viajante ${i + 1}`}
              onChange={(e) => setPeople(people.map((x, k) => (k === i ? e.target.value : x)))}
              onBlur={() => savePeople(people)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            {people.length > 1 ? (
              <button
                type="button"
                className="icon-btn"
                aria-label={`Tirar ${n || 'viajante'}`}
                onClick={() => {
                  const next = people.filter((_, k) => k !== i)
                  setPeople(next)
                  savePeople(next)
                }}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          className="btn small ghost"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => setPeople([...people, `Viajante ${people.length + 1}`])}
        >
          + Mais uma pessoa
        </button>
      </div>
      <div className="field">
        <span>De onde saem (e para onde voltam)</span>
        {it.home ? (
          <button type="button" className="pill" onClick={() => setHome(null)}>
            ✈ {it.home.name} ×
          </button>
        ) : (
          <PlaceSearch id="casa" placeholder="Sua cidade" kinds={['city']} onPick={setHome} free={false} />
        )}
      </div>
      <Dates />
    </>
  )
}

function Times({ legId }: { legId: ID }) {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
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
  const fixed = it.lock === 'fixed'
  return (
    <>
      <div className="group-t">DATAS</div>
      <label className="field" htmlFor="ida">
        <span>Ida (primeira noite)</span>
        <input
          className="input"
          type="date"
          id="ida"
          value={it.start ?? ''}
          onChange={(e) =>
            e.target.value &&
            act({ type: 'engine', command: { type: 'setTripStart', date: e.target.value } }, { keep: true })
          }
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
          {fixed
            ? 'Volta marcada 🔒: ao mudar noites, outro destino cede.'
            : 'Volta livre: mudar noites muda a volta.'}
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
          {fixed ? '🔒 Volta marcada' : 'Marcar a volta'}
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

function DestPicker({ title, pick }: { title: string; pick: (destId: ID) => void }) {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const add = (p: PlacePick) => {
    if (p.kind !== 'city') return
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
        {doc.destinations.map((d) => (
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
        <span>Outro destino</span>
        <PlaceSearch
          id="busca-destino"
          placeholder="Busque: Lisboa, Cusco, Seul…"
          kinds={['city']}
          within={doc.scope?.country}
          exclude={doc.destinations.map((d) => d.name)}
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
