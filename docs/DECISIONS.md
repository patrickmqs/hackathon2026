# Registro de Decisões — Proposal AI

Última atualização: 2026-10-17 (revisão 2 — stack do backend fechada em Node/TypeScript)

Este documento é a fonte de verdade sobre **o que já está decidido**, **o que é hipótese** e **o que a equipe ainda precisa decidir**. Qualquer documento que conflite com este deve ser corrigido.

Legenda de status: `CONFIRMADA` (vem do briefing ou foi fechada) · `RECOMENDADA` (escolha do arquiteto, pode ser revertida no kickoff) · `HIPÓTESE` (não validada) · `ABERTA` (a equipe decide).

---

## 1. Decisões confirmadas

| # | Decisão | Fonte |
|---|---------|-------|
| D01 | Produto é um **fluxo de trabalho** reunião → análise → proposta → revisão → aprovação → envio. Não é chatbot nem resumidor. | Briefing §2 |
| D02 | **Nenhum envio real sem aprovação explícita** de uma versão específica da proposta por um usuário identificado. | Briefing §2, §9 |
| D03 | Gerar, aprovar, enviar e entregar são **eventos distintos**, visíveis na UI e no modelo de dados. | Briefing §3 |
| D04 | Falha em um canal **não afeta** o estado do outro canal. Sem reenvio automático sem controle de duplicidade. | Briefing §3, §9 |
| D05 | A análise separa explicitamente: necessidades, requisitos, decisões, compromissos, pendências e sugestões da IA. Sugestões **nunca** aparecem como decisões do cliente. | Briefing §4 |
| D06 | A proposta é gerada a partir de **dados estruturados validados**, não de texto livre. | Briefing §5 |
| D07 | Sem invenção de preços, prazos prometidos ou dados da empresa. Estimativas por regras explícitas + histórico fictício rotulado como demonstração. | Briefing §5 |
| D08 | Frontend: Next.js/React/TypeScript/Tailwind. IA: OpenAI API. Dados: PostgreSQL. PDF: HTML/CSS + Playwright. Integrações: Gmail API OAuth 2.0 · WhatsApp Cloud API. | Briefing §7 |
| D09 | Pipeline de IA é uma **sequência de serviços em um único backend**; sem multiagentes. | Briefing §8 |
| D10 | Chaves de API apenas no backend; segredos em variáveis de ambiente; `.env.example` sem credenciais. | Briefing §9 |
| D11 | Sem autenticação fictícia apresentada como segura. Se auth completa não couber, documentar e usar modo demo controlado. | Briefing §9 |
| D12 | Sem simular sucesso de envio silenciosamente quando faltarem credenciais. | Briefing §6 |
| **D13** | **Backend em Node.js + TypeScript + Express 5**, aproveitando o scaffold existente em `backend/`, em vez de Python/FastAPI sugerido no briefing §7. Justificativa: scaffold já no repositório; um único idioma para o time inteiro em 24 h; schemas Zod compartilhados entre frontend e backend sem geração de código; SDK oficial `openai` para Node tem Structured Outputs equivalentes (`zodTextFormat`). Os contratos (API_SPEC, JSONs em `docs/examples/`) não mudam — só a implementação. | Fechada pelo time em 2026-10-17 (ex-A09) |

| **D14** | **A reunião ganha um resumo gerado por IA** (`meeting_summary`: manchete, resumo executivo, tópicos com citação, e ponteiros por id para decisões, compromissos e pendências). É artefato de apoio: **não** é fonte de verdade, não alimenta o composer da proposta nem promove decisão pendente a confirmada; porém sua geração é obrigatória para a reunião chegar a `analysis_ready`. Em caso de falha, o job termina em `failed` e pode ser reprocessado. Motivo: não encaminhar o usuário a uma revisão sem o relatório inicial concluído. Não contradiz D01 (o produto continua sendo o fluxo reunião → proposta). | Pedido do time em 2026-10-17 |

---

## 2. Decisões recomendadas (arquiteto) — válidas até o kickoff

