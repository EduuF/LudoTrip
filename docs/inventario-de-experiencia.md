# Inventário da experiência

Tudo o que já foi validado com o mantenedor (v1, protótipo de edição, retornos). Serve para **nenhuma versão regredir**.

**Regra:** antes de mostrar qualquer tela ao mantenedor, conferir esta lista. Um item só pode faltar com uma decisão registrada aqui (coluna "Status"). Itens novos entram sempre que um retorno validar ou pedir algo.

Status: ✅ no app · 🟡 parcial · ⬜ falta · 🕒 marco futuro (com o marco).

## Tempo e humanidade

| Elemento | Origem | Por que existe (o que informa ou faz sentir) | Status |
|---|---|---|---|
| Contagem regressiva "Faltam N dias" | v1 | A maior parte da alegria de uma viagem vem da espera ([Nawijn et al., 2010](https://repub.eur.nl/pub/19281/)); o app faz parte dessa espera | ✅ (HUD e Mundo, com relógio) |
| A viagem no tempo: antes (contagem, preparo), durante ("Dia 5 de 23 · hoje em Kyoto"), depois (memórias) | retorno do lab | O app muda de papel conforme a fase da viagem | 🟡 (antes, durante e depois na contagem; modo Hoje e memórias: 🕒 subprojeto 4) |
| Nomes e bonequinhos dos viajantes | v1 | A viagem é de pessoas, não de um formulário | 🟡 (bonequinhos de 1 a 4 e Kombi; editar nomes e visual: 🕒 subprojeto 2) |

## Identidade e jogo

| Elemento | Origem | Por que existe | Status |
|---|---|---|---|
| Título em Mincho com o nome na escrita local, na vertical | v1 | Identidade do destino | ✅ |
| HUD escuro com nível, XP e fichas-kanji (宿 鉄 飛 券) | v1 | Progresso do preparo à vista | 🟡 (contagem, nível e XP; fichas-kanji ainda não) |
| Mapa de qualquer lugar, na hora: tiles do OpenStreetMap no estilo washi (terra, mar seigaiha, rios, parques, ruas de perto), com papel (contornos) sem rede | retorno do M2 (pontos 4 e 7) | O lugar para onde se vai, em qualquer escala | ✅ (M3) |
| Enquadramento só pelos destinos, nunca pela casa (que vira seta na borda) | retorno do M2 (ponto 4) | Escala certa: Rio é o Rio, Japão é o Japão | ✅ (M3) |
| Fases numeradas, trilha pontilhada, estrela quando pronto, decoração pixel por país, pílulas sem sobreposição | v1 | Onde vocês estão e para onde vão | ✅ sobre os tiles ou o papel |
| Entrar na cidade: lugares com selo por tipo, trilha de cada dia, dia escolhido aceso (o resto esmaece), fichas de dias | v1 mapa local (pontos 2 e 13) | Saber o que fazer em cada dia, no mapa | ✅ (M3) |
| Bonequinhos andam pela trilha ao mudar o dia; parte percorrida em vermelho; "▶ Ver a viagem" | v1 (ponto 12) | O tempo da viagem visível e divertido | ✅ (M3) |
| Mapa e roteiro numa tela só (mapa, trilha, cartão do dia, roteiro); duas colunas no desktop | v1 (pontos 6 e 8) | Nada de pular de aba para montar a viagem | ✅ (M3) |
| Cartão do dia: dia N de T, onde está, onde dorme, figurinhas do dia | v1 barra de dias (ponto 5) | Resumo do dia à mão | ✅ (M3) |
| Pétalas/partículas do tema e explosão ao concluir | v1 | Vibe; recompensa | ✅ |
| Carimbo 済 que cai ao garantir algo | v1 | "Está resolvido" sem ler | ✅ |
| NOVO NÍVEL e "+30 XP" flutuando | v1 | Recompensa por avançar | ✅ |
| Porta de shoji ao entrar e sair da cidade; zoom (flyTo) ao entrar | v1 | Transição com sentido | ✅ (M3) |
| Tutorial com holofote ("Como jogar"), uma vez por aparelho e pelo "?" do HUD | v1 | Primeiro uso sem manual | ✅ (M3) |

## Roteiro (visão macro)

| Elemento | Origem | Por que existe | Status |
|---|---|---|---|
| Faixa com **datas**: dia, dia da semana e mês sob os blocos | protótipo + retorno do lab | Saber em que dias se está em cada cidade | ✅ |
| Arrastar divisas com pegadores **sob** a faixa e prévia ao vivo do que sai | protótipo | Mudar noites sem formulário | ✅ |
| Segurar e arrastar um bloco para mudar a ordem | protótipo | Reordenar pela própria linha do tempo | ✅ (pouco empurra a data; além da vizinha, reordena) |
| Lixeira em pixel art: soltar a cidade nela deixa noites em aberto e guarda a cidade | decisão 2026-10-13 | Tirar sem perder | ✅ |
| Soltar uma cidade no meio de outra divide a estadia | retorno do lab | "Tóquio no meio de Kyoto" com um gesto | ✅ (arrastando da prateleira de destinos) |
| Ícone do meio de transporte entre os blocos | protótipo | Como se vai de uma cidade à outra | ✅ (pixel art) |
| Fitas de recursos (carro, passe) e faixa de países (mundos) | protótipo | Períodos e mundos de relance | ⬜ (próxima rodada) |
| Toda ação da faixa tem caminho sem arrastar (tocar no bloco abre as mesmas ações em palavras) | WCAG 2.2 (2.5.7) | Acessível e preciso no celular | ✅ |
| Bate-volta visível na régua (bandeirinha no dia) e no cartão do dia | retorno do M2 (ponto 5) | Entender Petrópolis dentro do Rio | ✅ (M3) |
| "+ Adicionar destino" antes da volta e "+ Parar no caminho" em cada trecho | retorno do M2 (ponto 10) | Montar a viagem destino a destino | ✅ (M3) |
| "Para onde?" aceita país, região ou cidade; "ainda não sei: decido no mapa" | retorno do M2 (pontos 7 e 9) | Ninguém digita só a primeira cidade por engano | ✅ (M3) |
| Busca do mundo todo (Photon/OSM) com lista própria sem rede | spec §10 | Qualquer lugar, com ou sem internet | ✅ (M3) |

## Dias e Mochila (visão granular)

| Elemento | Origem | Por que existe | Status |
|---|---|---|---|
| Mochila da cidade ao lado dos dias, arrastando o item para o dia | protótipo + retorno do lab | Planejar o dia sem trocar de tela | ✅ (bandeja de figurinhas) |
| Raridade escolhida no ato de criar o item | retorno do lab | O item já nasce com prioridade | ✅ |
| Itens com cara de coleção (não uma lista) | retorno do lab | Montar o roteiro é divertido | ✅ (álbum de figurinhas) |
| "voltou de qua 07" | protótipo / M1 | Nada some sem aviso | ✅ |
| Imperdível sem dia brilha e vira tarefa | spec §6 | Prioridade à vista | ✅ |
| Figurinha com lugar no mapa: nasce da busca perto do destino, ou "Marcar no mapa" com um toque; "+ Lugar aqui" segurando no mapa; "Abrir no Google Maps" | v1 (ponto 13) | O mapa da cidade mostra o que fazer | ✅ (M3) |

## Edição segura

| Elemento | Origem | Por que existe | Status |
|---|---|---|---|
| Escolhas com prévia em vez de erros ("De onde sai essa noite?") | protótipo / M1 | Nunca um beco sem saída | ✅ |
| Aviso com Desfazer em **toda** ação, inclusive reservas e mochila | M1 + retorno do lab | Errar sem medo | ✅ |
| Toda marcação desmarca no mesmo lugar (passagem, hospedagem, visitado) | retorno do lab | Toque sem querer tem volta | ✅ |
| Noites em aberto tracejadas com "+" | decisão 2026-10-13 | Espaço vazio visível e preenchível | ✅ |
| Hospedagem parcial avisada | protótipo | Noite sem cama não passa batido | ✅ |
| Rótulos que dizem a intenção (nada de "Lixeira" como ação, "Encaixar cidade" ou setas soltas) | retorno do lab | Leigo entende sem manual | ✅ |
| Navegação e ações em palavras comuns (Mapa, Mochila, Tarefas, Destino, Nível); jogo no visual e nas comemorações | retorno do M2 (pontos 1, 3 e 9) | Quem não joga entende | ✅ (M3) |
