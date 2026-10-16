# LudoTrip — Publicação: contas, nuvem e colaboração

- **Data:** 2026-10-14
- **Status:** para revisão do mantenedor
- **Substitui:** o M4 ("Contas, nuvem e compartilhamento") e o M5 antigos do plano `docs/superpowers/plans/2026-10-13-subprojeto-1-fundacao-motor.md`, e as partes de Firebase/Firestore das §10 e §18 da spec v2.
- **Fontes:** documentação e relatos consultados em 2026-10-14, listados na §11. Cada guia do mantenedor é reescrito com pesquisa nova antes de ser usado (§9).

## 1. Objetivo e restrições

O LudoTrip vai ser **público desde o primeiro dia**, divulgado para amigos e amigos de amigos. Isso exige:

- **conta:** Google ou link por e-mail;
- **viagens na nuvem**, sem nunca perder nada;
- **planejar junto:** convidar, mudar o papel e remover;
- **domínio próprio** (`ludotrip.com` ou parecido);
- **logs** para depurar e **métricas** para entender o uso.

**Restrições do mantenedor, nesta ordem de peso:**

- barato, ~US$ 5/mês;
- robusto: nunca cair na escala esperada (centenas a poucos milhares de pessoas);
- plataforma conhecida (Cloudflare ou AWS);
- pouca complexidade.

**Lemas que continuam valendo:** sem bugs · resolve problemas reais · intuitivo · divertido · dinâmico · simples.

**Critérios de sucesso:**

- Uma pessoa nova abre o link e cria a viagem **sem conta**. Ao entrar, nada some e ela continua onde estava.
- Duas pessoas editando a mesma viagem ao mesmo tempo, uma delas offline, **sempre** convergem para o mesmo estado, e nenhuma edição some em silêncio.
- Convidar alguém leva 3 toques. O convidado entra na viagem com 2 toques depois de abrir o link.
- Custo mensal ≤ US$ 6 com até ~2.000 pessoas ativas por mês.
- Toda falha no servidor deixa um rastro: em qual viagem, qual ação, quem fez e por quê.

## 2. Arquitetura

### 2.1 Serviços

| Peça                       | Serviço                                                                      | Por quê                                                                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Login                      | **Firebase Auth** (Google + link por e-mail), **só login**                   | Pronto, seguro e grátis até 50 mil pessoas ativas por mês. Fazer login à mão é onde moram as falhas de segurança.                                                                                      |
| Site + API                 | **Um Cloudflare Worker com arquivos estáticos** (`assets`, modo SPA)         | Um único deploy serve o app, a API `/api/*` e o proxy `/__/auth/*`. Tem Workers Logs, traces e prévias por versão, que o Pages não tem. Arquivos estáticos não são cobrados.                           |
| Uma viagem                 | **Durable Object `TripRoom`**, um por viagem, com SQLite                     | Processa uma edição de cada vez (sem corrida), roda o mesmo `runDoc` do app, transmite por WebSocket com hibernação (não cobra tempo parado) e permite voltar a qualquer instante dos últimos 30 dias. |
| Contas, membros e convites | **D1** (SQLite da Cloudflare)                                                | Dados de tabela, consultas por pessoa ("minhas viagens").                                                                                                                                              |
| E-mail de convite          | **Cloudflare Email Sending** (binding `send_email`)                          | Inclui 3.000 e-mails por mês no Workers Paid. Nada de outro fornecedor.                                                                                                                                |
| Domínio                    | **Cloudflare Registrar** + Email Routing (`contato@`)                        | Preço de custo; recebe e-mail sem servidor.                                                                                                                                                            |
| Erros no celular           | **Sentry** (plano grátis)                                                    | Mostra o erro já com a linha do código-fonte.                                                                                                                                                          |
| Métricas de uso            | **PostHog Cloud UE** (1 milhão de eventos e 5 mil gravações por mês, grátis) | Funis, retenção e gravação de sessão com o texto mascarado.                                                                                                                                            |
| Disponibilidade            | Monitor externo grátis acessando `/api/health`                               | E-mail quando o app cai.                                                                                                                                                                               |

**Decisões que mudaram com a pesquisa:**

- **O Firebase vai para o plano Blaze, com cartão e alerta de orçamento de US$ 1.** No plano Spark, o login por link de e-mail está limitado a **5 e-mails por dia**. No Blaze o limite é de 25 mil, e o Auth básico (Google e e-mail) continua grátis até 50 mil pessoas ativas por mês. Nenhum outro produto do Firebase é ligado, então o custo esperado é zero.
- **Worker com arquivos estáticos em vez do Cloudflare Pages:** é a direção atual da Cloudflare, junta site e API num só deploy e traz logs e traces.
- **E-mail pela própria Cloudflare em vez do Resend:** é um fornecedor a menos, e o envio já vem incluído no plano.

### 2.2 Custo esperado

| Item                                                                    | Custo                 |
| ----------------------------------------------------------------------- | --------------------- |
| Workers Paid (inclui Workers, Durable Objects, D1, 3 mil e-mails, logs) | US$ 5/mês             |
| Domínio `.com`                                                          | ~US$ 10/ano           |
| Firebase Auth, Sentry, PostHog, monitor                                 | US$ 0 (planos grátis) |

**Por que o Workers Paid e não o grátis:** no plano grátis, ao passar de 100 mil requisições num dia, tudo para até o dia seguinte. Isso é "cair" num dia de divulgação. O Paid inclui 10 milhões de requisições por mês, e cada viagem aberta conta poucas requisições graças à hibernação.

