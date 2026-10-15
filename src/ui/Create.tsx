import { useEffect, useState } from 'react'
import { createItinerary, haversineKm } from '../engine'
import type { Destination, LegMode } from '../engine'
import { setLocalBack, uid, useApp } from '../app/store'
import type { Scope, TripDoc } from '../app/doc'
import { CITIES } from '../providers/cities'
import { countryBounds } from '../providers/countries'
import { PlaceSearch } from './PlaceSearch'
import type { PlacePick } from './PlaceSearch'
import { Stepper, Travelers } from './kit'

// Criar viagem em passos curtos (spec §7 e §17.7): para onde (país, região ou cidade), por onde,
// quando, quem, como, nome. Tudo pode ser ajustado depois no mapa e na trilha.

const MOVES: { label: string; hint: string; mode: LegMode }[] = [
  { label: 'Avião', hint: 'entre lugares longe', mode: 'flight' },
  { label: 'Trem e ônibus', hint: 'de cidade em cidade', mode: 'train' },
  { label: 'Carro', hint: 'road trip', mode: 'car' },
  { label: 'Misturado', hint: 'cada trecho de um jeito', mode: 'bus' },
  { label: 'A pé ou bike', hint: 'trilha em etapas', mode: 'walk' },
]

const STEPS = ['Pra onde', 'Por onde', 'Quando', 'Quem vai', 'Como', 'Nome']

