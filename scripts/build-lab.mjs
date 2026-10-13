// Gera o laboratório do motor num único HTML (sem dependências externas além das fontes).
// Uso: npm run lab:build  →  dist-lab/laboratorio.html
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'

const result = await build({
  entryPoints: ['src/lab/main.ts'],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2022',
  write: false,
  outdir: 'dist-lab',
  legalComments: 'none',
})

const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text.replace(/<\/script/gi, '<\/script')
const css = result.outputFiles.find((f) => f.path.endsWith('.css')).text

const html = `<title>LudoTrip Laboratório</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DotGothic16&family=Shippori+Mincho+B1:wght@700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap">
<style>${css}</style>
<div id="app"></div>
<script>${js}</script>
`

await mkdir('dist-lab', { recursive: true })
await writeFile('dist-lab/laboratorio.html', html)
console.log(`dist-lab/laboratorio.html (${(html.length / 1024).toFixed(0)} KB)`)
