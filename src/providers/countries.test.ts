import { describe, expect, it } from 'vitest'
import { countryBounds, countryByIso, searchCountries } from './countries'

describe('países', () => {
  it('acha por nome sem acento, nome local e apelido; exatos primeiro', () => {
    expect(searchCountries('romenia')[0]?.iso2).toBe('RO')
    expect(searchCountries('Romênia')[0]?.iso2).toBe('RO')
    expect(searchCountries('japao')[0]?.iso2).toBe('JP')
    expect(searchCountries('日本')[0]?.iso2).toBe('JP')
    expect(searchCountries('eua')[0]?.iso2).toBe('US')
    expect(searchCountries('holanda')[0]?.iso2).toBe('NL')
    // "Guiné" antes de "Guiné-Bissau" e "Guiné Equatorial".
    expect(searchCountries('guine').map((c) => c.name)[0]).toBe('Guiné')
    expect(searchCountries('x')).toEqual([])
  })

  it('caixa envolvente pelos contornos (Romênia; Rússia sem dar a volta no mundo)', async () => {
    const ro = await countryBounds(countryByIso('RO')!.id)
    expect(ro).not.toBeNull()
    const [w, s, e, n] = ro!
    expect(w).toBeGreaterThan(19)
    expect(e).toBeLessThan(31)
    expect(s).toBeGreaterThan(43)
    expect(n).toBeLessThan(49)
    const ru = await countryBounds(countryByIso('RU')!.id)
    expect(ru).not.toBeNull()
    expect(ru![2] - ru![0]).toBeLessThanOrEqual(180)
    expect(await countryBounds('000')).toBeNull()
  })
})
