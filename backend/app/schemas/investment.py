from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal

class InvestmentTransactionBase(BaseModel):
    ticker: str
    operation_type: str
    quantity: Decimal = Decimal("0")
    unit_price: Decimal = Decimal("0")
    costs: Decimal = Decimal("0.00")
    total_amount: Decimal
    trade_date: datetime
    notes: Optional[str] = None

class InvestmentTransactionCreate(InvestmentTransactionBase):
    pass

class InvestmentTransactionResponse(InvestmentTransactionBase):
    id: int
    asset_id: int
    asset_name: str
    asset_type: str
    source: str

    class Config:
        from_attributes = True

class PortfolioPosition(BaseModel):
    asset_id: int
    ticker: str
    name: str
    asset_type: str
    quantity: Decimal
    average_price: Decimal
    total_invested: Decimal
    total_dividends: Decimal

class TickerMigrationRequest(BaseModel):
    ticker_old: str
    ticker_new: str

class TickerMigrationResponse(BaseModel):
    status: str
    ticker_old: str
    ticker_new: str
    transactions_updated: int

class InvestmentSummary(BaseModel):
    total_equity_invested: Decimal
    monthly_capital_gain: Decimal
    total_dividends_received: Decimal
    positions_count: int
