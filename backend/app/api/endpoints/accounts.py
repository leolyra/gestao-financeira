from typing import List
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.models.entities import Account, Transaction, User
from app.schemas.account import AccountCreate, AccountResponse
from app.api.deps import get_current_user

router = APIRouter(prefix="/accounts", tags=["accounts"])

@router.get("/", response_model=List[AccountResponse])
def list_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    accounts = db.query(Account).filter(Account.user_id == current_user.id).all()
    for acc in accounts:
        # Soma de todas as transações marcadas como NÃO CONTABILIZAR (is_accounted == False)
        non_acc_sum = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
            Transaction.account_id == acc.id,
            Transaction.is_accounted == False
        ).scalar()

        # O saldo contabilizado retira o efeito das transações não contabilizadas:
        # Se uma despesa de -R$ 500 não deve ser contabilizada, o saldo disponível não sofre o decréscimo.
        # Se uma receita de +R$ 1000 não deve ser contabilizada, o saldo não sofre o acréscimo.
        raw_bal = Decimal(str(acc.balance or 0))
        non_acc_dec = Decimal(str(non_acc_sum or 0))
        acc.balance = raw_bal - non_acc_dec

    return accounts

@router.post("/", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
def create_account(
    account_in: AccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    account = Account(
        user_id=current_user.id,
        name=account_in.name,
        type=account_in.type,
        balance=account_in.balance
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account

@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    account = db.query(Account).filter(Account.id == account_id, Account.user_id == current_user.id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada.")
    db.delete(account)
    db.commit()
    return None
