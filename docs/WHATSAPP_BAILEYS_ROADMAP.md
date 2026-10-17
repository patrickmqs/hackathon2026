# Roadmap — Integração WhatsApp via Baileys (100%)

Versão 0.1 · Stack: Node 24 · TypeScript (NodeNext/ESM) · Express 5 · Prisma

Relacionados: [INTEGRATIONS.md](INTEGRATIONS.md) (contrato `ChannelAdapter`) · [API_SPEC.md](API_SPEC.md) §4.7 (envio) · [ARCHITECTURE.md](ARCHITECTURE.md) §8/§12

> **Decisão:** substituir a "WhatsApp Business Platform Cloud API" (documentada em INTEGRATIONS.md §3) pela lib **Baileys** (`@whiskeysockets/baileys`) para o canal WhatsApp. O Gmail permanece como está (OAuth 2.0).

---

## 1. Objetivo

Permitir que uma proposta aprovada seja enviada por **WhatsApp** usando uma conta comum (via Baileys/WhatsApp Web), com:

- pareamento por **QR code / pairing code** (uma única vez);
- sessão persistida e reutilizada entre reinícios;
- envio do **PDF** da proposta como documento, com legenda;
- estados `sent` → `delivered` → `read` (via eventos do socket, não webhook);
- reuso integral do contrato `ChannelAdapter` e da máquina de estados já modelada.

## 2. Estado atual (o que já existe)

| Item | Estado |
|---|---|
| `ChannelAdapter` (interface `isConfigured`/`send`) | Documentado, **não implementado** |
| `CHANNELS = ["gmail", "whatsapp"]` | ✅ `schemas/common.ts` |
| `ChannelStatus` (queued/sending/sent/delivered/read/failed/skipped_no_credentials) | ✅ `schemas/common.ts` |
| `DeliveryStatus` | ✅ `schemas/common.ts` |
| `Delivery` / `DeliveryChannel` / `ChannelEvent` (Prisma) | ✅ `schema.prisma` |
| `Event` de timeline (`channel.sent`, `channel.failed`, …) | ✅ `domain/events.ts` |
| PDF gerado + `FileStorage` | ✅ `services/pdf` + `core/storage.ts` |
| Rotas de envio (`POST /deliveries`, etc.) | ❌ não existem |
| Serviço de delivery / adapters | ❌ não existem |
| Repositório de delivery (métodos) | ❌ não existe |

Ou seja: **toda a camada de envio está por fazer** — é o escopo da Pessoa D/C. O Baileys entra apenas como a implementação do adapter de WhatsApp.

## 3. Modelo conceitual do Baileys

Baileys é um cliente **não oficial** do WhatsApp Web. Ao contrário da Cloud API (HTTP stateless + webhook), ele:

1. mantém um **WebSocket persistente** com o servidor do WhatsApp;
2. autentica por **QR code** ou **pairing code** (o usuário escaneia/aceita);
3. guarda o **estado de autenticação** (`authState` = creds + keys) para reuso;
4. emite **eventos** (`connection.update`, `creds.update`, `ev`) em vez de webhooks.

Consequência estrutural: precisamos de um **socket singleton** vivo durante toda a vida do processo, com reconexão automática.

## 4. Decisões de arquitetura

1. **Singleton do socket** — um único `WASocket` por processo, criado no boot (ou lazy no primeiro uso) e mantido com reconexão. Guardado num módulo `src/integrations/whatsapp/socket.ts`.
2. **Sessão em arquivo** — `authState` salvo em `{STORAGE_DIR}/whatsapp/session.json` (gitignored). No boot, tenta restaurar; sem sessão → gera pairing code.
3. **Pareamento via API** — endpoints para o frontend exibir o QR/pairing code e o status da conexão (substitui a necessidade de OAuth da Meta).
4. **Status de entrega por evento** — um listener de `events.update`/`messages.update` mapeia `delivered`/`read`/`failed` → `ChannelStatus`. **Não há webhook.**
5. **Adapter isolado** — `BaileysWhatsAppAdapter implements ChannelAdapter`; a camada de delivery não conhece Baileys.
6. **Recipient** — converter telefone E.164 (`+5511999990000`) para JID `5511999990000@s.whatsapp.net`.

## 5. Arquivos a criar/modificar

### Criar

