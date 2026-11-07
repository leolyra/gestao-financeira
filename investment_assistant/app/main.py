import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from starlette.middleware import Middleware

from app.config import get_settings
from app.mcp_server import mcp
from app.security import MCPBearerAuth
from app.telegram import process_telegram_update

settings = get_settings()
logging.basicConfig(level=settings.log_level.upper())


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with mcp.session_manager.run():
        yield


app = FastAPI(
    title="Investment Assistant Gateway",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "investment-assistant"}


@app.post("/telegram/webhook")
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
) -> dict[str, bool]:
    import hmac

    expected = settings.telegram_webhook_secret
    supplied = x_telegram_bot_api_secret_token or ""
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    update: dict[str, Any] = await request.json()
    await process_telegram_update(update)
    return {"ok": True}


# MCP endpoint: https://<host>/mcp/
mcp.settings.streamable_http_path = "/"
app.mount("/mcp", MCPBearerAuth(mcp.streamable_http_app()))