| # | Decisão | Alternativas consideradas | Por quê |
|---|---------|---------------------------|---------|
| R01 | **Processamento assíncrono em processo** (promise disparada sem `await`, estado persistido no banco) + polling de status pelo frontend. | (a) BullMQ + Redis; (b) requisição síncrona longa; (c) SSE/WebSocket. | Transcrição + extração levam 30 s–3 min; síncrono estoura timeouts. BullMQ adiciona Redis e um ponto de falha que não compensa em 24 h. Polling a cada 2–3 s é suficiente para demo. Limitação: se o processo cair, o job é perdido — mitigado com estado `failed` via `JOB_STALE_MINUTES` e ação "reprocessar". Trocar por fila é alteração isolada em `services/aiAnalysis/orchestrator.ts`. |
| R02 | **PostgreSQL 16 via docker-compose, acesso com Prisma.** Documentos (análise, proposta) em coluna `Json`. **Sem fallback SQLite.** | (a) Drizzle; (b) Prisma com SQLite para quem não tem Docker; (c) arquivos JSON em disco. | Prisma traz migrations e client tipado em minutos. O `provider` do Prisma é fixo no schema, então suportar SQLite exigiria dois schemas — não compensa. Quem não tiver Docker usa um Postgres gratuito hospedado (Neon/Supabase) apontando `DATABASE_URL`. |
| R03 | **Modo demo de identidade:** header `X-Demo-User: <nome>` obrigatório nas operações de revisão, aprovação e autorização de envio. Sem senha, sem sessão. | (a) NextAuth + Google login; (b) API key fixa; (c) nada. | Garante rastreabilidade (quem aprovou/autorizou) sem fingir segurança. Documentado como limitação. Trocar por auth real é mudança isolada em `api/middleware/demoUser.ts`. |
| R04 | **Versões de proposta são snapshots imutáveis.** Editar cria nova versão `draft`. Aprovar grava `content_hash` (SHA-256 do JSON canônico via `fast-json-stable-stringify`). Envio referencia `approval_id`. | (a) Editar in-place com flag; (b) versionar só o PDF. | Única forma de provar que o PDF enviado é o que foi aprovado. Reprodutibilidade do documento. |
| R05 | **Idempotência de envio:** `idempotency_key` fornecida pelo cliente por delivery; unicidade `(proposal_version_id, channel, recipient_hash)` no banco. Retry só manual (P1). | (a) Retry automático com backoff; (b) sem controle. | Cumpre D04. Retry automático em canal de mensagem para cliente real é perigoso em demo. |
| R06 | **Estados por canal independentes** dentro de um `Delivery`: `queued → sending → sent → delivered`, ou `failed`, ou `skipped_no_credentials`. `delivered` só via webhook (WhatsApp) — Gmail nunca atinge `delivered`, fica em `sent` ("aceito pelo provedor"). | — | Cumpre "nenhuma afirmação de entrega baseada só na aceitação da API". |
| R07 | **Extração em 2 chamadas de LLM**: (1) extração estruturada; (2) auditoria de lacunas/contradições sobre a saída de (1) + transcrição. Ambas com Structured Outputs (`zodTextFormat`) validadas com Zod. | (a) Uma chamada gigante; (b) 6 chamadas (uma por categoria). | Uma chamada única degrada a detecção de ambiguidades; 6 chamadas multiplicam custo/latência e dificultam referências cruzadas. |
| R08 | **Composição da proposta em 1 chamada de LLM para texto** + **motor de estimativas determinístico em TypeScript** (horas, equipe, cronograma). A IA **não** produz números de esforço. | (a) IA estima tudo; (b) tudo determinístico. | Cumpre D07. Números auditáveis e explicáveis. |
| R09 | **Transcrição com `gpt-4o-transcribe`** (`OPENAI_TRANSCRIBE_MODEL`), escolhido por ter o menor erro de palavras (0,8–1,1%) em benchmark de 5 modelos ([benchmarks/transcription](benchmarks/transcription/README.md)). Não devolve segmentos nem tempo (`has_timestamps=false`); alternativa por env: `whisper-1` (segmentos com tempo, erro ~2×). `gpt-4o-transcribe-diarize` descartado como padrão (≈10× mais lento, falantes anônimos). | — | Veja H02. |
| R10 | **PDF via Playwright para Node (Chromium headless)** renderizando template **Handlebars** HTML/CSS. PDF regenerável a partir do snapshot da versão; armazenado em `STORAGE_DIR/pdfs/{proposal_id}/v{n}.pdf`. | (a) Puppeteer; (b) `@react-pdf/renderer`; (c) PDF no frontend. | Playwright é o indicado no briefing; Handlebars é lógica-mínima e seguro para dados do usuário (escape por padrão). Custo: `npx playwright install chromium` no setup e imagem `mcr.microsoft.com/playwright` no Docker. |
| R11 | **Armazenamento de arquivos em disco local** (`STORAGE_DIR`) com metadados no banco. Interface `FileStorage` para trocar por S3/R2 depois. | (a) S3 desde o início; (b) blobs no banco. | Railway tem volume persistente; S3 adiciona credenciais a configurar em 24 h. |
| R12 | **Gmail via `googleapis`**: `users.messages.send` com MIME montado por `nodemailer/lib/mail-composer` e PDF anexado; escopo mínimo `gmail.send`. Token OAuth armazenado no backend, nunca enviado ao frontend. | (a) SMTP com app password via `nodemailer`; (b) `gmail.compose`. | OAuth é o exigido. SMTP com app password é fallback aceitável se a tela de consentimento travar (INTEGRATIONS §7) — mesma lib, adapter alternativo. |
| R13 | **WhatsApp: adapter completo implementado, envio real condicionado a credenciais.** Sem credenciais → canal termina em `skipped_no_credentials` com link `wa.me` + URL de download do PDF como alternativa visível. | — | Cumpre D12. |
| R14 | **Frontend chama o backend diretamente** (`NEXT_PUBLIC_API_URL`), sem rotas BFF no Next.js. | (a) Route handlers do Next como proxy. | Menos código; CORS no Express (`cors`). Nenhum segredo precisa estar no frontend. |
| R15 | **Erros da API em formato único** `{ "error": { "code", "message", "details", "request_id" } }`, produzido por um `errorHandler` central no Express. | — | Contrato em API_SPEC §2. |
| R16 | **Prompts versionados como arquivos** em `backend/src/services/aiAnalysis/prompts/*.md` com front-matter `version:` (lido com `gray-matter`). A versão é gravada em `analysis.meta.prompt_version`. | (a) Strings no código; (b) Langfuse/PromptLayer. | Rastreabilidade sem dependência externa. |
| R17 | **Idioma padrão do conteúdo gerado: pt-BR.** Prompts instruem a responder no idioma da transcrição. | — | Público inicial é brasileiro (H05). |
| **R18** | **Schemas Zod em pacote compartilhado `shared/`** (npm workspaces: `backend`, `frontend`, `shared`). Backend valida requisições e saídas da IA com eles; frontend importa os tipos (`z.infer`) e os próprios schemas para validar formulários. Next.js com `transpilePackages: ["@proposal-ai/shared"]`. | (a) Gerar tipos TS do OpenAPI; (b) duplicar tipos à mão; (c) path alias sem workspace. | Um único lugar para o contrato; nenhuma etapa de geração. Fallback se workspaces atrasarem H0–2: copiar `shared/src/schemas/*.ts` para `frontend/src/types/` (B2 mantém em sincronia). |
| **R19** | **Express 5** (já no scaffold) com handlers `async` nativos, `multer` para upload, `cors`, `pino-http` para logs com `request_id`. **Sem** Fastify/NestJS. | (a) Fastify (validação nativa); (b) NestJS. | Trocar framework na hora 0 não paga; Express 5 já propaga rejeições de promises ao `errorHandler`. |
| **R20** | **Testes com `vitest` + `supertest`.** `npm test` roda unitários e rotas com fixtures gravadas; `npm run test:ai` (`AI_TESTS=1`) chama a OpenAI real. | (a) Jest; (b) node:test. | Vitest é rápido e lê TS sem config extra. |
| R21 | **Resumo como etapa própria (5b), depois da auditoria**, em 1 chamada com Structured Outputs, entrada = transcrição + análise validada; saída referencia itens **por id** (`key_decisions`, `pending_decisions`, `next_steps`, `open_points`). Etapa obrigatória para `analysis_ready`; gravado dentro do documento da análise (sem tabela nova); regenerável com `basis=reviewed`. | (a) Resumo na mesma chamada da extração; (b) resumo em paralelo à extração; (c) resumo só determinístico, sem LLM; (d) texto livre repetindo decisões e compromissos. | (a) sobrecarrega a extração e degrada a precisão; (b) não enxerga decisões confirmadas × pendentes e pode contradizer a análise; (c) não produz narrativa legível; (d) cria duas versões da verdade que divergem quando o revisor edita um item. Custo: +1 chamada de 10–25 s no pipeline; o job só conclui quando essa chamada tiver sucesso. |

