# Arquitetura e infraestrutura (como está hoje)

O retrato do LudoTrip **no ar**, depois do M5 (15/10/2026). Quando algo mudar, atualize aqui junto com o código.

- O **porquê** de cada decisão está nas specs: [`2026-10-13-ludotrip-v2-design.md`](superpowers/specs/2026-10-13-ludotrip-v2-design.md) (o app e o motor) e [`2026-10-14-publicacao-contas-colaboracao-design.md`](superpowers/specs/2026-10-14-publicacao-contas-colaboracao-design.md) (nuvem, contas, colaboração).
- **Operar** (publicar, logs, recuperar, segredos): [`deploy.md`](deploy.md).
- **Valores públicos** (ids, chaves públicas) ficam nas variáveis do GitHub e no `wrangler.jsonc`; nunca segredos no repositório.

## 1. Visão geral

```
celular / navegador                         Cloudflare (conta do mantenedor)
───────────────────                         ───────────────────────────────────────────────
App React + TS (PWA, Vite)                  Worker "ludotrip" (produção) / "ludotrip-staging"
 ├─ motor puro (src/engine)                  ├─ arquivos do app (dist/, Static Assets, SPA)
 ├─ documento + runDoc (src/app/doc.ts) ◄──── ├─ /api/*  → roteador (worker/index.ts)
 ├─ store (zustand)                          ├─ /__/auth/* → repasse transparente ao Firebase
 ├─ viagens 📱 no IndexedDB                  ├─ D1 "ludotrip" / "ludotrip-staging": contas, viagens,
 ├─ cópias ☁️ + fila de saída (IndexedDB)   │    membros, convites
 └─ TripSync (WebSocket) ──────────────────► └─ Durable Object TripRoom, 1 por viagem (SQLite próprio):
                                                  documento + registro de ações + conexões ao vivo
Firebase Auth (só login: Google e link      Worker "ludotrip-www": www.ludotrip.app → ludotrip.app (301)
por e-mail; projetos ludotrip / ludotrip-dev)
Sentry (erros) · PostHog UE (uso)           GitHub: código, CI, deploy, Pages (versão sem nuvem)
OpenFreeMap (tiles) · Photon (busca)
```

**O mesmo `runDoc`** (`src/app/doc.ts`, puro) roda no aparelho (otimista) e no `TripRoom` (a verdade). As ações são intenções serializáveis com `opId`; ids novos derivam do `opId`; nada de relógio ou aleatório dentro do `runDoc`.

## 2. Ambientes e domínios

| Ambiente  | Endereço                                                        | Worker                        | D1                 | Firebase                       | Publica                                           |
| --------- | --------------------------------------------------------------- | ----------------------------- | ------------------ | ------------------------------ | ------------------------------------------------- |
| Produção  | `https://ludotrip.app` (+ `www` → principal)                    | `ludotrip` (+ `ludotrip-www`) | `ludotrip`         | projeto `ludotrip`             | `gh workflow run deploy.yml -f target=production` |
| Staging   | `https://staging.ludotrip.app`                                  | `ludotrip-staging`            | `ludotrip-staging` | projeto `ludotrip-dev`         | sozinho, a cada push na `main`                    |
| Sem nuvem | `https://eduuf.github.io/LudoTrip/`                             | — (GitHub Pages)              | —                  | —                              | a cada push (vira redirecionamento no M6)         |
| Local     | `npm run dev` · `node scripts/e2e-cloud.mjs` (`127.0.0.1:8787`) | `wrangler dev`                | local              | login de teste (`TEST_AUTH=1`) | —                                                 |

- **Domínio:** `ludotrip.app`, registrado na Cloudflare (mesma conta), DNSSEC ativo. Os Workers usam **Custom Domains** (`routes` com `custom_domain: true` em `wrangler.jsonc` / `wrangler.www.jsonc`): a Cloudflare cria o DNS e o certificado. `.app` é HSTS pré-carregado (só HTTPS).
- **Login pelo nosso domínio:** `authDomain` do Firebase é o próprio host; o Worker repassa `/__/auth/*` ao `<projeto>.firebaseapp.com` (sem redirecionar), para o Safari não bloquear. Cada domínio precisa estar nos **domínios autorizados** do Firebase e no **cliente OAuth** do Google (redirect `https://<domínio>/__/auth/handler` e origem). Guia: `docs/guias/M6-dominio-o-que-voce-precisa-fazer.md`.
- Os endereços antigos `*.ludotrip.workers.dev` continuam respondendo.

