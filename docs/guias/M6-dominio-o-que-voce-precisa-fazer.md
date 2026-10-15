# Domínio próprio: o que você precisa fazer

> **Concluído em 15/10/2026.** `ludotrip.app` (produção), `www.ludotrip.app` (leva ao principal) e `staging.ludotrip.app` no ar, com DNSSEC ativo. Conferido com `scripts/smoke-live.mjs`.

O LudoTrip sai dos endereços provisórios (`ludotrip.ludotrip.workers.dev` e `ludotrip-staging.ludotrip.workers.dev`) para um domínio próprio:

- **produção:** `ludotrip.app` (e `www.ludotrip.app`, que leva para o principal);
- **staging:** `staging.ludotrip.app`.

Este guia usa `ludotrip.app`. Se você escolher outro nome no passo 1, troque em todos os passos e me avise.

Feito por mim, sem você: ligar o domínio ao app, publicar staging e produção, trocar as variáveis do GitHub e conferir tudo (login, nuvem, animações).

Feito por você: comprar o domínio e autorizar o endereço novo no Firebase e no Google (passos 2 a 5).

Pesquisado em 15/10/2026 nas fontes do fim da página.

---

## 1. Escolher o nome

| Nome                  | Livre?   | Preço por ano (preço de custo, Cloudflare) | Observação                                                                                           |
| --------------------- | -------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| **`ludotrip.app`** ⭐ | sim      | cerca de US$ 14                            | **Recomendado.** Curto e diz o que é. O `.app` só funciona com HTTPS, que o app já usa.              |
| `ludotrip.io`         | sim      | cerca de US$ 40 a 50                       | Mais caro, sem vantagem para nós.                                                                    |
| `ludotrip.net`        | sim      | cerca de US$ 11                            | Funciona, mas lembra provedor de internet.                                                           |
| `ludotrip.com.br`     | provável | cerca de R$ 40                             | **Não dá pela Cloudflare:** só no Registro.br, e o DNS teria que ser configurado à mão. Mais passos. |
| `ludotrip.com`        | **não**  | —                                          | Já tem dono (registro válido até março de 2027).                                                     |

O preço exato aparece na tela de compra (passo 2.4) e pode variar alguns centavos.

---

## 2. Comprar o domínio na Cloudflare

Use a mesma conta Cloudflare do app: a do Account ID `ea81…d7da0a9`. Comprando lá, o domínio já nasce ligado à conta, e eu consigo apontá-lo para o app.

1. Entre em https://dash.cloudflare.com.
2. **Confirme que o e-mail da conta está verificado.**
   - Clique no ícone de pessoa (canto de cima à direita) → **Meu perfil** (My Profile).
   - Se aparecer um aviso de e-mail não verificado, clique em **Reenviar** e confirme pelo link que chegar.
   - Sem isso, a Cloudflare não deixa registrar, e o órgão que cuida dos domínios (ICANN) suspende o domínio.
3. No menu da esquerda: **Registro de domínio** (Domain Registration) → **Registrar domínios** (Register Domains).
4. Na busca, digite `ludotrip.app` → **Pesquisar** (Search).
   - Se `ludotrip.app` não aparecer na lista, ele não está mais disponível. Me avise antes de escolher outro.
5. No `ludotrip.app`, clique em **Comprar** (Purchase).
6. **Opção de pagamento** (Payment option): **1 ano**.
   - **Renovação automática** (Auto-renew) vem ligada: **deixe ligada**, para o app não sair do ar por esquecimento.
7. **Dados de contato:**
   - **Escreva sem acentos nem "ç".** O sistema só aceita letras simples: `Joao`, `Sao Paulo`, `Rua Sao Joao`.
   - Nome, sobrenome, e-mail, telefone (escolha o código do país **Brasil (+55)** e digite só números), endereço, cidade, estado, país **Brasil** e CEP.
   - Esses dados ficam **ocultos** na consulta pública de domínios (a Cloudflare oculta quando o registro permite).
8. **Pagamento:** escolha o cartão.
   - **Você digita os dados do cartão.** Eu não mexo em pagamento.
