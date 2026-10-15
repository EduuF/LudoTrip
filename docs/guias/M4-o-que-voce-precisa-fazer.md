# M4 — O que você precisa fazer

- **Pesquisado em:** 2026-10-14. As fontes estão no fim.
- **Tempo:** cerca de 45 minutos.
- **Custo:** US$ 5/mês (Workers Paid). Firebase, Sentry e PostHog ficam no grátis.

Os painéis mudam de vez em quando. Se um botão estiver com outro nome, procure o equivalente mais próximo e me avise, que eu atualizo o guia.

**Nunca cole tokens ou senhas no chat.**

- Vão **só** para os secrets do GitHub (passo 6).
- Para mim, você manda só os valores públicos marcados com 📋.

Pode fazer em qualquer ordem, mas esta é a mais rápida: o endereço da Cloudflare (passo 1) é usado no Firebase (passo 2).

---

## 1. Cloudflare

### 1.1 Assinar o Workers Paid (US$ 5/mês)

1. Entre em https://dash.cloudflare.com com a sua conta.
2. No menu da esquerda: **Compute (Workers)** → **Workers & Pages**. Em contas antigas, o item se chama só **Workers & Pages**.
3. No canto direito da página, em **Plans** (ou **Workers plans**), clique em **Upgrade** / **Change plan**.
4. Escolha **Workers Paid** → **Purchase** / **Confirm**, com o cartão já cadastrado na conta.

### 1.2 Ver o subdomínio e o Account ID

1. Ainda em **Workers & Pages**, na coluna da direita, aparece **Subdomain**: `algo.workers.dev`.
   - Se pedir para escolher, use algo neutro, como `ludotrip`. Ele aparece na URL de teste.
   - 📋 Me mande o subdomínio.
2. Na mesma coluna: **Account ID** → clique para copiar. 📋 Me mande também (não é segredo).

### 1.3 Criar o token para o GitHub publicar

1. Canto superior direito: o ícone da sua conta → **Profile** → **API Tokens**. Você também pode clicar em **Manage account** → **Account API Tokens**.
2. Clique em **Create Token**.
3. Na linha **Edit Cloudflare Workers**, clique em **Use template**.
4. Em **Permissions**, clique em **+ Add more** e acrescente:
   - **Account** · **D1** · **Edit**.
5. Em **Account Resources**: **Include** → a sua conta, e não "All accounts".
6. Em **Zone Resources**: **Include** → **All zones from an account** → a sua conta.
7. Clique em **Continue to summary** → **Create Token**.
8. **Copie o token agora**, porque ele não aparece de novo. Guarde para o passo 6.

### 1.4 Deixar o Wrangler entrar na sua conta (para eu criar o banco)

No terminal do VS Code ou do PowerShell, dentro da pasta `LudoTrip`, rode:

```bash
npx wrangler login
```

- O navegador abre a página "Wrangler is requesting access". Confira que é a sua conta e clique em **Allow**.
- O terminal mostra "Successfully logged in".

Com isso, eu crio o banco D1 e os Workers daqui do seu computador. Você pode revogar quando quiser com `npx wrangler logout`.

### 1.5 Aviso de uso (para nunca levar susto)

1. Canto superior direito: **Notifications** (ícone de sino). Você também pode chegar por **Manage account** → **Notifications**.
2. Clique em **Add**.
3. Procure **Usage Based Billing** e clique em **Select**.
4. Produto **Workers**. Em limite, use o que o painel oferecer (por exemplo "50% do incluído"). Use o seu e-mail.
5. Clique em **Save**.

---

## 2. Firebase (só o login)

São **dois projetos**, cada um com os passos por extenso:

- `ludotrip-dev`, para os testes (staging): passos 2.1 a 2.4. ✅ **Feito.**
- `ludotrip`, para o público: passo 2.5, com tudo, inclusive o plano Blaze. **Continue daqui.**

### 2.1 a 2.4: projeto `ludotrip-dev` ✅

Já concluído:

- app web registrado (config recebida);
- Google e link por e-mail ligados;
- domínio autorizado `ludotrip-staging.ludotrip.workers.dev`;
- no Google Cloud (projeto `ludotrip-dev`, Google Auth Platform → Clientes → Web client): URI `https://ludotrip-staging.ludotrip.workers.dev/__/auth/handler` e origem `https://ludotrip-staging.ludotrip.workers.dev`.

Se ainda não conferiu, falta só isto: Google Cloud, projeto `ludotrip-dev` → **Google Auth Platform** → **Branding** (Marca) → **Nome do app** `LudoTrip` e **E-mail de suporte**, o seu → **Salvar**.

### 2.5 Projeto de produção `ludotrip` (você o criou no Google Cloud)

