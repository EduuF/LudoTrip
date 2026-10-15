// Tira de quadros do Palco para o avaliador (docs/animacoes.md §4).
//
// Abre o app do servidor de desenvolvimento num celular de 375 × 812, abre o exemplo "Japão de trem",
// dispara cada momento de verdade (window.__palco.demo), congela a cena em vários instantes e monta uma
// folha de contato por variação, com o recorte da cena E do que está em volta (para julgar o encaixe).
//
// Uso: node scripts/filmstrip.mjs [momento] [variação] [--url=http://localhost:5174] [--dark]
// Sem argumentos, faz todos os momentos e variações. Saída: test-results/filmstrip/<momento>-<variação>.png

import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const VARIANTS = {
  passagem: ['bilheteiro', 'mala', 'carimbo', 'vento'],
  hospedagem: ['cama', 'futon', 'barraca', 'travesseiro'],
  feita: ['foto', 'selfie', 'comer', 'pulo', 'gato'],
  nuvem: ['arremesso', 'aviao', 'chute', 'espirro'],
  criada: ['kombi', 'aviao', 'trem', 'barco', 'esquecidos'],
  'grande-dia': ['malas', 'portao', 'porta-malas', 'esqueceu'],
}
const FRAMES = 12
const MARGIN = 28

const args = process.argv.slice(2)
const flag = (k) => args.find((a) => a.startsWith(`--${k}`))
const url = flag('url')?.split('=')[1] ?? 'http://localhost:5174'
const dark = !!flag('dark')
const [only, onlyVariant] = args.filter((a) => !a.startsWith('--'))
const out = 'test-results/filmstrip'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 3,
  colorScheme: dark ? 'dark' : 'light',
})
// Erros da página entram no relatório (uma cena que quebra some da tira).
page.on('pageerror', (e) => console.log(`  ! erro na página: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && console.log(`  ! console: ${m.text().slice(0, 200)}`))
await page.goto(url, { waitUntil: 'networkidle' })
await page
  .getByRole('button', { name: /Japão de trem/ })
  .first()
  .click()
await page.waitForSelector('.mappanel')
await page.waitForTimeout(1200)

const jobs = Object.entries(VARIANTS)
  .filter(([m]) => !only || m === only)
  .flatMap(([m, vs]) => vs.filter((v) => !onlyVariant || v === onlyVariant).map((v) => [m, v]))

for (const [moment, variant] of jobs) {
  await page.evaluate(() => window.__palco.reset())
  await page.waitForTimeout(300)
  const run = await page.evaluate(([m, v]) => window.__palco.demo(m, v), [moment, variant])
  if (!run || run.variant !== variant) {
    // A tira só vale para a variação pedida (docs/animacoes.md §4).
    console.log(`✗ ${moment}/${variant}: tocou ${run ? run.variant : 'nada'}`)
    process.exitCode = 1
    await page.evaluate(() => window.__palco.freeze(null))
    continue
  }
  const shots = []
  for (let i = 0; i < FRAMES; i++) {
    const t = Math.round((run.duration - 40) * (i / (FRAMES - 1)))
    await page.evaluate((tt) => window.__palco.freeze(tt), t)
    const b = await page.evaluate(() => window.__palco.box())
    if (!b) break
    const x = Math.max(0, b.x - MARGIN)
    const y = Math.max(0, b.y - MARGIN)
    const clip = {
      x,
      y,
      width: Math.min(375 - x, b.w + MARGIN * 2),
      height: Math.min(812 - y, b.h + MARGIN * 2),
    }
    // Quadro vazio no meio da cena (nenhum ator à vista) é defeito: avisa.
    const actors = await page.evaluate(
      () => [...document.querySelectorAll('.palco svg')].filter((e) => e.style.display !== 'none').length,
    )
    if (!actors && i > 0 && i < FRAMES - 2) console.log(`  ! ${moment}/${variant}: quadro vazio em ${t} ms`)
    const hits = await page.evaluate(() => {
      const say = [...document.querySelectorAll('.palco-say')].find((e) => e.style.display !== 'none')
      if (!say) return 0
      const b = say.getBoundingClientRect()
      return [
        ...document.querySelectorAll('.mappanel svg rect[rx], .mappanel svg text, .mappanel svg circle'),
      ]
        .map((e) => e.getBoundingClientRect())
        .filter(
          (r) =>
            r.width &&
            b.left - 6 < r.right &&
            b.right + 6 > r.left &&
            b.top - 6 < r.bottom &&
            b.bottom + 6 > r.top,
        ).length
    })
    if (hits) console.log(`  ! ${moment}/${variant}: balão encosta em ${hits} rótulo(s)/pino(s) em ${t} ms`)
    const png = await page.screenshot({ clip })
    shots.push({ t, w: clip.width, src: `data:image/png;base64,${png.toString('base64')}` })
  }
  await page.evaluate(() => window.__palco.freeze(null))

  // Folha de contato: os quadros em grade, com o instante em ms.
  // Cada quadro em 1 px de tela por px CSS (redução inteira de 3:1, vizinho mais próximo): linhas e
  // partículas de 1 px de arte nunca somem nem aparecem pela metade na folha.
  const sheet = await browser.newPage({
    viewport: {
      width: Math.ceil(4 * Math.max(...shots.map((x) => (x.w <= 420 ? x.w * 3 : x.w))) + 80),
      height: 800,
    },
  })
  await sheet.setContent(`<!doctype html><body style="margin:0;padding:12px;background:#ddd;font:14px monospace">
    <h3 style="margin:0 0 8px">${moment} · ${run.variant} · ${run.duration} ms${dark ? ' · escuro' : ''}</h3>
    <div style="display:grid;grid-template-columns:repeat(4,max-content);gap:8px">
    ${shots.map((s) => `<figure style="margin:0;background:#fff;padding:4px"><img src="${s.src}" style="width:${s.w <= 420 ? s.w * 3 : s.w}px;image-rendering:pixelated"><figcaption>${s.t} ms</figcaption></figure>`).join('')}
    </div></body>`)
  const file = `${out}/${moment}-${variant}${dark ? '-escuro' : ''}.png`
  await sheet.screenshot({ path: file, fullPage: true })
  await sheet.close()
  console.log(`✓ ${file}`)
}
await browser.close()
