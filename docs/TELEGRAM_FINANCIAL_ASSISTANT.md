# Assistente Financeiro via Telegram — Fase 1 (somente leitura)

## Objetivo

Conectar o bot Telegram à API Financeira existente, usando a API da OpenAI para interpretar perguntas e o endpoint MCP da própria aplicação para consultar dados. Nesta fase, o assistente não pode criar, editar ou excluir registros.

## Componentes existentes

- API Financeira FastAPI: autenticação JWT existente em `POST /api/v1/auth/login`.
- MCP Streamable HTTP: `POST /api/v1/mcp`.
- Gateway de workflows: serviço separado; permanece responsável por propostas e aprovações de workflows n8n.
- n8n: recebe mensagens Telegram, valida o ID autorizado e orquestra chamadas HTTP.

## Ferramentas MCP disponíveis em modo somente leitura

- `portfolio_assets`
- `portfolio_transactions`
- `portfolio_pending_reconciliation`
- `propose_asset_classification` (apenas simulação; não grava)

A ferramenta `apply_asset_classification` é uma ferramenta de escrita e fica oculta e bloqueada quando `MCP_ENABLE_WRITES=false`.

## Configuração

A variável `MCP_ENABLE_WRITES` é booleana e tem default `false`. Não a habilite para a integração inicial.

A autenticação MCP usa o JWT da API Financeira, não a chave do banco e não os tokens do Workflow Gateway. O JWT deve ficar em credencial protegida no n8n e ser renovado por fluxo controlado quando expirar.

## Fluxo lógico Telegram

1. Telegram Trigger recebe mensagem privada.
2. Code node valida `message.from.id` contra o ID autorizado configurado no n8n.
3. Apenas mensagens do usuário autorizado seguem.
4. n8n envia a pergunta para a camada OpenAI.
5. A camada de orquestração permite apenas chamadas MCP listadas como leitura.
6. MCP valida JWT e limita todas as consultas ao usuário autenticado.
7. n8n devolve a resposta em mensagem Telegram.

## Regras de segurança

- Nunca enviar `DATABASE_URL`, senha PostgreSQL, Pluggy secrets, API keys ou JWT ao modelo.
- Nunca aceitar SQL arbitrário gerado pelo modelo.
- Nunca usar diretamente endpoints POST/PATCH/DELETE da API Financeira na Fase 1.
- Não expor o JWT em mensagens, logs ou dados de execução do n8n.
- Validar o usuário Telegram antes de chamar OpenAI ou a API.
- Restringir o MCP ao conjunto de ferramentas read-only publicado.
- A camada OpenAI deve receber somente o mínimo de dados necessário à pergunta.
- O Gateway de aprovação não substitui a autorização do usuário na API Financeira; são credenciais e responsabilidades distintas.

## Próxima evolução

Adicionar ferramentas MCP de leitura para patrimônio líquido, saldos de contas, fluxo de caixa mensal, despesas por categoria e painel de investimentos. Em seguida, importar o workflow Telegram/OpenAI no n8n e configurar credenciais protegidas. Escritas só serão projetadas em fase posterior com aprovação humana vinculada à operação específica.
