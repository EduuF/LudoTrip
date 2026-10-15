# Plano de implementação — M4: contas e nuvem

- **Spec:** `docs/superpowers/specs/2026-10-14-publicacao-contas-colaboracao-design.md` (§2, §3, §5, §7, §8 M4).
- **Objetivo:** quem usa sem conta continua usando igual. Quem entra (Google ou link por e-mail) tem as viagens na nuvem:
  - abre em outro aparelho;
  - edita offline;
  - nunca perde nada.

  Tudo com logs para depurar e métricas com consentimento.

- **Fora do M4:** convites, papéis além do Dono, painel PESSOAS (M5); domínio, e-mail de convite, PWA completo, busca e rotas pela API (M6).
- **Antes de começar:** o mantenedor segue `docs/guias/M4-o-que-voce-precisa-fazer.md`. As tarefas M4.1 a M4.9 **não dependem** do guia (tudo roda local, com login simulado). M4.10 em diante precisa das chaves.

## Arquitetura do M4

```
navegador                                   Cloudflare (Worker "ludotrip")
─────────                                   ──────────────────────────────
src/auth/       Firebase Auth (ou falso) ─┐  worker/index.ts   roteador: /api/*, /__/auth/* (proxy), arquivos estáticos
src/sync/       fila (IndexedDB) + WS  ───┼─ worker/auth.ts    verifica o token do Firebase (jose)
src/app/store   runDoc otimista           │  worker/db.ts      D1: users, trips, members
src/app/repo    📱 local / ☁️ cópia       └─ worker/tripRoom.ts Durable Object por viagem: runDoc + ops + WebSocket
                                             worker/log.ts     log estruturado em JSON
src/app/doc.ts  ←── o mesmo arquivo roda nos dois lados ──→
```

- **O mesmo `runDoc`** (`src/app/doc.ts`, puro, só depende do motor) roda no aparelho e no `TripRoom`.
- **A nuvem fica atrás de uma chave de build** (`VITE_CLOUD=1`). O build do GitHub Pages continua sem nuvem até o M6. Nada muda para quem usa o link antigo.
- **Login atrás de uma interface `AuthClient`**, com duas implementações:
  - `firebaseAuth` (de verdade);
  - `fakeAuth` (testes e e2e): pega um token em `/api/test/token`, rota que só existe com `TEST_AUTH=1`. Um teste garante que a config de produção não tem essa variável.

  Assim nenhum teste precisa do Google nem de Java (o emulador do Firebase pede Java).

## Estrutura de arquivos nova

```
wrangler.jsonc                    Worker + assets (dist/) + D1 + Durable Object + ratelimit + observability
worker/
  index.ts                        roteador (fetch) e export do TripRoom
  env.d.ts                        gerado por `wrangler types` (não escrever à mão)
  auth.ts                         verifyIdToken(token, env) → { uid, email, name, picture }
  db.ts                           consultas D1 (users, trips, members)
  tripRoom.ts                     Durable Object
  protocol.ts                     → reexporta src/sync/protocol.ts
  log.ts                          log({ ... }) em JSON + hash do uid
  migrations/0001_init.sql        D1
  *.test.ts                       Vitest no runtime dos Workers
vitest.workers.config.ts          projeto de teste do Worker (@cloudflare/vitest-plugin)
src/auth/
  authClient.ts                   interface + escolha da implementação
  firebaseAuth.ts                 Google (popup; redirect no app instalado) e link por e-mail
  fakeAuth.ts
src/sync/
  protocol.ts                     mensagens cliente ↔ TripRoom (tipos + versão do protocolo)
  outbox.ts                       fila de saída no IndexedDB
  syncClient.ts                   WebSocket, reconexão, remontagem (servidor + pendentes)
  cloudApi.ts                     fetch autenticado para /api
  upload.ts                       subir viagens 📱 (§3.4) e os casos da §3.5
src/app/routes.ts                 / , /v/<id>, /entrar/link ↔ estado do app
src/ui/Entrar.tsx                 painel ENTRAR
src/ui/CloudBadge.tsx             selo 📱/☁️ e ícone de nuvem
src/ui/Consent.tsx                faixa de consentimento das métricas
src/app/telemetry.ts              PostHog + Sentry atrás de uma interface (no-op sem chaves)
docs/guias/M4-o-que-voce-precisa-fazer.md
```

