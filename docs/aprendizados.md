# Aprendizados

Registro do que aprendemos fazendo, para nenhuma sessão repetir um erro.

- **Mais novo primeiro.**
- **Formato:** data, o que aconteceu e a regra que fica.

## 2026-10-14 — M4: contas e nuvem (em andamento)

- **Vitest 5.0.4 quebra o `@cloudflare/vitest-plugin` no Windows** ("File path must be a file: URL" antes de qualquer teste rodar). O 5.0.3, versão com que o plugin 1.4.2 é testado, funciona.
  - **Regra:** o Vitest fica fixo em `5.0.3` (sem `^`). Ao atualizar, rodar `npm run test:worker` no Windows antes.
- **O workerd local só aceita `compatibility_date` até a data do binário instalado** (hoje, 2026-10-13). Usar a data do binário, não a de hoje.
- **Python no Windows escreve CRLF e lê o stdin como cp1252.** Edições por script usam `newline=''` e `stdin.buffer.read().decode('utf-8')`; conferir `git ls-files --eol` e procurar "Ã" antes de cada commit.
- **Token nunca na URL:** no WebSocket ele vai no subprotocolo (`Sec-WebSocket-Protocol: ludotrip.v1, <token>`), para não aparecer em logs de acesso.

## 2026-10-14 — M3.8: sair da cidade

- **O rótulo da saída diz o lugar, não o tipo de tela:** "◀ Mapa" dentro de um mapa não dizia nada; 60% demoraram mais de 5 s. "‹ Viagem toda" diz para onde vai.
- **A saída precisa estar onde se procura**, não só onde a desenhamos: o "‹" do topo, a aba ativa e o Voltar do celular. Um Voltar do sistema que sai do app é um beco sem saída ao contrário.
- **Uma regra de voltar num lugar só** (`stepBack`): botões, Escape e histórico chamam a mesma função. O histórico guarda só uma entrada nossa, reposta a cada Voltar, para nunca correr contra `history.back()`.
- **Escape com dois ouvintes:** quem trata o Escape chama `preventDefault()`; o ouvinte global ignora o evento já tratado, senão um Escape fecharia o painel e sairia da cidade.

## 2026-10-14 — M3.7: painéis empilhados

- **Trocar de painel sem pista é se perder:** o painel novo no mesmo lugar, sem título nem movimento, parecia o anterior ("demorei 3 segundos"). Cada painel diz o que é; um painel aberto de outro tem "‹ voltar" e desliza.
- **Pilha e "voltar ao painel":** um passo concluído volta pela pilha (`returnToSheet`) em vez de reabrir do zero, senão o "‹" do painel de origem se perde. Criar troca o topo da pilha (`openSheet(..., { replace: true })`).
- **Nada digitado se perde calado:** a mesma ideia do "nada some calado" aplicada ao que ainda não foi criado.

## 2026-10-14 — M3.6: tarefas de verdade

- **Uma lista só, por prazo**, juntando o que o app calcula (`health()`) e o que se escreve. As automáticas continuam calculadas; o que se acrescenta a elas (prazo, quem faz, anotações, "Não preciso") fica numa tabela pela chave `tipo:alvo` (`taskMeta`). Nada duplicado, nada que fique velho.
- **Presa ao destino, não à parada:** paradas mudam de id (tirar do roteiro vira noite em aberto; Kyoto duas vezes são duas paradas). O destino é o que a pessoa pensa.
- **Nada some calado:** `rehome()` roda depois de toda ação e transforma em "da viagem" a tarefa cujo alvo sumiu, guardando o nome ("era de Gion"); o Desfazer volta as duas coisas.
- **"Não preciso" conta no nível, não no XP:** quem decide que não precisa avança no preparo, mas o XP é do que foi feito.
- **Bug pego no teste:** seletor do Zustand com `?? []` cria uma lista nova a cada leitura e entra em loop de redesenho. Usar uma constante fora do componente.
- **A tela mostrou:** a tarefa escrita ficava enterrada depois de 18 automáticas sem prazo, e a dica "prazo, anotações ou não preciso" repetida 18 vezes virava ruído. As escritas vêm primeiro no grupo; a dica aparece uma vez.

