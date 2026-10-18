# Roadmap — Disparo da Proposta Comercial ao Cliente

Versão 0.1 · Stack: Node 24 · TypeScript (NodeNext/ESM) · Express 5 · Next.js (App Router) · Prisma

Relacionados: [API_SPEC.md](API_SPEC.md) §4.5–4.7 · [INTEGRATIONS.md](INTEGRATIONS.md) (contrato `ChannelAdapter`) · [WHATSAPP_BAILEYS_ROADMAP.md](WHATSAPP_BAILEYS_ROADMAP.md)

> **Estado:** o backend do envio já está **implementado e testado** — falta apenas a identidade da empresa (**Devs Mentais**) e a mensagem padrão. Este roadmap cobre o que falta para o disparo funcionar de ponta a ponta: a identidade/mensagem + **todo o frontend** (criação do envio, acompanhamento, retry) e a validação fim-a-fim.

---

## 1. Objetivo

Permitir que uma **proposta comercial aprovada** seja disparada ao cliente pelos canais integrados (Gmail via OAuth e WhatsApp via Baileys), com:

- seleção de canal(ais) e destinatário (e-mail / telefone E.164, pré-preenchidos do cadastro do cliente);
- mensagem **pré-formatada com a identidade Devs Mentais** (remetente), editável pelo usuário;
- autorização explícita do envio (associada ao hash da versão aprovada);
- acompanhamento em tempo real dos estados `queued → sent → delivered → read`, com retry e links alternativos quando o canal não está conectado.

## 2. Estado atual

### Backend — ✅ pronto (não é escopo deste roadmap)

| Item | Estado |
|---|---|
| `DeliveryService` (`authorizeDelivery` / `dispatchChannel` / `retryChannel`) | ✅ `services/delivery/service.ts` |
| Contrato `ChannelAdapter` / `ChannelSendRequest` / `ProviderResult` | ✅ `services/delivery/types.ts` |
| Rotas `POST /deliveries`, `GET /deliveries/:id`, `POST .../retry`, `GET /proposals/:id/deliveries` | ✅ `routes/deliveries.ts` |
| Schemas Zod de entrada (`CreateDeliverySchema`) | ✅ `schemas/delivery.ts` |
| Serializers com `channels[]` e `alternative` (wa.me/mailto) | ✅ `core/serializers.ts` |
| Adapter Gmail OAuth (`gmail.send`) | ✅ `integrations/gmail/gmailAdapter.ts` |
| Adapter WhatsApp Baileys (QR + sessão persistida) | ✅ `integrations/whatsapp/*` |
| Testes de serviço e de rotas | ✅ `tests/services/delivery/`, `tests/routes/deliveries.test.ts` |

### Frontend — ❌ a fazer (100% do escopo)

| Item | Estado |
|---|---|
| Funções/tipos de delivery em `lib/api.ts` | ❌ não existem |
| Página de criação do envio `/proposals/[id]/deliveries/new` | ❌ estática (`entrega.tsx`, nome de arquivo inválido → rota não resolve) |
| Página de status `/deliveries/[id]` | ❌ demo estática (sem fetch/polling/retry) |
| Botão "Preparar envio →" (página da proposta) | ⚠️ aponta para rota que não existe |

### Identidade e mensagem (Devs Mentais) — ❌ a fazer

| Item | Estado atual | Alvo |
|---|---|---|
| `vendor.company` na proposta | ❌ hardcoded `"Proposal AI (demo)"` | `"Devs Mentais"` |
| Rodapé do PDF (`proposal.njk`) | ❌ `"Proposta gerada por Proposal AI · ..."` | creditar **Devs Mentais** |
| Mensagem padrão (assunto/corpo) | ❌ não existe (corpo vazio se não informado) | pré-formatada com assinatura **Devs Mentais** |

> **Remetente lógico = Devs Mentais.** O `vendor` da proposta, o rodapé do PDF e a mensagem de envio (e-mail/WhatsApp) devem usar esse nome. A conta Gmail conectada (OAuth) é apenas o canal de transporte.

---

## 3. Especificações (mapeadas em `management/roadmap.md`)

| # | Spec | Escopo | Depende de |
|---|---|---|---|
| 1 | `proposal-dispatch-ui` | API client + página real de criação do envio + botão "Preparar envio" | — |
| 2 | `delivery-status-tracking` | Página real de status + polling + retry | 1 |
| 3 | `proposal-dispatch-e2e` | Testes de frontend + integração + smoke manual | 1 e 2 |

---

## 4. Arquivos a criar/modificar