**Alertas:** uso da Cloudflare ao chegar em 50% do incluído e orçamento do Google Cloud em US$ 1.

### 2.3 Riscos técnicos já conhecidos

| Risco                                                                                                                                   | Resposta                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login do Google no Safari/iPhone com domínio próprio: o Safari bloqueia o armazenamento de outro domínio e o `signInWithRedirect` falha | `authDomain` = nosso domínio, e o Worker repassa `/__/auth/*` de forma transparente (proxy, nunca redirecionamento 302) para `<projeto>.firebaseapp.com`. A URI `https://<domínio>/__/auth/handler` é registrada no cliente OAuth do Google.                                |
| Validar quem é a pessoa no servidor                                                                                                     | O Worker verifica o token do Firebase com `jose` (`jwtVerify` + `createRemoteJWKSet` das chaves `securetoken@system.gserviceaccount.com`). Confere: `alg` RS256, `aud` = projeto, `iss` = `https://securetoken.google.com/<projeto>`, `exp`/`iat` válidos e `sub` presente. |
| Link de e-mail aberto noutro aparelho                                                                                                   | O Firebase pede o e-mail de novo (proteção contra fixação de sessão). Mostramos isso como uma pergunta simples: "Confirme seu e-mail".                                                                                                                                      |
| Safari apaga os dados de sites não usados por 7 dias (as viagens sem conta)                                                             | §3.2: aviso e convite para instalar o app ou entrar. Apps na tela de início não têm esse limite.                                                                                                                                                                            |
| Volta no tempo dos Durable Objects não roda localmente                                                                                  | O procedimento de recuperação é testado uma vez em produção, com uma viagem de teste, e documentado.                                                                                                                                                                        |
| Limites de taxa da Cloudflare são por local, não globais                                                                                | Servem contra abuso, não como cota exata. As cotas exatas (viagens por conta, convites) ficam no D1.                                                                                                                                                                        |

### 2.4 Ambientes

| Ambiente       | Onde                                                                         | Dados                                                      |
| -------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Produção       | `ludotrip.com`                                                               | D1 e Durable Objects de produção; Firebase `ludotrip`      |
| Prévia         | URL de prévia por versão do Worker (`<versão>-ludotrip.<conta>.workers.dev`) | D1 e Durable Objects de `staging`; Firebase `ludotrip-dev` |
| Local e testes | `wrangler dev` + emulador do Firebase Auth                                   | Tudo local; nada toca dados reais                          |

O GitHub Pages atual passa a só redirecionar para o domínio novo. **Não há migração de dados**: ninguém tem viagem real lá.

## 3. "Usa antes, entra depois"

**Princípio:** o login nunca é barreira. Ele aparece como **resposta a um desejo** ou a um **risco real**, e depois de entrar a pessoa **continua exatamente o que estava fazendo** (a intenção é retomada).

### 3.1 Onde a viagem está

- Em "Suas viagens", cada cartão tem um selo:
  - 📱 "Só neste aparelho";
  - ☁️ "Salva na sua conta".
- O painel "Sua viagem" repete o selo. Tocar em 📱 abre "Guardar na nuvem".
- No topo, o ícone de nuvem da §5.4 só aparece em viagens da conta.

### 3.2 Quando o app oferece entrar (do mais forte ao mais leve)

1. **Desejo que exige conta.** Nesses casos o painel ENTRAR já diz o que acontece depois, por exemplo "Para convidar, entre. Sua viagem vai junto."
   - "Convidar" (§4);
   - "Abrir em outro aparelho" (no painel "Sua viagem");
   - abrir um convite;
   - abrir o endereço de uma viagem da conta.
2. **Risco real de perder dados.** Aviso gentil, no máximo uma vez a cada 3 dias, com duas saídas ("Instalar o app" e "Entrar"), quando:
   - o navegador é o Safari do iPhone fora da tela de início (regra dos 7 dias);
   - `navigator.storage.persist()` foi negado;
   - a aba é anônima ou não tem armazenamento (o aviso do M3.5 continua).
3. **Missão.** A tarefa do app **"Guardar a viagem na nuvem ☁️"** entra na lista de Tarefas (`src/ui/autoTasks.ts`) para viagens 📱 com pelo menos 3 edições. Ela tem XP e "Não preciso", como as outras. Nunca vira pop-up.

### 3.3 O painel ENTRAR

- **Tipo e nome:** "ENTRAR" + o motivo (por exemplo "para convidar"), seguindo o padrão `sheetLabel`. Empilha sobre o painel de onde veio (M3.7).
- **Botões:**
  - "Continuar com Google";
  - "Receber link por e-mail": um campo de e-mail e "Enviar link". Depois do envio: "Abra o link **neste mesmo celular**", "Reenviar" (a partir de 60 s) e "Trocar e-mail".
- **Como o Google abre:** pop-up no navegador; redirecionamento no app instalado (iPhone) ou quando o pop-up é bloqueado.
- **Depois de entrar:**
  1. as viagens 📱 sobem (§3.4);
  2. o painel ENTRAR fecha;
  3. a intenção é retomada: abre "Convidar", "Abrir em outro aparelho" ou o convite.

### 3.4 Subir as viagens do aparelho

