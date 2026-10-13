// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../App'
import { useApp, useRepo } from '../app/store'
import { days } from '../engine'
import { memoryRepo } from '../app/repo'

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  window.matchMedia ??= (q: string) =>
    ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    }) as MediaQueryList
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext']
  Element.prototype.scrollIntoView ??= () => {}
  window.scrollTo = (() => {}) as typeof window.scrollTo
})

beforeEach(async () => {
  useRepo(memoryRepo())
  useApp.setState({
    ready: false,
    screen: 'home',
    doc: null,
    undoStack: [],
    toast: null,
    sheet: null,
    cursorDay: null,
    celebrations: [],
  })
  render(<App />)
  fireEvent.click(await screen.findByText('Japão de trem'))
  await screen.findByText('FALTAM', { selector: '.map-head .lbl' })
})

afterEach(cleanup)

const nav = () => within(screen.getByRole('navigation', { name: 'Telas da viagem' }))
const tab = (name: string) => fireEvent.click(nav().getByText(name))
const dayCard = () => within(screen.getByRole('region', { name: 'Dia escolhido' }))
const kyotoCard = () => within(document.getElementById('c-s8')!)
const touch = { pointerId: 1, pointerType: 'touch', button: 0, isPrimary: true }
const mouse = { pointerId: 2, pointerType: 'mouse', button: 0, isPrimary: true }
const tripName = () => useApp.getState().doc!.meta.name
/** Nomes das viagens na tela inicial (o h3 fica dentro do botão de abrir, fora da árvore de acessibilidade). */
const tripNames = () => [...document.querySelectorAll('.trip-card h3')].map((e) => e.textContent)

/** Preenche o painel "Nova atividade" aberto: nome, prioridade e "Criar atividade". */
async function preencherAtividade(name: string, rarity: RegExp) {
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Nome da atividade'), { target: { value: name } })
  fireEvent.click(within(within(dialog).getByRole('group', { name: 'Prioridade' })).getByRole('button', { name: rarity }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Criar atividade' }))
  expect(await screen.findByText(`Atividade nova: ${name}.`)).toBeTruthy()
}

/** Cria uma atividade em Kyoto pela aba Atividades (sem dia). */
async function novaAtividade(name: string, rarity: RegExp) {
  tab('Atividades')
  fireEvent.click(screen.getByRole('button', { name: 'Nova atividade em Kyoto' }))
  await preencherAtividade(name, rarity)
}

async function entrarEmKyoto() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Kyoto: entrar no mapa da cidade' }, { timeout: 8000 }),
  )
  await screen.findByRole('button', { name: '◀ Mapa' })
}

