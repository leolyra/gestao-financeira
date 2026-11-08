# n8n Workflow Gateway

Serviço independente para listar workflows e receber propostas de criação/atualização via API do n8n. Não altera o serviço n8n existente e não acessa PostgreSQL.

## Segurança e fluxo de aprovação

- Cliente: `Authorization: Bearer GATEWAY_API_TOKEN`.
- A API key do n8n fica somente no servidor (`N8N_API_KEY`).
- Escritas diretas foram removidas. Não existem endpoints diretos de criação/atualização, execução ou exclusão.
- O cliente autenticado cria uma proposta em `POST /v1/proposals`. Isso apenas registra a operação; não chama a API de escrita do n8n.
- n8n consulta propostas pendentes em `GET /v1/proposals/pending`.
- Após receber uma confirmação de callback do Telegram, o workflow n8n chama `POST /v1/proposals/{id}/approve` com os cabeçalhos `X-Telegram-Bridge-Token` e `X-Telegram-User-Id`.
- O Gateway exige o segredo de integração e compara o ID numérico com `TELEGRAM_ALLOWED_USER_ID`.
- A aprovação é vinculada ao conteúdo validado, possui prazo de validade (1 a 30 minutos; padrão 10), é reivindicada atomicamente e só pode ser usada uma vez.
- Propostas expiradas, concluídas, rejeitadas ou em execução não podem ser decididas novamente. Aprovação e rejeição usam transação SQLite `BEGIN IMMEDIATE`; apenas uma decisão concorrente pode vencer. O ator e o horário da rejeição são persistidos.
- Em falha/timeout na chamada ao n8n, a proposta não é reexecutada automaticamente. Isso evita duplicidade; uma falha de rede pode deixar o resultado externo indeterminado e exige conferência manual.
- Auditoria registra ação, recurso, resultado, horário, IP e aprovador; não registra tokens nem payloads.

## Endpoints

- `GET /health`: health check.
- `GET /v1/workflows`: lista workflows.
- `POST /v1/proposals`: registra uma proposta de criação ou atualização.
- `GET /v1/proposals/pending`: lista propostas pendentes para o workflow de aprovação.
- `POST /v1/proposals/{id}/approve`: aprova e executa uma proposta, apenas pela ponte Telegram autenticada.\n- `POST /v1/proposals/{id}/reject`: rejeita uma proposta sem executar nada; aprovação e rejeição disputam a mesma transição atômica.

### Exemplo de proposta de criação

```json
{
  "operation": "create_workflow",
  "payload": {
    "name": "Novo workflow",
    "nodes": [],
    "connections": {}
  },
  "ttl_minutes": 10
}
```

Para atualização, use `operation: "update_workflow"`, informe `workflow_id` e envie somente os campos a atualizar em `payload`.

## Variáveis de ambiente

- `N8N_BASE_URL=http://n8n_n8n:5678` (rede interna).
- `N8N_API_KEY`: API key do n8n, somente no Easypanel.
- `GATEWAY_API_TOKEN`: autenticação dos clientes que criam/listam propostas.
- `TELEGRAM_APPROVAL_BRIDGE_TOKEN`: segredo aleatório compartilhado somente entre n8n e Gateway.
- `TELEGRAM_ALLOWED_USER_ID=157555157`: ID numérico autorizado a aprovar.
- `APPROVAL_DB_PATH=/data/approvals.sqlite3`: SQLite persistente das propostas.

Não reutilize encryption key, token de runner, senha do banco ou JWT da API financeira. Gere o segredo da ponte Telegram independentemente dos demais segredos.

## Persistência no Easypanel

O container roda como usuário não-root `10001`. Monte um volume persistente em `/data`; sem esse volume, propostas e estado de uso único podem ser perdidos em um redeploy.

## Integração Telegram/n8n

A ponte Telegram ainda precisa ser configurada no n8n e não faz parte deste serviço Gateway. O workflow deve aceitar somente updates originados do Telegram e, para botões inline, validar o remetente em `callback_query.from.id` (e, se restringir conversas privadas, também `callback_query.message.chat.type`). Para mensagens comuns, validar `message.from.id`. Comparar o ID numérico com `TELEGRAM_ALLOWED_USER_ID` antes de qualquer chamada ao Gateway. Nunca aceitar o ID informado livremente em texto, callback_data ou cabeçalhos enviados pelo usuário; o ID do cabeçalho deve ser montado pelo workflow a partir do update validado.\n\nO fluxo n8n deve: (1) receber o update via Telegram Trigger; (2) validar estrutura, usuário, chat e callback; (3) buscar pendências no Gateway; (4) enviar resumo mínimo da operação com botões Aprovar/Rejeitar contendo apenas o ID opaco da proposta; (5) ao receber callback, validar novamente o remetente no update do callback, conferir se a proposta ainda está pendente e não expirada; (6) chamar a rota `/approve` ou `/reject` com o segredo da ponte guardado em credencial/variável protegida do n8n; (7) responder ao callback e remover/desabilitar os botões para reduzir replay. A validação no callback é obrigatória mesmo que a mensagem original tenha sido enviada ao usuário autorizado. Nunca registrar o token da ponte nem o payload completo da proposta em logs.\n\nMantenha o Gateway em rede privada e não exponha as rotas de aprovação/rejeição publicamente. O endpoint Gateway confia na ponte para afirmar a identidade do remetente; por isso, a segurança depende de o segredo da ponte permanecer exclusivo do n8n e de a ponte validar o payload autêntico do Telegram.

## Limitações

- Não cria nem armazena API keys.
- Não executa workflows por endpoint próprio.
- Não gerencia credenciais.
- Não há proxy de caminhos arbitrários.
- Não oferece exclusão de workflows.
- Documentação interativa e OpenAPI desabilitados.
- A aprovação humana depende da validação do callback do Telegram no workflow n8n; o endpoint Gateway exige adicionalmente segredo da ponte e allowlist de usuário.
