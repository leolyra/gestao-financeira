# Gestão Financeira — atualização de integridade e Central Patrimonial

## Novos recursos

- Central Patrimonial: patrimônio líquido, caixa, valor de mercado dos investimentos e passivos de cartão.
- Carteira: custo conhecido, cotação e valor de mercado; cotações Pluggy são armazenadas como snapshots, nunca como compras.
- Faturas: sincronização manual das faturas Pluggy e calendário de vencimentos.
- Fluxo de caixa: projeção simples baseada na média móvel dos seis meses anteriores, incluindo meses sem movimentação.
- Metas financeiras: cadastro, edição e exclusão por usuário.
- Alertas heurísticos: picos de despesas e possíveis lançamentos repetidos. Os alertas não excluem dados.
- Simulador de independência financeira: estimativa nominal com hipóteses explícitas.
- Cotação manual: POST /api/v1/financial-hub/quotes com ticker, preço e moeda.

## Configuração

1. Defina SECRET_KEY com pelo menos 32 caracteres aleatórios. Exemplo: `openssl rand -hex 32`.
2. Configure POSTGRES_PASSWORD.
3. Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no ambiente da API.
4. Recrie os serviços após alterar variáveis de ambiente.

Conexões Pluggy novas recebem `clientUserId` com o ID interno do usuário. Conexões antigas sem esse vínculo podem exigir reconexão pelo Connect Widget para serem associadas com segurança. As conexões já vinculadas a contas locais continuam disponíveis para sincronização do próprio usuário.

## Integridade e migração

- Novas tabelas são criadas por SQLAlchemy `create_all`.
- A migração aditiva adiciona `investment_transactions.external_id`.
- O boot da API não executa mais exclusões ou correções automáticas destrutivas nas operações de investimento.
- O endpoint de recálculo não apaga duplicatas automaticamente.
- Posições Open Finance são snapshots de cotação/custódia, não operações de compra.
- Valores em moeda estrangeira não são somados ao patrimônio em BRL automaticamente. A integração só grava snapshots em BRL; para ativos internacionais, informe uma cotação convertida para BRL até existir serviço FX com data e fonte.

## Testes

Backend: `PYTHONPATH=backend python -m unittest discover -s backend/tests -v`.

O workflow de CI também compila o backend, executa os testes unitários e tenta gerar o build Next.js.
