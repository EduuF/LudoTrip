import { progress } from '../engine'
import { useApp } from '../app/store'

// Nível de preparo e XP (spec §17.1): uma linha com a barra listrada. Mora na contagem do mapa e no
// topo das Tarefas; o HUD fica só com o essencial para quem chega.

export function LevelLine() {
  const doc = useApp((s) => s.doc)!
  const p = progress(doc.itinerary, doc)
  return (
    <span className="level">
      <span className="lv">
        NÍVEL {p.level} · {p.levelName.toUpperCase()}
      </span>
      <span
        className="xpbar"
        role="progressbar"
        aria-label={`Preparo: ${p.levelName}`}
        aria-valuenow={Math.round(p.ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i style={{ width: `${Math.round(p.inLevel * 100)}%` }} />
      </span>
      <span className="xp">{p.xp} XP</span>
    </span>
  )
}
