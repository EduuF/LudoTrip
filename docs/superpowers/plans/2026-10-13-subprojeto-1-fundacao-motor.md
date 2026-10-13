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
- [ ] `npm create vite@latest . -- --template react-ts` dentro do repositório; manter o README e a pasta `docs/`.
- [ ] Instalar `zustand react-router-dom idb-keyval`. Para desenvolvimento: `vitest @vitest/coverage-v8 fast-check @testing-library/react @testing-library/user-event jsdom eslint prettier @playwright/test`.
- [ ] `tsconfig`: `"strict": true`, `"noUncheckedIndexedAccess": true`.
- [ ] Scripts em `package.json`: `dev`, `build`, `typecheck` (`tsc -b`), `lint`, `test` (`vitest run`), `test:watch`, `e2e` (`playwright test`).
- [ ] `src/engine/smoke.test.ts` com `expect(1+1).toBe(2)` para provar que o Vitest roda. Rodar `npm test`: passa.
- [ ] Commit: `chore: projeto Vite + React + TS com Vitest`.

### Tarefa 2: integração contínua
- [ ] `.github/workflows/ci.yml`: Node LTS, `npm ci`, `typecheck`, `lint`, `test`.
- [ ] Commit: `ci: typecheck, lint e testes`.

---

## M1 — Motor do roteiro (o coração)

**Regra de ouro do M1:** nenhuma operação muta a entrada. Todas devolvem:

```ts
type OpResult = { ok: true; state: Itinerary; inverse: Patch; effects: Effects }
              | { ok: false; error: { code: ErrorCode; message: string; suggestions?: Suggestion[] } };
```

As mensagens de erro vêm em português e explicam o que fazer (por exemplo, "Osaka ficaria sem noites. Destrave a duração ou remova Osaka.").

### Tarefa 3: tipos
- [ ] `src/engine/types.ts` com os tipos da spec §13, mais:

  ```ts
  type Effects = {
    returnedToBag: { placeId: ID; visitId: ID; from: DayRef }[];
    merged: { keptStopId: ID; removedStopId: ID }[];
    legsCreated: ID[];
    legsArchived: ID[];
    legsRestored: ID[];
    message: string;
  };
  ```

- [ ] Commit: `feat(engine): tipos da gramática`.

### Tarefa 4: datas
- [ ] Testes em `dates.test.ts`:
  - `addDays("2030-04-01", 23) === "2030-04-24"`;
  - virada de mês e de ano;
  - `diffDays` negativo;
  - nada depende do fuso do computador (forçar `TZ=America/Sao_Paulo` e `TZ=Asia/Tokyo` no teste).
- [ ] Implementar com `Date.UTC` (igual ao protótipo).
- [ ] `stopWindows(it)` devolve `{ stopId, startIndex, endIndex, start, end }`, considerando `nightsAboard` dos trechos entre paradas.
  - Teste: Japão, Kyoto de 13/04 a 20/04.
  - Teste: com `start = null`, as datas vêm `null` e os índices continuam corretos.
- [ ] Commit.

### Tarefa 5: planos dos dias
- [ ] `plans.ts`:
  - `planKey`;
  - `growAt(it, stopId, edge, k)` e `shrinkAt(it, stopId, edge, k)` aplicam a **regra da ponta**: dias vazios entram, ou dias saem, no começo (`start`) ou no fim (`end`), com as visitas que saem indo para `returnedToBag` e `itinerary.returned`;
  - `mergeAdjacentSameDestination(it)`: as noites somam, os planos da segunda parada continuam depois dos da primeira, e o efeito `merged` é registrado.
- [ ] Testes:
  - `shrinkAt(end, 2)` de 7 → 5 devolve as visitas dos dias 6 e 7; `shrinkAt(start, 2)` devolve as dos dias 1 e 2 e os outros mantêm as datas;
  - `growAt(start, 1)` cria um dia vazio no começo e não muda a data dos demais;
  - fundir Tóquio 2 + Tóquio 2 dá 4 noites, com os planos na ordem.
- [ ] Commit.

### Tarefa 6: reconciliação de trechos
- [ ] `legs.ts` com `reconcileLegs(it, newId)`:
  - pares vizinhos = `home → s0`, `si → si+1`, `sN → home`;
  - um trecho existente com o mesmo par é **mantido**;
  - um trecho em `archivedLegs` com o mesmo par é **restaurado**;
  - senão, é **criado** com `defaultMode` (com `fromHub`/`toHub` vazios);
  - trechos ativos cujo par sumiu vão para `archivedLegs` **se tiverem conteúdo** (horários, pontas, `waypoints`, `nightsAboard > 0`) e são descartados se estiverem vazios.
