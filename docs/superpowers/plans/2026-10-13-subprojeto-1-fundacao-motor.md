# Plano de implementação — Subprojeto 1: fundação + motor do roteiro

- **Spec:** `docs/superpowers/specs/2026-10-13-ludotrip-v2-design.md` (Parte II).
- **Objetivo:** um site PWA em que a pessoa cria uma viagem de qualquer formato, edita paradas, trechos, dias e Mochila sem nunca perder nada, vê a Saúde do roteiro como quests e compartilha com papéis. Tudo apoiado num motor puro e testado.
- **Arquitetura:**
  - `src/engine` (TypeScript puro, sem React e sem Firebase) é a fonte da verdade das regras.
  - A interface (React) só despacha **comandos** serializáveis para o motor.
  - A persistência fica atrás de uma interface `TripRepo`: primeiro local (IndexedDB), depois Firebase. Assim o app é testável e utilizável antes de existir backend.
- **Tecnologia:**
  - React + TypeScript (strict) + Vite
  - Zustand
  - React Router
  - Vitest + fast-check + Testing Library
  - Playwright
  - d3-geo + world-atlas
  - Firebase (Auth, Firestore, Hosting) e `vite-plugin-pwa`
  - npm como gerenciador de pacotes

**Convenções para todas as tarefas:**

- **TDD:** escrever o teste, ver falhar, implementar, ver passar e fazer o commit.
- Commits pequenos, em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Push só com autorização do mantenedor.
- Nenhum texto da interface em inglês.
- Alvos de toque ≥ 44 px, texto ≥ 12 px, contraste 4.5:1.

**Marcos e pontos de revisão:**

- Ao fim de cada marco (M0–M4), o mantenedor revisa o que foi entregue antes de seguir.
- **Ao fim do M2, o app já pode ser usado no celular sem login**, com dados locais.

---

## Estrutura de arquivos

```
src/
  engine/                 motor puro (sem DOM, sem rede)
    types.ts              tipos da gramática (spec §13)
    dates.ts              datas em UTC sem fuso do navegador
    plans.ts              chaves de dias, encaixe e fusão de planos
    legs.ts               reconciliação de trechos (ativos e arquivados)
    patch.ts              remendo inverso e verificação de conflito do Desfazer
    ops/
      nights.ts           setNights, moveBoundary, shiftStop
      structure.ts        reorderStop, insertStop, splitStopWith, removeStop
      days.ts             removeDay, swapDays, setTripStart, setTripEnd, setLock
      legs.ts             setLegMode/Times/Hubs, setLegNightsAboard, waypoints
      visits.ts           scheduleVisit, unscheduleVisit, moveVisit, setVisitMeta
      misc.ts             participantes, recursos, âncoras, ajustes de parada e viagem
    commands.ts           união de comandos + dispatch(itinerary, command)
    derive/
      days.ts             lista de dias, bate-voltas, datas estimadas
      worlds.ts           mundos por país
      bookings.ts         status de reservas e hospedagem parcial
      estimate.ts         estimativa de trecho por modo
      health.ts           Saúde do roteiro
    fixtures/             6 viagens de teste (spec §19)
    index.ts              API pública do motor
  state/
    tripStore.ts          Zustand: viagem atual, run(command), narração, Desfazer
    repo.ts               interface TripRepo
    localRepo.ts          IndexedDB (idb-keyval)
    firebaseRepo.ts       Firestore (M3)
  providers/
    places.ts             interface + Photon (debounce, cache)
  ui/
    tokens.css            tokens visuais herdados da v1 (claro e escuro)
    components/           BottomSheet, Stepper, Snackbar, Chip, Button…
    roteiro/              Summary, Faixa, StopCard, LegCard, DayList
    mochila/                 MochilaScreen, PlaceRow, DayPicker, PlaceSearch
    quests/               QuestsScreen
    mapa/                 Board (tabuleiro simples)
    onboarding/           CreateTrip (passos 1–6)
    trips/                MyTrips
    share/                ShareSheet, JoinInvite
  app/                    rotas, shell com barra inferior, login
tests/e2e/                Playwright (375×812)
firestore.rules, firebase.json, .github/workflows/ci.yml
```

