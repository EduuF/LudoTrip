import { describe, expect, it } from 'vitest'
import { addDays, dayLabel, ddmm, diffDays, isISODate, weekday } from './dates'

describe('datas', () => {
  it('soma dias atravessando mês e ano', () => {
    expect(addDays('2030-04-01', 23)).toBe('2030-04-24')
    expect(addDays('2030-01-31', 1)).toBe('2030-02-01')
    expect(addDays('2030-12-31', 1)).toBe('2031-01-01')
    expect(addDays('2032-02-28', 1)).toBe('2032-02-29')
    expect(addDays('2030-04-01', -1)).toBe('2030-03-31')
  })

  it('diferença em dias, inclusive negativa', () => {
    expect(diffDays('2030-04-01', '2030-04-24')).toBe(23)
    expect(diffDays('2030-04-24', '2030-04-01')).toBe(-23)
  })

  it('valida datas ISO', () => {
    expect(isISODate('2030-04-01')).toBe(true)
    expect(isISODate('2030-02-30')).toBe(false)
    expect(isISODate('01/04/2030')).toBe(false)
  })

  it('rótulos em português', () => {
    expect(weekday('2030-04-01')).toBe('seg')
    expect(ddmm('2030-04-01')).toBe('01/04')
    expect(dayLabel('2030-04-03')).toBe('qua 03/04')
  })
})

describe('datas não dependem do fuso do computador', () => {
  for (const tz of ['America/Sao_Paulo', 'Asia/Tokyo', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
    it(tz, () => {
      const old = process.env.TZ
      process.env.TZ = tz
      try {
        expect(addDays('2030-04-01', 23)).toBe('2030-04-24')
        expect(diffDays('2030-03-30', '2030-04-02')).toBe(3)
        expect(weekday('2030-04-01')).toBe('seg')
      } finally {
        process.env.TZ = old
      }
    })
  }
})