- No primeiro login do aparelho, todas as viagens 📱 sobem **sozinhas**.
- Uma animação leva os cartões do 📱 para a ☁️ e termina com o aviso "2 viagens guardadas na sua conta ✓".
- **É idempotente:** cada viagem tem um id aleatório. Subir de novo a mesma viagem para a mesma conta não duplica.
- **Se falhar no meio** (rede caiu), a viagem continua 📱 e o app tenta de novo depois. Nunca existe meio-estado.
- **Viagens criadas sem conta enquanto há alguém logado** já nascem ☁️.

### 3.5 Casos estranhos

| Situação                                                                                         | Comportamento                                                                                                                                              |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A conta já tem viagens de outro aparelho                                                         | Junta as duas listas; nada é apagado nem duplicado.                                                                                                        |
| Aparelho compartilhado: entra uma conta diferente da última que usou o aparelho, e há viagens 📱 | Não sobe sozinho. Pergunta "Levar estas viagens para a sua conta?" com a lista e caixas **desmarcadas**. As não escolhidas continuam 📱.                   |
| A mesma viagem 📱 já foi levada para **outra** conta                                             | O servidor recusa por dono diferente. O app oferece "Levar uma cópia" (id novo).                                                                           |
| Link de e-mail aberto noutro aparelho ou no navegador do Gmail                                   | Entra lá. Neste aparelho, as viagens 📱 continuam salvas e sobem no próximo login daqui. O texto avisou antes.                                             |
| Fecha o pop-up do Google                                                                         | Volta ao painel ENTRAR, sem mensagem de erro.                                                                                                              |
| Sem internet ao tentar entrar                                                                    | "Sem internet. Sua viagem continua salva aqui." O botão tenta de novo sozinho quando a rede volta.                                                         |
| "Sair da conta" com alterações ainda não enviadas                                                | Painel: "2 alterações ainda não foram enviadas." [Esperar enviar] [Sair mesmo assim].                                                                      |
| "Sair da conta"                                                                                  | Apaga do aparelho a cópia das viagens ☁️ e a fila (privacidade). As viagens 📱 ficam.                                                                      |
| Login expirado                                                                                   | O Firebase renova sozinho. Se não der (conta apagada ou desativada), a viagem fica **só para ver** com "Entre de novo"; a fila é preservada até entrar.    |
| Abre `/v/<id>` sem conta                                                                         | "Esta viagem está numa conta. Entre para abrir."                                                                                                           |
| Abre `/v/<id>` com uma conta sem acesso                                                          | "Você ainda não está nesta viagem. Peça um convite a quem a criou." [Suas viagens]                                                                         |
| Duas abas da mesma viagem                                                                        | ☁️: as duas recebem pelo WebSocket. 📱: avisam uma à outra pelo `BroadcastChannel` e recarregam o estado. Resolve o caso "várias abas" registrado no M3.5. |
| Limpa os dados do navegador com viagens ☁️                                                       | Nada se perde; ao entrar de novo, elas voltam da nuvem. Se havia fila não enviada, ela se perde (o aviso da §5.4 deixa isso visível antes).                |

### 3.6 Endereços

As telas ganham endereço, para funcionar link, recarregar e favoritos:

| Endereço           | Tela                    |
| ------------------ | ----------------------- |
| `/`                | Suas viagens            |
| `/v/<id>`          | A viagem                |
| `/convite/<token>` | Prévia do convite       |
| `/entrar/link`     | Volta do link de e-mail |
| `/privacidade`     | Política de privacidade |

- **Cidade, aba e painel continuam fora do endereço.** O Voltar do M3.8 (`stepBack`, uma entrada nossa no histórico) continua igual por cima disso.
- Abrir `/v/<id>` direto conta como "estar dentro". O primeiro Voltar volta a `/`, em vez de sair do app.

## 4. Colaboração

### 4.1 Papéis

| Papel             | Pode                                                                               |
| ----------------- | ---------------------------------------------------------------------------------- |
| **Dono**          | Tudo: convidar, mudar papéis, remover, passar a viagem, apagar a viagem para todos |
| **Planeja junto** | Editar tudo na viagem; convidar com o papel "Só vê"; sair                          |
| **Só vê**         | Ver tudo; sair                                                                     |

Há exatamente 1 Dono por viagem.

### 4.2 O painel PESSOAS

- **No topo da viagem:** os rostos (avatares) de quem participa, empilhados (até 3 + "+N"), na primeira linha. Quem está com a viagem aberta agora ganha um anel colorido.
- **Tocar nos rostos abre o painel PESSOAS**, com três blocos:
  1. **Quem planeja:** cada membro com o papel e "online agora". Tocar num membro abre as ações que cabem ao seu papel.
  2. **Quem vai:** os bonequinhos do mapa (`itinerary.travelers`), editáveis a qualquer momento.
     - Dá para adicionar quem não tem conta ("Pedro").
     - Dá para tirar alguém.
     - Um membro que viaja aparece com o rosto dele.
  3. **Convites aguardando:** por exemplo "Link · enviado há 2 h · Planeja junto · vai viajar" [Cancelar].
- **"Compartilhar" (na segunda linha do topo, junto de ☁️/☾/↶) abre direto o painel CONVIDAR.** É a palavra que Google Docs, Canva, Notion e Figma usam; o painel pergunta "Planejar junto / Só ver" como o Editor/Leitor do Docs. Antes era um "+" solto ao lado do ⋯, que ninguém achava, e depois "+ Chamar", ambíguo (2026-10-15). Some para quem só vê. Em telas de até 370 px a faixa aperta o espaçamento para caber numa linha.
- **Outros caminhos para compartilhar:** o 4º passo de "Como jogar" ("Planejem juntos", com o holofote no "Compartilhar"), o aviso de viagem criada com mais de uma pessoa e o cartão da tela inicial (spec v2 §17.7). Cada um leva `trigger` no evento `convite_iniciado` (topo, pessoas, aviso, tutorial).

