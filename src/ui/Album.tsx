import { useState } from 'react'
import type { CSSProperties } from 'react'
import { placeStates } from '../engine'
import type { ID, Place, PlaceState, Rarity } from '../engine'
import { uid, useApp } from '../app/store'
import { colorOf, sealOf } from './colors'
import { Seal } from './kit'
import { RARITY } from './rarity'

// Mochila = álbum de figurinhas (spec §17.5).

const tilt = (id: string) => {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0
  return ((h % 5) - 2) * 0.6
}

export function StickerCard({
  place,
  state,
  onClick,
}: {
  place: Place
  state: PlaceState | undefined
  onClick: () => void
}) {
  const placed = !!state?.days.length
  const when = placed
    ? `${state!.days[0]!.label}${state!.days.length > 1 ? ` ×${state!.days.length}` : ''}`
    : state?.returnedFrom
      ? `voltou de ${state.returnedFrom}`
      : 'solta'
  return (
    <button
      type="button"
      id={`p-${place.id}`}
      className={`sticker r-${place.rarity}${placed ? '' : ' loose'}`}
      style={{ ['--tilt' as string]: `${tilt(place.id)}deg` } as CSSProperties}
      onClick={onClick}
      aria-label={`${place.name}, ${RARITY[place.rarity].label}, ${placed ? `colada em ${when}` : when}`}
    >
      <span className="gems">{RARITY[place.rarity].gems}</span>
      <span className="nm">{place.name}</span>
      <span className={`when${placed ? '' : ' loose'}`}>{when}</span>
      {state?.visited ? <span className="stamp">済</span> : null}
    </button>
  )
}

export function Album() {
  const doc = useApp((s) => s.doc)!
  const openSheet = useApp((s) => s.openSheet)
  const it = doc.itinerary
  const states = placeStates(it, doc.places)
  const order: ID[] = []
  for (const s of it.stops)
    if (s.destinationId && !order.includes(s.destinationId)) order.push(s.destinationId)
  const dayTrips = doc.destinations.filter(
    (d) =>
      !order.includes(d.id) &&
      doc.places.some((p) => p.destinationId === d.id && states.get(p.id)?.days.length),
  )
  const saved = doc.destinations.filter((d) => !order.includes(d.id) && !dayTrips.includes(d))

  const page = (destId: ID, note?: string) => {
    const d = doc.destinations.find((x) => x.id === destId)
    const mine = doc.places.filter((p) => p.destinationId === destId)
    const placed = mine.filter((p) => states.get(p.id)?.days.length).length
    const color = colorOf(doc.destinations, destId)
    return (
      <section key={destId} className="page" id={`page-${destId}`}>
        <div className="page-head">
          <Seal text={sealOf(d)} color={color} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2>
              {d?.name}{' '}
              {d?.localName && d.localName !== d.name ? <span className="local">{d.localName}</span> : null}
            </h2>
            <div className="page-prog">
              {note ? `${note} · ` : ''}
              {placed}/{mine.length} coladas
              <i>
                <b style={{ width: `${mine.length ? (placed / mine.length) * 100 : 0}%` }} />
              </i>
            </div>
          </div>
        </div>
        <div className="stickers">
          {mine.map((p) => (
            <StickerCard
              key={p.id}
              place={p}
              state={states.get(p.id)}
              onClick={() => openSheet({ kind: 'sticker', placeId: p.id })}
            />
          ))}
        </div>
        <NewSticker destId={destId} name={d?.name ?? ''} />
      </section>
    )
  }

  return (
    <>
      <h1 className="title">
        Álbum de <em>figurinhas</em>
      </h1>
      <p className="note">
        Cada lugar que vocês querem conhecer é uma figurinha. Cole no dia: arraste da bandeja no Roteiro ou
        toque na figurinha. Dourada brilhando é imperdível ainda sem dia.
      </p>
      {order.map((id) => page(id))}
      {dayTrips.map((d) => page(d.id, 'bate-volta'))}
      {saved.length ? <h2 className="sec">Destinos guardados</h2> : null}
      {saved.map((d) => page(d.id, 'guardado'))}
    </>
  )
}

function NewSticker({ destId, name }: { destId: ID; name: string }) {
  const act = useApp((s) => s.act)
  const [text, setText] = useState('')
  const create = (rarity: Rarity) => {
    if (!text.trim()) return
    if (act({ type: 'addPlace', place: { id: uid('p'), destinationId: destId, name: text, rarity } }))
      setText('')
  }
  return (
    <form
      className="new-sticker"
      onSubmit={(e) => {
        e.preventDefault()
        create('want')
      }}
    >
      <input
        id={`novo-${destId}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Nova figurinha em ${name}`}
        aria-label={`Nova figurinha em ${name}`}
        enterKeyHint="done"
      />
      <div className="rarity-row" role="group" aria-label="Criar com a raridade">
        {(['maybe', 'want', 'must'] as Rarity[]).map((r) => (
          <button
            key={r}
            type="button"
            className={`rar r-${r}`}
            disabled={!text.trim()}
            onClick={() => create(r)}
          >
            {RARITY[r].gems} {RARITY[r].label}
          </button>
        ))}
      </div>
    </form>
  )
}
