# Publicar e operar a nuvem (M4)

Spec: [`publicacao-contas-colaboracao`](superpowers/specs/2026-10-14-publicacao-contas-colaboracao-design.md), §2, §5.6 e §5.8.

## Como o app chega ao ar

| Ambiente                          | Endereço                                                               | Quando publica                           |
| --------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------- |
| **Staging** (teste do mantenedor) | `https://ludotrip-staging.<subdomínio>.workers.dev`                    | Sozinho, a cada push na `main`           |
| **Produção**                      | `https://ludotrip.<subdomínio>.workers.dev` (no M6, o domínio próprio) | Só quando o mantenedor manda             |
| GitHub Pages (sem nuvem)          | `https://eduuf.github.io/LudoTrip/`                                    | A cada push; vira redirecionamento no M6 |

O workflow **Deploy (Cloudflare)** (`.github/workflows/deploy.yml`) faz, em ordem:

1. testes;
2. build com nuvem;
3. migrações do D1;
4. `wrangler deploy`.

Ele só liga quando a variável do repositório `CLOUDFLARE_READY` vale `1`, o que acontece depois do guia do M4.

**Publicar em produção:**

1. GitHub → **Actions**;
2. **Deploy (Cloudflare)**;
3. **Run workflow**;
4. em _Onde publicar_, escolher `production`;
5. **Run workflow**.

## Onde ver o que aconteceu

- **Logs do servidor:**
  - Caminho: Cloudflare → **Workers & Pages** → `ludotrip` (ou `ludotrip-staging`) → **Logs** (Workers Logs). Ficam 7 dias.
  - Cada requisição é uma linha JSON com `reqId`, `path`, `status`, `ms`, `uid` (um código, nunca o e-mail) e `app` (versão).
  - Cada ação numa viagem é uma linha `msg: "op"`, com `trip`, `opId`, `type`, `result` (`applied` / `noop` / `rejected`), `code` e `version`.
  - Para filtrar uma viagem, use `trip = "<id>"`.
- **Erros no celular:** Sentry → projeto `ludotrip`. O erro já aponta a linha do código.
- **Uso do app:** PostHog (UE) → eventos `app_aberto`, `viagem_criada`, `edicao`, `login_oferecido`, `login_feito`, `viagens_subiram`, `conflito`, `offline_fila` e `painel_aberto`. Só chegam de quem disse "Pode".
- **Histórico completo de uma viagem:**
  - O `TripRoom` guarda todas as ações aplicadas (tabela `ops`), não só o estado final. Os logs duram 7 dias; esse histórico fica.
  - Ele serve para reconstruir passo a passo como uma viagem chegou a um estado ruim, com o mesmo `runDoc`.
  - O Histórico na tela chega no M5.

## Algo deu errado

| Problema                                   | O que fazer                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versão nova com bug                        | Cloudflare → Workers & Pages → `ludotrip` → **Deployments** → na versão anterior, **Rollback**. Ou, no terminal: `npx wrangler rollback`. As viagens não voltam junto, só o código.                                                                                                                                                                  |
| Uma viagem estragada (bug ou engano grave) | GitHub → Actions → **Recuperar uma viagem** → Run workflow: ambiente, id da viagem (o que vem depois de `/v/` no endereço) e o horário para o qual voltar (de Brasília). A viagem volta àquele instante (até 30 dias) e quem estava com ela aberta reconecta já no estado antigo. A resposta traz um marcador `undo`, que desfaz a volta se preciso. |
| Contas ou membros (D1)                     | Cloudflare → D1 → o banco → **Time Travel** (volta no tempo do banco).                                                                                                                                                                                                                                                                               |

A recuperação de viagem (volta no tempo do Durable Object) não roda localmente. Ela é testada uma vez em produção, com uma viagem de teste, antes da divulgação (M6).

## Segredos

| Nome                                            | Onde                                                                                              | Para quê                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------- |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub (secrets)                                                                                  | O workflow publicar       |
| `SENTRY_AUTH_TOKEN`                             | GitHub (secrets)                                                                                  | Enviar os mapas de código |
| `ADMIN_TOKEN`                                   | Cloudflare (`wrangler secret put ADMIN_TOKEN`, nos dois ambientes) e GitHub (secrets do ambiente) | Recuperar uma viagem      |

Valores públicos ficam em **variables** dos ambientes `staging` e `production` do GitHub: chaves do Firebase, DSN do Sentry, chave do PostHog e `APP_URL`.

## Rodar local

- `npm run dev`: o app sem nuvem, como sempre.
- `node scripts/e2e-cloud.mjs`: o app com nuvem e o login de teste, em `http://127.0.0.1:8787` (Worker, D1 e TripRoom locais).
- `npm run test:worker`: os testes do servidor, no runtime dos Workers.
- `npm run e2e`: ponta a ponta. O projeto "celular" testa sem nuvem; o projeto "nuvem" testa com o Worker local.