9. Leia os termos e clique em **Concluir compra** (Complete purchase). Leva até 30 segundos.
10. Chega um e-mail de confirmação da Cloudflare.
    - **Se chegar também um e-mail pedindo para verificar o contato do domínio, clique no link.** É a verificação do ICANN; sem ela, o domínio fica suspenso.

**Me avise: "comprei o ludotrip.app".** A partir daqui, eu ligo o domínio ao app. Os passos 3 a 5 podem ser feitos enquanto isso, em qualquer ordem.

---

## 3. Firebase: autorizar os endereços novos

O login (Google e link por e-mail) só aceita voltar para endereços autorizados. São dois projetos.

### 3.1 Produção (projeto `ludotrip`)

1. Abra https://console.firebase.google.com → projeto **`ludotrip`**.
2. Menu da esquerda: **Authentication** → aba **Configurações** (Settings) → **Domínios autorizados** → **Adicionar domínio**.
3. Digite, **sem** `https://`: `ludotrip.app` → **Adicionar**.

Não apague os que já estão lá (`ludotrip.ludotrip.workers.dev` continua valendo durante a troca).

### 3.2 Staging (projeto `ludotrip-dev`)

1. No seletor de projetos do topo, troque para **`ludotrip-dev`**.
2. **Authentication** → **Configurações** → **Domínios autorizados** → **Adicionar domínio**.
3. Digite `staging.ludotrip.app` → **Adicionar**.

---

## 4. Google: endereço de volta do login

### 4.1 Produção (projeto `ludotrip`)

1. Abra https://console.cloud.google.com e, no seletor de projetos do topo, escolha **`ludotrip`**.
2. Menu ☰ → **Google Auth Platform** → **Clientes** (Clients).
3. Clique em **Web client (auto created by Google Service)**.
4. Em **URIs de redirecionamento autorizados** → **+ Adicionar URI** → cole:
   `https://ludotrip.app/__/auth/handler`
5. Em **Origens JavaScript autorizadas** → **+ Adicionar URI** → cole:
   `https://ludotrip.app`
6. **Salvar**. Não apague nada que já estiver lá. Pode levar de 5 minutos a algumas horas para valer.

### 4.2 Staging (projeto `ludotrip-dev`)

Repita o 4.1 com o projeto **`ludotrip-dev`**, usando:

- URI de redirecionamento: `https://staging.ludotrip.app/__/auth/handler`
- Origem JavaScript: `https://staging.ludotrip.app`

---

## 5. Segurança do domínio (DNSSEC)

Liga uma assinatura que impede alguém de falsificar o endereço do app. Faça depois que o domínio aparecer na sua conta (passo 2 concluído).

1. https://dash.cloudflare.com → clique no domínio **`ludotrip.app`**.
2. Menu da esquerda: **DNS** → **Configurações** (Settings).
3. Em **DNSSEC**, clique em **Ativar DNSSEC** (Enable DNSSEC) e confirme.
   - Como o domínio foi comprado na própria Cloudflare, ela termina sozinha. Pode aparecer "Pendente" por até um dia.

---

## 6. Me avise

Mande **"passos 2 a 5 feitos"**. Eu confiro tudo no ar e te mando o resultado:

- login com Google e com link por e-mail;
- salvar e abrir viagens na nuvem;
- animações;
- `www` levando para o principal.

---

## Fontes

- [Cloudflare: registrar um domínio novo](https://developers.cloudflare.com/registrar/get-started/register-domain/) (caminho no painel, contatos só com letras simples, verificação ICANN, renovação automática)
- [Cloudflare: domínios próprios para Workers](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) (o app passa a responder no domínio)
- [Firebase: `signInWithRedirect` em navegadores que bloqueiam armazenamento de terceiros](https://firebase.google.com/docs/auth/web/redirect-best-practices) (URI `/__/auth/handler`, domínios autorizados)
- Preços: [tld-list.com, Cloudflare](https://tld-list.com/registrars/cloudflare) e [tldprice.org](https://tldprice.org/registrar/cloudflare) (estimativas; vale o preço da tela de compra)
- Disponibilidade: consulta RDAP em 15/10/2026 (`rdap.org`)
