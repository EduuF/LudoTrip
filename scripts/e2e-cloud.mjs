// Servidor do e2e da nuvem (spec publicação §7): build do app com nuvem e login de teste, banco D1
// local zerado com as migrações, e `wrangler dev` com TEST_AUTH=1 (só aqui; nunca no wrangler.jsonc).
import { spawn, spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'

const PERSIST = '.wrangler/e2e'
const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, env: { ...process.env, ...env } })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

rmSync(PERSIST, { recursive: true, force: true })
run('npx', ['vite', 'build', '--outDir', 'dist-cloud', '--emptyOutDir'], {
  VITE_CLOUD: '1',
  VITE_AUTH: 'test',
  VITE_APP_VERSION: 'e2e',
})
run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', PERSIST])
const dev = spawn(
  'npx',
  [
    'wrangler',
    'dev',
    '--port',
    '8787',
    '--assets',
    'dist-cloud',
    '--persist-to',
    PERSIST,
    '--var',
    'TEST_AUTH:1',
    '--var',
    'FIREBASE_PROJECT_ID:ludotrip-e2e',
  ],
  { stdio: 'inherit', shell: true },
)
const stop = () => dev.kill()
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
dev.on('exit', (code) => process.exit(code ?? 0))
