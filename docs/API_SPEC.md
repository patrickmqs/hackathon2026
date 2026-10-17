# Especificação da API — Proposal AI

Versão 0.1 · 2026-10-17 · Base URL local: `http://localhost:8000/api/v1`

Relacionados: [ARCHITECTURE.md](ARCHITECTURE.md) · [AI_PIPELINE.md](AI_PIPELINE.md) (schemas `MeetingAnalysis`, `ProposalContent`) · exemplos em [examples/](examples/)

Este documento é o **contrato entre frontend e backend**. Alterações devem ser feitas aqui primeiro, depois no código. O backend expõe OpenAPI em `/docs`; em caso de divergência, este documento prevalece até a implementação ser corrigida.

---

## 1. Convenções

- JSON UTF-8; datas em ISO 8601 UTC (`2026-10-17T14:03:00Z`); IDs são UUID v4 em string.
- Paginação simples: `?limit=20&offset=0` → resposta `{ "items": [...], "total": n }`.
- Operações demoradas retornam `202 Accepted` com o recurso em estado intermediário; o frontend faz polling no `GET` correspondente.
- **Identidade (modo demo):** header `X-Demo-User: <nome>` é **obrigatório** em: `PUT /analysis`, `POST /analysis/complete-review`, `POST /proposals`, `POST /versions`, `POST /approve`, `POST /deliveries`, `POST /retry`. Ausência → `401 DEMO_USER_REQUIRED`. Isso é rastreabilidade, não autenticação (ver DECISIONS R03).
- CORS: `CORS_ORIGINS` (padrão `http://localhost:3000`).

## 2. Formato padrão de erro

Todas as respostas de erro:

```json
{
  "error": {
    "code": "PROPOSAL_VERSION_IMMUTABLE",
    "message": "A versão 2 já foi aprovada e não pode ser editada. Crie uma nova versão.",
    "details": { "proposal_id": "…", "version": 2 },
    "request_id": "req_01J…"
  }
}
```

| HTTP | `code` | Quando |
|------|--------|--------|
| 400 | `VALIDATION_ERROR` | Corpo/query inválido (detalhes Pydantic em `details.errors`) |
| 400 | `UPLOAD_INVALID` | Tipo de arquivo não permitido ou tamanho > `MAX_UPLOAD_MB` |
| 400 | `MEETING_INPUT_REQUIRED` | Nem áudio nem transcrição fornecidos |
| 401 | `DEMO_USER_REQUIRED` | Header `X-Demo-User` ausente em operação que exige ator |
| 404 | `NOT_FOUND` | Recurso inexistente (`details.resource`, `details.id`) |
| 409 | `MEETING_NOT_READY` | Análise ainda não está `analysis_ready` |
| 409 | `ANALYSIS_REVIEW_INCOMPLETE` | Tentativa de gerar proposta sem `review_completed` |
| 409 | `ANALYSIS_LOCKED` | Tentativa de editar análise após proposta gerada (precisa reabrir — P1) |
| 409 | `PROPOSAL_VERSION_IMMUTABLE` | Edição de versão existente |
| 409 | `PROPOSAL_HASH_MISMATCH` | Hash enviado na aprovação ≠ hash da versão |
| 409 | `PROPOSAL_ALREADY_APPROVED` | Versão já aprovada |
| 409 | `APPROVAL_REQUIRED` | Delivery sem `approval_id` válido / versão não aprovada |
| 409 | `APPROVAL_SUPERSEDED` | `approval_id` aponta para versão `superseded` |
| 409 | `IDEMPOTENCY_CONFLICT` | Mesma `idempotency_key` com payload diferente |
| 409 | `CHANNEL_NOT_RETRYABLE` | Retry em canal que não está `failed` |
| 422 | `RECIPIENT_INVALID` | E-mail/telefone inválido para o canal escolhido |
| 500 | `AI_PROVIDER_ERROR` | Falha não recuperável na OpenAI |
| 500 | `AI_PROVIDER_NOT_CONFIGURED` | `OPENAI_API_KEY` ausente |
| 500 | `PDF_RENDER_FAILED` | Playwright falhou |
| 500 | `INTERNAL_ERROR` | Qualquer outra |

