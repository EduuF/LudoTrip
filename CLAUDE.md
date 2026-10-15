# LudoTrip — instruções para o Claude Code

LudoTrip é um planejador de viagens com cara de jogo para **qualquer** viagem: uma cidade, várias, vários países, road trip, cruzeiro, trilha… É um site (PWA) público, usado 95% no celular.

Nasceu da v1 "Sakura Quest", um artifact do claude.ai feito para uma viagem ao Japão, muito querido pela vibe.

## Leia antes de trabalhar

| Documento                                                                   | Para quê                                                                                                                                  |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/superpowers/specs/2026-10-13-ludotrip-v2-design.md`                   | O design: gramática da viagem, regras de edição, Mochila, mapa, permissões, tecnologia                                                    |
| `docs/superpowers/specs/2026-10-14-publicacao-contas-colaboracao-design.md` | Contas, nuvem, colaboração e publicação (M4–M6): Firebase Auth + Cloudflare                                                               |
| `docs/superpowers/plans/2026-10-13-subprojeto-1-fundacao-motor.md`          | Plano de implementação em andamento (marcos M0–M4, tarefas com checkbox)                                                                  |
| `docs/guia-de-vibe.md`                                                      | Identidade visual e de movimento que precisa ser mantida                                                                                  |
| `docs/aprendizados.md`                                                      | Lições já aprendidas. **Registre novas lições aqui ao fim de cada sessão.**                                                               |
| `docs/inventario-de-experiencia.md`                                         | Tudo o que já foi validado com o mantenedor. **Confira antes de mostrar qualquer tela:** nada da lista pode sumir sem decisão registrada. |

## Regras de ouro (vencem qualquer outra coisa)

1. **Prioridades de ouro, nesta ordem** (em conflito, a de cima vence): **sem bugs** · **resolve problemas reais** de quem planeja viagens · **intuitivo** · **divertido** · **dinâmico** (site com vida, sem cara de IA, arte de verdade vinda de boas referências artísticas e de outros sites) · **simples** de usar e entender. A vibe da v1 vem logo depois e é um norte, não uma régua.
2. **Editar nunca destrói.** O que sai do calendário volta para a Mochila. Toda ação tem Desfazer. Nada de "tem certeza?".
3. **Reservas são fatos.** O app nunca muda a data de uma reserva sozinho; mostra o conflito e oferece a correção.
4. **O app se adapta ao conteúdo da viagem.** Ninguém escolhe "tipo de viagem"; as funções acendem pelo que a viagem contém.
5. **Celular primeiro (375 px).** Alvos de toque ≥ 44 px, texto ≥ 12 px, contraste 4.5:1. Arrastar é atalho, nunca o único caminho.
6. **Pense em todas as jornadas.** Antes de fechar uma função, liste os cenários de uso, incluindo os estranhos, e garanta o comportamento certo em cada um.
7. **Desenhe pela intenção, nunca pelo motor.** Para cada elemento: a frase de quem viaja → o gesto → o retorno visual → o que mais se sincroniza → só então o comando. Um botão por comando do motor é sinal de erro.
8. **Diversão e arte são requisito, não acabamento.** A spec de cada tela diz a emoção e a mecânica de jogo que ela carrega. O que vai para o mantenedor é sempre a melhor versão atual da experiência, construída sobre a última validada.

## Como escrever textos da interface

- Curto e exato: **cada palavra precisa de motivo.**
- Palavras de quem viaja (destino, noite, volta, passagem, atividade, hospedagem), nunca termos internos (parada, trava, vizinha, trecho órfão, entidade).
- Nunca deixe a pessoa num beco sem saída: em vez de erro, mostre as saídas como botões.
  - Exemplo: "Ginzan Onsen tem só 1 noite." [Tirar de Osaka] [Adiar a volta]
- Ações dizem a intenção de quem viaja ("Tirar do roteiro", "Chegar 1 dia antes", "Desfazer"), nunca o nome da operação; ícone ou seta sozinha não basta. Os avisos confirmam o que aconteceu ("Sensō-ji ficou sem dia").
- Português do Brasil. **Vocabulário de jogo no visual e nas comemorações** (carimbo, nível, XP, estrelas); **navegação e ações em palavras comuns** (Mapa, Atividades, Tarefas, Destino, Atividade, Hospedagem). Nada de "Quest", "Mundo", "LV", "Fase", "Mochila" ou "figurinha" em rótulos ("mochila" só no motor).
- **Não inventar problema:** toda ação visível responde a uma frase de quem viaja; se não há frase, não há botão.
- **Painéis-editores ficam abertos** (trecho, atividade, visita, hospedagem, "Sua viagem"): mudar um campo não fecha o painel (`act(..., { keep: true })`); painéis de escolha fecham ao escolher. Ao corrigir um bug num painel, auditar todos os `act(` dos outros.
- **Painel-editor termina em "Pronto ✓"** (lista `EDITORS` em `Sheets.tsx`): salvar sozinho sem um botão de concluir deixa a pessoa sem saber se terminou.
- **Todo painel diz o que é** (`sheetLabel`); painel aberto de outro empilha, com "‹ voltar"; painel de criar com texto digitado registra `setSheetGuard` ("Criar ou Descartar").
- **Toda saída onde se procura:** o rótulo diz para onde leva ("‹ Viagem toda", não "◀ Mapa"); o "‹" do topo, a aba ativa e o Voltar do sistema voltam um passo (`stepBack`). Tela ou painel novo com estado próprio registra `setLocalBack`.
- **Passo de painel volta ao painel:** escolher o dia, marcar no mapa, horários, noites a bordo — feito o passo, o painel de onde se veio reabre (`openSheet` depois do `act` que deu certo).
- **Nenhum botão mudo:** sem datas, o que precisa de data leva a "Escolher a data de ida" (`askStartDate`); o que parece selo abre um painel antes de desfazer algo; ação equivalente em dois lugares usa o mesmo helper de `choices.ts`.
- **Escolhas que escalam:** nenhum painel lista uma frase por destino ou por dia. Onde/quando: `TimelinePicker` / `DayPicker` (`src/ui/TimelinePicker.tsx`); "de onde sai a noite": `nearest()` (3 + "Outro destino…"). Testar com `italiaLonga()` (50 destinos, 120 noites).
- **Atividade × dia:** anotações, turno, horário e "feita" são da visita (`Visit`); nome, tipo, prioridade, mapa e anotações gerais são da atividade (`Place`). Agendar do catálogo sempre cria mais uma visita (`scheduleOnce`).
- **Revelar progressivamente:** um lugar aberto por vez, uma ação primária por bloco, sem duplicatas na mesma tela; dicas somem depois de usadas. Medida: contar os controles da página do exemplo antes e depois.
- **"Destino" é a palavra genérica** (país, região, cidade, parque, ilha, navio); "cidade" só quando é mesmo uma cidade.
- **Animações seguem `docs/animacoes.md`** (guia vivo: contrato de diversão não invasiva, tamanho pelo cenário, mesma escala entre sprites que interagem, avaliador obrigatório com tira de quadros antes do commit). Aprendeu algo? Atualize o guia e o histórico dele.

## Como trabalhar

- **Fluxo:** ideias novas passam por brainstorming → spec → plano → implementação com TDD. Mudanças de design atualizam a spec antes do código.
- **Marcos:** pare ao fim de cada marco do plano para o mantenedor revisar.
- **Git:**
  - commits pequenos, em português, terminando com a linha de coautoria do Claude;
  - **push liberado** para `origin` (github.com/EduuF/LudoTrip);
  - nunca reescrever histórico já enviado.
- **Repositório público:** nada de nomes, datas ou dados pessoais de viagens reais em código, testes ou documentos. Use exemplos anônimos.
- **Testar no navegador:** o mantenedor costuma deixar o Chrome aberto numa segunda tela. Use Claude in Chrome para validar páginas publicadas, em janela estreita sempre que possível.
- **Skills e referências:** buscar e usar skills que ajudem (boas práticas primeiro), instaladas **só no projeto** (`.claude/skills`; já há as oficiais da Cloudflare: `durable-objects`, `workers-best-practices`, `wrangler`, `cloudflare-email-service`). Preferir a documentação atual a lembranças; citar as fontes.
- **Guias do mantenedor:** tudo o que o mantenedor faz num console vira um guia com cliques e campos exatos (`docs/guias/`), escrito só depois de pesquisar a documentação e os relatos mais recentes.
- **Logs e métricas sempre:** função nova no servidor nasce com log estruturado; jornada nova, com evento de uso.
- **Custos:** só planos gratuitos até haver uso real. Serviços externos ficam atrás de interfaces trocáveis (`src/providers`), com cache e plano B.

## Engenharia

- **`src/engine`** é o motor puro do roteiro: sem React, sem rede, sem `Date.now()`, com ids vindos de fora.
  - Toda regra de edição mora aqui.
  - Toda operação devolve novo estado, inverso (remendo) e efeitos.
  - **Toda mudança no motor vem com testes, incluindo as invariantes com sequências aleatórias (fast-check).**
- **A interface só despacha comandos serializáveis** (`dispatch(itinerary, command)`). Isso serve a fila offline e às transações.
- **Toda ação de quem usa tem Desfazer**, inclusive mochila e reservas (que ficam fora do itinerário): elas também passam por comandos com inverso. Toda marcação (passagem comprada, hospedagem, visitado) desmarca no mesmo lugar.
- **Persistência atrás de `TripRepo`:** local (IndexedDB) e nuvem (Cloudflare: `TripRoom` por viagem + D1; Firebase só para login).
- **Comandos do projeto:** `npm run dev`, `npm test`, `npm run test:worker` (servidor, no runtime dos Workers), `npm run typecheck`, `npm run lint`, `npm run build` e `npm run e2e` (Playwright, 375 × 812; projeto "celular" sem nuvem contra o build, projeto "nuvem" contra o Worker local de `scripts/e2e-cloud.mjs`; sem rede externa). Operação da nuvem: `docs/deploy.md`.
- **Nuvem (M4):** o mesmo `runDoc` roda no aparelho e no `TripRoom`; as regras do servidor ficam em `src/sync/serverCore.ts` (puro, testado com convergência). Toda ação tem `opId`; ids novos derivam dele. Nada de `Date.now()`/aleatório dentro do `runDoc`.
- **O que importa fica onde a pessoa está:** uma ação importante (ex.: guardar na nuvem) aparece dentro da viagem, à vista, com nome — nunca só na tela inicial ou dentro de um painel. O topo da viagem tem duas linhas: nome e ⋯; e as ações com nome (☁️ Salvar · ☾ Noite · ↶ Desfazer).
- **Intenção retomada:** quando algo exige conta, abra ENTRAR com `openSignIn(motivo, intent)`; depois de entrar, a pessoa volta ao que estava fazendo.
- **Mapa:** `src/map` (enquadramento, adaptadores papel e tiles, estilo washi, lugares e posição por dia) é puro ou isolado atrás do adaptador; as camadas SVG (`BoardOverlay`, `CityOverlay`) nunca falam com o MapLibre diretamente. Serviços gratuitos: OpenFreeMap (tiles) e Photon (busca), ambos com plano B sem rede.
- **Onde está no ar:** produção https://ludotrip.app (`www` leva ao principal) e staging https://staging.ludotrip.app. O staging publica sozinho a cada push na `main`; a produção só com `gh workflow run deploy.yml -f target=production`, depois de conferir o staging. Conferir um ambiente no ar: `node scripts/smoke-live.mjs <url>`. O GitHub Pages (https://eduuf.github.io/LudoTrip/) continua só no aparelho, sem nuvem, até o M6.
- **Colaboração (M5):** o D1 decide quem pode o quê; o papel vale já na conexão aberta (`TripRoom.setRole`). Mensagens novas do protocolo são só acréscimos (aparelho antigo ignora). Listas que duas pessoas editam ao mesmo tempo mudam um item por vez (ex.: `addTraveler`/`setTraveler`/`removeTraveler`), nunca trocando a lista inteira.
- **Só vê:** todo controle novo de edição usa `useCanEdit()` (`src/ui/useCanEdit.ts`) e some para quem só vê (não fica cinza); botões que só navegam dentro de painéis levam a classe `nav`. A varredura `src/ui/sove.test.tsx` toca em todos os botões como quem só vê e falha se algum tentar editar.
- **Animações, na prática:** a tira de quadros precisa do servidor de desenvolvimento em `http://localhost:5174` (`npx vite --port 5174`); o avaliador é um agente (`.claude/agents/avaliador-animacao.md`) retomado com `SendMessage` a cada rodada. Gere as tiras depois do e2e (o Playwright limpa `test-results/`).
