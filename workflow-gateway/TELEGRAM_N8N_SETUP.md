# Configuração da ponte de aprovação Telegram ↔ n8n ↔ Workflow Gateway

Este guia complementa o serviço `workflow-gateway`. A ponte é executada no n8n e **não deve expor o Gateway à internet**.

## 1. Topologia

```text
Aplicação / cliente
  | Authorization: Bearer GATEWAY_API_TOKEN
  v
Workflow Gateway (rede privada, porta 8080)
  | GET /v1/proposals/pending
  | POST /v1/proposals/{id}/approve ou /reject
  v
n8n (rede privada) ---- Telegram Bot API
  ^
  | Telegram Trigger: message + callback_query
Telegram
```

O Gateway não recebe updates diretamente do Telegram. O n8n valida o update recebido e só então cria os cabeçalhos de confiança usados nas rotas de decisão.

## 2. Variáveis e credenciais

### No Easypanel — serviço `workflow-gateway`

Configure no serviço, sem colocar valores em arquivos versionados:

- `N8N_BASE_URL=http://n8n_n8n:5678`
- `N8N_API_KEY`: API key do n8n já existente.
- `GATEWAY_API_TOKEN`: token de cliente usado para consultar pendências e criar propostas.
- `TELEGRAM_APPROVAL_BRIDGE_TOKEN`: novo segredo aleatório, exclusivo desta ponte.
- `TELEGRAM_ALLOWED_USER_ID`: ID numérico Telegram previamente confirmado.
- `APPROVAL_DB_PATH=/data/approvals.sqlite3`

Monte um volume persistente no caminho `/data`. Mantenha o serviço em rede privada; não crie domínio público nem proxy externo para a porta 8080. O container executa como UID/GID 10001.

### No n8n

Crie credenciais protegidas, sem inserir segredos em campos de texto dos nós:

1. Credencial Telegram Bot com o token do bot.
2. Credencial HTTP Header Auth para o Gateway, com `Authorization: Bearer <GATEWAY_API_TOKEN>`, usada apenas no GET de pendências.
3. Credencial HTTP Header Auth (ou headers protegidos equivalentes) para a ponte, com `X-Telegram-Bridge-Token: <TELEGRAM_APPROVAL_BRIDGE_TOKEN>`.
4. Para as rotas approve/reject, envie também `X-Telegram-User-Id`, mas seu valor deve vir exclusivamente do campo `from.id` do update Telegram validado, nunca de texto, callback_data ou parâmetro enviado pelo usuário.

Use como URL interna do Gateway `http://workflow-gateway:8080` somente se esse for o hostname/alias resolvido na mesma rede privada do Easypanel. Caso contrário, use o hostname interno exibido pelo Easypanel. Não use um domínio público.

## 3. Workflow n8n

Crie um workflow dedicado, por exemplo `Telegram — Aprovação de propostas n8n`.

### Nó 1 — Telegram Trigger

- Credencial: Telegram Bot.
- Updates: `message` e `callback_query`.
- Não habilite outros tipos de update sem necessidade.

### Nó 2 — Code: normalizar e autorizar update

O código deve obter os campos diretamente do objeto de update:

- Para callback: remetente = `callback_query.from.id`; chat = `callback_query.message.chat`; callback = `callback_query.data`.
- Para mensagem: remetente = `message.from.id`; chat = `message.chat`; texto = `message.text`.

Regras obrigatórias:

- Comparar o ID numérico do remetente com o ID autorizado configurado no próprio workflow/credencial protegida.
- Aceitar somente conversa privada (`chat.type === "private"`) para este fluxo.
- Rejeitar updates sem remetente, sem chat ou com tipo inesperado.
- Para callbacks, aceitar somente o formato estrito `^(approve|reject):([0-9a-f-]{36})$`.
- Não confiar em ID de usuário recebido em texto, callback_data ou cabeçalho de entrada.
- Produzir um campo booleano `authorized`; encaminhar apenas updates autorizados.
- Não registrar o objeto Telegram completo em logs.

O ID autorizado pode ser configurado como variável protegida do n8n. Não o obtenha de uma mensagem ou de um campo fornecido pelo usuário.

### Nó 3 — Switch: tipo de evento

Separe mensagem e callback:

**Ramo mensagem**