- [ ] Teste-chave: Japão. Pôr horário 06:12 no trecho Kyoto → Tóquio, mover Kyoto para o topo (o trecho é arquivado) e mover de volta: o trecho volta **com 06:12**.
- [ ] Commit.

### Tarefa 7: remendo inverso e Desfazer seguro
- [ ] `patch.ts`:
  - `makePatch(before, after)` registra só as partes tocadas: `stops`, `legs`, `archivedLegs`, chaves de `plans`, `start`, `lock`, `departurePlan`, `resources`, `anchors`, `travelers`;
  - `applyPatch(current, patch)` devolve `{ ok:false, code:"CHANGED_SINCE" }` se alguma parte tocada estiver diferente de `patch.after`.
- [ ] Testes:
  - `applyPatch(op(s).state, op(s).inverse)` reproduz `s` em igualdade profunda;
  - se outra edição mexeu nas mesmas paradas, o resultado é `CHANGED_SINCE`;
  - se outra edição mexeu em partes diferentes, o Desfazer é aplicado.
- [ ] Commit.

### Tarefa 8: noites
- [ ] Testes primeiro, depois a implementação de `ops/nights.ts`:
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
- [ ] Commit.

### Tarefa 9: estrutura
- [ ] Testes, depois `ops/structure.ts`:
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
  - Remover a única parada dá erro `LAST_STOP`.
- [ ] Commit.

### Tarefa 10: dias e viagem
- [ ] Testes, depois `ops/days.ts`:
  - `removeDay(dia 2 de Tóquio final, {kind:"open"})`: as visitas do dia 2 voltam à mochila; os dias 3 e 4 antecipam um dia; aparece 1 noite em aberto logo depois de Tóquio; as cidades seguintes e a volta não mudam.
  - `removeDay(…, {kind:"return"})`: a volta antecipa 1 dia.
  - `removeDay(…, {kind:"stop", stopId: anterior})`: o buraco fecha pelo lado de quem ganha: os dias antes do removido avançam 1 dia e a anterior ganha 1 dia no fim.
  - `swapDays` na mesma parada; entre paradas diferentes dá erro.
  - `setTripStart`: desloca tudo; `null` passa para dias relativos.
  - `setTripEnd` encurtando exige `takeFrom`; a interface sugere a parada mais longa.
  - `setLock`.
- [ ] Commit.

### Tarefa 11: trechos
- [ ] Testes, depois `ops/legs.ts`:
  - modo, horários (`arrDayOffset`) e pontas;
  - `setLegNightsAboard(1)` 🔒: a vizinha cede 1 noite e aparece um dia do tipo `leg`;
  - `addWaypoint`/`removeWaypoint`.
- [ ] Commit.

### Tarefa 12: visitas e ajustes
- [ ] Testes, depois `ops/visits.ts` e `ops/misc.ts`:
  - agendar o mesmo lugar em dois dias é permitido;
  - desagendar, mover visita, editar metadados;
  - participantes, recursos e âncoras;
  - pouso, noites tentativas, ritmo, modo padrão e viajantes.
- [ ] Commit.

### Tarefa 13: comandos
- [ ] `commands.ts`:
  - `type Command = { type: "setNights"; stopId; nights } | …` (um por operação, todos serializáveis);
  - `dispatch(itinerary, command, ids: () => ID)`: os ids novos vêm de fora, para manter o motor determinístico.
- [ ] Teste: `JSON.parse(JSON.stringify(cmd))` despachado dá o mesmo resultado. É isso que permite a fila offline e as transações.
- [ ] Commit.

### Tarefa 14: derivações
- [ ] Testes com as fixtures, depois `derive/*`:
  - `days()`: 24 dias no Japão; o dia 11/04 é bate-volta a Nara; o dia 24/04 é o dia de volta.
  - `worlds()`: Europa tem 3 mundos.
  - `bookingStatus()`: `ok`, `out-of-window`, `orphan` (reordenar Kyoto deixa a passagem Kyoto → Tóquio órfã) e `wrong-mode` (passagem de trem num trecho que virou ônibus).
  - `suggestDonors()`: ordem por proximidade, com a prévia do efeito.
  - `lodgingGaps()`: depois de `moveBoundary(Osaka|Kyoto, −2)`, Kyoto tem as noites 11/04 e 12/04 sem hospedagem.
  - `estimateLeg()`: os mesmos fatores do protótipo.
  - `health()`: cada tipo de pendência da spec §15, com alvo para "Ver".
- [ ] Commit.

