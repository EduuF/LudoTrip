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
  localStorage.removeItem('ludotrip.hint.trilha')
  useApp.setState({
    ready: false,
    screen: 'home',
    doc: null,
    undoStack: [],
    toast: null,
    sheet: null,
    cursorDay: null,
    openStop: null,
    stopCollapsed: false,
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
/** O roteiro é um acordeão: abre o cartão de Kyoto (se ainda não estiver aberto). */
const abrirKyoto = () => {
  const b = screen.queryByRole('button', { name: 'Kyoto: abrir os dias' })
  if (b) fireEvent.click(b)
}

/** Os dias do cartão de Kyoto (sem o catálogo, onde as atividades também aparecem). */
const kyotoDays = () => within(document.querySelector<HTMLElement>('#c-s8 .days')!)
/** O catálogo de atividades do cartão de Kyoto. */
const kyotoCatalog = () => within(document.querySelector<HTMLElement>('#c-s8 .loose-row')!)

/** Preenche o painel "Nova atividade" aberto: nome, prioridade e "Criar atividade". */
async function preencherAtividade(name: string, rarity: RegExp) {
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Nome da atividade'), { target: { value: name } })
  fireEvent.click(
    within(within(dialog).getByRole('group', { name: 'Prioridade' })).getByRole('button', { name: rarity }),
  )
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
  it('abre na tela do Mapa com o HUD de uma linha; abas Mapa · Atividades · Tarefas', () => {
    for (const t of ['Mapa', 'Atividades', 'Tarefas']) expect(nav().getByText(t)).toBeTruthy()
    expect(nav().queryByText('Mochila')).toBeNull()
    expect(screen.getByRole('region', { name: 'Mapa da viagem' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Trilha da viagem' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Dia escolhido' })).toBeTruthy()
    // O resumo da viagem fica no cabeçalho da trilha; o nível fica na contagem do mapa.
    expect(document.querySelector('.tr-month')!.textContent).toMatch(/23 noites · 6 destinos/)
    expect(document.querySelector('.map-head .level')!.textContent).toMatch(/NÍVEL \d/)
    // HUD: voltar, nome, tema, Desfazer e o menu "Mais"; sem contagem nem XP duplicados.
    expect(document.querySelectorAll('.hud button').length).toBe(5)
    expect(document.querySelector('.hud')!.textContent).not.toMatch(/FALTAM|XP/)
    // Só um "+ Adicionar destino" no roteiro (o cartão do fim).
    expect(screen.getAllByRole('button', { name: /Adicionar destino/ }).length).toBe(3)
    // Nada de "figurinha", "colar" ou "noites incertas" na tela.
    expect(document.body.textContent).not.toMatch(/figurinha|colar|incerta/i)
  })

  it('roteiro em acordeão: o destino do dia escolhido fica aberto; abrir outro fecha o primeiro', async () => {
    // Dia 1: o primeiro Tóquio aberto, Kyoto fechado (uma linha com o resumo).
    expect(screen.getByRole('button', { name: 'Tóquio: fechar os dias' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Noites em Kyoto' })).toBeNull()
    expect(kyotoCard().getByRole('button', { name: 'Kyoto: abrir os dias' }).textContent).toMatch(
      /7 noites · \d+ atividades · hospedagem ok/,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Kyoto: abrir os dias' }))
    expect(screen.getByRole('group', { name: 'Noites em Kyoto' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Tóquio: fechar os dias' })).toBeNull()
    // Abrir leva o cursor ao primeiro dia de Kyoto.
    expect(await dayCard().findByText('chega em Kyoto')).toBeTruthy()
    // Fechar o aberto deixa tudo fechado; tocar num dia da régua abre o destino daquele dia.
    fireEvent.click(screen.getByRole('button', { name: 'Kyoto: fechar os dias' }))
    expect(screen.queryByRole('group', { name: 'Noites em Kyoto' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^sex 05\/04/ }))
    expect(await screen.findByRole('button', { name: 'Tóquio: fechar os dias' })).toBeTruthy()
  })

  it('passagem: marcar e desmarcar no mesmo lugar, com Desfazer', async () => {
    const buy = screen.getAllByRole('button', { name: /Passagem: falta comprar/ })[0]!
    fireEvent.click(buy)
    expect(await screen.findByText('Passagem comprada 済.')).toBeTruthy()
    const on = screen.getAllByRole('button', { name: /Passagem comprada/ })
    expect(on.length).toBeGreaterThanOrEqual(3)
    // "Comprada" parece selo: abre um painel curto em vez de desmarcar num toque.
    fireEvent.click(on[0]!)
    fireEvent.click(within(await screen.findByRole('dialog')).getByText('Desmarcar a compra'))
    expect(await screen.findByText('Passagem desmarcada.')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('status')).getByText('Desfazer'))
    await waitFor(() => expect(useApp.getState().toast?.text).toMatch(/^Desfeito/))
  })

  it('"Editar trecho" é uma linha tocável; trocar o meio não fecha o painel', async () => {
    fireEvent.click(screen.getByRole('button', { name: /São Paulo → Tóquio: editar trecho/ }))
    const dialog = await screen.findByRole('dialog')
    const group = within(within(dialog).getByRole('group', { name: 'Como vão' }))
    fireEvent.click(group.getByRole('button', { name: /trem/i }))
    expect(await screen.findByText(/trem/i, { selector: '.toast p, .toast' })).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(group.getByRole('button', { name: /trem/i }).getAttribute('aria-pressed')).toBe('true')
    // Painéis-editores ficam abertos: atividade (prioridade) e visita (turno) também.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    abrirKyoto()
    fireEvent.click(kyotoDays().getByRole('button', { name: /Gion/ }))
    const visit = await screen.findByRole('dialog')
    fireEvent.click(within(visit).getByRole('button', { name: 'tarde' }))
    await waitFor(() =>
      expect(within(visit).getByRole('button', { name: 'tarde' }).getAttribute('aria-pressed')).toBe('true'),
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(within(visit).getByRole('button', { name: /^Sobre a atividade/ }))
    const sticker = await screen.findByRole('dialog')
    fireEvent.click(
      within(within(sticker).getByRole('group', { name: 'Prioridade' })).getByRole('button', {
        name: /Se der/,
      }),
    )
    await waitFor(() =>
      expect(
        within(within(sticker).getByRole('group', { name: 'Prioridade' }))
          .getByRole('button', { name: /Se der/ })
          .getAttribute('aria-pressed'),
      ).toBe('true'),
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('nova atividade: escolhe a prioridade e conclui com "Criar atividade" (desligado sem nome)', async () => {
    tab('Atividades')
    fireEvent.click(screen.getByRole('button', { name: 'Nova atividade em Kyoto' }))
    const dialog = await screen.findByRole('dialog')
    const create = within(dialog).getByRole('button', { name: 'Criar atividade' })
    expect(create).toHaveProperty('disabled', true)
    expect(within(dialog).getByRole('button', { name: /Quero/ }).getAttribute('aria-pressed')).toBe('true')
    await preencherAtividade('Ginkaku-ji', /Imperdível/)
    const card = screen.getByRole('button', { name: /^Ginkaku-ji, Imperdível, sem dia/ })
    expect(card.className).toContain('r-must')
  })

  it('"+ Atividade" num dia do roteiro cria a atividade já naquele dia ("+" discreto nos dias com atividades)', async () => {
    abrirKyoto()
    expect(kyotoCard().queryByRole('button', { name: '+ Atividade' })).toBeNull()
    fireEvent.click(kyotoCard().getByRole('button', { name: 'Atividade em sáb 13/04' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Nova atividade em Kyoto')).toBeTruthy()
    expect(within(dialog).getByText(/Entra em sáb 13\/04/)).toBeTruthy()
    await preencherAtividade('Ginkaku-ji', /Quero/)
    expect(kyotoDays().getByRole('button', { name: /Ginkaku-ji/ })).toBeTruthy()
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

    fireEvent.click(screen.getByRole('button', { name: '+ Atividade aqui' }))
    await waitFor(() => expect(board.className).toContain('placing'))
    fireEvent.click(screen.getByRole('button', { name: 'Não adicionar' }))
    await waitFor(() => expect(board.className).not.toContain('placing'))
    fireEvent.click(board, { clientX: 10, clientY: 10 })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('volta marcada: "+" pergunta de onde sai a noite, com prévia', async () => {
    abrirKyoto()
    const kyoto = screen.getByRole('group', { name: 'Noites em Kyoto' })
    fireEvent.click(within(kyoto).getByRole('button', { name: 'Mais' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('De onde sai essa noite?')).toBeTruthy()
    fireEvent.click(within(dialog).getByText(/^Tirar de Osaka/))
    expect(await screen.findByText(/Kyoto: 8 noites\. Shinsekai e Kuromon ficaram sem dia\./)).toBeTruthy()
  })

  it('tocar num destino da trilha abre o cartão dele e leva ao primeiro dia; "⋯" tem as ações raras', async () => {
    const block = screen.getByRole('button', { name: /^Kyoto, 7 noites/ })
    fireEvent.pointerDown(block, { ...touch, clientX: 5, clientY: 5 })
    fireEvent.pointerUp(block, { ...touch, clientX: 5, clientY: 5 })
    expect(await dayCard().findByText('chega em Kyoto')).toBeTruthy()
    await waitFor(() => expect(document.getElementById('c-s8')!.className).toContain('flash'))
    expect(screen.getByRole('button', { name: 'Kyoto: fechar os dias' })).toBeTruthy()
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

  it('no mouse: o bloco levanta ao mover 6 px, sem segurar; a dica some depois do primeiro arraste', async () => {
    expect(screen.getByText(/◂▸ muda as noites/)).toBeTruthy()
    const block = screen.getByRole('button', { name: /^Kyoto, 7 noites/ })
    fireEvent.pointerDown(block, { ...mouse, clientX: 100, clientY: 5 })
    expect(block.className).not.toContain('charging')
    fireEvent.pointerMove(block, { ...mouse, clientX: 103, clientY: 5 })
    expect(block.className).not.toContain('lifted')
    fireEvent.pointerMove(block, { ...mouse, clientX: 112, clientY: 5 })
    expect(block.className).toContain('lifted')
    fireEvent.pointerUp(block, { ...mouse, clientX: 112, clientY: 5 })
    expect(block.className).not.toContain('lifted')
    expect(screen.queryByText(/◂▸ muda as noites/)).toBeNull()
    expect(localStorage.getItem('ludotrip.hint.trilha')).toBe('1')

    fireEvent.pointerDown(block, { ...mouse, clientX: 100, clientY: 5 })
    fireEvent.pointerUp(block, { ...mouse, clientX: 101, clientY: 5 })
    expect(await dayCard().findByText('chega em Kyoto')).toBeTruthy()
    // "Como jogar" traz a dica de volta.
    fireEvent.click(screen.getByRole('button', { name: 'Mais opções' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Como jogar' }))
    expect(await screen.findByText(/◂▸ muda as noites/)).toBeTruthy()
  })

  it('a prateleira mostra só os destinos guardados (Nara, bate-volta), não os que já estão na trilha', () => {
    const shelf = within(screen.getByLabelText('Destinos guardados: arraste para a trilha'))
    expect(shelf.getByRole('button', { name: /^Nara:/ })).toBeTruthy()
    expect(shelf.queryByRole('button', { name: /^Kyoto:/ })).toBeNull()
    expect(shelf.getByRole('button', { name: '+ Adicionar destino' })).toBeTruthy()
  })

  it('arrastar uma atividade de um dia para outro muda o dia (mouse)', async () => {
    abrirKyoto()
    const gion = kyotoDays().getByRole('button', { name: /Gion/ })
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

  it('catálogo: uma atividade com dia continua no catálogo e arrastar põe em mais um dia; o mesmo dia só avisa', async () => {
    abrirKyoto()
    // Gion já está em sáb 13/04 e continua no catálogo, com o dia; Sanjūsangen-dō (sem dia) vem primeiro.
    const chips = kyotoCatalog().getAllByRole('button')
    expect(chips[0]!.getAttribute('aria-label')).toMatch(/^Sanjūsangen-dō, sem dia/)
    const gion = kyotoCatalog().getByRole('button', { name: /^Gion, em sáb 13\/04/ })
    const rows = document.querySelectorAll<HTMLElement>('#c-s8 [data-dayref]')
    document.elementFromPoint = () => rows[1]!
    fireEvent.pointerDown(gion, { ...mouse, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(gion, { ...mouse, clientX: 30, clientY: 40 })
    fireEvent.pointerUp(gion, { ...mouse, clientX: 30, clientY: 40 })
    expect(await screen.findByText('Gion marcada no dia.')).toBeTruthy()
    expect(within(rows[0]!).getByRole('button', { name: /Gion/ })).toBeTruthy()
    expect(within(rows[1]!).getByRole('button', { name: /Gion/ })).toBeTruthy()
    expect(kyotoCatalog().getByRole('button', { name: /^Gion, em 2 dias/ })).toBeTruthy()
    // De novo no mesmo dia: só o aviso, nada duplica.
    const again = kyotoCatalog().getByRole('button', { name: /^Gion/ })
    fireEvent.pointerDown(again, { ...mouse, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(again, { ...mouse, clientX: 30, clientY: 40 })
    fireEvent.pointerUp(again, { ...mouse, clientX: 30, clientY: 40 })
    expect(await screen.findByText('Gion já está em dom 14/04.')).toBeTruthy()
    expect(within(rows[1]!).getAllByRole('button', { name: /Gion/ }).length).toBe(1)
    delete (document as { elementFromPoint?: unknown }).elementFromPoint
  })

  it('anotações são de cada dia: salvar, "✎" na ficha, o outro dia limpo e "Copiar de"', async () => {
    abrirKyoto()
    fireEvent.click(kyotoDays().getByRole('button', { name: /Gion/ }))
    let dialog = await screen.findByRole('dialog')
    const box = within(dialog).getByLabelText(/Anotações deste dia/)
    fireEvent.change(box, { target: { value: 'Ir no fim da tarde' } })
    fireEvent.blur(box)
    expect(await screen.findByText('Anotação do dia salva.')).toBeTruthy()
    // Fica aberto (é um editor) e a ficha mostra "✎".
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(kyotoDays().getByRole('button', { name: /Gion.*com anotações/ })).toBeTruthy()
    // Repetir em outro dia: o dia em que já está vem desligado; o novo começa limpo.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Repetir em outro dia' }))
    dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /^sáb 13\/04: já está aqui/ })).toHaveProperty(
      'disabled',
      true,
    )
    fireEvent.click(within(dialog).getByRole('button', { name: /^seg 15\/04/ }))
    expect(await screen.findByText('Gion marcada no dia.')).toBeTruthy()
    const second = within(document.querySelectorAll<HTMLElement>('#c-s8 [data-dayref]')[2]!)
    fireEvent.click(second.getByRole('button', { name: /Gion/ }))
    dialog = await screen.findByRole('dialog')
    expect((within(dialog).getByLabelText(/Anotações deste dia/) as HTMLTextAreaElement).value).toBe('')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copiar de sáb 13/04' }))
    await waitFor(() =>
      expect((within(dialog).getByLabelText(/Anotações deste dia/) as HTMLTextAreaElement).value).toBe(
        'Ir no fim da tarde',
      ),
    )
  })

  it('horário do dia: a ficha mostra a hora; "Sobre a atividade" guarda as anotações gerais', async () => {
    abrirKyoto()
    fireEvent.click(kyotoDays().getByRole('button', { name: /Gion/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Horário (opcional)'), { target: { value: '18:30' } })
    expect(await screen.findByText('Horário salvo.')).toBeTruthy()
    expect(kyotoDays().getByRole('button', { name: /Gion/ }).textContent).toMatch(/18:30/)
    fireEvent.click(within(dialog).getByRole('button', { name: /^Sobre a atividade/ }))
    const about = await screen.findByRole('dialog')
    const box = within(about).getByLabelText(/Anotações gerais/)
    fireEvent.change(box, { target: { value: 'Gueixas perto de Hanamikoji' } })
    fireEvent.blur(box)
    expect(await screen.findByText('Anotação geral salva.')).toBeTruthy()
    expect(useApp.getState().doc!.places.find((x) => x.name === 'Gion')!.note).toBe(
      'Gueixas perto de Hanamikoji',
    )
    // O dia aparece na lista e abre o painel daquele dia, que mostra a anotação geral.
    fireEvent.click(within(about).getByRole('button', { name: /^sáb 13\/04 · 18:30/ }))
    expect(await screen.findByText('Gueixas perto de Hanamikoji')).toBeTruthy()
  })

  it('"Onde X entra?": linha do tempo com a sugestão no caminho; a fresta abre as noites', async () => {
    fireEvent.click(screen.getAllByRole('button', { name: /Adicionar destino/ })[0]!)
    let dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Nara/ }))
    dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByText(/^Entre /)).toBeNull()
    expect(within(dialog).getByText(/No caminho/).textContent).toMatch(/Osaka/)
    // Kyoto (7 noites) aceita "no meio"; a fresta atual fica marcada.
    expect(within(dialog).getByRole('button', { name: 'Kyoto: no meio' })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pôr aqui' }))
    dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/^Nara entre .*Osaka/)).toBeTruthy()
  })

  it('pôr em qual dia: os destinos em acordeão, só o preferido aberto', async () => {
    abrirKyoto()
    fireEvent.click(kyotoCatalog().getByRole('button', { name: /^Sanjūsangen-dō/ }))
    let dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pôr num dia' }))
    dialog = await screen.findByRole('dialog')
    const kyoto = within(dialog).getByRole('button', { name: /^Kyoto/ })
    expect(kyoto.getAttribute('aria-expanded')).toBe('true')
    const osaka = within(dialog).getByRole('button', { name: /^Osaka/ })
    expect(osaka.getAttribute('aria-expanded')).toBe('false')
    // 7 dias de Kyoto à vista (e nenhum de Osaka).
    expect(within(dialog).getAllByRole('button', { name: /^(sáb|dom|seg|ter|qua|qui|sex) \d/ }).length).toBe(
      7,
    )
    fireEvent.click(within(dialog).getByRole('button', { name: /^ter 16\/04/ }))
    expect(await screen.findByText('Sanjūsangen-dō marcada no dia.')).toBeTruthy()
    // Escolher o dia é um passo de "Sobre a atividade": o painel dela volta, com o dia na lista.
    expect(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /^ter 16\/04/ }),
    ).toBeTruthy()
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
    const day = days(doc.itinerary, doc.places).find(
      (d) => d.kind === 'stop' && d.destinationId === osaka.id,
    )!
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${day.label}`) }))
    await waitFor(() => expect(document.querySelector('.city-t b')!.textContent).toContain('Osaka'))
    expect(dayCard().getByText(/Osaka/)).toBeTruthy()
  })

  it('hospedagem com nome: o painel mostra a reserva, "Tirar" abre a falta (sem fechar) e anotar outra carimba', async () => {
    fireEvent.click(screen.getByRole('button', { name: /^dom 14\/04/ }))
    fireEvent.click(await dayCard().findByRole('button', { name: /Hotel em Kyoto/ }))
    let dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Onde vocês dormem em Kyoto?')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tirar' }))
    expect(await screen.findByText('Hospedagem desmarcada.')).toBeTruthy()
    // O painel continua aberto, já pedindo o nome da hospedagem que falta.
    dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Nome da hospedagem'), {
      target: { value: 'Ryokan Sakura' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Marcar reservada' }))
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
    // "Marcar no mapa" já leva à aba Mapa (M3.5).
    fireEvent.click(within(dialog).getByText('Marcar no mapa'))
    expect((await screen.findAllByText(/Marque no mapa onde fica Ginkaku-ji\./)).length).toBeGreaterThan(0)
    const board = document.querySelector('.board')!
    await waitFor(() => expect(board.className).toContain('placing'))
    fireEvent.click(board, { clientX: 10, clientY: 10 })
    expect(await screen.findByText('Lugar marcado no mapa.')).toBeTruthy()
    // Volta ao painel da atividade, agora com "Ver no mapa da cidade".
    const back = within(await screen.findByRole('dialog'))
    expect(back.getByText('Ginkaku-ji')).toBeTruthy()
    expect(back.getByText('Ver no mapa da cidade')).toBeTruthy()
    fireEvent.click(back.getByRole('button', { name: 'Fechar' }))
    const p = useApp.getState().doc!.places.find((x) => x.name === 'Ginkaku-ji')!
    expect(typeof p.lat).toBe('number')
    expect(await screen.findByRole('button', { name: 'Ginkaku-ji, sem dia' })).toBeTruthy()
  })

  it('"+ Adicionar destino" (cartão do fim) escolhe onde entra na linha do tempo e de onde saem as noites', async () => {
    const before = useApp.getState().doc!.itinerary.stops.length
    fireEvent.click(screen.getByRole('button', { name: /Mais um lugar na viagem/ }))
    let dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Que destino entra na viagem?')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: /Nara/ }))
    dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pôr no fim da viagem' }))
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

  it('"Como jogar" (no menu "Mais"): três passos com holofote; aparece uma vez e dá para rever', async () => {
    expect(screen.queryByRole('dialog', { name: 'Como jogar' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mais opções' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Como jogar' }))
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
    // Segundo toque para apagar (M3.5): o primeiro só pede confirmação.
    fireEvent.click(screen.getByRole('menuitem', { name: 'Apagar' }))
    expect(useApp.getState().trips.length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Toque de novo para apagar' }))
    expect(await screen.findByText(`${name} apagada.`)).toBeTruthy()
    await waitFor(() => expect(tripNames()).toEqual([]))
    fireEvent.click(within(screen.getByRole('status')).getByText('Desfazer'))
    await waitFor(() => expect(tripNames()).toEqual([name]))

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
