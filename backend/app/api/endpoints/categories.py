from typing import List, Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.core.database import get_db
from app.models.entities import Category, Transaction, Account, User
from app.schemas.category import CategoryCreate, CategoryResponse
from app.api.deps import get_current_user
from app.services.date_utils import resolve_date_range

router = APIRouter(prefix="/categories", tags=["categories"])

DEFAULT_CATEGORIES = [
    {"name": "Alimentação / Supermercado", "type": "both", "color": "#f97316"},
    {"name": "Moradia / Contas", "type": "both", "color": "#ef4444"},
    {"name": "Transporte / Combustível", "type": "both", "color": "#eab308"},
    {"name": "Saúde & Treinos", "type": "both", "color": "#10b981"},
    {"name": "Lazer & Família", "type": "both", "color": "#ec4899"},
    {"name": "Salário / Remuneração", "type": "both", "color": "#22c55e"},
    {"name": "Proventos / Dividendos", "type": "both", "color": "#3b82f6"},
    {"name": "Rendimentos / Outros", "type": "both", "color": "#8b5cf6"},
]

@router.get("/", response_model=List[CategoryResponse])
def list_categories(
    period: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    total_count = db.query(Category).count()
    if total_count == 0:
        for cat_data in DEFAULT_CATEGORIES:
            db.add(Category(**cat_data, user_id=None))
        db.commit()

    categories = db.query(Category).filter(
        or_(Category.user_id == current_user.id, Category.user_id == None)
    ).order_by(Category.name.asc()).all()

    p_start, p_end = resolve_date_range(period)

    tx_query = db.query(
        Transaction.category_id,
        Transaction.amount
    ).join(Account, Transaction.account_id == Account.id).filter(
        Account.user_id == current_user.id,
        Transaction.is_accounted.is_(True)
    )

    if p_start:
        tx_query = tx_query.filter(Transaction.date >= p_start)
    if p_end:
        tx_query = tx_query.filter(Transaction.date <= p_end)

    user_txs = tx_query.all()

    cat_stats = {}
    for cat_id, amt in user_txs:
        if cat_id not in cat_stats:
            cat_stats[cat_id] = {"income": Decimal("0.00"), "expense": Decimal("0.00"), "count": 0}
        amt_dec = Decimal(str(amt))
        cat_stats[cat_id]["count"] += 1
        if amt_dec > 0:
            cat_stats[cat_id]["income"] += amt_dec
        else:
            cat_stats[cat_id]["expense"] += abs(amt_dec)

    results = []
    for cat in categories:
        stats = cat_stats.get(cat.id, {"income": Decimal("0.00"), "expense": Decimal("0.00"), "count": 0})
        inc = float(stats["income"])
        exp = float(stats["expense"])
        bal = inc - exp

        results.append(CategoryResponse(
            id=cat.id,
            name=cat.name,
            type=cat.type or "both",
            color=cat.color or "#3b82f6",
            user_id=cat.user_id,
            total_income=inc,
            total_expense=exp,
            balance=bal,
            transactions_count=stats["count"]
        ))

    return results

@router.post("/", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    category_in: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cat = Category(
        user_id=current_user.id,
        name=category_in.name,
        type=category_in.type or "both",
        color=category_in.color or "#3b82f6"
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return CategoryResponse(
        id=cat.id,
        name=cat.name,
        type=cat.type or "both",
        color=cat.color or "#3b82f6",
        user_id=cat.user_id,
        total_income=0.0,
        total_expense=0.0,
        balance=0.0,
        transactions_count=0
    )

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