O projeto `ludotrip` existe no Google Cloud, mas ainda **não tem o Firebase**. Por isso o Google Auth Platform mostra "Google Auth Platform not configured yet". **Não clique em "Get started" lá:** quem configura isso é o Firebase, no passo 2.5.3. Configurar à mão cria uma tela de consentimento separada, que depois precisa ser corrigida.

#### 2.5.1 Ligar o Firebase ao projeto do Google Cloud

1. Entre em https://console.firebase.google.com.
2. Clique em **Criar um projeto** (ou **Adicionar projeto** / **Create a project**).
3. Na tela "Insira o nome do projeto", **não digite um nome novo**. Abaixo do campo, clique no link **"Adicionar o Firebase a um projeto do Google Cloud"** (em inglês: _Add Firebase to Google Cloud project_).
4. Na lista que aparece, escolha **`ludotrip`**.
5. Marque a aceitação dos termos (se aparecer) → **Continuar**.
6. Se aparecer uma tela sobre o plano de cobrança, mantenha o atual por enquanto: o Blaze entra no 2.5.6.
7. **Gemini / Assistência de IA no Firebase:** pode desligar → **Continuar**.
8. **Google Analytics:** **desligue** → **Adicionar o Firebase** (ou **Continuar**).
9. Espere terminar → **Continuar**. O projeto `ludotrip` abre no console do Firebase.

#### 2.5.2 Registrar o app web

1. Na página inicial do projeto `ludotrip`, clique no ícone **`</>`** (Web). Se não aparecer: ⚙️ **Configurações do projeto** → **Geral** → **Seus apps** → **Adicionar app** → **Web**.
2. **Apelido do app:** `web`. **Não** marque "Configurar o Firebase Hosting" → **Registrar app**.
3. Aparece o bloco `const firebaseConfig = { ... }`. 📋 Me mande `apiKey`, `projectId`, `appId` e `messagingSenderId`.
   - Confira se o `projectId` é **exatamente** `ludotrip`. Se for outro (por exemplo `ludotrip-12345`), me avise, que eu ajusto do meu lado.
4. **Continuar no console**.

#### 2.5.3 Ligar os métodos de login

1. Menu da esquerda: **Criação** (Build) → **Authentication** → **Vamos começar** (Get started).
2. Aba **Método de login** (Sign-in method).
3. **Google:**
   1. clique em **Google** → ligue **Ativar**;
   2. **Nome do projeto exibido** (public-facing name): `LudoTrip`;
   3. **E-mail de suporte:** o seu;
   4. **Salvar**.

   É **este passo** que configura o Google Auth Platform: ele cria a tela "Escolha uma conta" e o cliente "Web client (auto created by Google Service)".

4. **Link por e-mail:**
   1. **Adicionar novo provedor** → **E-mail/senha**;
   2. ligue o **primeiro** botão, **E-mail/senha** (o app não mostra campo de senha);
   3. ligue o **segundo**, **Link do e-mail (login sem senha)**;
   4. **Salvar**.

#### 2.5.4 Domínio autorizado

1. Ainda em **Authentication** → aba **Configurações** (Settings) → **Domínios autorizados** → **Adicionar domínio**.
2. Digite, **sem** `https://`: `ludotrip.ludotrip.workers.dev` → **Adicionar**.

#### 2.5.5 Endereço de volta do login do Google

1. Abra https://console.cloud.google.com e, no seletor de projetos no topo, escolha **`ludotrip`**.
2. Menu ☰ → **Google Auth Platform** → **Clientes** (Clients).
   - Se ainda aparecer "Google Auth Platform not configured yet", espere uns minutos depois do 2.5.3 e recarregue a página. Não clique em "Get started".
3. Clique em **Web client (auto created by Google Service)**.
4. Em **URIs de redirecionamento autorizados** → **+ Adicionar URI** → cole:
   `https://ludotrip.ludotrip.workers.dev/__/auth/handler`
5. Em **Origens JavaScript autorizadas** → **+ Adicionar URI** → cole:
   `https://ludotrip.ludotrip.workers.dev`
6. **Salvar**. Não apague nada que já estiver lá. Pode levar de 5 minutos a algumas horas para valer.
7. Ainda em **Google Auth Platform** → **Branding** (Marca): **Nome do app** `LudoTrip`, **E-mail de suporte**, o seu → **Salvar**. É o que aparece na tela "Escolha uma conta".

#### 2.5.6 Plano Blaze e alerta de orçamento

**Por quê:** no plano grátis, o login por link de e-mail é limitado a **5 e-mails por dia**. No Blaze o limite é 25 mil por dia. O login continua grátis até 50 mil pessoas ativas por mês, e não vamos ligar nenhum outro produto pago.

1. No console do Firebase, projeto `ludotrip`. No canto inferior esquerdo aparece **Spark** / **Plano sem custo** → **Fazer upgrade** (Upgrade).
2. Escolha **Blaze**. Selecione ou crie uma conta de faturamento do Google Cloud com o seu cartão → **Continuar**.
   - Se o projeto já estiver ligado a uma conta de faturamento (porque foi criado no Google Cloud), basta confirmar.
