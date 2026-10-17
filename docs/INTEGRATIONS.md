# Integrações Externas — Proposal AI

Versão 0.1 · 2026-10-17

Relacionados: [ARCHITECTURE.md](ARCHITECTURE.md) §8, §12 · [API_SPEC.md](API_SPEC.md) §4.7–4.9 · [DECISIONS.md](DECISIONS.md) R12, R13, H04, H06, H07

Responsável: Pessoa D (com Pessoa B no adapter de envio).

> **Aviso:** nada neste documento foi testado ainda. Os passos de configuração refletem o comportamento conhecido das APIs do Google e da Meta até a data acima; o primeiro trabalho da Pessoa D é validá-los (T02, T03) e corrigir este documento.

---

## 1. Princípios

1. Adapters em `backend/src/integrations/{gmail,whatsapp}/` não conhecem "proposta"; recebem `ChannelSendRequest` e devolvem `ProviderResult`.
2. `is_configured()` decide, **antes** de qualquer tentativa, se o canal vira `skipped_no_credentials`. Sem exceção engolida, sem `return True` falso.
3. Credenciais só no backend (`.env` / banco). Frontend só vê `configured: bool` e `connected: bool`.
4. Nenhum envio sem `approval_id` válido (verificado em `services/delivery/service.ts`, não no adapter).
5. "Aceito pelo provedor" ≠ "entregue". Gmail para em `sent`; WhatsApp só avança para `delivered`/`read` via webhook.

### Interface comum

```ts
interface ChannelSendRequest {
  recipient: Record<string, string>;   // {email, name} ou {phone, name}
  subject: string | null;
  body_text: string | null;
  attachment_path: string;             // caminho do PDF no FileStorage
  attachment_filename: string;         // "Proposta-Portal-B2B-v2.pdf"
  public_pdf_url: string | null;       // URL alcançável externamente (necessária para WhatsApp por link)
  metadata: Record<string, unknown>;   // delivery_id, channel_id, proposal_version — para logs
}

interface ProviderResult {
  ok: boolean;
  provider_message_id: string | null;
  error: ProviderError | null;         // {code, message, retryable: boolean, raw}
  raw: Record<string, unknown>;
}
```

## 2. Gmail (Google) — OAuth 2.0

### 2.1 Fluxo de autorização

```mermaid
sequenceDiagram
    participant U as Usuário (navegador)
    participant FE as Frontend
    participant API as Backend
    participant G as Google

    U->>FE: Configurações → "Conectar Gmail"
    FE->>API: GET /auth/google/start (link)
    API-->>U: 302 → accounts.google.com/o/oauth2/v2/auth?scope=gmail.send&access_type=offline&prompt=consent&state=…
    U->>G: consente
    G-->>API: GET /auth/google/callback?code=…&state=…
    API->>G: POST oauth2.googleapis.com/token (code → access_token + refresh_token)
    API->>API: grava em oauth_credentials(provider=google)
    API-->>U: 302 → FRONTEND_URL/settings?google=connected
    FE->>API: GET /auth/google/status → {connected: true, account_email}
```

- `state` aleatório gravado em memória/banco e verificado no callback (CSRF).
- `access_type=offline` + `prompt=consent` para garantir `refresh_token` na primeira conexão.
- Refresh automático pelo client da Google antes de cada envio; se o refresh falhar (token revogado) → `ProviderError(code="GMAIL_AUTH_EXPIRED", retryable=False)` e `connected=false` no status.

### 2.2 Permissões mínimas

| Escopo | Uso |
|--------|-----|
| `https://www.googleapis.com/auth/gmail.send` | Único escopo necessário: enviar em nome do usuário conectado. Não lê caixa de entrada. |
| `openid email` (opcional) | Só para exibir `account_email` na UI. Alternativa sem escopo extra: chamar `users.getProfile("me")` — exige `gmail.readonly` ou `gmail.metadata`, então **preferir `openid email`**. |

### 2.3 Configuração no Google Cloud (T02)

1. Criar projeto no Google Cloud Console.
2. **APIs e serviços → Biblioteca** → habilitar **Gmail API**.
3. **Tela de consentimento OAuth**: tipo *Externo*, status *Testing*; adicionar os e-mails do time (e o e-mail que fará a demo) em **Test users**. Em Testing não há revisão da Google; limite de 100 usuários de teste; refresh tokens expiram em 7 dias (suficiente para o hackathon).
4. **Credenciais → ID do cliente OAuth** → tipo *Aplicativo da Web*; **URIs de redirecionamento autorizados**: `http://localhost:8000/api/v1/auth/google/callback` (e a URL do Railway, se houver deploy).
5. Copiar `client_id` / `client_secret` para `.env`.