## Convenções

As mesmas do plano anterior, com estes acréscimos:

- **TDD:** teste, falha, implementação, passa, commit.
- **Commits** pequenos, em português, com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push liberado.
- **Antes de mexer no Worker**, carregar as skills do projeto `workers-best-practices` e `durable-objects`, e conferir a documentação que elas apontam. Nada de API de memória.
- **Versões:** a última estável publicada há pelo menos 2 semanas (hoje: `wrangler` 4.x, `@cloudflare/vitest-plugin` 1.x, compatível com o Vitest 5 do projeto, `jose` 6.x, `@sentry/react`, `posthog-js`, `firebase` 12.x ou 13.x conforme a data). Registrar em `docs/aprendizados.md` qualquer incompatibilidade encontrada.
- **Checks a cada tarefa:**
  - `npm run typecheck`, `npm run lint`, `npm test`;
  - `npm run test:worker` (novo);
  - `npm run e2e` quando mexer em tela;
  - `npm run build`.

---

## M4.1 — Ids determinísticos por ação (motor e documento)

**Por quê:** spec §5.2. `runDoc` gera `u${++seq}`, e dois aparelhos offline colidiriam.

- [x] Teste em `doc.test.ts`:
  - `runDoc(doc, action, { opId })` gera ids `${opId.slice(0,12)}.${n}`;
  - a mesma ação com o mesmo `opId` sobre o mesmo doc gera o mesmo resultado (determinismo);
  - `opId`s diferentes nunca geram o mesmo id;
  - sem `opId` (testes antigos e viagens de exemplo), usa um `opId` gerado por `crypto.randomUUID()` no store, nunca dentro do `runDoc`.
- [x] `runDoc(doc, action, ctx: { opId: string })`. `newId` usa `ctx.opId`. `seq` deixa de ser usado para ids novos.
  - `migrate()` mantém o campo para viagens antigas, sem efeito. Ids antigos `uN` continuam válidos.
- [x] O store cria o `opId` em `act()` e o guarda no `undoStack`.
- [x] Propriedade (fast-check): para sequências aleatórias de ações, reaplicar com os mesmos `opId`s sobre o doc inicial dá exatamente o mesmo doc.
- [x] Commit: `Ids novos vêm da ação (opId), não de um contador`.

## M4.2 — Desfazer por item nas coleções do documento

**Por quê:** spec §5.2. O passo `col` restaura a lista inteira e apagaria o trabalho de outra pessoa.

- [x] Testes em `doc.test.ts`:
  - desfazer `setPlace` de A, depois que outra ação mudou B na mesma lista, mantém B;
  - desfazer quando o próprio item mudou depois devolve `CHANGED_SINCE`;
  - add, remove e set de places, destinations, bookings, tasks e `taskMeta` (por chave); `rename` (meta.name).
- [x] `UndoStep` passa a ser:

  ```ts
  { kind: 'it'; patch: Patch }
  | { kind: 'item'; key: Collection; id: string; before: unknown | null; after: unknown | null; index: number }
  | { kind: 'value'; key: 'meta.name'; before; after }
  ```

  O `undoDoc` confere que o item atual é igual ao `after` (`deepEqual`, de `patch.ts`) antes de restaurar o `before`. Se o item foi removido, reinsere na posição `index` (limitada ao tamanho da lista).

- [x] O `snapshot(key)` é substituído por um registro por item dentro de cada `case`.
- [x] As invariantes antigas de Desfazer continuam passando.
- [x] Commit: `Desfazer por item: nunca apaga o que outra pessoa mudou na mesma lista`.

## M4.3 — Ação `revert` (Desfazer como ação)

- [x] Teste: `runDoc(doc, { type: 'revert', steps })` tem o mesmo efeito do `undoDoc`. É recusado com `CHANGED_SINCE` quando cabe e gera os próprios passos (dá para "refazer" pelo Desfazer do Desfazer, se um dia for preciso).
- [x] O `undo()` do store passa a ser `act({ type: 'revert', steps })`. Assim a nuvem trata o Desfazer como qualquer outra ação.
- [x] Commit.

