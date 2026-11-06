from datetime import datetime
from zoneinfo import ZoneInfo

BRAZIL_TZ = ZoneInfo("America/Sao_Paulo")

def local_now_naive() -> datetime:
    """Current Brazil/Sao_Paulo time as a naive datetime for the legacy DB columns."""
    return datetime.now(BRAZIL_TZ).replace(tzinfo=None)

def to_local_naive(value: datetime) -> datetime:
    """Convert aware timestamps to Brazil local time; preserve already-naive local values."""
    if value.tzinfo is None:
        return value
    return value.astimezone(BRAZIL_TZ).replace(tzinfo=None)
