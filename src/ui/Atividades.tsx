import type { CSSProperties } from 'react'
import { placeStates } from '../engine'
import type { ID, Place, PlaceState } from '../engine'
import { useApp } from '../app/store'
import { addDestination } from '../app/choices'
import { colorOf, sealOf } from './colors'
import { Seal } from './kit'
import { PLACE_KINDS } from './placeKinds'
import { RARITY } from './rarity'
import { useCanEdit } from './useCanEdit'

// Atividades (spec §17.5): tudo o que vocês querem fazer, por destino, em cartões com cara de coleção.
// Moldura pela prioridade: Se der (prata), Quero (azul), Imperdível (dourada, brilha enquanto está sem dia).

const tilt = (id: string) => {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0
  return ((h % 5) - 2) * 0.6
}

export function ActivityCard({
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
      ? `ficou sem dia (era ${state.returnedFrom})`
      : 'sem dia'
  return (
    <button
      type="button"
      id={`p-${place.id}`}
      className={`sticker r-${place.rarity}${placed ? '' : ' loose'}`}
      style={{ ['--tilt' as string]: `${tilt(place.id)}deg` } as CSSProperties}
      onClick={onClick}
      aria-label={`${place.name}, ${RARITY[place.rarity].label}, ${placed ? `em ${when}` : when}`}
    >
      <span className="gems">{RARITY[place.rarity].gems}</span>
      <span className="nm">{place.name}</span>
      <span className={`when${placed ? '' : ' loose'}`}>{when}</span>
      {place.lat !== undefined ? (
        <span className="pin" aria-hidden="true">
          {PLACE_KINDS[place.kind ?? 'sight'].glyph}
        </span>
      ) : null}
      {state?.visited ? <span className="stamp">済</span> : null}
    </button>
  )
}

export function Atividades() {
  const doc = useApp((s) => s.doc)!
  const openSheet = useApp((s) => s.openSheet)
  const edit = useCanEdit()
  const act = useApp((s) => s.act)
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
              {placed}/{mine.length} com dia
              <i>
                <b style={{ width: `${mine.length ? (placed / mine.length) * 100 : 0}%` }} />
              </i>
            </div>
          </div>
          {note === 'guardado' && edit ? (
            <button
              type="button"
              className="icon-btn"
              aria-label={`Apagar ${d?.name ?? 'destino'}`}
              onClick={() =>
                openSheet({
                  kind: 'choice',
                  title: `Apagar ${d?.name ?? 'destino'}?`,
                  sub: mine.length
                    ? `Leva ${mine.length === 1 ? 'a atividade' : `as ${mine.length} atividades`} dele junto. Dá para desfazer.`
                    : 'Ele não está no roteiro. Dá para desfazer.',
                  options: [
                    { label: 'Apagar destino', run: () => act({ type: 'removeDestination', id: destId }) },
                  ],
                })
              }
            >
              ×
            </button>
          ) : null}
          {edit ? (
            <button
              type="button"
              className="btn small"
              onClick={() => openSheet({ kind: 'newActivity', destId })}
              aria-label={`Nova atividade em ${d?.name ?? 'destino'}`}
            >
              + Atividade
            </button>
          ) : null}
        </div>
        <div className="stickers">
          {mine.map((p) => (
            <ActivityCard
              key={p.id}
              place={p}
              state={states.get(p.id)}
              onClick={() => openSheet({ kind: 'sticker', placeId: p.id })}
            />
          ))}
          {!mine.length ? (
            <p className="note" style={{ gridColumn: '1 / -1' }}>
              Nada ainda. Toque em "+ Atividade" ou, no roteiro, em "+ Atividade" num dia.
            </p>
          ) : null}
        </div>
      </section>
    )
  }

  return (
    <>
      <h1 className="title">
        Atividades <em>da viagem</em>
      </h1>
      <p className="note">
        Tudo o que vocês querem fazer, por destino. Toque numa atividade para pôr em um ou mais dias, mudar a
        prioridade ou ver no mapa; "feita" se marca em cada dia, no roteiro. Dourada brilhando é imperdível
        ainda sem dia.
      </p>
      {!order.length && !dayTrips.length && !saved.length ? (
        <div className="empty">
          <b>Nenhum destino ainda.</b>
          As atividades ficam por destino: comece por um.
          {edit ? (
            <button type="button" className="btn main" style={{ marginTop: 10 }} onClick={addDestination}>
              + Adicionar destino
            </button>
          ) : null}
        </div>
      ) : null}
      {order.map((id) => page(id))}
      {dayTrips.map((d) => page(d.id, 'bate-volta'))}
      {saved.length ? <h2 className="sec">Destinos guardados</h2> : null}
      {saved.map((d) => page(d.id, 'guardado'))}
    </>
  )
}
