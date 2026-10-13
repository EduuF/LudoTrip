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

| Peça | O que é |
|---|---|
| **Parada** | N noites num destino, com tipo de pouso: hotel, hostel, apartamento, casa de amigos, camping, motorhome, a bordo |
| **Trecho** | Ligação entre paradas vizinhas e de/para casa. Tem modo (avião, trem, ônibus, carro, barco, a pé, bike, moto), pontas (aeroporto, estação, porto), horários locais, conexões, paradas no caminho e noites a bordo (ônibus ou voo noturno) |
| **Dia** | Derivado das paradas. Pertence à parada onde se dorme naquela noite, ou ao trecho, numa noite a bordo |
| **Destino + Mochila** | Lugar (cidade, região, parque, navio) com o seu catálogo de lugares desejados |
| **Visita** | Um lugar da Mochila agendado num dia ou como parada no caminho de um trecho, com turno, horário, nota e participantes |
| **Recurso** | Algo com período: carro alugado, passe de trem, eSIM, seguro |
| **Reserva** | Fato do mundo real, com datas e ligada a uma parada, trecho ou recurso. Nunca se move sozinha |
| **Âncora** | Algo com data e hora que não se move: voo comprado, casamento, show |
| **Mundo** | Agrupamento automático por país |
| **Participantes** | Quem está em cada parada, trecho ou visita (padrão: todos) |
| **Ritmo** | Tranquilo, normal ou intenso |

**Regras centrais:**
- **As datas são calculadas:** data de ida + noites. O conteúdo de um dia fica preso à **parada e à posição dentro dela** ("2º dia em Kyoto"), nunca à data.
- **Trechos existem automaticamente entre paradas vizinhas.** Aeroportos e estações são **pontas de trecho, não paradas**.
- **Bate-volta é conteúdo:** um dia de Osaka com visita da Mochila de Nara vira "bate-volta a Nara".
- **Datas, noites e destinos podem ser incertos:** sem data de ida (Dia 1, Dia 2…), noites tentativas, região sem cidade definida.

### 4.1 O que acende sozinho

| Quando a viagem tem… | Aparece |
|---|---|
| Um destino só | Tela de cidade; o tabuleiro é a cidade ou região; as fases são os dias |
| Mais de um país | Mundos, moeda por país, documentos, fusos, idioma do cartão do taxista |
| Trecho de avião | Aeroportos, conexões, bagagem, horários locais, linha de data |
| Trechos de carro | Horas de direção por dia (aviso acima de ~6h), rota por estradas, combustível e pedágio, carro alugado como recurso, PID no exterior |
| Pouso a bordo | Base que se move; escalas viram bate-voltas com horário de volta ao navio |
| Trechos a pé ou de bike | Etapas com distância e desnível |
| Noite a bordo de um trecho | Noite sem pedir hotel |
| Recurso | Uma fita sob a Faixa; trechos fora do período são marcados |
| Participantes diferentes | Bonequinhos que se separam no mapa |
| Âncora | Uma bandeira na data e aviso se ela for ameaçada |

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

| Cenário | Comportamento |
|---|---|
| Deslocar Kyoto 12–15 para 13–16 | A anterior ganha 1 noite e a seguinte perde 1; o conteúdo vai junto; reservas fora da janela viram aviso |
| Começar por Kyoto | Datas e trechos se refazem; passagens que ficaram sem trecho viram órfãs |
| Encaixar Tóquio no meio de Kyoto | Kyoto I + Tóquio + Kyoto II, com a mesma Mochila; os dias sem lugar voltam à Mochila (🔒) ou a volta é empurrada (🔓) |
| Mais ou menos noites; remover um dia | Os dias removidos devolvem as visitas à Mochila |
| Trocar dois dias | Troca o conteúdo; as datas ficam |
| Trocar o modo do trecho | Acende as funções do modo |
| Parada no caminho | Visita dentro do trecho |
| Alguém chega no dia 3 | Participantes da parada |
| Voo remarcado | Tudo desloca; reservas viram avisos |
| Encurtar a viagem | Escolher de qual parada tirar, com sugestão da mais longa |
| Mesma cidade lado a lado | Junta as duas e avisa |

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

  | Raridade | Significado | Moldura |
  |---|---|---|
  | **Se der** | talvez | moldura cinza |
  | **Quero** | prioridade normal | azul |
  | **Imperdível** | não pode faltar | **dourado com brilho suave** |

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

  | # | Fonte | Rótulo |
  |---|---|---|
  | 1 | Horários da passagem ou digitados pela pessoa | "sua passagem" |
  | 2 | Rota real: carro, a pé e bike pelo OpenRouteService (gratuito com chave, ~2.000 rotas/dia); transporte público por um roteador aberto baseado em GTFS (ex.: Transitous/MOTIS) onde houver dados; Google Routes quando valer pagar | "rota real" |
  | 3 | Estimativa pela distância × fator do meio ÷ velocidade típica, com tabela por país (ex.: trem-bala no Japão) | "estimativa" |

  - O resultado fica em cache por par de cidades e meio.
  - **Depois (fase 5):** tempos digitados pelos viajantes viram uma média anônima por rota ("medido por viajantes"), útil para lugares que nenhuma API cobre.

