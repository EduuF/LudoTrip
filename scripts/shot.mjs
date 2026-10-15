// Foto de uma página do servidor de desenvolvimento (Playwright, sem janela), para conferir pixel art.
// Uso: node scripts/shot.mjs <url> <saida.png> [largura] [zoom] [seletor]
// Com seletor, tira uma foto por elemento (saida-1.png, saida-2.png…).
import { chromium } from '@playwright/test'

const [url, out, width = '900', zoom = '1', selector] = process.argv.slice(2)
if (!url || !out) {
  console.error('uso: node scripts/shot.mjs <url> <saida.png> [largura] [zoom]')
  process.exit(1)
}
const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: Number(width), height: 900 },
  deviceScaleFactor: Number(zoom),
})
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
if (selector) {
  const els = await page.locator(selector).all()
  for (const [i, el] of els.entries()) await el.screenshot({ path: out.replace(/\.png$/, `-${i + 1}.png`) })
} else await page.screenshot({ path: out, fullPage: true })
await browser.close()
console.log(out)