---

## M0 — Base do projeto

### Tarefa 1: criar o projeto

- [x] `npm create vite@latest . -- --template react-ts` dentro do repositório; manter o README e a pasta `docs/`.
- [x] Instalar `zustand react-router-dom idb-keyval`. Para desenvolvimento: `vitest @vitest/coverage-v8 fast-check @testing-library/react @testing-library/user-event jsdom eslint prettier @playwright/test`.
- [x] `tsconfig`: `"strict": true`, `"noUncheckedIndexedAccess": true`.
- [x] Scripts em `package.json`: `dev`, `build`, `typecheck` (`tsc -b`), `lint`, `test` (`vitest run`), `test:watch`, `e2e` (`playwright test`).
- [x] `src/engine/smoke.test.ts` com `expect(1+1).toBe(2)` para provar que o Vitest roda. Rodar `npm test`: passa.
- [x] Commit: `chore: projeto Vite + React + TS com Vitest`.

### Tarefa 2: integração contínua

- [x] `.github/workflows/ci.yml`: Node LTS, `npm ci`, `typecheck`, `lint`, `test`.
- [x] Commit: `ci: typecheck, lint e testes`.

---

## M1 — Motor do roteiro (o coração)

**Regra de ouro do M1:** nenhuma operação muta a entrada. Todas devolvem:

```ts
type OpResult =
  | { ok: true; state: Itinerary; inverse: Patch; effects: Effects }
  | { ok: false; error: { code: ErrorCode; message: string; suggestions?: Suggestion[] } }
```

As mensagens de erro vêm em português e explicam o que fazer (por exemplo, "Osaka ficaria sem noites. Destrave a duração ou remova Osaka.").

### Tarefa 3: tipos

- [x] `src/engine/types.ts` com os tipos da spec §13, mais:

  ```ts
  type Effects = {
    returnedToBag: { placeId: ID; visitId: ID; from: DayRef }[]
    merged: { keptStopId: ID; removedStopId: ID }[]
    legsCreated: ID[]
    legsArchived: ID[]
    legsRestored: ID[]
    message: string
  }
  ```

- [x] Commit: `feat(engine): tipos da gramática`.

### Tarefa 4: datas

- [x] Testes em `dates.test.ts`:
  - `addDays("2030-04-01", 23) === "2030-04-24"`;
  - virada de mês e de ano;
  - `diffDays` negativo;
  - nada depende do fuso do computador (forçar `TZ=America/Sao_Paulo` e `TZ=Asia/Tokyo` no teste).
- [x] Implementar com `Date.UTC` (igual ao protótipo).
- [x] `stopWindows(it)` devolve `{ stopId, startIndex, endIndex, start, end }`, considerando `nightsAboard` dos trechos entre paradas.
  - Teste: Japão, Kyoto de 13/04 a 20/04.
  - Teste: com `start = null`, as datas vêm `null` e os índices continuam corretos.
- [x] Commit.

### Tarefa 5: planos dos dias

- [x] `plans.ts`:
  - `planKey`;
  - `growAt(it, stopId, edge, k)` e `shrinkAt(it, stopId, edge, k)` aplicam a **regra da ponta**: dias vazios entram, ou dias saem, no começo (`start`) ou no fim (`end`), com as visitas que saem indo para `returnedToBag` e `itinerary.returned`;
  - `mergeAdjacentSameDestination(it)`: as noites somam, os planos da segunda parada continuam depois dos da primeira, e o efeito `merged` é registrado.
- [x] Testes:
  - `shrinkAt(end, 2)` de 7 → 5 devolve as visitas dos dias 6 e 7; `shrinkAt(start, 2)` devolve as dos dias 1 e 2 e os outros mantêm as datas;
  - `growAt(start, 1)` cria um dia vazio no começo e não muda a data dos demais;
  - fundir Tóquio 2 + Tóquio 2 dá 4 noites, com os planos na ordem.
- [x] Commit.

### Tarefa 6: reconciliação de trechos

