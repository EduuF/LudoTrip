import { describe, expect, it } from 'vitest'
import { japao } from '../engine/fixtures/trips'
import { deepEqual } from '../engine'
import { runDoc, undoDoc } from './doc'
import type { DocAction, TripDoc } from './doc'
import { dueGroup, linkHref } from './tasks'
import type { Task } from './tasks'

const docOf = (): TripDoc => {
  const t = japao()
  return {
    meta: { id: 't1', name: t.name, createdAt: 0, updatedAt: 0 },
    itinerary: t.itinerary,
    destinations: t.destinations,
    places: t.places,
    bookings: t.bookings,
    seq: 0,
  }
}
const ok = (d: TripDoc, a: DocAction) => {
  const r = runDoc(d, a)
  if (!r.ok) throw new Error(r.error.code)
  return r
}
const fila = (placeId: string): Task => ({
  id: 'k1',
  title: ' Entrar na fila online ',
  about: { kind: 'place', id: placeId },
  due: '2030-03-01',
  link: 'sankan.kunaicho.go.jp',
  createdAt: 1,
})

describe('tarefas escritas por quem viaja (M3.6)', () => {
  it('criar, mudar, marcar feita e apagar: tudo com Desfazer', () => {
    const d0 = docOf()
    const gion = d0.places.find((p) => p.name === 'Gion')!
    const r1 = ok(d0, { type: 'addTask', task: fila(gion.id) })
    expect(r1.doc.tasks![0]!.title).toBe('Entrar na fila online')
    const r2 = ok(r1.doc, { type: 'setTask', id: 'k1', patch: { done: true, link: '', due: null } })
    expect(r2.doc.tasks![0]).toMatchObject({ done: true })
    expect('link' in r2.doc.tasks![0]!).toBe(false)
    expect('due' in r2.doc.tasks![0]!).toBe(false)
    const u = undoDoc(r2.doc, r2.steps)
    expect(u.ok && deepEqual(u.doc.tasks, r1.doc.tasks)).toBe(true)
    const r3 = ok(r1.doc, { type: 'removeTask', id: 'k1' })
    expect(r3.doc.tasks).toEqual([])
  })

  it('tarefa sem título não entra; mudança que não muda nada não cria Desfazer', () => {
    const d0 = docOf()
    expect(runDoc(d0, { type: 'addTask', task: { ...fila('x'), title: '  ' } }).ok).toBe(false)
    const r1 = ok(d0, { type: 'addTask', task: fila('x') })
    expect(runDoc(r1.doc, { type: 'setTask', id: 'k1', patch: { due: '2030-03-01' } })).toMatchObject({
      ok: false,
      error: { code: 'NO_CHANGE' },
    })
  })

  it('nada some calado: apagar a atividade transforma a tarefa em "da viagem", com o nome', () => {
    const d0 = docOf()
    const gion = d0.places.find((p) => p.name === 'Gion')!
    const r1 = ok(d0, { type: 'addTask', task: fila(gion.id) })
    const r2 = ok(r1.doc, { type: 'removePlace', id: gion.id })
    expect(r2.doc.tasks![0]).toMatchObject({ about: { kind: 'trip' }, wasAbout: 'Gion' })
    // Desfazer devolve a atividade e a tarefa presa a ela.
    const u = undoDoc(r2.doc, r2.steps)
    expect(u.ok && u.doc.tasks![0]!.about).toEqual({ kind: 'place', id: gion.id })
  })

  it('tarefa do dia vira "da viagem" quando a noite sai', () => {
    const d0 = docOf()
    const kyoto = d0.itinerary.stops.find((s) => s.destinationId === 'd-kyoto')!
    const t: Task = {
      ...fila('x'),
      about: { kind: 'day', ref: { kind: 'stop', stopId: kyoto.id, ordinal: 6 } },
    }
    const r1 = ok(d0, { type: 'addTask', task: t })
    const r2 = ok(r1.doc, {
      type: 'engine',
      command: { type: 'removeDay', stopId: kyoto.id, ordinal: 6, via: { kind: 'open' } },
    })
    expect(r2.doc.tasks![0]).toMatchObject({ about: { kind: 'trip' } })
    expect(r2.doc.tasks![0]!.wasAbout).toMatch(/Kyoto/)
  })

  it('automáticas: prazo, anotação e "Não preciso" pela chave; null apaga tudo', () => {
    const d0 = docOf()
    const key = 'transport-missing:l2'
    const r1 = ok(d0, {
      type: 'setTaskMeta',
      key,
      patch: { due: '2030-03-15', skip: { reason: 'paga a bordo' } },
    })
    expect(r1.doc.taskMeta![key]).toEqual({ due: '2030-03-15', skip: { reason: 'paga a bordo' } })
    const r2 = ok(r1.doc, { type: 'setTaskMeta', key, patch: { skip: null } })
    expect(r2.doc.taskMeta![key]).toEqual({ due: '2030-03-15' })
    const r3 = ok(r2.doc, { type: 'setTaskMeta', key, patch: null })
    expect(r3.doc.taskMeta![key]).toBeUndefined()
  })
})

describe('prazo e link', () => {
  it('agrupa por prazo a partir de hoje', () => {
    expect(dueGroup(undefined, '2030-03-01')).toBe('none')
    expect(dueGroup('2030-02-28', '2030-03-01')).toBe('late')
    expect(dueGroup('2030-03-01', '2030-03-01')).toBe('week')
    expect(dueGroup('2030-03-08', '2030-03-01')).toBe('week')
    expect(dueGroup('2030-03-09', '2030-03-01')).toBe('later')
  })
  it('link sem https também abre; texto solto não', () => {
    expect(linkHref('sankan.kunaicho.go.jp/fila')).toBe('https://sankan.kunaicho.go.jp/fila')
    expect(linkHref('https://x.com')).toBe('https://x.com')
    expect(linkHref('ligar para o hotel')).toBeNull()
  })
})
