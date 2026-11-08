# n8n Workflow Gateway

Serviço independente para administrar workflows via API do n8n. Não altera o serviço n8n existente e não acessa PostgreSQL.

## Segurança
- Cliente: Authorization: Bearer GATEWAY_API_TOKEN.
- Toda escrita exige também X-Write-Approval: GATEWAY_WRITE_APPROVAL_TOKEN.
- A API key do n8n fica somente no servidor (N8N_API_KEY).
- Não há endpoint de execução, exclusão, consulta/alteração de credenciais, acesso ao banco ou proxy genérico.
- Documentação interativa e OpenAPI desabilitados.
- Auditoria registra ação, recurso, resultado, horário e IP; nunca tokens ou payloads.

O cabeçalho de aprovação é uma barreira técnica adicional, não um sistema independente de aprovação humana. O token de escrita deve ficar guardado na etapa de confirmação humana (por exemplo, Telegram/n8n). Para produção, substituir o token estático por aprovação de uso único vinculada ao hash da operação, com expiração e identificação do aprovador.

## Operações
- GET /v1/workflows: lista workflows (GET /api/v1/workflows).
- GET /v1/projects: lista projetos (GET /api/v1/projects).
- POST /v1/workflows: cria workflow.
- PUT /v1/workflows/{id}: atualiza workflow.
- POST /v1/workflows/{id}/transfer: move workflow (usa PUT /api/v1/workflows/{id}/transfer).

O endpoint de transferência depende da versão/edição do n8n e precisa ser validado em teste controlado.

## Variáveis de ambiente
- N8N_BASE_URL=http://n8n_n8n:5678 (rede interna; confirmar DNS entre serviços).
- N8N_API_KEY: API key do n8n, somente no Easypanel.
- GATEWAY_API_TOKEN: segredo aleatório forte para autenticar clientes.
- GATEWAY_WRITE_APPROVAL_TOKEN: segundo segredo aleatório forte para escritas aprovadas.

Não reutilize encryption key, token de runner, senha do banco ou JWT da API financeira.

## Easypanel
1. Crie serviço separado no projeto n8n usando GitHub e o repositório leolyra/gestao-financeira.
2. Diretório de build: workflow-gateway; Dockerfile: workflow-gateway/Dockerfile (ajuste conforme a tela do Easypanel).
3. Porta interna 8080. Não publique domínio na internet na primeira implantação; mantenha rede privada.
4. Configure as quatro variáveis acima. Gere os dois tokens do gateway independentemente e guarde-os em gerenciador de senhas.
5. Faça deploy somente após revisão e aprovação do PR. Verifique GET /health pela rede interna.

## Limitações
- Não cria nem armazena API keys.
- Não executa workflows nem gerencia credenciais.
- Não há proxy de caminhos arbitrários.
- A integração de aprovação via Telegram não faz parte desta primeira etapa.