### 2.4 Formato e envio do anexo

- Monta MIME (via `nodemailer`/`mail-composer`): `From` (conta conectada), `To`, `Subject`, corpo texto (+ HTML simples opcional), anexo `application/pdf` via `attachment: { filename, content, contentType: 'application/pdf' }`.
- Codifica em base64url → `gmail.users.messages.send({ userId: "me", requestBody: { raw } })`.
- Resposta traz `id` (→ `provider_message_id`) e `threadId`.
- Limite de anexo da API: 25 MB — nossos PDFs ficam em < 2 MB.
- Assunto padrão: `Proposta — {title}`; corpo padrão em `templates/email/proposal_email.txt.njk` (editável na tela de envio).

### 2.5 Erros do Gmail

| HTTP / erro | `ProviderError.code` | `retryable` | Mensagem para o usuário |
|-------------|----------------------|-------------|-------------------------|
| sem token | `CHANNEL_NOT_CONFIGURED` | — | "Gmail não conectado. Conecte em Configurações." (canal `skipped_no_credentials`) |
| 401 `invalid_grant` | `GMAIL_AUTH_EXPIRED` | não | "Autorização do Gmail expirou. Reconecte." |
| 403 `insufficientPermissions` | `GMAIL_SCOPE_MISSING` | não | "Permissão de envio não concedida." |
| 400 `invalidArgument` (destinatário) | `GMAIL_RECIPIENT_INVALID` | não | "Endereço de e-mail recusado pelo Gmail." |
| 429 / 403 `rateLimitExceeded` | `GMAIL_RATE_LIMITED` | sim | "Limite temporário do Gmail. Tente novamente em alguns minutos." |
| 5xx | `GMAIL_UNAVAILABLE` | sim | "Gmail indisponível no momento." |

Flag de demo `GMAIL_FORCE_FAIL=true` faz o adapter devolver `GMAIL_UNAVAILABLE` sem chamar a API — usado para demonstrar falha isolada de canal (PRODUCT_SPEC §10).

## 3. WhatsApp Business Platform — Cloud API

### 3.1 Configuração na Meta (T03)

1. Criar app em developers.facebook.com → tipo *Business* → adicionar produto **WhatsApp**.
2. Em **WhatsApp → API Setup**: a Meta fornece um **número de teste** e um **token temporário** (24 h). Anotar `Phone number ID` e `WhatsApp Business Account ID`.
3. Em **To**, adicionar até 5 números de destinatários de teste (exigem verificação por código no celular). **O telefone de quem receberá a proposta na demo precisa estar nessa lista.**
4. Token permanente (opcional, se der tempo): criar *System User* no Business Manager com permissão `whatsapp_business_messaging` e gerar token sem expiração.
5. Copiar `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` para `.env`. Para webhook (P1): `WHATSAPP_VERIFY_TOKEN` (inventado por nós) e `WHATSAPP_APP_SECRET` (do app).

### 3.2 Envio do PDF

Endpoint: `POST https://graph.facebook.com/v{WHATSAPP_API_VERSION}/{PHONE_NUMBER_ID}/messages` com `Authorization: Bearer {TOKEN}`.

**Caminho A — mensagem de documento (dentro da janela de 24 h):**
```json
{
  "messaging_product": "whatsapp",
  "to": "5511999990000",
  "type": "document",
  "document": { "link": "https://<backend-publico>/api/v1/public/pdf/<signed-token>", "filename": "Proposta-Portal-B2B-v2.pdf", "caption": "Proposta Portal de Pedidos B2B" }
}
```
Alternativa sem URL pública: upload via `POST /{PHONE_NUMBER_ID}/media` (multipart) → `media_id` → `"document": {"id": media_id, …}`. **Preferir upload de mídia**: não exige backend exposto na internet.

**Caminho B — template (fora da janela de 24 h):** exige template aprovado com cabeçalho `DOCUMENT`; aprovação pode levar horas → **fora do alcance seguro em 24 h**. Documentado; não implementado no MVP além do payload de exemplo em `integrations/whatsapp/templates.md`.

