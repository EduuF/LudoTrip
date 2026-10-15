import { describe, expect, it } from 'vitest'
import { cleanProps, getConsent, track } from './telemetry'

describe('telemetria (publicação §5.7)', () => {
  it('eventos só levam chaves permitidas e valores curtos (nunca texto digitado)', () => {
    expect(
      cleanProps({
        type: 'setNights',
        name: 'Viagem da Ana ao Japão',
        note: 'Anotação longa',
        trigger: 'para guardar suas viagens',
        reason: 'x'.repeat(41),
        count: 2,
        cloud: true,
      }),
    ).toEqual({ type: 'setNights', trigger: 'para guardar suas viagens', count: 2, cloud: true })
  })

  it('sem chaves e sem consentimento, nada carrega e track não quebra', () => {
    expect(getConsent()).toBeNull()
    expect(() => track('edicao', { type: 'rename' })).not.toThrow()
  })
})