## M4.4 — Protocolo e fila de saída (cliente, sem rede)

- [x] `src/sync/protocol.ts`:

  ```ts
  export const PROTOCOL = 1
  type ClientMsg =
    | { t: 'hello'; sinceVersion: number; protocol: number; schemaVersion: number; app: string }
    | { t: 'op'; opId: string; action: DocAction }
  type ServerMsg =
    | { t: 'snapshot'; version: number; doc: TripDoc }
    | { t: 'applied'; opId: string; version: number; action: DocAction; by: string }
    | { t: 'rejected'; opId: string; reason: EngineError }
    | { t: 'upgrade' }
    | { t: 'gone'; reason: 'deleted' | 'removed' }
  ```

- [x] `outbox.ts` (IndexedDB via `idb-keyval`, store próprio `ludotrip/outbox`):
  - `push`, `peekAll(tripId)`, `ack(opId)`, `count()`;
  - testes com o `RepoIO` falso, já usado em `repo.test.ts`.
- [x] `rebase(serverDoc, pending)`: reaplica as pendentes em ordem com os mesmos `opId`s e devolve `{ doc, refused: { opId, reason }[] }`.
- [x] Testes de `rebase`:
  - pendentes que não conflitam se somam;
  - pendente cujo alvo sumiu vai para `refused`.
- [x] Commit.

## M4.5 — Worker base, D1 e login no servidor

- [x] Carregar as skills `workers-best-practices` e `wrangler`. Instalar `wrangler`, `@cloudflare/vitest-plugin`, `@cloudflare/workers-types` e `jose`.
- [x] `wrangler.jsonc`:
  - `main: worker/index.ts`, `compatibility_date` de hoje;
  - `assets: { directory: "dist", not_found_handling: "single-page-application", run_worker_first: ["/api/*", "/__/auth/*"] }`;
  - D1 `DB`, Durable Object `TRIPS` (`TripRoom`, `new_sqlite_classes`), `ratelimits` `API` (120/60 s);
  - `observability.enabled` e `observability.traces.enabled`;
  - `env.staging` com o próprio D1 e o próprio nome de Worker.
- [x] `npx wrangler types`, gerando `worker/env.d.ts`.
- [x] `worker/migrations/0001_init.sql` com `users`, `trips` e `members` (spec §5.1; `invites` fica para o M5).
- [x] `vitest.workers.config.ts` com `cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })`.
- [x] Script `test:worker`. O CI roda os dois projetos de teste.
- [x] `auth.ts`, com testes que geram as chaves com o `jose` e passam um JWKS local:
  - token válido devolve `uid`;
  - rejeita assinatura de outra chave, `aud` ou `iss` de outro projeto, token vencido, `alg` diferente de RS256 e `sub` vazio.
- [x] `index.ts`:
  - `GET /api/health` → 200 com a conferência do D1;
  - `GET /api/me` (autenticado) → cria ou atualiza `users`;
  - `/api/test/token` só com `TEST_AUTH=1`.
  - **Teste:** com o `wrangler.jsonc` de produção, `TEST_AUTH` não existe.
- [x] Proxy `/__/auth/*` para `https://${FIREBASE_PROJECT}.firebaseapp.com`, transparente: mesmo método, corpo e cabeçalhos, sem 302.
  - **Teste:** GET e POST chegam ao destino com o mesmo caminho e query.
- [x] `log.ts`: uma linha JSON por requisição com `reqId`, rota, status, ms, `uidHash` (8 hex do SHA-256), versão do app.
  - **Teste:** e-mail e token nunca aparecem no log.
- [x] Rate limit por `uid` (ou IP sem login). Excedido → 429 com corpo `{ reason: 'rate' }`.
- [x] Commit.

## M4.6 — `TripRoom` (Durable Object)

