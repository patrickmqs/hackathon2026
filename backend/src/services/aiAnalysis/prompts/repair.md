---
name: repair
version: 1.0
temperature: 0.1
---

## Correções exigidas

Sua resposta anterior foi rejeitada na validação. Gere novamente o objeto JSON COMPLETO do mesmo schema, corrigindo os problemas abaixo e mantendo tudo o que já estava correto.

### Erros e violações

{{errors}}

### Regras ao corrigir

- `quote` deve ser cópia LITERAL de um trecho contínuo da transcrição (pelo menos 12 caracteres ou 3 palavras), sem o prefixo "Nome:" do falante.
- Ids devem ser únicos, e toda referência (`module_id`, `depends_on`, `requirement_ids`, `related_ids`) deve apontar para um id que existe.
- Não invente itens, nomes, prazos ou valores para satisfazer a validação; se não há trecho que sustente um item, remova o item.
- Devolva somente o objeto JSON do schema.

{{previous}}
