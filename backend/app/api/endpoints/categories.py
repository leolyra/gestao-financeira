from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.core.database import get_db
from app.models.entities import Category, User
from app.schemas.category import CategoryCreate, CategoryResponse
from app.api.deps import get_current_user

router = APIRouter(prefix="/categories", tags=["categories"])

DEFAULT_CATEGORIES = [
    {"name": "Alimentação / Supermercado", "type": "expense", "color": "#f97316"},
    {"name": "Moradia / Contas", "type": "expense", "color": "#ef4444"},
    {"name": "Transporte / Combustível", "type": "expense", "color": "#eab308"},
    {"name": "Saúde & Treinos", "type": "expense", "color": "#10b981"},
    {"name": "Lazer & Família", "type": "expense", "color": "#ec4899"},
    {"name": "Salário / Remuneração", "type": "income", "color": "#22c55e"},
    {"name": "Proventos / Dividendos", "type": "income", "color": "#3b82f6"},
    {"name": "Rendimentos / Outros", "type": "income", "color": "#8b5cf6"},
]

@router.get("/", response_model=List[CategoryResponse])
def list_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    total_count = db.query(Category).count()
    if total_count == 0:
        for cat_data in DEFAULT_CATEGORIES:
            db.add(Category(**cat_data, user_id=None))
        db.commit()

    return db.query(Category).filter(
        or_(Category.user_id == current_user.id, Category.user_id == None)
    ).all()

@router.post("/", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    category_in: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cat = Category(
        user_id=current_user.id,
        name=category_in.name,
        type=category_in.type,
        color=category_in.color
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat

@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cat = db.query(Category).filter(Category.id == category_id, Category.user_id == current_user.id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoria não encontrada ou não editável.")
    db.delete(cat)
    db.commit()
    return None
