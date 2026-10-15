// Tipos da gramática da viagem (spec §4 e §13).
// O motor é puro: nada aqui depende de React, rede ou relógio.

export type ID = string
/** Data local do destino, "AAAA-MM-DD". */
export type ISODate = string
/** Hora local, "HH:MM". */
export type LocalTime = string

/** "fixed" = volta marcada; "free" = volta livre. A interface nunca mostra a palavra "trava". */
export type Lock = 'free' | 'fixed'
export type Pace = 'calm' | 'normal' | 'intense'
export type LegMode = 'flight' | 'train' | 'bus' | 'car' | 'boat' | 'walk' | 'bike' | 'moto'
export type Lodging = 'hotel' | 'hostel' | 'apartment' | 'friends' | 'camping' | 'motorhome' | 'onboard'
export type Slot = 'morning' | 'afternoon' | 'evening' | 'any'
export type Rarity = 'maybe' | 'want' | 'must'

export interface SpriteSpec {
  body?: string
  hair?: string
  skin?: string
  outfit?: string
}

export interface Traveler {
  id: ID
  name: string
  userId?: ID
  sprite?: SpriteSpec
}

/** Um lugar (cidade, região, parque, navio, país) com a sua Mochila. Fica fora do itinerário. */
export interface Destination {
  id: ID
  name: string
  localName?: string
  country?: string
  lat?: number
  lon?: number
  tz?: string
  kind: 'city' | 'region' | 'park' | 'vessel' | 'country'
}

/** [oeste, sul, leste, norte] em graus. */
export type BBox = [number, number, number, number]

/**
 * Legado (viagens criadas antes de 15/10/2026): para onde era a viagem. Ler só via `tripArea`
 * (`src/app/area.ts`); viagens novas não gravam.
 */
export interface Scope {
  name: string
  localName?: string
  kind: 'country' | 'region' | 'city'
  /** ISO 3166-1 alpha-2. */
  country?: string
  lat?: number
  lon?: number
  bbox?: BBox
}

/** O país de noites em aberto ("Japão, cidades em aberto"): enquadra o mapa e dá nome sem cidade decidida. */
export interface OpenIn {
  /** ISO 3166-1 alpha-2. */
  country: string
  name: string
  localName?: string
  bbox?: BBox
}

/** Tipo de lugar: dá o selo no mapa da cidade. */
export type PlaceKind = 'sight' | 'food' | 'shop' | 'nature' | 'transit' | 'lodging' | 'other'

/** Item da Mochila. Fica fora do itinerário. */
export interface Place {
  id: ID
  destinationId: ID
  name: string
  lat?: number
  lon?: number
  kind?: PlaceKind
  rarity: Rarity
  estMinutes?: number
  note?: string
}

/** Um item agendado num dia (ou no caminho de um trecho). */
export interface Visit {
  id: ID
  placeId: ID
  slot: Slot
  time?: LocalTime
  note?: string
  participants?: ID[]
  visited?: boolean
}

/** Um dia planejável: a lista de visitas. */
export type DayPlan = Visit[]

/**
 * Parada: onde se dorme. `days.length` é o número de noites (≥ 1).
 * `destinationId: null` = noites em aberto (sem visitas).
 */
export interface Stop {
  id: ID
  destinationId: ID | null
  /** Só com `destinationId: null`: o país dessas noites em aberto. */
  openIn?: OpenIn
  days: DayPlan[]
  tentative?: boolean
  lodging: Lodging
  participants?: ID[]
}

export interface Hub {
  kind: 'airport' | 'station' | 'port' | 'other'
  code?: string
  name: string
}

/** Trecho entre paradas vizinhas (ou de/para casa). `aboard.length` = noites a bordo. */
export interface Leg {
  id: ID
  from: ID | 'home'
  to: ID | 'home'
  mode: LegMode
  dep?: LocalTime
  arr?: LocalTime
  /** +1 chega no dia seguinte; −1 ao cruzar a linha de data para o leste. */
  arrDayOffset?: number
  fromHub?: Hub
  toHub?: Hub
  via?: Hub[]
  /** Duração digitada pela pessoa, em minutos (vence a estimativa). */
  durationMin?: number
  aboard: DayPlan[]
  waypoints: Visit[]
  participants?: ID[]
  /** A pessoa mexeu neste trecho: ele é arquivado (não descartado) se sair da rota. */
  touched?: boolean
}

export interface Resource {
  id: ID
  kind: 'rental-car' | 'rail-pass' | 'esim' | 'insurance' | 'other'
  title: string
  start?: ISODate
  end?: ISODate
  covers?: LegMode[]
}

export interface Anchor {
  id: ID
  title: string
  date: ISODate
  time?: LocalTime
  destinationId?: ID
}

export interface ReturnedNote {
  placeId: ID
  fromDate: ISODate | null
  /** Rótulo pronto quando não há data: "dia 2". */
  fromLabel: string
}

/** Tudo o que o motor edita. Vive inteiro no documento da viagem. */
export interface Itinerary {
  version: number
  start: ISODate | null
  lock: Lock
  defaultMode: LegMode
  pace: Pace
  travelers: Traveler[]
  /** De onde a viagem sai e para onde volta. */
  home?: { name: string; lat?: number; lon?: number; tz?: string }
  stops: Stop[]
  legs: Leg[]
  archivedLegs: Leg[]
  /** Plano do dia em que se deixa a última cidade. */
  departurePlan: DayPlan
  resources: Resource[]
  anchors: Anchor[]
  /** Itens que voltaram para a mochila ("voltou de qua 07"), mais novos primeiro (até 50). */
  returned: ReturnedNote[]
}

/** Reserva: fato do mundo real. O motor nunca a altera. */
export type Booking =
  | {
      id: ID
      kind: 'lodging'
      title: string
      destinationId: ID
      checkin: ISODate
      checkout: ISODate
      status: 'planned' | 'booked'
      archived?: boolean
    }
  | {
      id: ID
      kind: 'transport'
      title: string
      fromDestinationId: ID | 'home'
      toDestinationId: ID | 'home'
      date: ISODate
      mode: LegMode
      status: 'planned' | 'booked'
      archived?: boolean
    }
  | {
      id: ID
      kind: 'ticket' | 'other'
      title: string
      date?: ISODate
      destinationId?: ID
      status: 'planned' | 'booked'
      archived?: boolean
    }

/** Referência a um dia planejável. */
export type DayRef =
  | { kind: 'stop'; stopId: ID; ordinal: number }
  | { kind: 'leg'; legId: ID; ordinal: number }
  | { kind: 'departure' }

/** Para onde vai ou de onde vem a diferença de noites. */
export type Via = { kind: 'return' } | { kind: 'stop'; stopId: ID } | { kind: 'open' }

export type Edge = 'start' | 'end'
