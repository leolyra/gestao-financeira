from mcp.server.fastmcp import FastMCP

from app.config import get_settings
from app.database import fetch_all, fetch_one

settings = get_settings()

mcp = FastMCP(
    "Investment Portfolio Assistant",
    stateless_http=True,
    json_response=True,
)
# Mounted by FastAPI at /mcp, so the MCP endpoint is /mcp/.
mcp.settings.streamable_http_path = "/"


@mcp.tool()
def get_portfolio_summary() -> dict:
    """Return investment transaction totals grouped by source. Sources are intentionally not consolidated because Open Finance and custody imports may overlap."""
    rows = fetch_all(
        """
        SELECT source,
               COUNT(*) AS transaction_count,
               COUNT(DISTINCT asset_id) AS distinct_assets,
               SUM(CASE WHEN operation_type = 'buy' THEN COALESCE(total_amount, 0) ELSE 0 END) AS purchases_total,
               SUM(CASE WHEN operation_type = 'sell' THEN COALESCE(total_amount, 0) ELSE 0 END) AS sales_total,
               SUM(CASE WHEN operation_type IN ('dividend', 'jcp', 'rendimento')
                        THEN COALESCE(total_amount, 0) ELSE 0 END) AS income_total,
               MAX(trade_date) AS latest_transaction
        FROM public.investment_transactions
        WHERE user_id = :user_id
        GROUP BY source
        ORDER BY source
        """,
        {"user_id": settings.assistant_user_id},
    )
    return {
        "user_id": settings.assistant_user_id,
        "sources_are_separate": True,
        "warning": "Não some as fontes sem reconciliar possíveis duplicidades entre Open Finance e custódia.",
        "by_source": rows,
    }


@mcp.tool()
def get_portfolio_positions(source: str | None = None, limit: int = 250) -> dict:
    """Calculate net buy-minus-sell quantities separately by source. Does not merge data sources or infer a consolidated position."""
    limit = max(1, min(limit, 500))
    params: dict = {"user_id": settings.assistant_user_id, "limit": limit}
    source_filter = ""
    if source:
        source_filter = " AND it.source = :source"
        params["source"] = source

    rows = fetch_all(
        f"""
        SELECT a.id AS asset_id,
               a.ticker_current,
               a.name,
               a.asset_type AS registered_asset_type,
               it.source,
               SUM(CASE
                   WHEN it.operation_type = 'buy' THEN COALESCE(it.quantity, 0)
                   WHEN it.operation_type = 'sell' THEN -COALESCE(it.quantity, 0)
                   ELSE 0
               END) AS net_quantity,
               COUNT(*) AS transaction_count,
               MAX(it.trade_date) AS last_trade_date
        FROM public.investment_transactions it
        JOIN public.assets a ON a.id = it.asset_id
        WHERE it.user_id = :user_id
          {source_filter}
        GROUP BY a.id, a.ticker_current, a.name, a.asset_type, it.source
        HAVING SUM(CASE
                   WHEN it.operation_type = 'buy' THEN COALESCE(it.quantity, 0)
                   WHEN it.operation_type = 'sell' THEN -COALESCE(it.quantity, 0)
                   ELSE 0
               END) > 0
        ORDER BY a.ticker_current, it.source
        LIMIT :limit
        """,
        params,
    )
    return {
        "positions_are_provisional": True,
        "method": "buy quantity minus sell quantity, grouped by source",
        "warning": "Validar eventos corporativos, transferências, amortizações e possíveis duplicidades antes de tratar como posição consolidada.",
        "positions": rows,
    }


@mcp.tool()
def get_transactions(
    ticker: str | None = None,
    operation_type: str | None = None,
    source: str | None = None,
    limit: int = 100,
) -> dict:
    """List recent investment transactions with optional ticker, operation and source filters."""
    limit = max(1, min(limit, 250))
    params: dict = {"user_id": settings.assistant_user_id, "limit": limit}
    filters = ["it.user_id = :user_id"]
    if ticker:
        filters.append("UPPER(a.ticker_current) = UPPER(:ticker)")
        params["ticker"] = ticker.strip()
    if operation_type:
        filters.append("it.operation_type = :operation_type")
        params["operation_type"] = operation_type.strip().lower()
    if source:
        filters.append("it.source = :source")
        params["source"] = source.strip()

    rows = fetch_all(
        f"""
        SELECT it.id, a.ticker_current, a.name, it.operation_type,
               it.quantity, it.unit_price, it.total_amount, it.costs,
               it.trade_date, it.source, it.notes
        FROM public.investment_transactions it
        JOIN public.assets a ON a.id = it.asset_id
        WHERE {' AND '.join(filters)}
        ORDER BY it.trade_date DESC, it.id DESC
        LIMIT :limit
        """,
        params,
    )
    return {"count": len(rows), "transactions": rows}


