/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // No GitHub Pages o app mora em /LudoTrip/ (o workflow passa BASE_PATH); local e Firebase ficam na raiz.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  test: {
    // O motor roda em Node puro; testes de interface pedem jsdom no próprio arquivo.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      include: ['src/engine/**'],
      exclude: ['src/engine/fixtures/**', 'src/engine/**/*.test.ts', 'src/engine/index.ts'],
      thresholds: { lines: 90 },
    },
  },
})