## 2026-10-14 — M3.5: varredura de bugs, becos sem saída e clareza

### Como foi feita

- Duas auditorias de leitura de código em paralelo: interface (becos, textos, acessibilidade: 40 achados) e motor/estado (casos de canto: 26). Os graves foram conferidos no código antes de entrar no plano; os raros ficaram registrados na spec §17.12, com o porquê.
- **Um teste que falhava antes de cada correção** (`src/ui/varredura.test.tsx`, `repo.test.ts`, `doc.test.ts`, `progress.test.ts`).

### O que mais apareceu

- **Viagem sem datas era o maior beco:** botões de hospedagem e passagem sem efeito, progresso travado em 0/N. Regra: onde a data é indispensável, o botão leva a "Escolher a data de ida" (`askStartDate`), nunca fica desligado ou mudo.
- **Caminhos equivalentes divergiam:** a mesma ação feita por dois lugares (Tarefas × Roteiro) com código copiado. Agora `buyTicket`, `scheduleOnce`, `fillOpenChoice` e `askStartDate` em `choices.ts`.
- **Estado local que não acompanha o documento:** campos de data e "+ Mais uma pessoa" guardavam cópia própria. Regra: campo de painel-editor sincroniza com o documento (`useEffect` no valor) e salva na hora.
- **Falha calada do armazenamento:** um erro do IndexedDB desligava o salvar para sempre. Agora cada operação tenta de novo e o app avisa uma vez.
- **Selo que apaga:** "Passagem comprada 済" desmarcava num toque. O que parece selo abre um painel.
- **Teclado:** blocos e pegadores da trilha só tinham ponteiro. `onClick` com `detail === 0` é o caminho do teclado sem conflitar com o toque.

## 2026-10-14 — M3.4: atividade repetível, anotações do dia e escolhas que escalam

### O motor já sabia; a interface escondia

- `Place` (atividade) e `Visit` (atividade num dia) já eram separados, e a mesma atividade já podia estar em vários dias; `Visit.note` existia sem tela. Os três primeiros pontos do retorno eram só interface: **antes de mudar o modelo, conferir se o modelo já resolve.**
- A lista "sem dia" sumia com a atividade ao agendar, o que ensinava "agendar = mover". Virou catálogo (as com dia continuam, apagadas). Primeira versão com até 10 fichas com dia dobrava a altura do cartão; no celular ficou em **4 compactas + "+ N com dia"**.

### Listas que escalam: padrão esperto + lista navegável

- Numa Itália gerada (50 destinos, 120 noites): "Onde X entra?" tinha **101 frases**; "Pôr em qual dia?", **121 botões**; "de onde sai a noite", **49 opções**. Agora: uma sugestão fixada ("Pôr aqui", 1 toque) + a linha do tempo (uma linha por destino, frestas "+", busca); dias em **50 linhas com 1 grupo aberto**; doadores em **3 + "Outro destino…"**.
- A sugestão é o menor desvio em linha reta (`d(a,x) + d(x,b) − d(a,b)`). Ela acerta a geografia, não a intenção: Nara sai "entre Kamakura e Osaka" (está mesmo no caminho), e Pisa sai "entre Florença e Bolonha" por 3 km de diferença. Por isso é só destaque, com a lista inteira embaixo.
- Exemplo do Japão no celular (dia 1): roteiro de 50 para 54 botões (as atividades com dia no catálogo aberto), página de 3.369 para 3.410 px — sem regredir o M3.3.
- A régua da trilha numa viagem de 120 dias não mudou (tem zoom); fica medida para o mantenedor dizer se incomoda.

### Bugs evitados

- `.wrap` já era uma classe de página: um `row wrap` no painel ganhou 278 px de altura. Nomes de classe novos: conferir no CSS antes.
- O foco automático do painel ia para o primeiro `input`; com a busca no topo, o teclado do celular abriria sozinho. A busca (`type=search`) não recebe o foco inicial.
- Fechar o painel com texto digitado e sem sair do campo perderia a anotação: a caixa salva também ao desmontar.

## 2026-10-13 — M3.3: primeira impressão e painéis que fechavam cedo

### A tela não tinha coisa demais; tinha coisa demais aberta

