import { useEffect, useState } from 'react'
import { ALL_TRIPS } from '../engine/fixtures/trips'
import { useApp } from '../app/store'
import type { ExampleKey } from '../app/store'

// Suas viagens, exemplos para explorar e criar viagem (spec §17.7).

const EXAMPLES: Record<ExampleKey, { title: string; text: string }> = {
  japao: { title: 'Japão de trem', text: '9 paradas, volta marcada, bate-volta a Nara' },
  rio: { title: 'Rio, uma cidade', text: '5 noites e um bate-volta a Petrópolis' },
  portugal: { title: 'Portugal de carro', text: 'road trip com carro alugado' },
  europa: { title: 'Lisboa, Paris e Roma', text: '3 países com voos no meio' },
  cruzeiro: { title: 'Cruzeiro', text: 'navio com escalas como bate-volta' },
  caminho: { title: 'Caminho de Santiago', text: 'uma noite por etapa, a pé' },
}

export function Home() {
  const trips = useApp((s) => s.trips)
  const openTrip = useApp((s) => s.openTrip)
  const addExample = useApp((s) => s.addExample)
  const goCreate = useApp((s) => s.goCreate)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    document.title = 'LudoTrip'
  }, [])
  return (
    <div className="wrap">
      <header className="home-head">
        <span className="wm" aria-hidden="true">
          旅
        </span>
        <h1 className="title">
          Ludo<em>Trip</em>
        </h1>
        <p className="note">
          Planeje a viagem como quem joga: veja o mapa do lugar, arraste os destinos na trilha, cole
          figurinhas nos dias e resolva as tarefas.
        </p>
      </header>
      <button type="button" className="btn big main" onClick={goCreate} style={{ marginTop: 12 }}>
        Criar viagem
      </button>
      {trips.length ? (
        <>
          <h2 className="sec">Suas viagens</h2>
          <div className="trips">
            {trips.map((t) => (
              <button key={t.id} type="button" className="trip-card" onClick={() => openTrip(t.id)}>
                <span className="seal">{t.name.slice(0, 1)}</span>
                <span className="c-title">
                  <h3>{t.name}</h3>
                  <span className="dates">{t.example ? 'exemplo para mexer à vontade' : 'sua viagem'}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}
      <h2 className="sec">
        Explorar exemplos <small>mexa à vontade</small>
      </h2>
      <div className="examples">
        {(Object.keys(ALL_TRIPS) as ExampleKey[]).map((k) => (
          <button
            key={k}
            type="button"
            className="example"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await addExample(k)
              setBusy(false)
            }}
          >
            <b>{EXAMPLES[k].title}</b>
            <span>{EXAMPLES[k].text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
