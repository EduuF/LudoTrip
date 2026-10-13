# Aprendizados

Registro do que aprendemos fazendo, para nenhuma sessão repetir um erro.

- **Mais novo primeiro.**
- **Formato:** data, o que aconteceu e a regra que fica.

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