- [x] `legs.ts` com `reconcileLegs(it, newId)`:
  - pares vizinhos = `home → s0`, `si → si+1`, `sN → home`;
  - um trecho existente com o mesmo par é **mantido**;
  - um trecho em `archivedLegs` com o mesmo par é **restaurado**;
  - senão, é **criado** com `defaultMode` (com `fromHub`/`toHub` vazios);
  - trechos ativos cujo par sumiu vão para `archivedLegs` **se tiverem conteúdo** (horários, pontas, `waypoints`, `nightsAboard > 0`) e são descartados se estiverem vazios.
- [x] Teste-chave: Japão. Pôr horário 06:12 no trecho Kyoto → Tóquio, mover Kyoto para o topo (o trecho é arquivado) e mover de volta: o trecho volta **com 06:12**.
- [x] Commit.

### Tarefa 7: remendo inverso e Desfazer seguro

- [x] `patch.ts`:
  - `makePatch(before, after)` registra só as partes tocadas: `stops`, `legs`, `archivedLegs`, chaves de `plans`, `start`, `lock`, `departurePlan`, `resources`, `anchors`, `travelers`;
  - `applyPatch(current, patch)` devolve `{ ok:false, code:"CHANGED_SINCE" }` se alguma parte tocada estiver diferente de `patch.after`.
- [x] Testes:
  - `applyPatch(op(s).state, op(s).inverse)` reproduz `s` em igualdade profunda;
  - se outra edição mexeu nas mesmas paradas, o resultado é `CHANGED_SINCE`;
  - se outra edição mexeu em partes diferentes, o Desfazer é aplicado.
- [x] Commit.

### Tarefa 8: noites

- [x] Testes primeiro, depois a implementação de `ops/nights.ts`:
  - `setNights(Kyoto, 8, {kind:"return"})`: a volta vai para 25/04 e o novo dia vazio entra no fim de Kyoto.
  - `setNights(Kyoto, 8, {kind:"stop", stopId: Tóquio final})`: Tóquio final de 4 → 3 perdendo o **primeiro** dia; a volta continua em 24/04.
  - `setNights(Tóquio inicial, 3, {kind:"stop", stopId: Osaka})` (doadora distante):
    - Ginzan, Tóquio, Kawaguchiko, Tóquio e Kamakura deslocam 1 dia, com os planos indo junto;
    - Tóquio inicial ganha o dia no fim;
    - Osaka perde o primeiro dia.
  - Doadora com 1 noite dá erro `DONOR_TOO_SHORT`; `suggestDonors` traz Osaka primeiro, depois Kyoto…
  - `setNights(Tóquio final, 3, {kind:"open"})`: 1 noite em aberto no fim de Tóquio.
  - `setNights(…, 0)` dá erro `MIN_ONE_NIGHT`.
  - `moveBoundary(Osaka|Kyoto, −2)` (regra da ponta):
    - Osaka 2 perde os 2 últimos dias (Nara e Shinsekai voltam à mochila);
    - Kyoto 9 ganha 2 dias vazios **no começo**;
    - Gion continua em 13/04.
  - `shiftStop(Kyoto, +1)`: Osaka ganha 1 dia no fim; Tóquio final perde o primeiro; os planos de Kyoto andam junto (Gion vai para 14/04).
  - `shiftStop` na primeira parada dá erro `NEEDS_BOTH_NEIGHBORS`.
  - A vizinha que ganha a noite recebe o dia vazio. É o defeito que o protótipo achou e precisa de teste próprio.
- [x] Commit.

### Tarefa 9: estrutura

