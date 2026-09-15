from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal

class TransactionBase(BaseModel):
    account_id: int
    category_id: Optional[int] = None
    description: str
    amount: Decimal
    date: datetime
    is_manual: bool = True
    cost_type: Optional[str] = "variavel"
    is_accounted: bool = True

class TransactionCreate(TransactionBase):
    pass

class TransactionUpdateCategory(BaseModel):
    category_id: Optional[int]

class TransactionUpdateCostType(BaseModel):
    cost_type: str

class TransactionUpdateAccounted(BaseModel):
    is_accounted: bool

class TransactionResponse(TransactionBase):
    id: int
    pluggy_transaction_id: Optional[str] = None
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    account_name: Optional[str] = None

    class Config:
        from_attributes = True

class DashboardSummary(BaseModel):
    total_income: Decimal
    total_expense: Decimal
    net_total: Decimal
    expenses_by_category: List[Dict[str, Any]]
    monthly_trend: List[Dict[str, Any]]
    cost_type_summary: Optional[Dict[str, Any]] = None

class ExportXlsxPayload(BaseModel):
    transaction_ids: Optional[List[int]] = None
    period: Optional[str] = None