### 4.3 O painel CONVIDAR (3 toques)

1. **"O que essa pessoa vai fazer?"** Planejar junto (marcado) · Só ver. Quem é "Planeja junto" só vê a opção "Só ver".
2. **"Essa pessoa vai viajar?"**
   - "Sim, vai": aparece **na hora** um bonequinho "Convidado" no mapa e em "Quem vai", com animação de chegada.
   - "Não, só ajuda".
3. **"Como enviar?"**
   - **Enviar link:** Web Share API no celular; no computador, "Copiar link" com o aviso "Link copiado".
   - **Por e-mail:** campo de e-mail e "Enviar convite".

**O convite:**

- É de **uso único** e vence em **7 dias**.
- Guarda o papel e, se a pessoa vai viajar, o id do bonequinho reservado.
- **Cancelar o convite** tira o bonequinho "Convidado" (com Desfazer) e invalida o link na hora.
- **Convite vencido:** o bonequinho reservado fica, com a etiqueta "convite vencido" e as opções [Reenviar] [Tirar].

### 4.4 Aceitar

1. `/convite/<token>` mostra uma prévia **sem precisar de conta**:
   - "**Ana** te chamou para planejar **Japão 2030** 🗾";
   - datas, destinos e o mapa em miniatura;
   - o papel ("para planejar junto" ou "para acompanhar");
   - botão "Entrar e participar".
2. Depois do login (Google ou e-mail), a pessoa cai **direto na viagem**:
   - o bonequinho "Convidado" ganha o nome e a foto dela;
   - os outros recebem o aviso "Bia entrou na viagem 🎉".
3. As viagens 📱 de quem aceita também sobem (§3.4).

**A prévia expõe pouco:** só o nome da viagem, o primeiro nome de quem convidou, as datas e os destinos. Nada de anotações, reservas ou tarefas.

| Caso estranho                             | Comportamento                                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Convite vencido, já usado ou cancelado    | "Este convite não vale mais. Peça outro a Ana." [Suas viagens]                                                                                                            |
| Já é membro                               | Abre a viagem; o convite continua sem uso.                                                                                                                                |
| Convite por e-mail aberto com outra conta | "O convite foi para b•••@gmail.com, mas você entrou como outra conta." [Entrar mesmo assim] [Trocar de conta]. O link é a credencial, e o e-mail serve só de conferência. |
| Link encaminhado num grupo                | Uso único: o primeiro que aceita entra; os outros veem "já usado". O Dono vê quem entrou e pode tirar.                                                                    |
| A viagem foi apagada                      | "Esta viagem foi apagada."                                                                                                                                                |
| A viagem já tem 20 membros                | "Esta viagem já está cheia (20 pessoas)."                                                                                                                                 |

### 4.5 Remover, sair, passar e apagar

- **Tirar da viagem** (só o Dono): toca no membro e escolhe "Tirar da viagem".
  - Um interruptor pergunta "Também sai de Quem vai?". Já vem ligado se a pessoa tem um bonequinho.
  - O servidor fecha na hora as conexões dessa pessoa.
  - Para quem foi removido, a viagem some de "Suas viagens" e aparece o aviso "Você não faz mais parte de Japão 2030".
- **Sair da viagem** (Planeja junto e Só vê): mesmo efeito, por conta própria.
- **Passar a viagem para…** (só o Dono): escolhe um membro. O Dono atual vira "Planeja junto". O Dono só pode "Sair" depois de passar a viagem.
- **Apagar para todos** (só o Dono):
  - painel de confirmação com o nome da viagem. É a única confirmação deste desenho, porque não é uma edição do roteiro e afeta outras pessoas;
  - a viagem vai para **"Apagadas"** por 30 dias, visível só ao Dono, com "Recuperar";
  - os membros veem "Ana apagou Japão 2030";
  - depois de 30 dias, um alarme do `TripRoom` apaga de vez.
- **Apagar viagem 📱:** continua como hoje (M3.5).

### 4.6 Ao vivo e "Só vê"

- **Edição de outra pessoa** aparece na hora, com um aviso leve que diz o efeito: "Bia: Kyoto agora tem 5 noites". Os avisos de quem edita em rajada (vários em menos de 3 s) se juntam.
- **O Desfazer continua sendo só das próprias ações** e recusa quando outra pessoa mexeu depois na mesma parte. Isso já funciona assim no motor (`src/engine/patch.ts`). Veja a §5.3 para o restante do documento.
- **"Histórico":** fica no painel "Sua viagem" e mostra quem fez o quê e quando, a partir do registro de ações (§5.2).
- **"Só vê":**
  - os controles de edição não aparecem; não ficam cinza, simplesmente não existem;
  - uma etiqueta "Você está vendo" no topo explica, ao ser tocada, que dá para pedir ao Dono para planejar junto;
  - o arrastar fica desligado;
  - as Tarefas aparecem sem a caixa de marcar.

### 4.7 Limites anti-abuso

