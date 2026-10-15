import path from 'node:path'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// Testes do servidor (worker/**) rodando no runtime dos Workers (spec publicação §7).
// O D1 de teste recebe as migrações de worker/migrations antes de cada arquivo (worker/test/setup.ts).
export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'worker/migrations'))
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations, TEST_AUTH: '1', FIREBASE_PROJECT_ID: 'ludotrip-test' },
        },
      }),
    ],
    test: {
      include: ['worker/**/*.test.ts'],
      setupFiles: ['worker/test/setup.ts'],
    },
  }
})
