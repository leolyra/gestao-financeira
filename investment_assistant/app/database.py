from decimal import Decimal
from datetime import date, datetime
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from app.config import get_settings

settings = get_settings()

engine: Engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=3,
    max_overflow=2,
    pool_recycle=1800,
    connect_args={"options": "-c default_transaction_read_only=on"},
)


def json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def fetch_all(statement: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    # Defense in depth: every tool uses a fixed, reviewed SELECT statement.
    with engine.connect() as connection:
        result = connection.execute(text(statement), params or {})
        return [
            {key: json_value(value) for key, value in row.items()}
            for row in result.mappings()
        ]


def fetch_one(statement: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
    rows = fetch_all(statement, params)
    return rows[0] if rows else None
