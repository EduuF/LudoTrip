/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Mapas de código para o Sentry (spec publicação §5.6): só no build do CI, com o token. Eles são
// enviados ao Sentry e apagados do dist (o site publicado não expõe o código-fonte).
const sentry = process.env.SENTRY_AUTH_TOKEN
  ? sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: process.env.VITE_APP_VERSION },
      sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
      telemetry: false,
    })
  : null

export default defineConfig({
  // No GitHub Pages o app mora em /LudoTrip/ (o workflow passa BASE_PATH); na Cloudflare, na raiz.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), ...(sentry ? [sentry] : [])],
  build: { sourcemap: sentry ? 'hidden' : false },
  test: {
    // O motor roda em Node puro; testes de interface pedem jsdom no próprio arquivo.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      include: ['src/engine/**'],
      exclude: ['src/engine/fixtures/**', 'src/engine/**/*.test.ts', 'src/engine/index.ts'],
      thresholds: { lines: 90 },
    },
  },
})