Replay idempotente **não** é erro: `POST /deliveries` com chave já usada e mesmo payload → `200` com o delivery existente.

## 3. Estados (enums compartilhados)

```ts
type MeetingStatus   = "created" | "transcribing" | "analyzing" | "analysis_ready" | "reviewed" | "failed";
type ReviewStatus    = "pending" | "confirmed" | "edited" | "rejected" | "needs_clarification";
type VersionStatus   = "draft" | "approved" | "superseded";
type DeliveryStatus  = "authorized" | "in_progress" | "completed" | "partially_failed" | "failed";
type ChannelStatus   = "queued" | "sending" | "sent" | "delivered" | "read" | "failed" | "skipped_no_credentials";
type Channel         = "gmail" | "whatsapp";
```

## 4. Endpoints

### 4.1 Saúde e configuração

#### `GET /health`
Resposta `200`:
```json
{ "status": "ok", "db": "ok", "ai_configured": true, "channels": { "gmail": "configured", "whatsapp": "not_configured" } }
```
O frontend usa `channels` para exibir, antes do envio, quais canais estão operacionais.

---

### 4.2 Projetos

#### `POST /projects`
```json
{
  "name": "Portal de Pedidos B2B",
  "description": "Plataforma de pedidos para distribuidores",
  "client": {
    "company": "Distribuidora Horizonte Ltda (fictícia)",
    "contact_name": "Ana Souza",
    "contact_email": "ana@example.com",
    "contact_phone": "+5511999990000"
  }
}
```
`201` → `Project`:
```json
{
  "id": "uuid", "name": "…", "description": "…", "client": { … },
  "status": "no_meeting",
  "latest_meeting_id": null, "latest_proposal_id": null,
  "created_at": "…", "updated_at": "…"
}
```
`status` do projeto é derivado: `no_meeting | processing | analysis_ready | reviewed | proposal_draft | proposal_approved | sent | failed`.

#### `GET /projects?limit&offset` → `200 { items: Project[], total }`
#### `GET /projects/{project_id}` → `200 Project`

---

### 4.3 Reuniões

#### `POST /projects/{project_id}/meetings`
Dois formatos aceitos (um ou outro, não ambos):

**(a) JSON — transcrição textual**
```json
{ "title": "Reunião de descoberta 14/10", "transcript_text": "Ana: Hoje nossos pedidos chegam por WhatsApp e planilha…", "language": "pt-BR" }
```

**(b) `multipart/form-data` — áudio**
- `title` (text, opcional)
- `audio` (file; `audio/mpeg`, `audio/mp4`, `audio/x-m4a`, `audio/wav`, `audio/webm`; ≤ `MAX_UPLOAD_MB`)
- `language` (text, opcional; hint para transcrição)

`202` → `Meeting`:
```json
{
  "id": "uuid", "project_id": "uuid", "title": "…",
  "source_type": "audio",
  "status": "transcribing",
  "progress": { "step": "transcribing", "message": "Transcrevendo áudio (0:00 / 7:42)…", "started_at": "…" },
  "transcript": null,
  "error": null,
  "created_at": "…", "updated_at": "…"
}
```
Erros: `400 UPLOAD_INVALID`, `400 MEETING_INPUT_REQUIRED`, `404`.

#### `GET /meetings/{meeting_id}` → `200 Meeting`
Quando `status ∈ {analysis_ready, reviewed}`, `transcript` está preenchido:
```json
"transcript": {
  "text": "…texto completo…",
  "segments": [ { "id": "s001", "start_ms": 0, "end_ms": 5400, "speaker": "SPEAKER_1", "text": "…" } ],
  "metadata": { "language": "pt-BR", "duration_ms": 462000, "has_speakers": false, "has_timestamps": true, "provider": "openai", "model": "gpt-4o-transcribe" }
}
```
`segments` pode ser `[]` para entrada textual sem marcação. Quando `status = failed`, `error = { "code": "AI_PROVIDER_ERROR", "message": "…" }`.

