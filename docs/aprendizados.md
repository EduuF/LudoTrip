# Aprendizados

Registro do que aprendemos fazendo, para nenhuma sessão repetir um erro.

- **Mais novo primeiro.**
- **Formato:** data, o que aconteceu e a regra que fica.

## 2026-10-13 — M3: mapa vivo e roteiro numa tela só

### Causas-raiz do retorno do M2 (16 pontos)
1. **O mapa foi tratado como tela de abertura, não como o centro.** Na v1 o mapa era onde se via *onde* e *quando*; o roteiro era o painel ao lado. **Regra:** a tela principal é mapa + trilha + cartão do dia + roteiro, numa só.
2. **"Destino" nasceu como "cidade".** País, região e "ainda não sei" não cabiam; sem busca online, qualquer lugar fora da lista ficava sem mapa (a Romênia). **Regra:** o escopo da viagem (país, região ou cidade) é um dado próprio; "destino" é a palavra genérica; a busca online é obrigatória, com a lista própria como plano B.
3. **O enquadramento incluía a casa** e usava contornos sem detalhe de cidade. **Regra:** enquadrar só pelos destinos; a casa é uma seta na borda; o detalhe vem de tiles.
4. **Vocabulário e prioridades não estavam escritos.** **Regra:** prioridades de ouro (sem bugs, resolve de verdade, intuitivo, divertido, dinâmico, simples) e vocabulário de jogo só no visual estão no `CLAUDE.md`.

### Técnica
- **Mapa em duas camadas:** tiles (MapLibre + OpenFreeMap, estilo washi) por baixo e a nossa camada SVG por cima, com um adaptador que só sabe `project`/`unproject`/`fit`. O papel (d3-geo) é o primeiro desenho, o modo sem rede, o modo do artifact e o dublê dos testes. **Regra:** nenhuma peça do mapa conhece o MapLibre.
- **O worker do MapLibre não carrega no Vite em modo dev** com a dependência pré-empacotada. **Regra:** importar `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` e chamar `setWorkerUrl`.
- **Interpolar escala em logaritmo quebra com escala negativa** (área menor que a folga, como no jsdom): vira NaN e o mapa some. **Regra:** só animar com escalas positivas.
- **Posições do grupo como fração do caminho**, não em pixels: sobrevivem ao zoom e ao arraste do mapa.
- **Viagens já salvas não ganham dados novos das fixtures** (as figurinhas antigas não tinham coordenadas). **Regra:** ao testar algo que depende de dados de exemplo, abrir o exemplo de novo pela lista.
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
- **O navegador interno do app de desktop** não executa scripts em arquivos locais e não simula o tamanho de celular de forma confiável.
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