@mcp.tool()
def get_asset_details(ticker: str) -> dict:
    """Return the registered asset, user classification and latest available quote."""
    row = fetch_one(
        """
        SELECT a.id AS asset_id, a.ticker_current, a.name,
               a.asset_type AS registered_asset_type,
               uac.assistant_asset_class,
               uac.assistant_analysis_enabled,
               uac.assistant_classification_status,
               uac.assistant_notes,
               q.price AS latest_quote_price,
               q.currency AS latest_quote_currency,
               q.source AS latest_quote_source,
               q.quoted_at AS latest_quote_at
        FROM public.assets a
        LEFT JOIN public.user_asset_classifications uac
          ON uac.asset_id = a.id AND uac.user_id = :user_id
        LEFT JOIN LATERAL (
            SELECT price, currency, source, quoted_at
            FROM public.asset_quotes
            WHERE asset_id = a.id AND user_id = :user_id
            ORDER BY quoted_at DESC, id DESC
            LIMIT 1
        ) q ON TRUE
        WHERE UPPER(a.ticker_current) = UPPER(:ticker)
        """,
        {"user_id": settings.assistant_user_id, "ticker": ticker.strip()},
    )
    return row or {"found": False, "ticker": ticker}


@mcp.tool()
def get_asset_quotes(ticker: str | None = None, limit: int = 100) -> dict:
    """Return recent stored quotes. This tool does not fetch live market prices."""
    limit = max(1, min(limit, 250))
    params: dict = {"user_id": settings.assistant_user_id, "limit": limit}
    ticker_filter = ""
    if ticker:
        ticker_filter = " AND UPPER(a.ticker_current) = UPPER(:ticker)"
        params["ticker"] = ticker.strip()
    rows = fetch_all(
        f"""
        SELECT a.ticker_current, q.price, q.quantity, q.currency,
               q.source, q.quoted_at
        FROM public.asset_quotes q
        JOIN public.assets a ON a.id = q.asset_id
        WHERE q.user_id = :user_id {ticker_filter}
        ORDER BY q.quoted_at DESC, q.id DESC
        LIMIT :limit
        """,
        params,
    )
    return {
        "quotes_are_live": False,
        "count": len(rows),
        "quotes": rows,
    }


@mcp.tool()
def get_asset_reports(ticker: str | None = None, limit: int = 50) -> dict:
    """Read existing AI summaries and report metadata for the user's assets."""
    limit = max(1, min(limit, 100))
    params: dict = {"user_id": settings.assistant_user_id, "limit": limit}
    ticker_filter = ""
    if ticker:
        ticker_filter = " AND UPPER(a.ticker_current) = UPPER(:ticker)"
        params["ticker"] = ticker.strip()
    rows = fetch_all(
        f"""
        SELECT a.ticker_current, r.title, r.report_type,
               r.published_at, r.ai_summary, r.key_points, r.created_at
        FROM public.asset_reports r
        JOIN public.assets a ON a.id = r.asset_id
        WHERE r.user_id = :user_id {ticker_filter}
        ORDER BY COALESCE(r.published_at, r.created_at) DESC
        LIMIT :limit
        """,
        params,
    )
    return {"count": len(rows), "reports": rows}


@mcp.tool()
def get_portfolio_income(limit: int = 100) -> dict:
    """List dividend, JCP and rendimento entries, grouped by source and operation type."""
    limit = max(1, min(limit, 250))
    rows = fetch_all(
        """
        SELECT a.ticker_current, it.operation_type, it.total_amount,
               it.trade_date, it.source, it.notes
        FROM public.investment_transactions it
        JOIN public.assets a ON a.id = it.asset_id
        WHERE it.user_id = :user_id
          AND it.operation_type IN ('dividend', 'jcp', 'rendimento')
        ORDER BY it.trade_date DESC, it.id DESC
        LIMIT :limit
        """,
        {"user_id": settings.assistant_user_id, "limit": limit},
    )
    return {"count": len(rows), "income_entries": rows}


@mcp.tool()
def get_asset_classifications(status: str | None = None, limit: int = 250) -> dict:
    """List the user's assistant-specific asset classifications and analysis eligibility."""
    limit = max(1, min(limit, 500))
    params: dict = {"user_id": settings.assistant_user_id, "limit": limit}
    status_filter = ""
    if status:
        status_filter = " AND uac.assistant_classification_status = :status"
        params["status"] = status
    rows = fetch_all(
        f"""
        SELECT a.id AS asset_id, a.ticker_current, a.name,
               a.asset_type AS registered_asset_type,
               uac.assistant_asset_class,
               uac.assistant_analysis_enabled,
               uac.assistant_classification_status,
               uac.assistant_notes
        FROM public.user_asset_classifications uac
        JOIN public.assets a ON a.id = uac.asset_id
        WHERE uac.user_id = :user_id {status_filter}
        ORDER BY a.ticker_current
        LIMIT :limit
        """,
        params,
    )
    return {"count": len(rows), "classifications": rows}
