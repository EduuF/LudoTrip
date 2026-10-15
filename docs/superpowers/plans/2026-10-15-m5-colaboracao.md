# Plano de implementação — M5: colaboração

- **Spec:** `docs/superpowers/specs/2026-10-14-publicacao-contas-colaboracao-design.md` (§4, §5.1, §5.6, §5.7, §8 M5).
- **Objetivo:** quem tem uma viagem na nuvem chama outras pessoas para planejar junto ou só acompanhar:
  - convite por link, em 3 toques;
  - a pessoa abre o link, vê a prévia sem conta, entra e cai direto na viagem;
  - todos editam ao mesmo tempo e veem quem fez o quê;
  - o Dono decide quem fica, passa a viagem e apaga para todos com 30 dias para voltar atrás.
- **Fora do M5:**
  - **convite por e-mail:** "Por e-mail" aparece desativado com "Em breve"; o envio liga no M6 (Email Sending da Cloudflare no `ludotrip.app`);
  - prévia do link com imagem (M6, §6.7).
- **Antes de começar:** nada para o mantenedor fazer (spec §9). O guia `docs/guias/M5-o-que-voce-precisa-fazer.md` só descreve a revisão: duas contas extras (outra conta Google ou outro e-mail) e dois aparelhos.

## Arquitetura do M5

```
navegador                                      Worker "ludotrip"
─────────                                      ─────────────────
/convite/<token>  prévia sem conta ─────────── GET  /api/invites/<token>          (sem login)
                  "Entrar e participar" ────── POST /api/invites/<token>/accept
PESSOAS           membros, convites ────────── GET  /api/trips/<id>/people
CONVIDAR          papel, vai viajar, link ──── POST /api/trips/<id>/invites
                  cancelar ─────────────────── DELETE /api/trips/<id>/invites/<inviteId>
membro            papel, tirar, sair ───────── PATCH/DELETE /api/trips/<id>/members/<uid>
                  passar a viagem ──────────── POST /api/trips/<id>/transfer
Apagadas          apagar, recuperar ────────── DELETE /api/trips/<id> · POST /api/trips/<id>/restore
Histórico         quem fez o quê ───────────── GET  /api/trips/<id>/history
WebSocket         + presence, people, role, joined (TripRoom → aparelhos)
```

- **D1 continua a fonte da verdade de quem pode o quê.** O `TripRoom` guarda o papel na conexão; quando o papel muda, o Worker avisa o `TripRoom` (RPC), que atualiza as conexões abertas na hora.
- **O "Convidado" no mapa é um viajante de verdade** (`itinerary.travelers`), criado por uma ação comum (`setTravelers`) no momento do convite. Aceitar liga esse viajante à conta (`userId`, nome) por uma ação do sistema que o `TripRoom` aplica com o mesmo `runDoc`.
- **Protocolo:** as mensagens novas do servidor são só acréscimos. Aparelhos antigos ignoram um `t` que não conhecem (o `switch` do `TripSync` não tem `default`). `PROTOCOL` continua 1.
- **"Só vê" em dois lugares:**
  - no servidor, `decide()` já recusa com `ROLE` (garantia);
  - na tela, os controles de edição não existem. Um seletor `canEdit` decide, e o `act()` do store recusa antes de tudo, com a frase "Você está vendo esta viagem.".

## Estrutura de arquivos nova

```
worker/migrations/0002_convites.sql    invites + trips.deleted_by
worker/invites.ts                      criar, listar, cancelar, prévia, aceitar
worker/members.ts                      papel, tirar, sair, passar, apagar/recuperar, histórico
worker/limits.ts                       os números da §4.7 num lugar só
src/sync/peopleApi.ts                  chamadas HTTP de pessoas e convites (sobre o httpCloudApi)
src/app/people.ts                      regras puras: quem pode o quê, textos, "há 2 h", rostos
src/app/invite.ts                      fluxo do convite no store (prévia, aceitar depois do login)
src/ui/People.tsx                      PESSOAS, CONVIDAR, membro, convite, Histórico, Apagadas
src/ui/Faces.tsx                       rostos empilhados no topo (até 3 + "+N") e o "+"
src/ui/InviteScreen.tsx                /convite/<token>
docs/guias/M5-o-que-voce-precisa-fazer.md
```

## Convenções

As mesmas do M4:

- TDD; commits pequenos em português com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push liberado.
- Antes de mexer no Worker, carregar as skills do projeto `workers-best-practices` e `durable-objects`.
- Toda rota nova nasce com log estruturado; toda jornada nova, com evento de uso (`convite_criado`, `convite_aberto`, `convite_aceito`, `membro_removido`, `saiu_da_viagem`, `viagem_passada`, `viagem_apagada`, `viagem_recuperada`, `historico_aberto`).
- Checks a cada tarefa: `typecheck`, `lint`, `test`, `test:worker`; `e2e` quando mexer em tela; `build`.

---

## M5.1 — Banco: convites, apagadas e nomes

