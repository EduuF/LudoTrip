# LudoTrip V2 — Design

- **Data:** 2026-10-13
- **Status:** rascunho para revisão do mantenedor
- **Origem:** v1 "Sakura Quest" (artifact do claude.ai feito para uma viagem ao Japão)

Este documento tem duas partes:

- **Parte I — Produto:** vale para a V2 inteira.
- **Parte II — Subprojeto 1:** fundação + motor do roteiro, com detalhe suficiente para virar plano de implementação.

---

# Parte I — Produto

## 1. Objetivo

O LudoTrip é um planejador de viagens com cara de jogo para **qualquer viagem**: uma cidade, várias cidades, vários países, road trip, cruzeiro, trilha.

Ele mantém o que fez a v1 ser querida: um mapa-tabuleiro com fases, bonequinhos em pixel art, quests e XP. E resolve problemas reais de planejamento: datas que se ajustam sozinhas, reservas sob controle e o dia a dia da viagem.

**Público:** produto aberto, divulgado localmente, de boca em boca. Português primeiro.

**Restrições:**

- Custo mínimo até haver uso; pagar conforme crescer.
- Claude escreve o código; o mantenedor revisa e publica.
- É um site (PWA). App de loja fica para o futuro.
- 95% do uso será no celular.

**Critérios de sucesso:**

- Uma pessoa cria uma viagem com várias cidades em cerca de 60 segundos.
- Deslocar, reordenar, encaixar ou remover cidades e dias **nunca** exige retrabalho manual e **nunca** perde conteúdo.
- Os seis formatos de teste (§11) funcionam com a mesma gramática, sem casos especiais na interface.
- Amigos que usaram a v1 reconhecem a "vibe" e a acham ainda mais divertida.

## 2. Por que mudar a abordagem

**Por que sair do artifact:**

- Os amigos precisariam de conta no Claude.
- O artifact bloqueia serviços externos (busca de lugares, mapas do mundo inteiro, rotas).
- As permissões precisam ser do próprio app.

**O que o mercado mostra:**

