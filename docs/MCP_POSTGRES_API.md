# MCP — PostgreSQL via Finance API

## Decisões
- Transporte: MCP Streamable HTTP, endpoint `POST /api/v1/mcp`.
- Autenticação: mesmo JWT Bearer emitido pela API; nenhum acesso direto ao PostgreSQL.
- Sem SQL arbitrário. Consultas e mutações são ferramentas tipadas e allowlisted.
- Escrita exige aprovação explícita na conversa e chamada da ferramenta com `approved=true`.
- Auditoria de mudanças de classificação em `mcp_audit_logs`.
- Política restritiva: opções, futuros, estruturas, instrumentos ambíguos e classificações desconhecidas são sempre excluídos; não existe parâmetro para reintroduzi-los nas consultas.
- Exclui tickers terminados em 12/13 e os códigos identificados `BOVAW20`, `BRHGRUD05M14`, `BRRECRD06M15`, `BRRECRD07M14` e `BBDC1`.
- Exclui snapshots `spreadsheet_custodia`; os registros originais permanecem intactos.

## Ferramentas
- `portfolio_assets`: lista ativos.
- `portfolio_transactions`: movimentações financeiras válidas do usuário autenticado; exclui valores totais zerados.
- `portfolio_pending_reconciliation`: lista separadamente movimentações com valor zerado, ativo sem ticker ou CDB genérico, para conciliação.
- Os ativos armazenados como `JPMC3` e `JPMC34` são apresentados ao assistente como `JPMC34` (classificação **BDR**), sem alterar o cadastro original.
- Exclusões por código também verificam o nome do ativo; portanto, `BOVAW20` no nome de `BOVA11` faz o registro ser excluído por ser opção.
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


## Política de classificação aprovada — PR #12
- TAEE11 é apresentado como **Ações**.
- COIN11, HODL11, QBTC11 e QETH11 são apresentados como **Criptos**.
- IVVB11 é apresentado como **Internacional**.
- Essas regras são aplicadas na camada MCP; não alteram o cadastro original em `assets`.
- Exclusões permanentes das consultas normais: BRTRXFD11M10, BRXPMLD14M18, BOVAK20 e BOVAW20. O registro original permanece no banco.
- Regra histórica de quantidade para CDB Itaú (10.000 ou 96.000), substituída pela identificação individual por ticker na PR #14.
- A saída de `portfolio_pending_reconciliation` é estruturada para exportação em planilha: `item_id`, `current_asset_type`, `reconciliation_reasons`, `suggested_action`, `suggested_asset_type`, `user_decision`, `new_asset_type` e `decision_options`. Os campos de decisão iniciam vazios; esta ferramenta não grava decisões nem altera dados.
- A listagem de pendências é uma fila de revisão, não uma autorização para exclusão ou correção. Toda alteração exige aprovação humana explícita e processo separado.


## Correções de consistência — PR #13
- A classificação **BDR** de JPMC34 é aplicada de forma uniforme em `portfolio_assets`, `portfolio_transactions` e na fila de conciliação.
- `portfolio_transactions` usa a mesma regra de conciliação de `portfolio_pending_reconciliation`: movimentações com valor zerado, ativo sem ticker ou CDB Itaú genérico não aparecem como operações válidas.
- A PR #14 substituiu as exceções baseadas apenas em quantidade: CDB Itaú genérico permanece pendente mesmo com quantidade 10.000 ou 96.000; ticker individualizado é o critério de identificação.
- A regra de conciliação foi centralizada em uma função para evitar divergência entre as ferramentas e coberta por testes unitários.
- Nenhuma dessas regras altera registros financeiros, classificações persistidas ou dados Pluggy.


## Ajustes de conciliação — PR #14
- CDB Itaú com ticker individualizado é considerado identificado e não recebe a pendência genérica, independentemente da quantidade e do preço unitário (inclusive R$ 0,01). CDB genérico sem ticker individualizado continua pendente, inclusive nas quantidades históricas de 10.000 e 96.000.
- CDB Itaú sem ticker individualizado permanece na fila de conciliação. Valor total zerado e outras razões independentes continuam gerando pendência.
- A consulta de pendências percorre o conjunto ordenado completo em lotes (`yield_per`) e aplica o limite à quantidade de pendências encontradas, não às primeiras 1.000 movimentações brutas. Isso evita ocultar pendências antigas atrás de movimentações válidas.
- A ferramenta continua somente leitura; nenhuma alteração financeira ou sincronização Pluggy é executada.