### 6.2 A vibe

- O que manter da v1 está em `docs/guia-de-vibe.md`. Esse guia é um norte, não uma régua.
- O protótipo de edição ficou "limpo demais" e perdeu parte dela. **O app definitivo segue o guia desde o primeiro marco de interface.**

## 7. Criar uma viagem (~60 s)

1. **Pra onde?** Cidades, país, ou região indefinida.
2. **Quando?** Datas, ou "ainda não sei, ~N dias".
3. **Quem vai?** 1–4 ou "uma galera"; cada um monta o bonequinho.
4. **Como vão se mover?** Isso define o modo padrão dos trechos.
5. **Como dividir os dias?** Proposta automática na Faixa.
6. **"Mundo criado!"**

Todos os passos podem ser pulados. Existe também um atalho de escapada.

## 8. Mapa, bonequinhos e temas

- **O tabuleiro muda conforme o formato:**
  - uma cidade: o tabuleiro é a cidade;
  - um país: um mundo;
  - vários países: mapa dos mundos com aviões em arco;
  - road trip: rota real pelas estradas;
  - trilha: perfil de montanha;
  - cruzeiro: rota no mar.
- **Como é gerado:**
  - Natural Earth (`world-atlas`) + `d3-geo`, enquadrado na viagem, com traço simplificado e decoração procedural semeada pela viagem;
  - `relax()` e `placeLabels()` reaproveitados da v1 (`viagem-japao/sakura-quest/index.html`).
- **Mapa local:** MapLibre GL + OpenFreeMap com estilo "de brinquedo"; o `flyTo` é o "entrar na fase".
- **Bonequinhos:** gerador de sprites; viajantes podem existir sem conta. De 1 a 4, lado a lado; 5 ou mais, uma **Kombi** ("uma galera"). Nos trechos, o grupo vira o veículo. Participantes diferentes fazem o grupo se dividir no mapa.
- **Temas automáticos** por destino, estação e hemisfério, com o nome no idioma local. A intensidade do jogo é ajustável.

## 9. Compartilhar

| Papel | Pode |
|---|---|
| Dono | Tudo, incluindo papéis, apagar e transferir a posse |
| Editor | Editar a viagem |
| Comentarista | Ver e sugerir |
| Leitor | Ver |

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

