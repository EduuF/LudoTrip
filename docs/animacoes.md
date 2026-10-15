# Guia de animação do LudoTrip

Este guia é **vivo**: as regras valem para toda animação nova ou alterada, mas são para ser aprimoradas
sempre que algo novo for aprendido. Ao mudar uma regra, registre em "Histórico" o que mudou e por quê.

**Fontes e exemplos:**

- `docs/estudo-diversao.md`: onde cabem animações e como seriam;
- `src/ui/stage/`: o Palco e o elenco;
- `src/ui/themeSwap.ts`: o Dia/Noite, a primeira animação aprovada.

## 1. O contrato (diversão não invasiva)

1. **A ação acontece na hora; a animação é a reação.** O dado muda imediatamente. Nada espera a animação acabar.
2. **Nunca recebe toque.**
   - A camada tem `pointer-events: none`.
   - Não cobre campos de digitação nem o próximo botão que a pessoa vai tocar.
3. **Curta por padrão:**
   - micro: até 0,8 s;
   - momento: até 1,5 s;
   - longa (até ~4 s): só quando a própria pessoa pediu e é raro (Dia/Noite, viagem criada, o grande dia).
4. **Variações que dão vontade de descobrir:**
   - cada momento tem **3 ou mais variações** ligadas ao contexto: modo da viagem, tipo da atividade, destino, dia ou noite;
   - mais **1 rara** (cerca de 1 em 12);
   - nunca a mesma duas vezes seguidas.
5. **Não cansa:**
   - a 1ª vez é completa;
   - da 3ª repetição em 1 minuto em diante, a versão mínima (um brilho, sem personagens).
6. **Nunca no meio de um gesto** (arrastando, digitando) **nem junto de um erro ou recusa.**
7. **Respeita a pessoa:**
   - com "reduzir movimento" do aparelho, nada se mexe;
   - no menu ⋯, "Animações: completas / discretas" (discretas = sempre a versão mínima);
   - som só com os sons ligados.
8. **Mede:** cada momento tocado gera o evento `animacao` (momento, variação, se foi mínima), para saber o que diverte e o que cansa.

## 2. Tamanho e encaixe (a cena manda, não a resolução)

1. **O tamanho vem do cenário.**
   - O elenco tem 24 × 30 pixels de arte, mas isso não quer dizer que aparece grande.
   - Cada momento escolhe o elemento da página onde acontece (o botão tocado, o selo da nuvem, o cartão, o painel do mapa) e mede o bonequinho por ele.
   - Exemplo: no topo, um bonequinho tem mais ou menos a altura do botão.
2. **Pixel inteiro do aparelho.**
   - A escala é ajustada para que 1 pixel da arte vire um número inteiro de pixels da tela (`fitScale` no Palco); nada de borrado.
   - No celular, isso costuma dar 1 ou 2 pixels de tela por pixel de arte.
3. **Uma cena, uma escala.**
   - Personagens e objetos que interagem usam a **mesma** escala e a mesma grade de pixels.
   - Os objetos (mala, bilhete, futon, nuvem, veículos) são pixel art da mesma densidade, com o mesmo contorno.
4. **Encaixe:**
   - a cena nasce colada ao elemento que a motivou e não sai da tela (é empurrada para dentro);
   - **o espaço acima do chão também precisa estar livre:** a cena não fica por cima de texto, rótulos ou campos. O Palco mede o vão livre (`fitGap`) e encolhe a escala; sem vão, toca a versão mínima;
   - **o palco é recortado pelo elemento que o hospeda** (mapa, cartão): sair de cena é sair pela borda dele, nunca desenhar sobre a margem da página;
   - branco semitransparente sobre fundo escuro vira cinza sujo: a saída não atravessa áreas escuras nem outros cartões;
   - **fundo escuro pede uma luz de palco:** o Palco detecta e acende, junto com a cena, uma luz suave atrás dela.
     - Já foi tentado um contorno claro por sprite (drop-shadow), e ele criava costuras dentro das composições, manchas nas partículas e engrossava linhas.
   - **o boneco se mede pelo botão vizinho**, não pela faixa nem pelo palco inteiro;
   - **dentro de um painel, o chão é a borda de cima do painel** (acima dela só há o fundo escurecido);
   - **a versão mínima também se encaixa:** o brilho fica no próprio elemento (no canto dele), nunca solto no ar. Onde a cena tem uma faixa reservada, a faixa se recolhe;
   - pés no chão: quando há um "chão" (borda de botão, cartão, estrada), os pés tocam nele;
   - mãos que pegam algo tocam o objeto.