| Limite                        | Valor                                  |
| ----------------------------- | -------------------------------------- |
| Membros por viagem            | 20                                     |
| Convites pendentes por viagem | 10                                     |
| E-mails de convite por pessoa | 20 por dia                             |
| Viagens por conta             | 100                                    |
| Tamanho de uma viagem         | 1 MB (JSON)                            |
| Requisições à API por pessoa  | 120 por minuto (binding de rate limit) |

Ao bater num limite, a pessoa vê uma frase com saída, nunca um erro técnico. Por exemplo: "Você já mandou 20 convites hoje. Amanhã libera mais; o link continua funcionando."

## 5. Sincronização, offline e observabilidade

### 5.1 Modelo de dados

**D1 (fonte da verdade de quem pode o quê):**

```sql
users   (uid PK, name, email, photo_url, created_at, deleted_at)
trips   (id PK, owner_uid, name, start, end, emoji, updated_at, deleted_at, size_bytes)
members (trip_id, uid, role CHECK(role IN ('owner','editor','viewer')), joined_at, PRIMARY KEY (trip_id, uid))
invites (token_hash PK, trip_id, role, traveler_id NULL, email NULL, created_by, created_at,
         expires_at, used_by NULL, used_at NULL, revoked_at NULL)
```

- **O token do convite** tem 128 bits de `crypto.getRandomValues`. O banco guarda **só o hash SHA-256**.
- **`trips` guarda os metadados** que "Suas viagens" mostra. O `TripRoom` atualiza esses metadados depois de cada ação.

**`TripRoom` (SQLite do Durable Object, `getByName(tripId)`):**

```sql
doc (k PK = 1, json, version, schema_version)
ops (seq PK AUTOINCREMENT, op_id UNIQUE, uid, action_json, result, at)
```

- `doc` guarda o `TripDoc` inteiro, num documento só.
- `ops` é o registro de todas as ações aplicadas e serve três propósitos:
  - impedir que a mesma ação seja aplicada duas vezes;
  - mandar só o que falta a quem reconecta;
  - o Histórico e a depuração.

**No aparelho (IndexedDB):**

- as viagens 📱 (como hoje);
- a cópia das viagens ☁️, com o `version` do servidor;
- a **fila de saída** (`outbox`): `{ opId, tripId, action, baseVersion, createdAt }`.

### 5.2 Como uma edição viaja

1. **Na tela:** a pessoa age, e o app roda `runDoc` **localmente** e aplica na hora (otimista). A ação entra na `outbox` com um `opId` (UUID).
2. **No servidor:** com o WebSocket aberto, o app manda `{ opId, action }`. O `TripRoom`:
   1. ignora a ação se o `opId` já está em `ops` e responde com o resultado já gravado;
   2. confere o papel de quem mandou (guardado na conexão);
   3. roda `runDoc(doc, action)` sobre o estado **mais novo**;
   4. se deu certo, grava `doc` e `ops` na mesma transação, com `version + 1`, e manda `{ applied, opId, version, action, by }` a todos;
   5. se o motor recusou, grava a recusa e manda `{ rejected, opId, reason }` só a quem mandou.
3. **No aparelho, ao receber:** o app remonta o estado como `estado do servidor + ações próprias ainda pendentes`, reaplicadas em ordem. Uma ação pendente que o motor recuse nessa remontagem vira painel de escolha (§5.3).
4. **Ao conectar ou reconectar:** o app manda `hello { sinceVersion }`. O `TripRoom` responde com as ações que faltam ou, se for mais barato, com o `doc` inteiro.

**Por que converge:** as ações são **intenções** ("mais uma noite em Kyoto"), não cópias do documento. O servidor processa uma de cada vez, e cada aparelho termina no estado do servidor com as próprias pendências por cima.

**Mudanças necessárias no app:**

- **Ids novos determinísticos por ação.** Hoje `runDoc` gera `u${++seq}` com um contador por viagem; dois aparelhos offline gerariam o mesmo id. Passa a ser `${p}.${n}`, em que `p` são os 12 primeiros caracteres do `opId` (UUID aleatório) da ação. Ações sem conta (📱) também ganham `opId`. A mesma ação gera os mesmos ids no aparelho e no servidor, e ações diferentes nunca colidem. O `seq` sai do documento.
- **Desfazer seguro para as coleções do documento** (atividades, destinos, reservas, tarefas). Hoje o passo `col` guarda a lista inteira de antes, e desfazer apagaria o que outra pessoa fez na mesma lista. Ele passa a ser por item, com "antes" e "depois", como o `Patch` do roteiro: só desfaz se o item continua como a ação o deixou; senão, recusa com "A Bia mexeu nisso depois".
- **O Desfazer na nuvem é uma ação** (`{ type: 'revert', steps }`) que passa pelo mesmo caminho e pela mesma verificação no servidor.

### 5.3 Conflitos

- **Edições em partes diferentes** se somam sem ninguém perceber.
- **Conflito real:** por exemplo, a Bia tirou Kyoto enquanto você, offline, acrescentava uma noite lá.
  - O motor recusa com o motivo, e a pessoa vê um **painel de escolha** no padrão "erros viram escolhas". Exemplo: "Kyoto saiu do roteiro (Bia, há 5 min). Sua mudança '+1 noite' não foi aplicada." [Ver o roteiro] [Ok].
  - Nada some em silêncio. O texto da ação perdida fica no Histórico como "não aplicada".

### 5.4 Offline e o ícone de nuvem