### Spec 1 — criação do disparo

```text
frontend/src/lib/api.ts                                      # MODIFICAR
frontend/src/app/proposals/[id]/deliveries/new/page.tsx      # CRIAR (real)
frontend/src/app/proposals/[id]/deliveries/new/entrega.tsx   # REMOVER (nome inválido)
frontend/src/app/proposals/[id]/page.tsx                     # MODIFICAR (botão "Preparar envio")
```

### Spec 2 — acompanhamento

```text
frontend/src/lib/api.ts                        # MODIFICAR (+ retryChannel)
frontend/src/app/deliveries/[id]/page.tsx      # REESCREVER (real)
```

### Spec 3 — validação

```text
frontend/src/lib/api.test.ts                   # CRIAR (ou equivalente)
frontend/src/app/**/*.test.tsx                 # CRIAR (páginas de envio/status)
backend/tests/routes/deliveries.test.ts        # já existe; completar se necessário
```

---

## 5. Plano de implementação (fases ordenadas)

### Fase 0 — Identidade Devs Mentais e mensagem padrão

- [ ] Trocar `vendor.company` de `"Proposal AI (demo)"` para **`"Devs Mentais"`** em `services/proposal/builder.ts` (preferir env `VENDOR_NAME` com default `Devs Mentais`).
- [ ] Ajustar o rodapé do PDF (`templates/proposal.njk`) para creditar **Devs Mentais** (remover "Proposta gerada por Proposal AI").
- [ ] Criar mensagem padrão formatada (assunto + corpo) usada no envio quando o usuário não sobrescrever, com assinatura **Devs Mentais**:
  - **Assunto:** `Proposta comercial — {título} · Devs Mentais`
  - **Corpo:** saudação com `{contact_name}`, apresentação, menção ao PDF em anexo, e assinatura `Equipe Devs Mentais`.
  - Aplicar como default no backend (`DeliveryService.buildSendRequest`) e pré-preencher no formulário (Spec 1), para o usuário ver antes de enviar.

**Critério:** envio sem `subject`/`body_text` personalizados produz mensagem formatada com **Devs Mentais**; o PDF exibe a empresa correta.

### Fase 1 — API client (`lib/api.ts`)

- [ ] Adicionar tipos: `DeliveryStatus`, `ChannelStatus`, `DeliveryChannel`, `Delivery` (espelham `core/serializers.ts`).
- [ ] Estender o tipo `ProposalContent.client` com `contact_name`, `contact_email`, `contact_phone` (hoje só `{ company }`).
- [ ] Adicionar funções:
  - `createDelivery(input)` → `POST /deliveries` com `auth: true`;
  - `getDelivery(id)` → `GET /deliveries/:id`;
  - `listDeliveries(proposalId)` → `GET /proposals/:proposalId/deliveries`;
  - `retryChannel(deliveryId, channelId)` → `POST /deliveries/:deliveryId/channels/:channelId/retry` (Spec 2).

**Critério:** typecheck do frontend limpo.

### Fase 2 — Página real de criação do envio (Spec 1)

- [ ] **Corrigir a rota:** mover `entrega.tsx` → `page.tsx` (o App Router só reconhece `page.tsx`).
- [ ] Carregar `api.getProposal(id)` + `api.getVersion(id, approved_version)`; bloquear se não houver versão aprovada (`APPROVAL_REQUIRED` do backend já garante).
- [ ] Mostrar o card "Versão aprovada" real (título, aprovada por, data) + link "Visualizar PDF" (`api.pdfUrl`).
- [ ] Buscar `api.gmailStatus()` e `api.whatsappStatus()` para exibir **configurado/conectado** por canal e desabilitar canais não configurados com orientação ("Conecte em Configurações").
- [ ] Campos de destinatário pré-preenchidos de `version.content.client.contact_email` / `contact_phone` / `contact_name` (editáveis).
- [ ] Campos assunto/mensagem com defaults (`Proposta comercial — <título>`, saudação com `contact_name`).
- [ ] No submit: gerar `idempotency_key = crypto.randomUUID()`, montar `channels[]` (só os selecionados, com `recipient` + `options.subject`/`body_text`), chamar `api.createDelivery` com `approval_id = version.approval.id`.
- [ ] Redirecionar para `/deliveries/:id` (página da Spec 2); desabilitar botão enquanto `busy`; tratar erro com `ErrorBanner`.
- [ ] Garantir que o botão "Preparar envio →" de `proposals/[id]/page.tsx` passa a resolver a rota.