describe('app', () => {
  it('abre na tela do Mapa, com trilha, cartão do dia e roteiro; abas Mapa · Atividades · Tarefas', () => {
    for (const t of ['Mapa', 'Atividades', 'Tarefas']) expect(nav().getByText(t)).toBeTruthy()
    expect(nav().queryByText('Mochila')).toBeNull()
    expect(nav().queryByText('Roteiro')).toBeNull()
    expect(screen.getByRole('region', { name: 'Mapa da viagem' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Trilha da viagem' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Dia escolhido' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Noites em Kyoto' })).toBeTruthy()
    // O resumo da viagem fica no cabeçalho da trilha (a contagem no mapa é compacta).
    expect(document.querySelector('.tr-month')!.textContent).toMatch(/23 noites · 6 lugares/)
    // Nada de "figurinha", "colar" ou "noites incertas" na tela.
    expect(document.body.textContent).not.toMatch(/figurinha|colar|incerta/i)
  })

  it('passagem: marcar e desmarcar no mesmo lugar, com Desfazer', async () => {
    const buy = screen.getAllByRole('button', { name: /Passagem: falta comprar/ })[0]!
    fireEvent.click(buy)
    expect(await screen.findByText('Passagem comprada 済.')).toBeTruthy()
    const on = screen.getAllByRole('button', { name: /Passagem comprada/ })
    expect(on.length).toBeGreaterThanOrEqual(3)
    fireEvent.click(on[0]!)
    expect(await screen.findByText('Passagem desmarcada.')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('status')).getByText('Desfazer'))
    await waitFor(() => expect(useApp.getState().toast?.text).toMatch(/^Desfeito/))
  })

  it('nova atividade: escolhe a prioridade e conclui com "Criar atividade" (desligado sem nome)', async () => {
    tab('Atividades')
    fireEvent.click(screen.getByRole('button', { name: 'Nova atividade em Kyoto' }))
    const dialog = await screen.findByRole('dialog')
    const create = within(dialog).getByRole('button', { name: 'Criar atividade' })
    expect(create).toHaveProperty('disabled', true)
    // "Quero" já vem marcado.
    expect(within(dialog).getByRole('button', { name: /Quero/ }).getAttribute('aria-pressed')).toBe('true')
    await preencherAtividade('Ginkaku-ji', /Imperdível/)
    const card = screen.getByRole('button', { name: /^Ginkaku-ji, Imperdível, sem dia/ })
    expect(card.className).toContain('r-must')
  })

  it('"+ Atividade" num dia do roteiro cria a atividade já naquele dia', async () => {
    fireEvent.click(kyotoCard().getAllByRole('button', { name: '+ Atividade' })[0]!)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Nova atividade em Kyoto')).toBeTruthy()
    expect(within(dialog).getByText(/Entra em sáb 13\/04/)).toBeTruthy()
    await preencherAtividade('Ginkaku-ji', /Quero/)
    expect(kyotoCard().getByRole('button', { name: /Ginkaku-ji/ })).toBeTruthy()
    const p = useApp.getState().doc!.places.find((x) => x.name === 'Ginkaku-ji')!
    expect(p.rarity).toBe('want')
  })

  it('"+ Atividade aqui": um clique no mapa da cidade abre "Nova atividade"; "Não adicionar" cancela', async () => {
    await entrarEmKyoto()
    fireEvent.click(screen.getByRole('button', { name: '+ Atividade aqui' }))
    const board = document.querySelector('.board')!
    await waitFor(() => expect(board.className).toContain('placing'))
    expect(screen.getByText(/Marque no mapa onde fica a atividade nova/)).toBeTruthy()
    fireEvent.click(board, { clientX: 10, clientY: 10 })
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Nova atividade em Kyoto')).toBeTruthy()
    expect(board.className).not.toContain('placing')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // De novo: "Não adicionar" sai do modo, e o clique no mapa volta a ser só mapa.
    fireEvent.click(screen.getByRole('button', { name: '+ Atividade aqui' }))
    await waitFor(() => expect(board.className).toContain('placing'))
    fireEvent.click(screen.getByRole('button', { name: 'Não adicionar' }))
    await waitFor(() => expect(board.className).not.toContain('placing'))
    fireEvent.click(board, { clientX: 10, clientY: 10 })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('volta marcada: "+" pergunta de onde sai a noite, com prévia', async () => {
    const kyoto = screen.getByRole('group', { name: 'Noites em Kyoto' })
    fireEvent.click(within(kyoto).getByRole('button', { name: 'Mais' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('De onde sai essa noite?')).toBeTruthy()
    fireEvent.click(within(dialog).getByText(/^Tirar de Osaka/))
    expect(await screen.findByText(/Kyoto: 8 noites\. Shinsekai e Kuromon ficaram sem dia\./)).toBeTruthy()
  })

  it('tocar num destino da trilha leva ao cartão e ao primeiro dia dele; "⋯" tem as ações raras', async () => {
    const block = screen.getByRole('button', { name: /^Kyoto, 7 noites/ })
    fireEvent.pointerDown(block, { ...touch, clientX: 5, clientY: 5 })
    fireEvent.pointerUp(block, { ...touch, clientX: 5, clientY: 5 })
    expect(await dayCard().findByText('chega em Kyoto')).toBeTruthy()
    await waitFor(() => expect(document.getElementById('c-s8')!.className).toContain('flash'))
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(kyotoCard().getByRole('button', { name: 'Mais opções de Kyoto' }))
    const dialog = await screen.findByRole('dialog')
    for (const t of ['Mudar a ordem', 'Chegar 1 dia antes', 'Chegar 1 dia depois', 'Tirar do roteiro'])
      expect(within(dialog).getByText(t)).toBeTruthy()
    fireEvent.click(within(dialog).getByText('Chegar 1 dia depois'))
    expect(await screen.findByText('Kyoto chega 1 dia depois.')).toBeTruthy()
  })

  it('no toque: segurar infla e levanta o bloco; soltar na lixeira tira do roteiro', async () => {
    const block = screen.getByRole('button', { name: /^Kyoto, 7 noites/ })
    fireEvent.pointerDown(block, { ...touch, clientX: 5, clientY: 5 })
    expect(block.className).toContain('charging')
    await new Promise((r) => setTimeout(r, 520))
    expect(block.className).toContain('lifted')
    expect(block.className).not.toContain('charging')
    // No jsdom toda caixa mede 0×0, então qualquer ponto perto da origem "está" na lixeira.
    fireEvent.pointerMove(block, { ...touch, clientX: 6, clientY: 5 })
    expect(await screen.findByText(/Soltar aqui tira Kyoto do roteiro/)).toBeTruthy()
    fireEvent.pointerUp(block, { ...touch, clientX: 6, clientY: 5 })
    expect(await screen.findByText(/Kyoto saiu do roteiro/)).toBeTruthy()
    expect(useApp.getState().doc!.itinerary.stops.find((s) => s.id === 's8')!.destinationId).toBeNull()
  })

  it('no mouse: o bloco levanta ao mover 6 px, sem segurar; parado, o clique leva ao cartão', async () => {
    const block = screen.getByRole('button', { name: /^Kyoto, 7 noites/ })
    fireEvent.pointerDown(block, { ...mouse, clientX: 100, clientY: 5 })
    expect(block.className).not.toContain('charging')
    fireEvent.pointerMove(block, { ...mouse, clientX: 103, clientY: 5 })
    expect(block.className).not.toContain('lifted')
    fireEvent.pointerMove(block, { ...mouse, clientX: 112, clientY: 5 })
    expect(block.className).toContain('lifted')
    fireEvent.pointerUp(block, { ...mouse, clientX: 112, clientY: 5 })
    expect(block.className).not.toContain('lifted')

    fireEvent.pointerDown(block, { ...mouse, clientX: 100, clientY: 5 })
    fireEvent.pointerUp(block, { ...mouse, clientX: 101, clientY: 5 })
    expect(await dayCard().findByText('chega em Kyoto')).toBeTruthy()
  })

  it('arrastar uma atividade de um dia para outro muda o dia (mouse)', async () => {
    const gion = kyotoCard().getByRole('button', { name: /Gion/ })
    const rows = document.querySelectorAll<HTMLElement>('#c-s8 [data-dayref]')
    const target = rows[1]!
    // O jsdom não sabe o que há sob o ponteiro: o segundo dia de Kyoto fica "embaixo" do arraste.
    document.elementFromPoint = () => target
    fireEvent.pointerDown(gion, { ...mouse, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(gion, { ...mouse, clientX: 30, clientY: 40 })
    expect(gion.className).toContain('lifted')
    expect(target.className).toContain('drop')
    fireEvent.pointerUp(gion, { ...mouse, clientX: 30, clientY: 40 })
    expect(await screen.findByText('Atividade mudou de dia.')).toBeTruthy()
    expect(within(target).getByRole('button', { name: /Gion/ })).toBeTruthy()
    delete (document as { elementFromPoint?: unknown }).elementFromPoint
  })

  it('tocar num dia da régua mostra o cartão daquele dia (chegada em Kyoto)', async () => {
    expect(dayCard().getByText('chega em Tóquio')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^sáb 13\/04/ }))
    expect(await dayCard().findByText('chega em Kyoto')).toBeTruthy()
    expect(dayCard().getByText('13')).toBeTruthy()
    fireEvent.click(dayCard().getByRole('button', { name: 'Dia seguinte' }))
    expect(await dayCard().findByText('em Kyoto')).toBeTruthy()
    expect(dayCard().getByText(/Hotel em Kyoto/)).toBeTruthy()
  })

  it('no mapa da cidade, mudar o dia muda a cidade (Kyoto → Osaka)', async () => {
    await entrarEmKyoto()
    expect(document.querySelector('.city-t b')!.textContent).toContain('Kyoto')
    const doc = useApp.getState().doc!
    const osaka = doc.destinations.find((d) => d.name === 'Osaka')!
    const day = days(doc.itinerary, doc.places).find((d) => d.kind === 'stop' && d.destinationId === osaka.id)!
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${day.label}`) }))
    await waitFor(() => expect(document.querySelector('.city-t b')!.textContent).toContain('Osaka'))
    expect(dayCard().getByText(/Osaka/)).toBeTruthy()
  })

  it('hospedagem com nome: o painel mostra a reserva, "Tirar" abre a falta e anotar outra carimba', async () => {
    fireEvent.click(screen.getByRole('button', { name: /^dom 14\/04/ }))
    fireEvent.click(await dayCard().findByRole('button', { name: /Hotel em Kyoto/ }))
    let dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Onde vocês dormem em Kyoto?')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tirar' }))
    expect(await screen.findByText('Hospedagem desmarcada.')).toBeTruthy()
    fireEvent.click(await dayCard().findByRole('button', { name: /onde vocês dormem\?/ }))
    dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Nome da hospedagem'), {
      target: { value: 'Ryokan Sakura' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Marcar reservada 済' }))
    await waitFor(() =>
      expect(
        useApp.getState().doc!.bookings.find((b) => b.kind === 'lodging' && b.title === 'Ryokan Sakura'),
      ).toMatchObject({ status: 'booked' }),
    )
    expect(await dayCard().findByText(/Ryokan Sakura 済/)).toBeTruthy()
  })

  it('"Sua viagem" pelo HUD: renomear e trocar quem vai sem fechar; o aviso vai para o topo', async () => {
    fireEvent.click(screen.getByRole('button', { name: `${tripName()}: nome, quem vai e datas` }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Sua viagem')).toBeTruthy()
    const name = within(dialog).getByLabelText('Nome')
    fireEvent.change(name, { target: { value: 'Nossa viagem' } })
    fireEvent.blur(name)
    await waitFor(() => expect(useApp.getState().doc!.meta.name).toBe('Nossa viagem'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    // Com o painel aberto, o aviso aparece no topo, nunca por cima do painel.
    expect(screen.getByRole('status').className).toContain('top')
    const who = within(dialog).getByLabelText('Viajante 1')
    fireEvent.change(who, { target: { value: 'Ana' } })
    fireEvent.blur(who)
    await waitFor(() => expect(useApp.getState().doc!.itinerary.travelers[0]!.name).toBe('Ana'))
    expect(within(dialog).getByLabelText('Ida (primeira noite)')).toBeTruthy()
  })

  it('bate-volta aparece na régua da trilha (Nara no dia 11/04)', () => {
    const day = screen.getByRole('button', { name: /^qui 11\/04, bate-volta: Nara/ })
    expect(day.querySelector('.tr-trip')).toBeTruthy()
  })

  it('tocar numa fase do mapa entra na cidade: dias como fichas, lugares por dia, voltar', async () => {
    await entrarEmKyoto()
    const map = () => within(screen.getByRole('group', { name: 'Lugares no mapa da cidade' }))
    expect(screen.getByText(/7 dias · 7\/8 lugares com dia/)).toBeTruthy()
    const gion = await map().findByRole('button', { name: 'Gion' })
    // Entrar leva o cursor ao primeiro dia de Kyoto (Gion aceso, Kiyomizu-dera esmaecido).
    expect(gion.getAttribute('class')).not.toContain('dim')
    expect(map().getByRole('button', { name: 'Kiyomizu-dera' }).getAttribute('class')).toContain('dim')
    fireEvent.click(screen.getByRole('button', { name: /^Ver o dia dom 14/ }))
    expect(map().getByRole('button', { name: 'Gion' }).getAttribute('class')).toContain('dim')
    expect(map().getByRole('button', { name: 'Kiyomizu-dera' }).getAttribute('class')).not.toContain('dim')
    expect(dayCard().getByText('em Kyoto')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }))
    expect(map().getByRole('button', { name: 'Gion' }).getAttribute('class')).not.toContain('dim')
    fireEvent.click(screen.getByRole('button', { name: '◀ Mapa' }))
    expect(await screen.findByRole('button', { name: 'Kyoto: entrar no mapa da cidade' })).toBeTruthy()
  })

  it('atividade sem lugar: "Marcar no mapa" e um clique no mapa guardam as coordenadas', async () => {
    await novaAtividade('Ginkaku-ji', /Quero/)
    fireEvent.click(await screen.findByRole('button', { name: /^Ginkaku-ji, Quero, sem dia/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByText('Marcar no mapa'))
    tab('Mapa')
    expect((await screen.findAllByText(/Marque no mapa onde fica Ginkaku-ji\./)).length).toBeGreaterThan(0)
    const board = document.querySelector('.board')!
    await waitFor(() => expect(board.className).toContain('placing'))
    fireEvent.click(board, { clientX: 10, clientY: 10 })
    expect(await screen.findByText('Lugar marcado no mapa.')).toBeTruthy()
    const p = useApp.getState().doc!.places.find((x) => x.name === 'Ginkaku-ji')!
    expect(typeof p.lat).toBe('number')
    expect(await screen.findByRole('button', { name: 'Ginkaku-ji, sem dia' })).toBeTruthy()
  })

  it('"+ Adicionar destino" põe um lugar antes da volta, escolhendo de onde saem as noites', async () => {
    const before = useApp.getState().doc!.itinerary.stops.length
    fireEvent.click(screen.getByRole('button', { name: /Mais um lugar antes da volta/ }))
    let dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Que destino entra no fim da viagem?')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: /Nara/ }))
    dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Nara no fim')).toBeTruthy()
    fireEvent.click(within(dialog).getAllByText(/^Tirar de Tóquio/)[0]!)
    expect(await screen.findByText(/Nara entrou no roteiro\./)).toBeTruthy()
    expect(useApp.getState().doc!.itinerary.stops.length).toBe(before + 1)
  })

  it('modo dia/noite: o botão alterna claro ↔ escuro a partir do que está na tela e fica lembrado', () => {
    const root = document.documentElement
    fireEvent.click(screen.getByRole('button', { name: 'Mudar para o modo escuro' }))
    expect(root.dataset.theme).toBe('dark')
    expect(localStorage.getItem('ludotrip.theme')).toBe('dark')
    expect(screen.queryByRole('button', { name: 'Mudar para o modo escuro' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mudar para o modo claro' }))
    expect(root.dataset.theme).toBe('light')
    expect(localStorage.getItem('ludotrip.theme')).toBe('light')
    fireEvent.click(screen.getByRole('button', { name: 'Mudar para o modo escuro' }))
    expect(root.dataset.theme).toBe('dark')
    useApp.getState().setTheme('auto')
  })

  it('"Como jogar": três passos com holofote; aparece uma vez e o "?" mostra de novo', async () => {
    expect(screen.queryByRole('dialog', { name: 'Como jogar' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Como jogar' }))
    const tut = await screen.findByRole('dialog', { name: 'Como jogar' })
    expect(within(tut).getByText('O mapa da viagem')).toBeTruthy()
    fireEvent.click(within(tut).getByText('Próximo'))
    expect(within(tut).getByText('A trilha dos dias')).toBeTruthy()
    fireEvent.click(within(tut).getByText('Próximo'))
    expect(within(tut).getByText('O cartão do dia')).toBeTruthy()
    fireEvent.click(within(tut).getByText('Começar'))
    expect(screen.queryByRole('dialog', { name: 'Como jogar' })).toBeNull()
    expect(localStorage.getItem('ludotrip.tutorial')).toBe('1')
  })

  it('suas viagens: apagar avisa com Desfazer, abrir um exemplo de novo não duplica, renomear', async () => {
    const name = tripName()
    fireEvent.click(screen.getByRole('button', { name: 'Suas viagens' }))
    expect(await screen.findByText('Suas viagens')).toBeTruthy()
    expect(tripNames()).toEqual([name])
    fireEvent.click(screen.getByRole('button', { name: `Mais opções de ${name}` }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Apagar' }))
    expect(await screen.findByText(`${name} apagada.`)).toBeTruthy()
    await waitFor(() => expect(tripNames()).toEqual([]))
    fireEvent.click(within(screen.getByRole('status')).getByText('Desfazer'))
    await waitFor(() => expect(tripNames()).toEqual([name]))

    // Abrir o exemplo de novo reaproveita a cópia que já existe.
    fireEvent.click(screen.getByText('Japão de trem'))
    await screen.findByText('FALTAM', { selector: '.map-head .lbl' })
    fireEvent.click(screen.getByRole('button', { name: 'Suas viagens' }))
    await screen.findByText('Suas viagens')
    expect(tripNames()).toEqual([name])

    fireEvent.click(screen.getByRole('button', { name: `Mais opções de ${name}` }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Renomear' }))
    const input = screen.getByLabelText('Nome da viagem')
    fireEvent.change(input, { target: { value: 'Lua de mel' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(tripNames()).toEqual(['Lua de mel']))
  })
})