## 3. Qualidade do movimento

Base: os 12 princípios da animação (skill do projeto `web-motion-design`) aplicados a sprites pequenos.

- **Antecipação → ação → reação em todo gesto.** Em pixel art, sem antecipação a ação parece "teletransportada".
- **Squash e stretch de 1 a 2 pixels**, só no que se move; exagero vira gelatina.
- **Timing por quadros:** poses trocam a cada 80–160 ms. Movimento de posição usa easing; nada linear, exceto vento e esteira.
- **Arcos:** o que é jogado ou cai faz arco, não linha reta.
- **Ação secundária:** cabelo, boné, poeira, fumacinha. Pouca e com propósito.
- **Pose legível:** a silhueta de cada quadro diz o que acontece, mesmo pequena.
- **Saída limpa:** tudo sai de cena (sai da borda, entra no veículo, se dissolve em brilho). Nada some no meio do gesto.
- **Ninguém aparece antes do chão.** Personagens e objetos de apoio só entram com o chão (plataforma, estrada, nuvem) completo e visível. Nada de testar verdade num `ease.back`, que é negativo no começo.
- **Tudo obedece à opacidade da cena:** linhas, cordas, "z", faíscas e penas entram e saem junto com o personagem. Nenhum efeito passa do fim da cena; acabou o sono, acabam os "z".
- **Objeto segurado fica na mão até ser solto com um gesto.**
  - Mudar de lugar no corpo (mão → acima da cabeça) leva 80–160 ms, com uma pose intermediária.
  - Nada some no meio do gesto: é abaixado, guardado, solto ou entregue.
- **Origem coerente:** o que sai de um objeto (foto da câmera, flash do celular) nasce nele e cresce a partir dele; o objeto está desenhado na mão.
- **Entrar em algo tem 3 tempos:**
  1. parar virado para a abertura;
  2. um passo em arco;
  3. sumir atrás do objeto (ordem de desenho).

  O que entra num recipiente passa por trás da borda da frente. Nunca andar por cima e desaparecer.

- **Nada troca de pose deitado/em pé sem um quadro intermediário:** aterrissa em pé, amassa, depois deita; levanta com um pulinho.
- **Pose sustentada por mais de 300 ms tem ciclo** (aceno = 2 poses alternando a cada 120–160 ms). Pose parada vira quadro congelado.
- **Arremesso sai rápido (`ease.out`).** Saída com `ease.in` precisa terminar antes do fade, senão metade do caminho cabe num quadro só.
- **Menos de 2 pixels não se vê:** antecipação, coice e detalhes de estado (o furo do picote) têm pelo menos 2 px.
- **Silhueta reconhecível sozinha, na escala real:**
  - uma mala aberta não pode parecer poltrona;
  - uma Kombi é mais alta que uma pessoa, com as janelas na altura dos rostos;
  - uma porta é mais alta que a cabeça.