---

## 3. Hipóteses não validadas

| # | Hipótese | Como validar | Impacto se falsa |
|---|----------|--------------|------------------|
| H01 | A chave OpenAI do time tem acesso a um modelo com **Structured Outputs** (JSON Schema estrito) e a um modelo de transcrição. | Rodar `npm run check:openai` (`scripts/check-openai.ts`) na hora 0. | Trocar `OPENAI_MODEL`; se nenhum modelo com structured outputs, usar `response_format: { type: "json_object" }` + validação Zod com retry (AI_PIPELINE §6). |
| H02 | ~~O modelo de transcrição não retorna diarização confiável.~~ **Validada em 2026-10-17:** `gpt-4o-transcribe-diarize` existe, mas levou 270 s para 10 min de áudio, deu erro de 4,6% e colapsou 2 de 4 falantes em rótulos anônimos (A, B, C). | Benchmark em `docs/benchmarks/transcription/`; repetir com gravação real. | Padrão sem diarização: `has_speakers=false`; o extrator infere o falante só pelo texto, com confiança baixa. |
| H03 | Áudios de reunião ficam ≤ 25 MB / ≤ 60 min. Acima disso o upload é rejeitado no MVP. | Verificar limites do endpoint de transcrição. | Chunking de áudio (P1) com ffmpeg. |
| H04 | A tela de consentimento OAuth do Google pode ficar em modo "Testing" com usuários de teste adicionados manualmente — suficiente para a demo. | Criar projeto GCP na hora 0; adicionar e-mails do time como testers. | Fallback R12 (SMTP + app password) ou envio para a própria conta. |
| H05 | Público inicial é software house brasileira; conteúdo em pt-BR; moeda BRL quando houver valores. | Confirmar com organizadores. | Parametrizar idioma/moeda em `vendor_profile`. |
| H06 | WhatsApp Cloud API: será possível criar app Meta + número de teste e cadastrar o telefone do demonstrador como destinatário de teste em < 2 h. | Pessoa D tenta na hora 0–3; se não conseguir até H+6, assume fallback R13. | Demo mostra `skipped_no_credentials` + link `wa.me`. |
| H07 | Envio de **documento** pelo WhatsApp fora da janela de 24 h exige template aprovado com cabeçalho de documento; dentro da janela pode ser mensagem livre. | Verificar documentação Meta na hora 0. | Demo: demonstrador envia um "oi" para o número de teste antes, abrindo a janela de 24 h. |
| H08 | Uma reunião por projeto é suficiente para o MVP (modelo permite N, UI mostra 1). | — | Nenhum: modelo já suporta N. |
| H09 | Playwright Chromium instala sem problemas no Railway via imagem `mcr.microsoft.com/playwright:v1.x-noble` (Node). | Build na hora 2–4. | Rodar backend fora do Docker na demo; ou Puppeteer com `@sparticuz/chromium`. |
| H10 | O cálculo de estimativas por regras S/M/L/XL produz números **plausíveis** para a demo (300–900 h para um sistema médio). | Rodar com `sample_data/historical_projects.json` e revisar. | Ajustar tabela em `estimation/rules.ts` — é dado, não código. |
| **H11** | `zodTextFormat` do SDK `openai` aceita os schemas Zod da análise sem ajustes além de `.nullable()` em vez de `.optional()` e ausência de `.default()`. | Teste em A2/A3 na hora 1–3. | Simplificar schema (menos aninhamento) ou gerar JSON Schema com `zod-to-json-schema` e passar manualmente. |
| **H12** | npm workspaces com `shared/` funcionam sem atrito no Next.js 16 (`transpilePackages`). | B2/C2 na hora 0–2. | Fallback de R18: copiar schemas para o frontend. |