- Contagem na tela do exemplo, no celular, na primeira tela e meia: **~70 controles** (HUD com 6 botões e duas linhas, três "+ Adicionar destino", duas contagens, prateleira repetindo os blocos, 7 cartões × 8 linhas, cada trecho com 3 ações). Quem conhece acha tudo à mão; quem chega leva um susto.
- **Regra (revelar progressivamente):** um lugar aberto por vez (acordeão no roteiro), uma ação primária por bloco, duplicatas fora (uma contagem, um "+ Adicionar destino" por área), dicas que somem depois de usadas, trechos em uma linha. Nenhuma capacidade sai: a conferência é linha a linha no inventário. Fontes: Nielsen #8 (estética e design minimalista), lei de Hick, guias de UX (progressive disclosure, empty states, Web Interface Guidelines).
- **Medir antes e depois** (exemplo do Japão, celular 375 px, mesmo script): roteiro de **150 para 50 botões**, página de **7.331 para 3.369 px**, HUD de 7 para 5 botões. Na primeira tela e meia o número mal muda (83 → 77) porque a régua de dias e os blocos da trilha dominam; o alívio está no que vem abaixo.

### Bugs

- **"Editar trecho" fechava ao escolher o meio.** O `act(setLegMode)` ia sem `keep: true`. Quando "Sua viagem" ganhou o `keep` (M3.1) eu deveria ter auditado todos os painéis-editores; fechavam cedo também atividade (prioridade, tipo, feita), visita (turno, feita) e hospedagem (reservei, tirar). **Regra:** ao corrigir um bug, procurar a classe inteira dele (`grep` por todos os `act(` dentro dos painéis), não só o caso reportado. A regra dos painéis está no `ActOptions.keep` e no CLAUDE.md.
- **Mapa de tiles entrava em cena antes de desenhar:** em rede lenta a viagem nova aparecia como um retângulo azul no lugar do contorno. **Regra:** o mapa de tiles nasce já enquadrado (`bounds`) e só substitui o papel no primeiro `idle`.

## 2026-10-13 — M3.2: mouse × toque, criar atividade, micro-detalhes

### Bugs

- **Um setter que apaga outro estado.** `setPlacing(null)` também fazia `sheet: null`; chamado logo depois de `openSheet`, fechava o painel que acabara de abrir ("clicar no mapa não cria a atividade", só segurar funcionava, porque esse caminho não passava por ele). **Regra:** sair de um modo não mexe em outro estado; e a ordem "limpar o modo, depois abrir o painel" fica explícita no código.
- **Clique dentro do mapa que não é clique no mapa.** A faixa "Marque no mapa…" fica dentro do `.board`; o clique em "Não adicionar" borbulhava até o clique do mapa e abria o painel. **Regra:** toda sobreposição dentro de uma área clicável faz `stopPropagation` do clique e do ponteiro.
- **Campo com fonte < 16 px no iOS dá zoom ao focar** e o campo "pula" (o "Quando?" mal posicionado no celular). **Regra:** `.input { font-size: 16px }`; `input[type=date]` em flex.
- **Capturar o ponteiro no `pointerdown` engole o clique dos filhos.** Com `setPointerCapture` na régua desde o início, o `click` vai para a régua e não para o dia. **Regra:** capturar só quando o gesto vira arraste de verdade (depois do limiar).
- **Aviso fixo no pé da tela cobre o que está embaixo** (no Playwright, o `page.mouse` batia no aviso e não na régua). **Regra:** com painel aberto o aviso vai para o topo; nos testes, rolar a página antes de gestos perto do pé.

### Normas de arraste (pesquisa)