- Viajantes pedem que **as noites por destino definam as datas** ([Expedition Portal](https://forum.expeditionportal.com/goto/post?id=1230240)).
- O Polarsteps apaga as datas quando as noites não cabem ([suporte](https://support.polarsteps.com/article/176-itinerary-planner)).
- No Wanderlog, mudar as datas pode apagar conteúdo ([wanderlog-mcp](https://glama.ai/mcp/servers/shaikhspeare/wanderlog-mcp)).
- O Stippl perde noites e destinos em edições ([reviews](https://justuseapp.com/en/app/6443617088/stippl-the-travel-planner/reviews)).
- O TripIt assume um destino por viagem ([Trustpilot](https://uk.trustpilot.com/review/www.tripit.com)).
- O Wanderlog separa "lugares para visitar" do itinerário ([iMore](https://www.imore.com/apps/travel-apps/wanderlog-iphone-travel-app-trip-planning)), o que valida a ideia da Mochila.

## 3. Princípios

1. **Diversão que informa.** Todo elemento lúdico também comunica algo: onde vocês estão, como se movem, o que falta.
2. **Editar nunca destrói.** O que sai do calendário volta para a Mochila. Toda ação tem Desfazer. Não existe "tem certeza?".
3. **Planos se moldam; reservas são fatos.** Reservas nunca mudam de data sozinhas. Quando ficam fora do lugar, viram aviso com correção em um toque.
4. **O app se adapta ao conteúdo, não a um tipo escolhido.** Ninguém escolhe "road trip". As funções acendem pelo que a viagem contém.
5. **Complexidade progressiva.** O que não se aplica não aparece.
6. **Celular primeiro.** Arrastar é atalho; sempre existem `– / +` e botões.
7. **O app sempre reage certo.** As regras vivem num motor puro, com invariantes testadas.

## 4. A gramática

| Peça                  | O que é                                                                                                                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Parada**            | N noites num destino, com tipo de pouso: hotel, hostel, apartamento, casa de amigos, camping, motorhome, a bordo                                                                                                                          |
| **Trecho**            | Ligação entre paradas vizinhas e de/para casa. Tem modo (avião, trem, ônibus, carro, barco, a pé, bike, moto), pontas (aeroporto, estação, porto), horários locais, conexões, paradas no caminho e noites a bordo (ônibus ou voo noturno) |
| **Dia**               | Derivado das paradas. Pertence à parada onde se dorme naquela noite, ou ao trecho, numa noite a bordo                                                                                                                                     |
| **Destino + Mochila** | Lugar (cidade, região, parque, navio) com o seu catálogo de lugares desejados                                                                                                                                                             |
| **Visita**            | Um lugar da Mochila agendado num dia ou como parada no caminho de um trecho, com turno, horário, nota e participantes                                                                                                                     |
| **Recurso**           | Algo com período: carro alugado, passe de trem, eSIM, seguro                                                                                                                                                                              |
| **Reserva**           | Fato do mundo real, com datas e ligada a uma parada, trecho ou recurso. Nunca se move sozinha                                                                                                                                             |
| **Âncora**            | Algo com data e hora que não se move: voo comprado, casamento, show                                                                                                                                                                       |
| **Mundo**             | Agrupamento automático por país                                                                                                                                                                                                           |
| **Participantes**     | Quem está em cada parada, trecho ou visita (padrão: todos)                                                                                                                                                                                |
| **Ritmo**             | Tranquilo, normal ou intenso                                                                                                                                                                                                              |

**Regras centrais:**

- **As datas são calculadas:** data de ida + noites. O conteúdo de um dia fica preso à **parada e à posição dentro dela** ("2º dia em Kyoto"), nunca à data.
- **Trechos existem automaticamente entre paradas vizinhas.** Aeroportos e estações são **pontas de trecho, não paradas**.
- **Bate-volta é conteúdo:** um dia de Osaka com visita da Mochila de Nara vira "bate-volta a Nara".
- **Datas, noites e destinos podem ser incertos:** sem data de ida (Dia 1, Dia 2…), noites tentativas, região sem cidade definida.

### 4.1 O que acende sozinho

| Quando a viagem tem…       | Aparece                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Um destino só              | Tela de cidade; o tabuleiro é a cidade ou região; as fases são os dias                                                               |
| Mais de um país            | Mundos, moeda por país, documentos, fusos, idioma do cartão do taxista                                                               |
| Trecho de avião            | Aeroportos, conexões, bagagem, horários locais, linha de data                                                                        |
| Trechos de carro           | Horas de direção por dia (aviso acima de ~6h), rota por estradas, combustível e pedágio, carro alugado como recurso, PID no exterior |
| Pouso a bordo              | Base que se move; escalas viram bate-voltas com horário de volta ao navio                                                            |
| Trechos a pé ou de bike    | Etapas com distância e desnível                                                                                                      |
| Noite a bordo de um trecho | Noite sem pedir hotel                                                                                                                |
| Recurso                    | Uma fita sob a Faixa; trechos fora do período são marcados                                                                           |
| Participantes diferentes   | Bonequinhos que se separam no mapa                                                                                                   |
| Âncora                     | Uma bandeira na data e aviso se ela for ameaçada                                                                                     |

### 4.2 Catálogo de formatos

Todos os formatos usam a mesma gramática:

- uma cidade;
- várias cidades num país;
- vários países com voos;
- road trip com carro alugado ou próprio;
- motorhome;
- mochilão sem datas;
- base fixa com bate-voltas;
- cruzeiro;
- trilha em etapas;
- bike ou moto;
- stopover;
- ônibus ou trem noturno;
- chegar por uma cidade e sair por outra;
- evento como âncora;
- trabalho + lazer;
- grupo que se divide;
- família com crianças ou idosos;
- intercâmbio com mini-viagens;
- volta ao mundo;
- pacote de agência;
- escapada de fim de semana;
- casa de amigos;
- nômade digital.

### 4.3 Situações transversais

- **Fuso e linha de data:** horários locais nos trechos; voo noturno "come" uma noite; data repetida vira curiosidade.
- **O caminho até o aeroporto:** o trecho de ida pode começar em casa.
- **Passagem órfã:** uma passagem que ficou sem trecho correspondente nunca some; vira aviso com [Encaixar] [Arquivar].
- **Kit da viagem:** documentos e itens gerados pelo contexto. Para visto, o app mostra o link oficial em vez de afirmar regras.
- **Divisão de gastos do grupo.**

## 5. Edição

### 5.1 Volta marcada (🔒) ou livre (🔓)

- **A palavra "trava" não aparece na interface.** O resumo da viagem mostra "Volta 24/04", com um toque para alternar entre **"🔒 marcada"** e **"livre"**. Nas tabelas abaixo, 🔒 e 🔓 são só abreviações.
- **Volta livre:**
  - `+` adiciona a noite e empurra a volta;
  - `–` antecipa a volta;
  - em ambos, um aviso curto com Desfazer ("Volta agora 25/04").
- **Volta marcada:** `+` e `–` abrem uma escolha curta, **nunca um erro**.
  - `+` pergunta **"De onde sai essa noite?"**: lista as cidades com 2 ou mais noites (a mais próxima vem primeiro e já selecionada) e oferece "Adiar a volta (25/04)".
    - Tirar de uma cidade que não é vizinha desloca as cidades do meio, e o conteúdo delas vai junto.
    - Se houver passagem de volta comprada, a opção de adiar avisa: "seu voo é 24/04".
  - `–` pergunta **"Para onde vai essa noite?"**: a cidade antes, a cidade depois, ou "Deixar em aberto".
- A volta passa a ser marcada sozinha quando a passagem de volta é marcada como comprada. Um aviso conta o que mudou.

### 5.1.1 A regra da ponta (o que acontece com os dias planejados)

- **Um dia entra ou sai sempre na ponta da cidade que se moveu. Todos os outros dias mantêm a data e o plano.**
  - Arrastar a divisa Osaka|Kyoto 2 dias para a esquerda: Kyoto ganha 2 dias vazios **no começo**; Gion continua em 13/04.
  - Tóquio de 4 para 3 noites com `–`: sai o último dia de Tóquio.
  - Se a noite foi cedida por uma cidade **antes**, sai o primeiro dia.
- **Os planos de um dia que sai voltam para a Mochila**, marcados como "voltou de qua 07". O aviso diz o quê ("Sensō-ji voltou para a mochila") e oferece Desfazer.
- **A prévia mostra antes o que vai sair**, enquanto a pessoa arrasta ou escolhe.
- **Deslocar a janela inteira** (`‹ ›` ou arrastar o bloco): o conteúdo da cidade anda junto, e as vizinhas ganham ou perdem dias nas pontas encostadas.
- **Reordenar:** a cidade leva os seus dias junto.
- Para remover um dia do meio, existe "Remover este dia" no próprio dia.

### 5.1.2 Lixeira e noites em aberto

- **Na Faixa**, ao segurar e arrastar um bloco aparece uma **lixeira** em pixel art. Soltar a cidade nela faz "puf" e deixa no lugar um **espaço tracejado com "+"**: são noites em aberto, com as mesmas datas.
- Na lista, "Remover" faz o mesmo.
- A cidade removida **continua guardada em "Destinos guardados"**, com a mochila dela intacta, para voltar quando quiser.
- **Ações das noites em aberto:**
  - "+ Escolher cidade" preenche o espaço todo ou parte dele;
  - "Esticar <cidade vizinha>": a vizinha ocupa o espaço, com dias vazios na ponta encostada;
  - se as duas vizinhas são a mesma cidade (Tóquio | vazio | Tóquio): **"Juntar Tóquio"** faz virar uma cidade só, que mantém os planos das duas partes;
  - "Encurtar a viagem" só aparece com a volta livre.
- **Arrastar uma vizinha para dentro do espaço** é o atalho de "Esticar". Se do outro lado estiver a mesma cidade, elas se juntam.
- Espaços em aberto vizinhos se juntam num só.
- As noites em aberto viram a quest "2 noites em aberto (04–05/04)". Também servem para quem decide no caminho (mochilão).

### 5.1.3 Mensagens

- **Curtas e exatas.** Cada palavra precisa de um motivo.
- **Usam as palavras de quem viaja** (cidade, noite, volta, passagem), nunca termos internos (parada, trava, trecho órfão, vizinha).
- **Toda situação sem saída vira uma escolha com botões.**
- Exemplos:
  - "Ginzan Onsen tem só 1 noite." + [Tirar de Osaka] [Adiar a volta]
  - "Sensō-ji voltou para a mochila." + [Desfazer]

### 5.2 Duas visões que editam a mesma coisa

- **Faixa da viagem:**
  - blocos proporcionais às noites, trechos como pontes, fitas de recursos e bandeiras de âncoras;
  - arrastar a divisa passa noites; arrastar o bloco reordena; arrastar para o lado desloca a janela;
  - prévia ao vivo durante o arraste.
- **Lista de paradas:** padrão no celular. Cartões com `[– N noites +]`, `‹ ›`, `≡` e menu; um cartão de trecho entre cada par de cartões.

### 5.3 Cenários (resumo)

| Cenário                              | Comportamento                                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Deslocar Kyoto 12–15 para 13–16      | A anterior ganha 1 noite e a seguinte perde 1; o conteúdo vai junto; reservas fora da janela viram aviso              |
| Começar por Kyoto                    | Datas e trechos se refazem; passagens que ficaram sem trecho viram órfãs                                              |
| Encaixar Tóquio no meio de Kyoto     | Kyoto I + Tóquio + Kyoto II, com a mesma Mochila; os dias sem lugar voltam à Mochila (🔒) ou a volta é empurrada (🔓) |
| Mais ou menos noites; remover um dia | Os dias removidos devolvem as visitas à Mochila                                                                       |
| Trocar dois dias                     | Troca o conteúdo; as datas ficam                                                                                      |
| Trocar o modo do trecho              | Acende as funções do modo                                                                                             |
| Parada no caminho                    | Visita dentro do trecho                                                                                               |
| Alguém chega no dia 3                | Participantes da parada                                                                                               |
| Voo remarcado                        | Tudo desloca; reservas viram avisos                                                                                   |
| Encurtar a viagem                    | Escolher de qual parada tirar, com sugestão da mais longa                                                             |
| Mesma cidade lado a lado             | Junta as duas e avisa                                                                                                 |

### 5.4 Desfazer e Saúde do roteiro

- Cada edição tem um inverso; um aviso de Desfazer fica visível por ~6 s; um histórico de versões permite restaurar.
- **Saúde do roteiro** é a lista única de pendências e **vira as quests**:
  - noite sem pouso;
  - trecho sem transporte;
  - imperdível sem dia;
  - reserva fora da janela;
  - passagem órfã;
  - direção longa;
  - trecho fora do recurso;
  - conexão curta;
  - prazo;
  - lugar fechado;
  - âncora ameaçada;
  - item do Kit.

## 6. A Mochila (inventário de cada destino)

- **Nome:** "Mochila" é viagem e é inventário de jogo. Atrações e lugares são **itens**: a pessoa os pega da mochila e os coloca nos dias.
- **Uma mochila por destino.** Os dias podem usar itens da mochila de destinos próximos (o bate-volta acontece sozinho).
- **Prioridade = raridade do item**, editável com um toque:

  | Raridade       | Significado       | Moldura                      |
  | -------------- | ----------------- | ---------------------------- |
  | **Se der**     | talvez            | moldura cinza                |
  | **Quero**      | prioridade normal | azul                         |
  | **Imperdível** | não pode faltar   | **dourado com brilho suave** |

- **Imperdível sem dia** brilha na mochila e vira quest. As outras raridades não incomodam.
- **Estados do item:**
  - sem dia;
  - agendado (chip do dia: "Qui 14");
  - "×2" (em dois dias, permitido);
  - "voltou de qua 07" (saiu de um dia removido);
  - ✓ visitado;
  - conflito (vermelho).
- **Agendar não tira o item da mochila:** ela é um catálogo, com filtro "sem dia".
- **Visita é diferente de Item.** O item guarda endereço, coordenadas e horário de funcionamento; a visita guarda turno, horário e nota daquele dia.
- **Como colocar nos dias:**
  - **Arrastar** o item da mochila até o dia, na lista do Roteiro, no celular (segurar e arrastar) e no computador. Os dias que aceitam o item se destacam e a lista rola sozinha nas bordas.
  - **"+ Agendar"** abre um seletor de dias (vários de uma vez), para quem prefere tocar e para acessibilidade.
- Tempo estimado por item e um medidor de carga do dia ("dia cheio").
- **Depois:** "Montar meus dias", caixa de entrada por link, votos da galera, itens perto da rota.

### 6.1 Trechos: passagem comprada e tempo de viagem

- **No cartão do trecho**, um toque em **"🎫 Passagem"** alterna entre "falta comprar" e "comprada ✓". Isso cria a reserva de transporte daquele trecho (data e meio).
- **Trocar o meio** (trem → ônibus) com passagem comprada mostra o aviso **"Você tem passagem de trem para este trecho."** A passagem continua guardada, porque reserva é fato.
- **O tempo de viagem sempre mostra a fonte.** Em produção, vale a primeira que existir:

  | #   | Fonte                                                                                                                                                                                                                             | Rótulo         |
  | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
  | 1   | Horários da passagem ou digitados pela pessoa                                                                                                                                                                                     | "sua passagem" |
  | 2   | Rota real: carro, a pé e bike pelo OpenRouteService (gratuito com chave, ~2.000 rotas/dia); transporte público por um roteador aberto baseado em GTFS (ex.: Transitous/MOTIS) onde houver dados; Google Routes quando valer pagar | "rota real"    |
  | 3   | Estimativa pela distância × fator do meio ÷ velocidade típica, com tabela por país (ex.: trem-bala no Japão)                                                                                                                      | "estimativa"   |
  - O resultado fica em cache por par de cidades e meio.
  - **Depois (fase 5):** tempos digitados pelos viajantes viram uma média anônima por rota ("medido por viajantes"), útil para lugares que nenhuma API cobre.

### 6.2 A vibe

- O que manter da v1 está em `docs/guia-de-vibe.md`. Esse guia é um norte, não uma régua.
- O protótipo de edição ficou "limpo demais" e perdeu parte dela. **O app definitivo segue o guia desde o primeiro marco de interface.**

## 7. Criar uma viagem (~60 s)

_Como implementado no M3; os passos 1 e 2 viraram um só em 15/10/2026 ([spec](2026-10-15-criar-viagem-por-destinos-design.md))._

1. **Pra onde vocês vão?** Os destinos (cidade, região, parque, ilha), na ordem imaginada, com sugestões do país do último escolhido. Um **país** sem cidade vira noites em aberto que lembram o país (`Stop.openIn`: "Japão, cidades em aberto"). Busca na lista própria (sem rede) e no mundo todo (Photon). "De onde vocês saem?" é opcional. A viagem não grava mais escopo: país, nome e marca-d'água saem de `tripArea` (`src/app/area.ts`).
2. **Quando?** Primeira noite (ou em branco: dia 1, dia 2…) e quantas noites.
3. **Quem vai?** 1–4 ou "uma galera" (Kombi).
4. **Como vão se mover?** Define o meio padrão dos trechos (a ida e a volta viram avião quando a casa é longe).
5. **Nome** (padrão: "Viagem para Japão", "Viagem para França e Itália") e **"VIAGEM CRIADA!"**: cai na tela do Mapa, enquadrada nos destinos, com a trilha pronta para mexer.

Todos os passos têm um padrão razoável; nenhum trava.

## 8. Mapa, bonequinhos e temas

_Como implementado no M3 (`src/map`, `src/ui/MapCanvas.tsx`, `BoardOverlay.tsx`, `CityOverlay.tsx`)._

- **Duas camadas.** Por baixo, o mapa de verdade: tiles vetoriais do OpenStreetMap (OpenFreeMap, esquema OpenMapTiles) desenhados pelo MapLibre GL com o estilo **washi** (`src/map/style/washi.ts`: papel, mar com seigaiha, contornos de tinta, parques matcha, rios, fronteiras tracejadas, ruas só de perto, nenhum rótulo). Por cima, a **nossa camada SVG** em pixels: fases numeradas (estrela quando o destino está pronto), trilha pontilhada sobre areia com a parte percorrida em vermelho, pílulas sem sobreposição (`relax` e `placeLabels` da v1), decoração pixel semeada por país, seta para casa e o grupo em pixel. A camada só conhece um **adaptador** (`project`, `unproject`, `fit`, `onMove`).
- **Papel.** Sem WebGL, sem rede ou dentro do artifact, o adaptador "papel" (`d3-geo` + `world-atlas`) desenha os contornos. É também o primeiro quadro (antes dos tiles chegarem) e o dublê dos testes.
- **Enquadramento** (`frame.ts`, puro): só os destinos das paradas e os bate-voltas, nunca a casa; as fases tracejadas (noites em aberto num país) também ficam à vista; sem parada localizada, a caixa dos países das noites em aberto ou, nas viagens antigas, o escopo (caixa do país ou um raio em volta da cidade). O nível (cidade, região, país, mundo) sai da extensão.
- **Entrar na cidade.** Tocar numa fase: porta de shoji e `flyTo` na caixa dos lugares; as figurinhas com coordenadas viram pontos com selo por tipo (景 食 買 山 駅 宿), cada dia vira uma trilha pontilhada colorida e o dia escolhido acende (o resto esmaece); fichas de dias no cabeçalho; "⚑ N sem lugar" leva a marcar com um toque; segurar no mapa (ou "+ Lugar aqui") cria um lugar já posicionado.
- **O tempo anda.** O cursor de dia (trilha, fichas, cartão do dia, "▶ Ver a viagem") move o grupo pela trilha (`route.ts` dá a posição pura; a camada anima como fração do caminho, 0,45–2,4 s, coraçãozinho ao chegar). Dentro da cidade, o grupo pula para o primeiro lugar do dia; ao "ver a viagem", o mapa segue a cidade de cada dia.
- **Bonequinhos:** de 1 a 4, lado a lado; 5 ou mais, a Kombi. Editar nomes e visual: subprojeto 2.
- **Temas:** decoração por país (sakura e torii no Japão, palmeiras nos trópicos, castelos na Europa, cactos no deserto); paleta e partículas por tema: próximas rodadas.
- **Bonequinhos:** gerador de sprites; viajantes podem existir sem conta. De 1 a 4, lado a lado; 5 ou mais, uma **Kombi** ("uma galera"). Nos trechos, o grupo vira o veículo. Participantes diferentes fazem o grupo se dividir no mapa.
- **Temas automáticos** por destino, estação e hemisfério, com o nome no idioma local. A intensidade do jogo é ajustável.

## 9. Compartilhar

| Papel        | Pode                                                |
| ------------ | --------------------------------------------------- |
| Dono         | Tudo, incluindo papéis, apagar e transferir a posse |
| Editor       | Editar a viagem                                     |
| Comentarista | Ver e sugerir                                       |
| Leitor       | Ver                                                 |

- Convite por link com papel (revogável, com validade), enviado pelo WhatsApp ou outro app através do compartilhamento do celular.
- Presença ao vivo e histórico.
- "Usar como modelo" fica para depois.

## 10. Tecnologia

**Stack:**

- React + TypeScript + Vite
- PWA (`vite-plugin-pwa`)
- Zustand
- GSAP
- MapLibre GL + OpenFreeMap
- `d3-geo` + `world-atlas`
- Photon (busca de lugares)
- OpenRouteService (rotas)
- `tz-lookup` (fusos)
- frankfurter.app (câmbio)
- Firebase: Auth (Google + link por e-mail), Firestore com persistência offline, Storage e Hosting
- Vitest + fast-check e Playwright

> **Atualizado em 2026-10-14:** login, nuvem, colaboração e publicação seguem a spec [`publicacao-contas-colaboracao`](2026-10-14-publicacao-contas-colaboracao-design.md): Firebase Auth só para login e Cloudflare (Worker, Durable Objects, D1) para os dados. O texto abaixo sobre Firestore fica como registro da decisão anterior.

**Por que Firebase:**

- Funciona offline no navegador de forma madura.
- Tempo real e regras de segurança por papel.
- O plano gratuito não pausa projetos inativos; o Supabase gratuito pausa ([Bytebase](https://www.bytebase.com/blog/supabase-vs-firebase.md), [RxDB](https://rxdb.info/articles/alternatives/supabase-alternative.md)).

**Atenção:**

- As fotos exigem o plano Blaze (pago por uso, com cota gratuita); configurar alerta de orçamento.
- O Nominatim proíbe autocompletar ([política](https://operations.osmfoundation.org/policies/nominatim/)), por isso a busca usa o Photon.

**Produto público:** LGPD (política de privacidade, exclusão de conta e dados), viagens privadas por padrão, links impossíveis de adivinhar.

## 11. Subprojetos

| #   | Subprojeto                  | Entrega                                                                                                                           |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Fundação + motor do roteiro | Detalhado na Parte II                                                                                                             |
| 2   | Mundo                       | Tabuleiros por formato, mundos, rotas reais, mapa local, bonequinhos, Kombi, veículos, temas                                      |
| 3   | Utilidade                   | Reservas com campos por tipo, recursos, âncoras, prazos, orçamento com divisão, Kit, XP e conquistas, importação de viagens da v1 |
| 4   | Na viagem                   | Modo Hoje, offline completo, cartão do taxista, exportações, fotos e Memórias, participantes                                      |
| 5   | Crescimento                 | Usar como modelo, link público, votos, caixa de entrada, "Montar meus dias", IA opcional                                          |

---

# Parte II — Subprojeto 1: fundação + motor do roteiro

## 12. Escopo

**Dentro:**

- Projeto e PWA instalável.
- Login (Google e link por e-mail).
- "Minhas viagens".
- Criar viagem (onboarding §7).
- Tela da viagem com navegação inferior **Mapa · Roteiro · Mochila · Quests**.
- **Motor com a gramática completa** (§13).
- Faixa + Lista com paradas e trechos: modo, horários, pontas, noites a bordo, paradas no caminho.
- Dias com visitas.
- Mochila com busca (Photon), prioridades, cores e "+ Agendar".
- Reservas **básicas**: título, tipo, datas e vínculo, só o necessário para os avisos.
- Desfazer.
- Saúde do roteiro (as regras que o subprojeto 1 já consegue avaliar).
- Tabuleiro simples (contornos + paradas + trilha, visual da v1).
- Compartilhamento por link com papéis.
- Persistência offline do Firestore e fila de operações.

**Fora** (vai para os subprojetos 2–5):

- Mapa local, rotas reais, bonequinhos animados, temas automáticos.
- Campos detalhados de reservas, tela de recursos e âncoras.
- Orçamento, XP, conquistas.
- Modo Hoje, fotos, exportações.
- Comentarista com sugestões.

**Observação:** os tipos de Recurso, Âncora, Participantes e Ritmo **existem no motor** desde já, sem tela própria. Assim nada vira remendo depois.

## 13. Modelo de dados do motor

```ts
// Fonte da verdade: src/engine/types.ts (este bloco resume).
type ID = string
type ISODate = string // "2030-04-01" (data local do destino)
type LocalTime = string // "06:12"

type Lock = 'free' | 'fixed' // volta livre ou marcada
type Pace = 'calm' | 'normal' | 'intense'
type LegMode = 'flight' | 'train' | 'bus' | 'car' | 'boat' | 'walk' | 'bike' | 'moto'
type Lodging = 'hotel' | 'hostel' | 'apartment' | 'friends' | 'camping' | 'motorhome' | 'onboard'
type Slot = 'morning' | 'afternoon' | 'evening' | 'any'
type Rarity = 'maybe' | 'want' | 'must' // Se der · Quero · Imperdível

interface Traveler {
  id: ID
  name: string
  userId?: ID
  sprite?: SpriteSpec
}

interface Destination {
  // um lugar com Mochila; pode ter 0..n paradas
  id: ID
  name: string
  localName?: string
  country?: string /* ISO2 */
  lat?: number
  lon?: number
  tz?: string
  kind: 'city' | 'region' | 'park' | 'vessel'
}

interface Place {
  // item da Mochila (fora do itinerário)
  id: ID
  destinationId: ID
  name: string
  lat?: number
  lon?: number
  rarity: Rarity
  estMinutes?: number
  note?: string
}

interface Visit {
  id: ID
  placeId: ID
  slot: Slot
  time?: LocalTime
  note?: string
  participants?: ID[]
  visited?: boolean
}
type DayPlan = Visit[]

interface Stop {
  id: ID
  destinationId: ID | null // null = noites em aberto (sem visitas)
  days: DayPlan[] // noites = days.length (>= 1); o plano de cada dia mora aqui
  tentative?: boolean
  lodging: Lodging
  participants?: ID[]
}

interface Leg {
  id: ID
  from: ID | 'home'
  to: ID | 'home' // ids de Stop
  mode: LegMode
  dep?: LocalTime
  arr?: LocalTime
  arrDayOffset?: number // +1 chega no dia seguinte
  fromHub?: Hub
  toHub?: Hub
  via?: Hub[]
  durationMin?: number // duração digitada (vence a estimativa)
  aboard: DayPlan[] // noites a bordo (nunca no trecho de volta: lá vale arrDayOffset)
  waypoints: Visit[] // paradas no caminho
  participants?: ID[]
  touched?: boolean // a pessoa mexeu: é arquivado (não descartado) se sair da rota
}

type DayRef =
  | { kind: 'stop'; stopId: ID; ordinal: number }
  | { kind: 'leg'; legId: ID; ordinal: number }
  | { kind: 'departure' } // dia da volta

interface Itinerary {
  // vive inteiro no documento trips/{id}
  version: number // incrementa a cada operação
  start: ISODate | null // null = datas desconhecidas ("dia 1, dia 2…")
  lock: Lock
  defaultMode: LegMode
  pace: Pace
  travelers: Traveler[]
  home?: { name: string; lat?: number; lon?: number; tz?: string }
  stops: Stop[] // ordem = ordem da viagem
  legs: Leg[] // ativos: ida, um por par vizinho, volta
  archivedLegs: Leg[] // trechos com conteúdo cujo par saiu da rota (voltam se o par voltar)
  departurePlan: DayPlan // plano do dia da volta
  resources: Resource[]
  anchors: Anchor[]
  returned: { placeId: ID; fromDate: ISODate | null; fromLabel: string }[] // "voltou de qua 07" (até 50)
}

type Booking =
  // subcoleção bookings; NUNCA alterada pelo motor
  | {
      id: ID
      kind: 'lodging'
      title: string
      destinationId: ID
      checkin: ISODate
      checkout: ISODate
      status: 'planned' | 'booked'
      archived?: boolean
    }
  | {
      id: ID
      kind: 'transport'
      title: string
      fromDestinationId: ID | 'home'
      toDestinationId: ID | 'home'
      date: ISODate
      mode: LegMode
      status: 'planned' | 'booked'
      archived?: boolean
    }
  | {
      id: ID
      kind: 'ticket' | 'other'
      title: string
      date?: ISODate
      destinationId?: ID
      status: 'planned' | 'booked'
      archived?: boolean
    }
```

**Destinos, lugares e reservas** ficam em subcoleções. O **itinerário** fica inteiro no documento da viagem: assim cada operação é uma transação num único documento. Mesmo uma viagem de um ano fica bem abaixo do limite de 1 MB.

**Decisões tomadas na implementação (M1):**

- Os planos dos dias moram dentro das paradas (`Stop.days`) e dos trechos (`Leg.aboard`), em vez de um mapa `plans` à parte: mover uma cidade leva os dias junto sem traduzir chaves.
- As reservas apontam para **destinos e datas**, não para ids de parada: assim continuam fatos estáveis quando paradas se fundem, dividem ou somem. `bookingStatus` encontra a parada ou o trecho pela data.
- Remover a única cidade deixa todas as noites em aberto (não há erro de "última cidade"); só `closeOpen` recusa encurtar até zero.
- A noite no avião da volta não é noite da viagem: o trecho de volta usa `arrDayOffset` e recusa noites a bordo.
- Ao trocar a primeira ou a última cidade, a nova ida ou volta herda o meio da anterior (o voo continua voo).
- Um comando que não muda nada (ex.: mover uma visita para onde ela já está) devolve `NO_CHANGE` e não vira Desfazer.

## 14. Operações do motor

Assinatura comum:

```ts
op(state, args) => { state, inverse, effects }
// ou { error: { code, message, suggestions } }
```

- As operações são funções **puras e determinísticas**, sem `Date.now()` ou ids aleatórios dentro do motor. Os ids vêm nos argumentos.
- **O `inverse` é um remendo só dos campos que a operação tocou** (paradas, trechos, início, trava, plano do dia da volta), com os valores de antes.
  - Desfazer aplica esse remendo **apenas se aqueles campos não mudaram desde então**.
  - Se outra pessoa mexeu neles, o Desfazer é recusado com a explicação "alguém mudou isso depois", em vez de apagar o trabalho dela.
- `effects` descreve o que mudou, para a interface narrar:
  - `returnedToBag: { placeId, from: DayRef }[]`;
  - `datesChanged`;
  - `merged`;
  - `legsCreated`, `legsArchived`.

**Regras gerais:**

- **Nenhuma operação decide sozinha quem cede noites quando há escolha.** A interface passa `source` / `target` explicitamente (a pergunta "De onde sai essa noite?"). O motor só sugere: `suggestDonors(stopId)` devolve as cidades com ≥ 2 noites, da mais próxima para a mais distante.
- **Regra da ponta (§5.1.1):** dias entram e saem na ponta que se moveu. Todos os outros dias mantêm data e plano.
  - Quando a noite vem de, ou vai para, uma cidade **depois**, a ponta é o fim.
  - Quando é uma cidade **antes**, a ponta é o começo.
  - As cidades do meio só deslocam, com os planos indo junto.
  - As visitas de dias que saem vão para `effects.returnedToBag` e para `itinerary.returned` ("voltou de qua 07"). Os Places nunca são apagados.
- **Noites em aberto** são paradas com `destinationId: null`. Não têm dias planejáveis. Duas vizinhas em aberto se fundem.
- **Depois de qualquer mudança de ordem, o motor recalcula os trechos:**
  - mantém o trecho de cada par que já existia;
  - restaura de `archivedLegs` um trecho cujo par voltou;
  - cria trechos novos com `defaultMode` (ou sugestão por distância);
  - move para `archivedLegs` os trechos com conteúdo (horário, pontas, paradas no caminho) cujo par sumiu, e descarta os vazios.
- **Paradas vizinhas do mesmo destino se fundem:** as noites somam e os dias da segunda vêm depois dos da primeira. `effects.merged` registra a fusão, e o inverso desfaz.
- **Nenhuma operação toca em `Booking`.**

| Operação                                                                            | Semântica                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setNights(stopId, n, via)`                                                         | `n ≥ 1`. `via` diz de onde vem ou para onde vai a diferença: `{ kind: "return" }` (move a volta), `{ kind: "stop", stopId }` (outra cidade cede ou recebe; as cidades do meio deslocam) ou `{ kind: "open" }` (ao encolher, deixa noites em aberto na ponta). A doadora precisa ficar com ≥ 1 noite, senão o erro `DONOR_TOO_SHORT` traz as sugestões de `suggestDonors`.                                                       |
| `moveBoundary(index, k)`                                                            | Entre `stops[index]` e `stops[index+1]`: uma ganha `k` e a outra perde `k`, **nas pontas encostadas**. Ambas ≥ 1. O total é preservado.                                                                                                                                                                                                                                                                                         |
| `shiftStop(stopId, ±1)`                                                             | Precisa de vizinha dos dois lados: a anterior ganha (ou perde) 1 e a seguinte o contrário. Na primeira ou última parada, a interface oferece mudar a ida ou a volta.                                                                                                                                                                                                                                                            |
| `reorderStop(stopId, toIndex)`                                                      | Muda a ordem, recalcula trechos, funde vizinhas iguais.                                                                                                                                                                                                                                                                                                                                                                         |
| `insertStop(index, stopId, destinationId, nights)`                                  | 🔓: estende a viagem. 🔒: a vizinha cede (erro se não puder).                                                                                                                                                                                                                                                                                                                                                                   |
| `splitStopWith(stopId, afterOrdinal, newStopId, destinationId, nights, tailStopId)` | Divide S em S1 (`afterOrdinal` dias) + Nova + S2 (o resto, com o mesmo destino de S). 🔒: as noites da Nova saem de S2 e, se faltar, de S1. Cada parte precisa de ≥ 1 noite, senão erro com sugestão de inserir antes ou depois. 🔓: a volta se move.                                                                                                                                                                           |
| `removeStop(stopId)`                                                                | **A parada vira noites em aberto** (lixeira). As visitas vão para a Mochila. O destino e a Mochila permanecem ("Destinos guardados").                                                                                                                                                                                                                                                                                           |
| `fillOpen(openStopId, destinationId, nights?, newStopId)`                           | Preenche o espaço todo ou parte dele (o resto continua em aberto). Funde com a vizinha se for a mesma cidade.                                                                                                                                                                                                                                                                                                                   |
| `stretchInto(openStopId, side)`                                                     | A vizinha (`before` / `after`) ocupa o espaço, com dias vazios na ponta encostada. Se as duas vizinhas forem a mesma cidade, elas se juntam numa só, e os planos das duas partes são mantidos.                                                                                                                                                                                                                                  |
| `closeOpen(openStopId)`                                                             | Remove as noites em aberto e encurta a viagem. As cidades depois dela antecipam, com os planos indo junto.                                                                                                                                                                                                                                                                                                                      |
| `removeDay(dayRef, via)`                                                            | Remove aquele dia, e as visitas dele vão para a mochila. O buraco fecha pelo lado de `via`: `open` (padrão com volta marcada) faz os dias seguintes da cidade anteciparem e põe 1 noite em aberto logo depois dela, sem mexer no resto; `return` faz tudo depois antecipar, incluindo a volta; `stop` faz quem ganha a noite fechar o buraco do lado dela, e as cidades do meio deslocam. Com 1 noite, equivale a `removeStop`. |
| `swapDays(a, b)`                                                                    | Troca as visitas de dois dias da **mesma** parada.                                                                                                                                                                                                                                                                                                                                                                              |
| `setTripStart(date \| null)`                                                        | Desloca tudo; `null` passa para dias relativos.                                                                                                                                                                                                                                                                                                                                                                                 |
| `setTripEnd(date, takeFrom[])`                                                      | Encurtar exige escolher de quais paradas tirar (a interface sugere a mais longa). Alongar adiciona noites à última parada (ou a `takeFrom[0]`).                                                                                                                                                                                                                                                                                 |
| `setLock(lock)`                                                                     | Só muda a trava.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `setLegMode / setLegTimes / setLegHubs`                                             | Editam o trecho. O motor não toca na passagem: se ela é de outro meio, a derivação `bookingStatus` aponta `wrong-mode`.                                                                                                                                                                                                                                                                                                         |
| `setLegNightsAboard(legId, n)`                                                      | 🔒: a vizinha seguinte cede. 🔓: estende. Cria ou remove dias do tipo `leg`.                                                                                                                                                                                                                                                                                                                                                    |
| `addWaypoint / removeWaypoint`                                                      | Paradas no caminho de um trecho.                                                                                                                                                                                                                                                                                                                                                                                                |
| `scheduleVisit(visitId, placeId, dayRef, slot)`                                     | Agenda; o mesmo lugar pode estar em vários dias.                                                                                                                                                                                                                                                                                                                                                                                |
| `unscheduleVisit / moveVisit / setVisitMeta`                                        | Desagenda, move ou edita dados da visita.                                                                                                                                                                                                                                                                                                                                                                                       |
| `setParticipants(target, ids)`                                                      | Define quem está numa parada, trecho ou visita.                                                                                                                                                                                                                                                                                                                                                                                 |
| `addResource / removeResource / addAnchor / removeAnchor`                           | Recursos e âncoras (sem tela neste subprojeto).                                                                                                                                                                                                                                                                                                                                                                                 |
| `setTentative / setLodging / setPace / setDefaultMode / setTravelers`               | Ajustes da parada e da viagem.                                                                                                                                                                                                                                                                                                                                                                                                  |

## 15. Derivações (funções puras)

- **`days(itinerary)`**:
  - lista de dias com `ref`, `date | null`, `isTransferDay` e trecho de chegada;
  - visitas;
  - destinos visitados no dia (para identificar bate-volta);
  - `estimated` quando há parada tentativa antes do dia.
  - Fuso: a data de chegada usa `arrDayOffset` quando há horários.
- **`worlds(itinerary)`**: grupos por país.
- **`suggestDonors(itinerary, stopId)`**: cidades que podem ceder noite, da mais próxima para a mais distante, com a prévia do efeito de cada uma.
- **`bookingStatus(booking, itinerary)`**:
  - `ok`;
  - `wrong-mode` (passagem de trem num trecho que virou ônibus);
  - `out-of-window` (datas não batem com a janela da parada ou o dia do trecho);
  - `orphan` (o trecho ou a parada não existe mais).
- **`health(itinerary, places, bookings)`**, lista de pendências com tipo, gravidade e alvo:
  - imperdível sem dia;
  - reserva fora da janela;
  - passagem órfã;
  - noite sem reserva de hospedagem (exceto pouso "casa de amigos" e noites a bordo), com destaque para a **cobertura parcial**: uma parada com reserva que cobre só parte das noites ("noites 17 e 18 sem hospedagem"), achada no protótipo depois de um arraste;
  - trecho sem reserva de transporte, só para avião, trem, ônibus e barco;
  - direção longa (estimativa por distância × fator ÷ velocidade enquanto não houver rotas reais);
  - âncora fora de qualquer parada do seu destino;
  - noites em aberto;
  - passagem de outro meio no trecho.
- **`estimateLeg(leg)`**: distância em linha reta × fator do modo ÷ velocidade média, para mostrar e para a Saúde.

## 16. Invariantes (testes com sequências aleatórias via fast-check)

Depois de qualquer sequência válida de operações:

1. Toda parada tem `nights` inteiro ≥ 1.
2. O total de noites (paradas + a bordo) só muda quando a pessoa escolhe mexer na volta: `via: return`, `setTripEnd` ou `closeOpen`.
3. Existe exatamente um trecho ativo para cada par vizinho, mais a ida e a volta.
4. **Conservação de visitas:** toda visita que existia continua num dia ou trecho, ou aparece em `effects.returnedToBag`, ou foi removida por uma operação explícita de desagendar.
5. Nenhum `Place` some.
6. Nenhuma reserva muda (o motor não as recebe).
7. `applyInverse(op(state)) === state`, em igualdade profunda.
8. Os dias são contínuos: dia i = início + i (mais os deslocamentos de fuso dos trechos).
9. Não existem paradas vizinhas com o mesmo destino, nem duas noites em aberto vizinhas.
10. **Regra da ponta:** depois de `setNights`, `moveBoundary` e `removeDay`, todo dia que não está numa ponta movida mantém a data e as visitas, exceto os das cidades que deslocam inteiras, que mantêm as visitas e mudam a data em bloco.
11. Noites em aberto nunca têm visitas.

## 17. Interface do subprojeto 1

_Revisada em 2026-10-13 depois do retorno ao laboratório do motor (ver `docs/aprendizados.md`). Toda tela segue `docs/inventario-de-experiencia.md`._

**Como cada elemento é desenhado:** a frase de quem viaja → o gesto → a resposta visual → o que muda junto → a emoção. Todo gesto de arrastar tem o mesmo caminho em palavras (tocar no elemento abre as ações escritas), por acessibilidade (WCAG 2.2, 2.5.7) e precisão.

### 17.1 Casca e HUD

- **Abas embaixo (M3.1):** Mapa · Atividades · Tarefas. Topo: o HUD escuro da v1. Vocabulário de jogo só no visual e nas comemorações; navegação e ações em palavras comuns ("destino" é a palavra genérica).
- **HUD (M3.3): uma linha** — voltar, nome da viagem (abre "Sua viagem": nome, quem vai, de onde saem e voltam, datas), modo dia/noite (um botão que alterna claro ↔ escuro; segue o aparelho só até o primeiro toque; lembrado; o mapa de tiles e as partículas seguem), Desfazer e o menu "Mais opções" (Como jogar, sons). A **contagem** e o **nível de preparo** (com a barra de XP) ficam na contagem do mapa; o nível aparece também no topo das Tarefas.
- **Avisos:** no pé da tela; com um painel aberto, no topo (nunca por cima do painel).
  - Antes da viagem: "Faltam 172 dias". Durante: "Dia 5 de 23 · hoje em Kyoto". Depois: "Viagem completa". Sem data: "Escolha a data de ida".
  - Nível: LV 1 "Sonhando" → LV 2 "Rascunho" → LV 3 "Roteiro firme" → LV 4 "Quase lá" → LV 5 "Pronto pra partir", com a barra de XP listrada.
- **XP vem do estado, não de cliques:** cada passagem comprada, cada cidade com hospedagem em todas as noites, cada imperdível com dia e cada item com dia vale pontos. Desfazer tira os pontos; mexer em noites não dá pontos. Sem sequência diária e sem culpa.
- **Comemorações em três tamanhos:** carimbo 済 e "+30 XP" a cada passo; destino com todas as atividades marcadas num dia ("TUDO COM DIA!") com chuva de pétalas; LEVEL UP ao mudar de nível. Sons 8 bits opcionais, desligados por padrão. Tudo respeita "reduzir movimento".

### 17.2 Mapa (a tela da viagem, M3)

- **Uma tela só, como na v1:** o painel do mapa (§8) com a contagem e o resumo por cima ("Japão · 23 noites · 6 lugares"), "▶ Ver a viagem" e "+ Adicionar destino" (a contagem é compacta: rótulo, número e unidade numa linha, com o nível e a barra de XP embaixo; o resumo "23 noites · 6 lugares" fica no cabeçalho da trilha); logo abaixo a **Trilha** (§17.3); o **cartão do dia** (dia N de T, data, onde está, onde dorme (nome da hospedagem, ou "onde vocês dormem?") e as atividades do dia com "+ Atividade"); e o **Roteiro** (§17.4). No desktop (≥ 900 px), mapa e trilha à esquerda e o roteiro à direita.
- **Cursor de dia:** tocar numa data ou arrastar pela régua, tocar num destino da trilha (vai para o primeiro dia dele e rola o roteiro até o cartão), as fichas da cidade e "▶ Ver a viagem" movem o mesmo cursor; mapa, cartão do dia e trilha seguem.
- Tocar numa fase entra na cidade (§8); "◀ Mapa" volta. **Dentro da cidade, mudar o dia muda a cidade** (trilha, régua, cartão do dia e "▶ Ver a viagem" seguem a mesma regra do `setCursorDay`).
  \1- **Tiles (M3.3):** o mapa de tiles nasce já enquadrado e só substitui o papel quando os primeiros tiles estão desenhados (`idle`); nunca um mar vazio no lugar do contorno.
- Depois de criar a viagem, a pessoa cai aqui, com o mapa enquadrado nos destinos.

### 17.3 Roteiro: a Trilha (visão geral, aprovada)

- **Régua de dias** sob os blocos: dia da semana e número, mês fixo à esquerda ao rolar, fim de semana tingido; bandeiras IDA e VOLTA (com 🔒 quando marcada) nas pontas.
- **Blocos** por cidade, largura proporcional às noites, com o selo da escrita local; noites a bordo hachuradas com o veículo; noites em aberto tracejadas com "+". Entre as cidades, o ícone do transporte.
- **Gestos:**

  | Você quer…                                      | Gesto                                                                                    | Caminho em palavras (no cartão do destino)          |
  | ----------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------- |
  | Mais ou menos noites                            | Arrastar o pegador ◆ da divisa, com balão de prévia ao vivo                              | estepe `– +` de noites (com as escolhas da §5.1)    |
  | Chegar 1 dia antes ou depois mantendo as noites | Segurar a cidade e arrastar **pouco** para o lado: ela empurra a vizinha dia a dia       | "⋯" → "Chegar 1 dia antes" / "Chegar 1 dia depois"  |
  | Mudar a ordem                                   | Segurar e arrastar **além** da vizinha (o balão diz "Kyoto vai para depois de Tóquio")   | "⋯" → "Mudar a ordem"                               |
  | Tirar a cidade                                  | Segurar → a lixeira em pixel aparece → soltar nela ("puf" de pétalas)                    | "⋯" → "Tirar do roteiro"                            |
  | Visitar outra cidade no meio desta              | Arrastar a cidade da **prateleira de destinos** (sob a trilha) e soltar no meio do bloco | tocar no destino na prateleira → "No meio de Kyoto" |
  | Pôr uma cidade entre duas                       | Soltar da prateleira numa divisa                                                         | "+ Parar no caminho" no trecho                      |
  | Preencher noites em aberto                      | Soltar da prateleira no espaço tracejado, ou tocar no "+"                                | "+ Escolher destino"                                |
  - Para "pouco" e "além": arrastar até a vizinha ficar com 1 noite empurra; passar disso, ou uma vizinha de 1 noite, muda a ordem. O balão sempre diz qual dos dois vai acontecer antes de soltar.
  - Arrastar um bloco já na trilha só empurra, reordena ou vai para a lixeira. Para dividir uma estadia, a cidade vem da prateleira: assim os gestos nunca se confundem.
  - Soltar onde não pode faz o bloco balançar e voltar, com o balão dizendo por quê ("Volta marcada. Toque no 🔒 para liberar.").
  - **Mouse × toque (M3.2, normas dnd-kit/SortableJS):** com o **mouse**, um bloco (ou uma ficha da prateleira) levanta ao mover 6 px, sem espera; a **régua** rola a faixa ao arrastar e o clique escolhe o dia; a roda do mouse rola a faixa. Com o **dedo**, segurar 450 ms levanta (o bloco infla enquanto espera, vibra; alça ⋮⋮ no canto), os blocos rolam a faixa e a régua passa os dias (a barra de dias da v1). No toque, o arraste continua mesmo se o navegador cancelar o ponteiro. **Tocar ou clicar sem arrastar** leva ao cartão do destino no roteiro e põe o cursor no primeiro dia dele; não abre menu.
    \1 - **Dica e prateleira (M3.3):** a dica da trilha some depois do primeiro arraste (volta com "Como jogar"); a prateleira mostra só os destinos guardados (fora da trilha) e "+ Adicionar destino" — um destino da trilha entra no meio de outro pelo "+ Adicionar destino → No meio de…".

- **Zoom:** "Dias" (44 px por noite) e "Ver tudo" (a viagem inteira na largura da tela). Estadias longas mostram semanas na régua; o arraste continua em dias.
- **Sincroniza na hora:** roteiro, mapa, tarefas, atividades que ficaram sem dia, alertas na própria trilha (bandeirinha vermelha no bloco com hotel fora das datas).

### 17.4 Roteiro: cidades, trechos e dias (visão granular)

- Lista na ordem da viagem: cartão de cada cidade e, entre eles, o trecho.
- **Roteiro em acordeão (M3.3):** um destino aberto por vez: o do dia escolhido; tocar no cabeçalho abre outro (e leva o cursor ao primeiro dia dele) ou fecha o aberto; tocar na trilha abre; pairar com uma atividade arrastada sobre um cartão fechado abre o cartão. Fechado, o cartão é uma linha: nome, datas e "7 noites · 5 atividades · 宿 済". "+ Atividade" só nos dias vazios; nos outros, um "+" discreto no fim da linha.
- **Cartão do destino (M3.1):** selo, datas, noites com `– +`, onde se dorme (nome da hospedagem com 済 quando reservada; "onde vocês dormem?" abre o painel de hospedagem), os **dias sempre à vista** (data, atividades por turno e "+ Atividade" em cada um; "⋯" do dia: tirar esta noite, trocar com outro dia), as **atividades ainda sem dia** do destino e dos bate-voltas (chips: arrastar até o dia, ou tocar e escolher o dia; no M3.4 vira o catálogo, §17.10). **As atividades dos dias também arrastam** (M3.2): para outro dia (muda de dia, inclusive no cartão do dia) ou para a área "sem dia" (tira do dia); mouse ao mover 6 px, dedo segurando 300 ms e um "⋯" com o raro: mudar a ordem, chegar 1 dia antes/depois, tirar do roteiro. Sem "noites incertas": não resolvia um problema real.
- **Trecho (M3.3):** uma linha tocável (veículo, nome, data, meio, horários, duração) com a passagem ao lado ("Passagem: falta comprar" / "comprada 済", que desmarca no mesmo lugar, com Desfazer; comprar a volta marca a volta). Tocar na linha abre "Editar trecho": meio, horários, noites a bordo (a escolha volta ao trecho) e "+ Parar no caminho".
- **Regra dos painéis:** painéis-editores (trecho, atividade, visita, hospedagem, "Sua viagem") ficam abertos ao mudar um campo (`keep`); painéis de escolha fecham ao escolher; criar, apagar e salvar fecham.
- **Painel "Nova atividade":** nome com sugestões perto do destino (busca online, só pontos de interesse), tipo, prioridade como seleção (Se der · **Quero** · Imperdível, "Quero" já marcado) e o botão **"Criar atividade"** (desligado sem nome). Aberto de um dia, a atividade já entra nele e as "já na lista, sem dia" entram com um toque. É o mesmo painel de "+ Atividade aqui" (segurar no mapa da cidade, já com o lugar) e do "+ Atividade" da aba Atividades.
- **Painel "Onde vocês dormem em X?":** as hospedagens da parada com "já reservei" / "ainda não reservei" e "Tirar"; para as noites que faltam, o nome (sugestões de hotéis online, ou "Hospedagem em X") e "já reservei" (carimbo 済 e XP).

### 17.5 Atividades: cartões com cara de coleção

- A palavra "mochila" fica só no motor (o conjunto de atividades de um destino); na interface é sempre **atividade**.
- Cada destino é uma **página** ("Kyoto 京都 · 5/8 com dia", com a barra), na ordem da viagem; depois os bate-voltas e os "Destinos guardados". "+ Atividade" no cabeçalho abre o painel "Nova atividade" (§17.4).
- Cada atividade é um **cartão** com moldura de prioridade: Se der (prata), Quero (azul), **Imperdível (dourada, com brilho)**.
  - Com dia: em cor, com o chip do dia ("seg 15", "×2").
  - Sem dia: tracejada; imperdível sem dia brilha e vira tarefa.
  - "Ficou sem dia (era qua 07)" quando saiu de um dia removido.
  - Feita: carimbo 済.
- Tocar numa atividade: pôr num dia (os dias do destino primeiro, os de bate-volta depois), prioridade, tipo, marcar como feita, ver no mapa da cidade ou marcar no mapa, abrir no Google Maps, apagar (com Desfazer).
- Destino com todas as atividades marcadas num dia comemora uma vez ("TUDO COM DIA!").

### 17.6 Quests

- A Saúde do roteiro (§15) com textos de quem viaja, gravidade e "Ver" que leva ao alvo; algumas resolvem num toque ("Marcar comprada", "Marcar hospedagem", "Colar").
- Lista vazia comemora: "Tudo pronto. Boa viagem!".

### 17.7 Minhas viagens e criar viagem

- **Criar com cidade (M3.2):** o passo 2 pergunta "Vão dormir em outra cidade?" ("O Rio já está. Bate-voltas e passeios entram depois, no roteiro."), campo "Outra cidade"; com país, "Em quais cidades vão dormir?" e o campo "Cidades". Campos de formulário com 16 px (sem zoom no iOS).
- **M3.1:** cada viagem tem "⋯" com Renomear e Apagar (aviso com Desfazer). Abrir um exemplo de novo reaproveita a cópia que já existe; ao abrir, os exemplos antigos ganham as coordenadas e o escopo que faltavam.
- Lista das viagens guardadas no aparelho, "Explorar exemplos" (as 6 viagens de teste, copiadas para mexer sem medo) e "Criar viagem".
- Criar (§7): pra onde (busca de cidades com lista própria offline e, com internet, Photon), quando (ou "ainda não sei"), quem vai, como vão se mover. As noites se dividem igualmente e a viagem abre com "Mundo criado!".

### 17.8 Desfazer em tudo

- Itinerário, mochila e reservas mudam por comandos com inverso. Uma ação composta (comprar a passagem de volta + marcar a volta) é desfeita de uma vez.

### 17.9 Acessibilidade e celular

- Alvos de toque ≥ 44 px, texto ≥ 12 px, contraste 4.5:1, foco visível, "reduzir movimento", painéis inferiores para edição.
- Todo arraste tem o caminho em palavras; segurar para arrastar não pode ser o único caminho.

### 17.10 Atividade repetível, anotações do dia e escolhas que escalam (M3.4)

_Retorno do M3.3: "a mesma atividade em 2 dias", "detalhes de cada dia", "não acho onde pôr detalhes", "listas de 'entre X e Y' não escalam (Itália: 50 cidades, 120 dias)". O motor já separa atividade (`Place`) de visita (`Visit`) e aceita a mesma atividade em vários dias; a mudança é de interface, sem migração de dados._

**Atividade × dia.** Valem para **todos os dias**: nome, tipo, prioridade, lugar no mapa e as **anotações gerais** (`Place.note`). Valem **só para aquele dia**: **anotações do dia** (`Visit.note`), turno, **horário** (`Visit.time`) e "feita". Um dia novo começa limpo.

- **Catálogo do destino** (substitui "sem dia ainda" no cartão do destino): "ATIVIDADES DE KYOTO" — primeiro as sem dia (como antes; imperdível brilha), depois, apagadas, as que já têm dia, com o dia na ficha ("sáb 13" ou "2 dias"); mais de 4 com dia → "+ N com dia" abre o resto (fichas com dia compactas). **Arrastar ou tocar uma ficha do catálogo sempre põe em mais um dia**; tocar abre "Sobre a atividade". Arrastar de um dia para outro move; soltar uma ficha de dia no catálogo tira do dia. **Mesmo dia duas vezes é bloqueado** com o aviso "Fushimi Inari já está em sáb 13.". O painel "Nova atividade" aberto de um dia mostra "DO CATÁLOGO" (as que ainda não estão naquele dia).
- **Painel da atividade no dia** (tocar numa ficha do dia; editor, fica aberto): nome; "sáb 13 · Kyoto" com as gemas e o tipo tocáveis (abrem "Sobre a atividade"); **"Anotações deste dia"** — caixa de texto à vista, exemplo "Ex.: comprar ingresso antes, abre às 9h, levar dinheiro", salva ao sair do campo (com Desfazer); "Copiar de dom 14" quando outro dia da atividade tem anotações e este está vazio; "Geral: …" (só leitura) quando há anotações gerais; **Quando:** turno e horário opcional; "Marcar como feita 済" (só este dia); Mudar de dia · **Repetir em outro dia** · Tirar do dia; "Sobre a atividade ▸".
- **"Sobre a atividade"** (antes "Detalhes da atividade"): prioridade, tipo, lugar no mapa, **anotações gerais** ("vale para todos os dias"), os dias em que está (cada um abre o painel daquele dia), "Pôr em mais um dia", apagar. Sem "feita" (é de cada dia).
- **Ficha do dia:** mostra o horário no lugar do turno ("9:30") e "✎" quando há anotação do dia.

**Escolher onde e quando: linha do tempo com sugestão.** Um componente (`TimelinePicker`) no lugar das listas de frases ("Entre A e B", "Depois de X", um botão por dia):

- Linhas: ✈ Ida, os destinos na ordem (selo, nome, datas, noites), ✈ Volta; entre elas, **frestas "+"** tocáveis. Abre centrado na sugestão (ou na posição atual); com mais de 8 destinos, **busca** que filtra as linhas.
- **Sugestão "no caminho"** fixada no topo com "Pôr aqui": a fresta de menor desvio `d(a,x) + d(x,b) − d(a,b)` (distância em linha reta); sem coordenadas, o fim da viagem. É só destaque — a lista inteira continua.
- **Onde X entra?** fresta → noites e de onde saem; destino com 2+ noites → "no meio de"; noites em aberto → preencher. **Mudar a ordem:** só frestas, "está aqui" na atual. **Pôr em qual dia?:** os destinos em acordeão, o preferido aberto com os dias em fichas ("sáb 13 · 2"); dias em que a atividade já está aparecem marcados e desligados; dias a bordo e o da volta no grupo do lugar onde caem. **"Quando" do "no meio de":** os dias do destino em fichas que quebram linha.
- **De onde sai a noite** (inserir, no meio de, noites a bordo, mais uma noite com a volta marcada, mudar a volta): as **3 opções mais próximas** e "Outro destino…", que abre a linha do tempo só com os que podem ceder.
- **Escolher destino:** até 8 chips (guardados primeiro, depois os últimos usados); a busca também acha os destinos que já estão na viagem.
- **"+ Adicionar destino"** (cartão do fim do roteiro, mapa e prateleira): o destino e depois a linha do tempo, com a sugestão.
- Fora: a régua da trilha em viagens de 120 dias (já tem zoom; medida registrada nos aprendizados) e "quem vai" por atividade.

### 17.11 Tarefas de verdade (M3.6)

_Retorno do M3.4: "as tarefas são o que falta fazer para a viagem; quero criar as minhas, presas a cidade, dia ou atividade, com data limite e observações"._

- **Uma lista só:** as tarefas que o app vê sozinho (§17.6: passagem por comprar, hospedagem, imperdível sem dia, reservas fora do roteiro…) e as que quem viaja escreve, juntas, agrupadas por prazo: Vencidas · Esta semana · Mais tarde · Sem prazo · Feitas (recolhida).
- **Tarefa escrita por quem viaja:** texto; **presa a** viagem, destino (o destino, não a parada: Kyoto duas vezes tem as mesmas tarefas), trecho, dia ou atividade (de atividade vale para todos os dias dela), escolhidos na linha do tempo; **prazo** (data, com atalhos "hoje", "em 1 semana", "1 mês antes da viagem"); **quem faz** (com mais de 1 viajante; filtro "só as minhas"); **link** ("Abrir ↗"); **itens** (checklist); **anotações**; feita (+5 XP); apagar (com Desfazer).
- **Automáticas:** continuam calculadas e somem sozinhas quando resolvidas; ganham prazo, quem faz e anotações, guardados pela chave estável `tipo:alvo`; e **"Não preciso…"** com motivo opcional ("paga a bordo"): sai da lista, conta no progresso sem dar XP, e o motivo fica à vista no trecho ou destino, para mudar de ideia.
- **Onde aparecem:** na aba Tarefas (as escritas primeiro dentro de cada prazo) e no painel do que prendem: "Sobre a atividade", painel do dia da atividade e "Editar trecho" com "+ Tarefa" já presa; no cartão do destino e no cartão do dia só quando existem (o "+ Tarefa" fica no menu ⋯ do destino e do dia, para não encher o roteiro).
- **Passos de painel voltam ao painel** (retorno do M3.5): marcar no mapa e escolher o dia reabrem o painel da atividade.
- **Nada some calado:** apagar o que a tarefa prende a transforma em "da viagem", com "era de Gion".
- **Modelo:** `TripDoc.tasks?: Task[]` e `TripDoc.taskMeta?: Record<chave, { due?, note?, who?, skip? }>`, com `addTask` / `setTask` / `removeTask` / `setTaskMeta` em `runDoc` (Desfazer em tudo); entram pelo `migrate()` do documento (§17.12).

### 17.12 Varredura de bugs, becos e clareza (M3.5)

_Retorno do M3.4: "busca bem detalhada por bugs, corner cases, jornadas, deadends, problemas de interface". Duas auditorias de leitura de código (interface: 40 achados; motor e estado: 26), os graves conferidos no código; cada correção com um teste que falhava antes._

- **Bugs:** "Ver no mapa da cidade" e "Marcar no mapa" a partir de Atividades levam à aba Mapa; "+ Mais uma pessoa" salva na hora; o campo da volta acompanha a ida; datas só valem completas (digitar o ano não cria anos 0002/0202); atividade que é parada de um trecho arquivado se apaga; erro do armazenamento do aparelho não desliga o salvar para sempre e avisa; "Salvar" dos horários volta ao trecho; textos de hospedagem conforme o status; plurais; "Pôr num dia" das Tarefas pelo mesmo caminho do resto; `setPlace` sem mudança não cria Desfazer.
- **Becos sem saída:** viagem sem datas marca hospedagem e passagem (presas ao destino/trecho) e, onde a data é indispensável, oferece "Escolher a data de ida"; hospedagem "com amigos" ou "não precisa"; reservas guardadas listadas em "Sua viagem" com "Voltar"; "Ir para …" nas Tarefas abre o cartão e cobre todos os alvos; sem "Mudar a ordem" com 1 destino; noite em aberto com "Escolher destino"; "Apagar destino" para os guardados; Atividades vazia com "+ Adicionar destino"; nada de "Adiar a volta (mais tarde)" sem datas; mudar a volta sem quem ceda explica o porquê.
- **Clareza:** Tarefas com "Precisa resolver / Atenção / Para fazer" e "Ir para Kyoto"; 済 e 宿 com nome em palavras para leitores de tela e uma linha no tutorial; resumo do cartão fechado em palavras; "destinos" (não "lugares") na trilha; "Passagem comprada" abre um painel curto em vez de desmarcar num toque; a cidade de casa com "×" separado.
- **Acessibilidade e toque:** blocos e pegadores da trilha pelo teclado (Enter abre, ← → mudam noites); alvos de 44 px no toque; painéis devolvem o foco, prendem o Tab, não começam numa ação destrutiva; menus fecham com Escape e toque fora; Enter cria a atividade.
- **Proteção:** apagar uma viagem e apagar uma atividade com anotações pedem um segundo toque.
- **Futuro:** `schemaVersion` no documento e `migrate()` ao abrir.
- **Registrado, não agora:** casos raros de fuso (âncora no dia de saída, linha de data), dois passes seguidos, o mesmo par de cidades em dois trechos, paradas de trechos arquivados, várias abas abertas (vai com a nuvem, M4), dia sem ano no Ano-Novo, "Misturado" no criar viagem.

### 17.13 Painéis empilhados (M3.7)

_Retorno do M3.6: "cliquei em + Tarefa e achei que tinha voltado para a atividade"._ Um painel que abria outro trocava no mesmo lugar, sem animação nem cabeçalho (cerca de 25 passagens).

- **Todo painel diz o que é:** faixa fixa no topo com o tipo em letras pequenas (ATIVIDADE, ATIVIDADE NO DIA, NOVA TAREFA, TAREFA, TRECHO, HORÁRIOS, ESCOLHER O DIA, ONDE ENTRA…).
- **Painel aberto de outro empilha:** desliza da direita e mostra "‹ {painel anterior}" ("‹ Gion"), que volta deslizando da esquerda; fechar (tocar fora, "Fechar", Escape) fecha a pilha toda. Um passo concluído (escolher o dia, salvar horários, "Presa a") volta pela pilha ao painel de origem, que mantém o "‹" dele; criar a tarefa troca "Nova tarefa" pelo painel da tarefa no mesmo lugar da pilha.
- **Criar ou Descartar:** nos painéis de criar (tarefa, atividade, nome da hospedagem), sair com o nome digitado e não criado mostra "Criar “…”?" com [Criar] e [Descartar]; sem nada digitado, sai direto.
- Campos de texto dos editores (anotações, título e link da tarefa) salvam também ao sair do painel sem tirar o foco.
- "Reduzir movimento": sem deslizar.
- **Painéis que editam terminam em "Pronto ✓"** (tarefa, tarefa do app, atividade, atividade no dia, trecho, hospedagem, "Sua viagem"): salvam sozinhos, e "Pronto" volta ao painel anterior ou fecha; os de escolha terminam em "Fechar". A tarefa recém-criada diz "Criada ✓ · tudo aqui salva sozinho".

### 17.14 Sair da cidade e voltar um passo (M3.8)

_Retorno do M3.7: dentro do mapa da cidade, 60% das pessoas levaram mais de 5 s para achar como voltar ao mapa da viagem toda._ O botão dizia "◀ Mapa" (já se está num mapa, e a aba também se chama Mapa); o "‹" do topo saía da viagem; tocar a aba Mapa não fazia nada; o Voltar do celular saía do app.

- **A saída diz para onde leva:** "‹ Viagem toda" ao lado do nome da cidade.
- **Toda saída onde se procura:**
  - o "‹" do topo volta um nível (da cidade, à viagem toda; da viagem, a "Suas viagens");
  - tocar de novo a aba Mapa dentro da cidade volta à viagem toda;
  - Escape (fora de painéis) sai da cidade.
- **Voltar do sistema** (Android, navegador, gesto do iPhone) volta um passo (`stepBack`), sem sair do app nem mudar a URL. A ordem:
  1. painel empilhado → painel anterior;
  2. painel → fecha (perguntando "Criar ou Descartar" se há nome digitado);
  3. tutorial → fecha;
  4. "marcar no mapa" → sai;
  5. outra aba → Mapa;
  6. cidade → viagem toda;
  7. viagem → "Suas viagens".

  Em "Criar viagem", volta ao passo anterior. Em "Suas viagens", o Voltar sai do app.

## 18. Persistência, concorrência e offline

> **Substituída (2026-10-14)** pela §5 da spec [`publicacao-contas-colaboracao`](2026-10-14-publicacao-contas-colaboracao-design.md): o mesmo princípio (a ação é reaplicada sobre o estado mais novo, com fila offline), executado num Durable Object por viagem em vez de transações do Firestore.

- **Online:** cada operação roda numa transação do Firestore, que lê o itinerário atual do servidor, **reaplica a operação** e grava com `version + 1`. Duas pessoas editando ao mesmo tempo não se sobrescrevem; a operação é reaplicada sobre o estado mais novo.
- **Offline:** as transações exigem rede. As operações entram numa **fila local** (IndexedDB) e são aplicadas otimisticamente na tela. Na reconexão, são reaplicadas em ordem. Uma operação que falhar (por exemplo, a parada foi removida por outra pessoa) é mostrada com o motivo.
- **Leitura offline:** a persistência do Firestore fica ativada.
- **Permissões (regras do Firestore):**
  - `trips/{id}.members[uid]` guarda o papel;
  - ler exige ser membro;
  - escrever o itinerário, destinos, lugares e reservas exige ser Dono ou Editor;
  - alterar membros ou papéis só o Dono;
  - `invites/{token}` tem `{ tripId, role, expiresAt, revoked }` e é legível por id;
  - um usuário logado pode se adicionar com exatamente o papel do convite válido (`joinToken` registrado na escrita e verificado pela regra).

## 19. Viagens de teste (fixtures do motor e dos testes ponta a ponta)

1. **Japão (várias cidades com trem):**
   - Tóquio 2 · Ginzan 1 · Tóquio 2 · Kawaguchiko 1 · Tóquio 1 · Kamakura 1 · Osaka 4 · Kyoto 7 · Tóquio 4 (23 noites, de 01/04 a 24/04/2030, 🔒);
   - bate-volta a Nara a partir de Osaka;
   - voos GRU→HND e HND→GRU como trechos de ida e volta.
2. **Rio:** 1 parada de 5 noites; bate-volta a Petrópolis.
3. **Portugal de carro alugado (🔓):** Lisboa 3 · Nazaré 1 · Coimbra 1 · Porto 3 · Douro 2 · Lagos 3 · Lisboa 1; recurso "carro alugado".
4. **Lisboa → Paris → Roma com voos (🔒):** 3 · 4 · 4; três mundos; passagem LIS→CDG reservada.
5. **Cruzeiro:** Barcelona 2 (hotel) · navio 7 noites (pouso a bordo) com escalas como bate-voltas · Barcelona 1.
6. **Caminho de Santiago:** Sarria → Portomarín → Palas de Rei → Arzúa → O Pedrouzo → Santiago, com trechos a pé de 1 noite cada.

## 20. Critérios de aceite do subprojeto 1

- Cada cenário da §5.3 funciona nas fixtures, em tela de 375 px (teste ponta a ponta), com Desfazer.
- As invariantes da §16 passam com ≥ 1.000 sequências aleatórias por execução.
- **Regras do Firestore** (testes no emulador):
  - Leitor não escreve;
  - Editor não altera membros;
  - convite revogado ou vencido não dá acesso;
  - não membro não lê.
- Criar uma viagem com 3 cidades leva menos de 60 s num celular real (teste manual com o mantenedor).
- A interface nunca mostra "tem certeza?" para edições do roteiro.

## 21. Riscos

| Risco                                               | Resposta                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| OpenFreeMap, Photon e OpenRouteService sem garantia | Provedores trocáveis, cache e plano B (linha reta, tabuleiro em cache) |
| Imprecisão ao arrastar no celular                   | `– / +`, `‹ ›` e `↑ ↓` sempre presentes                                |
| Conflitos de edição offline                         | Fila de operações reaplicadas, com explicação quando falhar            |
| Custo de leituras no Firestore                      | Itinerário num documento só; alerta de orçamento                       |
| A gramática completa assustar                       | Tudo aparece só quando usado (princípio 4)                             |

## 22. Protótipo de validação

- **Link:** https://claude.ai/artifact/RALR4DMaxVyqsLoGEy5SLX (descartável).
- **Validado no Chrome:**
  - arrastar divisas;
  - deslocar;
  - encaixar no meio;
  - Desfazer;
  - Mochila e quests.
- **Ajustes que entram no produto:**
  - pegadores de arraste **sob** a Faixa, para não cobrir cidades de 1 noite;
  - largura mínima por noite;
  - esmaecido nas bordas da Faixa;
  - a Faixa rola sozinha até a parada editada;
  - aviso de hospedagem parcial.
- **Motor do protótipo:** 900 sequências aleatórias com as invariantes de conservação. Elas acharam um defeito real (ao deslocar uma parada, a vizinha que ganhava a noite ficava sem o dia vazio correspondente). O motor definitivo terá o mesmo tipo de teste.

## 23. Próximo passo

O plano de implementação do subprojeto 1 está em `docs/superpowers/plans/2026-10-13-subprojeto-1-fundacao-motor.md`.
