import { describe, expect, it } from 'vitest'
import { formatRoute, parseRoute } from './routePaths'

describe('endereços (publicação §3.6)', () => {
  it('lê e escreve /, /v/<id> e /entrar/link, também sob uma base', () => {
    for (const root of ['/', '/LudoTrip/']) {
      expect(parseRoute(`${root}`, root)).toEqual({ kind: 'home' })
      expect(parseRoute(`${root}v/ex-japao-abc`, root)).toEqual({ kind: 'trip', id: 'ex-japao-abc' })
      expect(parseRoute(`${root}v/ex-japao-abc/`, root)).toEqual({ kind: 'trip', id: 'ex-japao-abc' })
      expect(parseRoute(`${root}entrar/link`, root)).toEqual({ kind: 'emailLink' })
      expect(parseRoute(`${root}qualquer/coisa`, root)).toEqual({ kind: 'home' })
      expect(formatRoute({ kind: 'trip', id: 'a b' }, root)).toBe(`${root}v/a%20b`)
      expect(parseRoute(formatRoute({ kind: 'trip', id: 'a b' }, root), root)).toEqual({
        kind: 'trip',
        id: 'a b',
      })
      expect(formatRoute({ kind: 'home' }, root)).toBe(root)
    }
  })
})
