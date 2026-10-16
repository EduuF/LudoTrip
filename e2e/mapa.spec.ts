import { expect, test } from '@playwright/test'

// O mapa de tiles de verdade (MapLibre) precisa ocupar o painel inteiro e sobreviver à troca de abas.
// Os tiles são simulados: TileJSON mínimo e ladrilhos vazios, sem rede externa.

const TILEJSON = {
  tilejson: '3.0.0',
  tiles: ['https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf'],
  minzoom: 0,
  maxzoom: 14,
  bounds: [-180, -85, 180, 85],
}

test.beforeEach(async ({ page }) => {
  await page.route('https://tiles.openfreemap.org/planet', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TILEJSON) }),
  )
  await page.route('https://tiles.openfreemap.org/planet/**', (r) => r.fulfill({ status: 204 }))
  await page.route('https://photon.komoot.io/**', (r) => r.abort())
  await page.addInitScript(() => localStorage.setItem('ludotrip.tutorial', '1'))
  await page.goto('/')
})

test('o mapa de tiles ocupa o painel inteiro e continua depois de ir e voltar de Atividades', async ({
  page,
}) => {
  await page.goto('/?exemplo=japao')
  const board = page.locator('.board')
  await expect(board).toHaveClass(/tiles/, { timeout: 20_000 })
  const medir = async () => {
    const b = await board.boundingBox()
    const c = await page.locator('.maplibregl-canvas').boundingBox()
    const svg = await page.locator('.map-overlay').boundingBox()
    return { b, c, svg }
  }
  let m = await medir()
  expect(m.b!.height).toBeGreaterThan(250)
  expect(Math.abs(m.c!.height - m.b!.height)).toBeLessThan(3)
  expect(Math.abs(m.svg!.height - m.b!.height)).toBeLessThan(3)
  await expect(page.getByRole('button', { name: 'Kyoto: entrar no mapa da cidade' })).toBeVisible()

  await page.getByRole('navigation', { name: 'Telas da viagem' }).getByText('Atividades').click()
  await page.getByRole('navigation', { name: 'Telas da viagem' }).getByText('Mapa').click()
  await expect(board).toHaveClass(/tiles/)
  m = await medir()
  expect(Math.abs(m.c!.height - m.b!.height)).toBeLessThan(3)
  await expect(page.getByRole('button', { name: 'Kyoto: entrar no mapa da cidade' })).toBeVisible()
})

test('viagem só com o país: a fase tracejada no mapa leva a escolher a cidade', async ({ page }) => {
  await page.getByRole('button', { name: 'Criar viagem' }).click()
  await page.getByPlaceholder(/Busque: Japão/).fill('japa')
  await page.getByText('Japão', { exact: true }).click()
  await expect(page.getByText(/1\. Japão · cidades em aberto/)).toBeVisible()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Criar viagem' }).click()
  const fase = page.getByRole('button', { name: 'Japão: escolher cidade' })
  await expect(fase).toBeVisible({ timeout: 20_000 })
  await fase.click()
  await expect(page.getByText('Que cidade de Japão?')).toBeVisible()
})
