import { describe, expect, it } from 'vitest'
import { env } from 'cloudflare:workers'
import { migrate, runDoc } from '../src/app/doc'
import type { DocAction, TripDoc } from '../src/app/doc'
import type { ServerMsg } from '../src/sync/protocol'
import { api, connect, tripDoc, upload } from './test/helpers'

const rename = (name: string): DocAction => ({ type: 'rename', name })
const applied = (opId: string) => (m: ServerMsg) => m.t === 'applied' && m.opId === opId
const nova: DocAction = {
  type: 'addPlace',
  place: { destinationId: 'd-kyoto', name: 'Nova', rarity: 'want' },
}

describe('levar uma viagem para a conta', () => {
  it('cria a viagem com o Dono; repetir não duplica; outra conta não leva a mesma', async () => {
    const doc = tripDoc('v-subir')
    expect((await upload('ana', doc)).status).toBe(201)
    expect((await upload('ana', doc)).status).toBe(200)
    expect(await (await upload('bia', doc)).json()).toEqual({ reason: 'owned' })
    const list = (await (await api('/api/trips', { uid: 'ana' })).json()) as { trips: unknown[] }
    expect(list.trips).toEqual([
      expect.objectContaining({ id: 'v-subir', role: 'owner', name: doc.meta.name }),
    ])
    const bia = (await (await api('/api/trips', { uid: 'bia' })).json()) as { trips: unknown[] }
    expect(bia.trips).toEqual([])
  })

  it('recusa sem login, o que não é viagem e id estranho', async () => {
    expect((await api('/api/trips', { method: 'POST', body: { doc: tripDoc('x') } })).status).toBe(401)
    expect(
      (await api('/api/trips', { uid: 'ana', method: 'POST', body: { doc: { meta: {} } } })).status,
    ).toBe(400)
    expect((await upload('ana', tripDoc('id com espaço'))).status).toBe(400)
  })
})