- [x] Testes, depois `ops/structure.ts`:
  - `reorderStop(Kyoto, 0)` (começar por Kyoto): datas e trechos se refazem; as Tóquio que ficarem vizinhas se fundem e o efeito `merged` é registrado.
  - `insertStop` 🔒 cede noites da parada de referência; 🔓 estende a viagem.
  - `splitStopWith(Kyoto, 4, novo, tokyo, 2, cauda)` 🔒 resulta em Kyoto 4 → Tóquio 2 → Kyoto 1, com as visitas dos dias 6 e 7 de Kyoto em `returnedToBag`. Kyoto I e II usam o mesmo `destinationId`.
  - `splitStopWith` que deixaria uma parte sem noites dá erro `SPLIT_TOO_SMALL`, com sugestões `insert-before` e `insert-after`.
  - `removeStop(Ginzan)`: vira **1 noite em aberto** com as mesmas datas; as visitas voltam à mochila; o Destino continua em "Destinos guardados".
  - Duas noites em aberto que ficam vizinhas se fundem.
  - `fillOpen(aberto, Hakone)` preenche o espaço; `fillOpen` com só parte das noites deixa o resto em aberto.
  - `stretchInto(aberto, "before")`: Tóquio inicial ganha dias vazios no fim.
  - Tóquio | aberto | Tóquio + `stretchInto` vira **uma** Tóquio com os planos das duas partes (o cenário do mantenedor).
  - `closeOpen` encurta a viagem e antecipa as cidades seguintes.
  - Remover a única parada deixa todas as noites em aberto; `closeOpen` recusa encurtar até zero.
- [x] Commit.

### Tarefa 10: dias e viagem

- [x] Testes, depois `ops/days.ts`:
  - `removeDay(dia 2 de Tóquio final, {kind:"open"})`: as visitas do dia 2 voltam à mochila; os dias 3 e 4 antecipam um dia; aparece 1 noite em aberto logo depois de Tóquio; as cidades seguintes e a volta não mudam.
  - `removeDay(…, {kind:"return"})`: a volta antecipa 1 dia.
  - `removeDay(…, {kind:"stop", stopId: anterior})`: o buraco fecha pelo lado de quem ganha: os dias antes do removido avançam 1 dia e a anterior ganha 1 dia no fim.
  - `swapDays` na mesma parada; entre paradas diferentes dá erro.
  - `setTripStart`: desloca tudo; `null` passa para dias relativos.
  - `setTripEnd` encurtando exige `takeFrom`; a interface sugere a parada mais longa.
  - `setLock`.
- [x] Commit.

### Tarefa 11: trechos

- [x] Testes, depois `ops/legs.ts`:
  - modo, horários (`arrDayOffset`) e pontas;
  - `setLegNightsAboard(1)` 🔒: a vizinha cede 1 noite e aparece um dia do tipo `leg`;
  - `addWaypoint`/`removeWaypoint`.
- [x] Commit.

### Tarefa 12: visitas e ajustes

- [x] Testes, depois `ops/visits.ts` e `ops/misc.ts`:
  - agendar o mesmo lugar em dois dias é permitido;
  - desagendar, mover visita, editar metadados;
  - participantes, recursos e âncoras;
  - pouso, noites tentativas, ritmo, modo padrão e viajantes.
- [x] Commit.

### Tarefa 13: comandos

- [x] `commands.ts`:
  - `type Command = { type: "setNights"; stopId; nights } | …` (um por operação, todos serializáveis);
  - `dispatch(itinerary, command, ids: () => ID)`: os ids novos vêm de fora, para manter o motor determinístico.
- [x] Teste: `JSON.parse(JSON.stringify(cmd))` despachado dá o mesmo resultado. É isso que permite a fila offline e as transações.
- [x] Commit.

### Tarefa 14: derivações

- [x] Testes com as fixtures, depois `derive/*`:
  - `days()`: 24 dias no Japão; o dia 11/04 é bate-volta a Nara; o dia 24/04 é o dia de volta.
  - `worlds()`: Europa tem 3 mundos.
  - `bookingStatus()`: `ok`, `out-of-window`, `orphan` (reordenar Kyoto deixa a passagem Kyoto → Tóquio órfã) e `wrong-mode` (passagem de trem num trecho que virou ônibus).
  - `suggestDonors()`: ordem por proximidade, com a prévia do efeito.
  - `lodgingGaps()`: depois de `moveBoundary(Osaka|Kyoto, −2)`, Kyoto tem as noites 11/04 e 12/04 sem hospedagem.
  - `estimateLeg()`: os mesmos fatores do protótipo.
  - `health()`: cada tipo de pendência da spec §15, com alvo para "Ver".
