"""Restricted management gateway for an n8n instance."""
from __future__ import annotations
import hmac, json, logging, os
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote
import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("workflow-gateway")
app = FastAPI(title="n8n Workflow Gateway", version="1.0.0", docs_url=None, redoc_url=None, openapi_url=None)

def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise HTTPException(status_code=503, detail=f"Gateway not configured: {name}")
    return value

def audit(action: str, resource_id: str | None, outcome: str, request: Request) -> None:
    logger.info(json.dumps({
        "event": "workflow_gateway_audit",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action, "resource_id": resource_id, "outcome": outcome,
        "client": request.client.host if request.client else "unknown",
    }, separators=(",", ":")))

def authenticate(authorization: str | None = Header(default=None)) -> str:
    expected = required_env("GATEWAY_API_TOKEN")
    supplied = authorization.removeprefix("Bearer ").strip() if authorization else ""
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return "gateway-client"

def require_write_approval(x_write_approval: str | None = Header(default=None, alias="X-Write-Approval")) -> None:
    expected = required_env("GATEWAY_WRITE_APPROVAL_TOKEN")
    if not x_write_approval or not hmac.compare_digest(x_write_approval, expected):
        raise HTTPException(status_code=403, detail="Explicit write approval required")

def n8n_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=required_env("N8N_BASE_URL").rstrip("/"),
        headers={"X-N8N-API-KEY": required_env("N8N_API_KEY"), "Accept": "application/json"},
        timeout=httpx.Timeout(20.0, connect=5.0),
    )

async def n8n_request(method: str, path: str, *, params: dict | None = None, payload: dict | None = None) -> Any:
    async with n8n_client() as client:
        try:
            response = await client.request(method, path, params=params, json=payload)
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="Could not reach n8n API")
    if response.status_code >= 400:
        detail = "n8n API rejected the operation"
        try:
            upstream = response.json()
            message = upstream.get("message") if isinstance(upstream, dict) else None
            if isinstance(message, str): detail = message[:300]
        except ValueError: pass
        raise HTTPException(status_code=response.status_code, detail=detail)
    if response.status_code == 204 or not response.content: return {"ok": True}
    try: return response.json()
    except ValueError: return {"ok": True}

class WorkflowCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    nodes: list[dict[str, Any]]
    connections: dict[str, Any]
    settings: dict[str, Any] | None = None
    staticData: dict[str, Any] | None = None
    tags: list[dict[str, Any]] | None = None

class WorkflowUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=200)
    nodes: list[dict[str, Any]] | None = None
    connections: dict[str, Any] | None = None
    settings: dict[str, Any] | None = None
    staticData: dict[str, Any] | None = None
    tags: list[dict[str, Any]] | None = None

@app.get("/health")
async def health() -> dict[str, str]: return {"status": "ok"}

@app.get("/v1/workflows", dependencies=[Depends(authenticate)])
async def list_workflows(limit: int = Query(default=100, ge=1, le=250), cursor: str | None = Query(default=None, max_length=500)) -> Any:
    params: dict[str, Any] = {"limit": limit}
    if cursor: params["cursor"] = cursor
    return await n8n_request("GET", "/api/v1/workflows", params=params)

@app.post("/v1/workflows", dependencies=[Depends(authenticate), Depends(require_write_approval)])
async def create_workflow(body: WorkflowCreate, request: Request) -> Any:
    result = await n8n_request("POST", "/api/v1/workflows", payload=body.model_dump(exclude_none=True))
    audit("create_workflow", str(result.get("id", "")) if isinstance(result, dict) else None, "accepted", request)
    return result

@app.put("/v1/workflows/{workflow_id}", dependencies=[Depends(authenticate), Depends(require_write_approval)])
async def update_workflow(workflow_id: str, body: WorkflowUpdate, request: Request) -> Any:
    payload = body.model_dump(exclude_none=True)
    if not payload: raise HTTPException(status_code=422, detail="At least one workflow field is required")
    result = await n8n_request("PUT", f"/api/v1/workflows/{quote(workflow_id, safe='')}", payload=payload)
    audit("update_workflow", workflow_id, "accepted", request)
    return result

