import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// A configuração publicada nunca liga o login de teste (spec publicação §2.4).
describe('wrangler.jsonc', () => {
  // Sem os comentários: o que vale é a configuração.
  const text = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8').replace(
    /^\s*\/\/.*$/gm,
    '',
  )

  it('produção e staging não têm TEST_AUTH nem segredos', () => {
    expect(text).not.toMatch(/TEST_AUTH/)
    expect(text).not.toMatch(/ADMIN_TOKEN|api[_-]?key|secret/i)
  })

  it('logs e traces ligados', () => {
    expect(text).toMatch(/"observability"/)
    expect(text).toMatch(/"traces": \{ "enabled": true/)
  })
})