**Critério:** ao abrir a proposta aprovada → "Preparar envio" → preencher → "Autorizar envio" cria um delivery real (`202`) e redireciona para o status.

### Fase 3 — Página real de status + retry (Spec 2)

- [ ] Reescrever `/deliveries/[id]/page.tsx` para buscar `api.getDelivery(id)`.
- [ ] **Polling** de `getDelivery` a cada ~2s enquanto `status ∈ {authorized, in_progress}`; parar em estado terminal (`completed`, `partially_failed`, `failed`).
- [ ] Renderizar cartões por canal com badge de status (`queued`/`sending`/`sent`/`delivered`/`read`/`failed`/`skipped_no_credentials`), erros e `provider_message_id`/`attempts`.
- [ ] Quando `status === "failed"` e `retryable !== false`: botão "Tentar novamente" → `api.retryChannel(deliveryId, channelId)` e retomar polling.
- [ ] Quando `skipped_no_credentials`: exibir `alternative` (link `wa.me`/`mailto` + "Baixar PDF" via `api.pdfUrl`).
- [ ] Links de navegação reais (voltar ao projeto/proposta), remover `demo` hardcoded.

**Critério:** status reflete o backend em tempo real; retry dispara `POST .../retry`; canal sem credencial mostra fallback funcional.

### Fase 4 — Testes e validação (Spec 3)

- [ ] Testes de `lib/api.ts` (mocks de `fetch`): `createDelivery` monta o body correto (incluindo `idempotency_key` e `approval_id`), `getDelivery`/`retryChannel` chamam as rotas certas.
- [ ] Teste de componente das páginas de criação/status com `api` mockado (estados: carregando, erro, sucesso, canal sem credencial, retry).
- [ ] Validar o fluxo de integração já existente (`tests/routes/deliveries.test.ts`) continua verde após as mudanças de frontend.
- [ ] **Smoke manual:** conectar Gmail (OAuth) e WhatsApp (QR) → aprovar proposta → disparar → confirmar recebimento do PDF nos dois canais e progressão de status.

**Critério:** testes verdes + smoke manual com canais reais concluído.

---

## 6. Variáveis de ambiente

Nenhuma env nova é **obrigatória** — reutiliza `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` (Gmail OAuth) e `WHATSAPP_SESSION_DIR/PAIRING_CODE_MODE` (Baileys). Opcional: `VENDOR_NAME` (default `Devs Mentais`) para o nome da empresa no PDF e na mensagem.

---

## 7. Critérios de aceitação (fim a fim)

1. Proposta aprovada → "Preparar envio" → escolher canal(ais) + destinatário → "Autorizar envio" cria o delivery (`202`) e redireciona para o status.
2. A página de status faz polling e mostra os estados `sent → delivered → read` (e `failed`/`skipped_no_credentials` com detalhe).
3. `Tentar novamente` reenvia apenas canais `failed` retryable.
4. Canal não conectado não bloqueia os demais e oferece fallback (`wa.me`/`mailto` + download do PDF).
5. Replay com a mesma `idempotency_key` **não duplica** envio (garantido pelo backend; o frontend gera uma chave por submissão).
6. Sem versão aprovada → nenhum envio ocorre (backend bloqueia; frontend não oferece o botão).
7. Destinatário pré-preenchido do cliente (`contact_email`/`contact_phone`) e editável.
8. O PDF e a mensagem de envio usam **Devs Mentais** como remetente (rodapé do PDF, assunto e assinatura), mesmo sem personalização do usuário.

---

## 8. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Rota de criação não resolve (nome `entrega.tsx`) | Renomear para `page.tsx` na Fase 2 |
| `approval.id` ausente no frontend | Ler de `version.approval.id` (retornado por `GET /versions/:n`); guarda se `null` |
| Polling infinito em estado pendente | Timeout máximo + parar em estados terminais |
| Token Gmail perdido no modo demo (MemoryRepository) | **Dívida conhecida**: persistir token em arquivo (como a sessão do WhatsApp) ou usar Postgres — decisão separada |
| `sent` não confirma entrega no Gmail | Exibir "aceita pelo provedor; confirmação pendente" (comportamento já previsto no serializer) |

---

## 9. Fora de escopo (P1 / futuro)

- Autenticação real (permanece `X-Demo-User`).
- Persistência do token OAuth do Gmail em modo demo (dívida separada).
- Templates avançados de mensagem, agendamento de envio, múltiplos destinatários por canal.
- Webhooks/notificações de entrega em tempo real (o polling atende o MVP).
