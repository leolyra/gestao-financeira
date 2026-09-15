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
    TransactionUpdateAccounted,
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
        cost_type=c_type,
        is_accounted=tx_in.is_accounted if tx_in.is_accounted is not None else True
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

@router.patch("/{transaction_id}/accounted", response_model=TransactionResponse)
def update_transaction_accounted(
    transaction_id: int,
    payload: TransactionUpdateAccounted,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    tx = db.query(Transaction).join(Account).filter(
        Transaction.id == transaction_id,
        Account.user_id == current_user.id
    ).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transação não encontrada.")

    tx.is_accounted = payload.is_accounted
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
    days: int = Query(90, ge=7, le=3650),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if days >= 3650:
        since_date = datetime(2000, 1, 1)
    else:
        since_date = datetime.utcnow() - timedelta(days=days)
    transactions = db.query(Transaction, Category.name, Category.color).join(Account).outerjoin(Category)\
        .filter(Account.user_id == current_user.id, Transaction.date >= since_date, Transaction.is_accounted == True).all()

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
            monthly_trend_dict[month_key] = {"month": month_key, "income": Decimal("0"), "expense": Decimal("0"), "fixed_expense": Decimal("0"), "variable_expense": Decimal("0")}

        c_name = cat_name or "Sem Categoria"
        if c_name not in cat_totals:
            cat_totals[c_name] = {"name": c_name, "income": Decimal("0.00"), "expense": Decimal("0.00"), "color": cat_color or "#94a3b8"}

        if amt > 0:
            total_income += amt
            monthly_trend_dict[month_key]["income"] += amt
            cat_totals[c_name]["income"] += amt
            if "fix" in c_type:
                fixed_income += amt
            else:
                variable_income += amt
        else:
            abs_amt = abs(amt)
            total_expense += abs_amt
            monthly_trend_dict[month_key]["expense"] += abs_amt
            cat_totals[c_name]["expense"] += abs_amt
            if "fix" in c_type:
                fixed_expense += abs_amt
                monthly_trend_dict[month_key]["fixed_expense"] += abs_amt
            else:
                variable_expense += abs_amt
                monthly_trend_dict[month_key]["variable_expense"] += abs_amt

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

    expenses_by_cat = []
    for c_name, c_data in cat_totals.items():
        if c_data["expense"] > 0:
            # Saldo de despesas compensado com eventuais creditos/estornos da categoria
            net_expense = max(c_data["expense"] - c_data["income"], Decimal("0.00"))
            expenses_by_cat.append({
                "name": c_name,
                "value": float(net_expense),
                "gross_expense": float(c_data["expense"]),
                "credits": float(c_data["income"]),
                "balance": float(c_data["income"] - c_data["expense"]),
                "color": c_data["color"]
            })

    return DashboardSummary(
        total_income=total_income,
        total_expense=total_expense,
        net_total=total_income - total_expense,
        expenses_by_category=sorted(expenses_by_cat, key=lambda x: x["value"], reverse=True),
        monthly_trend=sorted(list(monthly_trend_dict.values()), key=lambda x: x["month"]),
        cost_type_summary=cost_type_summary
    )

@router.get("/historical-evolution")
def get_historical_evolution(
    months: int = Query(12, ge=3, le=120),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if months >= 120:
        since_date = datetime(2000, 1, 1)
    else:
        since_date = datetime.utcnow() - timedelta(days=months * 31)

    transactions = db.query(Transaction, Category.name, Category.color).join(Account).outerjoin(Category)\
        .filter(Account.user_id == current_user.id, Transaction.date >= since_date, Transaction.is_accounted == True)\
        .order_by(Transaction.date.asc()).all()

    monthly_data = {}
    all_categories = set()

    for tx, cat_name, cat_color in transactions:
        m_key = tx.date.strftime("%Y-%m")
        c_name = cat_name or "Sem Categoria"
        all_categories.add(c_name)

        if m_key not in monthly_data:
            monthly_data[m_key] = {
                "month": m_key,
                "income": Decimal("0.00"),
                "expense": Decimal("0.00"),
                "fixed_expense": Decimal("0.00"),
                "variable_expense": Decimal("0.00"),
                "categories": {}
            }

        amt = Decimal(str(tx.amount))
        c_type = str(getattr(tx, "cost_type", None) or "variavel").lower()

        if amt > 0:
            monthly_data[m_key]["income"] += amt
        else:
            abs_amt = abs(amt)
            monthly_data[m_key]["expense"] += abs_amt
            if "fix" in c_type:
                monthly_data[m_key]["fixed_expense"] += abs_amt
            else:
                monthly_data[m_key]["variable_expense"] += abs_amt

            if c_name not in monthly_data[m_key]["categories"]:
                monthly_data[m_key]["categories"][c_name] = Decimal("0.00")
            monthly_data[m_key]["categories"][c_name] += abs_amt

    sorted_months = sorted(monthly_data.keys())
    months_list = []
    tot_income = Decimal("0.00")
    tot_expense = Decimal("0.00")
    tot_fixed = Decimal("0.00")
    tot_var = Decimal("0.00")

    for m in sorted_months:
        d = monthly_data[m]
        inc = d["income"]
        exp = d["expense"]
        net = inc - exp
        f_exp = d["fixed_expense"]
        v_exp = d["variable_expense"]

        tot_income += inc
        tot_expense += exp
        tot_fixed += f_exp
        tot_var += v_exp

        sav_rate = float(round((net / inc * 100), 1)) if inc > 0 else (0.0 if net >= 0 else -100.0)
        f_pct = float(round((f_exp / exp * 100), 1)) if exp > 0 else 0.0
        v_pct = float(round((v_exp / exp * 100), 1)) if exp > 0 else 0.0

        months_list.append({
            "month": m,
            "income": float(inc),
            "expense": float(exp),
            "net": float(net),
            "fixed_expense": float(f_exp),
            "variable_expense": float(v_exp),
            "fixed_expense_pct": f_pct,
            "variable_expense_pct": v_pct,
            "savings_rate": sav_rate,
            "categories": {k: float(v) for k, v in d["categories"].items()}
        })

    num_months = max(len(months_list), 1)
    return {
        "months": months_list,
        "categories_list": sorted(list(all_categories)),
        "summary": {
            "total_income": float(tot_income),
            "total_expense": float(tot_expense),
            "total_net": float(tot_income - tot_expense),
            "avg_monthly_income": float(tot_income / num_months) if num_months > 0 else 0.0,
            "avg_monthly_expense": float(tot_expense / num_months) if num_months > 0 else 0.0,
            "avg_fixed_expense": float(tot_fixed / num_months) if num_months > 0 else 0.0,
            "avg_variable_expense": float(tot_var / num_months) if num_months > 0 else 0.0,
            "total_months_count": len(months_list)
        }
    }