- **Tudo funciona sem internet:** abrir viagens já baixadas, editar e criar viagens.
- **No topo da viagem ☁️, um ícone discreto mostra o estado:**

  | Ícone | Texto ao tocar                                                                                     |
  | ----- | -------------------------------------------------------------------------------------------------- |
  | ☁️✓   | "Tudo salvo na sua conta"                                                                          |
  | ☁️⋯   | "Enviando 2 alterações…"                                                                           |
  | ☁️✕   | "Sem internet · 3 alterações guardadas neste aparelho. Elas vão sozinhas quando a conexão voltar." |

- **A fila sobrevive** a fechar o app e reiniciar o celular. Na volta da rede, as ações são enviadas em ordem.
- **Reconexão automática** com espera crescente (1 s, 2 s, 4 s… até 30 s) e tentativa imediata quando o navegador avisa que a rede voltou.
- **Viagem ☁️ nunca baixada neste aparelho e sem internet:** "Esta viagem ainda não foi baixada neste aparelho. Conecte-se uma vez para levá-la junto."

### 5.5 Versões do app

- **Nova versão publicada:** aparece o aviso "Nova versão do LudoTrip ✨" [Atualizar]. Ele só atualiza com a fila vazia; se houver pendências, espera enviar.
- **Compatibilidade de formato:** o `hello` leva `schemaVersion` e a versão do protocolo.
  - Um aparelho mais antigo que o mínimo aceito recebe `{ upgrade }` e vê "Atualize para continuar editando". A fila é guardada e enviada depois de atualizar.
  - O servidor aceita ações de formatos antigos enquanto houver aparelhos com eles. Cada mudança de formato acrescenta um passo em `migrate()`, que já existe.

### 5.6 Logs para depurar

- **Workers Logs e traces** ficam ligados (`observability.enabled` e `observability.traces.enabled`), com logs em JSON.
- **Cada requisição e cada ação geram uma linha com:**
  - `reqId` e `opId`;
  - `uid` como hash curto (nunca o e-mail);
  - `tripId`, tipo da ação, resultado ou `reason`, duração em ms;
  - versão do app.
- **Retenção:** o Workers Logs guarda 7 dias. O registro `ops` de cada viagem guarda tudo e permite **reconstruir passo a passo** como uma viagem chegou a um estado ruim. Fica um script `npm run replay -- <tripId>` para isso, só para o mantenedor.
- **Erros no aparelho:** telas que quebram (React error boundary), recusas inesperadas e falhas de sincronização vão para o **Sentry**, com mapas de código-fonte enviados no deploy e o `uid` em hash.

### 5.7 Métricas de uso (PostHog UE)

- **Eventos nomeados**, sempre sem texto digitado:
  - `app_aberto`, `viagem_criada`, `edicao` (com o tipo da ação);
  - `login_oferecido` (com o gatilho), `login_feito` (com o método);
  - `viagens_subiram`, `convite_criado` (com o canal e o papel), `convite_aceito`, `membro_removido`;
  - `conflito`, `offline_fila`;
  - `painel_aberto` (com o `sheetLabel.kind`).
- **Funis:**
  - abriu → criou → 3 edições → voltou outro dia;
  - login oferecido → feito;
  - convite criado → aceito.
- **Gravação de sessão:** todo texto e todos os campos mascarados, para ver a navegação sem ler conteúdo.
- **Opt-out (mudou com o retorno do staging, 2026-10-15):** sem faixa de pergunta. A faixa induzia a recusar e, sem resposta, nada era medido.
  - As estatísticas de uso ficam ligadas por padrão, por legítimo interesse: não levam conteúdo (nada que a pessoa escreve, nem nomes), a pessoa é um código e a gravação mascara todo texto.
  - Desligar: interruptor "Estatísticas de uso · ajudam a melhorar o LudoTrip. Não incluem o que você escreve." em "Privacidade" (menu ⋯ da viagem e rodapé de "Suas viagens") e em "Sua conta". Desligado, o PostHog nem carrega.
  - LGPD precisa de atenção se o app escalar (spec §6.4): a política de privacidade do M6 explica a base legal.
  - Logs técnicos e o Sentry são necessários para o serviço funcionar e não dependem dessa escolha; a política de privacidade explica.

### 5.8 Recuperação

| Problema                               | Recuperação                                                                                                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Viagem estragada (bug ou engano grave) | O `TripRoom` volta a qualquer instante dos últimos 30 dias (`getBookmarkForTime` + `onNextSessionRestoreBookmark`). Uma rota de administração, só para o mantenedor, faz isso por `tripId` e horário. |
| Versão do app com bug                  | `wrangler rollback` para a versão anterior. Os Durable Objects não são afetados.                                                                                                                      |
| D1                                     | Time Travel do D1 (volta no tempo) para membros e convites.                                                                                                                                           |

## 6. Publicação e proteção

### 6.1 Domínio e e-mail

- **Domínio:** `ludotrip.com`, ou `ludotrip.app` / `ludotrip.com.br` se não estiver livre, registrado no Cloudflare Registrar.
  - O Worker atende o domínio principal; `www` redireciona para ele.
- **Envio:** o domínio é habilitado no Email Sending para os convites, que saem de `convites@`.
- **Recebimento:** o Email Routing leva `contato@` para o e-mail pessoal do mantenedor (o repositório continua anônimo).

### 6.2 Serviços de terceiros pela API

Hoje a busca (Photon) e as rotas (OpenRouteService) são chamadas direto do aparelho. A chave do OpenRouteService fica exposta e o limite é coletivo. Passam a ir por `/api/busca` e `/api/rota`, com:

