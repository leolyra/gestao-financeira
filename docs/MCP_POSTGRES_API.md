# MCP — PostgreSQL via Finance API

## Decisões
- Transporte: MCP Streamable HTTP, endpoint `POST /api/v1/mcp`.
- Autenticação: mesmo JWT Bearer emitido pela API; nenhum acesso direto ao PostgreSQL.
- Sem SQL arbitrário. Consultas e mutações são ferramentas tipadas e allowlisted.
- Escrita exige aprovação explícita na conversa e chamada da ferramenta com `approved=true`.
- Auditoria de mudanças de classificação em `mcp_audit_logs`.
- Escopo padrão exclui opções, futuros, estruturados, tickers terminados em 12/13 e snapshots `spreadsheet_custodia`.

## Ferramentas
- `portfolio_assets`: lista ativos.
- `portfolio_transactions`: movimentações do usuário autenticado.
- `propose_asset_classification`: simula alteração sem gravar.
- `apply_asset_classification`: grava alteração após aprovação explícita.

## Conexão
URL: `https://api-financeira.leo.lyra.nom.br/api/v1/mcp`
Header: `Authorization: Bearer <JWT da API>`
Content-Type: `application/json`

O cliente MCP deve suportar Streamable HTTP e enviar primeiro `initialize`, depois `notifications/initialized` e chamadas `tools/list`/`tools/call`. O endpoint é stateless e responde JSON; não mantém sessão nem fornece canal SSE.

## Exemplo de initialize
```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"investment-assistant","version":"1.0.0"}}}
```

## Segurança e limitações
- Nunca usar credencial de banco no cliente MCP.
- O token JWT deve ser mantido em secret manager do cliente/orquestrador e renovado conforme expiração.
- A implementação inicial só permite alterar `assets.asset_type`; outras mutações devem ganhar ferramentas específicas, validação e auditoria antes de serem liberadas.
- Não chamar a ferramenta de aplicação sem confirmação humana explícita para aquela alteração.
- Testar primeiro em homologação e conferir logs da API.
