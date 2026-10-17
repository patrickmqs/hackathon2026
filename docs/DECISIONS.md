# Registro de Decisões — Proposal AI

Última atualização: 2026-10-17 (Fase 1 — análise inicial, antes da implementação)

Este documento é a fonte de verdade sobre **o que já está decidido**, **o que é hipótese** e **o que a equipe ainda precisa decidir**. Qualquer documento que conflite com este deve ser corrigido.

Legenda de status: `CONFIRMADA` (vem do briefing ou foi fechada) · `RECOMENDADA` (escolha do arquiteto, pode ser revertida no kickoff) · `HIPÓTESE` (não validada) · `ABERTA` (a equipe decide).

---

## 1. Decisões confirmadas pelo briefing

| # | Decisão | Fonte |
|---|---------|-------|
| D01 | Produto é um **fluxo de trabalho** reunião → análise → proposta → revisão → aprovação → envio. Não é chatbot nem resumidor. | Briefing §2 |
| D02 | **Nenhum envio real sem aprovação explícita** de uma versão específica da proposta por um usuário identificado. | Briefing §2, §9 |
| D03 | Gerar, aprovar, enviar e entregar são **eventos distintos**, visíveis na UI e no modelo de dados. | Briefing §3 |
| D04 | Falha em um canal **não afeta** o estado do outro canal. Sem reenvio automático sem controle de duplicidade. | Briefing §3, §9 |
| D05 | A análise separa explicitamente: necessidades, requisitos, decisões, compromissos, pendências e sugestões da IA. Sugestões **nunca** aparecem como decisões do cliente. | Briefing §4 |
| D06 | A proposta é gerada a partir de **dados estruturados validados**, não de texto livre. | Briefing §5 |
| D07 | Sem invenção de preços, prazos prometidos ou dados da empresa. Estimativas por regras explícitas + histórico fictício rotulado como demonstração. | Briefing §5 |
| D08 | Stack: Next.js/React/TS/Tailwind · Python/FastAPI/Pydantic · OpenAI API · PostgreSQL · HTML/CSS + Playwright para PDF · Gmail API OAuth 2.0 · WhatsApp Cloud API. | Briefing §7 |
| D09 | Pipeline de IA é uma **sequência de serviços em um único backend**; sem multiagentes. | Briefing §8 |
| D10 | Chaves de API apenas no backend; segredos em variáveis de ambiente; `.env.example` sem credenciais. | Briefing §9 |
| D11 | Sem autenticação fictícia apresentada como segura. Se auth completa não couber, documentar e usar modo demo controlado. | Briefing §9 |
| D12 | Sem simular sucesso de envio silenciosamente quando faltarem credenciais. | Briefing §6 |

---

## 2. Decisões recomendadas (arquiteto) — válidas até o kickoff

