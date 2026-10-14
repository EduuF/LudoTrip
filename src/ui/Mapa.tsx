import { DayCard } from './DayCard'
import { MapPanel } from './MapPanel'
import { ChipDragProvider } from './chipDrag'
import { RoteiroList } from './Roteiro'
import { Trilha } from './Trilha'

// A tela principal (spec §17.2): mapa, trilha, cartão do dia e o roteiro, numa tela só.
// No celular, uma coluna; em telas largas, mapa e trilha à esquerda e o roteiro à direita (como na v1).

export function Mapa() {
  return (
    <ChipDragProvider>
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
      </div>
    </ChipDragProvider>
  )
}
