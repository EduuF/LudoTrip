// Gera a prévia do app num único HTML para publicar como artifact (o mantenedor testa no celular).
// React 18 vem por CDN (UMD); o resto (motor, d3-geo, contornos do mundo, estilos) vai embutido.
// Uso: npm run preview:artifact  →  dist-preview/ludotrip.html
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'

const globals = {
  name: 'react-globals',
  setup(b) {
    b.onResolve({ filter: /^react(-dom)?(\/client|\/jsx-runtime)?$/ }, (args) => ({
      path: args.path,
      namespace: 'g',
    }))
    // O artifact não tem rede: o mapa fica no papel, e o worker do MapLibre não precisa existir.
    b.onResolve({ filter: /\?worker&url$/ }, (args) => ({ path: args.path, namespace: 'g' }))
    b.onLoad({ filter: /.*/, namespace: 'g' }, (args) => {
      if (args.path.endsWith('?worker&url')) return { contents: 'export default ""', loader: 'js' }
      if (args.path === 'react/jsx-runtime')
        return {
          contents: `const R = window.React
            const jsx = (type, props, key) => R.createElement(type, key === undefined ? props : { ...props, key })
            export { jsx, jsx as jsxs, jsx as jsxDEV }
            export const Fragment = R.Fragment`,
          loader: 'js',
        }
      if (args.path.startsWith('react-dom'))
        return { contents: 'module.exports = window.ReactDOM', loader: 'js' }
      return { contents: 'module.exports = window.React', loader: 'js' }
    })
  },
}

const result = await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  jsx: 'automatic',
  write: false,
  outdir: 'dist-preview',
  legalComments: 'none',
  charset: 'ascii',
  plugins: [globals],
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env.MODE': '"production"',
    'import.meta.env.DEV': 'false',
  },
  loader: { '.json': 'json' },
})

const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script')
const css = result.outputFiles.find((f) => f.path.endsWith('.css')).text

const html = `<meta charset="utf-8">
<title>LudoTrip</title>
<meta name="theme-color" content="#241a28">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DotGothic16&family=Shippori+Mincho+B1:wght@700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap">
<style>${css}</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>${js}</script>
`

await mkdir('dist-preview', { recursive: true })
await writeFile('dist-preview/ludotrip.html', html)
console.log(`dist-preview/ludotrip.html (${(html.length / 1024).toFixed(0)} KB)`)
