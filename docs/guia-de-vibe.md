# Guia de vibe

A v1 ("Sakura Quest") foi muito querida pela vibe: parecia um jogo feito à mão sobre a viagem, e ao mesmo tempo resolvia problemas reais. **Este guia é um norte, não uma régua.**

A V2 generaliza a v1 para qualquer viagem e troca o tema conforme o destino, mas a estrutura da vibe fica. Usabilidade, correção, diversão e intuição vêm sempre primeiro. Quando algo daqui atrapalhar uma delas, ela vence.

## Identidade

- **Clima:** um jogo de mapa-mundo (Super Mario World, Clair Obscur) que também é um caderno de viagem caprichado. Papel, tinta, carimbo, pixel art.
- **Tom do texto:** brincalhão no vocabulário do jogo (Fase, Mundo, Quest, LV, Mochila), mas curto e exato. Nunca enrola.
- **Escrita local:** o nome do destino no alfabeto local aparece como marca d'água e detalhe (京都, Río, Paris), como os kanji da v1.

## Paleta (tema "sakura" da v1; outros temas trocam os valores e mantêm os papéis)

| Papel | Claro | Escuro |
|---|---|---|
| fundo papel japonês (`--washi`) | `#F6EDEB` | `#13111D` |
| cartão (`--paper`) | `#FFFBFA` | `#1D1929` |
| tinta (`--ink`) | `#241A28` | `#F5EAF0` |
| tinta suave (`--ink-soft`) | `#6E5B69` | `#B5A3B6` |
| destaque (`--sakura`) | `#E2809F` | `#F49BB9` |
| alerta / carimbo (`--beni`) | `#C4313A` | `#FF5C63` |
| feito (`--matcha`) | `#557A3E` | `#9DC57F` |
| índigo (`--ai`) | `#2B3F6B` | `#9DB4F0` |
| conquista (`--gold`) | `#E2A92F` | `#F2C14E` |
| mar (`--sea`) / terra (`--land`) / contorno da terra | `#DCE8EE` / `#FBF5EC` / `#3A2C3A` | `#141A2E` / `#2A2438` / `#E9DCE6` |

## Tipografia

| Papel | Fonte | Uso |
|---|---|---|
| Display | **Shippori Mincho B1** 700/800 | Títulos, nome da fase, marcas d'água em escrita local |
| Texto | **Zen Kaku Gothic New** 400/500/700 | Todo o texto corrido e a interface |
| Pixel | **DotGothic16** | Números, datas, HUD, rótulos curtos, avisos ("LV 3", "FASE 2 / 7", "+100 XP") |

## Elementos assinatura (manter em toda tela onde fizerem sentido)

1. **Título grande em Mincho**, com uma palavra no destaque ("Sakura **Quest**"), e o nome em escrita local na vertical ao lado.
2. **HUD escuro fixo:** selo de nível, barra de XP listrada e fichas com ícones-kanji (宿 hospedagem, 鉄 trem, 飛 voo, 券 ingresso, 写 foto).
3. **Botões com borda de tinta de 2px e sombra deslocada colorida** (`3px 3px 0 var(--sakura)`), que "afundam" ao toque.
4. **Selos quadrados com kanji** como ícones de categoria, e o **carimbo 済** que cai animado quando algo é garantido.
5. **Cartões de papel** com borda fina e sombra suave. Borda **tracejada** = pendente (quest); borda **verde sólida** = feito.
6. **O tabuleiro:**
   - terra clara com contorno grosso e sombra;
   - mar com padrão seigaiha;
   - decoração em estilo pixel: montanhas nevadas, cerejeiras, pinheiros, torii, nuvens passando, barquinho;
   - trilha pontilhada sobre um caminho de areia, com a parte percorrida em vermelho;
   - fases numeradas, que viram estrela dourada quando completas;
   - nomes em "pílulas";
   - o casal ou grupo em pixel art balançando, com coraçãozinho.
7. **Partículas do tema** caindo ao fundo (pétalas na v1: muitas, com profundidade e vento) e uma **explosão de pétalas** ao concluir algo.
8. **Movimento com propósito (GSAP):**
   - porta de shoji ao trocar de fase;
   - zoom ao "entrar na fase";
   - selos que aparecem com mola;
   - tela de LEVEL UP;
   - "+100 XP" flutuando;
   - sons 8-bit opcionais (desligados por padrão).
   - Sempre respeitar "reduzir movimento".
9. **Tutorial com holofote** ("Como jogar"), que pode ser pulado e permite voltar.

## O que o protótipo de edição perdeu (e o app definitivo não pode perder)

O protótipo validou a interação, mas ficou com cara de formulário. Faltaram:

- partículas;
- HUD;
- título em Mincho com escrita local;
- botões com sombra deslocada;
- selos e carimbos;
- tabuleiro.

A Faixa e a Lista do app definitivo usam os elementos acima. Exemplos:

- os blocos da Faixa têm contorno de tinta;
- a lixeira é pixel art;
- o "puf" solta pétalas do tema;
- as noites em aberto parecem um terreno vazio do tabuleiro.

## Temas (a essência que se adapta)

- O tema troca **paleta, partículas, decoração do tabuleiro e escrita local**. A estrutura acima nunca muda.
- **Exemplos:**
  - sakura (Japão na primavera);
  - momiji (outono);
  - neve;
  - tropical (confete, palmeiras);
  - deserto;
  - neon urbano;
  - estrada (road trip);
  - mar (cruzeiro);
  - montanha (trilha).
