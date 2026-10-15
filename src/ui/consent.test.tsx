// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { Consent } from './Consent'
import { useApp } from '../app/store'

// A faixa "Podemos medir…" nunca fica por cima de um painel (ela escondia "Receber link por e-mail").
describe('faixa de consentimento', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    useApp.setState({ sheet: null })
  })

  it('aparece sem painel aberto, some com um painel e volta quando ele fecha', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_teste')
    localStorage.removeItem('ludotrip.consent')
    useApp.setState({ sheet: null })
    render(<Consent />)
    expect(screen.getByRole('dialog', { name: 'Medir o uso do app' })).toBeTruthy()
    act(() => useApp.setState({ sheet: { kind: 'signin', reason: 'para guardar suas viagens' } }))
    expect(screen.queryByRole('dialog', { name: 'Medir o uso do app' })).toBeNull()
    act(() => useApp.setState({ sheet: null }))
    expect(screen.getByRole('dialog', { name: 'Medir o uso do app' })).toBeTruthy()
  })
})