- [x] Carregar a skill `durable-objects` e ler a página de WebSockets com hibernação e a da API SQLite.
- [x] Tabelas `doc` e `ops` (spec §5.1), criadas no construtor com `blockConcurrencyWhile` só para o esquema.
- [x] RPC:
  - `init(doc, ownerUid)`: cria a viagem, idempotente para o mesmo dono; recusa outro dono com `{ reason: 'owned' }`;
  - `meta()`;
  - `exportDoc()`.
- [x] `fetch` com WebSocket:
  - o Worker confere o token e o papel no D1 antes de repassar (`stub.fetch`);
  - o DO chama `acceptWebSocket` e guarda `{ uid, role }` com `serializeAttachment`.
- [x] `webSocketMessage`:
  - `hello`: com protocolo antigo, manda `upgrade`; senão, `snapshot` se `sinceVersion` estiver longe ou as ops que faltam.
  - `op`:
    1. `opId` repetido devolve o resultado gravado;
    2. papel `viewer` é recusado (preparação do M5);
    3. roda `runDoc`;
    4. grava `doc` e `ops` sem `await` entre as escritas (atomicidade);
    5. transmite `applied` a todos e manda `rejected` só a quem enviou;
    6. atualiza `trips` no D1 (nome, datas, `updated_at`, `size_bytes`) com `ctx.waitUntil`.
  - Viagem acima de 1 MB: recusa `{ reason: 'too-big' }`.
- [x] Testes (Vitest no runtime dos Workers):
  - estado persiste entre chamadas;
  - viagens diferentes não se misturam;
  - mesmo `opId` duas vezes aplica uma vez;
  - duas conexões recebem o `applied`;
  - `rejected` só para quem enviou;
  - `hello` com `sinceVersion` recebe só o que falta;
  - protocolo antigo recebe `upgrade`;
  - 1 MB recusado;
  - log estruturado de cada op (tipo, resultado, ms).
- [x] Rotas:
  - `POST /api/trips` (subir viagem: `init` + `members` com dono);
  - `GET /api/trips` (minhas viagens, do D1);
  - `GET /api/trips/:id/ws`;
  - `DELETE /api/trips/:id` (só o dono; no M4, apaga de vez; "Apagadas" vem no M5).
- [x] Testes de permissão: não membro não abre o WS (403); outro usuário não apaga.
- [x] Commit.

## M4.7 — Convergência (propriedade)

- [x] `src/sync/convergence.test.ts`: um servidor simulado (o mesmo `runDoc` + `ops` em memória) e 2–3 clientes `syncClient` com transporte falso que pode atrasar, reordenar entre clientes e ficar offline.
- [x] fast-check gera sequências de ações válidas a partir das fixtures (incluindo `revert`).
- [x] Ao fim, com todos online e as filas vazias:
  - todos os `doc` são iguais ao do servidor;
  - cada `opId` foi aplicado uma vez ou recusado com motivo.
- [x] 1.000 execuções no CI.
- [x] Commit.

## M4.8 — `syncClient`, `cloudRepo` e o store

- [x] `syncClient`:
  - abre o WS com o token;
  - `hello` com a versão local;
  - aplica `snapshot` e `applied` com `rebase`;
  - reconecta com espera de 1, 2, 4… até 30 s, e na hora com o evento `online`;
  - expõe `status: 'saved' | 'sending' | 'offline'` e `pending`.
- [x] O store:
  - `act()` continua otimista; se a viagem é ☁️, também faz `outbox.push` e `syncClient.send`;
  - `rejected` vira o painel de escolha da §5.3, um `sheet` `choice` com o texto do `describeError` + "(Bia, há 5 min)";
  - `applied` de outra pessoa vira aviso com `narrate`, agrupando rajadas de menos de 3 s;
  - `undoStack` só com ações próprias.
- [x] `TripMeta` ganha `cloud?: { owner: string; version: number }`. O `localRepo` guarda a cópia ☁️.
- [x] "Suas viagens" mistura as 📱 locais com as ☁️ da conta (`GET /api/trips`, com cache local para abrir offline).
- [x] Viagem ☁️ nunca baixada e sem rede: a mensagem da §5.4.
- [x] Viagem criada com alguém logado já nasce ☁️ (`POST /api/trips` assim que houver rede; até lá fica na fila como `init`).
- [x] Duas abas: `BroadcastChannel('ludotrip')` avisa as viagens 📱 salvas para a outra aba recarregar.
- [x] Testes jsdom com `fakeAuth` e transporte falso:
  - status do ícone nos 3 estados;
  - aviso de edição alheia;
  - painel de conflito;
  - viagem não baixada offline;
  - duas abas.
