# P2 — Frontend A (entrada e revisão)

Voltar: [README](README.md) · Referências: [UX_FLOW](../UX_FLOW.md) · [API_SPEC](../API_SPEC.md)

**Funcionalidades sob responsabilidade:** F1, F2, F3 (telas), F6, F7, F17 (usuário demo), F18 (timeline).

Pastas: setup do `frontend/`, `services/api.ts`, `lib/`, `features/{projects,meetings,analysis}`.

| # | Tarefa | Prio | Janela | ⛓ | ✅ Pronto quando |
|---|--------|------|--------|---|-----------------|
| FA1 | Bootstrap Next.js (App Router, TS, Tailwind), layout base, `DemoUserBadge`, `services/api.ts` (envelope de erro, `X-Demo-User`, toast) | P0 | H0–2 | — | App sobe; erro padrão aparece em toast |
| FA2 | Componentes base compartilhados com P3 (Button, Card, Badge, Modal, Toast, Skeleton, EmptyState) — combinar tokens Tailwind antes | P0 | H1–3 | FA1 | P3 usa os mesmos componentes |
| FA3 | Mocks em `lib/mocks/` a partir de `docs/examples/*.json` + `NEXT_PUBLIC_USE_MOCKS`; tipos importados de `shared` | P0 | H1–3 | P4:A2, P1:B3 | Telas rodam sem backend |
| FA4 | T1 Dashboard + T2 Novo projeto | P0 | H2–5 | FA1 | Criar projeto na API real (B5) ou mock |
| FA5 | T3 Projeto: `FlowStepper` e cards por etapa com bloqueios | P0 | H4–7 | FA4 | Stepper reflete `status` |
| FA6 | T4 Nova reunião: abas texto/áudio, dropzone, `ProcessingPanel` com polling, erro + reprocessar | P0 | H5–8 | FA5, B5 | Critérios "Reunião (texto)" |
| FA7 | T5 Revisão — estrutura: `AnalysisSections` por categoria, barra de progresso, salvar/concluir | P0 | H7–10 | FA3, B7 | **Marco H+10:** revisar e concluir pela UI |
| FA8 | T5 Revisão — `ReviewableItemCard` (confirmar/editar/rejeitar/precisa esclarecimento, edição inline), `TranscriptPane` com destaque da citação, rótulo visual de sugestão da IA e de decisão pendente × confirmada | P0 | H9–13 | FA7 | Critérios "Análise" e "Revisão" |
| FA8b | T5/T3 — `SummaryPanel` (manchete, resumo executivo, tópicos com salto para a transcrição, chips por id que levam ao item, badge de base, "Atualizar resumo", "Copiar resumo", estado vazio) e resumo no card da reunião em T3; mock a partir de `docs/examples/summary.example.json` | P0 | H10–13 | FA8, P4:IA17 | UX_FLOW T5; leitura do resumo ≲ 1 min |
| FA9 | Guard de alterações não salvas; estados vazio/erro/carregando em todas as telas | P0 | H13–16 | FA8 | Sem erro no console |
| FA10 | Ajudar P3 (editor de proposta / tela de envio) conforme gargalo | P0 | H14–20 | — | Combinado no checkpoint H+14 |
| FA11 | `EventTimeline` em T3 | P1 | H20–22 | P1:B17 | — |
| FA12 | Polimento responsivo (1366×768), textos finais com P4 | P0 | H21–22 | tudo | Demo sem layout quebrado |

## Atenção

- **A tela de Revisão (FA7–FA8) é a mais complexa do front.** Começar por mock desde H+3 para não depender do backend.
- Itens da IA têm `confidence` e podem ter `limitations`: mostrar ícone de alerta quando a citação não foi encontrada na transcrição.
- Sugestões da IA sempre com rótulo e cor distinta (nunca parecer decisão do cliente).