- **Quem entrega é o objeto:** quando a cena entrega algo a um elemento (cartão → selo), é o objeto que toca o elemento, não o balão ou a pipa.
- **Balão de fala sai de alguém**, depois da ação, ancorado na cabeça de quem fala, com 4 px de folga de cabeçalhos, pinos e rótulos.
- **Agachar é a partir dos pés:** quem desce é a cabeça (sy < 1 com a base fixa). Nunca empurrar o sprite inteiro para baixo do chão.
- **Cobertor cobre:** altura = espessura do corpo deitado + 1 px; largura nunca passa do móvel.
- **Ninguém pisa no objeto com que interage:** o objeto fica à frente; no impacto, a mão (ou o que ela segura) encosta nele.
- **Na antecipação, nada passa na frente do rosto:** erguer acima da cabeça, não diante dela.
- **Efeito ligado a um estado termina antes de o estado mudar:** acabou o sono, acabam os "z".
- **Rara precisa de revelação:** primeiro o estado normal, depois a virada, com uma reação de pelo menos 200 ms.
- **O que importa para a história aparece desde o começo:** o chapéu que vai voar já está na cabeça; a mala esquecida fica à vista onde foi esquecida.
- **Coadjuvante reage:** quem não age olha para a ação (vira, bate o pé); nunca fica 1 s neutro de frente.
- **Fila sem atropelo:** quem vem atrás para uma mala antes e espera a porta ou o portão ficar livre.
- **Porta em escala humana:** pelo menos 0,75 da altura da pessoa; rampa, escada e prancha encostam no chão e na soleira, e quem embarca anda por elas.
- **Passar "por trás" é decisão de camada:** conferir na tira, não no comentário.
- **Sem tempo morto:** no máximo 300 ms de cenário vazio, e esse trecho é o fade.
- **Linha entre dois pontos** (pipa, balão) tem um ponto por pixel de arte da distância.
- **Contexto do veículo:** fumaça só em motor a combustão; trem-bala e avião usam vento.
- **Mapa:** o que fica parado não fica sobre rótulos ou pinos (o gatilho mede o SVG e passa as faixas ocupadas).
- **O que a mão segura vem da mão da pose atual:** nunca um trajeto próprio com a mão vazia de um lado e o objeto parado do outro.
- **Objeto de perfil precisa ser reconhecível:** papel deitado ganha leve perspectiva, com a face de cima à vista.
- **O que é jogado de lado sai de baixo de quem está em pé** antes de essa pessoa se levantar. **Partículas não pousam sobre o objeto principal.**
- **Linha ou objeto em voo não cruza o texto de um botão:** passa pelos vãos e só toca o destino.
- **Objeto de apoio da variação existe desde o primeiro quadro** em que o personagem aparece (ou surge com um gesto: inflar, tirar do bolso).
- **Toda causa aparece:** algo reage a um espirro, um vento ou uma partida? A causa fica visível por pelo menos 80 ms (partículas, squash, deslocamento), antes da reação.
- **Ordem de chegada = ordem de lugar:** quem chega primeiro vai para o lugar mais distante da entrada.
- **O que pisa por cima de um objeto é desenhado por cima dele** (rampa, prancha, escada acima do veículo).
- **Nada estaciona cortado pela borda;** um corte só é aceitável entrando ou saindo.
- **A frase-chave do momento fica por pelo menos 600 ms,** com quem fala parado.
- **O objeto que dá nome à variação tem pelo menos 4 px de espessura** e o mesmo contorno.
- **"Esquecer" se mostra soltando,** não com o objeto já parado sozinho na cena.
- **A luz ilumina o ator, não o palco.**
  - Numa faixa de interface com botões, a luz é um círculo preso ao personagem (`stage.light`, raio ≈ 0,8 a 1,2 × a altura dele, com queda suave), nunca uma elipse sobre outros elementos.
  - Partícula dentro da luz precisa de contraste com a luz: contorno escuro ou miolo colorido.
- **Na entrega a um botão, quem desce até o alvo é o objeto entregue:** o veículo (balão, pipa) fica fora da área dos outros botões e solta o objeto.
- **"A mão toca o objeto" se confere pela borda do sprite,** não pelo ponto de âncora (que é o canto de cima à esquerda).
- **Evento curto que causa a cena** (espirro, estalo) dura pelo menos 160 ms e aparece em dois quadros seguidos da tira (um a cada ~145 ms).
  - Todo trajeto de objeto também aparece em pelo menos um quadro intermediário.
