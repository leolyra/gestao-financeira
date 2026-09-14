from pydantic import BaseModel
from typing import Optional
from decimal import Decimal

class AccountBase(BaseModel):
    name: str
    type: str # checking, credit_card, investment
    balance: Decimal = Decimal("0.00")

class AccountCreate(AccountBase):
    pass

class AccountResponse(AccountBase):
    id: int
    user_id: int
    pluggy_account_id: Optional[str] = None

    class Config:
        from_attributes = True
