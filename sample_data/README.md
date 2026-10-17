# sample_data/

Dados de **demonstração**. Tudo aqui é fictício: empresas, pessoas, e-mails, telefones, projetos históricos e valores. Nada representa clientes ou dados reais. Nenhum arquivo deste diretório contém segredos.

| Arquivo | Dono | Status | Uso |
|---------|------|--------|-----|
| `sample_transcript_pt.txt` | A + D | a criar (T05) | Transcrição de reunião fictícia (~2.500 palavras) com itens plantados: 2 decisões confirmadas, 2 pendentes, 3 compromissos (cliente / fornecedor / condicional), 1 contradição, 3 termos vagos, 1 sugestão do fornecedor não acolhida. Ver AI_PIPELINE §11. |
| `sample_analysis_expected.json` | A | a criar (T05) | Gabarito manual: ids/categorias/status esperados para medir a extração. |
| `sample_meeting.mp3` | D | a criar (T05) | Áudio (5–8 min) da mesma reunião, gravado pela equipe. ≤ 25 MB. |
| `historical_projects.json` | A + B | a criar (T07) | 8–12 projetos fictícios `{name, tags, modules:[{name, complexity, hours_actual}], team_size, weeks}` usados pelo motor de estimativas para ajuste ±15%. Rotulado `"is_demo": true`. |
| `vendor_profile.json` | D | a criar (A06) | Software house fictícia que assina a proposta: nome, contato, site, logo (SVG), `hourly_rates` demonstrativos em BRL, `is_demo_profile: true`. |

Regras:
- Nunca substituir por dados reais de clientes, mesmo para teste local.
- Qualquer número de telefone deve ser fictício ou de um membro da equipe que consentiu (destinatário de teste do WhatsApp).
- Os JSONs de exemplo dos **contratos da API** ficam em `docs/examples/`, não aqui.