| # | Decisão | Alternativas consideradas | Por quê |
|---|---------|---------------------------|---------|
| R01 | **Processamento assíncrono com `BackgroundTasks` do FastAPI + polling de status pelo frontend.** | (a) Celery/RQ + Redis; (b) requisição síncrona longa; (c) SSE/WebSocket. | Transcrição + extração levam 30 s–3 min; síncrono estoura timeouts. Celery adiciona infra e um ponto de falha que não compensa em 24 h. Polling a cada 2–3 s é suficiente para demo. Limitação: se o processo cair, o job é perdido — mitigado com estado `failed` e ação "reprocessar". |
| R02 | **PostgreSQL via docker-compose como padrão; SQLite como fallback local.** SQLAlchemy 2.x + Alembic. Documentos (análise, proposta) em coluna `JSON`. | (a) Só Postgres; (b) só SQLite; (c) arquivos JSON em disco. | Postgres é o alvo de deploy (Railway). SQLite permite rodar sem Docker em 1 minuto. Usar `sqlalchemy.JSON` (não `JSONB`) mantém portabilidade. |
| R03 | **Modo demo de identidade:** header `X-Demo-User: <nome>` obrigatório nas operações de revisão, aprovação e autorização de envio. Sem senha, sem sessão. | (a) NextAuth + Google login; (b) API key fixa; (c) nada. | Garante rastreabilidade (quem aprovou/autorizou) sem fingir segurança. Documentado como limitação. Trocar por auth real é mudança isolada em `api/dependencies.py`. |
| R04 | **Versões de proposta são snapshots imutáveis.** Editar cria nova versão `draft`. Aprovar grava `content_hash` (SHA-256 do JSON canônico). Envio referencia `approval_id`. | (a) Editar in-place com flag; (b) versionar só o PDF. | Única forma de provar que o PDF enviado é o que foi aprovado. Reprodutibilidade do documento. |
| R05 | **Idempotência de envio:** `idempotency_key` fornecida pelo cliente por delivery; unicidade `(proposal_version_id, channel, recipient)` no banco. Retry só manual (P1). | (a) Retry automático com backoff; (b) sem controle. | Cumpre D04. Retry automático em canal de mensagem para cliente real é perigoso em demo. |
| R06 | **Estados por canal independentes** dentro de um `Delivery`: `queued → sending → sent → delivered`, ou `failed`, ou `skipped_no_credentials`. `delivered` só via webhook (WhatsApp) — Gmail nunca atinge `delivered`, fica em `sent` ("aceito pelo provedor"). | — | Cumpre "nenhuma afirmação de entrega baseada só na aceitação da API". |
| R07 | **Extração em 2 chamadas de LLM**: (1) extração estruturada; (2) auditoria de lacunas/contradições sobre a saída de (1) + transcrição. Ambas com Structured Outputs + Pydantic. | (a) Uma chamada gigante; (b) 6 chamadas (uma por categoria). | Uma chamada única degrada a detecção de ambiguidades; 6 chamadas multiplicam custo/latência e dificultam referências cruzadas. |
| R08 | **Composição da proposta em 1 chamada de LLM para texto** (sumário executivo, contexto, objetivos, arquitetura em prosa) + **motor de estimativas determinístico em Python** (horas, equipe, cronograma). A IA **não** produz números de esforço. | (a) IA estima tudo; (b) tudo determinístico. | Cumpre D07. Números auditáveis e explicáveis ("justificativas" vira P1 barato). |
| R09 | **Transcrição com modelo configurável** via `OPENAI_TRANSCRIBE_MODEL` (padrão sugerido `gpt-4o-transcribe`; alternativa `whisper-1`). Diarização **não** é garantida — a análise registra `has_speakers=false` quando ausente. | — | Veja H02. |
| R10 | **PDF via Playwright (Chromium headless)** renderizando template Jinja2 HTML/CSS. PDF regenerável a partir do snapshot da versão; armazenado em `STORAGE_DIR/pdfs/{proposal_id}/v{n}.pdf`. | (a) WeasyPrint; (b) ReportLab; (c) PDF no frontend. | Confirmado no briefing. Único custo: `playwright install chromium` no setup e no Dockerfile. |
| R11 | **Armazenamento de arquivos em disco local** (`STORAGE_DIR`) com metadados no banco. Interface `FileStorage` para trocar por S3/R2 depois. | (a) S3 desde o início; (b) blobs no banco. | Railway tem volume persistente; S3 adiciona credenciais a configurar em 24 h. |
| R12 | **Gmail: envio via `users.messages.send`** com MIME multipart e PDF anexado; escopo mínimo `gmail.send`. Token OAuth armazenado no backend, nunca enviado ao frontend. | (a) SMTP com app password; (b) `gmail.compose`. | OAuth é o exigido. SMTP com app password é fallback aceitável se a tela de consentimento travar (INTEGRATIONS §7). |
| R13 | **WhatsApp: adapter completo implementado, envio real condicionado a credenciais.** Sem credenciais → canal termina em `skipped_no_credentials` com link `wa.me` + URL de download do PDF como alternativa visível. | — | Cumpre D12. |
| R14 | **Frontend chama o backend diretamente** (`NEXT_PUBLIC_API_URL`), sem rotas BFF no Next.js. | (a) Route handlers do Next como proxy. | Menos código; CORS no FastAPI. Nenhum segredo precisa estar no frontend. |
| R15 | **Erros da API em formato único** `{ "error": { "code", "message", "details", "request_id" } }`. | — | Contrato em API_SPEC §2. |
| R16 | **Prompts versionados como arquivos** em `backend/app/services/ai_analysis/prompts/*.md` com cabeçalho `version:`. A versão é gravada em `analysis.meta.prompt_version`. | (a) Strings no código; (b) Langfuse/PromptLayer. | Rastreabilidade sem dependência externa. |
| R17 | **Idioma padrão do conteúdo gerado: pt-BR.** Prompts instruem a responder no idioma da transcrição. | — | Público inicial é brasileiro (H05). |