- Aceite apenas o comando exato `/pendentes` (também trate `/pendentes@NomeDoBot`, se o Telegram acrescentar o nome do bot).
- Faça GET em `/v1/proposals/pending` no Gateway com a credencial de cliente.
- A resposta contém `data[]`. Para cada proposta, mostre somente:
  - ID da proposta;
  - operação (`create_workflow` ou `update_workflow`);
  - ID do workflow, quando houver;
  - hash SHA-256;
  - horário de expiração.
- Não envie o payload integral da proposta ao Telegram. Ele pode conter configuração ou dados sensíveis.
- Envie uma mensagem por proposta com teclado inline de dois botões:
  - Aprovar: callback_data = `approve:<proposal.id>`
  - Rejeitar: callback_data = `reject:<proposal.id>`
- Se não houver pendências, responda que não há propostas aguardando decisão.

**Ramo callback**

- Valide novamente remetente e chat privado neste ramo. Não reutilize uma autorização anterior ou o remetente da mensagem original.
- Extraia ação e UUID exclusivamente após validar o padrão estrito de callback_data.
- Chame GET `/v1/proposals/pending` com a credencial de cliente e confirme que o UUID ainda aparece como pendente. Isso melhora a mensagem de retorno, mas não substitui a validação atômica do Gateway.
- Chame uma única rota:
  - `POST /v1/proposals/{id}/approve`, ou
  - `POST /v1/proposals/{id}/reject`.
- Use a credencial da ponte e defina `X-Telegram-User-Id` com o valor numérico de `callback_query.from.id` obtido do update validado.
- Não faça retry automático dessas chamadas. Em timeout, o resultado pode ser indeterminado; consulte o estado antes de qualquer ação manual. O Gateway impede replay.
- Responda ao callback com Telegram `answerCallbackQuery` e remova/desabilite o teclado da mensagem original com `editMessageReplyMarkup`. Se a rota retornar 409 ou 410, informe que a proposta já foi decidida ou expirou.

### Nó final — resposta Telegram

Respostas mínimas sugeridas:

- `Proposta aprovada e executada.` somente quando o Gateway retornar `status=completed`.
- `Proposta rejeitada; nenhuma alteração foi executada.` somente quando retornar `status=rejected`.
- `Esta proposta não está mais pendente ou expirou.` para 409/410.
- Em falha/timeout, não afirme sucesso nem tente executar novamente.

## 4. Testes seguros antes de ativar

1. Salve o workflow desativado e valide as credenciais sem enviar comandos de aprovação.
2. Teste mensagem de usuário não autorizado: não deve chamar o Gateway.
3. Teste mensagem em grupo: não deve chamar o Gateway.
4. Teste callback com usuário não autorizado: não deve chamar approve/reject.
5. Teste callback_data malformado: não deve chamar approve/reject.
6. Teste `/pendentes` sem propostas: deve responder sem erro.
7. Para testar uma decisão ponta a ponta, use somente uma proposta descartável e controlada, sem workflow financeiro ou operacional real. Confirme primeiro o conteúdo e o efeito pretendido.
8. Verifique que o segundo clique retorna conflito e não repete a operação.

Não use workflows reais, credenciais financeiras, fluxo Pluggy ou dados de produção nos testes de execução.

## 5. Checklist de implantação

- [ ] Volume persistente montado em `/data`.
- [ ] Segredo da ponte novo, independente e armazenado somente no Gateway e n8n.
- [ ] ID Telegram permitido configurado no Gateway e no workflow.
- [ ] Gateway sem domínio público e acessível pelo n8n apenas na rede privada.
- [ ] Credenciais n8n armazenadas no gerenciador de credenciais.
- [ ] Telegram Trigger recebe somente message/callback_query necessários.
- [ ] Usuário e chat são validados em mensagem e novamente em callback.
- [ ] Botões usam UUID opaco e são removidos após a decisão.
- [ ] Retry automático desabilitado para approve/reject.
- [ ] Testes negativos concluídos antes de ativar o workflow.

## Limite importante

O Gateway confia no n8n para afirmar a identidade Telegram por meio dos cabeçalhos da ponte. Portanto, qualquer outro serviço que consiga alcançar o Gateway e conheça o segredo da ponte poderia tentar se passar pelo usuário permitido. Mantenha o segredo exclusivo, restrinja a rede e nunca exponha as rotas de aprovação/rejeição publicamente.
