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

Vamos criar **dois projetos**:

- `ludotrip-dev`, para os testes;
- `ludotrip`, para o público.

Repita os passos 2.1 a 2.4 para cada um. O 2.5 é só para o `ludotrip`.

### 2.1 Criar o projeto

1. Entre em https://console.firebase.google.com → **Criar um projeto** (ou **Create a project** / **Get started with a Firebase project**).
2. Nome: `ludotrip-dev`. Aceite o id sugerido ou ajuste para `ludotrip-dev`. → **Continuar**.
3. **Gemini / Assistência de IA no Firebase:** pode desligar. → **Continuar**.
4. **Google Analytics:** **desligue** (não vamos usar). → **Criar projeto** → espere → **Continuar**.

### 2.2 Registrar o app web

1. Na página inicial do projeto, clique no ícone **`</>`** (Web). Se não aparecer: ⚙️ **Configurações do projeto** → **Geral** → **Seus apps** → **Adicionar app** → **Web**.
2. **Apelido do app:** `web`. **Não** marque "Configurar o Firebase Hosting". → **Registrar app**.
3. Aparece um bloco `const firebaseConfig = { apiKey: ..., authDomain: ..., projectId: ..., appId: ... }`.
   - 📋 Copie os valores de `apiKey`, `projectId`, `appId` e `messagingSenderId` e me mande.
   - Esses valores são **públicos** por natureza: vão para o site de qualquer jeito.
4. Clique em **Continuar no console**.

### 2.3 Ligar os métodos de login

1. Menu da esquerda: **Criação** (Build) → **Authentication** → **Vamos começar** (Get started).
2. Aba **Método de login** (Sign-in method).
3. **Google:**
   1. clique em **Google** → ligue **Ativar**;
   2. **Nome do projeto exibido** (public-facing name): `LudoTrip`;
   3. **E-mail de suporte:** o seu;
   4. **Salvar**.
4. **Link por e-mail:**
   1. clique em **Adicionar novo provedor** → **E-mail/senha**;
   2. ligue o **primeiro** botão, **E-mail/senha**. O link por e-mail depende dele; o app não vai mostrar campo de senha;
   3. ligue o **segundo**, **Link do e-mail (login sem senha)**;
   4. **Salvar**.

### 2.4 Domínios autorizados

1. Ainda em **Authentication** → aba **Configurações** (Settings) → **Domínios autorizados** → **Adicionar domínio**.
2. Adicione o domínio do ambiente, **sem** `https://`:
   - **em `ludotrip-dev`:** `ludotrip-staging.SEU-SUBDOMINIO.workers.dev`, com o subdomínio do passo 1.2;
   - **em `ludotrip`:** `ludotrip.SEU-SUBDOMINIO.workers.dev`. O domínio próprio entra no M6.
3. Clique em **Adicionar**.

**Endereço de volta do login do Google** (necessário para o login funcionar no iPhone):

1. Abra https://console.cloud.google.com e, no seletor de projetos no topo, escolha `ludotrip-dev`.
2. Menu ☰ → **Google Auth Platform** → **Clientes** (Clients). Em contas antigas: **APIs e serviços** → **Credenciais**.
3. Clique em **Web client (auto created by Google Service)**.
4. Em **URIs de redirecionamento autorizados**, clique em **+ Adicionar URI** e cole:
   `https://ludotrip-staging.SEU-SUBDOMINIO.workers.dev/__/auth/handler`.
5. Em **Origens JavaScript autorizadas**, clique em **+ Adicionar URI** e cole:
   `https://ludotrip-staging.SEU-SUBDOMINIO.workers.dev`.
6. Clique em **Salvar**. Pode levar de 5 minutos a algumas horas para valer.
7. Repita no projeto `ludotrip`, com `ludotrip.SEU-SUBDOMINIO.workers.dev`.
8. Não apague nada que já estiver lá.
9. Ainda em **Google Auth Platform** → **Branding** (Marca), confira:
   - **Nome do app:** `LudoTrip`;
   - **E-mail de suporte:** o seu.

   É o que aparece na tela "Escolha uma conta".

### 2.5 Plano Blaze e alerta de orçamento (só no `ludotrip`)

**Por quê:** no plano grátis, o login por link de e-mail é limitado a **5 e-mails por dia**. No Blaze o limite é 25 mil por dia. O login continua grátis até 50 mil pessoas ativas por mês, e não vamos ligar nenhum outro produto pago.

1. No console do Firebase, projeto `ludotrip`. No canto inferior esquerdo aparece **Spark** / **Plano sem custo** → **Fazer upgrade** (Upgrade).
2. Escolha **Blaze**. Selecione ou crie uma conta de faturamento do Google Cloud com o seu cartão. → **Continuar**.
3. O Firebase oferece **criar um orçamento**. Coloque **US$ 1** e confirme.
   - Se não oferecer: https://console.cloud.google.com/billing → a conta de faturamento → **Orçamentos e alertas** → **Criar orçamento**.
   - Escopo: projeto `ludotrip`. Valor: US$ 1. Alertas: 50%, 90% e 100%. **Concluir**.
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

- [ ] Subdomínio `*.workers.dev` e Account ID (1.2)
- [ ] `npx wrangler login` feito (1.4)
- [ ] `firebaseConfig` do `ludotrip-dev` e do `ludotrip`: `apiKey`, `projectId`, `appId`, `messagingSenderId` (2.2)
- [ ] Google e Link do e-mail ligados nos dois (2.3)
- [ ] Domínios e URIs de redirecionamento adicionados nos dois (2.4)
- [ ] `ludotrip` no Blaze com orçamento de US$ 1 (2.5)
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
