import hmac
import json
from typing import Any, Awaitable, Callable

from app.config import get_settings


class MCPBearerAuth:
    """Small ASGI guard for the MCP mount. The reverse proxy must also enforce HTTPS."""

    def __init__(self, app: Callable[..., Awaitable[Any]]):
        self.app = app
        self.expected = get_settings().mcp_bearer_token.encode("utf-8")

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        authorization = headers.get(b"authorization", b"")
        prefix = b"Bearer "
        supplied = authorization[len(prefix):] if authorization.startswith(prefix) else b""

        if not supplied or not hmac.compare_digest(supplied, self.expected):
            body = json.dumps({"detail": "Unauthorized"}).encode("utf-8")
            await send({
                "type": "http.response.start",
                "status": 401,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
            })
            await send({"type": "http.response.body", "body": body})
            return

        await self.app(scope, receive, send)
