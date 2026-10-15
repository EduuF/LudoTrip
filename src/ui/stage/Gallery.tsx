// Galeria do Palco (só em desenvolvimento, em /#palco): o elenco de frente e de perfil e os objetos lado
// a lado, na mesma escala, para conferir traço, proporção e encaixe antes de animar.

import { toSvgRects, type Art } from './art'
import { CAST, POSES, frontArt, type PoseName } from './cast'
import * as P from './props'
import { RUN, WALK, sideArt } from './side'

function Pix({ art, s = 3, label }: { art: Art; s?: number; label?: string }) {
  return (
    <figure style={{ margin: 0, display: 'grid', justifyItems: 'center', gap: 4 }}>
      <svg
        width={art.w * s}
        height={art.h * s}
        viewBox={`0 0 ${art.w} ${art.h}`}
        shapeRendering="crispEdges"
        dangerouslySetInnerHTML={{ __html: toSvgRects(art.runs) }}
      />
      {label ? (
        <figcaption style={{ font: '11px var(--f-pixel)', color: 'var(--ink-soft)' }}>{label}</figcaption>
      ) : null}
    </figure>
  )
}

const row = { display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' } as const

export function Gallery() {
  const people = [...CAST]
  return (
    <div style={{ padding: 16, display: 'grid', gap: 24, background: 'var(--washi)', minHeight: '100vh' }}>
      <h1 style={{ margin: 0, font: '800 24px var(--f-display)' }}>Palco · galeria</h1>
      <section>
        <h2>De frente</h2>
        <div style={row}>
          {(Object.keys(POSES) as PoseName[]).map((pose, i) => (
            <Pix key={pose} art={frontArt(CAST[i % 4]!, pose)} label={pose} />
          ))}
        </div>
      </section>
      <section>
        <h2>De perfil (andar, correr)</h2>
        {CAST.map((p) => (
          <div key={p.name} style={row}>
            {WALK.map(([l, n, f], i) => (
              <Pix key={i} art={sideArt(p, l, n, f)} label={`andar ${i + 1}`} />
            ))}
            {RUN.map(([l, n, f], i) => (
              <Pix key={`r${i}`} art={sideArt(p, l, n, f, { mouth: 'open' })} label={`correr ${i + 1}`} />
            ))}
            <Pix art={sideArt(p, 'jump', 'up', 'up', { eyes: 'happy', mouth: 'open' })} label="pulo" />
            <Pix art={sideArt(p, 'stand', 'carry', 'down')} label="carregar" />
            <Pix art={sideArt(p, 'walkA', 'pull', 'fwd')} label="puxar mala" />
          </div>
        ))}
      </section>
      <section>
        <h2>Objetos (mesma escala)</h2>
        <div style={row}>
          <Pix art={frontArt(CAST[0]!, 'idle')} label="escala" />
          <Pix art={P.suitcase()} label="mala" />
          <Pix art={P.suitcaseOpen()} label="mala aberta" />
          <Pix art={P.suitcaseFront()} label="frente da mala" />
          <Pix art={P.phone()} label="celular" />
          <Pix art={P.photoFrame(people)} label="moldura" />
          <Pix art={P.ticket()} label="bilhete" />
          <Pix art={P.ticket('punched')} label="picotado" />
          <Pix art={P.ticket('stamped')} label="carimbado" />
          <Pix art={P.hanko()} label="hanko" />
          <Pix art={P.futonRolled()} label="futon enrolado" />
          <Pix art={P.futon()} label="futon" />
          <Pix art={P.futonBlanket()} label="cobertor" />
          <Pix art={P.bed()} label="cama" />
          <Pix art={P.bedBlanket()} label="cobertor" />
          <Pix art={P.tent()} label="barraca" />
          <Pix art={P.pillow()} label="travesseiro" />
          <Pix art={P.feather()} label="pena" />
          <Pix art={P.zee()} label="z" />
          <Pix art={P.flash()} label="flash" />
          {(['view', 'group', 'cat', 'food'] as const).map((k) => (
            <Pix key={k} art={P.polaroid(k, people)} label={`polaroid ${k}`} />
          ))}
          <Pix art={P.onigiri()} label="onigiri" />
          <Pix art={P.onigiri(1)} label="mordida" />
          <Pix art={P.onigiri(2)} label="2 mordidas" />
          <Pix art={P.heart()} label="coração" />
          <Pix art={P.sparkle()} label="brilho" />
          <Pix art={P.bang()} label="!" />
          <Pix art={P.cloud()} label="nuvem" />
          <Pix art={P.cloud('open')} label="boca aberta" />
          <Pix art={P.cloud('sneeze')} label="espirro" />
          <Pix art={P.tripCard()} label="cartão" />
          <Pix art={P.balloon()} label="balão" />
          <Pix art={P.kite()} label="pipa" />
          <Pix art={P.strawHat()} label="chapéu" />
          <Pix art={P.puff()} label="fumaça" />
        </div>
      </section>
      <section>
        <h2>Veículos</h2>
        <div style={row}>
          <Pix art={frontArt(CAST[1]!, 'idle')} label="escala" />
          <Pix art={P.kombi(people)} label="kombi" />
          <Pix art={P.kombi(people, { hatch: true })} label="porta-malas" />
          <Pix art={P.kombi(people.slice(0, 1), { door: true })} label="porta aberta" />
          <Pix art={P.stairs()} label="escada" />
          <Pix art={P.ramp(18, 12)} label="prancha" />
          <Pix art={P.plane(people)} label="avião" />
          <Pix art={P.train(people)} label="trem" />
          <Pix art={P.boat(people)} label="barco" />
          <Pix art={P.gate()} label="portão" />
          <Pix art={P.gate(true)} label="portão aceso" />
        </div>
      </section>
    </div>
  )
}
