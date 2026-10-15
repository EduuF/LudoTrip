# Plano de implementação: criar viagem pelos destinos

- **Spec:** `docs/superpowers/specs/2026-10-15-criar-viagem-por-destinos-design.md`.
- **Objetivo:** a criação pergunta direto "Pra onde vocês vão?", e a resposta é uma lista de destinos.
  - Um país sem cidades vira uma parada em aberto que lembra o país (`Stop.openIn`).
  - As viagens novas não gravam `scope`.
  - Tudo o que lia o escopo passa a ler `tripArea(doc)`.
- **Não muda:** `SCHEMA_VERSION`, `DocAction`, protocolo de sync, Worker, viagens antigas.
- **Branch:** `criar-viagem-por-destinos`.

## Convenções

- As mesmas dos marcos anteriores:
  - TDD;
  - commits pequenos em português, com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Checks a cada tarefa: `npm run typecheck`, `npm run lint`, `npm test`.
- `npm run test:worker` só na tarefa 8, como prova de que nada mudou no servidor.
- `npm run e2e` quando mexer em tela.
- Textos seguem o CLAUDE.md:
  - "Destino" é a palavra genérica;
  - ações dizem a intenção;
  - nenhum botão sem uma frase de quem viaja.

## Estrutura de arquivos

```
src/engine/types.ts        + OpenIn, Stop.openIn?
src/engine/create.ts       destinationIds aceita { openIn }
src/engine/ops/structure.ts fillOpen completo apaga openIn
src/engine/narrate.ts      stopName: "Japão (cidades em aberto)"
src/app/area.ts            NOVO: tripArea(doc)
src/app/area.test.ts       NOVO
src/map/frame.ts           fallback via tripArea
src/ui/Create.tsx          passo único com chips
src/ui/BoardOverlay.tsx    fase tracejada da parada com openIn
src/app/choices.ts         fillOpenChoice com viés no país
```

---

## 1. Motor: `Stop.openIn`

- [ ] `types.ts`:
  - `export interface OpenIn { country: string; name: string; localName?: string; bbox?: BBox }`;
  - `Stop.openIn?: OpenIn`, com o comentário "só com `destinationId: null`: o país das noites em aberto".
  - Se o `BBox` não existir no motor, defini-lo aqui como `[w, s, e, n]` e fazer `src/map/frame.ts` reexportar.
- [ ] `create.ts`: o elemento de `NewTripSpec.destinationIds` passa a ser `ID | null | { openIn: OpenIn }`. O objeto gera uma parada `destinationId: null` com `openIn`.
- [ ] `fillOpen` (`ops/structure.ts:93`):
  - preenchimento completo (`k === nightsOf(o)`): `delete o.openIn`;
  - preenchimento parcial: a parada que sobra em aberto continua com o `openIn`, e a nova parada nasce sem ele.
- [ ] Conferir os outros ops que criam ou fundem paradas em aberto (`stretchInto`, `closeOpen`, a lixeira em `:75`, `normalize` em `core.ts:298`):
  - nenhum deve copiar o `openIn` para uma parada com destino;
  - a lixeira não cria `openIn`.
- [ ] Testes:
  - `create.test.ts`: uma parada `openIn` só, e `[openIn, id]` misturado;
  - `structure.test.ts`: `fillOpen` completo e parcial (os dois `side`);
  - `invariants.test.ts`: nenhuma parada com destino tem `openIn`.

## 2. Nomes da parada em aberto

- [ ] `narrate.ts:33` `stopName`: com `openIn`, devolve `` `${openIn.name} (cidades em aberto)` ``; sem ele, continua "Noites em aberto".
- [ ] `DayCard.tsx:42`: com `openIn`, "Japão · cidades em aberto"; sem ele, "noite em aberto".
- [ ] `Roteiro.tsx:519-545` (cartão das noites em aberto):
  - título "Japão: N noites, cidades em aberto";
  - botão "+ Escolher cidade" (sem `openIn`, continua "+ Escolher destino").
- [ ] `narration.ts:28`: "Kyoto entrou nas noites em aberto" continua servindo; não muda.
- [ ] Testes em `narrate.test.ts`, e no teste do DayCard/Roteiro se existir. Se não existir, cobrir pelo e2e da tarefa 7.

## 3. `tripArea(doc)`

- [ ] `src/app/area.ts`, puro, seguindo a spec §4:
  - `countries`: os destinos das paradas e os `openIn`, na ordem, sem repetir;
  - `mainCountry`: `countries[0] ?? doc.scope?.country`;
  - `bbox`:
    1. a caixa de `framePoints(doc)`;
    2. a união dos `openIn.bbox`;
    3. o `scope.bbox`;
    4. o `scope` lat/lon ±0,12°/±0,1° (os mesmos números de `frame.ts:96`);
  - `label` e `localLabel`: 1 destino → nome; 1 país → país; 2 países → "França e Itália"; 3 ou mais → "França, Itália…"; sem nada → `scope.name` → "sua viagem".
- [ ] O nome do país vem de `COUNTRIES` (`src/providers/countries.ts`), pelo ISO2. O `localName` vem de lá também.
- [ ] `area.test.ts` cobre todos os casos da spec §7, incluindo os fixtures antigos (`src/engine/fixtures/trips.ts`, que têm `scope`).
- [ ] `types.ts`: comentário em `TripDoc.scope`: "legado: só viagens criadas antes de 15/10/2026; ler via `tripArea`".

## 4. Trocar quem lia `doc.scope`

