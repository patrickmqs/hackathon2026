# Handoff — P4 (IA) · estado em 2026-10-17 (atualizado após integrar o backend do P1)

Documento para quem continuar o trabalho de IA em outra sessão. Fonte de verdade das tarefas: [roadmap/04-ia.md](roadmap/04-ia.md). Contratos: [AI_PIPELINE.md](AI_PIPELINE.md).

## 1. Estado das tarefas

| # | Tarefa | Estado |
|---|--------|--------|
| IA1 | `scripts/check-openai.ts` | Feito |
| IA2 | Schemas Zod (`shared/src/schemas/analysis.ts`, `proposal.ts`) | Feito, inclui `meeting_summary` |
| IA3 | `integrations/openai/client.ts` (retry, log, erros tipados) | Feito |
| IA4 | Transcrição fictícia + gabarito | Feito |
| IA5 | `extract.md` + `extract.ts` | Feito |
| IA6 | `validators.ts`, `validateGapAudit` | Feito |
| IA7 | `gap_audit.md` + `gapAudit.ts` | Feito |
| IA8 | `services/transcription/service.ts` | Feito |
| IA9 | `historical_projects.json`, `vendor_profile.json`, áudio | Parcial: JSONs prontos; áudio é **sintético e só local** |
| IA10 | `compose_proposal.md` + `composer.ts` | Feito |
| IA11 | Estimativas | **O P1 entregou `engine.ts`** (316–596 h, 7 semanas na reunião de exemplo, sem sobretaxa de integração: chamei só com módulos). Falta calibrar com o histórico e passar integração/NFR/pendências ao motor |
| IA12 | Repair | Feito, dentro de `pipeline.ts` (`analyzeMeeting`) |
| IA13 | Suíte `tests/ai` consolidada | Parcial: testes ao vivo existem, falta um comando único e a meta de gabarito estabilizada |
| IA14 | E2E (`scripts/e2e-demo.ts`) | Não iniciado; depende das rotas do P1 |
| IA15 | `rationale` por linha de estimativa | Não iniciado; depende do motor |
| IA16 | Roteiro e ensaio da demo | Não iniciado |
| IA17 | Resumo da reunião (`summarize.ts`, `summaryValidator.ts`) | Feito |

## 2. Próximos passos, em ordem

1. **Recarregar o saldo da OpenAI** (os créditos acabaram durante os testes: `429 You have no credits remaining`). Nada ao vivo é confiável até isso.
2. **Calibrar as estimativas:** o builder do P1 já passa `integrationCount`, `nfrCount` e `unresolvedEffortIssues` ao `estimate()`; falta calibrar `rules.ts` com `sample_data/historical_projects.json` e conferir a faixa na reunião de exemplo (meta 300–900 h).
2b. **Rodar o composer de verdade (com crédito)** via `POST /projects/{id}/proposals` e ler o texto gerado: até aqui só foi testado com composer falso na API e ao vivo isolado.
3. **Medir a estabilidade da extração:** `AI_RUNS=4 AI_TESTS=1 node --env-file=../.env node_modules/vitest/vitest.mjs run tests/ai/robustness.live.test.ts` (em `backend/`). Ler o resultado antes de mexer em prompt.
4. **Estabilizar `dec_web_first` e `dec_faturamento_erp`**, que oscilam entre execuções. Causa observada: o extrator deixa `agreed_by` vazio (ou só com um nome) e a decisão é rebaixada a `pending_validation` ("ninguém registrado em agreed_by"). Se continuar abaixo de 3/4, o ajuste é no `extract.md`.
5. IA13 (comando único e gabarito), IA14 (E2E, quando as rotas existirem), IA15, IA16.

## 3. Resultados medidos (fonte dos números)

- **Transcrição** — [benchmarks/transcription/README.md](benchmarks/transcription/README.md): 5 modelos, 2 rodadas, áudio sintético de 10 min. `gpt-4o-transcribe` venceu (erro de 0,8% a 1,1%; 0,63% de diferença entre rodadas). Não devolve timestamps. Decisão em DECISIONS **R09/H02**. Só é firme depois de testar com **gravação real**.
- **Pipeline sobre o texto do áudio (sem falantes), 8 execuções:** compromisso condicional do Carlos nunca `confirmed`; contradição do crédito detectada; citações 100% literais; sugestão do fornecedor nunca vira decisão; dono do compromisso da proposta sai "não identificado" (antes era atribuído errado a Rafael).
- **Variação alta entre execuções.** Gabarito por âncora deu 93% e 73% em rodadas diferentes; por conteúdo, `dec_web_first` 1/4 a 3/4 e `dec_faturamento_erp` 2/4. Não confie em uma execução só.
- **Resumo:** em execução com crédito, existia, ≤ 5 pontos em aberto, decisões nas listas certas, contradição listada. O "resumo ausente" visto em uma rodada foi **falta de crédito**, não falha de qualidade.

