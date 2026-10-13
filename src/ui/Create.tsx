import { useState } from 'react'
import { createItinerary, haversineKm } from '../engine'
import type { Destination, LegMode } from '../engine'
import { uid, useApp } from '../app/store'
import type { TripDoc } from '../app/doc'
import { searchCities } from '../providers/cities'
import type { City } from '../providers/cities'
import { Stepper, Travelers } from './kit'

// Criar viagem em passos curtos (spec §7 e §17.7). Tudo pode ser ajustado depois na Trilha.

type CityPick = { name: string } & Partial<City>

const MOVES: { label: string; hint: string; mode: LegMode }[] = [
  { label: 'Avião', hint: 'entre cidades longe', mode: 'flight' },
  { label: 'Trem e ônibus', hint: 'de cidade em cidade', mode: 'train' },
  { label: 'Carro', hint: 'road trip', mode: 'car' },
  { label: 'Misturado', hint: 'cada trecho de um jeito', mode: 'bus' },
  { label: 'A pé ou bike', hint: 'trilha em etapas', mode: 'walk' },
]

function CitySearch({
  placeholder,
  onPick,
  id,
}: {
  placeholder: string
  onPick: (c: CityPick) => void
  id: string
}) {
  const [q, setQ] = useState('')
  const found = searchCities(q)
  return (
    <>
      <input
        className="input"
        id={id}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {q.trim().length >= 2 ? (
        <div className="suggest">
          {found.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => {
                onPick(c)
                setQ('')
              }}
            >
              <span>{c.name}</span>
              <small>{c.localName && c.localName !== c.name ? c.localName : c.country}</small>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onPick({ name: q.trim() })
              setQ('')
            }}
          >
            <span>Usar "{q.trim()}"</span>
            <small>sem mapa</small>
          </button>
        </div>
      ) : null}
    </>
  )
}

export function Create() {
  const goHome = useApp((s) => s.goHome)
  const addTrip = useApp((s) => s.addTrip)
  const [step, setStep] = useState(0)
  const [cities, setCities] = useState<CityPick[]>([])
  const [home, setHome] = useState<CityPick | null>(null)
  const [start, setStart] = useState('')
  const [nights, setNights] = useState(7)
  const [people, setPeople] = useState(2)
  const [mode, setMode] = useState<LegMode>('train')
  const [name, setName] = useState('')

  const steps = ['Pra onde', 'Quando', 'Quem vai', 'Como', 'Nome']
  const tripName = name.trim() || (cities[0] ? `Viagem para ${cities[0].name}` : 'Minha viagem')

  const finish = () => {
    const destinations: Destination[] = cities.map((c, i) => ({
      id: `d-${i + 1}`,
      name: c.name,
      kind: 'city',
      ...(c.localName ? { localName: c.localName } : {}),
      ...(c.country ? { country: c.country } : {}),
      ...(c.lat !== undefined && c.lon !== undefined ? { lat: c.lat, lon: c.lon } : {}),
      ...(c.tz ? { tz: c.tz } : {}),
    }))
    const first = cities[0]
    const far =
      home?.lat !== undefined && home.lon !== undefined && first?.lat !== undefined && first.lon !== undefined
        ? haversineKm({ lat: home.lat, lon: home.lon }, { lat: first.lat, lon: first.lon }) > 700
        : mode === 'flight'
    let n = 0
    const itinerary = createItinerary(
      {
        destinationIds: destinations.map((d) => d.id),
        nights,
        start: start || null,
        defaultMode: mode,
        homeMode: far ? 'flight' : mode,
        travelers: Array.from({ length: people }, (_, i) => ({ id: `t${i + 1}`, name: `Viajante ${i + 1}` })),
        ...(home
          ? {
              home: {
                name: home.name,
                ...(home.lat !== undefined ? { lat: home.lat, lon: home.lon } : {}),
                ...(home.tz ? { tz: home.tz } : {}),
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
    void addTrip(doc)
  }

  const canNext = step === 0 ? cities.length > 0 : true

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
          {step + 1}/{steps.length} · {steps[step]!.toUpperCase()}
        </span>
      </div>

      {step === 0 ? (
        <>
          <h1 className="title">
            Pra onde <em>vamos?</em>
          </h1>
          <p className="note">
            Uma cidade ou várias, na ordem que vocês imaginam. Dá para mudar tudo depois.
          </p>
          <div className="field" style={{ marginTop: 12 }}>
            <span>Cidades</span>
            <CitySearch
              id="cidade"
              placeholder="Busque: Kyoto, Lisboa, Rio…"
              onPick={(c) => setCities([...cities, c])}
            />
          </div>
          {cities.length ? (
            <div className="pills" style={{ marginTop: 10 }}>
              {cities.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  className="pill"
                  onClick={() => setCities(cities.filter((_, k) => k !== i))}
                  aria-label={`Tirar ${c.name}`}
                >
                  {i + 1}. {c.name} ×
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
              <CitySearch id="casa" placeholder="Sua cidade" onPick={setHome} />
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
              min={Math.max(1, cities.length)}
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
            <Travelers count={people} px={6} />
          </div>
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
            {cities.length} {cities.length === 1 ? 'cidade' : 'cidades'} · {nights} noites ·{' '}
            {people === 6 ? 'uma galera' : `${people} ${people === 1 ? 'pessoa' : 'pessoas'}`}. As noites se
            dividem igualmente; depois é só arrastar na trilha.
          </p>
        </>
      ) : null}

      <div style={{ marginTop: 22 }}>
        {step < steps.length - 1 ? (
          <button
            type="button"
            className="btn big main"
            disabled={!canNext}
            onClick={() => setStep(step + 1)}
          >
            {step === 0 && !cities.length ? 'Escolha pelo menos uma cidade' : 'Continuar'}
          </button>
        ) : (
          <button type="button" className="btn big main" onClick={finish}>
            Criar mundo
          </button>
        )}
      </div>
    </div>
  )
}
