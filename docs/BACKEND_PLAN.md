# Plano de Implementação — Pessoa B (Backend & documentos)

Versão 0.1 · 2026-10-17 · Stack: Node 20+ · Express 5 · TypeScript · Zod · Prisma

Relacionados: [TEAM_TASKS.md](TEAM_TASKS.md) §3 (tarefas B1–B13) · [ARCHITECTURE.md](ARCHITECTURE.md) · [API_SPEC.md](API_SPEC.md) · [AI_PIPELINE.md](AI_PIPELINE.md) · [DECISIONS.md](DECISIONS.md)

---

## 1. Objetivo

Implementar o backend completo da Pessoa B: API REST Express, contratos Zod, persistência Prisma, rotas de projetos/reuniões/análise/propostas, motor de estimativas determinístico, versionamento imutável, geração de PDF, aprovação e auditoria — na ordem do caminho feliz primeiro (TEAM_TASKS §1).

## 2. Princípios de implementação

1. **Contratos primeiro.** Nenhuma rota sobe sem o schema Zod correspondente em `backend/src/schemas/` e o exemplo em `docs/examples/`.
2. **Rotas finas, serviços gordos.** Rotas validam entrada (Zod), chamam um serviço, mapeiam erro para o envelope padrão (API_SPEC §2).
3. **Estado explícito.** Transições de status vivem no serviço (`src/domain/`), nunca na rota.
4. **Tudo que é puro é testável isoladamente.** Regras, hash, estimativas e transições não dependem de I/O — são o alvo dos testes unitários.
5. **Nada de I/O externo em testes unitários.** OpenAI, DB e Playwright entram só em testes de integração/E2E.

## 3. Ordem de implementação (dependências)

```
B1 (esqueleto + erros) ─┐
B2 (schemas) ───────────┤
B3 (Prisma) ────────────┼─► B4 (projects/meetings) ─► B5 (orquestrador) ─► B6 (analysis)
                        │
B7 (estimativas) ───────┴─► B8 (proposals/versioning) ─► B11 (approve) ─► B12 (events, P1)
B9 (template) ─► B10 (PDF)
B13 (hardening/seed) — depois de tudo
```

**Caminho crítico de B:** B1/B2/B3 → B4 → B5 → B6 → B8 → B11.

## 4. Estrutura de pastas alvo

```text
backend/
├── src/
│   ├── index.ts                 # B1 — aplicação Express (rotas, middlewares, /health)
│   ├── app.ts                   # (opcional) app exportado separado do listen() p/ testes
│   ├── routes/                  # B4, B6, B8, B11, B12
│   │   ├── health.ts, projects.ts, meetings.ts, analysis.ts, proposals.ts, approvals.ts
│   ├── middleware/              # B6 — X-Demo-User, request_id
│   ├── core/                    # B1
│   │   ├── config.ts            # env validada com Zod
│   │   ├── errors.ts            # DomainError + envelope + status HTTP
│   │   ├── logging.ts           # request_id
│   │   └── storage.ts           # B4 — FileStorage
│   ├── domain/                  # B4/B8 — enums e transições de estado
│   ├── schemas/                 # B2 — Zod (common, errors, proposal, delivery)
│   ├── repositories/            # B3/B4 — Prisma client (única camada que fala com o DB)
│   ├── services/
│   │   ├── estimation/          # B7 — rules.ts + engine.ts + historical.ts
│   │   ├── proposal/            # B8 — builder.ts + versioning.ts
│   │   └── pdf/                 # B10 — renderer.ts
│   └── templates/               # B9 — proposal.njk + styles.css
├── prisma/
│   ├── schema.prisma            # B3
│   └── migrations/
├── tests/                       # testes unitários + rotas
├── vitest.config.ts
├── package.json
└── tsconfig.json
```

## 5. Tarefas e critérios de aceitação