- [x] Commit.

### Tarefa 15: fixtures e invariantes

- [x] `fixtures/`: Japão, Rio, Portugal de carro, Europa com voos, cruzeiro, Caminho de Santiago (spec §19).
- [x] `invariants.test.ts` com fast-check:
  - gerar sequências de 1 a 30 comandos aleatórios válidos e inválidos sobre cada fixture;
  - verificar as 9 invariantes da spec §16 depois de cada passo;
  - verificar o Desfazer: aplicar todos os inversos em ordem reversa reproduz a fixture original;
  - `numRuns: 1000` por fixture.
- [x] `npm test` precisa passar com cobertura de linhas ≥ 90% em `src/engine`.
- [x] Commit: `test(engine): invariantes com sequências aleatórias`.

**Ponto de revisão M1:** mostrar ao mantenedor o relatório de testes e uma demonstração no terminal dos cenários da spec §5.3.

**Andamento (2026-10-13):** M1 entregue.

- 121 testes; as invariantes rodam 1.000 sequências aleatórias por viagem (6.000 por execução); cobertura de linhas do motor ≈ 99%.
- Desvios do plano: os planos dos dias ficaram em `Stop.days` e `Leg.aboard` (sem `plans.ts`); `core.ts` reúne linha do tempo, regra da ponta, fusão e reconciliação de trechos; as mensagens ficaram em `narrate.ts` (`describeEffects` com prévia, `describeError`, `describeIssue`).
- Para a revisão, em vez da demonstração no terminal: o **laboratório do motor** (`npm run lab`, ou `npm run lab:build` para um HTML único), uma tela simples que usa o motor de verdade.

---

## M2 — App local (sem login), usável no celular

_Reescrito em 2026-10-13 depois do retorno ao laboratório (spec §17 revisada). O laboratório do motor sai de cena: o M2 é o app de verdade._

**Decisões técnicas do M2:**

- **React 18.3** (não 19): a prévia para o mantenedor é um artifact, que carrega bibliotecas grandes por CDN em versão UMD, e o React 19 não tem UMD. Nada do código depende do 19.
- Navegação pelo estado do app (abas e telas); rotas com URL entram junto com o PWA no M4.
- Estado em Zustand; persistência em IndexedDB (idb-keyval) atrás de `TripRepo`, com memória como plano B.
- Arrastar com pointer events próprios (sem biblioteca): a Trilha tem regras que nenhuma biblioteca cobre.

### Tarefa 16: base visual e componentes

- [ ] `ui/tokens.css` (guia de vibe, claro e escuro), fontes, botões de tinta, selos, carimbo 済, pétalas com vento.
- [ ] Componentes: `Sheet` (painel que sobe; Esc e fundo fecham), `Stepper`, `Toast` (com Desfazer), `Seal`, `XpFloat`, `LevelUp`.

### Tarefa 17: documento da viagem e Desfazer em tudo

- [ ] `app/doc.ts` (puro): `TripDoc = { meta, itinerary, destinations, places, bookings }` e `runDoc(doc, action)` para comandos do motor e da mochila/reservas, devolvendo o inverso. Ações compostas viram uma entrada só de Desfazer.
- [ ] `engine/derive`: `tripPhase(it, today)` e `progress(it, data)` (XP, nível, tarefas).
- [ ] Testes: cada ação de mochila e reserva desfaz exatamente; XP sobe e volta com Desfazer.

### Tarefa 18: repositório local e store

- [ ] `TripRepo` com IndexedDB e memória; `store.ts` com viagens, viagem aberta, pilha de Desfazer, aviso e comemorações.

### Tarefa 19: Trilha

- [ ] Régua de dias, blocos, ícones de transporte, bandeiras, zoom "Dias"/"Ver tudo".
- [ ] `trilha/intent.ts` (puro, testado): pegador → noites; bloco → empurrar, reordenar ou lixeira; prateleira → dividir, inserir ou preencher.
- [ ] Gestos com prévia ao vivo pelo `preview()` do motor; lixeira com "puf"; menu da cidade com as ações em palavras.

