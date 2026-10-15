import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'

// Colaboração de verdade, ponta a ponta (spec publicação §8 M5): Worker + D1 + TripRoom locais, três
// pessoas em três aparelhos. A Ana chama a Bia para planejar junto (e viajar) e o Caio para só ver;
// as duas editam ao mesmo tempo, uma sem internet; a Ana tira o Caio; apaga para todos e recupera.

const run = Date.now().toString(36)
const ANA = { uid: `ana-${run}`, name: 'Ana' }
const BIA = { uid: `bia-${run}`, name: 'Bia' }
const CAIO = { uid: `caio-${run}`, name: 'Caio' }

/** Um aparelho. `logado`: já entra com a conta; `google`: quem entra pelo "Continuar com Google". */
async function aparelho(browser: Browser, opts: { logado?: typeof ANA; google?: typeof ANA }): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    isMobile: true,
    hasTouch: true,
  })
  const page = await ctx.newPage()
  await page.route('https://tiles.openfreemap.org/**', (r) => r.abort())
  await page.route('https://photon.komoot.io/**', (r) => r.abort())
  await page.addInitScript((o) => {
    localStorage.setItem('ludotrip.tutorial', '1')
    if (o.logado && !localStorage.getItem('ludotrip.testAuth'))
      localStorage.setItem(
        'ludotrip.testAuth',
        JSON.stringify({ ...o.logado, email: `${o.logado.uid}@teste.invalid`, picture: null }),
      )
    if (o.google) localStorage.setItem('ludotrip.testAuthNext', JSON.stringify(o.google))
  }, opts)
  return page
}

const salvo = (page: Page) => page.getByRole('button', { name: 'Tudo salvo na sua conta.' })
const painel = (page: Page) => page.getByRole('dialog')

async function criarViagem(page: Page, nome: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Criar viagem' }).click()
  await page.getByPlaceholder(/Busque: Japão/).fill('romen')
  await page.getByRole('button', { name: /^Romênia/ }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Ainda não sei: decido no mapa' }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Criar viagem' }).click()
  await expect(page.getByText('VIAGEM CRIADA!')).toBeVisible()
  await page.locator('.hud-name').click()
  const campo = page.getByLabel('Nome', { exact: true })
  await campo.fill(nome)
  await campo.blur()
  await page.getByRole('button', { name: 'Pronto ✓' }).click()
  await expect(page.locator('.hud-name')).toHaveText(nome)
  await expect(salvo(page)).toBeVisible()
}

/** CONVIDAR em 3 toques; devolve o link. */
async function convidar(page: Page, papel: 'Planejar junto' | 'Só ver', viaja: boolean): Promise<string> {
  await page.getByRole('button', { name: 'Chamar alguém' }).click()
  await painel(page)
    .getByRole('button', { name: new RegExp(`^${papel}`) })
    .click()
  await painel(page)
    .getByRole('button', { name: viaja ? /^Sim, vai/ : /^Não, só ajuda/ })
    .click()
  const link = (await painel(page).getByLabel('Link do convite').textContent())!.trim()
  expect(link).toMatch(/\/convite\/[A-Za-z0-9_-]{22}$/)
  await painel(page).getByRole('button', { name: 'Pronto ✓' }).click()
  await painel(page).getByRole('button', { name: 'Pronto ✓' }).click()
  return new URL(link).pathname
}

