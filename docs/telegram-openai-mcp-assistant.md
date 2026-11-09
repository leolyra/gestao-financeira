# Assistente Financeiro via Telegram, OpenAI e MCP

## Objetivo

Preparar a integração Telegram + OpenAI Responses API + MCP da Finance API, em modo estritamente somente leitura. Nenhuma senha, JWT, chave OpenAI ou token Telegram será versionado.

## Arquitetura

1. Telegram Trigger recebe mensagem ou callback.
2. Validar o remetente no update autêntico: para mensagens, `message.from.id`; para callbacks, `callback_query.from.id`. Somente o usuário autorizado `TELEGRAM_ALLOWED_USER_ID=157555157`. Nunca aceitar ID enviado no texto, callback_data ou cabeçalho fornecido pelo usuário.
3. n8n autentica por `POST /api/v1/auth/login` e obtém JWT por execução.
4. n8n chama a OpenAI Responses API (`POST https://api.openai.com/v1/responses`) com MCP remoto:
   - `type: "mcp"`, `server_label: "finance_api"`
   - `server_url: "https://api-financeira.leo.lyra.nom.br/api/v1/mcp"`
   - `authorization: "Bearer <JWT>"`, usando o token obtido na execução.
   - `allowed_tools` limitado às ferramentas de leitura listadas abaixo.
   - `require_approval: "never"` somente enquanto o MCP permanecer read-only e as ferramentas estiverem filtradas.
5. Enviar ao Telegram somente o texto final, com limite de tamanho e tratamento seguro de erros.

A Responses API suporta MCP remoto por Streamable HTTP e encaminhamento do token no campo `authorization`. O token deve ser enviado em cada criação de resposta. Referência: https://developers.openai.com/api/docs/guides/tools-connectors-mcp

## Ferramentas permitidas

- `financial_accounts`
- `financial_cash_flow`
- `financial_expenses_by_category`
- `investment_positions`
- `investment_income`
- `portfolio_assets`
- `portfolio_transactions`
- `portfolio_pending_reconciliation`

Nunca disponibilizar `propose_asset_classification` nem `apply_asset_classification` ao assistente Telegram.

## Política obrigatória de segurança

- Manter `MCP_ENABLE_WRITES=false` na Finance API.
- Validar o remetente em todos os updates e novamente em cada callback.
- Restringir o bot a conversas privadas com o usuário autorizado.
- Credenciais Telegram, OpenAI e Finance API devem ficar no cofre de credenciais do n8n ou secrets do Easypanel. Não inserir valores literais em nós, exportações, commits ou logs.
- Obter JWT por execução. Não persistir em Data Store, planilha ou histórico de conversa.
- Desativar o salvamento de execuções que possam conter credenciais ou dados financeiros e não registrar corpos integrais das chamadas.
- Limitar tamanho de mensagens, duração e frequência das chamadas.
- Não criar propostas nem alterar classificações nesta fase.

## Configuração de credenciais no n8n

Criar credenciais separadas:
1. Telegram API: token do bot.
2. OpenAI API: chave da API.
3. Finance API login: email e senha da aplicação, protegidos e usados apenas pelo nó de login.

O login envia JSON para `https://api-financeira.leo.lyra.nom.br/api/v1/auth/login` e retorna `access_token` (ou `token`, conforme resposta). O token deve ser passado diretamente ao campo `authorization` do MCP e nunca enviado ao Telegram ou registrado.

**Não inserir email/senha diretamente em campos de texto ou expressões do workflow.** A referência a credenciais protegidas no corpo JSON depende do tipo de credencial e da versão do n8n. Confirmar a versão instalada antes de gerar o workflow importável. Não habilitar acesso irrestrito a variáveis de ambiente apenas para contornar essa limitação.

## Exemplo do corpo da Responses API

O nó HTTP Request para OpenAI deverá montar um corpo equivalente ao abaixo. Substituir o marcador JWT por uma expressão dinâmica que leia o token do nó de login.

```json
{
  "model": "gpt-6",
  "instructions": "Você é um assistente financeiro pessoal. Responda em português do Brasil, com clareza e concisão. Use somente ferramentas de leitura. Nunca invente saldos, transações ou posições. Se os dados forem insuficientes, explique a limitação. Não solicite senhas ou tokens. Não proponha nem execute alterações.",
  "tools": [
    {
      "type": "mcp",
      "server_label": "finance_api",
      "server_description": "Consultas financeiras somente leitura do usuário autenticado.",
      "server_url": "https://api-financeira.leo.lyra.nom.br/api/v1/mcp",
      "authorization": "Bearer {{JWT_DA_EXECUCAO}}",
      "require_approval": "never",
      "allowed_tools": [
        "financial_accounts",
        "financial_cash_flow",
        "financial_expenses_by_category",
        "investment_positions",
        "investment_income",
        "portfolio_assets",
        "portfolio_transactions",
        "portfolio_pending_reconciliation"
      ]
    }
  ],
  "input": "MENSAGEM_VALIDADA_DO_TELEGRAM"
}
```

O modelo deve ser configurável e validado contra os modelos habilitados na conta da API. `gpt-6` é apenas uma referência inicial, não uma confirmação de disponibilidade na conta.

## Testes de aceite

1. Mensagem do usuário autorizado recebe resposta.
2. Mensagem de outro usuário é descartada antes de login, OpenAI ou MCP.
3. Callback de outro usuário é descartado, mesmo respondendo a mensagem legítima.
4. OpenAI recebe apenas as ferramentas de leitura permitidas.
5. Consultas de contas, fluxo de caixa, despesas, posições e rendimentos respondem corretamente.
6. Falhas de login, JWT, API ou MCP geram mensagem segura e genérica.
7. Nenhuma execução cria propostas ou modifica dados.
8. Logs não contêm senha, JWT, chave OpenAI ou payload financeiro integral.

## Próximo passo

Confirmar a versão do n8n e o mecanismo de credencial disponível para o login JSON da Finance API. Em seguida, gerar o workflow importável com nós e expressões compatíveis, sem incluir segredos no arquivo.