- [x] `0002_convites.sql`:
  - `invites (id TEXT PK, token_hash TEXT UNIQUE, trip_id, role CHECK IN ('editor','viewer'), traveler_id NULL, email NULL, created_by, created_at, expires_at, used_by NULL, used_at NULL, revoked_at NULL)`, índice por `trip_id`;
    - `id` é público (12 caracteres aleatórios) e serve para cancelar; o token (128 bits) só existe no link, e o banco guarda o SHA-256;
  - `trips.deleted_by TEXT NULL`.
- [x] `worker/limits.ts`: `MAX_MEMBERS = 20`, `MAX_PENDING_INVITES = 10`, `INVITE_DAYS = 7`, `DELETED_DAYS = 30`, `MAX_TRIPS` (sai de `trips.ts`).
- [x] `myTrips` passa a ignorar `deleted_at`; `deletedTrips(uid)` lista as apagadas do Dono.
- [x] Teste do Worker: a migração roda no banco de teste (o setup já aplica todas).
- [x] Commit.

## M5.2 — Convites no Worker

- [x] Testes (`worker/invites.test.ts`):
  - **criar:** Dono cria `editor` e `viewer`; "Planeja junto" só cria `viewer` (403 `role`); "Só vê" não cria (403); 11º pendente → 403 `invites-limit`; viagem com 20 membros → 403 `full`;
  - **resposta:** `{ id, url, token, expiresAt }`; o token nunca aparece em `people` nem em log;
  - **prévia (sem login):** nome da viagem, primeiro nome de quem convidou, datas, nomes dos destinos, papel, `travelerName`. Nada de anotações, reservas ou tarefas. Token desconhecido, vencido, usado ou cancelado → `{ reason: 'invalid' }` com o primeiro nome de quem convidou, quando houver; viagem apagada → `deleted`; cheia → `full`;
  - **aceitar:** cria o membro com o papel; marca `used_by/used_at`; o segundo a aceitar recebe `used`; quem já é membro abre a viagem e o convite **continua sem uso**; com `traveler_id`, o `TripRoom` liga o viajante (`userId`, nome da conta) e avisa todos com `joined`;
  - **cancelar:** Dono ou quem criou; o link para de valer na hora.
- [x] `worker/invites.ts` e rotas em `index.ts` (`/api/invites/*` sem exigir login na prévia; o rate limit vale por IP).
- [x] `TripRoom.join(uid, name, travelerId | null)`: aplica a ação do sistema (`opId` = `join-<inviteId>`, idempotente) e manda `{ t: 'joined', uid, name }`.
- [x] Commit.

## M5.3 — Membros, papéis, passar, apagar e recuperar

- [x] Testes (`worker/members.test.ts`):
  - **mudar papel** (só o Dono; nunca para `owner` por aqui): as conexões abertas da pessoa passam a valer o papel novo na hora (`viewer` → ação seguinte recusada com `ROLE`), e ela recebe `{ t: 'role', role }`;
  - **tirar** (só o Dono) e **sair** (qualquer um menos o Dono): apaga o membro, `kick` fecha as conexões; `alsoTraveler` tira o viajante ligado à conta (ação do sistema);
  - **passar** (só o Dono, para um membro): o novo vira `owner`, o antigo vira `editor`, `trips.owner_uid` muda;
  - **apagar para todos:** `deleted_at/deleted_by`, todos recebem `{ t: 'gone', reason: 'deleted', by }`, a viagem some de "Suas viagens" e aparece em "Apagadas" (só do Dono); `restore` volta tudo; o `TripRoom` marca um alarme de 30 dias que apaga de vez (o alarme confere `deleted_at` no D1 antes);
  - **histórico:** as últimas ações aplicadas, de 50 em 50 (`before=<seq>`), com `uid`, nome, `at` e o texto narrado.
- [x] `ops` ganha a coluna `text` (o `TripRoom` narra com `narrate()` ao aplicar; `ALTER TABLE` protegido para objetos que já existem).
- [x] `TripRoom`: `setRole(uid, role)`, `people()` (aviso para reler), `presence` (quem está conectado, a cada abrir e fechar), alarme.
- [x] Commit.

## M5.4 — Cliente: API, protocolo e estado

- [x] `protocol.ts`: `presence { online: string[] }`, `people {}`, `role { role }`, `joined { uid, name }`, `gone.by?`.
- [x] `TripSync`: repassa as mensagens novas (`onPresence`, `onPeople`, `onRole`, `onJoined`); `role` troca o papel guardado na cópia (`meta.cloud.role`).
- [x] `peopleApi.ts` com testes de contrato contra o Worker de teste.
- [x] Store: `people: { members, invites, online } | null` da viagem aberta (busca ao abrir e a cada `people`); `canEdit()`; `act()` recusa para "Só vê"; avisos ao vivo com o primeiro nome ("Bia: Kyoto agora tem 5 noites"; "Bia entrou na viagem 🎉"); `gone` com `by` ("Ana apagou Japão 2030").
- [x] Rota `/convite/<token>` em `routePaths.ts`, e a intenção `acceptInvite` que sobrevive ao login (como `saveTrip`).
- [x] Commit.

