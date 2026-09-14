from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime
from decimal import Decimal
from app.core.config import settings
from app.core.database import get_db
from app.models.entities import Account, Transaction, User
from app.services.pluggy_service import pluggy_service
from app.services.categorizer import auto_categorize
from app.api.deps import get_current_user

router = APIRouter(prefix="/open-finance", tags=["open-finance"])

@router.post("/connect-token")
async def get_connect_token(current_user: User = Depends(get_current_user)):
    if not settings.PLUGGY_CLIENT_ID or not settings.PLUGGY_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Credenciais da Pluggy não configuradas. Adicione PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET nas variáveis de ambiente da API no Easypanel."
        )

    try:
        token = await pluggy_service.create_connect_token()
        return {"connectToken": token}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Falha na autenticação da Pluggy: {str(e)}"
        )

@router.post("/sync-item")
async def sync_item(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item_id = payload.get("itemId")
    if not item_id:
        raise HTTPException(status_code=400, detail="itemId é obrigatório.")

    try:
        pluggy_accounts = await pluggy_service.get_accounts(item_id)
        synced_accounts = 0
        synced_transactions = 0

        for p_acc in pluggy_accounts:
            p_acc_id = p_acc.get("id")
            acc_name = p_acc.get("name") or p_acc.get("marketingName") or "Conta Open Finance"
            acc_type = "checking" if p_acc.get("type") == "BANK" else "credit_card"
            acc_balance = Decimal(str(p_acc.get("balance", 0)))

            account = db.query(Account).filter(Account.pluggy_account_id == p_acc_id).first()
            if not account:
                account = Account(
                    user_id=current_user.id,
                    name=acc_name,
                    type=acc_type,
                    pluggy_account_id=p_acc_id,
                    balance=acc_balance
                )
                db.add(account)
                db.commit()
                db.refresh(account)
                synced_accounts += 1
            else:
                account.balance = acc_balance
                db.commit()

            p_txs = await pluggy_service.get_transactions(p_acc_id)
            for p_tx in p_txs:
                tx_id = p_tx.get("id")
                existing_tx = db.query(Transaction).filter(Transaction.pluggy_transaction_id == tx_id).first()
                if not existing_tx:
                    desc = p_tx.get("description") or "Transação Open Finance"
                    amount = Decimal(str(p_tx.get("amount", 0)))
                    tx_date = datetime.fromisoformat(p_tx.get("date").replace("Z", "+00:00"))

                    cat_id = auto_categorize(desc, current_user.id, db)

                    new_tx = Transaction(
                        account_id=account.id,
                        category_id=cat_id,
                        description=desc,
                        amount=amount,
                        date=tx_date,
                        is_manual=False,
                        pluggy_transaction_id=tx_id
                    )
                    db.add(new_tx)
                    synced_transactions += 1

        db.commit()
        return {
            "status": "success",
            "accounts_synced": synced_accounts,
            "transactions_synced": synced_transactions
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
