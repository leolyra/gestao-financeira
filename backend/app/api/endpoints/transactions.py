from typing import List, Optional
from datetime import datetime, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.entities import Transaction, Account, Category, User
from app.schemas.transaction import (
    TransactionCreate, 
    TransactionUpdateCategory, 
    TransactionUpdateCostType,
    TransactionResponse,
    DashboardSummary
)
from app.services.categorizer import auto_categorize
from app.api.deps import get_current_user

router = APIRouter(prefix="/transactions", tags=["transactions"])

@router.get("/", response_model=List[TransactionResponse])
def list_transactions(
    account_id: Optional[int] = None,
    category_id: Optional[int] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(
        Transaction,
        Category.name.label("category_name"),
        Category.color.label("category_color"),
        Account.name.label("account_name")
    ).join(Account, Transaction.account_id == Account.id)\
     .outerjoin(Category, Transaction.category_id == Category.id)\
     .filter(Account.user_id == current_user.id)

    if account_id:
        query = query.filter(Transaction.account_id == account_id)
    if category_id:
        query = query.filter(Transaction.category_id == category_id)
    if start_date:
        query = query.filter(Transaction.date >= start_date)
    if end_date:
        query = query.filter(Transaction.date <= end_date)

    results = query.order_by(Transaction.date.desc()).limit(200).all()
    
    response = []
    for tx, cat_name, cat_color, acc_name in results:
        res = TransactionResponse.model_validate(tx)
        res.category_name = cat_name
        res.category_color = cat_color
        res.account_name = acc_name
        response.append(res)
    return response

@router.post("/", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def create_transaction(
    tx_in: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    account = db.query(Account).filter(Account.id == tx_in.account_id, Account.user_id == current_user.id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada.")

    category_id = tx_in.category_id
    if not category_id:
        category_id = auto_categorize(tx_in.description, current_user.id, db)

    c_type = (tx_in.cost_type or "variavel").lower().strip()
    if c_type not in ["fixa", "variavel"]:
        c_type = "variavel"

    tx = Transaction(
        account_id=tx_in.account_id,
        category_id=category_id,
        description=tx_in.description,
        amount=tx_in.amount,
        date=tx_in.date,
        is_manual=True,
        cost_type=c_type
    )
    db.add(tx)
    account.balance = Decimal(str(account.balance)) + Decimal(str(tx_in.amount))
    db.commit()
    db.refresh(tx)

    cat = db.query(Category).filter(Category.id == tx.category_id).first() if tx.category_id else None
    res = TransactionResponse.model_validate(tx)
    res.category_name = cat.name if cat else None
    res.category_color = cat.color if cat else None
    res.account_name = account.name
    return res

@router.patch("/{transaction_id}/category", response_model=TransactionResponse)
def update_transaction_category(
    transaction_id: int,
    cat_update: TransactionUpdateCategory,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    tx = db.query(Transaction).join(Account).filter(
        Transaction.id == transaction_id,
        Account.user_id == current_user.id
    ).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transação não encontrada.")

    tx.category_id = cat_update.category_id
    db.commit()
    db.refresh(tx)

    cat = db.query(Category).filter(Category.id == tx.category_id).first() if tx.category_id else None
    acc = db.query(Account).filter(Account.id == tx.account_id).first()
    res = TransactionResponse.model_validate(tx)
    res.category_name = cat.name if cat else None
    res.category_color = cat.color if cat else None
    res.account_name = acc.name if acc else None
    return res

@router.patch("/{transaction_id}/cost-type", response_model=TransactionResponse)
def update_transaction_cost_type(
    transaction_id: int,
    payload: TransactionUpdateCostType,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    tx = db.query(Transaction).join(Account).filter(
        Transaction.id == transaction_id,
        Account.user_id == current_user.id
    ).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transação não encontrada.")

    new_type = payload.cost_type.lower().strip()
    tx.cost_type = "fixa" if "fix" in new_type else "variavel"
    db.commit()
    db.refresh(tx)

    cat = db.query(Category).filter(Category.id == tx.category_id).first() if tx.category_id else None
    acc = db.query(Account).filter(Account.id == tx.account_id).first()
    res = TransactionResponse.model_validate(tx)
    res.category_name = cat.name if cat else None
    res.category_color = cat.color if cat else None
    res.account_name = acc.name if acc else None
    return res

@router.get("/summary", response_model=DashboardSummary)
def get_summary(
    days: int = Query(30, ge=7, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    since_date = datetime.utcnow() - timedelta(days=days)
    transactions = db.query(Transaction, Category.name, Category.color).join(Account).outerjoin(Category)\
        .filter(Account.user_id == current_user.id, Transaction.date >= since_date).all()

    total_income = Decimal("0.00")
    total_expense = Decimal("0.00")
    cat_totals = {}
    monthly_trend_dict = {}

    fixed_expense = Decimal("0.00")
    variable_expense = Decimal("0.00")
    fixed_income = Decimal("0.00")
    variable_income = Decimal("0.00")

    for tx, cat_name, cat_color in transactions:
        amt = Decimal(str(tx.amount))
        month_key = tx.date.strftime("%Y-%m")
        c_type = str(getattr(tx, "cost_type", None) or "variavel").lower()

        if month_key not in monthly_trend_dict:
            monthly_trend_dict[month_key] = {"month": month_key, "income": Decimal("0"), "expense": Decimal("0")}

        if amt > 0:
            total_income += amt
            monthly_trend_dict[month_key]["income"] += amt
            if "fix" in c_type:
                fixed_income += amt
            else:
                variable_income += amt
        else:
            abs_amt = abs(amt)
            total_expense += abs_amt
            monthly_trend_dict[month_key]["expense"] += abs_amt
            if "fix" in c_type:
                fixed_expense += abs_amt
            else:
                variable_expense += abs_amt

            c_name = cat_name or "Sem Categoria"
            if c_name not in cat_totals:
                cat_totals[c_name] = {"name": c_name, "value": Decimal("0"), "color": cat_color or "#94a3b8"}
            cat_totals[c_name]["value"] += abs_amt

    tot_exp = fixed_expense + variable_expense
    fixed_exp_pct = float(round((fixed_expense / tot_exp * 100), 1)) if tot_exp > 0 else 0.0
    var_exp_pct = float(round((variable_expense / tot_exp * 100), 1)) if tot_exp > 0 else 0.0

    tot_inc = fixed_income + variable_income
    fixed_inc_pct = float(round((fixed_income / tot_inc * 100), 1)) if tot_inc > 0 else 0.0
    var_inc_pct = float(round((variable_income / tot_inc * 100), 1)) if tot_inc > 0 else 0.0

    cost_type_summary = {
        "fixed_expense": float(fixed_expense),
        "variable_expense": float(variable_expense),
        "fixed_income": float(fixed_income),
        "variable_income": float(variable_income),
        "fixed_expense_pct": fixed_exp_pct,
        "variable_expense_pct": var_exp_pct,
        "fixed_income_pct": fixed_inc_pct,
        "variable_income_pct": var_inc_pct
    }

    return DashboardSummary(
        total_income=total_income,
        total_expense=total_expense,
        net_total=total_income - total_expense,
        expenses_by_category=sorted(list(cat_totals.values()), key=lambda x: x["value"], reverse=True),
        monthly_trend=sorted(list(monthly_trend_dict.values()), key=lambda x: x["month"]),
        cost_type_summary=cost_type_summary
    )
