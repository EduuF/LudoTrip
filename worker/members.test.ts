import { describe, expect, it } from 'vitest'
import { runDurableObjectAlarm } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import type { DocAction } from '../src/app/doc'
import { api, connect, tripDoc, upload } from './test/helpers'

// Quem participa (spec publicação §4.5–4.6). Cada teste usa a sua viagem e as suas pessoas.

const rename = (name: string): DocAction => ({ type: 'rename', name })
const tokenOf = async (r: Response) => (await r.json()) as { token: string; id: string }

/** Viagem de `owner` com `others` já dentro, cada um com o papel pedido. */
async function trip(id: string, owner: string, others: [string, 'editor' | 'viewer', string?][] = []) {
  expect((await upload(owner, tripDoc(id))).status).toBe(201)
  for (const [uid, role, travelerId] of others) {
    const inv = await tokenOf(
      await api(`/api/trips/${id}/invites`, {
        uid: owner,
        method: 'POST',
        body: { role, ...(travelerId ? { travelerId } : {}) },
      }),
    )
    expect((await api(`/api/invites/${inv.token}/accept`, { uid, method: 'POST' })).status).toBe(200)
  }
}

const peopleOf = async (id: string, uid: string) =>
  (await (await api(`/api/trips/${id}/people`, { uid })).json()) as {
    me: string
    members: { uid: string; role: string }[]
    online: string[]
  }

describe('papéis', () => {
  it('o Dono troca o papel e vale já na conexão aberta', async () => {
    await trip('m-papel', 'm-ana', [['m-bia', 'editor']])
    const bia = await connect('m-papel', 'm-bia')
    bia.hello(0)
    bia.send({ t: 'op', opId: 'm-op1', action: rename('Um') })
    await bia.waitFor((m) => m.t === 'applied' && m.opId === 'm-op1')
    const r = await api('/api/trips/m-papel/members/m-bia', {
      uid: 'm-ana',
      method: 'PATCH',
      body: { role: 'viewer' },
    })
    expect(r.status).toBe(200)
    expect(await bia.waitFor((m) => m.t === 'role')).toEqual({ t: 'role', role: 'viewer' })
    bia.send({ t: 'op', opId: 'm-op2', action: rename('Dois') })
    expect(await bia.waitFor((m) => m.t === 'rejected')).toMatchObject({ reason: { code: 'ROLE' } })
    expect((await peopleOf('m-papel', 'm-bia')).me).toBe('viewer')
  })

  it('só o Dono troca papéis, e nunca para Dono por aqui', async () => {
    await trip('m-papel2', 'm-caio', [
      ['m-davi', 'editor'],
      ['m-eva', 'viewer'],
    ])
    const patch = (uid: string, who: string, role: string) =>
      api(`/api/trips/m-papel2/members/${uid}`, { uid: who, method: 'PATCH', body: { role } })
    expect((await patch('m-eva', 'm-davi', 'editor')).status).toBe(403)
    expect((await patch('m-eva', 'm-caio', 'owner')).status).toBe(400)
    expect((await patch('m-caio', 'm-caio', 'viewer')).status).toBe(404)
  })
})

describe('presença', () => {
  it('quem abre e fecha a viagem aparece e some para os outros', async () => {
    await trip('m-online', 'm-fia', [['m-gui', 'editor']])
    const fia = await connect('m-online', 'm-fia')
    await fia.waitFor(() => fia.presence.length > 0 || false).catch(() => undefined)
    const gui = await connect('m-online', 'm-gui')
    for (let i = 0; i < 100 && !fia.presence.some((p) => p.includes('m-gui')); i++)
      await new Promise((ok) => setTimeout(ok, 10))
    expect(fia.presence.at(-1)?.sort()).toEqual(['m-fia', 'm-gui'])
    expect((await peopleOf('m-online', 'm-fia')).online.sort()).toEqual(['m-fia', 'm-gui'])
    gui.close()
    for (let i = 0; i < 100 && fia.presence.at(-1)?.includes('m-gui'); i++)
      await new Promise((ok) => setTimeout(ok, 10))
    expect(fia.presence.at(-1)).toEqual(['m-fia'])
  })
})

