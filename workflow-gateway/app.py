"""Restricted n8n workflow gateway with Telegram-bound one-time approvals."""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from urllib.parse import quote

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("workflow-gateway")
app = FastAPI(title="n8n Workflow Gateway", version="1.1.0", docs_url=None, redoc_url=None, openapi_url=None)


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise HTTPException(status_code=503, detail=f"Gateway not configured: {name}")
    return value


def db_path() -> str:
    return os.getenv("APPROVAL_DB_PATH", "/data/approvals.sqlite3")


def connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(db_path(), timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS proposals (
            id TEXT PRIMARY KEY,
            operation TEXT NOT NULL,
            workflow_id TEXT,
            payload TEXT NOT NULL,
            payload_sha256 TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            approved_at TEXT,
            approved_by TEXT,
            rejected_at TEXT,
            rejected_by TEXT,
            completed_at TEXT,
            result TEXT
        )
    """)
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(proposals)")}
    if "rejected_at" not in columns:
        conn.execute("ALTER TABLE proposals ADD COLUMN rejected_at TEXT")
    if "rejected_by" not in columns:
        conn.execute("ALTER TABLE proposals ADD COLUMN rejected_by TEXT")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status, created_at)")
    return conn


@contextmanager
def db_session():
    conn = connect_db()
    try:
        yield conn
    finally:
        conn.close()


def audit(action: str, resource_id: str | None, outcome: str, request: Request, actor: str | None = None) -> None:
    logger.info(json.dumps({
        "event": "workflow_gateway_audit",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "resource_id": resource_id,
        "outcome": outcome,
        "actor": actor,
        "client": request.client.host if request.client else "unknown",
    }, separators=(",", ":")))


def authenticate(authorization: str | None = Header(default=None)) -> str:
    expected = required_env("GATEWAY_API_TOKEN")
    supplied = authorization.removeprefix("Bearer ").strip() if authorization else ""
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return "gateway-client"


def authenticate_telegram_bridge(
    bridge_token: str | None = Header(default=None, alias="X-Telegram-Bridge-Token"),
    telegram_user_id: str | None = Header(default=None, alias="X-Telegram-User-Id"),
) -> str:
    expected_token = required_env("TELEGRAM_APPROVAL_BRIDGE_TOKEN")
    expected_user = required_env("TELEGRAM_ALLOWED_USER_ID")
    if not bridge_token or not hmac.compare_digest(bridge_token, expected_token):
        raise HTTPException(status_code=401, detail="Unauthorized approval bridge")
    if not telegram_user_id or not hmac.compare_digest(telegram_user_id, expected_user):
        raise HTTPException(status_code=403, detail="Telegram user is not authorized")
    return telegram_user_id


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
            if isinstance(message, str):
                detail = message[:300]
        except ValueError:
            pass
        raise HTTPException(status_code=response.status_code, detail=detail)
    if response.status_code == 204 or not response.content:
        return {"ok": True}
    try:
        return response.json()
    except ValueError:
        return {"ok": True}


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


class ProposalCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["create_workflow", "update_workflow"]
    workflow_id: str | None = Field(default=None, min_length=1, max_length=200)
    payload: dict[str, Any]
    ttl_minutes: int = Field(default=10, ge=1, le=30)


def proposal_view(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "operation": row["operation"],
        "workflow_id": row["workflow_id"],
        "payload": json.loads(row["payload"]),
        "payload_sha256": row["payload_sha256"],
        "status": row["status"],
        "created_at": row["created_at"],
        "expires_at": row["expires_at"],
    }


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/workflows", dependencies=[Depends(authenticate)])
async def list_workflows(
    limit: int = Query(default=100, ge=1, le=250),
    cursor: str | None = Query(default=None, max_length=500),
) -> Any:
    params: dict[str, Any] = {"limit": limit}
    if cursor:
        params["cursor"] = cursor
    return await n8n_request("GET", "/api/v1/workflows", params=params)


@app.post("/v1/proposals", dependencies=[Depends(authenticate)], status_code=201)
async def create_proposal(body: ProposalCreate, request: Request) -> dict[str, Any]:
    if body.operation == "create_workflow":
        if body.workflow_id is not None:
            raise HTTPException(status_code=422, detail="workflow_id is not allowed for create")
        payload = WorkflowCreate.model_validate(body.payload).model_dump(exclude_none=True)
    else:
        if not body.workflow_id:
            raise HTTPException(status_code=422, detail="workflow_id is required for update")
        payload = WorkflowUpdate.model_validate(body.payload).model_dump(exclude_none=True)
        if not payload:
            raise HTTPException(status_code=422, detail="At least one workflow field is required")

    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    proposal_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=body.ttl_minutes)
    with db_session() as conn:
        conn.execute(
            """INSERT INTO proposals
            (id, operation, workflow_id, payload, payload_sha256, status, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)""",
            (proposal_id, body.operation, body.workflow_id, canonical, digest, now.isoformat(), expires.isoformat()),
        )
        row = conn.execute("SELECT * FROM proposals WHERE id = ?", (proposal_id,)).fetchone()
    audit("propose_" + body.operation, proposal_id, "pending", request)
    return proposal_view(row)


@app.get("/v1/proposals/pending", dependencies=[Depends(authenticate)])
async def list_pending_proposals() -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    with db_session() as conn:
        conn.execute(
            "UPDATE proposals SET status='expired' WHERE status='pending' AND expires_at <= ?",
            (now,),
        )
        rows = conn.execute(
            "SELECT * FROM proposals WHERE status='pending' ORDER BY created_at LIMIT 50"
        ).fetchall()
    return {"data": [proposal_view(row) for row in rows]}


@app.post("/v1/proposals/{proposal_id}/approve", dependencies=[Depends(authenticate_telegram_bridge)])
async def approve_proposal(proposal_id: str, request: Request, approver: str = Depends(authenticate_telegram_bridge)) -> dict[str, Any]:
    # Atomically claim the proposal before making the external API call. A proposal
    # can never be approved/executed a second time, including after an uncertain timeout.
    now = datetime.now(timezone.utc)
    with connect_db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM proposals WHERE id = ?", (proposal_id,)).fetchone()
        if row is None:
            conn.rollback()
            raise HTTPException(status_code=404, detail="Proposal not found")
        if row["status"] != "pending":
            conn.rollback()
            raise HTTPException(status_code=409, detail="Proposal is no longer pending")
        if datetime.fromisoformat(row["expires_at"]) <= now:
            conn.execute("UPDATE proposals SET status='expired' WHERE id=? AND status='pending'", (proposal_id,))
            conn.commit()
            raise HTTPException(status_code=410, detail="Proposal expired")
        changed = conn.execute(
            """UPDATE proposals SET status='executing', approved_at=?, approved_by=?
            WHERE id=? AND status='pending'""",
            (now.isoformat(), approver, proposal_id),
        ).rowcount
        if changed != 1:
            conn.rollback()
            raise HTTPException(status_code=409, detail="Proposal is no longer pending")
        conn.commit()

    operation = row["operation"]
    workflow_id = row["workflow_id"]
    payload = json.loads(row["payload"])
    path = "/api/v1/workflows" if operation == "create_workflow" else f"/api/v1/workflows/{quote(workflow_id, safe='')}"
    method = "POST" if operation == "create_workflow" else "PUT"
    try:
        result = await n8n_request(method, path, payload=payload)
    except HTTPException as exc:
        with connect_db() as conn:
            conn.execute(
                "UPDATE proposals SET status='failed', result=? WHERE id=? AND status='executing'",
                (json.dumps({"http_status": exc.status_code, "detail": "n8n operation failed"}), proposal_id),
            )
        audit(operation, proposal_id, "failed", request, approver)
        raise

    with connect_db() as conn:
        conn.execute(
            "UPDATE proposals SET status='completed', completed_at=?, result=? WHERE id=? AND status='executing'",
            (datetime.now(timezone.utc).isoformat(), json.dumps(result, ensure_ascii=False), proposal_id),
        )
    audit(operation, proposal_id, "completed", request, approver)
    return {"proposal_id": proposal_id, "status": "completed", "result": result}


@app.post("/v1/proposals/{proposal_id}/reject", dependencies=[Depends(authenticate_telegram_bridge)])
async def reject_proposal(
    proposal_id: str,
    request: Request,
    approver: str = Depends(authenticate_telegram_bridge),
) -> dict[str, Any]:
    # BEGIN IMMEDIATE serializes approve/reject so exactly one decision can win.
    now = datetime.now(timezone.utc)
    with db_session() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM proposals WHERE id = ?", (proposal_id,)).fetchone()
        if row is None:
            conn.rollback()
            raise HTTPException(status_code=404, detail="Proposal not found")
        if row["status"] != "pending":
            conn.rollback()
            raise HTTPException(status_code=409, detail="Proposal is no longer pending")
        if datetime.fromisoformat(row["expires_at"]) <= now:
            conn.execute(
                "UPDATE proposals SET status='expired' WHERE id=? AND status='pending'",
                (proposal_id,),
            )
            conn.commit()
            raise HTTPException(status_code=410, detail="Proposal expired")
        changed = conn.execute(
            """UPDATE proposals SET status='rejected', rejected_at=?, rejected_by=?
            WHERE id=? AND status='pending'""",
            (now.isoformat(), approver, proposal_id),
        ).rowcount
        if changed != 1:
            conn.rollback()
            raise HTTPException(status_code=409, detail="Proposal is no longer pending")
        conn.commit()
    audit("reject_" + row["operation"], proposal_id, "rejected", request, approver)
    return {"proposal_id": proposal_id, "status": "rejected"}