---

## 3. Hipóteses não validadas

| # | Hipótese | Como validar | Impacto se falsa |
|---|----------|--------------|------------------|
| H01 | A chave OpenAI do time tem acesso a um modelo com **Structured Outputs** (JSON Schema estrito) e a um modelo de transcrição. | Rodar `scripts/check_openai.py` na hora 0. | Trocar `OPENAI_MODEL`; se nenhum modelo com structured outputs, usar `json_object` + validação Pydantic com retry (AI_PIPELINE §6). |
| H02 | O modelo de transcrição **não** retorna diarização confiável de falantes. | Testar com o áudio de `sample_data/` na hora 0–2. | Se retornar, ativar `has_speakers=true` e passar falantes ao extrator. Se não, extrator infere falante só quando o texto deixa óbvio e marca confiança baixa. |
| H03 | Áudios de reunião ficam ≤ 25 MB / ≤ 60 min. Acima disso o upload é rejeitado no MVP. | Verificar limites do endpoint de transcrição. | Chunking de áudio (P1) com ffmpeg. |
| H04 | A tela de consentimento OAuth do Google pode ficar em modo "Testing" com usuários de teste adicionados manualmente — suficiente para a demo. | Criar projeto GCP na hora 0; adicionar e-mails do time como testers. | Fallback R12 (SMTP + app password) ou envio para a própria conta. |
| H05 | Público inicial é software house brasileira; conteúdo em pt-BR; moeda BRL quando houver valores. | Confirmar com organizadores. | Parametrizar idioma/moeda em `vendor_profile`. |
| H06 | WhatsApp Cloud API: será possível criar app Meta + número de teste e cadastrar o telefone do demonstrador como destinatário de teste em < 2 h. | Pessoa D tenta na hora 0–3; se não conseguir até H+6, assume fallback R13. | Demo mostra `skipped_no_credentials` + link `wa.me`. |
| H07 | Envio de **documento** pelo WhatsApp fora da janela de 24 h exige template aprovado com cabeçalho de documento; dentro da janela pode ser mensagem livre. | Verificar documentação Meta na hora 0. | Demo: demonstrador envia um "oi" para o número de teste antes, abrindo a janela de 24 h. |
| H08 | Uma reunião por projeto é suficiente para o MVP (modelo permite N, UI mostra 1). | — | Nenhum: modelo já suporta N. |
| H09 | Playwright Chromium instala sem problemas no Railway via imagem `mcr.microsoft.com/playwright/python`. | Build na hora 2–4. | Fallback WeasyPrint (mesmo template HTML, CSS mais limitado). |
| H10 | O cálculo de estimativas por regras S/M/L/XL produz números **plausíveis** para a demo (300–900 h para um sistema médio). | Rodar com `sample_data/historical_projects.json` e revisar. | Ajustar tabela em `estimation/rules.py` — é dado, não código. |

---

## 4. Alternativas descartadas

| Alternativa | Motivo do descarte |
|-------------|--------------------|
| Arquitetura multiagente (LangGraph, CrewAI, AutoGen) | Briefing §7/§8 proíbe sofisticação sem necessidade. Sequência de serviços é testável e depurável. |
| Fila com Celery/Redis | Infra extra, ponto de falha extra, zero ganho na demo. Trocar `BackgroundTasks` por fila é alteração isolada em `services/orchestrator.py`. |
| RAG com vetores para propostas históricas | P1 no briefing. Histórico fictício tem < 20 itens — busca por similaridade de módulos por nome/tags em Python é suficiente. |
| NextAuth / Clerk | Auth real em 24 h compete com o fluxo P0. Modo demo (R03) é honesto e isolado. |
| Geração de PDF no frontend (react-pdf, jsPDF) | PDF deve ser reproduzível a partir dos dados aprovados no servidor, não do estado do navegador. |
| Editor WYSIWYG rico (TipTap, Slate) | Alto custo. MVP edita campos estruturados (textareas + listas); o layout vem do template. |
| Armazenar áudio no banco | Blobs em Postgres complicam backup e deploy. Disco + metadados. |
| Envio automático após aprovação | Viola D02/D03 — aprovação e autorização de envio são eventos separados por design. |

