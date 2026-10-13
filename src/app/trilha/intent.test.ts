import { describe, expect, it } from 'vitest'
import { japao, portugal } from '../../engine/fixtures/trips'
import { run } from '../../engine/fixtures/helpers'
import { blockIntent, boundaryCommand, endIntent, shelfIntent, stopSegs } from './intent'

// Japão: s1 Tóquio 0–2 · s2 Ginzan 2–3 · s3 Tóquio 3–5 · s4 Kawa 5–6 · s5 Tóquio 6–7 · s6 Kamakura 7–8
//        · s7 Osaka 8–12 · s8 Kyoto 12–19 · s9 Tóquio 19–23 (dias a partir de 01/04)

describe('Trilha: pegadores', () => {
  it('divisa: dias inteiros, sem deixar ninguém sem noite', () => {
    const it_ = japao().itinerary
    expect(boundaryCommand(it_, 6, -2.4)).toEqual({ type: 'moveBoundary', index: 6, k: -2 })
    expect(boundaryCommand(it_, 6, -9)).toEqual({ type: 'moveBoundary', index: 6, k: -3 })
    expect(boundaryCommand(it_, 6, 99)).toEqual({ type: 'moveBoundary', index: 6, k: 6 })
    expect(boundaryCommand(it_, 6, 0.3)).toBeNull()
    expect(boundaryCommand(it_, 8, 1)).toBeNull()
  })

  it('volta: livre muda a volta; marcada não mexe', () => {
    const fixed = japao().itinerary
    expect(endIntent(fixed, 1)).toEqual({ kind: 'locked' })
    const free = portugal().itinerary
    expect(endIntent(free, 2)).toEqual({
      kind: 'command',
      command: { type: 'setNights', stopId: 's7', nights: 3, via: { kind: 'return' } },
    })
    expect(endIntent(free, -5)).toEqual({ kind: 'none' })
    expect(endIntent(free, 0)).toEqual({ kind: 'none' })
  })
})

describe('Trilha: arrastar uma cidade', () => {
  it('pouco: chega 1 dia depois (empurra a vizinha)', () => {
    const it_ = japao().itinerary
    expect(blockIntent(it_, 's8', 1, 16)).toEqual({ kind: 'shift', by: 1 })
    expect(blockIntent(it_, 's8', 3.2, 18)).toEqual({ kind: 'shift', by: 3 })
    expect(blockIntent(it_, 's8', -3, 12.5)).toEqual({ kind: 'shift', by: -3 })
  })

  it('além da vizinha: muda a ordem', () => {
    const it_ = japao().itinerary
    // Kyoto empurrada 4 dias: Tóquio final (4 noites) não pode ceder tudo → passa à frente dela.
    expect(blockIntent(it_, 's8', 6, 22)).toEqual({ kind: 'reorder', toIndex: 8 })
    // Kyoto levada para o começo.
    expect(blockIntent(it_, 's8', -14, 0.5)).toEqual({ kind: 'reorder', toIndex: 0 })
  })

  it('vizinha de 1 noite: qualquer arraste além da metade muda a ordem', () => {
    const it_ = japao().itinerary
    // Tóquio (s3) para trás sobre Ginzan (1 noite): passa à frente.
    expect(blockIntent(it_, 's3', -1, 2.4)).toEqual({ kind: 'reorder', toIndex: 1 })
    expect(blockIntent(it_, 's3', 0, 4)).toEqual({ kind: 'none' })
  })

  it('primeira e última cidade: explica por que não andou', () => {
    const it_ = japao().itinerary
    expect(blockIntent(it_, 's1', -1, 0.2)).toEqual({ kind: 'none', reason: 'first' })
    expect(blockIntent(it_, 's9', 1, 22)).toEqual({ kind: 'none', reason: 'last' })
    expect(blockIntent(it_, 'nada', 1, 1)).toEqual({ kind: 'none' })
  })
})

describe('Trilha: soltar uma cidade da prateleira', () => {
  it('no meio de uma cidade: divide a estadia no dia mais perto', () => {
    const it_ = japao().itinerary
    expect(shelfIntent(it_, 16.2)).toEqual({ kind: 'split', stopId: 's8', afterOrdinal: 4 })
    expect(shelfIntent(it_, 12.6)).toEqual({ kind: 'split', stopId: 's8', afterOrdinal: 1 })
  })

  it('perto das pontas ou numa cidade de 1 noite: entra entre as cidades', () => {
    const it_ = japao().itinerary
    expect(shelfIntent(it_, 12.1)).toEqual({ kind: 'insert', index: 7 })
    expect(shelfIntent(it_, 18.9)).toEqual({ kind: 'insert', index: 8 })
    expect(shelfIntent(it_, 2.2)).toEqual({ kind: 'insert', index: 1 })
    expect(shelfIntent(it_, 2.7)).toEqual({ kind: 'insert', index: 2 })
    expect(shelfIntent(it_, -1)).toEqual({ kind: 'insert', index: 0 })
    expect(shelfIntent(it_, 30)).toEqual({ kind: 'insert', index: 9 })
  })

  it('nas noites em aberto: preenche', () => {
    const it_ = run(japao().itinerary, { type: 'removeStop', stopId: 's2' }).state
    expect(shelfIntent(it_, 2.5)).toEqual({ kind: 'fill', stopId: 's2' })
    expect(stopSegs(it_)[1]).toMatchObject({ id: 's2', open: true })
  })
})