- **cache** na Cache API da Cloudflare: 7 dias para buscas e 30 dias para rotas;
- **limite por pessoa** com o binding de rate limit;
- **chave no servidor**, guardada como secret do Wrangler;
- **alerta** nos logs ao passar de 70% da cota diária do OpenRouteService.

Os planos B que já existem continuam: linha reta no mapa e "Busca indisponível, tente já já". OpenFreeMap (tiles) e frankfurter (câmbio) seguem diretos, porque não têm chave nem limite por app.

### 6.3 Segurança

- **CSP restrita**, só com os domínios usados, além de `X-Content-Type-Options`, `Referrer-Policy` e `Permissions-Policy`.
- **A API só aceita** a origem do próprio domínio (CORS fechado) e um token válido em toda rota que não seja pública.
- **A chave web do Firebase** fica restrita ao domínio no Google Cloud (restrição por referenciador).
- **Segredos** só como Wrangler secrets, nunca no repositório.
- **CI:** `npm audit --audit-level=high` e testes de permissão (§7).
- **Tokens e ids:** `crypto.randomUUID()` e `crypto.getRandomValues()`; comparação de segredos em tempo constante.

### 6.4 LGPD (mínimo agora)

- **Página "Privacidade"** curta: o que é guardado, para quê, quem processa (Cloudflare, Google/Firebase, Sentry, PostHog) e o contato.
- **"Baixar meus dados"** gera um JSON com a conta e as viagens.
- **"Excluir minha conta"** apaga a conta e as viagens das quais a pessoa é Dona. Se uma dessas viagens tem outros que planejam junto, ela **passa ao membro mais antigo** em vez de sumir para todos. A pessoa também sai das viagens dos outros.
- **Registro "LGPD precisa de atenção se escalar"**, na spec e em comentários no código das rotas de conta. Ficam pendentes:
  - termos de uso revisados por advogado;
  - registro das operações de tratamento;
  - acordos de tratamento de dados com os fornecedores;
  - prazo de guarda dos logs;
  - encarregado de dados.

### 6.5 Ficar de olho

- **Monitor externo** (UptimeRobot ou Better Stack, plano grátis) acessando `/api/health` a cada 5 minutos. A rota responde 200 e confere o D1 e um `TripRoom` de teste.
- **Alertas de uso e de cobrança** da Cloudflare e do Google Cloud.
- **Sentry:** alerta por e-mail para erro novo.

### 6.6 PWA

- **Instalável:** manifest, ícones e `vite-plugin-pwa`, com cache do app e dos contornos dos países para abrir offline.
- **A dica "Adicionar à tela inicial"** aparece no iPhone fora da tela de início (§3.2), com 3 passos ilustrados. Em Android e no computador, usa o prompt nativo `beforeinstallprompt`.

### 6.7 Prévia do link

O Worker devolve meta tags Open Graph (título, descrição e imagem) para `/` e para `/convite/<token>`. No convite: "Ana te chamou para planejar Japão 2030" e uma imagem com o mapa da viagem, que é gerada uma vez e guardada no cache.

## 7. Testes

| Camada              | Ferramenta                                                                                        | O que prova                                                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Motor e documento   | Vitest + fast-check (existente)                                                                   | Ids determinísticos por ação; Desfazer por item recusa quando outro mexeu; `revert`                                                                                                                                                   |
| Worker e `TripRoom` | Vitest com a integração oficial dos Workers (`@cloudflare/vitest-pool-workers` ou o plugin atual) | Matriz de permissões (Dono · Planeja junto · Só vê · fora); idempotência por `opId`; convites (vencido, usado, cancelado, cheio); token inválido, vencido ou de outro projeto; limites; apagar e recuperar; remoção fecha as conexões |
| Convergência        | fast-check                                                                                        | Milhares de sequências aleatórias com 2–3 clientes, um deles offline por trechos, ações em ordens diferentes. Ao fim, todos têm o mesmo `doc`, e toda ação foi aplicada ou recusada com motivo, nunca sumiu.                          |
| Ponta a ponta       | Playwright 375 × 812, contra `wrangler dev` + emulador do Firebase Auth                           | Usar sem conta → entrar → as viagens sobem; duas pessoas editando a mesma viagem (dois contextos); offline (`context.setOffline`) → editar → voltar; convidar → aceitar → remover; "Só vê"; sair com a fila cheia                     |
| Carga               | k6 ou script em Node                                                                              | 500 WebSockets em 50 viagens, 1 ação por segundo cada, sem erro e com p95 < 300 ms                                                                                                                                                    |
| Recuperação         | Manual, em produção, uma vez                                                                      | Voltar no tempo uma viagem de teste e desfazer a volta                                                                                                                                                                                |

Todo teste continua sem rede externa: o Firebase é emulado e Photon e OpenRouteService são simulados.

## 8. Marcos

Cada marco termina com revisão do mantenedor. **Cada um começa com o guia "O que você precisa fazer"** (§9).

### M4: contas e nuvem