export function Create() {
  const goHome = useApp((s) => s.goHome)
  const addTrip = useApp((s) => s.addTrip)
  const [step, setStep] = useState(0)
  const [scope, setScope] = useState<PlacePick | null>(null)
  const [picks, setPicks] = useState<PlacePick[]>([])
  const [undecided, setUndecided] = useState(false)
  const [home, setHome] = useState<PlacePick | null>(null)
  const [start, setStart] = useState('')
  const [nights, setNights] = useState(7)
  const [people, setPeople] = useState(2)
  const [mode, setMode] = useState<LegMode>('train')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const isCountry = scope?.kind === 'country'
  const tripName = name.trim() || (scope ? `Viagem para ${scope.name}` : 'Minha viagem')
  const suggestions = isCountry
    ? CITIES.filter((c) => c.country === scope.country && !picks.some((p) => p.name === c.name)).slice(0, 8)
    : []

  const pickScope = (p: PlacePick) => {
    setScope(p)
    setPicks(p.kind === 'city' ? [p] : [])
    setUndecided(false)
  }

  const finish = async () => {
    if (!scope) return
    setBusy(true)
    const destinations: Destination[] = picks.map((c, i) => ({
      id: `d-${i + 1}`,
      name: c.name,
      kind: c.kind === 'city' ? (c.destKind ?? 'city') : 'city',
      ...(c.localName ? { localName: c.localName } : {}),
      ...(c.country ? { country: c.country } : {}),
      ...(c.kind === 'city' && c.lat !== undefined && c.lon !== undefined ? { lat: c.lat, lon: c.lon } : {}),
      ...(c.kind === 'city' && c.tz ? { tz: c.tz } : {}),
    }))
    const bbox = scope.kind === 'country' ? await countryBounds(scope.id) : null
    const tripScope: Scope =
      scope.kind === 'country'
        ? {
            name: scope.name,
            kind: 'country',
            country: scope.country,
            ...(scope.localName ? { localName: scope.localName } : {}),
            ...(bbox ? { bbox } : {}),
          }
        : {
            name: scope.name,
            kind: 'city',
            ...(scope.localName ? { localName: scope.localName } : {}),
            ...(scope.country ? { country: scope.country } : {}),
            ...(scope.lat !== undefined && scope.lon !== undefined ? { lat: scope.lat, lon: scope.lon } : {}),
          }
    const first =
      destinations.find((d) => d.lat !== undefined) ?? (tripScope.lat !== undefined ? tripScope : null)
    const far =
      home?.kind === 'city' && home.lat !== undefined && home.lon !== undefined && first?.lat !== undefined
        ? haversineKm({ lat: home.lat, lon: home.lon }, { lat: first.lat, lon: first.lon! }) > 700
        : mode === 'flight'
    let n = 0
    const itinerary = createItinerary(
      {
        destinationIds: destinations.length ? destinations.map((d) => d.id) : [null],
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
      scope: tripScope,
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

  const canNext = step === 0 ? !!scope : step === 1 ? picks.length > 0 || undecided || !isCountry : true

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
            Pra onde <em>vamos?</em>
          </h1>
          <p className="note">Um país, uma região ou uma cidade. Dá para mudar tudo depois.</p>
          <div className="field" style={{ marginTop: 12 }}>
            <span>Destino da viagem</span>
            {scope ? (
              <button type="button" className="pill" onClick={() => setScope(null)}>
                {scope.name} {scope.kind === 'country' ? '· país' : ''} ×
              </button>
            ) : (
              <PlaceSearch
                id="destino"
                placeholder="Busque: Japão, Romênia, Rio…"
                kinds={['country', 'city']}
                onPick={pickScope}
              />
            )}
          </div>
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
            {isCountry ? (
              <>
                Em quais cidades <em>vão dormir?</em>
              </>
            ) : (
              <>
                Vão dormir em <em>outra cidade?</em>
              </>
            )}
          </h1>
          <p className="note">
            {isCountry
              ? `As cidades de ${scope!.name} onde vocês dormem, na ordem que imaginam. Ou deixe para decidir no mapa.`
              : `${scope!.name} já está. Bate-voltas e passeios (o que fazer lá) entram depois, no roteiro. Pode pular.`}
          </p>
          {picks.length ? (
            <div className="pills" style={{ marginTop: 10 }}>
              {picks.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  className="pill"
                  onClick={() => setPicks(picks.filter((_, k) => k !== i))}
                  aria-label={`Tirar ${c.name}`}
                >
                  {i + 1}. {c.name} ×
                </button>
              ))}
            </div>
          ) : null}
          <div className="field" style={{ marginTop: 12 }}>
            <span>{isCountry ? 'Cidades' : 'Outra cidade'}</span>
            <PlaceSearch
              id="lugar"
              placeholder="Busque: Kyoto, Lisboa, Bucareste…"
              kinds={['city']}
              within={scope?.country}
              exclude={picks.map((p) => p.name)}
              onPick={(p) => {
                setPicks([...picks, p])
                setUndecided(false)
              }}
            />
          </div>
          {suggestions.length ? (
            <div className="pills" style={{ marginTop: 10 }}>
              {suggestions.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className="pill"
                  onClick={() => {
                    setPicks([...picks, { kind: 'city', ...c }])
                    setUndecided(false)
                  }}
                >
                  + {c.name}
                </button>
              ))}
            </div>
          ) : null}
          {isCountry && !picks.length ? (
            <button
              type="button"
              className={`btn small${undecided ? ' main' : ''}`}
              aria-pressed={undecided}
              style={{ marginTop: 14 }}
              onClick={() => setUndecided(!undecided)}
            >
              Ainda não sei: decido no mapa
            </button>
          ) : null}
        </>
      ) : null}

      {step === 2 ? (
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

      {step === 3 ? (
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
        </>
      ) : null}

      {step === 4 ? (
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

      {step === 5 ? (
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
            {scope?.name} ·{' '}
            {picks.length
              ? `${picks.length} ${picks.length === 1 ? 'cidade' : 'cidades'}`
              : 'cidades a decidir'}{' '}
            · {nights} noites ·{' '}
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
            {step === 0 && !scope
              ? 'Diga pra onde'
              : step === 1 && !canNext
                ? 'Escolha um lugar ou "decido no mapa"'
                : 'Continuar'}
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
