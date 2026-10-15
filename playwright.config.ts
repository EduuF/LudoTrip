import { defineConfig, devices } from '@playwright/test'

// Ponta a ponta no tamanho de celular.
// - "celular": o app sem nuvem, contra o build (npm run build antes), como no GitHub Pages.
// - "nuvem": o app com nuvem contra o Worker de verdade rodando local (scripts/e2e-cloud.mjs), com o
//   login de teste. Sem rede externa: tiles e busca online são bloqueados nos testes.
export default defineConfig({
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [
    {
      name: 'celular',
      testDir: 'e2e',
      testIgnore: 'nuvem/**',
      use: { ...devices['Pixel 5'], viewport: { width: 375, height: 812 }, baseURL: 'http://localhost:4173' },
    },
    {
      name: 'nuvem',
      testDir: 'e2e/nuvem',
      use: { ...devices['Pixel 5'], viewport: { width: 375, height: 812 }, baseURL: 'http://127.0.0.1:8787' },
    },
  ],
  webServer: [
    {
      command: 'npm run preview -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'node scripts/e2e-cloud.mjs',
      url: 'http://127.0.0.1:8787/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
})
