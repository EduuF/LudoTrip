import { useEffect, useState } from 'react'
import { createItinerary, haversineKm } from '../engine'
import type { Destination, LegMode, NewTripSpec } from '../engine'
import { setLocalBack, uid, useApp } from '../app/store'
import type { TripDoc } from '../app/doc'
import { areaLabel } from '../app/area'
import { CITIES } from '../providers/cities'
import { countryBounds } from '../providers/countries'
import { PlaceSearch } from './PlaceSearch'
import type { PlacePick } from './PlaceSearch'
import { Stepper, Travelers } from './kit'

// Criar viagem em passos curtos (spec §7 e spec 2026-10-15): pra onde (os destinos, na ordem; um país
// sem cidade vira noites em aberto nele), quando, quem, como, nome. Tudo pode ser ajustado depois.

const MOVES: { label: string; hint: string; mode: LegMode }[] = [
  { label: 'Avião', hint: 'entre lugares longe', mode: 'flight' },
  { label: 'Trem e ônibus', hint: 'de cidade em cidade', mode: 'train' },
  { label: 'Carro', hint: 'road trip', mode: 'car' },
  { label: 'Misturado', hint: 'cada trecho de um jeito', mode: 'bus' },
  { label: 'A pé ou bike', hint: 'trilha em etapas', mode: 'walk' },
]

const STEPS = ['Pra onde', 'Quando', 'Quem vai', 'Como', 'Nome']

/** Onde fica uma escolha no mapa, para saber se a casa é longe (a cidade, ou o meio do país). */
async function pointOf(p: PlacePick): Promise<{ lat: number; lon: number } | null> {
  if (p.kind === 'city') return p.lat !== undefined && p.lon !== undefined ? { lat: p.lat, lon: p.lon } : null
  const b = await countryBounds(p.id)
  return b ? { lat: (b[1] + b[3]) / 2, lon: (b[0] + b[2]) / 2 } : null
}