3. O Firebase oferece **criar um orçamento**: coloque **US$ 1** e confirme.
   - Se não oferecer: https://console.cloud.google.com/billing → a conta de faturamento → **Orçamentos e alertas** → **Criar orçamento**.
   - Escopo: projeto `ludotrip`. Valor: US$ 1. Alertas: 50%, 90% e 100% → **Concluir**.
   - É só um aviso por e-mail: não para nada. Se chegar um, me avise.

---

## 3. Sentry (erros no celular)

1. Crie a conta em https://sentry.io/signup/. Pode entrar com o GitHub. Plano **Developer** (grátis).
2. Ao criar a organização, escolha a região de dados **European Union (EU)** se aparecer a opção.
3. **Create Project:**
   - plataforma **React**;
   - alerta: **Alert me on every new issue**;
   - nome do projeto: `ludotrip`;
   - **Create Project**.
4. Na tela de instalação, copie o **DSN** (`https://...@...ingest...sentry.io/...`). 📋 Me mande. É público, vai no site.
5. 📋 Me mande também o **slug da organização** (aparece na URL, `sentry.io/organizations/ESTE-AQUI/`) e o do projeto (`ludotrip`).
6. Token para enviar os mapas de código:
   1. ⚙️ **Settings** → **Developer Settings** → **Organization Tokens** (ou **Auth Tokens**) → **Create New Token**;
   2. nome: `github-ludotrip` → **Create**;
   3. copie o token e guarde para o passo 6.

## 4. PostHog (métricas de uso)

1. Crie a conta em https://eu.posthog.com/signup. É o endereço **eu**: os dados ficam na União Europeia.
2. Organização e projeto: `LudoTrip`. Pule o assistente de instalação (**Skip** / **I'll do this later**).
3. ⚙️ **Settings** → **Project** → **General** (ou **Project API key**): copie a **Project API key** (`phc_...`). 📋 Me mande. É pública.
4. **Settings** → **Session replay**: ligue **Record user sessions**. Em **Privacy**, deixe **Mask all text** / **Mask all inputs** ligados. O app também força isso no código.

## 5. Monitor de disponibilidade

Fica para o M6, quando houver o domínio de verdade.

## 6. Secrets no GitHub

1. Abra https://github.com/EduuF/LudoTrip → **Settings** → **Secrets and variables** → **Actions**.
2. Aba **Secrets** → **New repository secret**, um por vez:

   | Name                    | Valor                     |
   | ----------------------- | ------------------------- |
   | `CLOUDFLARE_API_TOKEN`  | o token do passo 1.3      |
   | `CLOUDFLARE_ACCOUNT_ID` | o Account ID do passo 1.2 |
   | `SENTRY_AUTH_TOKEN`     | o token do passo 3.6      |

3. As **variables** com os valores públicos (Firebase, PostHog, DSN), deixe comigo: eu crio com o `gh` depois que você me mandar os 📋.

---

## Checklist para me mandar (só valores públicos)

- [x] Subdomínio (`ludotrip.workers.dev`) e Account ID (1.2)
- [ ] `npx wrangler login` feito (1.4)
- [x] `firebaseConfig` do `ludotrip-dev` (2.1–2.4)
- [ ] `firebaseConfig` do `ludotrip`: `apiKey`, `projectId`, `appId`, `messagingSenderId` (2.5.2)
- [ ] `ludotrip`: Google e Link do e-mail ligados, domínio e URI de redirecionamento (2.5.3–2.5.5)
- [ ] `ludotrip` no Blaze com orçamento de US$ 1 (2.5.6)
- [ ] Sentry: DSN, slug da organização e do projeto (3)
- [ ] PostHog: Project API key (4)
- [ ] 3 secrets no GitHub (6)

## Fontes (consultadas em 2026-10-14)

- [Firebase: limites do Authentication](https://firebase.google.com/docs/auth/limits) (5 e-mails de link por dia no Spark; 25 mil no Blaze)
- [Firebase: preços](https://firebase.google.com/pricing)
- [Firebase: login por link de e-mail na web](https://firebase.google.com/docs/auth/web/email-link-auth)
- [Firebase: `signInWithRedirect` em navegadores que bloqueiam armazenamento de terceiros](https://firebase.google.com/docs/auth/web/redirect-best-practices) (proxy `/__/auth`, URI `/__/auth/handler`)
- [Firebase: alertas de orçamento](https://firebase.google.com/docs/projects/billing/budget-alerts)
- [Google Cloud: configurar clientes OAuth](https://support.google.com/cloud/answer/15549257)
- [Cloudflare: GitHub Actions e token "Edit Cloudflare Workers"](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Cloudflare: preços dos Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [PostHog: rastreamento sem cookies e consentimento](https://posthog.com/docs/privacy/cookieless-tracking)