```text
backend/src/integrations/whatsapp/
├── socket.ts          # singleton WASocket + reconexão + persistência de creds
├── baileysAdapter.ts  # implements ChannelAdapter (isConfigured + send)
└── statusListener.ts  # assina events.update → callback de status

backend/src/services/delivery/
├── types.ts           # ChannelSendRequest/ProviderResult (cópia do contrato)
├── service.ts         # autorizar + despachar + idempotência + retry
└── delivery.test.ts   # (ou em tests/)

backend/src/routes/deliveries.ts   # POST/GET deliveries + retry

backend/src/repositories/delivery.ts  # (se separado) métodos de delivery
```

### Modificar

```text
backend/src/repositories/repo.ts       # + createDelivery/getDelivery/listDeliveries/… (contrato)
backend/src/repositories/memory.ts     # + implementação em memória
backend/src/repositories/prisma.ts     # + implementação Prisma
backend/src/core/config.ts             # + envs do Baileys
backend/src/core/deps.ts               # + whatsappAdapter? / deliveryService?
backend/src/app.ts                     # montar routes/deliveries + /auth/whatsapp/*
backend/src/routes/health.ts           # channels.whatsapp → estado real da conexão
backend/src/schemas/delivery.ts        # schemas Zod de entrada (POST /deliveries)
```

## 6. Plano de implementação (fases ordenadas)

### Fase 0 — Setup e configuração
- [ ] Instalar `@whiskeysockets/baileys` (confirmar versão atual no npm).
- [ ] Adicionar envs (`WHATSAPP_SESSION_DIR`, `WHATSAPP_PAIRING_CODE_MODE`, `WHATSAPP_FORCE_FAIL` já existe).
- [ ] `.env.example` atualizado.

**Critério:** `npm run typecheck` verde; envs validados no `config.ts`.

### Fase 1 — Repositório de delivery
- [ ] Estender `Repository` com: `createDelivery`, `getDelivery`, `listDeliveriesByProposal`, `updateDelivery`, `createChannel`, `updateChannel`, `getChannel`, `listChannels`, `createChannelEvent`, e busca por `idempotencyKey`.
- [ ] Implementar em `memory.ts` e `prisma.ts` (mapear os models `Delivery`/`DeliveryChannel`/`ChannelEvent`).

**Critério:** testes de repositório (memória) verdes; Prisma mapeia os 3 models sem erro de tipo.

### Fase 2 — Serviço de delivery (núcleo)
- [ ] `authorizeDelivery({ approvalId, idempotencyKey, channels, actor })`:
  - valida que `approval_id` aponta para versão `approved` (não `superseded`) → senão `APPROVAL_REQUIRED`/`APPROVAL_SUPERSEDED`;
  - idempotência: mesma chave + mesmo payload → retorna o delivery existente (`200`); payload diferente → `409 IDEMPOTENCY_CONFLICT`;
  - valida destinatário por canal → `422 RECIPIENT_INVALID`;
  - cria `Delivery` + um `DeliveryChannel` por canal (estado inicial `queued`/`skipped_no_credentials`).
- [ ] `dispatchChannel(channelId)`: chama `adapter.isConfigured()`; se não configurado → `skipped_no_credentials` + `alternative`; senão `send()` e atualiza `sent`/`failed`.
- [ ] `retryChannel(channelId)` só se `failed` e `retryable` → `CHANNEL_NOT_RETRYABLE`.

**Critério:** testes unitários com fake adapter cobrindo: aprovação inválida, idempotência, canal sem credencial, falha retryable/não-retryable, estado final.

### Fase 3 — Adapter Baileys + socket
- [ ] `socket.ts`: `getSocket()` (singleton), `startSocket()` com `makeWASocket` + `useMultiFileAuthState`; persistir `creds.update`; reconectar em `connection.update === "close"`/`"connecting"`.
- [ ] Endpoints de pareamento:
  - `GET /auth/whatsapp/status` → `{ configured, connected, qr?, phoneNumber? }`;
  - `GET /auth/whatsapp/qr` → `{ qr: string }` — a **string** do QR gerada pelo Baileys; o frontend renderiza com o pacote `qrcode` (já instalado). Se `WHATSAPP_PAIRING_CODE_MODE=true`, retorna `{ pairing_code: string }`;
  - `DELETE /auth/whatsapp` → apaga sessão (desconecta).
- [ ] `baileysAdapter.ts`:
  - `isConfigured()` = socket aberto (`connection.update === "open"`) e sessão restaurada;
  - `send(req)` = `sendMessage(jid, { document: { url/path: req.attachmentPath, mimetype: "application/pdf", fileName: req.attachmentFilename }, caption: req.bodyText })`; `providerMessageId` = `key.id`.