### Tarefa 20: cidades, trechos e dias

- [ ] Cartões de cidade, noites em aberto e trecho (interruptor de passagem, horários, meio, noites a bordo, "+ Cidade aqui").
- [ ] Dias com figurinhas por turno, remover dia, trocar dias; bandeja de figurinhas com arrastar e tocar.

### Tarefa 21: Mochila (álbum)

- [ ] Páginas por destino com progresso, figurinhas com moldura de raridade, nova figurinha com a raridade no ato, painel da figurinha, destinos guardados, página completa.

### Tarefa 22: Quests

- [ ] Textos do `describeIssue`, "Ver", resoluções num toque, lista vazia comemorativa.

### Tarefa 23: Mundo (tabuleiro) e HUD

- [ ] Tabuleiro com `world-atlas` + `d3-geo`, trilha, fases, pílulas, sprites; contagem grande; HUD com contagem e nível.

### Tarefa 24: Minhas viagens, exemplos e criar viagem

- [ ] Lista local, exemplos copiáveis, criação em passos com lista offline de cidades e "Mundo criado!".

### Tarefa 25: prévia para o mantenedor

- [ ] `npm run preview:artifact` gera um HTML único (React 18 e d3 por CDN; o resto embutido) para publicar como artifact.
- [ ] Conferir o inventário da experiência antes de mostrar.

**Ponto de revisão M2:** o mantenedor testa a prévia no celular. _(Feito: 16 pontos de retorno; ver `docs/aprendizados.md`.)_

---

## M3 — Mapa vivo e roteiro numa tela só

_Plano de ação do retorno do M2 (2026-10-13). Entregue: fases A, B e C._

- [x] **A1** GitHub Pages (`https://eduuf.github.io/LudoTrip/`), manifest e ícones em pixel art; `BASE_PATH` no Vite.
- [x] **A2** Glossário (Mapa, Mochila, Tarefas, NÍVEL, "destino") e prioridades de ouro no `CLAUDE.md`.
- [x] **A3** Tela única: mapa + trilha + cartão do dia + roteiro; duas colunas no desktop.
- [x] **A4** Destinos genéricos: países em português, escopo da viagem, criar em 6 passos com "decido no mapa", `createItinerary` com noites em aberto, `PlaceSearch` compartilhado.
- [x] **A5** "+ Adicionar destino" antes da volta e "+ Parar no caminho" nos trechos.
- [x] **A6** Bate-volta na régua e no cartão do dia.
- [x] **A7** Cursor de dia e cartão do dia.
- [x] **B1** `frame.ts` (enquadramento puro, testado).
- [x] **B2** Adaptadores papel (d3) e tiles (MapLibre + OpenFreeMap), troca transparente.
- [x] **B3** Estilo washi (`style/washi.ts`), seigaiha como `fill-pattern`.
- [x] **B4** Camada SVG em pixels sobre o mapa (`BoardOverlay`), decoração por país.
- [x] **B5** Entrar na cidade (`CityOverlay`, `spots.ts`): lugares por dia, fichas, marcar no mapa, "+ Lugar aqui", Google Maps.
- [x] **B6** Busca online (Photon) com cache e lista própria como plano B; nova figurinha com lugar.
- [x] **B7** Figurinhas de exemplo com coordenadas e tipo.
- [x] **B8** Mapa em chunk separado; artifact em modo papel.
- [x] **C1** `route.ts` (posição pura por dia). **C2** Bonequinhos andam pela trilha; parte percorrida em vermelho.
- [x] **C3** Arrastar pela régua; "▶ Ver a viagem"; dentro da cidade segue a cidade do dia.
- [x] **C4** Porta de shoji; tutorial "Como jogar" com holofote.
- [x] **C5** Fumaça ponta a ponta com Playwright (375 × 812) no CI.
- [x] **C6** Spec §7, §8 e §17; inventário; aprendizados; este plano.

**Ponto de revisão M3:** o mantenedor testa no celular em `https://eduuf.github.io/LudoTrip/`.

---

## M3.1 — Revisão de uso: bugs, a jornada das atividades e clareza