**Por que Firebase:**
- Funciona offline no navegador de forma madura.
- Tempo real e regras de segurança por papel.
- O plano gratuito não pausa projetos inativos; o Supabase gratuito pausa ([Bytebase](https://www.bytebase.com/blog/supabase-vs-firebase.md), [RxDB](https://rxdb.info/articles/alternatives/supabase-alternative.md)).

**Atenção:**
- As fotos exigem o plano Blaze (pago por uso, com cota gratuita); configurar alerta de orçamento.
- O Nominatim proíbe autocompletar ([política](https://operations.osmfoundation.org/policies/nominatim/)), por isso a busca usa o Photon.

**Produto público:** LGPD (política de privacidade, exclusão de conta e dados), viagens privadas por padrão, links impossíveis de adivinhar.

## 11. Subprojetos

| # | Subprojeto | Entrega |
|---|---|---|
| 1 | Fundação + motor do roteiro | Detalhado na Parte II |
| 2 | Mundo | Tabuleiros por formato, mundos, rotas reais, mapa local, bonequinhos, Kombi, veículos, temas |
| 3 | Utilidade | Reservas com campos por tipo, recursos, âncoras, prazos, orçamento com divisão, Kit, XP e conquistas, importação de viagens da v1 |
| 4 | Na viagem | Modo Hoje, offline completo, cartão do taxista, exportações, fotos e Memórias, participantes |
| 5 | Crescimento | Usar como modelo, link público, votos, caixa de entrada, "Montar meus dias", IA opcional |

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
type ID = string;
type ISODate = string;            // "2030-04-01" (data local do destino)
type LocalTime = string;          // "06:12"

type Lock = "free" | "fixed";
type Pace = "calm" | "normal" | "intense";
type LegMode = "flight" | "train" | "bus" | "car" | "boat" | "walk" | "bike" | "moto";
type Lodging = "hotel" | "hostel" | "apartment" | "friends" | "camping" | "motorhome" | "onboard";
type Slot = "morning" | "afternoon" | "evening" | "any";

interface Traveler { id: ID; name: string; userId?: ID; sprite: SpriteSpec }

interface Destination {            // um lugar com Mochila; pode ter 0..n paradas
  id: ID; name: string; localName?: string; country?: string /* ISO2 */;
  lat?: number; lon?: number; tz?: string;
  kind: "city" | "region" | "park" | "vessel" | "undefined";
}

interface Place {                  // item da Mochila (subcoleção places)
  id: ID; destinationId: ID; name: string; lat?: number; lon?: number;
  rarity: "maybe" | "want" | "must";   // Se der · Quero · Imperdível
  estMinutes?: number; note?: string; source?: "photon" | "manual";
}

interface Visit { id: ID; placeId: ID; slot: Slot; time?: LocalTime; note?: string;
  participants?: ID[]; visited?: boolean }

interface Stop {
  id: ID; destinationId: ID | null;  // null = noites em aberto (espaço tracejado, sem dias planejáveis)
  nights: number /* inteiro ≥ 1 */;
  tentative?: boolean; lodging: Lodging; participants?: ID[];
}

interface Hub { kind: "airport" | "station" | "port" | "other"; code?: string; name: string }

interface Leg {
  id: ID; from: ID | "home"; to: ID | "home";      // ids de Stop
  mode: LegMode; dep?: LocalTime; arr?: LocalTime; arrDayOffset?: number; // +1 chega no dia seguinte, −1 linha de data
  fromHub?: Hub; toHub?: Hub; via?: Hub[];
  nightsAboard: number;                             // ≥ 0; noites consumidas pelo trecho
  waypoints: Visit[];                               // paradas no caminho
  participants?: ID[];
}

type DayRef = { kind: "stop"; stopId: ID; ordinal: number }      // ordinal 0..nights-1 (+ dia de volta)
            | { kind: "leg"; legId: ID; ordinal: number };        // noites a bordo

interface Itinerary {              // vive inteiro no documento trips/{id}
  version: number;                 // incrementa a cada operação
  start: ISODate | null;           // null = datas desconhecidas
  lock: Lock; defaultMode: LegMode; pace: Pace;
  travelers: Traveler[];
  homeName?: string;
  stops: Stop[];                   // ordem = ordem da viagem
  legs: Leg[];                     // ativos (um por par vizinho + ida + volta)
  archivedLegs: Leg[];             // trechos com conteúdo cujo par saiu da rota (restaurados se o par voltar)
  plans: Record<string, Visit[]>;  // chave "s:{stopId}:{ordinal}" ou "l:{legId}:{ordinal}"
  departurePlan: Visit[];          // dia da volta (pertence à última parada)
  resources: Resource[]; anchors: Anchor[];
  returned: { placeId: ID; fromDate: ISODate | null; fromLabel: string }[]; // "voltou de qua 07" (últimos 50)
}

interface Resource { id: ID; kind: "rental-car" | "rail-pass" | "esim" | "insurance" | "other";
  title: string; start?: ISODate; end?: ISODate; covers?: LegMode[] }
interface Anchor { id: ID; title: string; date: ISODate; time?: LocalTime; destinationId?: ID }

interface Booking {                 // subcoleção bookings; NUNCA alterada pelo motor
  id: ID; kind: "lodging" | "transport" | "ticket" | "other"; title: string;
  start?: ISODate; end?: ISODate;   // hospedagem: check-in e check-out
  target: { stopId?: ID; legFrom?: ID | "home"; legTo?: ID | "home"; destinationId?: ID };
  mode?: LegMode;                    // transporte: meio da passagem (aviso se o trecho mudar de meio)
  status: "planned" | "booked"; archived?: boolean;
}
```

**Destinos, lugares e reservas** ficam em subcoleções. O **itinerário** fica inteiro no documento da viagem: assim cada operação é uma transação num único documento. Mesmo uma viagem de um ano fica bem abaixo do limite de 1 MB.

## 14. Operações do motor

Assinatura comum:

```ts
op(state, args) => { state, inverse, effects }
// ou { error: { code, message, suggestions } }
```

- As operações são funções **puras e determinísticas**, sem `Date.now()` ou ids aleatórios dentro do motor. Os ids vêm nos argumentos.
- **O `inverse` é um remendo só dos campos que a operação tocou** (paradas, trechos, chaves de `plans`, início, trava), com os valores de antes.
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

| Operação | Semântica |
|---|---|
| `setNights(stopId, n, via)` | `n ≥ 1`. `via` diz de onde vem ou para onde vai a diferença: `{ kind: "return" }` (move a volta), `{ kind: "stop", stopId }` (outra cidade cede ou recebe; as cidades do meio deslocam) ou `{ kind: "open" }` (ao encolher, deixa noites em aberto na ponta). A doadora precisa ficar com ≥ 1 noite, senão o erro `DONOR_TOO_SHORT` traz as sugestões de `suggestDonors`. |
| `moveBoundary(index, k)` | Entre `stops[index]` e `stops[index+1]`: uma ganha `k` e a outra perde `k`, **nas pontas encostadas**. Ambas ≥ 1. O total é preservado. |
| `shiftStop(stopId, ±1)` | Precisa de vizinha dos dois lados: a anterior ganha (ou perde) 1 e a seguinte o contrário. Na primeira ou última parada, a interface oferece mudar a ida ou a volta. |
| `reorderStop(stopId, toIndex)` | Muda a ordem, recalcula trechos, funde vizinhas iguais. |
| `insertStop(index, stopId, destinationId, nights)` | 🔓: estende a viagem. 🔒: a vizinha cede (erro se não puder). |
| `splitStopWith(stopId, afterOrdinal, newStopId, destinationId, nights, tailStopId)` | Divide S em S1 (`afterOrdinal` dias) + Nova + S2 (o resto, com o mesmo destino de S). 🔒: as noites da Nova saem de S2 e, se faltar, de S1. Cada parte precisa de ≥ 1 noite, senão erro com sugestão de inserir antes ou depois. 🔓: a volta se move. |
| `removeStop(stopId)` | **A parada vira noites em aberto** (lixeira). As visitas vão para a Mochila. O destino e a Mochila permanecem ("Destinos guardados"). |
| `fillOpen(openStopId, destinationId, nights?, newStopId)` | Preenche o espaço todo ou parte dele (o resto continua em aberto). Funde com a vizinha se for a mesma cidade. |
| `stretchInto(openStopId, side)` | A vizinha (`before` / `after`) ocupa o espaço, com dias vazios na ponta encostada. Se as duas vizinhas forem a mesma cidade, elas se juntam numa só, e os planos das duas partes são mantidos. |
| `closeOpen(openStopId)` | Remove as noites em aberto e encurta a viagem. As cidades depois dela antecipam, com os planos indo junto. |
| `removeDay(dayRef, via)` | Remove aquele dia, e as visitas dele vão para a mochila. O buraco fecha pelo lado de `via`: `open` (padrão com volta marcada) faz os dias seguintes da cidade anteciparem e põe 1 noite em aberto logo depois dela, sem mexer no resto; `return` faz tudo depois antecipar, incluindo a volta; `stop` faz quem ganha a noite fechar o buraco do lado dela, e as cidades do meio deslocam. Com 1 noite, equivale a `removeStop`. |
| `swapDays(a, b)` | Troca as visitas de dois dias da **mesma** parada. |
| `setTripStart(date \| null)` | Desloca tudo; `null` passa para dias relativos. |
| `setTripEnd(date, takeFrom[])` | Encurtar exige escolher de quais paradas tirar (a interface sugere a mais longa). Alongar adiciona noites à última parada (ou a `takeFrom[0]`). |
| `setLock(lock)` | Só muda a trava. |
| `setLegMode / setLegTimes / setLegHubs` | Editam o trecho. O motor não toca na passagem: se ela é de outro meio, a derivação `bookingStatus` aponta `wrong-mode`. |
| `setLegNightsAboard(legId, n)` | 🔒: a vizinha seguinte cede. 🔓: estende. Cria ou remove dias do tipo `leg`. |
| `addWaypoint / removeWaypoint` | Paradas no caminho de um trecho. |
| `scheduleVisit(visitId, placeId, dayRef, slot)` | Agenda; o mesmo lugar pode estar em vários dias. |
| `unscheduleVisit / moveVisit / setVisitMeta` | Desagenda, move ou edita dados da visita. |
| `setParticipants(target, ids)` | Define quem está numa parada, trecho ou visita. |
| `addResource / removeResource / addAnchor / removeAnchor` | Recursos e âncoras (sem tela neste subprojeto). |
| `setTentative / setLodging / setPace / setDefaultMode / setTravelers` | Ajustes da parada e da viagem. |

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
2. Com 🔒, `Σ nights + Σ nightsAboard` só muda por `setTripEnd` ou `setLock`.
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

- **Roteiro (padrão):**
  - resumo da viagem: datas, noites e "Volta 24/04 🔒 marcada / livre" (§5.1);
  - **Faixa:**
    - pegadores sob a faixa;
    - prévia ao arrastar, mostrando o que sai;
    - segurar um bloco para arrastar → reordenar ou **lixeira**;
    - noites em aberto tracejadas com "+".
  - **Lista** com cartões de cidade, de noites em aberto e de trecho.
    - O cartão de trecho tem "🎫 Passagem" com o check de comprada e o tempo com a fonte.
  - **Escolhas em vez de erros:** "De onde sai essa noite?" e "Para onde vai essa noite?" (§5.1).
  - **Dias:** visitas por turno, "remover este dia", trocar dias. Os dias aceitam **itens arrastados da mochila**.
- **Mochila:**
  - filtro por destino;
  - busca de lugares (Photon, com espera entre teclas e no mínimo 3 letras);
  - **raridade editável** (Se der · Quero · Imperdível);
  - estados da §6;
  - arrastar para um dia ou "+ Agendar" (seletor que inclui os dias de destinos próximos);
  - "Destinos guardados".
- **Quests:** a Saúde do roteiro com correção em um toque (ir até o alvo).
- **Mapa:** tabuleiro simples com contornos, paradas numeradas e trilha pontilhada, no visual da v1.
- **Desfazer:**
  - aviso de ~6 s com a narração dos efeitos ("Dia 7 de Kyoto voltou à Mochila: 2 lugares");
  - pilha de desfazer da sessão;
  - histórico em `feed`.
- **Compartilhar:**
  - gerar link com papel e enviar pelo compartilhamento do celular (WhatsApp etc.);
  - lista de membros com troca de papel e remoção;
  - revogar link.
- **Acessibilidade e celular:**
  - alvos de toque ≥ 44 px;
  - texto ≥ 12 px;
  - contraste 4.5:1;
  - foco visível;
  - respeito a "reduzir movimento";
  - painéis inferiores para edição.

## 18. Persistência, concorrência e offline

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

| Risco | Resposta |
|---|---|
| OpenFreeMap, Photon e OpenRouteService sem garantia | Provedores trocáveis, cache e plano B (linha reta, tabuleiro em cache) |
| Imprecisão ao arrastar no celular | `– / +`, `‹ ›` e `↑ ↓` sempre presentes |
| Conflitos de edição offline | Fila de operações reaplicadas, com explicação quando falhar |
| Custo de leituras no Firestore | Itinerário num documento só; alerta de orçamento |
| A gramática completa assustar | Tudo aparece só quando usado (princípio 4) |

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
