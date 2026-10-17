# sample_data/

Dados de **demonstração**. Tudo aqui é fictício: empresas, pessoas, e-mails, telefones, projetos históricos e valores. Nada representa clientes ou dados reais. Nenhum arquivo deste diretório contém segredos.

| Arquivo | Dono | Status | Uso |
|---------|------|--------|-----|
| `sample_transcript_pt.txt` | A + D | criado (~1.600 palavras) | Transcrição de reunião fictícia (~2.500 palavras) com itens plantados: 2 decisões confirmadas, 2 pendentes, 3 compromissos (cliente / fornecedor / condicional), 1 contradição, 3 termos vagos, 1 sugestão do fornecedor não acolhida. Ver AI_PIPELINE §11. |
| `sample_analysis_expected.json` | A | criado | Gabarito manual: itens/categorias/status esperados, cada um com citação-âncora literal, para medir a extração, e o bloco `expected.summary` para medir o resumo da reunião. |
| `sample_meeting.mp3` | D | **só local, não versionado** (`.gitignore`) | Áudio da mesma reunião, ~10 min (10 MB), em **voz sintética** (TTS, uma voz por participante). Regerar com `npm run tts:sample` em `scripts/` (usa `OPENAI_API_KEY`). Não é gravação de pessoas; gravação do time é opcional. Longa demais para tocar inteira na demo: a demo usa o **resumo** da reunião (`meeting_summary`) e trechos da transcrição. |
| `historical_projects.json` | A + B | criado | 10 projetos fictícios no formato `{is_demo: true, projects: [{name, tags, modules:[{name, complexity, hours_actual}], team_size, weeks}]}`, usados pelo motor de estimativas para ajuste ±15%. |
| `vendor_profile.json` | D | criado | Software house fictícia que assina a proposta: nome, contato, site, logo (SVG), `hourly_rates` demonstrativos em BRL, `is_demo_profile: true`. |

Regras:
- Nunca substituir por dados reais de clientes, mesmo para teste local.
- Qualquer número de telefone deve ser fictício ou de um membro da equipe que consentiu (destinatário de teste do WhatsApp).
- Os JSONs de exemplo dos **contratos da API** ficam em `docs/examples/`, não aqui.
