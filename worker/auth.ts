import { createRemoteJWKSet, generateKeyPair, jwtVerify, SignJWT } from 'jose'
import type { JWTVerifyGetKey } from 'jose'
import { WS_PROTOCOL } from '../src/sync/protocol'
import type { AppEnv } from './env'

// Quem é a pessoa (spec publicação §2.3): o token de login do Firebase, verificado com as chaves
// públicas do Google. Conferimos assinatura RS256, projeto (aud), emissor (iss), validade e `sub`.

const GOOGLE_KEYS =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'

export interface Identity {
  uid: string
  email: string | null
  name: string | null
  picture: string | null
}

/** Cache das chaves do Google por isolate (o jose respeita o Cache-Control delas). */
let googleKeys: JWTVerifyGetKey | null = null

export async function verifyIdToken(
  token: string,
  projectId: string,
  keys: JWTVerifyGetKey,
  now = Date.now(),
): Promise<Identity | null> {
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ['RS256'],
      currentDate: new Date(now),
    })
    const uid = payload.sub
    if (typeof uid !== 'string' || !uid || uid.length > 128) return null
    // O login tem de ter acontecido no passado (regra do Firebase para tokens de ID).
    const authTime = payload.auth_time
    if (typeof authTime !== 'number' || authTime * 1000 > now + 60_000) return null
    const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
    return { uid, email: str(payload.email), name: str(payload.name), picture: str(payload.picture) }
  } catch {
    return null
  }
}

// --- Chaves de teste (TEST_AUTH=1): o e2e e os testes entram sem Google. ---

let testPair: Promise<{
  sign: (uid: string, name?: string) => Promise<string>
  keys: JWTVerifyGetKey
}> | null = null

export function testAuth(projectId: string) {
  testPair ??= (async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const keys: JWTVerifyGetKey = async () => publicKey
    const sign = (uid: string, name?: string) =>
      new SignJWT({
        name: name ?? `Teste ${uid}`,
        email: `${uid}@teste.invalid`,
        auth_time: Math.floor(Date.now() / 1000) - 1,
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .setIssuer(`https://securetoken.google.com/${projectId}`)
        .setAudience(projectId)
        .setSubject(uid)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(privateKey)
    return { sign, keys }
  })()
  return testPair
}

export { WS_PROTOCOL }

/** O token de `Authorization: Bearer …` ou, no WebSocket, do `Sec-WebSocket-Protocol`. */
export function tokenOf(request: Request): string | null {
  const header = request.headers.get('Authorization')
  if (header?.startsWith('Bearer ')) return header.slice(7)
  const protocols = (request.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map((x) => x.trim())
  if (protocols[0] === WS_PROTOCOL && protocols[1]) return protocols[1]
  return null
}

export async function identify(request: Request, env: AppEnv): Promise<Identity | null> {
  const token = tokenOf(request)
  if (!token) return null
  const keys =
    env.TEST_AUTH === '1'
      ? (await testAuth(env.FIREBASE_PROJECT_ID)).keys
      : (googleKeys ??= createRemoteJWKSet(new URL(GOOGLE_KEYS)))
  return verifyIdToken(token, env.FIREBASE_PROJECT_ID, keys)
}
