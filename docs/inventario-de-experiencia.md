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
| Tabuleiro: contornos, fases numeradas, trilha pontilhada, bonequinhos | v1 | Onde vocês estão e para onde vão | ✅ gerado na hora para qualquer viagem (mundos e mapa local: 🕒 subprojeto 2) |
| Pétalas/partículas do tema e explosão ao concluir | v1 | Vibe; recompensa | ✅ |
| Carimbo 済 que cai ao garantir algo | v1 | "Está resolvido" sem ler | ✅ |
| LEVEL UP e "+100 XP" flutuando | v1 | Recompensa por avançar | ✅ |
| Porta de shoji ao trocar de fase; zoom ao entrar na fase | v1 | Transição com sentido | ⬜ (próxima rodada) |
| Tutorial com holofote ("Como jogar") | v1 | Primeiro uso sem manual | ⬜ (próxima rodada) |

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

## Dias e Mochila (visão granular)

| Elemento | Origem | Por que existe | Status |
|---|---|---|---|
| Mochila da cidade ao lado dos dias, arrastando o item para o dia | protótipo + retorno do lab | Planejar o dia sem trocar de tela | ✅ (bandeja de figurinhas) |
| Raridade escolhida no ato de criar o item | retorno do lab | O item já nasce com prioridade | ✅ |
| Itens com cara de coleção (não uma lista) | retorno do lab | Montar o roteiro é divertido | ✅ (álbum de figurinhas) |
| "voltou de qua 07" | protótipo / M1 | Nada some sem aviso | ✅ |
| Imperdível sem dia brilha e vira quest | spec §6 | Prioridade à vista | ✅ |

## Edição segura

| Elemento | Origem | Por que existe | Status |
|---|---|---|---|
| Escolhas com prévia em vez de erros ("De onde sai essa noite?") | protótipo / M1 | Nunca um beco sem saída | ✅ |
| Aviso com Desfazer em **toda** ação, inclusive reservas e mochila | M1 + retorno do lab | Errar sem medo | ✅ |
| Toda marcação desmarca no mesmo lugar (passagem, hospedagem, visitado) | retorno do lab | Toque sem querer tem volta | ✅ |
| Noites em aberto tracejadas com "+" | decisão 2026-10-13 | Espaço vazio visível e preenchível | ✅ |
| Hospedagem parcial avisada | protótipo | Noite sem cama não passa batido | ✅ |
| Rótulos que dizem a intenção (nada de "Lixeira" como ação, "Encaixar cidade" ou setas soltas) | retorno do lab | Leigo entende sem manual | ✅ |