test('três pessoas: convidar, aceitar, editar juntas (uma offline), só ver, tirar, apagar e recuperar', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const ana = await aparelho(browser, { logado: ANA })
  await criarViagem(ana, 'Viagem do grupo')
  const paraBia = await convidar(ana, 'Planejar junto', true)
  const paraCaio = await convidar(ana, 'Só ver', false)

  // Bia já tem conta neste aparelho: a prévia, "Participar como Bia", e cai direto na viagem.
  const bia = await aparelho(browser, { logado: BIA })
  await bia.goto(paraBia)
  await expect(bia.getByText('te chamou para planejar junto')).toBeVisible()
  await expect(bia.getByRole('heading', { name: 'Viagem do grupo' })).toBeVisible()
  await bia.getByRole('button', { name: 'Participar como Bia' }).click()
  await expect(bia.locator('.hud-name')).toHaveText('Viagem do grupo')
  await expect(salvo(bia)).toBeVisible()
  await expect(ana.getByText('Bia entrou na viagem 🎉')).toBeVisible()
  await expect(ana.getByRole('button', { name: /^Pessoas: .*Bia/ })).toBeVisible()

  // Caio não tem conta: a prévia sem conta, ENTRAR, e depois do login cai na viagem, só vendo.
  const caio = await aparelho(browser, { google: CAIO })
  await caio.goto(paraCaio)
  await expect(caio.getByText('te chamou para acompanhar')).toBeVisible()
  await caio.getByRole('button', { name: 'Entrar e participar' }).click()
  await painel(caio).getByRole('button', { name: 'Continuar com Google' }).click()
  await expect(caio.locator('.hud-name')).toHaveText('Viagem do grupo')
  await expect(caio.getByRole('button', { name: '👁 Você está vendo' })).toBeVisible()
  await expect(caio.getByRole('button', { name: '↶ Desfazer' })).toHaveCount(0)
  await expect(caio.getByRole('button', { name: '+ Adicionar destino' })).toHaveCount(0)

  // O "Convidado" virou a Bia, para todo mundo.
  await ana.getByRole('button', { name: /^Pessoas:/ }).click()
  await expect(painel(ana).locator('.traveler-name', { hasText: 'Bia' })).toBeVisible()
  await painel(ana).getByRole('button', { name: 'Pronto ✓' }).click()

  // Ao mesmo tempo: a Bia, sem internet, renomeia; a Ana chama mais um viajante. Tudo converge.
  await bia.context().setOffline(true)
  await bia.locator('.hud-name').click()
  await bia.getByLabel('Nome', { exact: true }).fill('Grupo na Romênia')
  await bia.getByLabel('Nome', { exact: true }).blur()
  await painel(bia).getByRole('button', { name: 'Pronto ✓' }).click()
  await expect(salvo(bia)).toHaveCount(0)
  await ana.getByRole('button', { name: /^Pessoas:/ }).click()
  await painel(ana).getByRole('button', { name: '+ Mais uma pessoa' }).click()
  await painel(ana).getByRole('button', { name: 'Pronto ✓' }).click()
  await expect(salvo(ana)).toBeVisible()
  await bia.context().setOffline(false)
  await expect(salvo(bia)).toBeVisible({ timeout: 30_000 })
  for (const p of [ana, bia, caio]) await expect(p.locator('.hud-name')).toHaveText('Grupo na Romênia')
  await bia.getByRole('button', { name: /^Pessoas:/ }).click()
  await expect(painel(bia).getByRole('textbox', { name: 'Viajante 4' })).toBeVisible()
  await painel(bia).getByRole('button', { name: 'Pronto ✓' }).click()

  // A Ana tira o Caio: a viagem some para ele, com o aviso.
  await ana.getByRole('button', { name: /^Pessoas:/ }).click()
  await painel(ana).getByRole('button', { name: /^Caio/ }).click()
  await painel(ana).getByRole('button', { name: 'Tirar da viagem…' }).click()
  await painel(ana).getByRole('button', { name: 'Tirar Caio' }).click()
  await expect(caio.getByText('Você não faz mais parte de Grupo na Romênia.')).toBeVisible()
  await expect(caio.locator('.trip-open', { hasText: 'Grupo na Romênia' })).toHaveCount(0)

  // Apagar para todos (com o painel de confirmação) e recuperar de "Apagadas".
  await painel(ana).getByRole('button', { name: 'Pronto ✓' }).click()
  await ana.getByRole('button', { name: 'Suas viagens' }).click()
  await ana.getByRole('button', { name: 'Mais opções de Grupo na Romênia' }).click()
  await ana.getByRole('menuitem', { name: 'Apagar' }).click()
  await painel(ana).getByRole('button', { name: 'Apagar Grupo na Romênia para todos' }).click()
  await expect(bia.getByText('Ana apagou Grupo na Romênia.')).toBeVisible()
  await expect(ana.getByRole('heading', { name: /^Apagadas/ })).toBeVisible()
  await ana.locator('.trip-card.deleted').getByRole('button', { name: 'Recuperar' }).click()
  await expect(ana.locator('.trip-open', { hasText: 'Grupo na Romênia' })).toBeVisible()
  await bia.reload()
  await expect(bia.locator('.trip-open', { hasText: 'Grupo na Romênia' })).toBeVisible()
})