#### `POST /meetings/{meeting_id}/reprocess`
Reexecuta a análise (e transcrição, se áudio e transcrição ausente). Só permitido em `failed`, `analysis_ready` ou `reviewed` (substitui a análise — a UI pede confirmação). `202 Meeting`.

---

### 4.4 Análise

#### `GET /meetings/{meeting_id}/analysis`
`200` → `MeetingAnalysis` (schema completo em AI_PIPELINE §3; exemplo em [examples/analysis.example.json](examples/analysis.example.json)).
`409 MEETING_NOT_READY` se status anterior a `analysis_ready`.

#### `PUT /meetings/{meeting_id}/analysis` · requer `X-Demo-User`
Substitui o conteúdo revisado. O corpo é o `MeetingAnalysis` completo; o backend:
- preserva `meta` original e grava `meta.reviewed_by`, `meta.reviewed_at`;
- aceita alterações em texto dos itens e em `review_status`/`reviewer_note`;
- rejeita se `review_completed` já é `true` e existe proposta (`409 ANALYSIS_LOCKED`).

`200 MeetingAnalysis`.

#### `POST /meetings/{meeting_id}/analysis/complete-review` · requer `X-Demo-User`
Marca `review_completed=true`, `Meeting.status=reviewed`. Valida que nenhum item está `pending` (ou aceita `{ "accept_pending_as_confirmed": true }` para a demo). `200 MeetingAnalysis`.

---

### 4.5 Propostas

#### `POST /projects/{project_id}/proposals` · requer `X-Demo-User`
```json
{ "meeting_id": "uuid", "options": { "include_demo_rates": true, "language": "pt-BR" } }
```
Exige `analysis.review_completed`. Executa estimativa + composição (síncrono, alvo < 30 s; se exceder, mudar para `202` + polling — ver DECISIONS R01).
`201` → `Proposal`:
```json
{
  "id": "uuid", "project_id": "uuid", "meeting_id": "uuid",
  "status": "draft",
  "current_version": 1,
  "approved_version": null,
  "versions": [ { "number": 1, "status": "draft", "content_hash": "sha256:…", "created_by": "Marina", "created_at": "…", "pdf": null } ],
  "created_at": "…"
}
```
Erros: `409 ANALYSIS_REVIEW_INCOMPLETE`, `500 AI_PROVIDER_ERROR`.

#### `GET /proposals/{proposal_id}` → `200 Proposal` (resumo de versões, sem `content`).
#### `GET /proposals/{proposal_id}/versions/{n}` → `200 ProposalVersion`:
```json
{
  "proposal_id": "uuid", "number": 2, "status": "approved",
  "content": { …ProposalContent… },
  "content_hash": "sha256:…",
  "created_by": "Marina", "created_at": "…",
  "approval": { "id": "uuid", "approved_by": "Rafael", "approved_at": "…", "note": "OK para envio" },
  "pdf": { "url": "/api/v1/proposals/{id}/versions/2/pdf", "generated_at": "…", "size_bytes": 184233 }
}
```
`n` aceita `latest`.

#### `POST /proposals/{proposal_id}/versions` · requer `X-Demo-User`
Cria nova versão a partir de um `ProposalContent` completo (o frontend envia o conteúdo editado inteiro — sem PATCH parcial no MVP).
```json
{ "base_version": 1, "content": { …ProposalContent… }, "change_note": "Ajustei escopo do módulo de pagamentos" }
```
`201 ProposalVersion` (número = `current_version + 1`, `status=draft`). `base_version` é informativo (auditoria); não há merge.
Erros: `400 VALIDATION_ERROR` (schema), `409 PROPOSAL_VERSION_IMMUTABLE` não se aplica aqui (sempre cria nova) — aplica-se se o cliente tentar `PUT /versions/{n}`, que **não existe**.

#### `POST /proposals/{proposal_id}/versions/{n}/pdf`
Gera (ou regenera) o PDF da versão. Síncrono (alvo < 10 s). `200`:
```json
{ "url": "/api/v1/proposals/{id}/versions/2/pdf", "generated_at": "…", "size_bytes": 184233, "content_hash": "sha256:…" }
```
`500 PDF_RENDER_FAILED`.