| # | Tarefa | Entregável | Teste unitário associado |
|---|--------|-----------|--------------------------|
| B1 | Esqueleto Express | `index.ts`, `core/config.ts`, `core/errors.ts`, `core/logging.ts`, CORS, `/health` | `core/errors.test.ts` (envelope + status), `schemas/errors.test.ts` |
| B2 | Schemas Zod | `schemas/common.ts`, `schemas/errors.ts`, `schemas/proposal.ts`, `docs/examples/proposal_content.example.json` | `schemas/*.test.ts` (valida os exemplos) |
| B3 | Prisma | `prisma/schema.prisma` + migrate inicial + docker-compose | — (validação via `prisma migrate dev` em Postgres e SQLite) |
| B4 | Projects/Meetings | rotas `POST/GET` + `FileStorage` + validação de upload | testes de rota (supertest) sem DB |
| B5 | Orquestrador | jobs em-processo + estados de `Meeting` + `JOB_STALE_MINUTES` | `domain` transitions + teste de rota |
| B6 | Analysis | `GET/PUT` + `complete-review` + `X-Demo-User` | teste de rota com fixture |
| B7 | Estimativas | `rules.ts` + `engine.ts` + `historical.ts` | `estimation/engine.test.ts` (determinismo) |
| B8 | Proposals/versioning | `builder.ts` + `versioning.ts` + rotas | `proposal/versioning.test.ts` (hash + imutabilidade) |
| B9 | Template PDF | `proposal.njk` + `styles.css` | — (abre no navegador) |
| B10 | PDF | `pdf/renderer.ts` + rotas `POST/GET …/pdf` | teste de integração (Playwright) |
| B11 | Approve | rota approve + hash check + supersede + `events` | teste de rota + `versioning` |
| B12 | Timeline | `GET /projects/{id}/events` (P1) | teste de rota |
| B13 | Hardening | limites upload, erros legíveis, `JOB_STALE`, `scripts/seed_demo.ts` | — |

## 6. Matriz de testes unitários (o que testar por módulo)

| Módulo | Casos |
|--------|-------|
| `schemas/common` | cada enum aceita valor válido; rejeita inválido |
| `schemas/errors` | envelope valida; código inválido rejeitado; valida `docs/examples/error.example.json` |
| `core/errors` | código → status HTTP correto (400/401/404/409/422/500); `toErrorEnvelope` de `DomainError` e de erro desconhecido (não vaza detalhes) |
| `estimation/rules` | tabela de complexidade íntegra (S<M<L<XL) |
| `estimation/engine` | determinismo (mesma entrada → mesma saída); mapeamento de complexidade; sobretaxa de integração; sobretaxa NFR; incerteza amplia teto; tamanho de equipe; confiança |
| `proposal/versioning` | `canonicalStringify` ordena chaves; `contentHash` determinístico e independente da ordem; transições draft→approved→superseded; imutabilidade |

## 7. Como rodar

```bash
cd backend
npm install
npm test          # unitários (sem rede/DB)
npm run typecheck # tipos
npm run dev       # servidor
```

## 8. Status

- ✅ **Feito:** B1 (esqueleto Express + CORS + `/health` + erros), B2 (schemas + exemplos), B3 (schema Prisma **PostgreSQL/Neon** + migration `init` aplicada), B4 (Projects/Meetings + upload + `app.ts` DI), B5 (orquestrador + `StubAiPipeline` + stale), B6 (análise + `X-Demo-User`), B7 (regras + engine + `historical.ts`), B8 (versioning + `builder.ts` + rotas), B9 (template `proposal.njk` + `styles.css`), B10 (`pdf/renderer.ts` + rotas PDF + Playwright/Chromium), B11 (approve + supersede + hash), B12 (`GET /projects/{id}/events` + eventos), B13 (`scripts/seed_demo.ts` + limites de upload no multer).
- 🔗 **Depende de A:** A2 (schema análise), A5 (extração), A9 (composer) — o pipeline de IA atual é o `StubAiPipeline` (`services/ai/stub.ts`); A5/A9 substituem `createPipeline()` pela implementação OpenAI real.
- 🗄️ **Banco:** migrado para **PostgreSQL (Neon)** com a `DATABASE_URL` do `.env`. Migration `init` criada e aplicada; seed de demo validado contra o Neon via Prisma (`DEMO_MODE=false`).
