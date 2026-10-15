import { expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'

// A nuvem de verdade, ponta a ponta (spec publicação §7): Worker + D1 + TripRoom rodando local
// (wrangler dev), com o login de teste. Dois aparelhos, sem internet e de volta.

async function abrir(browser: Browser, conta: string | null): Promise<Page> {
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
  await page.addInitScript((who) => {
    localStorage.setItem('ludotrip.tutorial', '1')
    if (who && !localStorage.getItem('ludotrip.testAuth'))
      localStorage.setItem(
        'ludotrip.testAuth',
        JSON.stringify({ uid: who, name: 'Ana', email: `${who}@teste.invalid`, picture: null }),
      )
  }, conta)
  await page.goto('/')
  return page
}

async function criarViagem(page: Page, nome: string) {
  await page.getByRole('button', { name: 'Criar viagem' }).click()
  await page.getByPlaceholder(/Busque: Japão/).fill('romen')
  await page.getByRole('button', { name: /^Romênia/ }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Ainda não sei: decido no mapa' }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Criar viagem' }).click()
  await expect(page.getByText('VIAGEM CRIADA!')).toBeVisible()
  await renomear(page, nome)
}

async function renomear(page: Page, nome: string) {
  await page.locator('.hud-name').click()
  const campo = page.getByLabel('Nome', { exact: true })
  await campo.fill(nome)
  await campo.blur()
  await page.getByRole('button', { name: 'Pronto ✓' }).click()
  await expect(page.locator('.hud-name')).toHaveText(nome)
}

const salvo = (page: Page) => page.getByRole('button', { name: 'Tudo salvo na sua conta.' })

test('sem conta → criar → "Guardar na nuvem" → entrar: a viagem sobe e continua aberta', async ({
  browser,
}) => {
  const page = await abrir(browser, null)
  await criarViagem(page, 'Romênia sem conta')
  await expect(salvo(page)).toHaveCount(0)
  // O "☁️ Salvar" fica no topo da viagem, à vista.
  await page.getByRole('button', { name: 'Salvar na nuvem: esta viagem está só neste aparelho' }).click()
  await page.getByRole('button', { name: 'Guardar na nuvem' }).click()
  await expect(page.getByText('Entrar para guardar na nuvem')).toBeVisible()
  await page.getByRole('button', { name: 'Continuar com Google' }).click()
  await expect(salvo(page)).toBeVisible()
  await expect(page.locator('.hud-name')).toHaveText('Romênia sem conta')
  await expect(page).toHaveURL(/\/v\//)
})

test('dois aparelhos da mesma conta: o que um muda aparece no outro; sem internet, guarda e envia depois', async ({
  browser,
}) => {
  const a = await abrir(browser, 'bia')
  await criarViagem(a, 'Viagem da Bia')
  await expect(salvo(a)).toBeVisible()
  const url = a.url()

  const b = await abrir(browser, 'bia')
  await b.locator('.trip-open', { hasText: 'Viagem da Bia' }).click()
  await expect(salvo(b)).toBeVisible()
  expect(b.url()).toBe(url)

  // A muda; B vê, com aviso.
  await renomear(a, 'Romênia 2030')
  await expect(b.locator('.hud-name')).toHaveText('Romênia 2030')
  await expect(b.getByRole('status')).toContainText('Noutro aparelho')

  // A fica sem internet, muda, e o ícone avisa; ao voltar, a mudança chega em B.
  await a.context().setOffline(true)
  await a.evaluate(() => window.dispatchEvent(new Event('offline')))
  await renomear(a, 'Feito sem internet')
  await expect(a.getByRole('button', { name: /Sem internet · 1 alteração guardada/ })).toBeVisible()
  await a.context().setOffline(false)
  await a.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(salvo(a)).toBeVisible()
  await expect(b.locator('.hud-name')).toHaveText('Feito sem internet')

  // Recarregar dentro da viagem volta à viagem (endereço /v/<id>).
  await b.reload()
  await expect(b.locator('.hud-name')).toHaveText('Feito sem internet')
})
