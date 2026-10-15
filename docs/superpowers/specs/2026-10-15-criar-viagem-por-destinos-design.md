# Criar viagem pelos destinos (sem escopo)

_Design aprovado em 15/10/2026. Muda a §7 e parte da §8 da [spec v2](2026-10-13-ludotrip-v2-design.md)._

## 1. Por quê

Hoje a criação (`src/ui/Create.tsx`) tem dois passos:
- "Pra onde?" escolhe um país ou uma cidade, que vira o escopo (`TripDoc.scope`).
- "Por onde?" escolhe as cidades.

Para quem viaja, as duas perguntas soam como uma só, porque o destino também pode ser uma cidade. E uma viagem com vários países (Paris → Roma) não cabe num escopo único.

A partir de agora, a viagem pergunta direto **quais destinos ela tem**. Tudo o que o escopo fazia passa a ser calculado a partir das paradas.

O que não muda:
- Criar uma viagem leva uns 60 s.
- Todo passo tem um padrão razoável e nenhum trava.
- "Destino" continua sendo a palavra genérica (CLAUDE.md).

**Sucesso:**
- Criar "Tóquio → Kyoto", "só Japão" e "Paris → Roma" sem nenhuma pergunta redundante.
- As viagens antigas abrem exatamente como antes.

## 2. O fluxo

1. **Pra onde vocês vão?** (um passo só)
   - Uma busca (`PlaceSearch`, `kinds={['country','city']}`) aceita qualquer destino: cidade, região, parque, ilha e também país.
   - Cada escolha vira um **chip** numa lista ordenada (a ordem imaginada da viagem). Dá para reordenar e remover.
   - Sugestões: as cidades do país do último chip (`CITIES`). Depois de Tóquio vêm Kyoto e Osaka; depois de "Japão", as mesmas.
   - Um país vira o chip "Japão · cidades em aberto".
   - "De onde vocês saem?" continua opcional, abaixo da lista.
   - Sem nenhum chip, o botão de seguir fica desabilitado. Uma viagem precisa de pelo menos um destino, mesmo que seja só um país.
2. **Quando?**, **Quem vai?**, **Como vão se mover?**: iguais a hoje.
3. **Nome**: o padrão é `Viagem para ${tripArea(doc).label}`.

As noites são divididas entre as paradas como hoje (`createItinerary`, `src/engine/create.ts`).

## 3. A parada-país ("cidades em aberto")

- **O que é.** Um `Destination` com `kind: 'country'` (o tipo já existe em `src/engine/types.ts:33-42`). O `country` é o ISO2, e `lat`/`lon` ficam no centro da caixa do país (`countryBounds`). Não tem `tz`.
- **Rótulo:** "Japão (cidades em aberto)".
- **No mapa:**
  - Uma fase tracejada, na posição do centro do país.
  - Não entra em "Entrar na cidade", porque não há lugares para enquadrar.
  - Tocar nela abre o painel do destino com a ação primária **"Escolher cidade"**.
- **Trocar por uma cidade.**
  - Usa o comando que já existe, `setDestination` (`src/engine/ops`, coberto em `structure.test.ts:262`), que troca o destino da parada e mantém as visitas.
  - Antes, a cidade escolhida entra em `destinations` com `addDestination`.
  - Se a pessoa quiser várias cidades no lugar do país, troca a primeira e soma as outras com "+ Destino". Não há fluxo especial.
- **Sem problema inventado.**
  - As tarefas automáticas (`src/ui/autoTasks.ts:71`) não pedem hospedagem nem trechos para uma parada-país.
  - A estimativa de trechos (`src/engine/derive.ts:380-401`) aceita um destino sem `tz` e devolve "sem estimativa", em vez de inventar um número.

## 4. O escopo vira cálculo: `tripArea(doc)`

Novo módulo puro em `src/app/area.ts`:

```ts
interface TripArea {
  countries: string[]        // ISO2, na ordem das paradas, sem repetir
  mainCountry?: string       // countries[0] ?? doc.scope?.country
  bbox?: [number, number, number, number]
  label: string              // para o nome padrão
  localLabel?: string        // para a marca-d'água
}
```

