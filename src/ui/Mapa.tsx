import { useApp } from '../app/store'
import { DayCard } from './DayCard'
import { MapPanel } from './MapPanel'
import { RoteiroList, Tray } from './Roteiro'
import { Trilha } from './Trilha'

// A tela principal (spec §17.2): mapa, trilha, cartão do dia e o roteiro, numa tela só.
// No celular, uma coluna; em telas largas, mapa e trilha à esquerda e o roteiro à direita (como na v1).

export function Mapa() {
  const doc = useApp((s) => s.doc)!
  const openStop = useApp((s) => s.openStop)
  const it = doc.itinerary
  const trayStop = it.stops.find((s) => s.id === openStop && s.destinationId)

  return (
    <div className="mapa-grid">
      <div className="mapa-left">
        <MapPanel />
        <Trilha />
        <DayCard />
      </div>
      <div className="mapa-right">
        <h2 className="sec">
          Roteiro <small>NA ORDEM DA VIAGEM</small>
        </h2>
        <RoteiroList />
      </div>
      {trayStop ? <Tray stop={trayStop} /> : null}
    </div>
  )
}
