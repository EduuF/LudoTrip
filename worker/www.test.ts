import { describe, expect, it } from 'vitest'
import worker, { toApex } from './www'

describe('www → domínio principal', () => {
  it('troca só o host e mantém caminho, busca e âncora', () => {
    expect(toApex('https://www.ludotrip.app/t/abc?x=1#y')).toBe('https://ludotrip.app/t/abc?x=1#y')
    expect(toApex('http://www.ludotrip.app/')).toBe('https://ludotrip.app/')
  })

  it('responde 301', async () => {
    const res = await worker.fetch(new Request('https://www.ludotrip.app/sobre'))
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('https://ludotrip.app/sobre')
  })
})
