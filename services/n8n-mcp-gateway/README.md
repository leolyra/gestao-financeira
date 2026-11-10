# n8n MCP Gateway (folder-scoped)

Small stateless MCP server that proxies a strict allowlist of n8n Public API operations.

## Scope

The gateway is pinned to one project ID and one folder ID at startup. Every workflow read/update and execution lookup verifies both IDs. If the n8n API response does not expose the folder ID, the gateway fails closed rather than guessing.

Allowed tools:
- `list_workflows`
- `get_workflow`
- `create_workflow` (creates inside the configured folder; does not activate)
- `update_workflow`
- `list_executions`
- `get_execution`

There is deliberately no delete, move, credential-management, activation, or arbitrary HTTP tool.

## Environment

- `N8N_BASE_URL`: e.g. `https://n8n.example.com`
- `N8N_API_KEY`: n8n API key (header `X-N8N-API-KEY`)
- `N8N_PROJECT_ID`: authorized project ID
- `N8N_FOLDER_ID`: authorized folder ID
- `GATEWAY_API_TOKEN`: separate long random bearer token required by MCP clients
- `PORT`: optional, defaults to 3000

## Run

```sh
npm ci
npm start
```

MCP endpoint: `POST /mcp` using Streamable HTTP and `Authorization: Bearer <GATEWAY_API_TOKEN>`.

Health endpoint: `GET /health`.

## Safety notes

- Never commit secrets or an `.env` file.
- Keep the n8n API key only in the deployment environment.
- The gateway does not offer a workflow execution trigger because the public API execution trigger is not assumed; tests are inspected through execution history.
- The first live check must confirm the exact folder field returned by the installed n8n version before enabling write operations.