- Worker com arquivos estáticos substituindo o GitHub Pages: prévia e produção no `workers.dev`, ainda sem domínio.
- Firebase Auth com o proxy `/__/auth/*`, o painel ENTRAR e os selos 📱/☁️.
- D1 (`users`, `trips`, `members`) e `TripRoom` com `runDoc`, `ops` e WebSocket com hibernação.
- Ids determinísticos, Desfazer por item e `revert`.
- Fila offline, ícone de nuvem, subida das viagens e todos os casos da §3.5.
- Endereços `/v/<id>`.
- A dica "Adicionar à tela inicial" do iPhone (§3.2), usando o manifest que já existe desde o M3.
- Workers Logs, Sentry e PostHog (estatísticas ligadas por padrão, desligáveis em Privacidade).
- **Revisão:** o mantenedor usa sem conta, entra, abre em outro celular e edita offline.

### M5: colaboração

- Painéis PESSOAS e CONVIDAR, prévia e aceite do convite. O convite por e-mail fica pronto e testado com o envio simulado do `wrangler dev`; o envio real liga no M6, junto com o domínio. Até lá, "Por e-mail" aparece desativado com "Em breve".
- Papéis, "Só vê", remover, sair, passar e apagar com "Apagadas".
- Avisos ao vivo, rostos online e Histórico.
- Limites da §4.7.
- **Revisão:** o mantenedor convida uma pessoa para planejar junto e outra para só ver; as três editam ao mesmo tempo, uma offline; depois remove uma delas.

### M6: publicação

- Domínio, `www`, `contato@` e envio de e-mail pelo domínio.
- Busca e rotas pela API (§6.2), segurança (§6.3), LGPD mínima (§6.4), monitor e alertas (§6.5).
- PWA (§6.6) e prévia do link (§6.7).
- Teste de carga e teste de recuperação.
- O GitHub Pages passa a redirecionar.
- **Revisão:** checklist de lançamento, item por item.

## 9. Guias do mantenedor

- **Antes de cada marco,** escrevo `docs/guias/M<n>-o-que-voce-precisa-fazer.md`, com o caminho de cliques e os campos exatos, por exemplo: "No console do Firebase → Authentication → Sign-in method → Adicionar novo provedor → Google → Ativar → e-mail de suporte: o seu → Salvar".
- **Cada guia é escrito só depois de pesquisar** a documentação oficial atual e relatos recentes (issues no GitHub, blogs, fóruns), e cita as fontes com data. Painéis mudam; um guia antigo não é reaproveitado sem conferir.
- **O que o mantenedor vai fazer, por marco:**

  | Marco | Passos                                                                                                                                                                                                                                                                                              |
  | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | M4    | Criar os projetos Firebase `ludotrip` e `ludotrip-dev`; ativar Google e link por e-mail; mudar `ludotrip` para Blaze com alerta de US$ 1; assinar o Workers Paid; criar um token da API da Cloudflare para o CI; criar as contas do Sentry e do PostHog (UE); colar as chaves nos secrets do GitHub |
  | M5    | Nada novo além do M4 (o convite por e-mail usa o envio da Cloudflare, ligado no M6; até lá, só o link)                                                                                                                                                                                              |
  | M6    | Registrar o domínio; ligar o Email Sending e o Email Routing; adicionar o domínio aos domínios autorizados do Firebase e à URI de redirecionamento do OAuth; criar o monitor de disponibilidade; publicar                                                                                           |

## 10. Como trabalhamos nesta fase

- **Skills:** usar skills que ajudem, sobretudo de boas práticas, instaladas **no projeto** (`.claude/skills`), nunca globalmente. Já estão instaladas as skills oficiais da Cloudflare (repositório `cloudflare/skills`, Apache-2.0): `durable-objects`, `workers-best-practices`, `wrangler` e `cloudflare-email-service`.
- **Referências externas:** preferir a documentação atual a lembranças de treino; citar as fontes na spec, nos guias e em `docs/aprendizados.md`.
- **Logs e métricas sempre:** toda função nova no servidor nasce com log estruturado; toda jornada nova, com o evento de uso.

## 11. Fontes consultadas (2026-10-14)

- Cloudflare: [preços dos Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/) · [API de armazenamento SQLite e volta no tempo](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) · [WebSockets com hibernação](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) · [Workers vs. Pages](https://developers.cloudflare.com/workers/static-assets/compatibility-matrix/) · [arquivos estáticos e SPA](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/) · [URLs de prévia](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/) · [rate limit](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) · [preços do Email Service](https://developers.cloudflare.com/email-service/platform/pricing/) · [limites do Email Service](https://developers.cloudflare.com/email-service/platform/limits/) · skills oficiais [`cloudflare/skills`](https://github.com/cloudflare/skills)
- Firebase: [boas práticas do `signInWithRedirect` em navegadores que bloqueiam armazenamento de terceiros](https://firebase.google.com/docs/auth/web/redirect-best-practices) · [login por link de e-mail na web](https://firebase.google.com/docs/auth/web/email-link-auth) · [limites do Auth (5 e-mails por dia no Spark)](https://firebase.google.com/docs/auth/limits) · [preços](https://firebase.google.com/pricing)
- Token do Firebase em Workers: [Firebase Authentication for Cloudflare Workers (DEV)](https://dev.to/mmusket/firebase-authentication-for-cloudflare-workers-1476) · [validar JWT com `jose` (Cloudflare)](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/)
- Safari: [limite de 7 dias do armazenamento (Search Engine Land)](https://searchengineland.com/what-safaris-7-day-cap-on-script-writeable-storage-means-for-pwa-developers-332519) · [fórum da Apple sobre PWA no iOS](https://developer.apple.com/forums/thread/710157)
- PostHog: [PostHog Cloud UE](https://posthog.com/eu)