- [ ] `src/map/frame.ts:93-102`: o `frame()` usa `framePoints` ou, sem eles, `tripArea(doc).bbox`. Para não ter dependência circular, a regra do `bbox` fica em `area.ts` e importa `framePoints` de `frame.ts`. `frame.ts` só chama `tripArea` no fallback; se o ciclo de imports incomodar, extrair `fallbackBox(doc)` para `area.ts` e usar só ele.
- [ ] `MapPanel.tsx:278`: `tripArea(doc).localLabel`. Manter o `localName` do destino dentro da cidade (`:299`).
- [ ] `kit.tsx:147`: `palette(tripArea(doc).mainCountry)`.
- [ ] `BoardOverlay.tsx:196`: `decoKinds(tripArea(doc).mainCountry)`.
- [ ] `Sheets.tsx:1525-1536` ("+ Destino" / sheet `dest`):
  - tirar o `within={doc.scope?.country}`;
  - o viés da busca passa a ser o centro de `tripArea(doc).bbox`;
  - aceitar um `country?` opcional no sheet `dest`, usado como `within` quando vier.
- [ ] `choices.ts:620` `fillOpenChoice`: com `openIn`, título "Que cidade de Japão?" e `country: openIn.country` no sheet.
- [ ] `grep -rn "scope" src --include=*.ts*`: depois disso, só `area.ts`, `doc.ts`, `types.ts`, `store.ts` (exemplos) e testes leem `scope`.
- [ ] Testes: `frame.test.ts` cobre o fallback para `openIn` e para o `scope` legado. A paleta de uma viagem de exemplo não muda.

## 5. Mapa: a fase tracejada

- [ ] `BoardOverlay.tsx`: para cada parada em aberto com `openIn.bbox`, desenhar uma fase tracejada no centro da caixa:
  - o mesmo componente de fase, com o estilo "em aberto";
  - número da fase na ordem das paradas.
- [ ] Não entra na trilha pontilhada nem em `route.ts`. O grupo fica onde estava (`route.ts:35`).
- [ ] Tocar na fase chama `fillOpenChoice(stopId)`. Não abre "Entrar na cidade".
- [ ] Animação: nenhuma nova. Se surgir uma, seguir `docs/animacoes.md`.
- [ ] Teste: `e2e/mapa.spec.ts` ganha um caso: uma viagem "só Japão" mostra a fase, e tocar nela abre "Que cidade de Japão?".

## 6. Criação: o passo único

- [ ] `Create.tsx`:
  - `STEPS = ['Pra onde', 'Quando', 'Quem vai', 'Como', 'Nome']`;
  - some o estado `scope`/`undecided`, e fica `picks: PlacePick[]`;
  - o passo 0 tem:
    - título "Pra onde vocês vão?";
    - a lista de chips (reordenar com ↑ ↓, remover com ×);
    - `PlaceSearch kinds={['country','city']}`;
    - sugestões de `CITIES` do país do último chip (até 8, sem repetir chips);
    - "De onde vocês saem?" abaixo;
  - um chip de país mostra "Japão · cidades em aberto";
  - "Seguir" fica desabilitado sem nenhum chip;
  - `finish()`:
    - cidades e lugares viram `Destination` (o mesmo mapeamento de hoje, `:55-63`);
    - um país vira `{ openIn: { country, name, localName, bbox: await countryBounds(id) } }`, na ordem;
    - não grava `scope`;
    - a checagem de voo usa o primeiro destino localizado ou o centro do primeiro `openIn.bbox`;
  - o nome padrão é `` `Viagem para ${tripArea(draftDoc).label}` ``. Calcular a partir de um doc rascunho ou de uma função `areaLabel(picks)` que `tripArea` também usa.
- [ ] Remover o "Ainda não sei: decido no mapa". O país cobre esse caso. Sem país e sem cidade, não se cria uma viagem.
- [ ] `create.test.tsx`, reescrito:
  - Tóquio + Kyoto: 2 paradas, sem `scope`, nome "Viagem para Japão";
  - só Japão: 1 parada `null` com `openIn.country === 'JP'`;
  - Paris + Roma: "Viagem para França e Itália";
  - sem chip: não avança;
  - reordenar troca a ordem das paradas.
- [ ] Atualizar o comentário do topo de `Create.tsx`.

## 7. Revisão no app

- [ ] `npm run e2e`, mais o caso novo de `mapa.spec.ts`.
- [ ] `/run` no celular (viewport mobile):
  - criar "só Japão": cair no mapa enquadrado no Japão com a fase tracejada; "Escolher cidade" → Kyoto com 2 de 5 noites; ver a parada em aberto que sobra continuar "Japão (cidades em aberto)";
  - criar Paris + Roma: mapa na Europa, nome "Viagem para França e Itália", paleta da França;
  - abrir a viagem de exemplo antiga do Japão: o enquadramento, a marca-d'água e a paleta continuam iguais.
- [ ] Contar os controles da tela de criação, antes e depois (CLAUDE.md, "Revelar progressivamente"). O número não pode subir.

## 8. Docs e fechamento

- [ ] Spec v2, `2026-10-13-ludotrip-v2-design.md`:
  - §7, passos 1 e 2: viram o passo único, com link para a spec nova;
  - §8, "Enquadramento": "sem parada localizada, a caixa do país das noites em aberto, ou o escopo das viagens antigas".
- [ ] `docs/arquitetura.md`: se descreve `scope`, uma linha sobre `tripArea` e `openIn`.
- [ ] Checks completos: `typecheck`, `lint`, `test`, `test:worker`, `e2e`, `build`.
- [ ] Commit final e push da branch. O PR e o merge ficam para o mantenedor decidir.