---

## 4. Alternativas descartadas

| Alternativa | Motivo do descarte |
|-------------|--------------------|
| **Python/FastAPI** (sugerido no briefing §7) | Scaffold Node já existe no repositório; um idioma para o time; tipos compartilhados sem geração. Contratos permanecem idênticos. Registrado em D13. |
| SQLite como fallback local | Provider do Prisma é fixo no schema; manter dois schemas custa mais do que apontar para um Postgres hospedado gratuito. |
| Arquitetura multiagente (LangGraph, CrewAI, AutoGen) | Briefing §7/§8 proíbe sofisticação sem necessidade. Sequência de serviços é testável e depurável. |
| Fila com BullMQ/Redis | Infra extra, ponto de falha extra, zero ganho na demo. |
| RAG com vetores para propostas históricas | P1 no briefing. Histórico fictício tem < 20 itens — busca por similaridade de módulos por nome/tags é suficiente. |
| NextAuth / Clerk | Auth real em 24 h compete com o fluxo P0. Modo demo (R03) é honesto e isolado. |
| Geração de PDF no frontend (`@react-pdf/renderer`, jsPDF) | PDF deve ser reproduzível a partir dos dados aprovados no servidor, não do estado do navegador. |
| NestJS / Fastify | Trocar framework na hora 0 não paga; Express 5 cobre o necessário. |
| Editor WYSIWYG rico (TipTap, Slate) | Alto custo. MVP edita campos estruturados; o layout vem do template. |
| Armazenar áudio no banco | Blobs em Postgres complicam backup e deploy. Disco + metadados. |
| Envio automático após aprovação | Viola D02/D03 — aprovação e autorização de envio são eventos separados por design. |