---

## 5. Pendências técnicas (durante a implementação)

| # | Pendência | Dono | Prazo |
|---|-----------|------|-------|
| T01 | Confirmar modelos OpenAI disponíveis e fixar `OPENAI_MODEL` / `OPENAI_TRANSCRIBE_MODEL` no `.env` do time. | A | H+1 |
| T02 | Criar projeto GCP, habilitar Gmail API, OAuth consent (Testing), client web; distribuir `GOOGLE_CLIENT_ID/SECRET`. | D | H+3 |
| T03 | Criar app Meta Business, número de teste, token temporário; cadastrar telefones de teste. Decidir até H+6 se WhatsApp real entra na demo. | D | H+6 |
| T04 | Build do Dockerfile do backend com Playwright e teste de geração de PDF em container. | B | H+4 |
| T05 | Gravar/preparar áudio de reunião fictícia (5–8 min) e transcrição correspondente em `sample_data/`. | D + A | H+4 |
| T06 | Definir identidade visual da proposta (logo fictício, paleta, fontes) para o template. | D | H+8 |
| T07 | Calibrar tabela de estimativas com os projetos históricos fictícios. | A + B | H+10 |
| T08 | Decidir deploy: tudo local na demo (recomendado) ou Vercel + Railway. | Todos | H+12 |

---

## 6. Decisões ABERTAS para o kickoff

| # | Pergunta | Opções | Recomendação |
|---|----------|--------|--------------|
| A01 | 3 ou 4 pessoas? | — | Se 3: ver TEAM_TASKS §6. |
| A02 | Demo rodando local ou em cloud? | Local (docker-compose) · Vercel + Railway | **Local**, deploy como bônus. OAuth em localhost é mais simples. |
| A03 | Gerenciador de pacotes Python | `uv` · `poetry` · `pip` + venv | **`uv`**; `pip install -e .` funciona igual. |
| A04 | Gerenciador JS | `pnpm` · `npm` | **`pnpm`**; `npm` serve. |
| A05 | Nome do produto e identidade visual | — | Placeholder "Proposal AI" até D decidir (T06). |
| A06 | Dados da software house fictícia que assina a proposta | — | `sample_data/vendor_profile.json` fictício, rotulado. Nunca dados reais. |
| A07 | Gmail real na demo é obrigatório? | Sim · Fallback aceitável | Tentar real (T02). Fallback: enviar para endereço do próprio time. |
| A08 | Mostrar valores monetários na proposta da demo? | Sim com rates fictícios · Não (só horas) | **Sim**, com `commercial.status = "demo_rates"` e aviso no PDF. |
| A09 | **Stack do backend: o repositório `hackathon2026` já contém um scaffold Node + Express + TypeScript (`backend/src/index.ts`, hello-world com `/health`), enquanto o briefing (§7) e toda esta documentação assumem Python + FastAPI + Pydantic.** | (a) Substituir o scaffold por FastAPI conforme o briefing · (b) Manter Node/Express e portar os contratos (Pydantic → Zod, Playwright Node, SDK OpenAI JS) | **(a) FastAPI**, pelo briefing e pelo SDK Python oficial da OpenAI com Structured Outputs já previsto no AI_PIPELINE. Se o time preferir (b), os contratos (API_SPEC, schemas JSON em `docs/examples/`) permanecem válidos; muda só a implementação — ARCHITECTURE §2.2, TEAM_TASKS e README precisam ser revisados. Decidir **antes de H+2**, pois bloqueia B1/B2. |