#### `GET /proposals/{proposal_id}/versions/{n}/pdf`
Retorna `application/pdf` (inline; `?download=1` → attachment). Se nunca gerado, gera sob demanda. `404` se versão não existe.

---

### 4.6 Aprovação

#### `POST /proposals/{proposal_id}/versions/{n}/approve` · requer `X-Demo-User`
```json
{ "content_hash": "sha256:…", "note": "Revisado com o cliente por telefone" }
```
O frontend envia o `content_hash` que exibiu ao usuário — garante que ele aprovou exatamente o que viu. Backend: hash confere → cria `Approval`, versão `approved`, versão anteriormente aprovada → `superseded`, `Proposal.approved_version = n`.
`201`:
```json
{ "id": "uuid", "proposal_id": "uuid", "version": 2, "content_hash": "sha256:…", "approved_by": "Rafael", "approved_at": "…", "note": "…" }
```
Erros: `409 PROPOSAL_HASH_MISMATCH`, `409 PROPOSAL_ALREADY_APPROVED`, `401`.

---

### 4.7 Envio

#### `POST /deliveries` · requer `X-Demo-User`
```json
{
  "approval_id": "uuid",
  "idempotency_key": "4f7c…-client-generated-uuid",
  "channels": [
    { "channel": "gmail",    "recipient": { "email": "ana@example.com", "name": "Ana Souza" },
      "options": { "subject": "Proposta — Portal de Pedidos B2B", "body_text": "Olá Ana, segue a proposta conforme conversamos." } },
    { "channel": "whatsapp", "recipient": { "phone": "+5511999990000", "name": "Ana Souza" },
      "options": { "caption": "Proposta Portal de Pedidos B2B (PDF)" } }
  ]
}
```
Regras:
- `approval_id` deve apontar para versão `approved` (não `superseded`) → senão `409 APPROVAL_REQUIRED` / `409 APPROVAL_SUPERSEDED`.
- `idempotency_key` repetida com payload igual → `200` com o delivery existente; payload diferente → `409 IDEMPOTENCY_CONFLICT`.
- Canal sem credenciais **não** rejeita a requisição: o canal é criado já em `skipped_no_credentials`.
- Destinatário inválido para o canal → `422 RECIPIENT_INVALID` (requisição inteira rejeitada, nada enviado).
- Envio é disparado em background; resposta `202`.

`202` → `Delivery`:
```json
{
  "id": "uuid",
  "approval_id": "uuid", "proposal_id": "uuid", "proposal_version": 2,
  "idempotency_key": "…",
  "authorized_by": "Rafael", "authorized_at": "…",
  "status": "in_progress",
  "channels": [
    { "id": "uuid", "channel": "gmail", "recipient": { "email": "ana@example.com", "name": "Ana Souza" },
      "status": "sending", "attempts": 1, "provider_message_id": null, "error": null,
      "last_attempt_at": "…", "sent_at": null, "delivered_at": null,
      "alternative": null },
    { "id": "uuid", "channel": "whatsapp", "recipient": { "phone": "+5511999990000", "name": "Ana Souza" },
      "status": "skipped_no_credentials", "attempts": 0, "provider_message_id": null,
      "error": { "code": "CHANNEL_NOT_CONFIGURED", "message": "WhatsApp Cloud API não configurada neste ambiente." },
      "alternative": { "type": "wa_me_link", "url": "https://wa.me/5511999990000?text=…", "pdf_download_url": "/api/v1/proposals/{id}/versions/2/pdf?download=1" } }
  ],
  "created_at": "…", "updated_at": "…"
}
```

#### `GET /deliveries/{delivery_id}` → `200 Delivery` (frontend faz polling até `status ∉ {in_progress}`).
#### `GET /proposals/{proposal_id}/deliveries` → `200 { items: Delivery[], total }`

#### `POST /deliveries/{delivery_id}/channels/{channel_id}/retry` · requer `X-Demo-User` · **P1**
Só se canal `failed`. Incrementa `attempts`, registra `CHANNEL_EVENT(type=retry_requested, actor)`, reenvia. `202 Delivery`. `409 CHANNEL_NOT_RETRYABLE`.

