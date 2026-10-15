import { describe, expect, it } from 'vitest'
import { env } from 'cloudflare:workers'
import type { DocAction } from '../src/app/doc'
import type { ServerMsg } from '../src/sync/protocol'
import { api, connect, tripDoc, upload } from './test/helpers'

// Convites (spec publicação §4.3–4.4). Cada teste usa a sua viagem e as suas pessoas (o banco é do arquivo).

const invite = (trip: string, uid: string, body: unknown) =>
  api(`/api/trips/${trip}/invites`, { uid, method: 'POST', body })
const tokenOf = async (r: Response) => (await r.json()) as { token: string; id: string; url: string }
const accept = (token: string, uid: string, name?: string) =>
  api(`/api/invites/${token}/accept`, { uid, ...(name ? { name } : {}), method: 'POST' })
const preview = (token: string) => api(`/api/invites/${token}`)

async function tripWith(id: string, owner: string, name = 'Ana Souza') {
  expect((await upload(owner, tripDoc(id))).status).toBe(201)
  // Subir guarda o nome do login de teste; o nome de verdade vem depois (como num login novo).
  await api('/api/me', { uid: owner, name })
}

describe('criar convite', () => {
  it('Dono cria para planejar e para ver; o link leva o token, e o token nunca aparece na lista', async () => {
    await tripWith('c-criar', 'c-ana')
    const r = await invite('c-criar', 'c-ana', { role: 'editor' })
    expect(r.status).toBe(201)
    const inv = await tokenOf(r)
    expect(inv.url).toMatch(/\/convite\/[A-Za-z0-9_-]{22}$/)
    expect(inv.url.endsWith(inv.token)).toBe(true)
    const p = await (await api('/api/trips/c-criar/people', { uid: 'c-ana' })).text()
    expect(p).not.toContain(inv.token)
    expect(JSON.parse(p)).toMatchObject({ invites: [{ id: inv.id, role: 'editor' }] })
    const row = await env.DB.prepare('SELECT token_hash FROM invites WHERE id = ?1')
      .bind(inv.id)
      .first<{ token_hash: string }>()
    expect(row!.token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(row!.token_hash).not.toContain(inv.token)
  })

  it('"Planeja junto" só chama para ver; "Só vê" não chama; quem não é membro nem sabe que existe', async () => {
    await tripWith('c-papel', 'c-bea')
    const ed = await tokenOf(await invite('c-papel', 'c-bea', { role: 'editor' }))
    expect((await accept(ed.token, 'c-edu')).status).toBe(200)
    const vw = await tokenOf(await invite('c-papel', 'c-bea', { role: 'viewer' }))
    expect((await accept(vw.token, 'c-gil')).status).toBe(200)
    expect((await invite('c-papel', 'c-edu', { role: 'editor' })).status).toBe(403)
    expect((await invite('c-papel', 'c-edu', { role: 'viewer' })).status).toBe(201)
    expect((await invite('c-papel', 'c-gil', { role: 'viewer' })).status).toBe(403)
    expect((await invite('c-papel', 'c-fora', { role: 'viewer' })).status).toBe(404)
    expect((await invite('c-papel', 'c-bea', { role: 'owner' })).status).toBe(400)
  })

  it('no máximo 10 convites aguardando', async () => {
    await tripWith('c-dez', 'c-dan')
    for (let i = 0; i < 10; i++) expect((await invite('c-dez', 'c-dan', { role: 'viewer' })).status).toBe(201)
    const r = await invite('c-dez', 'c-dan', { role: 'viewer' })
    expect(r.status).toBe(403)
    expect(await r.json()).toEqual({ reason: 'invites-limit' })
  })
})

describe('prévia e aceite', () => {
  it('a prévia mostra pouco e não precisa de conta', async () => {
    await tripWith('c-previa', 'c-ivo', 'Ivo Lima')
    const inv = await tokenOf(await invite('c-previa', 'c-ivo', { role: 'viewer' }))
    const r = await preview(inv.token)
    expect(r.status).toBe(200)
    const body = (await r.json()) as Record<string, unknown>
    expect(body).toMatchObject({ tripId: 'c-previa', inviter: 'Ivo', role: 'viewer', travels: false })
    expect((body.destinations as string[]).length).toBeGreaterThan(0)
    expect(Object.keys(body).sort()).toEqual(
      [
        'destinations',
        'end',
        'expiresAt',
        'inviter',
        'role',
        'start',
        'travels',
        'tripId',
        'tripName',
      ].sort(),
    )
    expect((await preview('nada-disso')).status).toBe(404)
  })

  it('uso único: o primeiro entra; o segundo vê "não vale mais" com o nome de quem chamou', async () => {
    await tripWith('c-unico', 'c-ari', 'Ari Melo')
    const inv = await tokenOf(await invite('c-unico', 'c-ari', { role: 'editor' }))
    expect(await (await accept(inv.token, 'c-bia')).json()).toMatchObject({
      tripId: 'c-unico',
      role: 'editor',
      already: false,
    })
    const second = await accept(inv.token, 'c-caio')
    expect(second.status).toBe(410)
    expect(await second.json()).toEqual({ reason: 'invalid', inviter: 'Ari' })
    expect(await (await preview(inv.token)).json()).toEqual({ reason: 'invalid', inviter: 'Ari' })
    const list = (await (await api('/api/trips', { uid: 'c-bia' })).json()) as {
      trips: { id: string; role: string }[]
    }
    expect(list.trips).toEqual([expect.objectContaining({ id: 'c-unico', role: 'editor', members: 2 })])
  })

  it('quem já é membro abre a viagem e o convite continua sem uso', async () => {
    await tripWith('c-ja', 'c-luz')
    const inv = await tokenOf(await invite('c-ja', 'c-luz', { role: 'editor' }))
    expect(await (await accept(inv.token, 'c-luz')).json()).toMatchObject({ already: true, role: 'owner' })
    expect((await preview(inv.token)).status).toBe(200)
  })

  it('cancelado, vencido e viagem apagada', async () => {
    await tripWith('c-casos', 'c-max')
    const a = await tokenOf(await invite('c-casos', 'c-max', { role: 'viewer' }))
    expect((await api(`/api/trips/c-casos/invites/${a.id}`, { uid: 'c-max', method: 'DELETE' })).status).toBe(
      200,
    )
    expect((await accept(a.token, 'c-noa')).status).toBe(410)
    const b = await tokenOf(await invite('c-casos', 'c-max', { role: 'viewer' }))
    await env.DB.prepare('UPDATE invites SET expires_at = 1 WHERE id = ?1').bind(b.id).run()
    expect(await (await preview(b.token)).json()).toMatchObject({ reason: 'invalid' })
    const c = await tokenOf(await invite('c-casos', 'c-max', { role: 'viewer' }))
    expect((await api('/api/trips/c-casos', { uid: 'c-max', method: 'DELETE' })).status).toBe(200)
    expect(await (await preview(c.token)).json()).toMatchObject({ reason: 'deleted' })
  })

  it('com viajante reservado: o "Convidado" ganha o nome e a conta; todos recebem "entrou"', async () => {
    await tripWith('c-viaja', 'c-rui')
    const add: DocAction = {
      type: 'engine',
      command: { type: 'addTraveler', traveler: { id: 'g.1', name: 'Convidado' } },
    }
    const ws = await connect('c-viaja', 'c-rui')
    ws.hello(0)
    ws.send({ t: 'op', opId: 'op-add', action: add })
    await ws.waitFor((m) => m.t === 'applied' && m.opId === 'op-add')
    const inv = await tokenOf(await invite('c-viaja', 'c-rui', { role: 'editor', travelerId: 'g.1' }))
    expect(await (await preview(inv.token)).json()).toMatchObject({ travels: true })
    expect((await accept(inv.token, 'c-sol', 'Sol Prado')).status).toBe(200)
    expect(await ws.waitFor((m) => m.t === 'joined')).toEqual({ t: 'joined', uid: 'c-sol', name: 'Sol' })
    await ws.waitFor((m: ServerMsg) => m.t === 'applied' && m.opId.startsWith('join-'))
    const doc = (await env.TRIPS.getByName('c-viaja').exportDoc())!.doc
    expect(doc.itinerary.travelers.find((t) => t.id === 'g.1')).toEqual({
      id: 'g.1',
      name: 'Sol',
      userId: 'c-sol',
    })
    const h = (await (await api('/api/trips/c-viaja/history', { uid: 'c-rui' })).json()) as {
      items: { text: string; name: string }[]
    }
    expect(h.items[0]).toMatchObject({ text: 'Sol entrou na viagem', name: 'Sol' })
    expect(h.items[1]).toMatchObject({ text: 'Convidado entrou em Quem vai.' })
  })
})
