// Conferência de um ambiente publicado (Playwright, sem janela e sem conta): o app abre sem erros,
// a API responde, o repasse do login funciona e o Google aceita o endereço de volta do login.
// Uso: node scripts/smoke-live.mjs https://staging.ludotrip.app
import { chromium } from '@playwright/test'

const base = (process.argv[2] ?? '').replace(/\/$/, '')
if (!base) {
  console.error('uso: node scripts/smoke-live.mjs <url>')
  process.exit(1)
}
const problems = []
const ok = (msg) => console.log(`ok  ${msg}`)
const bad = (msg) => {
  problems.push(msg)
  console.log(`ERRO ${msg}`)
}

const health = await fetch(`${base}/api/health`)
  .then((r) => r.json())
  .catch(() => null)
health?.ok ? ok(`API (${health.env})`) : bad('API não respondeu')
const handler = await fetch(`${base}/__/auth/handler`)
handler.ok ? ok('repasse do login (/__/auth/handler)') : bad(`repasse do login: ${handler.status}`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 })
page.on('pageerror', (e) => bad(`erro na página: ${e.message}`))
// O pop-up do Firebase consulta window.closed numa página do Google com COOP: aviso inofensivo e conhecido.
const noise = /Cross-Origin-Opener-Policy policy would block the window\.closed call/
page.on('console', (m) => m.type() === 'error' && !noise.test(m.text()) && bad(`console: ${m.text()}`))
page.on('requestfailed', (r) => bad(`falhou: ${r.url()} (${r.failure()?.errorText})`))
await page.goto(base, { waitUntil: 'networkidle' })
ok(`app abriu: "${await page.title()}"`)

// Login com Google até a tela do Google (sem entrar): um endereço de volta não autorizado aparece
// ali como "redirect_uri_mismatch".
await page.getByRole('button', { name: 'Entrar' }).first().click()
const [popup] = await Promise.all([
  page.waitForEvent('popup', { timeout: 15000 }),
  page.getByRole('button', { name: 'Continuar com Google' }).click(),
])
await popup.waitForURL(/accounts\.google\.com/, { timeout: 20000 }).catch(() => {})
await popup.waitForLoadState('networkidle').catch(() => {})
const gurl = new URL(popup.url())
const back =
  gurl.searchParams.get('redirect_uri') ??
  new URL(gurl.searchParams.get('continue') ?? 'x:/').searchParams.get('redirect_uri')
const text = await popup
  .locator('body')
  .innerText()
  .catch(() => '')
if (/redirect_uri_mismatch|invalid_request|Erro 400|Error 400/i.test(text))
  bad(`Google recusou o login: ${text.slice(0, 200)}`)
else if (!gurl.hostname.endsWith('google.com')) bad(`o login não chegou ao Google: ${popup.url()}`)
else ok(`Google aceitou o endereço de volta (${back ?? 'sem redirect_uri visível'})`)
await page.screenshot({ path: 'test-results/smoke-live.png' }).catch(() => {})
await browser.close()

console.log(problems.length ? `\n${problems.length} problema(s)` : '\ntudo certo')
process.exit(problems.length ? 1 : 0)
