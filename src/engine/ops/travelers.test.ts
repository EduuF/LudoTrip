import { describe, expect, it } from 'vitest'
import { japao } from '../fixtures/trips'
import { refuse, run } from '../fixtures/helpers'

describe('viajantes, um de cada vez', () => {
  const base = () =>
    run(japao().itinerary, { type: 'setTravelers', travelers: [{ id: 't1', name: 'Ana' }] }).state

  it('adiciona, renomeia, liga à conta e tira, sem mexer nos outros', () => {
    let s = run(base(), { type: 'addTraveler', traveler: { id: 'x.1', name: ' Convidado ' } }).state
    expect(s.travelers).toEqual([
      { id: 't1', name: 'Ana' },
      { id: 'x.1', name: 'Convidado' },
    ])
    s = run(s, { type: 'setTraveler', id: 'x.1', name: 'Bia', userId: 'uid-bia' }).state
    expect(s.travelers[1]).toEqual({ id: 'x.1', name: 'Bia', userId: 'uid-bia' })
    s = run(s, { type: 'setTraveler', id: 'x.1', userId: null }).state
    expect(s.travelers[1]).toEqual({ id: 'x.1', name: 'Bia' })
    s = run(s, { type: 'removeTraveler', id: 'x.1' }).state
    expect(s.travelers).toEqual([{ id: 't1', name: 'Ana' }])
  })

  it('tirar alguém o tira também de onde era participante', () => {
    let s = run(base(), { type: 'addTraveler', traveler: { id: 't2', name: 'Bia' } }).state
    const stop = s.stops[0]!
    s = run(s, { type: 'setParticipants', target: { kind: 'stop', id: stop.id }, ids: ['t1', 't2'] }).state
    s = run(s, { type: 'removeTraveler', id: 't2' }).state
    expect(s.stops[0]!.participants).toEqual(['t1'])
  })

  it('recusa id repetido, nome vazio, quem não existe e tirar o último', () => {
    const s = base()
    expect(refuse(s, { type: 'addTraveler', traveler: { id: 't1', name: 'Outra' } }).code).toBe('INVALID')
    expect(refuse(s, { type: 'addTraveler', traveler: { id: 't9', name: '  ' } }).code).toBe('INVALID')
    expect(refuse(s, { type: 'setTraveler', id: 'nada', name: 'X' }).code).toBe('NOT_FOUND')
    expect(refuse(s, { type: 'removeTraveler', id: 't1' }).code).toBe('INVALID')
  })
})