export function Create() {
  const goHome = useApp((s) => s.goHome)
  const addTrip = useApp((s) => s.addTrip)
  const cloudEnabled = useApp((s) => s.cloudEnabled)
  const [step, setStep] = useState(0)
  const [picks, setPicks] = useState<PlacePick[]>([])
  const [home, setHome] = useState<PlacePick | null>(null)
  const [start, setStart] = useState('')
  const [nights, setNights] = useState(7)
  const [people, setPeople] = useState(2)
  const [mode, setMode] = useState<LegMode>('train')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const label = areaLabel(picks)
  const tripName = name.trim() || (picks.length ? `Viagem para ${label}` : 'Minha viagem')
  const lastCountry = picks[picks.length - 1]?.country
  const suggestions = lastCountry
    ? CITIES.filter((c) => c.country === lastCountry && !picks.some((p) => p.name === c.name)).slice(0, 8)
    : []
  const add = (p: PlacePick) => {
    if (!picks.some((x) => x.kind === p.kind && x.name === p.name)) setPicks([...picks, p])
  }

  const finish = async () => {
    if (!picks.length) return
    setBusy(true)
    const destinations: Destination[] = []
    const order: NewTripSpec['destinationIds'] = []
    for (const c of picks) {
      if (c.kind === 'country') {
        const bbox = await countryBounds(c.id)
        order.push({
          openIn: {
            country: c.country,
            name: c.name,
            ...(c.localName ? { localName: c.localName } : {}),
            ...(bbox ? { bbox } : {}),
          },
        })
        continue
      }
      const id = `d-${destinations.length + 1}`
      destinations.push({
        id,
        name: c.name,
        kind: c.destKind ?? 'city',
        ...(c.localName ? { localName: c.localName } : {}),
        ...(c.country ? { country: c.country } : {}),
        ...(c.lat !== undefined && c.lon !== undefined ? { lat: c.lat, lon: c.lon } : {}),
        ...(c.tz ? { tz: c.tz } : {}),
      })
      order.push(id)
    }
    let first: { lat: number; lon: number } | null = null
    for (const c of picks) if ((first = await pointOf(c))) break
    const far =
      home?.kind === 'city' && home.lat !== undefined && home.lon !== undefined && first
        ? haversineKm({ lat: home.lat, lon: home.lon }, first) > 700
        : mode === 'flight'
    let n = 0
    const itinerary = createItinerary(
      {
        destinationIds: order,
        nights,
        start: start || null,
        defaultMode: mode,
        homeMode: far ? 'flight' : mode,
        travelers: Array.from({ length: people }, (_, i) => ({ id: `t${i + 1}`, name: `Viajante ${i + 1}` })),
        ...(home
          ? {
              home: {
                name: home.name,
                ...(home.kind === 'city' && home.lat !== undefined ? { lat: home.lat, lon: home.lon } : {}),
                ...(home.kind === 'city' && home.tz ? { tz: home.tz } : {}),
              },
            }
          : {}),
      },
      { newId: () => `s${++n}` },
    )
    const now = Date.now()
    const doc: TripDoc = {
      meta: { id: uid('t'), name: tripName, createdAt: now, updatedAt: now },
      itinerary,
      destinations,
      places: [],
      bookings: [],
      seq: 0,
    }
    await addTrip(doc)
  }

  // Voltar do sistema (spec §17.14): o passo anterior, como o "‹ Voltar".
  useEffect(() => {
    setLocalBack(() => (step ? setStep(step - 1) : goHome()))
    return () => setLocalBack(null)
  }, [step, goHome])

  const canNext = step === 0 ? picks.length > 0 : true

  return (
    <div className="wrap">
      <div className="row" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn small ghost"
          onClick={() => (step ? setStep(step - 1) : goHome())}
        >
          ‹ {step ? 'Voltar' : 'Suas viagens'}
        </button>
        <span className="spacer" />
        <span className="steps">
          {step + 1}/{STEPS.length} · {STEPS[step]!.toUpperCase()}
        </span>
      </div>

      {step === 0 ? (
        <>
          <h1 className="title">
            Pra onde <em>vocês vão?</em>
          </h1>
          <p className="note">
            As cidades, parques ou ilhas, na ordem que imaginam. Ainda não sabem as cidades? Escolham só o
            país. Dá para mudar tudo depois.
          </p>
          {picks.length ? (
            <div className="pills" style={{ marginTop: 10 }}>
              {picks.map((c, i) => (
                <button
                  key={`${c.kind}-${c.name}`}
                  type="button"
                  className="pill"
                  onClick={() => setPicks(picks.filter((_, k) => k !== i))}
                  aria-label={`Tirar ${c.name}`}
                >
                  {i + 1}. {c.name}
                  {c.kind === 'country' ? ' · cidades em aberto' : ''} ×
                </button>
              ))}
            </div>
          ) : null}
          <div className="field" style={{ marginTop: 12 }}>
            <span>{picks.length ? 'Mais um destino' : 'Destinos'}</span>
            <PlaceSearch
              id="destino"
              placeholder="Busque: Japão, Kyoto, Patagônia…"
              kinds={['country', 'city']}
              {...(lastCountry ? { within: lastCountry } : {})}
              exclude={picks.map((p) => p.name)}
              onPick={add}
            />
          </div>
          {suggestions.length ? (
            <div className="pills" style={{ marginTop: 10 }}>
              {suggestions.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className="pill"
                  onClick={() => add({ kind: 'city', ...c })}
                >
                  + {c.name}
                </button>
              ))}
            </div>
          ) : null}
          <div className="field" style={{ marginTop: 16 }}>
            <span>De onde vocês saem? (opcional)</span>
            {home ? (
              <button type="button" className="pill" onClick={() => setHome(null)}>
                {home.name} ×
              </button>
            ) : (
              <PlaceSearch id="casa" placeholder="Sua cidade" kinds={['city']} onPick={setHome} />
            )}
          </div>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <h1 className="title">
            <em>Quando?</em>
          </h1>
          <div className="field" style={{ marginTop: 12 }}>
            <span>Primeira noite</span>
            <input
              className="input"
              type="date"
              id="inicio"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <p className="note">
            {start
              ? 'A contagem regressiva começa agora.'
              : 'Ainda não sabe? Deixe em branco: os dias viram dia 1, dia 2…'}
          </p>
          <div className="field" style={{ marginTop: 14 }}>
            <span>Quantas noites</span>
            <Stepper
              value={nights}
              min={Math.max(1, picks.length)}
              max={365}
              label="Noites da viagem"
              onMinus={() => setNights(nights - 1)}
              onPlus={() => setNights(nights + 1)}
            />
          </div>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <h1 className="title">
            Quem <em>vai?</em>
          </h1>
          <div className="choices" style={{ marginTop: 12 }}>
            {[1, 2, 3, 4, 6].map((n) => (
              <button
                key={n}
                type="button"
                className={`choice${people === n ? ' on' : ''}`}
                aria-pressed={people === n}
                onClick={() => setPeople(n)}
              >
                {n === 6 ? 'Uma galera' : n === 1 ? 'Só eu' : `${n} pessoas`}
                <small>{n === 6 ? '5 ou mais: vão de Kombi' : n === 2 ? 'casal ou dupla' : ' '}</small>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <Travelers count={people} height={90} />
          </div>
          {cloudEnabled && people > 1 ? (
            <p className="note">Depois de criar, compartilhe o link: quem vai planeja junto com você.</p>
          ) : null}
        </>
      ) : null}

      {step === 3 ? (
        <>
          <h1 className="title">
            Como vão <em>se mover?</em>
          </h1>
          <p className="note">É só o padrão: cada trecho pode ser trocado depois.</p>
          <div className="choices" style={{ marginTop: 12 }}>
            {MOVES.map((m) => (
              <button
                key={m.label}
                type="button"
                className={`choice${mode === m.mode ? ' on' : ''}`}
                aria-pressed={mode === m.mode}
                onClick={() => setMode(m.mode)}
              >
                {m.label}
                <small>{m.hint}</small>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {step === 4 ? (
        <>
          <h1 className="title">
            Nome da <em>viagem</em>
          </h1>
          <div className="field" style={{ marginTop: 12 }}>
            <span>Como vocês chamam essa viagem?</span>
            <input
              className="input"
              id="nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tripName}
            />
          </div>
          <p className="note">
            {label} · {picks.length} {picks.length === 1 ? 'destino' : 'destinos'} · {nights} noites ·{' '}
            {people === 6 ? 'uma galera' : `${people} ${people === 1 ? 'pessoa' : 'pessoas'}`}.{' '}
            {picks.length > 1 ? 'As noites se dividem igualmente; depois é só arrastar na trilha.' : ''}
          </p>
        </>
      ) : null}

      <div style={{ marginTop: 22 }}>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="btn big main"
            disabled={!canNext}
            onClick={() => setStep(step + 1)}
          >
            {canNext ? 'Continuar' : 'Diga pra onde'}
          </button>
        ) : (
          <button type="button" className="btn big main" disabled={busy} onClick={() => void finish()}>
            Criar viagem
          </button>
        )}
      </div>
    </div>
  )
}