- **dnd-kit** recomenda escolher a regra pelo tipo de ponteiro: mouse/caneta por distância (~5 px), sem espera; toque com espera (~250 ms) e tolerância, para não roubar a rolagem ([PointerSensor](https://docs.dndkit.com/api-documentation/sensors/pointer), [sensores](https://dndkit.com/react/guides/sensors)). **SortableJS** tem `delayOnTouchOnly` pelo mesmo motivo ([opções](https://classic.yarnpkg.com/en/package/sortablejs)). iOS/Material: segurar 400–500 ms é padrão de toque; no desktop, itens arrastam na hora e a faixa rola pela roda, trackpad, barra ou arrastando a área vazia (Trello).
- **Regra da casa:** `pointer.ts` decide pelo `pointerType`: mouse levanta ao mover 6 px; dedo segura 450 ms (trilha) ou 300 ms (atividades). A régua rola com o mouse e passa os dias com o dedo. Textos dizem "clique/arraste" ou "toque/segure" pela entrada principal (`pointer: coarse`).

### Micro-detalhes

- **Cada toque tem de mudar algo visível.** Um botão de tema com três estados (auto · claro · escuro) repete um dos modos e parece quebrado. **Regra:** botões de alternar são binários; o "automático" só existe antes do primeiro toque.
- **"Clicar na prioridade cria" não é intuitivo:** a pessoa procura um botão para concluir. **Regra:** escolher tudo e concluir com um botão principal; nada de ação escondida numa escolha.
- **Palavras genéricas enganam no caso especial:** "Lugares" ao criar uma viagem para o Rio lê-se como Cristo e Pão de Açúcar. **Regra:** perguntar com a frase de quem viaja ("Vão dormir em outra cidade?") e dizer onde entra o resto ("bate-voltas e passeios entram depois, no roteiro").

## 2026-10-13 — M3.1: revisão de uso (bugs, a jornada das atividades, clareza)

### Bugs

- **O mapa sumia só em produção.** O CSS do MapLibre (`.maplibregl-map { position: relative }`) carrega depois do nosso e tem a mesma especificidade que `.map-tiles { position: absolute; inset: 0 }`: o contêiner dos tiles ficava com altura 0, o canvas cortado e a camada SVG sem altura. No servidor de desenvolvimento a ordem de carga era outra, por isso passou. **Regras:** regra que disputa com CSS de biblioteca ganha especificidade e um `!important` comentado; o `MapCanvas` descarta um adaptador sem tamanho (nunca uma tela vazia); teste ponta a ponta com tiles simulados mede o canvas; as abas ficam montadas (escondidas) para o mapa não ser recriado a cada ida e volta.
- **Arrastar na trilha falhava no toque.** O estado "levantado" só existia no quadro seguinte do React; o primeiro `touchmove` passava sem `preventDefault`, o Chrome começava a rolar e cancelava o ponteiro. **Regras:** o que um ouvinte nativo precisa ler fica num ref escrito de forma síncrona (antes do `setState`); `pointercancel` com algo levantado continua pelos eventos de toque do documento; segurar 450 ms com o bloco "inflando" (padrão iOS/Material); teste de toque de verdade via CDP (`Input.dispatchTouchEvent`), porque `pointer*` sintéticos não passam pelo detector de rolagem do navegador.
- **Abas montadas e escondidas mudam os testes:** `getByText` do Playwright enxerga o escondido; `getByRole` respeita `hidden`. Título dentro de botão sai da árvore de acessibilidade (filhos de botão são "apresentacionais"): testar pelo DOM.

### Jornadas

- **"Não inventar problema."** "Noites incertas", o menu da cidade e "Mais ações" não respondiam a nenhuma frase de quem viaja; a frase que faltava ("quero marcar o que vou fazer neste dia") não tinha caminho. **Regra:** toda ação visível responde a uma frase de quem viaja; se não há frase, não há botão. Simular as jornadas inteiras no celular (macro) acha mais que corrigir ponto a ponto.
- **Palavras de jogo nos rótulos confundem** ("figurinhas", "colar", "mochila"). **Regra:** jogo no visual e nas comemorações; nos rótulos, a palavra comum (atividade, pôr no dia, sem dia).
- **Viagens já salvas não ganhavam dados novos das fixtures.** Agora `openTrip` completa coordenadas e escopo dos exemplos (migração leve) e abrir um exemplo de novo reaproveita a cópia.

### Ferramentas

- **O navegador interno do app de desktop, no preset de celular e contra o endereço publicado, reproduziu o bug do mapa.** Serve para páginas publicadas e para o build (`npm run preview`); a limitação fica só com arquivos locais. A aba fecha entre turnos: reabrir com `navigate` e aplicar o preset de novo.

## 2026-10-13 — M3: mapa vivo e roteiro numa tela só

### Causas-raiz do retorno do M2 (16 pontos)

1. **O mapa foi tratado como tela de abertura, não como o centro.** Na v1 o mapa era onde se via _onde_ e _quando_; o roteiro era o painel ao lado. **Regra:** a tela principal é mapa + trilha + cartão do dia + roteiro, numa só.
2. **"Destino" nasceu como "cidade".** País, região e "ainda não sei" não cabiam; sem busca online, qualquer lugar fora da lista ficava sem mapa (a Romênia). **Regra:** o escopo da viagem (país, região ou cidade) é um dado próprio; "destino" é a palavra genérica; a busca online é obrigatória, com a lista própria como plano B.
3. **O enquadramento incluía a casa** e usava contornos sem detalhe de cidade. **Regra:** enquadrar só pelos destinos; a casa é uma seta na borda; o detalhe vem de tiles.
4. **Vocabulário e prioridades não estavam escritos.** **Regra:** prioridades de ouro (sem bugs, resolve de verdade, intuitivo, divertido, dinâmico, simples) e vocabulário de jogo só no visual estão no `CLAUDE.md`.

### Técnica

- **Mapa em duas camadas:** tiles (MapLibre + OpenFreeMap, estilo washi) por baixo e a nossa camada SVG por cima, com um adaptador que só sabe `project`/`unproject`/`fit`. O papel (d3-geo) é o primeiro desenho, o modo sem rede, o modo do artifact e o dublê dos testes. **Regra:** nenhuma peça do mapa conhece o MapLibre.
- **O worker do MapLibre não carrega no Vite em modo dev** com a dependência pré-empacotada. **Regra:** importar `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` e chamar `setWorkerUrl`.
- **Interpolar escala em logaritmo quebra com escala negativa** (área menor que a folga, como no jsdom): vira NaN e o mapa some. **Regra:** só animar com escalas positivas.
- **Posições do grupo como fração do caminho**, não em pixels: sobrevivem ao zoom e ao arraste do mapa.
- **Viagens já salvas não ganham dados novos das fixtures** (as atividades antigas não tinham coordenadas). **Regra:** ao testar algo que depende de dados de exemplo, abrir o exemplo de novo pela lista. (Resolvido no M3.1 com a migração leve ao abrir.)
- **Testes nunca falam com a internet:** `fetch` recusado no setup; quem precisa de rede simula com `vi.stubGlobal`.
- **Photon:** a primeira resposta leva uns segundos; nomes em português de cidades fora da lista própria não existem lá ("Bucareste" é "Bucharest"). **Regra:** a lista própria cobre os destinos mais comuns em português.
- **Página pública:** o GitHub Pages (`BASE_PATH=/LudoTrip/`) é onde o mantenedor testa de verdade; o artifact é plano B em modo papel.

## 2026-10-13 — M2: o app de verdade

- **Desmarcar não é arquivar.** Tocar de novo na passagem apaga a marcação (com Desfazer). "Arquivar" fica para a reserva real que saiu do roteiro.
- **Enquadrar o mapa por pontos, não por polígono.** No `d3-geo`, um retângulo na orientação errada vira "o mundo todo menos o retângulo", e o tabuleiro mostrava o planeta inteiro. **Regra:** `fitExtent` com `MultiPoint` dos cantos.
- **Sair da viagem não pode soltar o documento na mesma hora.** Uma tela ainda viva tentou desenhar sem viagem. **Regra:** primeiro troca a tela, depois libera os dados.
- **Testar o arquivo final, não só o servidor de desenvolvimento.** A prévia publicável tem outro empacotamento (React 18 por CDN, JSX próprio); testar o HTML gerado pega o que o modo dev esconde.
- **Gestos se testam com eventos de ponteiro com pausa real** (segurar ~400 ms antes de mover). Soltar cedo demais parece defeito do app e não é.
- **Busca de cidades:** nome exato e nomes curtos primeiro ("Porto" antes de "Porto Seguro").
- **A ida e a volta não geram aviso ao mudar de cidade:** elas continuam existindo e herdam o meio; avisar "saiu do roteiro" assusta sem motivo.
- **Heredoc longo no Bash falhou de novo** mesmo com a regra registrada. **Regra reforçada:** script com mais de ~20 linhas sempre vai para um arquivo antes de rodar.

## 2026-10-13 — Retorno do laboratório do motor (causas-raiz)

O mantenedor testou o laboratório no Japão e apontou: passagem sem volta, mochila longe dos dias, faixa sem datas e sem arrastar, item sem prioridade ao criar, mochila sem graça, mapa ausente, rótulos confusos ("Lixeira", "Encaixar cidade", setas), falta de diversão, arte e contagem regressiva. Os pontos são sintomas de cinco causas:

1. **A tela nasceu do motor, não da intenção de quem viaja.** Cada botão espelhava um comando (↑↓ = `reorderStop`, ‹› = `shiftStop`, "Encaixar cidade" = `splitStopWith`, "Lixeira" = `removeStop`).
   - **Regra:** desenhar cada elemento a partir da frase de quem viaja ("quero chegar em Kyoto um dia antes", "não vou mais a Ginzan", "quero 2 dias de Tóquio no meio de Kyoto"): intenção → gesto → retorno visual → o que mais se sincroniza → só então o comando. Teste do leigo: a pessoa adivinha o que o controle faz sem ler nada?
2. **Algo "só para testar" foi julgado como o produto** — e é assim que tem de ser. Cortei mapa, contagem, XP e arrastar porque "era o M2".
   - **Regra:** o que vai para o mantenedor é sempre a melhor versão atual da experiência. Se uma parte falta, ela aparece como lugar reservado e explicado, nunca some calada.
3. **Reconstruí do zero em vez de partir do que já estava validado.** O protótipo tinha datas na faixa, arrastar com prévia e a mochila dentro da cidade; a v1 tinha contagem regressiva, tabuleiro e XP. Tudo regrediu.
   - **Regra:** `docs/inventario-de-experiencia.md` lista o que já foi validado; toda versão confere a lista antes de ser mostrada.
4. **Ações fora do sistema de Desfazer.** Passagem e itens da mochila mudavam fora dos comandos do motor, então não tinham volta.
   - **Regra:** toda ação de quem usa (roteiro, mochila, reservas) é um comando com Desfazer, e toda marcação desmarca no mesmo lugar.
5. **Funcional primeiro, emoção "depois".** Diversão e arte foram tratadas como camada final. Na v1 elas sustentavam o produto (contagem, pétalas, carimbos).
   - **Regra:** a spec de cada tela diz a emoção e a mecânica de jogo que ela carrega, com critério de aceite. A espera pela viagem é a maior fonte de alegria ([Nawijn et al., 2010](https://repub.eur.nl/pub/19281/)); planejar faz parte da viagem.

## 2026-10-13 — M1: motor do roteiro

### Motor

- **As invariantes com fast-check acharam dois defeitos de modelo** que os testes de cenário não viam:
  - noite a bordo no trecho de volta caía no mesmo dia da partida. **Regra:** na volta, a noite no avião é `arrDayOffset` (+1), nunca noite da viagem;
  - comandos que não mudam nada (mover uma visita para onde ela já está) geravam um Desfazer vazio. **Regra:** `dispatch` devolve `NO_CHANGE` quando o remendo sai vazio.
- **O laboratório achou um terceiro:** com o par de cidades repetido (Kyoto → Tóquio duas vezes depois de encaixar), uma passagem fazia os dois trechos parecerem comprados. **Regra:** cada reserva vale para um trecho só, o do mesmo dia.
- **Trocar a primeira cidade criava a ida "de trem para o Japão".** **Regra:** a nova ida ou volta herda o meio da anterior.
- **Reservas apontam para destino + data**, nunca para id de parada; ids somem em fusões e divisões, destinos e datas não.

### Texto

- **Abreviações de dia da semana colidem com palavras.** "Volta passa a ter 23/04" ("ter" = terça) ficou ambíguo. **Regra:** reler toda frase que junta verbo e data; na prévia, usar "Volta vai para ter 23/04".

### Repositório público

- **Datas reais da viagem tinham escapado para a spec e o plano** (exemplos com as datas de verdade). Foram trocadas por datas fictícias de 2030, mas continuam no histórico já enviado.
  - **Regra:** antes de cada push, procurar nomes e datas reais (`grep -rn` por nomes, ano e "dd/mm" do mês da viagem).

### Ferramentas e ambiente

- **O painel de navegador roda o servidor de desenvolvimento** (`.claude/launch.json` com `npm --prefix …/LudoTrip run dev`), com scripts e console.
  - A simulação de celular (`resize_window` mobile) **desloca as coordenadas do mouse**: o clique cai em outro elemento. **Regra:** para testar fluxos, clicar pela própria página (`element.click()` via javascript) e usar capturas só para olhar.
- **Heredoc longo no Bash falha** ("unexpected EOF"), mesmo com aspas. **Regra:** escrever o script com a ferramenta de arquivo e rodar o arquivo.

## 2026-10-13 — Protótipo de edição e retorno do mantenedor

### Texto e interface

- **Mensagens técnicas confundem.** "Ginzan Onsen ficaria sem noites. Destrave a duração…" fez a pessoa perguntar "que trava?".
  - **Regra:** escrever com as palavras de quem viaja (cidade, noite, volta, passagem), nunca termos internos (parada, trava, vizinha, órfã).
  - Toda situação sem saída vira uma escolha com botões.
  - Cada palavra precisa de motivo.
- **"Saco" é feio em português.** Virou **Mochila** (inventário de jogo), e a prioridade virou **raridade** (Se der · Quero · Imperdível).

### Faixa e edição

- **Pegadores de arraste sobre os blocos** cobriam as cidades de 1 noite e atropelavam as datas.
  - **Regra:** pegadores **sob** a Faixa, com largura mínima por noite.
  - Uma lista horizontal rolável precisa de esmaecido nas bordas e deve rolar sozinha até o item editado.
- **Hospedagem parcial não era avisada.** Depois de um arraste, o hotel ainda "cabia" na estadia, mas duas noites ficaram sem cama.
  - **Regra:** a Saúde do roteiro avisa as noites descobertas, não só a reserva fora da janela.
- **Planejamento por dia ao mudar noites.**
  - **Regra da ponta:** o dia entra ou sai na ponta que se moveu; todos os outros dias mantêm data e plano; o que sai volta para a mochila com Desfazer.
  - Remover uma cidade deixa **noites em aberto** (espaço com "+"), em vez de decidir sozinho para onde vão as noites.

### Testes

- **Testes com sequências aleatórias acham bugs reais.** 900 sequências encontraram um defeito: ao deslocar uma parada, a vizinha que ganhava a noite ficava sem o dia vazio correspondente.
  - **Regra:** todo motor de regras tem testes de invariantes com fast-check.

### Vibe

- **O protótipo ficou "limpo demais" e perdeu a vibe da v1.**
  - **Regra:** toda tela nova segue `docs/guia-de-vibe.md`.

### Ferramentas e ambiente

- **O navegador interno do app de desktop** não executa scripts em arquivos locais. (M3.1: contra o build ou a página publicada, com o preset de celular, funciona bem.)
  - **Regra:** para testar páginas publicadas, usar o Chrome do mantenedor (Claude in Chrome), que costuma ficar aberto numa segunda tela.
  - Dentro do iframe do artifact, a árvore de acessibilidade não aparece; usar coordenadas e capturas de tela.

## 2026-10-12 — v1 (Sakura Quest)

- **Elementos SVG não têm a propriedade `.hidden`.** Usar `toggleAttribute("hidden", …)`.
- **Animações GSAP param em abas em segundo plano.** Toda animação de entrada ou transição precisa de um temporizador que a conclua (`timeline.progress(1)`), senão o conteúdo fica escondido.
- **Artifacts do claude.ai bloqueiam rede externa.**
  - Não dá para usar buscas de lugares, mapas ou rotas.
  - Downloads só nos formatos permitidos (html, csv, json, md, pdf…); **.ics não é permitido**. Para calendário, use CSV do Google Agenda.
- **O Nominatim proíbe autocompletar.** Para busca enquanto se digita, usar o Photon, com espera entre teclas e cache.
- **Usuários usam o celular em ~95% do tempo.** Tudo é pensado primeiro para 375 px.
