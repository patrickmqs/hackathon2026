# P1 — Backend (API, dados, documentos, integrações)

Voltar: [README](README.md) · Referências: [ARCHITECTURE](../ARCHITECTURE.md) · [API_SPEC](../API_SPEC.md) · [INTEGRATIONS](../INTEGRATIONS.md)

**Funcionalidades sob responsabilidade:** F1, F2, F3 (rotas), F6 (API), F8 (engine), F9 (builder), F10, F11, F12, F13, F14, F15, F16, F17, F18.

Esta é a carga mais alta do time. Se apertar, cortar/simplificar na ordem: WhatsApp real → Gmail OAuth (usar SMTP) → timeline de eventos.

| # | Tarefa | Prio | Janela | ⛓ | ✅ Pronto quando |
|---|--------|------|--------|---|-----------------|
| B1 | Converter para npm workspaces (T09); criar `shared/` | P0 | H0–1 | — | `npm i` na raiz resolve os 3 pacotes |
| B2 | Esqueleto Express: `app.ts`, `config/env.ts` (Zod), `errorHandler` (envelope API_SPEC §2), `requestId`, `pino-http`, CORS, `/health` | P0 | H0–2 | B1 | `GET /health` responde; erro padrão testado |
| B3 | `shared/schemas/{common,proposal,delivery,api}.ts` + `docs/examples/proposal_content.example.json` | P0 | H0–2 | B1 | Exemplos validam; P2/P3 desbloqueados |
| B4 | `prisma/schema.prisma` (ARCHITECTURE §3), migration inicial, docker-compose com Postgres, `.env.example`, seção de setup no README | P0 | H1–4 | B1 | Pessoa nova sobe com `docker compose up` |
| B5 | Repositórios + rotas **Projects** e **Meetings** (texto/áudio multipart com `multer`, `GET`, `reprocess`) + `FileStorage` | P0 | H3–6 | B2, B4 | Criar projeto e reunião por texto via cliente HTTP |
| B6 | Orquestrador do job (`runPipeline`, estados de Meeting, `JOB_STALE_MINUTES`, `progress.step` incl. `summarizing`) integrando extração da P4; etapa de resumo (IA17) **não bloqueante** | P0 | H5–8 | B5, P4:A5 | texto → `analysis_ready` ponta a ponta |
| B7 | Rotas **Analysis** (`GET`, `PUT` preservando `meta`, `complete-review`) + middleware `demoUser` | P0 | H7–9 | B6 | Critérios "Revisão" de PRODUCT_SPEC §10 |
| B7b | Rotas de resumo: `GET/POST /meetings/{id}/summary` (`basis: analysis\|reviewed`, `SUMMARY_NOT_AVAILABLE`), `PUT /analysis` preserva `meeting_summary`, evento `analysis.summary_generated` | P0 | H9–11 | B7, P4:IA17 | Contrato de API_SPEC §4.4 |
| B8 | `estimation/engine.ts` + `historical.ts` (usa `rules.ts` da P4) | P0 | H8–11 | B3 | Determinístico; teste unitário |
| B9 | `proposal/builder.ts` + `versioning.ts` (hash SHA-256 canônico, imutabilidade) + rotas **Proposals** (`POST`, `GET`, `versions`) | P0 | H9–13 | B7, B8, P4:A9 | Gerar proposta e criar v2 via API |
| B10 | `delivery/service.ts` (idempotência, validação de destinatário, fan-out, estado agregado, `alternative`) + rotas **Deliveries**; adapters iniciam "não configurado" | P0 | H4–10 | B2, B4 | `POST /deliveries` sem credenciais → `skipped_no_credentials`; replay → mesmo delivery |
| B11 | Template Handlebars (`proposal.hbs`, `styles.css`, 16 seções, blocos condicionais, rótulo de sugestão, rodapé com versão) | P0 | H11–15 | B3 | HTML abre no navegador com dados do exemplo |
| B12 | `pdf/renderer.ts` (Playwright singleton) + rotas `POST/GET …/pdf`; Dockerfile com Chromium | P0 | H13–16 | B11 | PDF A4 em < 10 s local e no container |
| B13 | Rota **Approve** (hash check, supersede, `Approval`) + eventos de auditoria | P0 | H15–17 | B9 | Critérios "Aprovação" de PRODUCT_SPEC §10 |
| B14 | **Gmail**: `oauth.ts`, rotas `/auth/google/*`, `adapter.ts` (MIME + anexo), `GMAIL_FORCE_FAIL`; fallback `smtpAdapter` | P0 | H8–14 | B10, B12 | PDF real chega à caixa de teste; `FORCE_FAIL` → `failed` isolado |
| B15 | **WhatsApp**: upload de mídia + documento, mapeamento de erros (`131047`, `131030`), `WHATSAPP_FORCE_FAIL`. Go/no-go até H+6 | P0 | H12–16 | B10 | Envio real **ou** erro legível mapeado |
| B16 | Hardening: limites de upload, mensagens de erro, `scripts/seed-demo.ts` (projeto pronto para cada etapa da demo) | P0 | H18–22 | tudo | Seed cobre toda a demo |
| B17 | `GET /projects/{id}/events` (timeline) | P1 | H18–20 | B13 | Eventos listados |
| B18 | Webhook WhatsApp + túnel; retry manual de canal | P1 | H20–22 | B15 | — |

## Pré-requisitos externos (começar cedo, em paralelo)

- **H0–3:** projeto no Google Cloud, Gmail API, consent em modo Testing com test users, client OAuth (T02).
- **H1–6:** app Meta, número de teste, token, destinatários de teste (T03). Decidir go/no-go do WhatsApp real em H+6.

## Entregas que destravam os outros

| Entrega | Destrava | Até |
|---------|----------|-----|
| B3 (schemas proposal/delivery + exemplos) | P2, P3 (tipos e mocks) | H+2 |
| B5 (Projects/Meetings) | P2 (telas reais) | H+6 |
| B7 (Analysis API) | P2 (Revisão) | H+9 |
| B9, B12, B13 | P3 (editor, PDF, aprovação) | H+13 / 16 / 17 |
| B10 (Deliveries, mesmo "não configurado") | P3 (Envio/Status) | H+10 |