## 4. Como rodar

```bash
# sem chamadas à OpenAI (suíte padrão)
cd backend && npx tsc --noEmit && npx vitest run          # 122 testes, ~7 ao vivo ignorados
cd shared  && npx tsc --noEmit && npx vitest run          # 10 testes

# ao vivo (gasta crédito) — use --env-file; `source .env` é bloqueado em agentes
cd backend && AI_TESTS=1 node --env-file=../.env node_modules/vitest/vitest.mjs run tests/ai/<arquivo>.live.test.ts

# scripts (em scripts/)
npm run check:openai
npm run tts:sample                     # regera o áudio sintético em sample_data/ (só local)
npm run bench:transcribe -- <audio>    # compara 5 modelos de transcrição
```

`.env` na raiz (no `.gitignore`): `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-4.1`, `OPENAI_TRANSCRIBE_MODEL=gpt-4o-transcribe`.

## 5. Mapa do código

| Área | Arquivos |
|------|----------|
| Contratos | `shared/src/schemas/{analysis,proposal}.ts` · exemplos em `docs/examples/` |
| Orquestração | `backend/src/services/aiAnalysis/pipeline.ts` (`analyzeMeeting`: extrai → valida → audita → resume; `onProgress`; resumo obrigatório para concluir) |
| Extração / auditoria / resumo | `aiAnalysis/{extract,gapAudit,summarize}.ts` · prompts em `aiAnalysis/prompts/*.md` (+ `repair.md`) |
| Validação | `aiAnalysis/{validators,summaryValidator}.ts` |
| Transcrição | `services/transcription/{service,types}.ts` |
| Proposta | `services/proposal/composer.ts` (`assertNumbersUnchanged`, `assertModulesMatch`) |
| Estimativas | `services/estimation/rules.ts` (**falta `engine.ts`**) |
| OpenAI | `integrations/openai/client.ts` (retry 1/3/8 s; sem retry em 400/401/413 nem em `insufficient_quota`) |
| Dados | `sample_data/` (transcrição, gabarito, histórico, fornecedor) |
| Testes ao vivo | `backend/tests/ai/*.live.test.ts` (`robustness` é o mais completo) |

## 6. Decisões e limites que a próxima sessão precisa saber

- **A IA redige, não estima.** Números só do motor determinístico; o composer valida isso em código.
- **O resumo referencia itens por id** e nunca promove decisão pendente (DECISIONS D14/R21).
- **Sem rótulos de falante (áudio):** o dono do compromisso só é preenchido se a própria fala o identifica; senão "não identificado" e o compromisso vira `tentative`. Os donos precisam ser conferidos na revisão humana.
- **`GapAuditOutput.downgrades.to` não tem `conditional`.** O pipeline nunca rebaixa `conditional`/`tentative`/`pending_validation`. Mudar isso exige editar `shared/`.
- **O checador de números do composer** (`findNumberViolations`) não cobre números por extenso e isenta contextos como SLA e duração de reunião.
- **Transcrição do áudio não tem tempo** (`has_timestamps=false`): o "ver na transcrição" destaca o trecho sem `mm:ss`.

## 7. Integração com o backend do P1 (feita localmente, ainda não enviada)

- `services/ai/openai.ts` (`OpenAiPipeline`) implementa o contrato `AiPipeline` dele; `createPipeline()` usa o real quando há `OPENAI_API_KEY` e o stub caso contrário (`AI_PIPELINE=stub` força o stub). O runner agora passa `filename` para preservar a extensão do áudio. Testado só com mocks: **nunca rodou contra a OpenAI neste caminho** (sem crédito).
- **Bug corrigido:** `backend/src/schemas/analysis.ts` descartava `meeting_summary` ao validar, então `PUT /analysis` apagava o resumo. Agora o campo existe (`default(null)`, compatível com análises antigas). Há teste de regressão.
- **Dívida:** existem dois schemas de análise (`shared/` e `backend/src/schemas/`) e dois de proposta. Ambos validam os exemplos, mas podem divergir. Unificar em `shared/` exige ajustar fixtures dele (`meeting_id` dele é `z.string()`, o meu é UUID).
- O P1 trocou `UNCERTAINTY_PCT` (array → objeto) e `NFR_SURCHARGE_MIN_COUNT` (→ `_MIN_REQUIREMENTS`) em `rules.ts`; ajustei o meu teste.
- `npx prisma generate` é necessário depois do `npm install` para o typecheck passar.