**Critério:** pareamento manual em dev (escaneia o QR, status vira `connected`); envio de PDF de teste chega no número alvo.

### Fase 4 — Rotas de envio
- [ ] `POST /deliveries` (requer `X-Demo-User`) → `202 Delivery`.
- [ ] `GET /deliveries/:id` → polling até `status ∉ {in_progress}`.
- [ ] `GET /proposals/:proposal_id/deliveries`.
- [ ] `POST /deliveries/:delivery_id/channels/:channel_id/retry` (P1).
- [ ] Schemas Zod (`schemas/delivery.ts`) e validação de destinatário.

**Critério:** rotas cobertas por supertest com `MemoryRepository` + fake adapter.

### Fase 5 — Listener de status de entrega
- [ ] `statusListener.ts`: assina `events.update`/`messages.update`, extrai `status` (`delivered`/`read`/`failed`), correlaciona por `providerMessageId` e atualiza o `DeliveryChannel` correspondente + grava `ChannelEvent`.

**Critério:** teste unitário simulando o evento do Baileys → canal muda para `delivered`/`read`.

### Fase 6 — Health check + frontend (pareamento)

Contexto: hoje `frontend/src/app/settings/page.tsx` (linha da integração WhatsApp) **não tem botão de conectar** — só um link "Como conectar ↗". O requisito é: o botão **"Conectar"** deve abrir o **QR code** em um modal.

- [ ] `routes/health.ts`: `channels.whatsapp` passa a refletir `configured`/`connected` (via adapter/socket), não mais hardcoded.
- [ ] `frontend/src/app/settings/page.tsx`: substituir o link do WhatsApp por um botão **"Conectar"** (e "Desconectar" quando conectado).
- [ ] Novo `whatsapp-connect.tsx` (modal): ao abrir, faz polling de `GET /auth/whatsapp/qr` e renderiza o QR com `qrcode` (já dependência do projeto); mostra `aguardando leitura → conectado`; botão fechar.
- [ ] Ao conectar, fechar o modal e atualizar o badge do canal para "Conectado".

### Fase 7 — Testes e hardening
- [ ] Teste de integração do fluxo completo: proposta aprovada → `POST /deliveries` → canal `sent` (fake) → evento `delivered`.
- [ ] Resiliência: reconexão do socket, sessão corrompida → volta ao pareamento, timeout de envio.
- [ ] Garantir que **nenhum envio** ocorre sem `approval_id` aprovado.

## 7. Variáveis de ambiente

| Variável | Obrigatória | Padrão | Uso |
|---|---|---|---|
| `WHATSAPP_SESSION_DIR` | não | `{STORAGE_DIR}/whatsapp` | onde salvar `session.json` |
| `WHATSAPP_PAIRING_CODE_MODE` | não | `false` | se `true`, usa pairing code em vez de QR |
| `WHATSAPP_FORCE_FAIL` | não | `false` | demo de falha isolada (já existe) |

## 8. Critérios de aceitação (fim a fim)

1. Primeiro uso exibe QR/pairing code; após escanear, `GET /auth/whatsapp/status` retorna `connected: true`.
2. Reiniciar o servidor **mantém** a sessão (não pede QR de novo).
3. Proposta aprovada → `POST /deliveries` com canal `whatsapp` → PDF chega como documento com legenda no número alvo.
4. Estados progridem `sent → delivered → read` (quando o destinatário lê).
5. Canal sem sessão/conexão → `skipped_no_credentials` com `alternative.wa_me_link`.
6. Replay de `POST /deliveries` com a mesma `idempotency_key` **não duplica** envio.
7. Sem `approval_id` aprovado → **nenhum** envio acontece.

## 9. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Banimento do número (não oficial) | Uso restrito à demo; não usar número pessoal principal |
| Socket cai em produção | Reconexão automática + `isConfigured` reflete desconexão |
| Sessão corrompida | Detectar e cair de volta no fluxo de pareamento |
| Sem "delivered/read" confiável | Tratar `sent` como estado aceitável; exibir "aceito, confirmação pendente" |
| Versão do Baileys muda API | Fixar a versão no `package.json` e validar na Fase 0 |

## 10. Fora de escopo (P1 / futuro)

- Templates de mensagem fora da janela de 24h (Cloud API) — não se aplica ao Baileys.
- Assinatura de webhook da Meta (`X-Hub-Signature-256`) — sem webhook no Baileys.
- Grupos/mensagens interativas/mídia avançada — só documento + legenda no MVP.
- Autenticação real (não `X-Demo-User`) — permanece fora do escopo.