describe('tirar e sair', () => {
  it('o Dono tira alguém: a conexão fecha, a viagem some da lista e o viajante sai de Quem vai', async () => {
    await trip('m-tirar', 'm-hal')
    const hal = await connect('m-tirar', 'm-hal')
    hal.hello(0)
    hal.send({
      t: 'op',
      opId: 'm-add',
      action: {
        type: 'engine',
        command: { type: 'addTraveler', traveler: { id: 'g.9', name: 'Convidado' } },
      },
    })
    await hal.waitFor((m) => m.t === 'applied' && m.opId === 'm-add')
    const inv = await tokenOf(
      await api('/api/trips/m-tirar/invites', {
        uid: 'm-hal',
        method: 'POST',
        body: { role: 'editor', travelerId: 'g.9' },
      }),
    )
    await api(`/api/invites/${inv.token}/accept`, { uid: 'm-ian', method: 'POST' })
    const ian = await connect('m-tirar', 'm-ian')
    const r = await api('/api/trips/m-tirar/members/m-ian?traveler=1', { uid: 'm-hal', method: 'DELETE' })
    expect(r.status).toBe(200)
    expect(await ian.waitFor((m) => m.t === 'gone')).toEqual({ t: 'gone', reason: 'removed' })
    const list = (await (await api('/api/trips', { uid: 'm-ian' })).json()) as { trips: unknown[] }
    expect(list.trips).toEqual([])
    await hal.waitFor((m) => m.t === 'applied' && m.opId.startsWith('leave-'))
    const doc = (await env.TRIPS.getByName('m-tirar').exportDoc())!.doc
    expect(doc.itinerary.travelers.some((t) => t.id === 'g.9')).toBe(false)
    expect((await connect('m-tirar', 'm-ian')).status).toBe(403)
  })

  it('sem traveler=1, o viajante fica e só perde a conta; quem sai sozinho sai', async () => {
    await trip('m-sair', 'm-jo', [
      ['m-kim', 'editor', undefined],
      ['m-lia', 'viewer'],
    ])
    expect((await api('/api/trips/m-sair/members/m-lia', { uid: 'm-lia', method: 'DELETE' })).status).toBe(
      200,
    )
    expect((await peopleOf('m-sair', 'm-jo')).members.map((m) => m.uid).sort()).toEqual(['m-jo', 'm-kim'])
    expect((await api('/api/trips/m-sair/members/m-kim', { uid: 'm-lia', method: 'DELETE' })).status).toBe(
      404,
    )
    expect((await api('/api/trips/m-sair/members/m-jo', { uid: 'm-kim', method: 'DELETE' })).status).toBe(403)
    const own = await api('/api/trips/m-sair/members/m-jo', { uid: 'm-jo', method: 'DELETE' })
    expect(own.status).toBe(409)
    expect(await own.json()).toEqual({ reason: 'owner-must-transfer' })
  })
})

describe('passar a viagem', () => {
  it('o novo Dono pode tudo; o antigo vira Planeja junto e já pode sair', async () => {
    await trip('m-passar', 'm-leo', [['m-mia', 'editor']])
    expect(
      (await api('/api/trips/m-passar/transfer', { uid: 'm-mia', method: 'POST', body: { uid: 'm-mia' } }))
        .status,
    ).toBe(403)
    expect(
      (await api('/api/trips/m-passar/transfer', { uid: 'm-leo', method: 'POST', body: { uid: 'm-nada' } }))
        .status,
    ).toBe(404)
    expect(
      (await api('/api/trips/m-passar/transfer', { uid: 'm-leo', method: 'POST', body: { uid: 'm-mia' } }))
        .status,
    ).toBe(200)
    expect((await peopleOf('m-passar', 'm-leo')).me).toBe('editor')
    expect((await peopleOf('m-passar', 'm-mia')).me).toBe('owner')
    const t = await env.DB.prepare('SELECT owner_uid FROM trips WHERE id = ?1')
      .bind('m-passar')
      .first<{ owner_uid: string }>()
    expect(t!.owner_uid).toBe('m-mia')
    expect((await api('/api/trips/m-passar/members/m-leo', { uid: 'm-leo', method: 'DELETE' })).status).toBe(
      200,
    )
  })
})

