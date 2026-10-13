import { useState } from 'react'
import {
  allVisits,
  dayLabel,
  days as allDays,
  findVisit,
  legName,
  MODE_NAMES,
  placeStates,
  plural,
  tripRange,
} from '../engine'
import type { ID, LegMode, PlaceKind, Rarity, Slot } from '../engine'
import { uid, useApp } from '../app/store'
import { PLACE_KIND_ORDER, PLACE_KINDS } from './placeKinds'
import {
  aboardChoice,
  cityName,
  endOptions,
  insertOptions,
  minusNight,
  plusNight,
  shiftCity,
  splitOptions,
} from '../app/choices'
import { RARITY } from './rarity'
import { colorOf, sealOf } from './colors'
import { OptButton, SheetFrame, Stepper, Vehicle } from './kit'
import { PlaceSearch } from './PlaceSearch'
import type { PlacePick } from './PlaceSearch'
import type { SheetSpec } from './sheetTypes'

// Painéis com as ações em palavras (o mesmo caminho dos gestos, para quem não arrasta).

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
  const setOpenStop = useApp((s) => s.setOpenStop)
  const focusOn = useApp((s) => s.focusOn)
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

    case 'city': {
      const s = it.stops.find((x) => x.id === sheet.stopId)
      if (!s) return <h2>Esse destino saiu do roteiro.</h2>
      const i = it.stops.indexOf(s)
      const name = cityName(s.id)
      if (!s.destinationId)
        return (
          <>
            <h2>{plural(s.days.length, 'noite em aberto', 'noites em aberto')}</h2>
            <OptButton o={{ label: 'Ver no roteiro', run: () => focusOn(`c-${s.id}`, 'mapa') }} />
          </>
        )
      return (
        <>
          <h2>{name}</h2>
          <p className="sub">{plural(s.days.length, 'noite', 'noites')}. O que você quer fazer?</p>
          <OptButton
            o={{
              label: 'Planejar os dias e colar figurinhas',
              main: true,
              run: () => {
                setOpenStop(s.id)
                focusOn(`c-${s.id}`, 'mapa')
              },
            }}
          />
          <div className="row">
            <button type="button" className="btn small" onClick={() => plusNight(s.id)}>
              Mais 1 noite
            </button>
            <button type="button" className="btn small" onClick={() => minusNight(s.id)}>
              Menos 1 noite
            </button>
          </div>
          {i > 0 && i < it.stops.length - 1 ? (
            <div className="row">
              <button type="button" className="btn small" onClick={() => shiftCity(s.id, -1)}>
                Chegar 1 dia antes
              </button>
              <button type="button" className="btn small" onClick={() => shiftCity(s.id, 1)}>
                Chegar 1 dia depois
              </button>
            </div>
          ) : null}
          <OptButton
            o={{
              label: 'Mudar a ordem',
              detail: ['Escolha depois de qual destino ele vem.'],
              run: () => openSheet({ kind: 'order', stopId: s.id }),
            }}
          />
          {s.days.length >= 2 ? (
            <OptButton
              o={{
                label: 'Ir a outro destino no meio',
                detail: [`Ex.: 2 noites em outro lugar no meio de ${name}.`],
                run: () =>
                  openSheet({
                    kind: 'dest',
                    title: `Que destino no meio de ${name}?`,
                    pick: (destId) =>
                      openSheet({
                        kind: 'split',
                        stopId: s.id,
                        destId,
                        nights: 1,
                        after: Math.max(1, Math.floor(s.days.length / 2)),
                      }),
                  }),
              }}
            />
          ) : null}
          <OptButton
            o={{
              label: s.tentative ? 'Confirmar as noites' : 'Noites incertas ("2 ou 3, decidimos lá")',
              run: () =>
                act({
                  type: 'engine',
                  command: { type: 'setTentative', stopId: s.id, tentative: !s.tentative },
                }),
            }}
          />
          <OptButton
            o={{
              label: 'Tirar do roteiro',
              detail: ['As noites ficam em aberto, com as mesmas datas. A mochila dele fica guardada.'],
              run: () =>
                act({ type: 'engine', command: { type: 'removeStop', stopId: s.id } }, { burst: true }),
            }}
          />
        </>
      )
    }

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
              label: '+ Destino aqui',
              detail: ['Um lugar novo entre esses dois.'],
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
      if (!p) return <h2>Essa figurinha saiu do álbum.</h2>
      const st = placeStates(it, doc.places).get(p.id)
      const visits = allVisits(it).filter((v) => v.visit.placeId === p.id && !v.where.startsWith('w:'))
      const ds = allDays(it)
      const visitDay = (id: string) => ds.find((d) => d.visits.some((v) => v.id === id))
      return (
        <>
          <h2>{p.name}</h2>
          <p className="sub">
            {destName(p.destinationId)} ·{' '}
            {st?.days.length ? `colada em ${st.days.map((d) => d.label).join(', ')}` : 'solta'}
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
          <div className="kind-row" role="group" aria-label="Tipo do lugar">
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
                  say(`Toque no mapa onde fica ${p.name}.`)
                },
              }}
            />
          )}
          <OptButton
            o={{
              label: st?.days.length ? 'Colar em mais um dia' : 'Colar num dia',
              main: !st?.days.length,
              run: () =>
                openSheet({
                  kind: 'days',
                  title: `Colar ${p.name} em qual dia?`,
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
                label: `Descolar de ${visitDay(v.visit.id)?.label ?? 'um dia'}`,
                detail: ['Continua no álbum.'],
                run: () => act({ type: 'engine', command: { type: 'unscheduleVisit', visitId: v.visit.id } }),
              }}
            />
          ))}
          {visits.length ? (
            <OptButton
              o={{
                label: st?.visited ? 'Desmarcar visitada' : 'Marcar visitada 済',
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
          <OptButton
            o={{
              label: 'Tirar do álbum',
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
      if (!v) return <h2>Essa figurinha não está mais aqui.</h2>
      const p = doc.places.find((x) => x.id === v.placeId)
      const slots: [Slot, string][] = [
        ['any', 'qualquer hora'],
        ['morning', 'manhã'],
        ['afternoon', 'tarde'],
        ['evening', 'noite'],
      ]
      return (
        <>
          <h2>{p?.name ?? 'Figurinha'}</h2>
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
              label: v.visited ? 'Desmarcar visitada' : 'Marcar visitada 済',
              run: () =>
                act({
                  type: 'engine',
                  command: { type: 'setVisitMeta', visitId: v.id, visited: !v.visited },
                }),
            }}
          />
          <OptButton
            o={{
              label: 'Descolar do dia',
              detail: ['Continua no álbum.'],
              run: () => act({ type: 'engine', command: { type: 'unscheduleVisit', visitId: v.id } }),
            }}
          />
        </>
      )
    }

    case 'end':
      return <Dates />

    case 'newPlace':
      return <NewPlace destId={sheet.destId} lat={sheet.lat} lon={sheet.lon} />
  }
}

/** Lugar novo marcado no mapa da cidade: nome, tipo e prioridade (um toque cria). */
function NewPlace({ destId, lat, lon }: { destId: ID; lat: number; lon: number }) {
  const doc = useApp((s) => s.doc)!
  const act = useApp((s) => s.act)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<PlaceKind>('sight')
  const dest = doc.destinations.find((d) => d.id === destId)
  const create = (rarity: Rarity) => {
    if (!name.trim()) return
    act({
      type: 'addPlace',
      place: { id: uid('p'), destinationId: destId, name: name.trim(), rarity, lat, lon, kind },
    })
  }
  return (
    <>
      <h2>Lugar novo em {dest?.name ?? 'destino'}</h2>
      <p className="sub">Já marcado no mapa. Dê o nome, o tipo e a prioridade.</p>
      <input
        className="input"
        id="novo-lugar"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome do lugar"
        aria-label="Nome do lugar"
        autoComplete="off"
      />
      <div className="kind-row" role="group" aria-label="Tipo do lugar">
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
      <div className="rarity-row" role="group" aria-label="Criar com a prioridade">
        {(['maybe', 'want', 'must'] as Rarity[]).map((r) => (
          <button
            key={r}
            type="button"
            className={`rar r-${r}`}
            disabled={!name.trim()}
            onClick={() => create(r)}
          >
            {RARITY[r].gems} {RARITY[r].label}
          </button>
        ))}
      </div>
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
      <h2>Datas da viagem</h2>
      <label className="field" htmlFor="ida">
        <span>Ida (primeira noite)</span>
        <input
          className="input"
          type="date"
          id="ida"
          value={it.start ?? ''}
          onChange={(e) =>
            e.target.value && act({ type: 'engine', command: { type: 'setTripStart', date: e.target.value } })
          }
        />
      </label>
      {it.start ? (
        <button
          type="button"
          className="btn small ghost"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => act({ type: 'engine', command: { type: 'setTripStart', date: null } })}
        >
          Ainda não sei a data
        </button>
      ) : null}
      <div className="row">
        <span className="note" style={{ flex: 1 }}>
          {fixed
            ? 'Volta marcada 🔒: ao mudar noites, outra cidade cede.'
            : 'Volta livre: mudar noites muda a volta.'}
        </span>
        <button
          type="button"
          className={`btn small${fixed ? ' main' : ''}`}
          aria-pressed={fixed}
          onClick={() =>
            act({ type: 'engine', command: { type: 'setLock', lock: fixed ? 'free' : 'fixed' } })
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
      kind: 'city' as const,
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
          onPick={add}
        />
      </label>
    </>
  )
}