describe('TripRoom: ao vivo', () => {
  it('quem não é membro não abre (403); viagem que não existe (404)', async () => {
    await upload('ana', tripDoc('v-porta'))
    expect((await connect('v-porta', 'bia')).status).toBe(403)
    expect((await connect('v-nada', 'bia')).status).toBe(404)
  })

  it('hello do zero recebe o estado inteiro; ação aplicada chega a todas as conexões', async () => {
    await upload('ana', tripDoc('v-vivo'))
    const a = await connect('v-vivo', 'ana')
    const b = await connect('v-vivo', 'ana')
    expect(a.status).toBe(101)
    a.hello()
    expect(await a.waitFor((m) => m.t === 'snapshot')).toMatchObject({ t: 'snapshot', version: 0 })
    a.send({ t: 'op', opId: 'op-1', action: rename('Novo nome') })
    expect(await a.waitFor(applied('op-1'))).toMatchObject({ version: 1, by: 'ana' })
    expect(await b.waitFor(applied('op-1'))).toMatchObject({ version: 1, action: rename('Novo nome') })
    await new Promise((ok) => setTimeout(ok, 50))
    const list = (await (await api('/api/trips', { uid: 'ana' })).json()) as { trips: unknown[] }
    expect(list.trips[0]).toMatchObject({ name: 'Novo nome', version: 1 })
  })

  it('a mesma ação duas vezes (reenvio) é aplicada uma vez só', async () => {
    await upload('ana', tripDoc('v-dup'))
    const a = await connect('v-dup', 'ana')
    a.send({ t: 'op', opId: 'op-x', action: nova })
    await a.waitFor(applied('op-x'))
    a.send({ t: 'op', opId: 'op-x', action: nova })
    await new Promise((ok) => setTimeout(ok, 50))
    expect(a.inbox.filter(applied('op-x'))).toHaveLength(2)
    const doc = await env.TRIPS.getByName('v-dup').exportDoc()
    expect(doc!.version).toBe(1)
    expect(doc!.doc.places.filter((p) => p.name === 'Nova')).toHaveLength(1)
  })

  it('recusa vai só para quem mandou, com o motivo do motor', async () => {
    await upload('ana', tripDoc('v-recusa'))
    const a = await connect('v-recusa', 'ana')
    const b = await connect('v-recusa', 'ana')
    a.send({ t: 'op', opId: 'op-r', action: { type: 'removePlace', id: 'nao-existe' } })
    expect(await a.waitFor((m) => m.t === 'rejected')).toMatchObject({
      opId: 'op-r',
      reason: { code: 'NOT_FOUND' },
    })
    await new Promise((ok) => setTimeout(ok, 50))
    expect(b.inbox).toEqual([])
  })

  it('hello com versão antiga recebe só o que falta, na ordem; reaplicar chega ao estado do servidor', async () => {
    // O aparelho guarda a viagem já no formato atual (migrate), igual ao servidor.
    const start = migrate(tripDoc('v-falta'))
    await upload('ana', start)
    const a = await connect('v-falta', 'ana')
    for (const [i, name] of ['Um', 'Dois', 'Três'].entries()) {
      a.send({ t: 'op', opId: `op-${i}`, action: rename(name) })
      await a.waitFor(applied(`op-${i}`))
    }
    const b = await connect('v-falta', 'ana')
    b.hello(1)
    await b.waitFor(applied('op-2'))
    expect(b.inbox.map((m) => (m.t === 'applied' ? m.version : m.t))).toEqual([2, 3])
    // O aparelho estava na versão 1 (só 'Um'); com as ações recebidas, chega ao estado do servidor.
    const v1 = runDoc(start, rename('Um'), { opId: 'op-0' })
    if (!v1.ok) throw new Error('falhou')
    let local: TripDoc = v1.doc
    for (const m of b.inbox) {
      if (m.t !== 'applied') continue
      const r = runDoc(local, m.action, { opId: m.opId })
      if (r.ok) local = r.doc
    }
    const server = await env.TRIPS.getByName('v-falta').exportDoc()
    expect(local).toEqual(server!.doc)
  })

  it('protocolo antigo demais recebe upgrade', async () => {
    await upload('ana', tripDoc('v-velho'))
    const a = await connect('v-velho', 'ana')
    a.send({ t: 'hello', sinceVersion: 0, protocol: 0, schemaVersion: 1, app: 'velho' })
    expect(await a.waitFor((m) => m.t === 'upgrade')).toEqual({ t: 'upgrade' })
  })

  it('viagem acima de 1 MB é recusada', async () => {
    await upload('ana', tripDoc('v-grande'))
    const a = await connect('v-grande', 'ana')
    a.send({ t: 'op', opId: 'op-big', action: rename('x'.repeat(1_100_000)) })
    expect(await a.waitFor((m) => m.t === 'rejected')).toMatchObject({ reason: { code: 'TOO_BIG' } })
  })
})

describe('apagar', () => {
  it('só o Dono apaga; quem estava conectado recebe gone; some da lista', async () => {
    // O banco é o mesmo para o arquivo inteiro: uma pessoa só deste teste.
    await upload('caio', tripDoc('v-apagar'))
    expect((await api('/api/trips/v-apagar', { uid: 'bia', method: 'DELETE' })).status).toBe(404)
    const a = await connect('v-apagar', 'caio')
    expect((await api('/api/trips/v-apagar', { uid: 'caio', method: 'DELETE' })).status).toBe(200)
    expect(await a.waitFor((m) => m.t === 'gone')).toEqual({ t: 'gone', reason: 'deleted' })
    const list = (await (await api('/api/trips', { uid: 'caio' })).json()) as { trips: unknown[] }
    expect(list.trips).toEqual([])
    expect(await env.TRIPS.getByName('v-apagar').exportDoc()).toBeNull()
  })
})
