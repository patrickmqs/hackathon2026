# P3 — Frontend B (proposta, aprovação e envio)

Voltar: [README](README.md) · Referências: [UX_FLOW](../UX_FLOW.md) · [API_SPEC](../API_SPEC.md) · [INTEGRATIONS](../INTEGRATIONS.md)

**Funcionalidades sob responsabilidade:** F9 (tela), F10, F11, F12, F13, F14/F15 (UI), F16, F17 (Configurações).

Pastas: `app/` de proposta/envio/configurações, `features/{proposals,deliveries}`. Usa os componentes base criados com P2 (FA2).

| # | Tarefa | Prio | Janela | ⛓ | ✅ Pronto quando |
|---|--------|------|--------|---|-----------------|
| FB1 | Alinhar tokens/componentes base com P2; ler `proposal_content.example.json` e `delivery*.example.json` | P0 | H1–3 | P1:B3 | Tipos e mocks de proposta/envio prontos |
| FB2 | T9 Configurações (nome do usuário demo, status do Gmail, botão "Conectar Gmail") | P0 | H3–6 | FA1 | Nome salvo e enviado no header |
| FB3 | Mocks de proposta, versões, aprovação e delivery (todos os estados de canal) | P0 | H3–7 | FB1 | Telas desenvolvidas sem backend |
| FB4 | T6 Proposta — esqueleto: navegação por 16 seções, visualização somente leitura, estimativas com faixa e premissas ("base demonstrativa") | P0 | H6–11 | FB3 | Seções navegáveis com mock |
| FB5 | T6 — aba **Editar**: `EditableList`, módulos, estimativas somente leitura, "salvar como nova versão", bloqueio de versão aprovada | P0 | H11–16 | B9 | Criar v2 pela UI |
| FB6 | T6 — aba **PDF** (`PdfViewer`, gerar/baixar) e aba **Versões** | P0 | H15–18 | B12 | Critério "PDF" |
| FB7 | `ApprovalModal` com hash e estado "Aprovada" (badge); editar versão aprovada → "criar nova versão" | P0 | H16–18 | B13 | Critério "Aprovação" |
| FB8 | T7 Envio: `ApprovedVersionSummary`, `RecipientForm`, `ChannelSelector` com status de `/health`, modal de autorização, `idempotency_key` em `sessionStorage` | P0 | H17–20 | B10 | Autorizar envio pela UI |
| FB9 | T8 Status: `ChannelStatusCard` com todos os estados (`queued`, `sending`, `sent`, `delivered`, `failed`, `skipped_no_credentials`), alternativas (`wa.me`, `mailto`, download do PDF), polling | P0 | H19–21 | B10 | Critérios "Envio" e "Falha" |
| FB10 | Identidade visual: paleta e logo fictício; alinhar com o CSS do PDF (P1) | P0 | H10–16 | B11 | UI e PDF com a mesma identidade |
| FB11 | Polimento: estados vazio/erro/carregando, textos finais, retry manual em T8 (P1) | P0 | H21–22 | tudo | Demo sem layout quebrado em 1366×768 |

## Atenção

- Os estados de canal são o que a demo vai mostrar: `skipped_no_credentials` e `failed` precisam ser claros e **nunca** parecer sucesso.
- Gmail e WhatsApp têm status independentes: falha em um não altera o outro nem a aprovação.
- Repetir a autorização deve exibir o mesmo delivery (idempotência), sem criar novo envio.
- Se FB5 atrasar (checkpoint H+16): editor reduzido a sumário executivo, escopo, premissas e próximos passos; demais somente leitura.