- **Linha presa a duas pontas é recalculada a cada quadro entre elas,** inclusive na volta. Sem limite fixo de pontos.
- **Tudo o que fica parado desvia de rótulos e pinos, inclusive o balão de fala:**
  - largura medida na tela, nunca uma constante;
  - folga de 4 px;
  - primeiro escolhe-se o lugar de quem fala com o balão incluído; o balão só desliza até a borda do corpo de quem fala.
- **Fila:** quem ainda não sumiu na porta está à frente. Cada um espera 26 px atrás do outro e anda até o novo lugar em 180 ms, sem pular.
- **Efeitos somem com a fonte:** vento, fumaça e poeira não ficam soltos depois que o veículo saiu.
- **Poses de transição curtas (< 40 ms) podem não aparecer em quadro nenhum;** se são essenciais para a leitura, pelo menos 40–60 ms.
- **A fala acontece num momento de calma:** quem fala está parado e ninguém atravessa embaixo do balão. Os objetos da própria cena (portão, veículo, outras pessoas) também entram no desvio do balão.
- **Esmaecer é baixar a opacidade mantendo a cor;** sobre fundo escuro, branco que esmaece vira cinza: prefira sumir encolhendo.
- **Uma causa cômica se lê melhor com uma forma reconhecível** (baforada, nuvem de poeira) do que com partículas soltas.
- **Quem entra pela borda entra com o corpo primeiro;** o que está na mão vem do lado de trás do movimento até o personagem parar.
- **Desvio e alarme medem o que se vê:** a pílula do rótulo, o círculo do pino, não só o texto dentro deles.
- **Medir antes de corrigir:**
  - mudar a cor de um elemento e gerar a tira de novo diz se o defeito é de cor/luz ou de geometria;
  - congelar o quadro e ler as caixas dos atores diz onde cada coisa está de verdade;
  - exemplo: um giro de 540° em torno da base deixava o cartão 10 px abaixo da mão.

## 4. O avaliador (ninguém aprova a própria animação)

Toda animação nova ou alterada passa por avaliação antes do commit.

1. **Tira de quadros:**
   - comando: `node scripts/filmstrip.mjs <momento> [variação]`;
   - abre o app em 375 × 812 com o servidor de desenvolvimento, dispara o momento de verdade e congela o Palco em vários instantes;
   - monta uma folha de contato com o recorte da cena **e do elemento ao redor**, para julgar o encaixe;
   - salva em `test-results/filmstrip/`.
2. **Avaliação:**
   - o agente `avaliador-animacao` (`.claude/agents/avaliador-animacao.md`) lê as folhas com a rubrica abaixo;
   - responde **APROVADO** ou **REFAZER**, com instruções numeradas do que mudar (quadro, pixel, tempo, posição).
3. **A tira é da variação pedida:** forçar a variação ignora o teto de repetições, e o script falha se a variação tocada não for a pedida.
   - A tira também avisa sozinha: quadro vazio no meio da cena, erro da página e balão de fala a menos de 6 px de um rótulo ou pino do mapa.
   - Atenção: `npx playwright test` limpa `test-results/`; gere as tiras depois do e2e.
   - A folha de contato só reduz por fator inteiro (3:1, vizinho mais próximo); redução quebrada apaga linhas de 1 px.
   - Quando autor e avaliador discordam sobre 1 px, o árbitro é a captura em resolução cheia daquele quadro.
4. **Ciclo:** refazer até aprovar. O que o avaliador ensinar e valer para outras animações volta para este guia (Histórico).

**Rubrica:**