_Resposta aos 9 pontos do retorno do M3 (plano aprovado em `~/.claude/plans/magical-weaving-waffle.md`)._

- [x] **A1** Mapa que sumia em produção: especificidade sobre o CSS do MapLibre, adaptador sem tamanho é descartado, abas montadas e escondidas; e2e com tiles simulados mede o canvas.
- [x] **A2** Arrastar na trilha no toque: levantado síncrono, 450 ms com o bloco inflando, alça ⋮⋮, continuação por eventos de toque; e2e de toque via CDP.
- [x] **A3** Viagens: apagar com Desfazer, renomear, abrir um exemplo reaproveita a cópia, migração leve de coordenadas.
- [x] **B1** "figurinha" → "atividade"; aba Atividades; tutorial e textos.
- [x] **B2** Cartão do destino: dias à vista com "+ Atividade", "⋯" com o raro, atividades sem dia dentro do cartão; sem "noites incertas".
- [x] **B3** Tocar na trilha leva ao cartão (sem menu).
- [x] **B4** Painel "Nova atividade" (sugestões perto do destino, tipo, prioridade, chips sem dia).
- [x] **B5** Hospedagem com nome e "já reservei".
- [x] **B6** "Sua viagem" (nome, quem vai, de onde saem, datas) pelo HUD.
- [x] **C1** "+ Adicionar destino" destacado em todos os lugares.
- [x] **C2** Modo dia/noite (automático · claro · escuro); tiles e partículas seguem.
- [x] **C3** Palavras; **C4** contagem compacta no mapa e partículas por destino; **C5** docs.

**Ponto de revisão M3.1:** o mantenedor testa no celular em `https://eduuf.github.io/LudoTrip/`.

## M3.2 — Mouse × toque, criar atividade e micro-detalhes

_Resposta aos 13 pontos do retorno do M3.1 (plano em `~/.claude/plans/magical-weaving-waffle.md`)._

- [x] **A1** Criar atividade pelo mapa: `setPlacing(null)` não fecha mais o painel; faixa "Marque no mapa…" com "Não adicionar" (e sem borbulhar o clique).
- [x] **A2** Campos com 16 px e date/time em flex (iOS). **A3** Comemoração: "todas as atividades já têm dia marcado".
- [x] **B1** Trilha por entrada: mouse levanta ao mover 6 px e rola pela régua/roda; dedo segura 450 ms; textos por `pointer: coarse`.
- [x] **B2** Atividades dos dias arrastam entre dias e para "sem dia" (`chipDrag`), inclusive do cartão do dia.
- [x] **B3** Pegadores: pílulas com setas ◂▸, cursor ⟷, aceno ao abrir.
- [x] **C1** "Nova atividade" com prioridade selecionável e "Criar atividade". **C2** Cidade segue o dia (`setCursorDay`). **C3** Criar viagem: "Vão dormir em outra cidade?" / "Em quais cidades vão dormir?".
- [x] **D1** Aviso no topo com painel aberto. **D2** Contagem compacta; resumo na trilha. **D3** Tema binário. **D4** Docs e memória.

**Ponto de revisão M3.2:** o mantenedor testa no PC e no celular em `https://eduuf.github.io/LudoTrip/`.

## M4 — Contas, nuvem e compartilhamento

**O mantenedor precisa fazer antes deste marco:**

- criar o projeto no console do Firebase (plano Spark gratuito);
- ativar Authentication com Google e link por e-mail;
- criar o Firestore em `southamerica-east1`;
- passar as chaves públicas da web (vão para `.env`).

Eu deixo o passo a passo pronto em `docs/setup-firebase.md`.

### Tarefa 26: Firebase e emuladores

- [ ] `firebase.json` com emuladores de auth, firestore e hosting.
- [ ] `src/firebase.ts` com `initializeFirestore` e `persistentLocalCache`.
- [ ] `firebaseRepo.ts` implementando `TripRepo`.
- [ ] Commit.

### Tarefa 27: login

- [ ] Tela de entrada com Google e link por e-mail, no visual da v1.
- [ ] Rotas protegidas.
- [ ] Ao entrar pela primeira vez, as viagens locais podem ser levadas para a conta ("Levar minhas viagens para a nuvem").
- [ ] Commit.