- [x] Commit.

## M4.9 — Endereços

- [x] `routes.ts`: `parse(location)` / `format(state)` para `/`, `/v/<id>` e `/entrar/link`.
  - O store atualiza a URL com `history.replaceState` ao abrir uma viagem ou voltar para a home. É `replaceState`, não `pushState`: o M3.8 continua dono do histórico, com uma entrada nossa.
- [x] Ao abrir o app em `/v/<id>`:
  - abre a viagem, como "estar dentro"; o primeiro Voltar leva à home, sem sair;
  - sem conta e viagem ☁️ → painel ENTRAR "para abrir esta viagem";
  - conta sem acesso → a mensagem da §3.5.
- [x] Testes jsdom e e2e:
  - recarregar dentro da viagem volta à viagem;
  - Voltar a partir do link direto vai à home;
  - os testes do M3.8 continuam passando.
- [x] Commit.

## M4.10 — Login de verdade e o painel ENTRAR

_Precisa do guia: os projetos Firebase e as chaves no `.env.local` e nos secrets._

- [x] Ler de novo `firebase.google.com/docs/auth/web/redirect-best-practices` e `/email-link-auth` (pode ter mudado). Instalar `firebase` (só `firebase/app` e `firebase/auth`, carregados sob demanda para não pesar a carga inicial).
- [x] `firebaseAuth.ts`:
  - `authDomain` = o host do próprio app;
  - Google com `signInWithPopup`; no app instalado (`display-mode: standalone`) ou com pop-up bloqueado, usa `signInWithRedirect`;
  - link por e-mail com `sendSignInLinkToEmail`:
    - `url` = `<origem>/entrar/link`, `handleCodeInApp: true`;
    - o e-mail fica no `localStorage`;
    - em `/entrar/link`, `isSignInWithEmailLink` → `signInWithEmailLink`; sem o e-mail guardado, pergunta "Confirme seu e-mail".
- [x] `Entrar.tsx` (spec §3.3):
  - `sheetLabel` com o tipo "ENTRAR" e o motivo;
  - empilha sobre o painel de origem;
  - estados: inicial, enviando, "Abra o link neste mesmo celular" com "Reenviar" depois de 60 s e "Trocar e-mail", sem internet, pop-up fechado (volta calado).
- [x] **Intenção retomada:** `openSignIn({ reason, then })` guarda a intenção. Depois do login, sobe as viagens e executa o `then`, por exemplo reabrir "Sua viagem".
- [x] "Sua conta" (no painel "Sua viagem" e na home):
  - foto e nome;
  - "Sair da conta" com o painel da fila pendente (§3.5);
  - ao sair, apaga a cópia ☁️ e a fila.
- [x] Testes jsdom com `fakeAuth`: os estados do painel, a intenção retomada, sair com pendências.
- [x] Commit.

## M4.11 — Subir as viagens e os casos estranhos

- [x] `upload.ts`, seguindo a spec §3.4 e §3.5:
  - primeiro login do aparelho: sobe todas as 📱;
  - aparelho que já teve outra conta (`localStorage` `ludotrip.lastUid`): pergunta com a lista e as caixas desmarcadas;
  - `owned` → "Levar uma cópia" (id novo);
  - falha no meio deixa a viagem 📱 e tenta de novo depois.
- [x] Animação de subida: os cartões voam do 📱 para a ☁️ (GSAP já usado), seguida do aviso "N viagens guardadas na sua conta ✓".
- [x] Selos 📱 e ☁️ nos cartões e no painel "Sua viagem"; tocar em 📱 abre ENTRAR "para guardar na nuvem".
- [x] Ícone de nuvem no topo da viagem ☁️ (§5.4), com o texto ao tocar.
- [x] **Gatilhos (§3.2):**
  - tarefa do app "Guardar a viagem na nuvem ☁️" em `autoTasks` (3+ edições, viagem 📱, com "Não preciso");
  - aviso de risco no Safari do iPhone fora da tela de início, ou com `persist()` negado, no máximo a cada 3 dias (`localStorage`);
  - a dica "Adicionar à tela inicial" com 3 passos ilustrados.