| Critério    | Pergunta                                                                             |
| ----------- | ------------------------------------------------------------------------------------ |
| Leitura     | Em 1 segundo dá para dizer o que aconteceu (comprou, reservou, fez)?                 |
| Encaixe     | O tamanho combina com o elemento ao lado? Os pés estão no chão? A mão toca o objeto? |
| Coerência   | Mesma escala e traço entre personagem e objeto? Contorno igual?                      |
| Movimento   | Tem antecipação, ação e reação? Arcos? Nada pula de posição sem motivo?              |
| Contexto    | A variação combina com o contexto (veículo do trecho, tipo de atividade, destino)?   |
| Não invasão | Cobre algo que a pessoa vai tocar? Sai da tela? Dura mais que o combinado?           |
| Final       | Termina limpo, sem sobrar nada na tela?                                              |

## 5. Referências

- [Os 12 princípios aplicados a pixel art](https://www.sprite-ai.art/guides/animation-principles) e [lição de animação de sprites (Wayline)](https://www.wayline.io/learn/sprite-animation/3): antecipação e squash/stretch em sprites pequenos.
- "Juice it or lose it" (Jonasson e Purho, 2012), [resumo](https://roblog.co.uk/2024/03/juicy-games/): resposta generosa a cada gesto. E o contraponto de que exagero tira a imersão.
- [WCAG 2.3.3, animação a partir de interações](https://w3c.github.io/wcag/understanding/animation-from-interactions.html): `prefers-reduced-motion` e uma preferência no app que desliga a animação.
- Skill do projeto `web-motion-design` (`.claude/skills/web-motion-design`).

## 6. Histórico

- **2026-10-15:** primeira versão.
  - Contrato do estudo de diversão.
  - Regra de tamanho pelo cenário: pedido do mantenedor, "não é por que agora eles possuem uma resolução maior que precisam ser grandes".
  - Avaliador obrigatório no fim: pedido do mantenedor, "tem que ter um avaliador na ponta final que é capaz de mandar refazer".
- **2026-10-15, 1ª rodada do avaliador:** nenhuma das 26 variações aprovada. Lições incorporadas:
  - §2: vão livre, recorte, mínima no elemento;
  - §3: chão primeiro, opacidade, objeto na mão, entrar em 3 tempos, ciclos, 2 px, silhueta, balão de fala;
  - §4: tira da variação certa.
- **2026-10-15, 2ª rodada:** 5 de 26 aprovadas. Lições incorporadas (§2 e §3):
  - agachar a partir dos pés; cobertor que cobre; não pisar no objeto; antecipação fora do rosto;
  - revelação na rara; coadjuvante reage; fila; porta em escala humana; camadas; sem tempo morto;
  - linha contínua; contexto do veículo; rótulos do mapa; contorno claro no escuro;
  - boneco pelo botão; chão no painel.
  - A tira passou a acusar quadro vazio e erro da página.
- **2026-10-15, 3ª rodada:** 14 de 26 aprovadas. Lições incorporadas em §2 e §3:
  - luz de palco no lugar do contorno; mão e objeto juntos;
  - perspectiva no papel; causa visível; ordem de chegada; camadas de apoio;
  - nada cortado parado; frase por 600 ms; espessura mínima; esquecer soltando.
- **2026-10-15, 4ª e 5ª rodadas:** 23 de 26 aprovadas. Lições em §3: luz no ator, entrega pelo objeto, borda do sprite, causa visível em 2 quadros, linha recalculada, balão que desvia, fila de 26 px, efeitos com a fonte, transições ≥ 40 ms.
- **2026-10-15, 6ª e 7ª rodadas:** fala na calma, esmaecer sem acinzentar, causa com forma, medir antes de corrigir; a tira ganhou o alarme de colisão com rótulos.
- **2026-10-15, 8ª e 9ª rodadas:** as 26 variações aprovadas. Lições: corpo primeiro na entrada; medir o que se vê; folha de contato só com redução inteira; captura cheia como árbitro de 1 px.