**`bbox`**, a primeira regra que der resultado:
1. A caixa dos destinos localizados das paradas, contando os bate-voltas e deixando os destinos-país de fora.
2. A caixa somada dos destinos-país, via `countryBounds`.
3. O `doc.scope` legado (`bbox`, ou lat/lon ±0,12°).

**`label`:**
- Um destino só: o nome dele.
- Todos no mesmo país e mais de um destino: o nome do país.
- Dois países: "França e Itália".
- Três ou mais países: os dois primeiros + "…".
- Sem destino: `doc.scope?.name`, e depois "sua viagem".

**`localLabel`:** a mesma regra com `localName`. Quando um item não tem `localName`, usa `name`.

## 5. Quem deixa de ler `doc.scope`

| Onde | Hoje | Depois |
|---|---|---|
| `src/map/frame.ts:93-102` (enquadramento sem parada) | `scope.bbox` / lat-lon | `tripArea(doc).bbox` |
| `src/ui/MapPanel.tsx:278` (marca-d'água) | `scope.localName ?? …` | `tripArea(doc).localLabel` |
| `src/ui/kit.tsx:147` (paleta) | `scope.country` | `tripArea(doc).mainCountry` |
| `src/ui/BoardOverlay.tsx:196` (decoração) | `scope.country ?? …` | `tripArea(doc).mainCountry` |
| `src/ui/Sheets.tsx:1525-1536` ("+ Destino") | `within` = país do escopo; viés pelo lat/lon | sem `within`; viés pelo centro do `bbox` |
| `src/ui/Create.tsx` | monta `tripScope` | não grava `scope` |
| `src/app/store.ts:279, 301` (exemplos) | completa o `scope` pelos fixtures | continua igual (os exemplos são legados válidos) |

O campo `scope?: Scope` continua no tipo `TripDoc`, com o comentário "legado: só viagens criadas antes de 15/10/2026". Ninguém novo o lê; só `tripArea` faz isso.

## 6. Dados, sync e compatibilidade

- **Sem migração.** O servidor (Durable Object `TripRoom`) reaplica as ações e só roda `migrate()` ao criar a viagem. Reescrever o doc no aparelho (por exemplo, trocar paradas `null` por destinos-país) faria o aparelho e o servidor divergirem.
- Por isso:
  - Não muda `SCHEMA_VERSION`.
  - Nenhuma `DocAction` nova.
  - Não muda o protocolo.
- As viagens antigas mantêm o `scope` e as paradas `destinationId: null` ("Ainda não sei: decido no mapa"). Tudo isso continua funcionando, e o `null` segue válido no motor.
- Aparelhos com a versão antiga abrem uma viagem nova sem `scope`. Isso já é permitido hoje (o campo é opcional) e o enquadramento cai nas paradas. O pior caso é a paleta padrão num aparelho desatualizado, o que é aceitável.

## 7. Testes

- **`src/app/area.test.ts`:**
  - uma cidade;
  - várias cidades num país;
  - só destino-país;
  - dois países;
  - três países;
  - doc legado com `scope` e paradas `null`;
  - doc sem nada.
- **`src/ui/create.test.tsx`**, reescrito para cobrir:
  - Tóquio + Kyoto: duas paradas e nenhum `scope`;
  - só "Japão": uma parada-país;
  - Paris + Roma: o nome padrão é "Viagem para França e Itália";
  - sem chip: não avança.
- **`src/map/frame.test.ts`:** o fallback para destino-país e para o `scope` legado.
- **Motor:** `setDestination` trocando uma parada-país por uma cidade mantém as visitas.
- **`autoTasks`:** nenhuma tarefa de hospedagem para uma parada-país.
- **Rodada final:** `npm test`, o typecheck, e no celular (`/run`):
  - criar "só Japão";
  - ver a fase tracejada;
  - trocar por Kyoto;
  - abrir uma viagem de exemplo antiga e conferir que o enquadramento e a paleta são iguais.

## 8. Fora de escopo

- Editar a lista de destinos depois de criada: isso já existe com "+ Destino" e remover.
- Distribuir as noites por destino na criação: continua dividido igual.
- Sugestões de roteiro e cidades populares além da lista `CITIES`.
- Reescrever as viagens antigas.