## 3. Servidor (`worker/`)

| Arquivo       | Papel                                                                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts`    | Roteador: `/api/health`, `/api/me`, `/api/trips*`, `/api/invites/*`, `/api/admin/*`, `/__/auth/*`; log JSON de cada requisição; limite de 120 req/min por pessoa (binding `API`).                                                          |
| `auth.ts`     | Confere o token do Firebase (`jose`, chaves do Google com cache). Login de teste só com `TEST_AUTH=1`.                                                                                                                                     |
| `db.ts`       | Consultas D1 (contas, viagens, membros).                                                                                                                                                                                                   |
| `trips.ts`    | Listar, subir (📱 → ☁️), abrir ao vivo (WebSocket), apagar/recuperar, e as sub-rotas de pessoas.                                                                                                                                           |
| `invites.ts`  | Convites: criar, cancelar, prévia sem conta, aceitar (uso único, 7 dias, só o SHA-256 do token no banco).                                                                                                                                  |
| `members.ts`  | Pessoas, papel, tirar/sair, passar a viagem, apagar para todos (30 dias), recuperar, Histórico.                                                                                                                                            |
| `tripRoom.ts` | Durable Object da viagem: aplica uma ação por vez com `decide()` (`src/sync/serverCore.ts`), grava documento e registro na mesma transação, transmite; presença; papel por conexão (`setRole`); alarme que apaga de vez depois de 30 dias. |
| `admin.ts`    | `/api/admin/restore` (volta uma viagem no tempo), só com `ADMIN_TOKEN`.                                                                                                                                                                    |
| `limits.ts`   | 20 pessoas, 10 convites aguardando, 7 dias de convite, 30 dias em Apagadas, 100 viagens por conta; 1 MB por viagem (`serverCore`).                                                                                                         |
| `www.ts`      | O Worker do `www`.                                                                                                                                                                                                                         |

**Rotas da API (todas com o token no cabeçalho, menos a prévia do convite):**

- `GET /api/trips` (minhas viagens, com papel e quantas pessoas) · `GET /api/trips?deleted=1` (Apagadas) · `POST /api/trips` (subir).
- `GET /api/trips/<id>/ws` (ao vivo; token no subprotocolo do WebSocket, nunca na URL) · `DELETE /api/trips/<id>` (apagar para todos) · `POST …/restore`.
- `GET …/people` · `POST …/invites` · `DELETE …/invites/<inviteId>` · `PATCH …/members/<uid>` · `DELETE …/members/<uid>[?traveler=1]` · `POST …/transfer` · `GET …/history[?before=<seq>]`.
- `GET /api/invites/<token>` (prévia, sem conta) · `POST /api/invites/<token>/accept`.

### Dados

**D1** (`worker/migrations/`, aplicadas pelo deploy):

- `users (uid, name, email, photo_url, created_at, deleted_at)`;
- `trips (id, owner_uid, name, start, end, version, size_bytes, created_at, updated_at, deleted_at, deleted_by)`: o que "Suas viagens" mostra; o `TripRoom` mantém em dia;
- `members (trip_id, uid, role: owner|editor|viewer, joined_at)`: **a fonte da verdade de quem pode o quê**;
- `invites (id, token_hash, trip_id, role, traveler_id, email, created_by, created_at, expires_at, used_by, used_at, revoked_at)`.

**`TripRoom`** (SQLite do Durable Object, um por viagem): `doc` (o documento inteiro e a versão) e `ops` (toda ação: `op_id` único, `uid`, ação, resultado, motivo, versão, hora e o texto narrado do Histórico).

### Protocolo ao vivo (`src/sync/protocol.ts`, `PROTOCOL = 1`)

- Aparelho → servidor: `hello { sinceVersion, pending[] }` e `op { opId, action }`.
- Servidor → aparelho: `snapshot`, `applied`, `rejected`, `upgrade`, `gone { reason, by? }`, e no M5 `presence`, `people`, `role`, `joined`.
- **Mensagem nova é só acréscimo:** o aparelho ignora um `t` desconhecido. Mudou o formato de uma existente? Suba `PROTOCOL` e mantenha o servidor aceitando a anterior.
- Convergência: o aparelho mostra `estado do servidor + suas ações pendentes` (rebase); reenvio nunca aplica duas vezes (`opId`); o `hello` diz o que já foi decidido. Testado em `src/sync/convergence.test.ts`.

## 4. App (`src/`)

| Pasta        | Papel                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `engine/`    | Motor puro do roteiro (comandos com inverso, datas, efeitos). Sem React, rede ou relógio.                                                                                                        |
| `app/`       | Documento e `runDoc`, store (zustand), repositório local, rotas (`/`, `/v/<id>`, `/entrar/link`, `/convite/<token>`), tarefas, narração dos avisos, telemetria, regras de pessoas (`people.ts`). |
| `sync/`      | Fila de saída, `TripSync` (WebSocket, reconexão, rebase), APIs HTTP (`cloudApi.ts`, `peopleApi.ts`), decisões do servidor (`serverCore.ts`) e a nuvem em memória dos testes (`testing.ts`).      |
| `auth/`      | `AuthClient`: Firebase (Google em pop-up, ou redirecionamento no app instalado; link por e-mail) ou o login de teste. Carregado sob demanda.                                                     |
| `map/`       | Enquadramento, rotas e adaptadores (papel sem rede; tiles OpenFreeMap).                                                                                                                          |
| `providers/` | Busca de lugares (Photon), países e cidades, atrás de interfaces trocáveis.                                                                                                                      |
| `ui/`        | Telas e painéis. `ui/stage/` é o **Palco** das animações (elenco 24 × 30, momentos, avaliador). `useCanEdit` esconde a edição de quem só vê.                                                     |

A nuvem só existe no build com `VITE_CLOUD=1` (staging e produção); o build do GitHub Pages fica só no aparelho.

## 5. Observabilidade

- **Workers Logs** (7 dias): uma linha JSON por requisição e por ação (`msg: "op"`), com `reqId`, `trip`, `opId`, resultado e o `uid` em hash (nunca e-mail). Convites, papéis e apagadas também logam.
- **Sentry** (UE): erros do app, com mapas de código enviados pelo build do CI.
- **PostHog** (UE): eventos de uso (lista em `src/app/telemetry.ts`), desligáveis em Privacidade; só chaves permitidas, nada de texto livre.

## 6. CI/CD (GitHub Actions)

| Workflow        | Quando                                       | O que faz                                                                                                                   |
| --------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`        | push e PR                                    | typecheck, lint, testes do app e do servidor, build, e2e.                                                                   |
| `deploy.yml`    | push na `main` (staging) · manual (produção) | testes, build com nuvem, migrações D1, `wrangler deploy` (e o `www` em produção). Liga com a variável `CLOUDFLARE_READY=1`. |
| `pages.yml`     | push na `main`                               | a versão sem nuvem no GitHub Pages.                                                                                         |
| `recuperar.yml` | manual                                       | volta uma viagem no tempo (`/api/admin/restore`).                                                                           |

**Segredos:** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SENTRY_AUTH_TOKEN` (repositório) e `ADMIN_TOKEN` (ambientes do GitHub e Workers). **Variáveis públicas** por ambiente: `VITE_FIREBASE_*`, `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY`, `SENTRY_ORG`, `SENTRY_PROJECT`, `APP_URL`.

## 7. Testes

- `npm test`: motor, app e telas (Vitest + Testing Library, jsdom), incluindo a convergência e a varredura de "Só vê".
- `npm run test:worker`: o servidor no runtime dos Workers (D1 e Durable Objects de verdade, alarmes com `runDurableObjectAlarm`).
- `npm run e2e`: Playwright em 375 × 812; "celular" (sem nuvem) e "nuvem" (Worker local, login de teste, até três pessoas).
- `node scripts/smoke-live.mjs <url>`: conferência de um ambiente no ar (API, repasse do login, convites, app sem erros, Google aceitando o endereço de volta).
- `node scripts/filmstrip.mjs <momento> [variação]`: tiras de quadros das animações para o avaliador.

## 8. Custos e limites de plano

Workers Paid (US$ 5/mês) na Cloudflare; domínio ~US$ 14/ano; Firebase só para login; Sentry e PostHog no plano gratuito. Serviços de mapa e busca gratuitos, com plano B sem rede.
