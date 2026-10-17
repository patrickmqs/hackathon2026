# Proposal AI

Plataforma que transforma reuniões comerciais (áudio ou transcrição) em propostas técnicas e comerciais estruturadas, revisadas por humanos, aprovadas explicitamente e enviadas por Gmail e/ou WhatsApp — com rastreabilidade entre cada item da proposta e o trecho da reunião que o originou.

> **Status:** hackathon de 24 h — fase de documentação e estrutura concluída; implementação em andamento. Nenhuma integração externa foi testada ainda. Veja [docs/DECISIONS.md](docs/DECISIONS.md) para hipóteses e pendências.

## O que o produto faz

1. Você cria um projeto com os dados do cliente.
2. Envia o áudio da reunião (ou cola a transcrição).
3. A IA transcreve (se áudio) e extrai, em categorias separadas: **necessidades**, **requisitos e módulos**, **decisões** (confirmadas × pendentes), **compromissos** (quem, o quê, prazo dito), **pendências e ambiguidades** e **sugestões técnicas da IA** — cada item com citação literal da transcrição.
4. Você revisa: confirma, edita, rejeita ou marca "precisa esclarecimento".
5. O sistema monta a proposta (16 seções) a partir dos dados validados; horas, equipe e cronograma vêm de um motor de regras determinístico — a IA redige, não estima.
6. Gera o PDF da versão; cada edição é uma nova versão imutável.
7. Um responsável **aprova explicitamente** uma versão (quem, quando, hash do conteúdo).
8. Outro passo explícito **autoriza o envio** para destinatários e canais escolhidos.
9. Gmail e WhatsApp têm estados independentes: `sent`, `failed`, `skipped_no_credentials`, `delivered` (só via webhook). Nada é simulado; nada é enviado sem aprovação; repetir a autorização não duplica mensagens.

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | Next.js (App Router) · React · TypeScript · Tailwind CSS |
| Backend | Node 20+ · Express 5 · TypeScript · Zod · Prisma ORM |
| IA | OpenAI API (SDK oficial JS) — transcrição + Structured Outputs validados com Zod; prompts versionados em arquivos |
| Dados | PostgreSQL 16 (docker-compose) · fallback SQLite · arquivos em disco (`STORAGE_DIR`) |
| PDF | Template Nunjucks HTML/CSS → Playwright (Chromium headless) para Node |
| Integrações | Gmail API (OAuth 2.0, escopo `gmail.send`) · WhatsApp Business Cloud API |
| Deploy | Local via docker-compose (recomendado para a demo); opcional Vercel (frontend) + Railway (backend + Postgres) |

## Estrutura do repositório

```text
proposal-ai/
├── README.md
├── .env.example                 # todas as variáveis, sem valores reais
├── docker-compose.yml           # postgres + backend + frontend
├── docs/
│   ├── PRODUCT_SPEC.md          # visão, personas, escopo P0/P1/P2, RF/RNF, critérios de aceitação
│   ├── ARCHITECTURE.md          # componentes, modelo de dados, máquinas de estado, fluxos, falhas, deploy
│   ├── API_SPEC.md              # contrato REST frontend ↔ backend, erros, enums
│   ├── AI_PIPELINE.md           # etapas, schemas MeetingAnalysis/ProposalContent, prompts, validação, estimativas
│   ├── INTEGRATIONS.md          # Gmail OAuth, WhatsApp Cloud API, env vars, estados, plano B
│   ├── UX_FLOW.md               # telas, componentes, estados, revisão, aprovação, envio
│   ├── TEAM_TASKS.md            # divisão A/B/C/D, dependências, marcos, contingência
│   ├── DECISIONS.md             # decisões, hipóteses, descartes, pendências, abertas
│   └── examples/                # JSONs de exemplo dos contratos
├── frontend/                    # Next.js
│   └── src/{app,components,features/{projects,meetings,analysis,proposals,deliveries},lib,services,types}
├── backend/                     # Express (Node + TypeScript)
│   ├── src/
│   │   ├── index.ts             # aplicação Express
│   │   ├── routes/              # projects, meetings, analysis, proposals, approvals, deliveries, authGoogle, webhooks, health
│   │   ├── middleware/          # X-Demo-User, request_id
│   │   ├── core/                # config, errors, logging, storage
│   │   ├── domain/              # enums e transições de estado
│   │   ├── schemas/             # Zod (analysis, proposal, delivery, errors)
│   │   ├── repositories/
│   │   ├── services/{transcription,ai_analysis/prompts,estimation,proposal,pdf,delivery}
│   │   ├── integrations/{openai,gmail,whatsapp}
│   │   └── templates/           # proposal.njk, styles.css, e-mail
│   ├── prisma/                  # schema.prisma + migrations/
│   └── tests/
├── scripts/                     # check_openai.ts, seed_demo.ts, e2e_demo.ts
└── sample_data/                 # transcrição, áudio, gabarito, histórico fictício, perfil do fornecedor
```

