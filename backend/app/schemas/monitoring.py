from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal

class AssetAlertBase(BaseModel):
    ticker: str
    rule_type: str # target_price_buy, target_price_sell, min_yield, max_pvp
    target_value: Decimal
    current_value: Optional[Decimal] = None
    notes: Optional[str] = None

class AssetAlertCreate(AssetAlertBase):
    pass

class AssetAlertResponse(AssetAlertBase):
    id: int
    asset_id: int
    asset_name: str
    is_triggered: bool
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class SwapRequest(BaseModel):
    source_ticker: str
    source_price: Decimal
    source_yield_annual: Decimal
    target_ticker: str
    target_price: Decimal
    target_yield_annual: Decimal
    capital_amount: Decimal

class ReportSummaryResponse(BaseModel):
    id: int
    ticker: str
    title: str
    report_type: str
    published_at: Optional[datetime]
    ai_summary: str
    created_at: datetime

    class Config:
        from_attributes = True