- [x] Testes (jsdom + e2e com `fakeAuth`):
  - sem conta → criar → entrar → a viagem fica ☁️ e continua aberta;
  - segunda conta no mesmo aparelho → pergunta desmarcada;
  - `owned` → cópia;
  - rede cai no meio → continua 📱 e sobe depois;
  - 2 contextos do Playwright (dois aparelhos da mesma conta) veem as edições um do outro;
  - `context.setOffline(true)` → editar → voltar → enviado.
- [x] Commit.

## M4.12 — Telemetria: Sentry e PostHog

- [x] `telemetry.ts`: `track(evento, props)`, `captureError(e)`, `identify(uidHash)`. Sem chaves (testes, GitHub Pages), não faz nada.
- [x] PostHog:
  - `api_host` `https://eu.i.posthog.com`, `cookieless_mode: 'on_reject'`;
  - gravação de sessão com todo texto e todos os campos mascarados;
  - os eventos da spec §5.7, nos pontos certos do store.
  - **Teste:** nenhuma propriedade carrega texto digitado (lista de chaves permitidas).
- [x] `Consent.tsx`: faixa na primeira abertura, "Podemos medir como o app é usado (sem ler suas viagens)?" [Pode] [Prefiro não]. A escolha fica em "Sua conta". Sem resposta, nada é enviado.
- [x] Sentry:
  - `@sentry/react` com error boundary;
  - `@sentry/vite-plugin` envia os mapas de código no build do CI (`SENTRY_AUTH_TOKEN`) e os apaga do `dist`;
  - `uid` em hash;
  - também captura as falhas de sincronização e as recusas inesperadas.
- [x] Commit.

## M4.13 — Deploy e CI

- [x] `.github/workflows/deploy.yml`:
  - push na `main`: testes e `wrangler deploy --env staging` (URL de teste do mantenedor), com `cloudflare/wrangler-action@v4`;
  - `workflow_dispatch`: produção;
  - antes do deploy, `wrangler d1 migrations apply` no ambiente certo;
  - as variáveis `VITE_*` (Firebase, PostHog, Sentry) vêm dos secrets e variables do GitHub.
- [x] O workflow do Pages continua igual (sem nuvem).
- [x] `docs/deploy.md`: deploy, migração do D1, `wrangler rollback`, recuperação de uma viagem no tempo (§5.8) e onde ver os logs.
- [x] Rota de administração `POST /api/admin/restore`, protegida por um segredo `ADMIN_TOKEN` com comparação em tempo constante: volta um `TripRoom` para um horário.
  - **Teste:** sem o token, 403.
- [x] Commit.

## M4.14 — Fechamento

- [ ] Rodar tudo: typecheck, lint, test, test:worker, build, e2e.
- [ ] Teste no aparelho real, na URL de staging, como o mantenedor vai fazer: usar sem conta, entrar com Google e por link de e-mail, abrir em outro celular, editar offline (modo avião), sair.
- [ ] Atualizar:
  - `docs/inventario-de-experiencia.md`: selos, ENTRAR, nuvem;
  - `docs/aprendizados.md`, com as fontes;
  - `CLAUDE.md`: comandos `test:worker`, `wrangler dev` e a regra da intenção retomada;
  - a memória do projeto.
- [ ] Commit, push, CI verde.

**Ponto de revisão M4:** o mantenedor, na URL de staging, no celular:

1. cria uma viagem sem conta;
2. toca em 📱 e entra com Google; a viagem sobe e continua aberta;
3. abre a mesma conta noutro celular ou no computador; a viagem está lá;
4. edita nos dois ao mesmo tempo e vê as mudanças chegarem;
5. põe um em modo avião, edita, volta a conexão e confere;
6. entra com link de e-mail num terceiro navegador;
7. sai da conta.
