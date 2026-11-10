import crypto from "node:crypto";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const required = ["N8N_BASE_URL", "N8N_API_KEY", "N8N_PROJECT_ID", "N8N_FOLDER_ID", "GATEWAY_API_TOKEN"];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}

const N8N_BASE_URL = process.env.N8N_BASE_URL.replace(/\/+$/, "");
const N8N_API_KEY = process.env.N8N_API_KEY;
const PROJECT_ID = process.env.N8N_PROJECT_ID;
const FOLDER_ID = process.env.N8N_FOLDER_ID;
const GATEWAY_TOKEN = process.env.GATEWAY_API_TOKEN;
const PORT = Number(process.env.PORT || 3000);
const API_ROOT = `${N8N_BASE_URL}/api/v1`;

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function n8n(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      "X-N8N-API-KEY": N8N_API_KEY,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(20000),
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  if (!response.ok) {
    const error = new Error(`n8n API ${response.status}: ${JSON.stringify(data).slice(0, 1200)}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function workflowFolderId(workflow) {
  return workflow.parentFolderId ?? workflow.folderId ?? workflow.parentFolder?.id ?? null;
}

function assertInScope(workflow) {
  if (!workflow || String(workflow.projectId ?? "") !== PROJECT_ID) {
    throw new Error("Acesso bloqueado: workflow fora do projeto autorizado.");
  }
  const folderId = workflowFolderId(workflow);
  if (!folderId || String(folderId) !== FOLDER_ID) {
    throw new Error("Acesso bloqueado: não foi possível confirmar que o workflow pertence à pasta autorizada. Operação cancelada por segurança.");
  }
  return workflow;
}

async function getWorkflow(id) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("ID de workflow inválido.");
  const workflow = await n8n(`/workflows/${encodeURIComponent(id)}`);
  return assertInScope(workflow);
}

async function listScopedWorkflows() {
  const results = [];
  let cursor;
  for (let page = 0; page < 20; page++) {
    const query = new URLSearchParams({ limit: "250" });
    if (cursor) query.set("cursor", cursor);
    const response = await n8n(`/workflows?${query.toString()}`);
    const rows = Array.isArray(response.data) ? response.data : [];
    for (const workflow of rows) {
      if (String(workflow.projectId ?? "") === PROJECT_ID &&
          String(workflowFolderId(workflow) ?? "") === FOLDER_ID) {
        results.push({
          id: workflow.id,
          name: workflow.name,
          active: Boolean(workflow.active),
          updatedAt: workflow.updatedAt ?? null,
        });
      }
    }
    cursor = response.nextCursor;
    if (!cursor) return results;
  }
  throw new Error("Paginação excedeu o limite de segurança; resultado incompleto não será apresentado.");
}

function createServer() {
  const server = new McpServer({ name: "n8n-folder-gateway", version: "1.0.0" });

  server.tool(
    "list_workflows",
    "Lista somente workflows da pasta Gestão Financeira ChatGPT. Nunca retorna workflows de outras pastas.",
    {},
    async () => ({
      content: [{ type: "text", text: JSON.stringify({
        projectId: PROJECT_ID,
        folderId: FOLDER_ID,
        workflows: await listScopedWorkflows(),
      }, null, 2) }],
    })
  );

  server.tool(
    "get_workflow",
    "Lê um workflow somente depois de confirmar projeto e pasta autorizados.",
    { workflow_id: z.string().min(1).max(128) },
    async ({ workflow_id }) => {
      const workflow = await getWorkflow(workflow_id);
      return { content: [{ type: "text", text: JSON.stringify(workflow, null, 2) }] };
    }
  );

  server.tool(
    "create_workflow",
    "Cria um workflow novo diretamente na pasta autorizada. Não ativa nem executa automaticamente.",
    {
      name: z.string().min(1).max(200),
      nodes: z.array(z.record(z.any())),
      connections: z.record(z.any()),
      settings: z.record(z.any()).optional(),
    },
    async ({ name, nodes, connections, settings = {} }) => {
      const created = await n8n("/workflows", {
        method: "POST",
        body: JSON.stringify({
          name, nodes, connections, settings,
          parentFolderId: FOLDER_ID,
        }),
      });
      const verified = await getWorkflow(created.id);
      return { content: [{ type: "text", text: JSON.stringify({
        created: true,
        workflow: { id: verified.id, name: verified.name, projectId: verified.projectId, folderId: workflowFolderId(verified) },
      }, null, 2) }] };
    }
  );

  server.tool(
    "update_workflow",
    "Atualiza um workflow existente somente se ele já estiver na pasta autorizada. Preserva nome, nós e conexões quando não forem enviados. Não altera status de ativação.",
    {
      workflow_id: z.string().min(1).max(128),
      name: z.string().min(1).max(200).optional(),
      nodes: z.array(z.record(z.any())).optional(),
      connections: z.record(z.any()).optional(),
      settings: z.record(z.any()).optional(),
    },
    async ({ workflow_id, ...changes }) => {
      const current = await getWorkflow(workflow_id);
      const payload = {
        name: changes.name ?? current.name,
        nodes: changes.nodes ?? current.nodes,
        connections: changes.connections ?? current.connections,
        settings: changes.settings ?? current.settings ?? {},
      };
      const updated = await n8n(`/workflows/${encodeURIComponent(workflow_id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const verified = await getWorkflow(workflow_id);
      return { content: [{ type: "text", text: JSON.stringify({
        updated: true,
        workflow: { id: verified.id ?? updated.id, name: verified.name, projectId: verified.projectId, folderId: workflowFolderId(verified) },
      }, null, 2) }] };
    }
  );

  server.tool(
    "list_executions",
    "Lista execuções apenas de um workflow previamente validado na pasta autorizada.",
    {
      workflow_id: z.string().min(1).max(128),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ workflow_id, limit = 10 }) => {
      await getWorkflow(workflow_id);
      const query = new URLSearchParams({ workflowId: workflow_id, limit: String(limit) });
      const result = await n8n(`/executions?${query.toString()}`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_execution",
    "Consulta uma execução somente após validar que seu workflow pertence à pasta autorizada.",
    { execution_id: z.string().min(1).max(128) },
    async ({ execution_id }) => {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(execution_id)) throw new Error("ID de execução inválido.");
      const execution = await n8n(`/executions/${encodeURIComponent(execution_id)}`);
      if (!execution.workflowId) throw new Error("Execução sem workflow associado; acesso bloqueado.");
      await getWorkflow(String(execution.workflowId));
      return { content: [{ type: "text", text: JSON.stringify(execution, null, 2) }] };
    }
  );

  return server;
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ status: "ok", service: "n8n-mcp-gateway" }));

app.post("/mcp", async (req, res) => {
  const auth = req.headers.authorization || "";
  const supplied = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!safeEqual(supplied, GATEWAY_TOKEN)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => { void transport.close(); void server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error.message);
    if (!res.headersSent) res.status(500).json({ error: "MCP request failed" });
  }
});

app.all("/mcp", (_req, res) => res.status(405).json({ error: "Use POST for stateless MCP transport." }));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`n8n MCP gateway listening on port ${PORT}`);
});