- **Composer ligado à API (feito):** `services/proposal/compose-step.ts` roda DEPOIS do `buildProposalContent` e troca só os campos de texto (nunca estimativas, equipe, cronograma, valores, cliente, fornecedor, meta). `AppDeps.composer` é opcional; `createComposer()` devolve o real com `OPENAI_API_KEY` e sem `AI_PIPELINE=stub`. **Não bloqueante:** se a IA falha, a proposta é criada com o texto determinístico e o aviso vai para `console.warn`. O resultado valida em `ProposalContentSchema`. Testes com composer falso (unitário e rota).
- O fornecedor passado ao composer é `content.vendor` do builder ("Proposal AI (demo)"), não `sample_data/vendor_profile.json`.

## 7a. Frontend integrado à API (branch `ia/frontend-integracao`)

- `frontend/src/lib/api.ts` (cliente tipado, `NEXT_PUBLIC_API_URL`, header `X-Demo-User` via `localStorage["demoUser"]`), `components/Api.tsx` (`useLoad`, `ErrorBanner`) e `components/integration.css` (CSS próprio; `globals.css` do time não foi tocado).
- Telas ligadas, mantendo o desenho e as classes do time: Home (lista real; sem API cai nos mocks com aviso), Novo projeto, Nova reunião (texto/áudio + polling), Revisão (resumo da reunião no topo, confirmar/editar/rejeitar/esclarecer com `PUT /analysis`, transcrição real com a citação destacada, concluir revisão e gerar proposta), Proposta (versões, edição de texto, PDF, aprovação com hash, imutabilidade) e Projeto (etapas e timeline reais).
- Teste de UI (Playwright headless, 18 verificações) contra um backend com pipeline falso: todas passaram. **Nunca rodou contra a IA real** (sem crédito) nem em navegador de pessoa.
- Next 16 com `cacheComponents`: páginas com `useParams()` precisam de `<Suspense>` (já aplicado nas quatro dinâmicas).
- **Pendências:** `proposals/[id]/deliveries/new/entrega.tsx` foi renomeado pelo time e a rota **não existe** (o botão "Preparar envio" leva a 404); `deliveries/[id]` e `settings` seguem com dados fixos; os gráficos da Home ainda usam mocks; a revisão não tem campo de nota do revisor nem toggle de decisão confirmada/pendente.

## 7b. Atenção com o time (ainda não comunicado ao P1/P2/P3)

- Alterei `backend/tsconfig.json` (`rootDir: ".."`, `include` de `../shared/src`) e o script `start` do `backend/package.json` (agora `node dist/backend/src/index.js`). Um Dockerfile precisa seguir esse caminho.
- O contrato do resumo mudou: `GET/POST /meetings/{id}/summary`, `progress.step=summarizing` (API_SPEC §4.4). Tarefas novas: **B7b** (P1) e **FA8b** (P2).
- O orquestrador do job (B6) deve chamar `analyzeMeeting` e gravar `progress.step`.
- `docs/roadmap/` e `TEAM_TASKS.md` já citam IA17, B7b e FA8b.

## 8. Higiene do repositório e segurança

- **A chave da OpenAI passou pelo chat** (e está no `.env` local). Revogar e gerar outra depois do hackathon.
- O `sample_meeting.mp3` (10 MB, voz sintética) **não é versionado** (`.gitignore`); regerar com `npm run tts:sample`.
- Branches locais que podem ser apagadas: `ia/p4-base`, `ia/p4-sample-data`, `backup/local-first-commit`, `worktree-agent-*`. Os worktrees de agentes ficam em `.claude/worktrees/` (ignorado).
- Trabalho vai direto na `main` (decisão do usuário). Antes de empurrar, `git fetch` e rebase: o time também empurra (frontend).
