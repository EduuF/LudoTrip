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
  await expect(page.locator('.map-head')).toContainText('FALTAM')
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
  await expect(page.locator('.tr-month')).toContainText('7 noites')
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
  await page.getByRole('button', { name: 'Kyoto: abrir os dias' }).click()
  const card = page.locator('#c-s8')
  await card.getByRole('button', { name: 'Atividade em sáb 13/04' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Nova atividade em Kyoto')
  await expect(dialog).toContainText('Entra em sáb 13/04')
  await dialog.getByLabel('Nome da atividade').fill('Ginkaku-ji')
  await dialog.getByRole('button', { name: /Imperdível/ }).click()
  await dialog.getByRole('button', { name: 'Criar atividade' }).click()
  await expect(page.getByText('Atividade nova: Ginkaku-ji.')).toBeVisible()
  await expect(card.getByRole('button', { name: /Ginkaku-ji/ })).toBeVisible()
})

test('no mouse: arrastar um destino muda a data sem segurar; arrastar a régua rola a faixa', async ({
  page,
}) => {
  await abrirJapao(page)
  await page.getByRole('button', { name: 'Ver tudo' }).click()
  const kyoto = page.getByRole('button', { name: /^Kyoto, 7 noites/ })
  await expect(kyoto).toBeInViewport()
  await page.waitForTimeout(300)
  const b = (await kyoto.boundingBox())!
  const dw = (b.width + 3) / 7
  const x = b.x + b.width / 2
  const y = b.y + b.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dw * 1.1, y, { steps: 6 })
  await expect(kyoto).toHaveClass(/lifted/)
  await page.mouse.up()
  await expect(page.getByText('Kyoto chega 1 dia depois.')).toBeVisible()

  // Em "Dias" a faixa transborda: arrastar a régua com o mouse rola a faixa (e não passa os dias).
  await page.getByRole('button', { name: 'Dias', exact: true }).click()
  await page.waitForTimeout(300)
  // O aviso "Kyoto chega 1 dia depois." fica fixo no pé da tela, em cima da régua: rola a página antes.
  await page.evaluate(() => scrollTo(0, 220))
  const scroll = page.locator('.tr-scroll')
  const before = await scroll.evaluate((el) => el.scrollLeft)
  const r = (await page.locator('.tr-ruler').boundingBox())!
  await page.mouse.move(r.x + 300, r.y + r.height / 2)
  await page.mouse.down()
  await page.mouse.move(r.x + 100, r.y + r.height / 2, { steps: 8 })
  await page.mouse.up()
  expect(await scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before + 100)
})

test('"+ Atividade aqui": um clique no mapa da cidade abre "Nova atividade"; "Criar atividade" conclui', async ({
  page,
}) => {
  await abrirJapao(page)
  await page.getByRole('button', { name: 'Kyoto: entrar no mapa da cidade' }).click()
  await page.getByRole('button', { name: '+ Atividade aqui' }).click()
  const board = page.locator('.board')
  await expect(board).toHaveClass(/placing/)
  const b = (await board.boundingBox())!
  // Longe do cabeçalho da cidade (em cima) e da faixa "Marque no mapa" (embaixo).
  await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.45)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Nova atividade em Kyoto')
  await expect(board).not.toHaveClass(/placing/)
  await dialog.getByLabel('Nome da atividade').fill('Ginkaku-ji')
  await dialog.getByRole('button', { name: 'Criar atividade' }).click()
  await expect(page.getByText('Atividade nova: Ginkaku-ji.')).toBeVisible()
})

test('criar viagem com uma cidade: o passo 2 pergunta por outra cidade, não por "lugares"', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Criar viagem' }).click()
  await page.getByPlaceholder(/Busque: Japão/).fill('Rio de')
  await page.getByRole('button', { name: /^Rio de Janeiro/ }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('heading', { name: /Vão dormir em outra cidade\?/ })).toBeVisible()
  await expect(page.getByText(/Bate-voltas e passeios/)).toBeVisible()
  await expect(page.getByText('Outra cidade', { exact: true })).toBeVisible()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Criar viagem' }).click()
  await expect(page.getByText('VIAGEM CRIADA!')).toBeVisible()
})

test('"Editar trecho": trocar o meio não fecha o painel; o roteiro abre um destino por vez', async ({
  page,
}) => {
  await abrirJapao(page)
  await page.getByRole('button', { name: /São Paulo → Tóquio: editar trecho/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /trem/i }).click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: /trem/i })).toHaveAttribute('aria-pressed', 'true')
  await dialog.getByRole('button', { name: 'Fechar' }).click()
  // Acordeão: o primeiro Tóquio (dia 1) aberto e Kyoto fechado; abrir Kyoto fecha Tóquio.
  await expect(page.getByRole('button', { name: 'Tóquio: fechar os dias' })).toBeVisible()
  await page.getByRole('button', { name: 'Kyoto: abrir os dias' }).click()
  await expect(page.getByRole('button', { name: 'Kyoto: fechar os dias' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tóquio: fechar os dias' })).toHaveCount(0)
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