### Tarefa 15: fixtures e invariantes
- [ ] `fixtures/`: Japão, Rio, Portugal de carro, Europa com voos, cruzeiro, Caminho de Santiago (spec §19).
- [ ] `invariants.test.ts` com fast-check:
  - gerar sequências de 1 a 30 comandos aleatórios válidos e inválidos sobre cada fixture;
  - verificar as 9 invariantes da spec §16 depois de cada passo;
  - verificar o Desfazer: aplicar todos os inversos em ordem reversa reproduz a fixture original;
  - `numRuns: 1000` por fixture.
- [ ] `npm test` precisa passar com cobertura de linhas ≥ 90% em `src/engine`.
- [ ] Commit: `test(engine): invariantes com sequências aleatórias`.

**Ponto de revisão M1:** mostrar ao mantenedor o relatório de testes e uma demonstração no terminal dos cenários da spec §5.3.

---

## M2 — App local (sem login), usável no celular

### Tarefa 16: visual e casca
- [ ] Seguir `docs/guia-de-vibe.md` desde o início.
  - `ui/tokens.css` com os tokens da v1 (washi, sakura, ink, beni etc., claro e escuro) e as fontes Shippori Mincho B1, Zen Kaku Gothic New e DotGothic16 (Google Fonts).
  - Botões com borda de tinta e sombra deslocada; selos-kanji; carimbo 済.
  - HUD de nível (simples no M2); partículas do tema ao fundo.
- [ ] Casca com barra inferior **Mapa · Roteiro · Mochila · Quests** (área segura do celular) e rotas `/viagens`, `/viagem/:id/(mapa|roteiro|mochila|quests)`.
- [ ] Componentes base: `BottomSheet` (foco preso, Esc fecha, arrastar para baixo fecha), `Stepper`, `Snackbar` (com Desfazer), `Chip`, `Button`.
- [ ] Teste de componente: o `Stepper` chama `onChange` e respeita o mínimo.
- [ ] Commit.

### Tarefa 17: estado e repositório local
- [ ] `state/repo.ts`, com a interface:

  ```ts
  interface TripRepo {
    list(): Promise<TripMeta[]>;
    load(id): Promise<TripData>;
    run(id, cmd): Promise<RunResult>;
    // + CRUD de places, destinations e bookings
    subscribe(id, cb): Unsubscribe;
  }
  ```

- [ ] `localRepo.ts` com IndexedDB via idb-keyval.
- [ ] `tripStore.ts`:
  - `run(cmd)` aplica `dispatch`, guarda o inverso na pilha de Desfazer e narra os efeitos;
  - a narração é igual à do protótipo ("Osaka 2 · Kyoto 9 noites · 4 lugares voltaram à Mochila");
  - `undo()` usa `applyPatch` e, em caso de `CHANGED_SINCE`, mostra "Alguém mudou isso depois; não dá para desfazer sem apagar a mudança".
- [ ] Testes do store com o repositório em memória.
- [ ] Commit.

### Tarefa 18: Roteiro (Lista)
- [ ] `Summary`: datas, noites, paradas, países, trava 🔒/🔓 com a explicação de uma linha.
- [ ] **Volta marcada / livre** no resumo e as escolhas que substituem erros (spec §5.1):
  - "De onde sai essa noite?" usa `suggestDonors`, com a mais próxima pré-selecionada e a prévia do efeito;
  - "Para onde vai essa noite?" oferece antes, depois ou deixar em aberto.
  - Nenhum erro do motor chega à tela sem botões de saída.
- [ ] Cartão de **noites em aberto**: tracejado, "+ Escolher cidade", "Esticar <vizinha>", "Juntar <cidade>" (quando os dois lados são a mesma cidade) e "Encurtar a viagem" (só com volta livre).
- [ ] `StopCard`:
  - `[– N noites +]`, `‹ ›` (só com vizinhas dos dois lados), `↑ ↓`, `⋯`;
  - chips de reservas e de hospedagem parcial;
  - "Ver dias e Mochila".
- [ ] `LegCard`:
  - data, seletor de modo, origem → destino e pontas (avião);
  - **tempo com fonte** ("estimativa" por enquanto);
  - **"🎫 Passagem"** com o check de comprada, que cria ou atualiza a reserva de transporte do trecho;
  - aviso de passagem de outro meio;
  - chip de direção longa.
- [ ] Menu ⋯ (`BottomSheet`):
  - "Encaixar outro destino", com destino, onde (antes/no meio/depois), depois de qual noite, noites e **prévia do resultado**;
  - "Trocar destino";
  - "Remover parada".
