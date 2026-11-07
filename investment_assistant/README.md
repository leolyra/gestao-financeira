# Investment Assistant — Telegram + OpenAI Responses API + MCP

Standalone service for the `gestao-financeira` project. It exposes reviewed, read-only portfolio tools over MCP Streamable HTTP and receives Telegram webhooks. It does not place orders or mutate financial records.

## Architecture

Telegram Bot -> this FastAPI gateway -> OpenAI Responses API -> remote MCP endpoint -> PostgreSQL (dedicated SELECT-only role).

The MCP tools use a fixed `ASSISTANT_USER_ID` from server configuration. The model cannot supply or override the user ID. All SQL statements are static, parameterized SELECT statements. There is no arbitrary SQL tool.

## Important data semantics

- Transactions are grouped by `source`; Open Finance and custody are never automatically merged.
- Net quantity is provisionally calculated as buys minus sells. It must be reconciled for transfers, corporate actions, amortizations and imports before treating it as a definitive position.
- Quote tools return stored `asset_quotes` records, not live market prices.
- The assistant-specific classification columns are read from `user_asset_classifications`.
- No write tools are registered in this release. Future write tools must have separate authorization, explicit user confirmation and audit logging.

## PostgreSQL read-only role

Run as a database administrator. Replace the password with a generated secret; do not commit it.

```sql
CREATE ROLE investment_assistant_ro
  LOGIN PASSWORD 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';

GRANT CONNECT ON DATABASE financas_db TO investment_assistant_ro;
GRANT USAGE ON SCHEMA public TO investment_assistant_ro;

GRANT SELECT ON TABLE
  public.assets,
  public.investment_transactions,
  public.asset_quotes,
  public.asset_reports,
  public.user_asset_classifications
TO investment_assistant_ro;

ALTER ROLE investment_assistant_ro
  SET default_transaction_read_only = on;
```

The role intentionally receives no access to account credentials, Pluggy connection secrets, general banking transactions, or user password hashes. It has no INSERT, UPDATE, DELETE, DDL, sequence, or ownership privileges.

If the database name differs from `financas_db`, adjust the GRANT CONNECT statement and connection string.

## Environment

Copy `.env.example` to the service's environment configuration and set:

- `DATABASE_URL`: use the dedicated read-only role.
- `ASSISTANT_USER_ID`: numeric owner ID; currently the diagnostics showed user 1.
- `OPENAI_API_KEY` and `OPENAI_MODEL`: API credentials and a model enabled for the OpenAI API project.
- `MCP_PUBLIC_URL`: public HTTPS URL ending in `/mcp/`.
- `MCP_BEARER_TOKEN`: long random token shared only between this service and the Responses API caller in this service.
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`.
- `TELEGRAM_ALLOWED_CHAT_IDS`: comma-separated numeric Telegram chat IDs allowed to use the bot.

Never commit real credentials or expose the database port publicly.

## Easypanel deployment

1. Create a new service from this repository.
2. Set build context to `/investment_assistant` and use its Dockerfile.
3. Expose internal port `8100`.
4. Attach it to the private network containing PostgreSQL; do not publish PostgreSQL port 5432.
5. Configure the environment variables above in Easypanel Secrets.
6. Attach a domain with HTTPS, for example `investimentos-mcp.seu-dominio`.
7. Check `GET /health`.
8. Configure Telegram webhook to `https://<domain>/telegram/webhook`, using Telegram's `secret_token` equal to `TELEGRAM_WEBHOOK_SECRET`.
9. Keep `MCP_PUBLIC_URL=https://<domain>/mcp/`.

Set the Telegram webhook (run locally or in a trusted admin shell; never commit the token):

```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://<domain>/telegram/webhook" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

## Initial MCP tools

- `get_portfolio_summary`
- `get_portfolio_positions`
- `get_transactions`
- `get_asset_details`
- `get_asset_quotes`
- `get_asset_reports`
- `get_portfolio_income`
- `get_asset_classifications`

All are read-only and scoped to the configured user.

## Validation checklist

- `GET /health` returns `{"status":"ok"...}`.
- MCP Inspector can list tools at `https://<domain>/mcp/` when supplied the bearer token.
- Requests without a valid MCP bearer token receive HTTP 401.
- PostgreSQL connection uses `investment_assistant_ro`.
- Attempting a write with this DB role fails at PostgreSQL permission level.
- Telegram webhook rejects requests without the configured Telegram secret header.
- Telegram rejects chats not in `TELEGRAM_ALLOWED_CHAT_IDS`.
- Test `/carteira`, `/posicoes`, `/renda` and `/ativo PETR4`.

## Operational limitations in this first release

- Telegram responses are stateless between messages; conversation history is not persisted yet.
- Only one configured portfolio owner is supported by this deployment.
- No live market-data provider is connected.
- The net-position calculation is a diagnostic estimate, not a final accounting ledger.
- Tool approval is set to `never` only because the exposed MCP toolset is strictly read-only. Do not add write tools under this policy. When write tools are introduced, split them into a separate MCP server/toolset and require explicit approval for each write.
