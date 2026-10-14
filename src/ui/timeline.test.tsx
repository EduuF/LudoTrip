// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { days } from '../engine'
import { italiaLonga } from '../engine/fixtures/trips'
import { useApp } from '../app/store'
import { DayPicker, TimelinePicker } from './TimelinePicker'
import { dayGroups } from './timeline'

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  const t = italiaLonga()
  useApp.setState({
    doc: {
      meta: { id: 't1', name: t.name, createdAt: 0, updatedAt: 0 },
      itinerary: t.itinerary,
      destinations: t.destinations,
      places: t.places,
      bookings: t.bookings,
      seq: 0,
    },
  })
})
afterEach(cleanup)

describe('linha do tempo numa viagem de 50 destinos e 120 noites', () => {
  it('uma linha por destino, uma fresta entre cada par, sugestão no topo e busca', () => {
    const picked: number[] = []
    render(<TimelinePicker suggest={12} onGap={(i) => picked.push(i)} />)
    expect(screen.getAllByRole('button', { name: /^Pôr (entre|no )/ }).length).toBe(51)
    expect(screen.getByText(/No caminho/).textContent).toMatch(/entre Cidade 12 e Cidade 13/)
    fireEvent.click(screen.getByRole('button', { name: 'Pôr aqui' }))
    expect(picked).toEqual([12])
    // Busca: só Cidade 33 e as frestas vizinhas.
    fireEvent.change(screen.getByLabelText('Buscar destino na viagem'), { target: { value: 'cidade 33' } })
    expect(screen.getAllByRole('button', { name: /^Pôr (entre|no )/ }).length).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Pôr entre Cidade 33 e Cidade 34' }))
    expect(picked).toEqual([12, 33])
  })

  it('pôr em qual dia: 50 grupos, só um aberto (120 dias viram 50 linhas)', () => {
    const it = useApp.getState().doc!.itinerary
    expect(dayGroups(days(it), it.stops).length).toBe(50)
    const prefer = useApp.getState().doc!.destinations[10]!.id
    render(<DayPicker prefer={prefer} pick={() => {}} />)
    const open = screen.getAllByRole('button', { expanded: true })
    expect(open.length).toBe(1)
    expect(open[0]!.textContent).toMatch(/Cidade 11/)
    expect(screen.getAllByRole('button', { expanded: false }).length).toBe(49)
  })
})
