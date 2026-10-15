import { describe, expect, it } from 'vitest'
import { generateKeyPair, SignJWT } from 'jose'
import type { JWTVerifyGetKey } from 'jose'
import { tokenOf, verifyIdToken, WS_PROTOCOL } from './auth'

const PROJECT = 'ludotrip-test'
const now = Date.UTC(2030, 0, 1)
const sec = Math.floor(now / 1000)

async function setup() {
  const good = await generateKeyPair('RS256')
  const evil = await generateKeyPair('RS256')
  const keys: JWTVerifyGetKey = async () => good.publicKey
  const sign = (
    over: {
      sub?: string
      aud?: string
      iss?: string
      exp?: number
      auth?: number
      key?: CryptoKey
      alg?: string
    } = {},
  ) =>
    new SignJWT({ auth_time: over.auth ?? sec - 10, email: 'a@b.c', name: 'Ana' })
      .setProtectedHeader({ alg: over.alg ?? 'RS256' })
      .setIssuer(over.iss ?? `https://securetoken.google.com/${PROJECT}`)
      .setAudience(over.aud ?? PROJECT)
      .setSubject(over.sub ?? 'uid-ana')
      .setIssuedAt(sec - 10)
      .setExpirationTime(over.exp ?? sec + 3600)
      .sign(over.key ?? good.privateKey)
  return { keys, sign, evil }
}

describe('token de login do Firebase', () => {
  it('token válido devolve a pessoa', async () => {
    const { keys, sign } = await setup()
    expect(await verifyIdToken(await sign(), PROJECT, keys, now)).toEqual({
      uid: 'uid-ana',
      email: 'a@b.c',
      name: 'Ana',
      picture: null,
    })
  })

  it('recusa assinatura de outra chave, outro projeto, outro emissor, vencido, sem sub e login no futuro', async () => {
    const { keys, sign, evil } = await setup()
    const bad = [
      await sign({ key: evil.privateKey }),
      await sign({ aud: 'outro-projeto' }),
      await sign({ iss: 'https://securetoken.google.com/outro-projeto' }),
      await sign({ exp: sec - 1 }),
      await sign({ sub: '' }),
      await sign({ auth: sec + 3600 }),
      'nem-e-um-jwt',
    ]
    for (const t of bad) expect(await verifyIdToken(t, PROJECT, keys, now)).toBeNull()
  })

  it('o token vem do Authorization ou do subprotocolo do WebSocket, nunca da URL', () => {
    const bearer = new Request('https://x/api/me', { headers: { Authorization: 'Bearer abc' } })
    expect(tokenOf(bearer)).toBe('abc')
    const ws = new Request('https://x/api/trips/t/ws', {
      headers: { 'Sec-WebSocket-Protocol': `${WS_PROTOCOL}, abc` },
    })
    expect(tokenOf(ws)).toBe('abc')
    expect(tokenOf(new Request('https://x/api/me?token=abc'))).toBeNull()
  })
})