**Estratégia para a demo (H07):** o destinatário de teste envia qualquer mensagem ao número de teste antes da demo → janela de 24 h aberta → Caminho A funciona.

Resposta de sucesso: `{"messages": [{"id": "wamid.…"}]}` → `provider_message_id`. Isso significa **aceito**, não entregue.

### 3.3 Webhooks (P1)

- Configurar em **WhatsApp → Configuration → Webhook**: URL pública HTTPS (`https://<túnel>/api/v1/webhooks/whatsapp`), `Verify token`, assinar o campo `messages`.
- `GET` de verificação: responder `hub.challenge` se `hub.verify_token == WHATSAPP_VERIFY_TOKEN`.
- `POST`: validar `X-Hub-Signature-256` (HMAC-SHA256 do corpo com `WHATSAPP_APP_SECRET`); percorrer `entry[].changes[].value.statuses[]`:

| `statuses[].status` | Canal → |
|---------------------|---------|
| `sent` | mantém `sent` (confirma) |
| `delivered` | `delivered` + `delivered_at` |
| `read` | `read` |
| `failed` | `failed` com `errors[0].code/title` |

- Em ambiente local sem túnel, o canal fica em `sent` — a UI mostra "Aceito pelo WhatsApp; confirmação de entrega indisponível neste ambiente".

### 3.4 Erros do WhatsApp

| Código Meta | `ProviderError.code` | `retryable` | Mensagem |
|-------------|----------------------|-------------|----------|
| sem token/phone id | `CHANNEL_NOT_CONFIGURED` | — | "WhatsApp não configurado." (canal `skipped_no_credentials` + `alternative.wa_me_link`) |
| 190 | `WA_TOKEN_EXPIRED` | não | "Token do WhatsApp expirou (token de teste dura 24 h)." |
| 131030 | `WA_RECIPIENT_NOT_ALLOWED` | não | "Número não está na lista de destinatários de teste." |
| 131047 / 131026 | `WA_OUTSIDE_24H_WINDOW` | não | "Fora da janela de 24 h; exige template aprovado. Peça ao cliente para enviar uma mensagem primeiro ou use o link alternativo." |
| 131053 | `WA_MEDIA_UPLOAD_FAILED` | sim | "Falha ao enviar o PDF." |
| 130429 | `WA_RATE_LIMITED` | sim | "Limite de envio atingido." |
| 100 (número inválido) | `WA_RECIPIENT_INVALID` | não | "Telefone inválido (use E.164, ex. +5511999990000)." |
| 5xx | `WA_UNAVAILABLE` | sim | "WhatsApp indisponível." |

## 4. Variáveis de ambiente

Arquivo `.env.example` na raiz (sem valores reais). Backend lê via `process.env` validado com Zod (`src/core/config.ts`); frontend só lê `NEXT_PUBLIC_*`.

| Variável | Obrigatória | Padrão | Uso |
|----------|-------------|--------|-----|
| `APP_ENV` | não | `development` | `development` / `production` |
| `DATABASE_URL` | não | `postgresql://proposal:proposal@localhost:5432/proposal` | Fallback: `file:./dev.db` (SQLite) |
| `STORAGE_DIR` | não | `./storage` | Áudio e PDFs |
| `MAX_UPLOAD_MB` | não | `25` | Limite de áudio |
| `JOB_STALE_MINUTES` | não | `15` | Job preso → `failed` |
| `CORS_ORIGINS` | não | `http://localhost:3000` | separado por vírgula |
| `FRONTEND_URL` | não | `http://localhost:3000` | redirect pós-OAuth |
| `BACKEND_PUBLIC_URL` | não | `http://localhost:8000` | montar `redirect_uri` e links |
| `DEMO_MODE` | não | `true` | habilita `X-Demo-User` e flags `*_FORCE_FAIL` |
| `OPENAI_API_KEY` | **sim** | — | |
| `OPENAI_MODEL` | não | `gpt-4.1` *(confirmar H01)* | extração, auditoria, composição |
| `OPENAI_TRANSCRIBE_MODEL` | não | `gpt-4o-transcribe` *(confirmar H01)* | transcrição |
| `OPENAI_TIMEOUT_S` | não | `120` | |
| `GOOGLE_CLIENT_ID` | para Gmail | — | |
| `GOOGLE_CLIENT_SECRET` | para Gmail | — | |
| `GOOGLE_REDIRECT_URI` | não | `{BACKEND_PUBLIC_URL}/api/v1/auth/google/callback` | |
| `GMAIL_FORCE_FAIL` | não | `false` | demo de falha |
| `WHATSAPP_TOKEN` | para WA | — | |
| `WHATSAPP_PHONE_NUMBER_ID` | para WA | — | |
| `WHATSAPP_API_VERSION` | não | `v21.0` *(confirmar)* | |
| `WHATSAPP_VERIFY_TOKEN` | P1 webhook | — | inventado por nós |
| `WHATSAPP_APP_SECRET` | P1 webhook | — | validar assinatura |
| `WHATSAPP_FORCE_FAIL` | não | `false` | demo de falha |
| `NEXT_PUBLIC_API_URL` | **sim (frontend)** | `http://localhost:8000/api/v1` | |