---

## 5. Pendências técnicas (durante a implementação)

| # | Pendência | Dono | Prazo |
|---|-----------|------|-------|
| T01 | Confirmar modelos OpenAI disponíveis e fixar `OPENAI_MODEL` / `OPENAI_TRANSCRIBE_MODEL` no `.env` do time. | A | H+1 |
| T02 | Criar projeto GCP, habilitar Gmail API, OAuth consent (Testing), client web; distribuir `GOOGLE_CLIENT_ID/SECRET`. | D | H+3 |
| T03 | Criar app Meta Business, número de teste, token temporário; cadastrar telefones de teste. Decidir até H+6 se WhatsApp real entra na demo. | D | H+6 |
| T04 | Dockerfile do backend sobre `mcr.microsoft.com/playwright` e teste de geração de PDF em container. | B | H+4 |
| T05 | Gravar/preparar áudio de reunião fictícia (5–8 min) e transcrição correspondente em `sample_data/`. | D + A | H+4 |
| T06 | Definir identidade visual da proposta (logo fictício, paleta, fontes) para o template. | D | H+8 |
| T07 | Calibrar tabela de estimativas com os projetos históricos fictícios. | A + B | H+10 |
| T08 | Decidir deploy: tudo local na demo (recomendado) ou Vercel + Railway. | Todos | H+12 |
| **T09** | Converter o repositório para npm workspaces (`package.json` raiz com `backend`, `frontend`, `shared`) e mover o `package-lock.json` para a raiz. | B | H+1 |

---

## 6. Decisões ABERTAS para o kickoff

| # | Pergunta | Opções | Recomendação |
|---|----------|--------|--------------|
| A01 | 3 ou 4 pessoas? | — | Se 3: ver TEAM_TASKS §6. |
| A02 | Demo rodando local ou em cloud? | Local (docker-compose) · Vercel + Railway | **Local**, deploy como bônus. OAuth em localhost é mais simples. |
| A05 | Nome do produto e identidade visual | — | Placeholder "Proposal AI" até D decidir (T06). |
| A06 | Dados da software house fictícia que assina a proposta | — | `sample_data/vendor_profile.json` fictício, rotulado. Nunca dados reais. |
| A07 | Gmail real na demo é obrigatório? | Sim · Fallback aceitável | Tentar real (T02). Fallback: enviar para endereço do próprio time. |
| A08 | Mostrar valores monetários na proposta da demo? | Sim com rates fictícios · Não (só horas) | **Sim**, com `commercial.status = "demo_rates"` e aviso no PDF. |

Fechadas: A03 (gerenciador Python — não se aplica), A04 (→ **npm**, pelo `package-lock.json` já presente), A09 (→ **D13**, Node/TypeScript).