## M5.5 — Telas: rostos, PESSOAS e CONVIDAR

- [x] `Faces.tsx` na 1ª linha do topo, antes do ⋯: até 3 rostos + "+N" e o "+". Anel colorido em quem está online. Viagem 📱: só o "+"; tocar oferece guardar na nuvem antes ("Para chamar alguém, a viagem vai para a sua conta"), com a intenção de abrir CONVIDAR depois.
- [x] **PESSOAS** (painel-escolha que vira editor): Quem planeja · Quem vai (o editor de viajantes sai de "Sua viagem" e mora aqui; "Sua viagem" ganha uma linha "Quem vai: Ana, Bia · Editar") · Convites aguardando.
- [x] **CONVIDAR**, 3 toques: papel → vai viajar? → enviar (Web Share no celular; "Copiar link" no computador, com "Link copiado"). "Sim, vai" cria o viajante "Convidado" na hora, com a animação de chegada (Palco: momento novo `chegou`, seguindo `docs/animacoes.md` e o avaliador).
- [x] **Membro:** papel (binário Planeja junto/Só vê), "Tirar da viagem" com o interruptor "Também sai de Quem vai?", "Passar a viagem para…". Para si mesmo: "Sair da viagem" (o Dono vê "Passe a viagem antes de sair").
- [x] **Convite:** "Link · enviado há 2 h · Planeja junto · vai viajar" [Cancelar]; vencido: o viajante fica com a etiqueta "convite vencido" [Reenviar] [Tirar].
- [x] Testes de tela (Testing Library) para cada painel, com o `peopleApi` falso.
- [x] Commit.

## M5.6 — Aceitar o convite

- [x] `InviteScreen.tsx` em `/convite/<token>`: "**Ana** te chamou para planejar **Japão 2030**", datas, destinos e o mapa em miniatura (o mesmo do cartão de "Suas viagens"), papel, [Entrar e participar].
- [x] Os casos estranhos da §4.4 com frase e saída: inválido ("Este convite não vale mais. Peça outro a Ana." [Suas viagens]), já membro (abre), apagada, cheia.
- [x] Depois do login: aceita, sobe as viagens 📱 (como hoje), abre a viagem. Um teste cobre o caminho com redirecionamento (a intenção vem do `sessionStorage`).
- [x] Commit.

## M5.7 — "Só vê"

- [x] Etiqueta "Você está vendo" no topo; tocar explica e oferece "Pedir para planejar junto" (copia uma mensagem curta para mandar ao Dono).
- [x] Sem controles de edição: o seletor `canEdit` esconde botões de criar, arrastar (trilha, atividades), menus ⋯ de editar, caixas de marcar das Tarefas; painéis editores abrem só para leitura.
- [x] **Varredura:** um teste abre a viagem como "Só vê", toca em todos os botões de todas as abas e painéis e confere que nenhuma ação chegou ao `act()` com sucesso (o padrão de `varredura.test.tsx`).
- [x] Commit.

## M5.8 — Histórico e Apagadas

- [x] "Histórico" em "Sua viagem": lista por dia ("Hoje", "Ontem", data), "Bia · 14:02 · Kyoto agora tem 5 noites", "Ver mais".
- [x] "Apagadas" no fim de "Suas viagens" (só aparece se houver): nome, "apagada há 3 dias · some em 27 dias", [Recuperar].
- [x] "Apagar para todos" (só o Dono, viagem com outros membros): painel de confirmação com o nome da viagem. Viagem só do Dono: continua com o Desfazer de hoje.
- [x] Commit.

## M5.9 — e2e com três pessoas

- [x] Projeto `nuvem` do Playwright com três contextos (login de teste `ana`, `bia`, `caio`):
  - Ana cria, convida Bia (planejar, vai viajar) e Caio (só ver);
  - Bia e Caio abrem o link, entram e caem na viagem; o "Convidado" vira "Bia";
  - Ana e Bia editam ao mesmo tempo, Bia offline por um trecho; tudo converge;
  - Caio não vê controles de edição;
  - Ana tira Caio: a viagem some para ele com o aviso;
  - Ana apaga para todos e recupera.
- [x] Commit.

## M5.10 — Publicar e revisar

- [x] Guia `docs/guias/M5-o-que-voce-precisa-fazer.md` (o roteiro da revisão da §8 M5).
- [x] Staging sozinho no push; produção pelo `workflow_dispatch` depois da conferência (`scripts/smoke-live.mjs` ganha a prévia de um convite inválido).
- [x] `docs/inventario-de-experiencia.md` e `docs/aprendizados.md` atualizados.
- [x] **Revisão do mantenedor** (validado com conta real em 15/10/2026): convida uma pessoa para planejar junto e outra para só ver; as três editam ao mesmo tempo, uma offline; depois remove uma delas.