## 5. Estados de envio (recapitulação)

Ver ARCHITECTURE §4 e API_SPEC §3. Transições disparadas pelos adapters:

| Resultado do adapter | Estado do canal | Campos preenchidos |
|----------------------|-----------------|--------------------|
| `is_configured()==False` | `skipped_no_credentials` | `error.code=CHANNEL_NOT_CONFIGURED`, `alternative` |
| `ok=True` | `sent` | `provider_message_id`, `sent_at` |
| `ok=False, retryable=True` | `failed` | `error`, `attempts` — botão retry (P1) |
| `ok=False, retryable=False` | `failed` | `error` — sem retry; usuário corrige dado |
| webhook `delivered`/`read` | `delivered`/`read` | `delivered_at` |
| webhook `failed` | `failed` | `error` |

`alternative` para WhatsApp: `{"type": "wa_me_link", "url": "https://wa.me/<E164 sem +>?text=<mensagem url-encoded>", "pdf_download_url": "…"}` — o usuário pode abrir o WhatsApp Web e anexar manualmente. Para Gmail: `{"type": "mailto_link", "url": "mailto:…?subject=…", "pdf_download_url": "…"}`.

## 6. Requisitos externos que podem impedir o envio no hackathon

| Risco | Probabilidade | Efeito | Mitigação |
|-------|---------------|--------|-----------|
| Tela de consentimento Google exige verificação | baixa (modo Testing dispensa) | Gmail não conecta | Usar Testing + test users (H04); fallback SMTP com app password (requer 2FA na conta Google) |
| Refresh token de app em Testing expira em 7 dias | certa, mas > 24 h | nenhum na demo | reconectar se necessário |
| Token de teste WhatsApp expira em 24 h | alta | WA falha no dia seguinte | gerar novo token antes da demo; ou System User token |
| Destinatário não está na lista de teste | média | `131030` | cadastrar telefone do demonstrador na hora 0 |
| Janela de 24 h fechada | média | `131047` | destinatário manda "oi" antes da demo (H07) |
| Conta Meta Business exige verificação para número real | alta | sem número próprio | usar número de teste da Meta |
| Sem URL pública para webhook | certa em local | sem `delivered` | aceitar `sent` como estado final local; túnel só se P1 |
| Rede do evento bloqueia OAuth popup/redirect | baixa | Gmail não conecta | conectar antes da demo em casa; token fica no banco |

## 7. Plano alternativo para a demonstração

Ordem de preferência, decidida até **H+12**:

1. **Gmail real + WhatsApp real** (número de teste, janela aberta). Ideal.
2. **Gmail real + WhatsApp `skipped_no_credentials`** com link `wa.me` demonstrado ao vivo abrindo o WhatsApp Web com a mensagem pré-preenchida. Honesto e visual.
3. **Gmail via SMTP (app password)** se OAuth travar — adapter alternativo `GmailSmtpAdapter` com a mesma interface; a UI exibe "Gmail (SMTP)" para não fingir OAuth.
4. **Nenhum canal com credenciais:** ambos `skipped_no_credentials`; a demo foca em aprovação, idempotência e estados, e mostra os links alternativos + download do PDF. Narrativa: "arquitetura pronta; credenciais são configuração".

Em todos os casos, a demo de **falha isolada** usa `GMAIL_FORCE_FAIL=true` ou `WHATSAPP_FORCE_FAIL=true` para mostrar um canal `failed` enquanto o outro permanece `sent`, sem alterar a proposta aprovada e sem duplicar envio no replay.
