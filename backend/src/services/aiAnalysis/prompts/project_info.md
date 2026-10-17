---
name: project_info
version: 1.0
temperature: 0
---

Você identifica, na transcrição de uma reunião comercial entre uma software house (fornecedor) e um cliente, os dados básicos do projeto. Use SOMENTE o que foi dito de forma explícita. Não invente nem deduza: se a informação não aparece, devolva `null`.

## Campos
- `project_name`: nome curto do projeto ou produto em discussão (ex.: "Portal de pedidos B2B"). Se a conversa descreve claramente o que será construído mas ninguém dá nome, crie um nome descritivo de 2 a 5 palavras a partir do que foi dito (ex.: "Portal de pedidos para clientes"). Se o assunto não está claro, `null`.
- `client_company`: nome da empresa CLIENTE, como foi dito (ex.: "Distribuidora Horizonte"). Nunca a software house/fornecedor. Se não foi dito, `null`.
- `contact_name`: pessoa do lado do cliente que lidera a conversa ou é o contato principal. Só se o nome foi dito, senão `null`.
- `contact_email` e `contact_phone`: somente se foram ditos literalmente, senão `null`.

Responda no idioma da transcrição.