### Tarefa 28: operações em transação

- [ ] `run(id, cmd)` dentro de `runTransaction`:
  - ler `trips/{id}`;
  - `dispatch`;
  - gravar `itinerary` com `version + 1`;
  - registrar em `feed`.
- [ ] Ouvintes `onSnapshot` atualizam o store.
- [ ] Teste no emulador: dois clientes fazem `setNights` ao mesmo tempo em paradas diferentes, e os dois efeitos sobrevivem.
- [ ] Commit.

### Tarefa 29: fila offline

- [ ] Sem rede, os comandos vão para a fila no IndexedDB e são aplicados otimisticamente.
- [ ] Na reconexão, são reaplicados em ordem, cada um em transação.
- [ ] Uma falha vira aviso com o motivo do motor.
- [ ] Teste: emulador desligado → 3 comandos → religado → estado final correto.
- [ ] Commit.

### Tarefa 30: regras de segurança

- [ ] `firestore.rules` conforme a spec §18.
- [ ] `tests/rules.test.ts` com `@firebase/rules-unit-testing`:
  - não membro não lê;
  - Leitor não escreve;
  - Editor escreve o itinerário mas não mexe em membros;
  - Dono muda papéis;
  - convite válido dá exatamente o papel do convite;
  - convite revogado ou vencido não dá acesso.
- [ ] Commit.

### Tarefa 31: compartilhar

- [ ] `ShareSheet`:
  - criar link com papel e validade;
  - botão "Enviar" usando o compartilhamento do celular (Web Share API, com "Copiar link" como alternativa);
  - lista de membros com troca de papel e remoção (só o Dono);
  - revogar links.
- [ ] `JoinInvite` em `/convite/:token`, com login e entrada na viagem.
- [ ] Commit.

### Tarefa 32: histórico

- [ ] Tela "Histórico" simples a partir de `feed` (quem e o quê).
- [ ] Commit.

**Ponto de revisão M4:** o mantenedor cria uma viagem, convida uma pessoa como Editora e outra como Leitora, e as duas testam.

---

## M5 — PWA completo, testes ponta a ponta e publicação definitiva

_O manifest, os ícones e a fumaça ponta a ponta já existem desde o M3; aqui entram o cache offline (app, contornos e tiles da viagem), mais jornadas e a publicação com conta própria._

### Tarefa 33: PWA

- [ ] `vite-plugin-pwa`: manifest "LudoTrip" com ícones e cor do tema, e cache do app e dos dados do `world-atlas`.
- [ ] Dica discreta de "Adicionar à tela inicial".
- [ ] Commit.

### Tarefa 34: jornadas ponta a ponta

- [ ] Playwright em 375×812, contra os emuladores. Um teste por linha da spec §5.3, sobre as fixtures:
  - deslocar Kyoto;
  - começar por Kyoto (passagem órfã);
  - encaixar Tóquio no meio de Kyoto;
  - mais e menos noites;
  - remover dia;
  - trocar dias;
  - trocar trem por carro (aviso de direção longa);
  - voo remarcado;
  - encurtar a viagem;
  - fusão de cidades iguais;
  - edição offline.
- [ ] Cada teste verifica também o Desfazer.
- [ ] Commit.

### Tarefa 35: acessibilidade e desempenho

- [ ] `@axe-core/playwright` sem violações graves nas 4 telas.
- [ ] Orçamento de tamanho: carga inicial < 250 KB gzip, sem o mapa.
- [ ] Commit.

### Tarefa 36: publicação e LGPD

- [ ] Páginas "Privacidade" e "Excluir minha conta" (a exclusão remove as viagens das quais a pessoa é Dona e a tira das demais).
- [ ] `docs/deploy.md`: `firebase deploy` (hosting + rules) e configuração de **alerta de orçamento**.
- [ ] O mantenedor executa a publicação com a conta dele.
- [ ] Commit.

**Ponto de revisão final:** checklist da spec §20 (critérios de aceite), item por item.