---

### 4.8 Autorização Google (Gmail)

#### `GET /auth/google/status` → `200 { "configured": true, "connected": true, "account_email": "demo@example.com" }`
`configured` = client id/secret presentes; `connected` = token válido armazenado.

#### `GET /auth/google/start`
Redireciona (302) para a tela de consentimento do Google com `scope=https://www.googleapis.com/auth/gmail.send`, `access_type=offline`, `prompt=consent`. Usado via `<a href>` no frontend.

#### `GET /auth/google/callback?code&state`
Troca o código por tokens, grava em `oauth_credentials`, redireciona para `FRONTEND_URL/settings?google=connected`. Em erro, `…?google=error&reason=…`. Tokens **nunca** retornam ao frontend.

#### `DELETE /auth/google` → `204` (remove token).

---

### 4.9 Webhooks (P1)

#### `GET /webhooks/whatsapp?hub.mode&hub.verify_token&hub.challenge`
Verificação da Meta: compara com `WHATSAPP_VERIFY_TOKEN`, responde `hub.challenge` em texto puro.

#### `POST /webhooks/whatsapp`
Valida `X-Hub-Signature-256` com `WHATSAPP_APP_SECRET`. Para cada `statuses[]`: localiza canal por `provider_message_id`, atualiza `status` (`sent`→`delivered`→`read` ou `failed` com `errors[]`), grava `CHANNEL_EVENT`. Sempre `200` (Meta reenvia em erro).

---

### 4.10 Histórico (P1)

#### `GET /projects/{project_id}/events?limit&offset`
`200 { items: [ { "id", "type", "actor", "at", "payload" } ], total }` — tipos: `project.created`, `meeting.created`, `meeting.transcribed`, `analysis.ready`, `analysis.reviewed`, `proposal.version_created`, `proposal.approved`, `delivery.authorized`, `channel.sent`, `channel.failed`, `channel.skipped`, `channel.delivered`.

## 5. Resumo dos contratos

| # | Contrato | Onde está definido | Exemplo |
|---|----------|--------------------|---------|
| 1 | Schema da análise (`MeetingAnalysis`) | AI_PIPELINE §3 | `examples/analysis.example.json` |
| 2 | Schema da proposta (`ProposalContent`) | AI_PIPELINE §8 | `examples/proposal_content.example.json` |
| 3 | Modelo de aprovação (`Approval`) | §4.6 | `examples/approval.example.json` |
| 4 | Geração/recuperação de PDF | §4.5 | — |
| 5 | Autorização de envio (`POST /deliveries`) | §4.7 | `examples/delivery_request.example.json` |
| 6 | Status por canal (`DeliveryChannel`) | §3, §4.7 | `examples/delivery.example.json` |
| 7 | Erro padrão | §2 | `examples/error.example.json` |
| 8 | Variáveis de ambiente | INTEGRATIONS §5, `.env.example` | — |

## 6. Mapa de telas × endpoints

| Tela (UX_FLOW) | Endpoints |
|----------------|-----------|
| Dashboard | `GET /projects`, `GET /health` |
| Novo projeto | `POST /projects` |
| Projeto | `GET /projects/{id}`, `GET /meetings/{id}`, `GET /proposals/{id}`, `GET /projects/{id}/events` |
| Nova reunião | `POST /projects/{id}/meetings`, `GET /meetings/{id}` (polling) |
| Revisão da análise | `GET/PUT /meetings/{id}/analysis`, `POST …/complete-review` |
| Proposta (editor) | `POST /projects/{id}/proposals`, `GET /proposals/{id}/versions/{n}`, `POST /proposals/{id}/versions` |
| PDF | `POST/GET /proposals/{id}/versions/{n}/pdf` |
| Aprovação | `POST /proposals/{id}/versions/{n}/approve` |
| Envio | `GET /auth/google/status`, `POST /deliveries`, `GET /deliveries/{id}` (polling), `POST …/retry` |
| Configurações | `GET /auth/google/status`, `GET /auth/google/start`, `DELETE /auth/google` |
