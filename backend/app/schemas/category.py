from pydantic import BaseModel
from typing import Optional

class CategoryBase(BaseModel):
    name: str
    type: Optional[str] = "both" # both, expense, income
    color: Optional[str] = "#3b82f6"

class CategoryCreate(CategoryBase):
    pass

class CategoryResponse(CategoryBase):
    id: int
    user_id: Optional[int] = None
    total_income: float = 0.0
    total_expense: float = 0.0
    balance: float = 0.0
    transactions_count: int = 0

    class Config:
        from_attributes = True
