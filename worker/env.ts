// O que o Worker recebe além dos bindings gerados por `wrangler types` (worker-configuration.d.ts):
// variáveis opcionais e segredos (`wrangler secret put`), que não ficam no wrangler.jsonc.
export type AppEnv = Omit<Env, 'FIREBASE_PROJECT_ID'> & {
  /** Projeto do Firebase cujo login vale aqui (ludotrip, ludotrip-dev, ou o de teste). */
  FIREBASE_PROJECT_ID: string
  /** "1" só nos testes e no e2e: liga /api/test/token e as chaves de teste. Nunca em produção. */
  TEST_AUTH?: string
  /** Segredo da rota de administração (recuperar uma viagem no tempo). */
  ADMIN_TOKEN?: string
}