describe('apagar para todos e recuperar', () => {
  it('some para todos, fica em Apagadas só do Dono, volta com Recuperar', async () => {
    await trip('m-apagar', 'm-nina', [['m-otto', 'editor']])
    const otto = await connect('m-apagar', 'm-otto')
    expect((await api('/api/trips/m-apagar', { uid: 'm-otto', method: 'DELETE' })).status).toBe(403)
    expect((await api('/api/trips/m-apagar', { uid: 'm-nina', name: 'Nina Reis', method: 'DELETE' })).status).toBe(200)
    expect(await otto.waitFor((m) => m.t === 'gone')).toEqual({ t: 'gone', reason: 'deleted', by: 'Nina' })
    const listOf = async (uid: string, q = '') =>
      ((await (await api(`/api/trips${q}`, { uid })).json()) as { trips: { id: string }[] }).trips.map(
        (t) => t.id,
      )
    expect(await listOf('m-otto')).toEqual([])
    expect(await listOf('m-nina')).toEqual([])
    expect(await listOf('m-nina', '?deleted=1')).toEqual(['m-apagar'])
    expect(await listOf('m-otto', '?deleted=1')).toEqual([])
    expect((await api('/api/trips/m-apagar/restore', { uid: 'm-otto', method: 'POST' })).status).toBe(404)
    expect((await api('/api/trips/m-apagar/restore', { uid: 'm-nina', method: 'POST' })).status).toBe(200)
    expect(await listOf('m-otto')).toEqual(['m-apagar'])
    expect(await listOf('m-nina', '?deleted=1')).toEqual([])
  })

  it('o alarme dos 30 dias apaga de vez; se foi recuperada, não faz nada', async () => {
    await trip('m-fim', 'm-pia')
    await api('/api/trips/m-fim', { uid: 'm-pia', method: 'DELETE' })
    const room = env.TRIPS.getByName('m-fim')
    // Ainda não deu 30 dias: reagenda e mantém.
    expect(await runDurableObjectAlarm(room)).toBe(true)
    expect(await room.exportDoc()).not.toBeNull()
    await env.DB.prepare('UPDATE trips SET deleted_at = 1 WHERE id = ?1').bind('m-fim').run()
    expect(await runDurableObjectAlarm(room)).toBe(true)
    expect(await room.exportDoc()).toBeNull()
    const row = await env.DB.prepare('SELECT id FROM trips WHERE id = ?1').bind('m-fim').first()
    expect(row).toBeNull()
  })
})

describe('Histórico', () => {
  it('quem fez o quê, mais novo primeiro, de 50 em 50', async () => {
    await trip('m-hist', 'm-rai', [['m-sam', 'editor']])
    await api('/api/me', { uid: 'm-sam', name: 'Sam Torres' })
    const sam = await connect('m-hist', 'm-sam')
    sam.hello(0)
    for (let i = 0; i < 52; i++) sam.send({ t: 'op', opId: `m-h${i}`, action: rename(`Nome ${i}`) })
    await sam.waitFor((m) => m.t === 'applied' && m.opId === 'm-h51')
    const page = (await (await api('/api/trips/m-hist/history', { uid: 'm-rai' })).json()) as {
      items: { seq: number; name: string; text: string }[]
      more: boolean
    }
    expect(page.items).toHaveLength(50)
    expect(page.more).toBe(true)
    expect(page.items[0]).toMatchObject({ name: 'Sam' })
    expect(page.items[0]!.text).toContain('Nome 51')
    const next = (await (
      await api(`/api/trips/m-hist/history?before=${page.items.at(-1)!.seq}`, { uid: 'm-rai' })
    ).json()) as {
      items: unknown[]
      more: boolean
    }
    expect(next.items).toHaveLength(2)
    expect(next.more).toBe(false)
    expect((await api('/api/trips/m-hist/history', { uid: 'm-fora' })).status).toBe(404)
  })
})
