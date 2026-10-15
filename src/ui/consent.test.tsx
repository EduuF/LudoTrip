// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PrivacySheet } from './Consent'
import { getConsent } from '../app/telemetry'

// Estatísticas de uso (retorno do staging): ligadas por padrão, sem faixa de pergunta; quem quiser
// desliga em "Privacidade".
describe('estatísticas de uso (opt-out)', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    localStorage.removeItem('ludotrip.consent')
  })

  it('ligadas por padrão; desligar fica guardado; religar volta', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_teste')
    expect(getConsent()).toBe('yes')
    render(<PrivacySheet />)
    const sw = screen.getByRole('switch', { name: /Estatísticas de uso/ }) as HTMLInputElement
    expect(sw.checked).toBe(true)
    expect(screen.getByText('Ajudam a melhorar o LudoTrip. Não incluem o que você escreve.')).toBeTruthy()
    fireEvent.click(sw)
    expect(getConsent()).toBe('no')
    fireEvent.click(sw)
    expect(getConsent()).toBe('yes')
  })

  it('não existe mais a faixa de pergunta', async () => {
    const mod = await import('./Consent')
    expect('Consent' in mod).toBe(false)
  })
})