Responsabilidades por pasta: [docs/ARCHITECTURE.md §2](docs/ARCHITECTURE.md#2-componentes-e-responsabilidades).

## Pré-requisitos

- Docker + Docker Compose (recomendado) **ou** Node 20+ + PostgreSQL local (ou SQLite).
- `pnpm` (ou `npm`) para backend e frontend.
- Chave da OpenAI com acesso a um modelo de chat com Structured Outputs e a um modelo de transcrição.
- Para Gmail: projeto no Google Cloud com Gmail API habilitada e client OAuth (passo a passo em [docs/INTEGRATIONS.md §2.3](docs/INTEGRATIONS.md)).
- Para WhatsApp: app Meta Business com número de teste ([docs/INTEGRATIONS.md §3.1](docs/INTEGRATIONS.md)).

Sem credenciais de Gmail/WhatsApp o sistema funciona inteiro; os canais terminam em `skipped_no_credentials` com link alternativo.

## Instalação local

```bash
git clone <repo> proposal-ai && cd proposal-ai
cp .env.example .env            # preencha OPENAI_API_KEY no mínimo
```

### Opção A — tudo via Docker (recomendado)

```bash
docker compose up --build
# backend:  http://localhost:8000  (OpenAPI em /docs via swagger-ui-express)
# frontend: http://localhost:3000
```

### Opção B — manual

```bash
# Backend
cd backend
pnpm install
pnpm exec playwright install chromium
pnpm prisma migrate dev          # usa DATABASE_URL; sem Postgres, defina DATABASE_URL="file:./dev.db"
pnpm dev                         # http://localhost:8000

# Frontend (outro terminal)
cd frontend
pnpm install
pnpm dev                         # http://localhost:3000
```

## Configuração de ambiente

Todas as variáveis estão documentadas em [`.env.example`](.env.example) e em [docs/INTEGRATIONS.md §4](docs/INTEGRATIONS.md). Mínimo para rodar:

| Variável | Para quê |
|----------|----------|
| `OPENAI_API_KEY` | obrigatória — transcrição e análise |
| `OPENAI_MODEL`, `OPENAI_TRANSCRIBE_MODEL` | confirmar modelos disponíveis na sua conta (`pnpm tsx scripts/check_openai.ts`) |
| `DATABASE_URL` | Postgres do compose por padrão; `file:./dev.db` para rodar sem Docker |
| `NEXT_PUBLIC_API_URL` | URL do backend vista pelo navegador |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | opcional — habilita Gmail |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | opcional — habilita WhatsApp |
| `DEMO_MODE` | `true` habilita identidade via header `X-Demo-User` e flags `GMAIL_FORCE_FAIL` / `WHATSAPP_FORCE_FAIL` |

**Segredos nunca vão para o frontend nem para o repositório.** `.env` está no `.gitignore`.

### Identidade em modo demonstração

Não há autenticação real neste MVP. Operações de revisão, aprovação e autorização de envio exigem o header `X-Demo-User: <nome>`, que o frontend envia a partir do nome definido em *Configurações*. Isso garante **rastreabilidade** (quem aprovou, quem autorizou) — **não é segurança**. Não exponha a aplicação publicamente sem substituir `src/middleware/demoUser.ts:getDemoUser()` por autenticação real. Detalhes: [docs/DECISIONS.md R03](docs/DECISIONS.md).

## Executando

| Ação | Comando |
|------|---------|
| Subir tudo | `docker compose up` |
| Backend dev | `cd backend && pnpm dev` |
| Frontend dev | `cd frontend && pnpm dev` |
| Frontend com mocks (sem backend) | `NEXT_PUBLIC_USE_MOCKS=true pnpm dev` |
| Migrations | `cd backend && pnpm prisma migrate dev` |
| Seed de demo | `cd backend && pnpm tsx ../scripts/seed_demo.ts` |
| Verificar OpenAI | `pnpm tsx scripts/check_openai.ts` |

## Testes

```bash
cd backend
pnpm test                        # unitários + rotas, sem chamadas externas (fixtures gravadas) — Vitest
pnpm test:ai                     # chama a OpenAI de verdade; registra em logs/ai_runs.jsonl
cd ../frontend && pnpm test      # componentes (se houver tempo — P1)
pnpm tsx scripts/e2e_demo.ts     # percorre a jornada completa pela API e valida estados
```

O que os testes de IA verificam (gabarito em `sample_data/sample_analysis_expected.json`): schema válido, ≥ 90% das citações existem na transcrição, ≥ 80% dos itens do gabarito presentes, nenhuma sugestão classificada como decisão, contradição plantada detectada, compromisso condicional não sai como confirmado, estimativas determinísticas. Detalhes: [docs/AI_PIPELINE.md §11](docs/AI_PIPELINE.md).

## Integrações externas

| Integração | Como configurar | Estado quando ausente |
|------------|-----------------|-----------------------|
| OpenAI | `OPENAI_API_KEY` | pipeline falha com `AI_PROVIDER_NOT_CONFIGURED` |
| Gmail | GCP → Gmail API → OAuth consent (Testing, test users) → client Web → `.env`; depois *Configurações → Conectar Gmail* | canal `skipped_no_credentials` + link `mailto` + download do PDF |
| WhatsApp | Meta for Developers → app Business → número de teste + token → destinatários de teste → `.env` | canal `skipped_no_credentials` + link `wa.me` + download do PDF |

Limitações conhecidas: Gmail `sent` = aceito pela API, não entregue; WhatsApp fora da janela de 24 h exige template aprovado (não implementado); token de teste da Meta expira em 24 h. Tudo em [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

## Fluxo de demonstração (6–8 min)

Pré-demo: `seed_demo.ts` cria um projeto em cada etapa; destinatário de teste envia "oi" ao número WhatsApp de teste (abre janela de 24 h); Gmail já conectado em *Configurações*.

1. **Dashboard** → "Novo projeto" → *Distribuidora Horizonte (fictícia)*.
2. **Nova reunião** → aba *Enviar áudio* → `sample_data/sample_meeting.mp3` → painel de progresso (transcrevendo → analisando → auditando). *(Plano B: colar `sample_transcript_pt.txt`.)*
3. **Revisão** → mostrar categorias; abrir um compromisso e "ver na transcrição"; mostrar decisão pendente vs confirmada; mostrar sugestão da IA rotulada; **rejeitar** um requisito; marcar uma pendência como "precisa esclarecimento"; concluir revisão.
4. **Proposta** → gerar; navegar seções; mostrar estimativas com faixa e premissas ("base demonstrativa"); mostrar que o item rejeitado não entrou e o pendente foi para "Pontos pendentes"; editar sumário → **v2**.
5. **PDF** → gerar v2 → abrir; rodapé "v2 · rascunho".
6. **Aprovar** v2 como "Rafael" → badge "Aprovada". Tentar editar → bloqueado → "criar nova versão".
7. **Envio** → destinatários pré-preenchidos → selecionar Gmail + WhatsApp → autorizar.
8. **Status** → Gmail `sent` (mostrar e-mail chegando); WhatsApp `sent`/mensagem no celular **ou** `skipped_no_credentials` com link `wa.me` aberto ao vivo.
9. **Falha isolada** → com `GMAIL_FORCE_FAIL=true` em um segundo projeto já aprovado: Gmail `failed` com mensagem legível, WhatsApp intacto, proposta continua aprovada. Repetir a autorização → mesmo delivery, sem duplicar.

Backup: vídeo gravado da jornada + PDF gerado + prints, caso a rede do evento falhe.

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| [PRODUCT_SPEC](docs/PRODUCT_SPEC.md) | Produto, personas, casos de uso, escopo, RF/RNF, aceitação, métricas, limitações |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Componentes, modelo de dados, estados, fluxos, falhas, deploy |
| [API_SPEC](docs/API_SPEC.md) | Endpoints, payloads, erros, contratos |
| [AI_PIPELINE](docs/AI_PIPELINE.md) | Etapas, schemas, prompts, validação, estimativas, testes |
| [INTEGRATIONS](docs/INTEGRATIONS.md) | Gmail, WhatsApp, env vars, estados, plano alternativo |
| [UX_FLOW](docs/UX_FLOW.md) | Telas, componentes, estados |
| [TEAM_TASKS](docs/TEAM_TASKS.md) | Divisão, dependências, marcos, contingência |
| [DECISIONS](docs/DECISIONS.md) | Decisões, hipóteses, descartes, pendências |

## Licença e dados

Projeto de hackathon. Todos os dados em `sample_data/` são fictícios e rotulados como demonstração; não representam clientes, empresas ou valores reais.