- [ ] Teste de componente: tocar `+` dispara `setNights` e a narração aparece.
- [ ] Commit.

### Tarefa 19: Faixa
- [ ] Blocos com largura proporcional às noites (mínimo de 46 px por noite) e rolagem horizontal com esmaecido nas bordas.
- [ ] **Pegadores sob a faixa** (o ícone do modo do trecho). O arraste usa pointer events com `setPointerCapture`, prévia ao vivo das datas e confirmação ao soltar (`moveBoundary`).
- [ ] Segurar um bloco e arrastar: reordena (indicador de onde vai cair) ou solta na **lixeira em pixel art**, que faz "puf" com partículas do tema e deixa noites em aberto.
- [ ] Arrastar um bloco vizinho para dentro de noites em aberto = `stretchInto` (junta se o outro lado for a mesma cidade).
- [ ] Linha de mundos (bandeiras) quando houver mais de um país.
- [ ] Fitas de recursos e bandeiras de âncoras.
- [ ] A Faixa rola sozinha até a parada selecionada ou editada.
- [ ] Tocar num bloco seleciona a parada e rola a lista até ela.
- [ ] Teste de componente com eventos de ponteiro simulados: arrastar −2 dias dispara `moveBoundary(i, −2)`.
- [ ] Commit.

### Tarefa 20: dias
- [ ] `DayList` dentro do `StopCard`:
  - data;
  - visitas por turno;
  - etiqueta "bate-volta a X";
  - chip "Dormir: …" ou "⚠ sem hospedagem";
  - "remover este dia";
  - "trocar com…" (seletor de dia da mesma parada).
- [ ] Dias do tipo `leg` (noites a bordo) aparecem entre as paradas.
- [ ] Commit.

### Tarefa 21: Mochila
- [ ] `providers/places.ts`:
  - `PlacesProvider.search(q, near?)`;
  - Photon com espera de 350 ms entre teclas, mínimo de 3 letras e cache em memória;
  - fallback "adicionar à mão" (nome + toque no mapa fica para depois; por enquanto, só o nome).
- [ ] `MochilaScreen`:
  - filtro por destino;
  - **itens com moldura de raridade** (Se der · Quero · Imperdível; o Imperdível sem dia brilha), com a raridade trocada num toque;
  - estados da spec §6, incluindo "voltou de qua 07";
  - **arrastar um item até um dia** do Roteiro (segurar e arrastar no celular, com os dias de destino destacados e a lista rolando nas bordas);
  - "+ Agendar" abre o `DayPicker`, com seleção múltipla e os dias de destinos próximos marcados como bate-volta;
  - seção "Destinos guardados".
- [ ] Testes:
  - agendar o mesmo item em 2 dias mostra "×2";
  - um item que voltou de um dia removido mostra "voltou de …";
  - arrastar um item até um dia chama `scheduleVisit`.
- [ ] Commit.

### Tarefa 22: Quests
- [ ] `QuestsScreen` lista `health()` por gravidade, com "Ver" levando ao alvo (parada, trecho ou lugar).
- [ ] Estado vazio comemorativo.
- [ ] Commit.

### Tarefa 23: criar viagem
- [ ] `CreateTrip`, passos da spec §7. Todos podem ser pulados, e existe o atalho de escapada.
  - **Divisão automática:** noites distribuídas igualmente; o resto vai para as primeiras cidades.
  - **"Mundo criado!":** animação curta com GSAP, respeitando "reduzir movimento".
- [ ] Commit.

### Tarefa 24: tabuleiro simples
- [ ] `mapa/Board`:
  - `world-atlas` (`countries-50m`) com `d3-geo` (`geoMercator().fitExtent` na área das paradas, com margem);
  - terra com o traço da v1;
  - trilha pontilhada pela rota;
  - nós numerados;
  - `relax()` e `placeLabels()` portados de `viagem-japao/sakura-quest/index.html`.
- [ ] Tocar num nó abre a parada no Roteiro.
- [ ] Commit.

### Tarefa 25: Minhas viagens e exemplos
- [ ] Lista de viagens e "Criar viagem".
- [ ] "Explorar exemplos" copia uma fixture para testar sem compromisso.
- [ ] Commit.

**Ponto de revisão M2:** publicar uma prévia (Firebase Hosting ou uma prévia temporária) para testadores usarem no celular, ainda sem login.

---

## M3 — Contas, nuvem e compartilhamento

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

**Ponto de revisão M3:** o mantenedor cria uma viagem, convida uma pessoa como Editora e outra como Leitora, e as duas testam.

---

## M4 — PWA, testes ponta a ponta e publicação

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
