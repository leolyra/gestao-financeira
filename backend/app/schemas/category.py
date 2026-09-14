from pydantic import BaseModel
from typing import Optional

class CategoryBase(BaseModel):
    name: str
    type: str # income, expense
    color: Optional[str] = "#3b82f6"

class CategoryCreate(CategoryBase):
    pass

class CategoryResponse(CategoryBase):
    id: int
    user_id: Optional[int] = None

    class Config:
        from_attributes = True
