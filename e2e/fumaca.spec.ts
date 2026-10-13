import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// Jornadas principais no celular (375 × 812): abrir um exemplo, entrar na cidade, andar pelos dias,
// "Ver a viagem" e criar uma viagem com um país. Sem rede externa: modo papel e lista própria.

test.beforeEach(async ({ page }) => {
  await page.route('https://tiles.openfreemap.org/**', (r) => r.abort())
  await page.route('https://photon.komoot.io/**', (r) => r.abort())
  await page.addInitScript(() => localStorage.setItem('ludotrip.tutorial', '1'))
  await page.goto('/')
})

async function abrirJapao(page: Page) {
  await page.getByRole('button', { name: /Japão de trem/ }).click()
  await expect(page.getByText('PARTIDA · FALTAM')).toBeVisible()
}

test('abrir um exemplo: mapa, trilha e cartão do dia numa tela; entrar na cidade e voltar', async ({
  page,
}) => {
  await abrirJapao(page)
  await expect(page.getByRole('region', { name: 'Trilha da viagem' })).toBeVisible()
  const dia = page.getByRole('region', { name: 'Dia escolhido' })
  await expect(dia).toContainText('chega em Tóquio')
  const kyoto = page.getByRole('button', { name: 'Kyoto: entrar no mapa da cidade' })
  await expect(kyoto).toBeVisible()
  await kyoto.click()
  await expect(page.getByRole('button', { name: '◀ Mapa' })).toBeVisible()
  const lugares = page.getByRole('group', { name: 'Lugares no mapa da cidade' })
  await expect(lugares.getByRole('button', { name: 'Gion' })).toBeVisible()
  await page.getByRole('button', { name: /^Ver o dia dom 14/ }).click()
  await expect(dia).toContainText('em Kyoto')
  await expect(lugares.getByRole('button', { name: 'Gion' })).toHaveClass(/dim/)
  await page.getByRole('button', { name: '◀ Mapa' }).click()
  await expect(kyoto).toBeVisible()
})

test('tocar num dia da régua move o cursor; "▶ Ver a viagem" passa os dias sozinho', async ({ page }) => {
  await abrirJapao(page)
  const dia = page.getByRole('region', { name: 'Dia escolhido' })
  await page.getByRole('button', { name: /^sex 05\/04/ }).click()
  await expect(dia).toContainText('em Tóquio')
  await expect(page.locator('.tr-day.cur')).toContainText('05')
  await page.getByRole('button', { name: '▶ Ver a viagem' }).click()
  await expect(page.getByRole('button', { name: '■ Parar' })).toBeVisible()
  await expect(page.locator('.tr-day.cur')).not.toContainText('05', { timeout: 5000 })
  await page.getByRole('button', { name: '■ Parar' }).click()
  await expect(page.getByRole('button', { name: '▶ Ver a viagem' })).toBeVisible()
})

test('criar viagem com um país e "decido no mapa": nasce com noites em aberto e o escopo', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Criar viagem' }).click()
  await page.getByPlaceholder(/Busque: Japão/).fill('romen')
  await page.getByRole('button', { name: /^Romênia/ }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Ainda não sei: decido no mapa' }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Criar viagem' }).click()
  await expect(page.getByText('VIAGEM CRIADA!')).toBeVisible()
  await expect(page.getByText(/Romênia · 7 noites/)).toBeVisible()
  // As abas ficam montadas (escondidas): getByRole respeita o `hidden`, getByText não.
  await expect(page.getByRole('heading', { name: '7 noites em aberto' })).toBeVisible()
})

test('no toque: segurar levanta o destino; arrastar um dia muda a data; soltar na lixeira tira do roteiro', async ({
  page,
  context,
}) => {
  await abrirJapao(page)
  const cdp = await context.newCDPSession(page)
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
  // "Ver tudo": a viagem inteira cabe na tela (em "Dias", Kyoto fica fora da faixa visível).
  await page.getByRole('button', { name: 'Ver tudo' }).click()
  const kyoto = page.getByRole('button', { name: /^Kyoto, 7 noites/ })
  await expect(kyoto).toBeInViewport()
  await page.waitForTimeout(300) // os blocos animam a largura (0,18 s)
  let b = (await kyoto.boundingBox())!
  let x = b.x + b.width / 2
  const y = b.y + b.height / 2
  const dw = (b.width + 3) / 7

  // Segurar 450 ms: o bloco infla e levanta; um dia para a direita = chega 1 dia depois.
  await touch('touchStart', [{ x, y }])
  await expect(kyoto).toHaveClass(/charging/)
  await page.waitForTimeout(600)
  await expect(kyoto).toHaveClass(/lifted/)
  for (let i = 1; i <= 6; i++) await touch('touchMove', [{ x: x + (dw * 1.1 * i) / 6, y }])
  await expect(page.getByRole('status').filter({ hasText: /chega 1 dia depois/ })).toBeVisible()
  await touch('touchEnd', [])
  await expect(page.getByText('Kyoto chega 1 dia depois.')).toBeVisible()

  // Soltar na lixeira tira do roteiro (as noites ficam em aberto).
  await page.waitForTimeout(300)
  b = (await kyoto.boundingBox())!
  x = b.x + b.width / 2
  await touch('touchStart', [{ x, y }])
  await page.waitForTimeout(600)
  await expect(kyoto).toHaveClass(/lifted/)
  const t = (await page.locator('.trash').boundingBox())!
  const tx = t.x + t.width / 2
  const ty = t.y + t.height / 2
  for (let i = 1; i <= 12; i++)
    await touch('touchMove', [{ x: x + ((tx - x) * i) / 12, y: y + ((ty - y) * i) / 12 }])
  await expect(page.locator('.trash')).toHaveClass(/hot/)
  await touch('touchEnd', [])
  await expect(page.getByText(/Kyoto saiu do roteiro/)).toBeVisible()
  await expect(page.getByRole('button', { name: /^7 noites em aberto/ })).toBeVisible()
})

test('"+ Atividade" num dia do roteiro cria a atividade já naquele dia', async ({ page }) => {
  await abrirJapao(page)
  const card = page.locator('#c-s8')
  await card.getByRole('button', { name: '+ Atividade' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Nova atividade em Kyoto')
  await expect(dialog).toContainText('Entra em sáb 13/04')
  await dialog.getByLabel('Nome da atividade').fill('Ginkaku-ji')
  await dialog.getByRole('button', { name: /Quero/ }).click()
  await expect(page.getByText('Atividade nova: Ginkaku-ji.')).toBeVisible()
  await expect(card.getByRole('button', { name: /Ginkaku-ji/ })).toBeVisible()
})

test('passagem: marcar, desmarcar e desfazer, com carimbo e XP', async ({ page }) => {
  await abrirJapao(page)
  const xp = page.getByText(/\d+ XP$/).first()
  const antes = await xp.textContent()
  await page
    .getByRole('button', { name: /Passagem: falta comprar/ })
    .first()
    .click()
  await expect(page.getByText('Passagem comprada 済.')).toBeVisible()
  await expect(xp).not.toHaveText(antes ?? '')
  await page.getByRole('button', { name: 'Desfazer' }).first().click()
  await expect(page.getByText(/^Desfeito/)).toBeVisible()
})
