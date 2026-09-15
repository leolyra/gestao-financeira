from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime
from decimal import Decimal
from typing import Optional
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
            detail="Credenciais da Pluggy não configuradas. Adicione PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no Easypanel."
        )

    try:
        token = await pluggy_service.create_connect_token()
        return {"connectToken": token}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Falha na autenticação da Pluggy: {str(e)}"
        )

import asyncio

async def _process_item(item_id: str, current_user_id: int, db: Session):
    # Obtém detalhes do item para checar status da coleta
    item_info = await pluggy_service.get_item(item_id)
    item_status = item_info.get("status", "")
    execution_status = item_info.get("executionStatus", "")

    pluggy_accounts = await pluggy_service.get_accounts(item_id)
    synced_accs = 0
    synced_txs = 0

    for p_acc in pluggy_accounts:
        p_acc_id = p_acc.get("id")
        acc_name = p_acc.get("name") or p_acc.get("marketingName") or "Conta Bancária"
        acc_type = "checking" if p_acc.get("type") == "BANK" else "credit_card"
        acc_balance = Decimal(str(p_acc.get("balance", 0)))

        account = db.query(Account).filter(Account.pluggy_account_id == p_acc_id).first()
        if not account:
            account = Account(
                user_id=current_user_id,
                name=acc_name,
                type=acc_type,
                pluggy_account_id=p_acc_id,
                balance=acc_balance
            )
            db.add(account)
            db.commit()
            db.refresh(account)
            synced_accs += 1
        else:
            account.balance = acc_balance
            db.commit()

        # Busca transações (suporta /v2/transactions e /transactions)
        p_txs = await pluggy_service.get_transactions(p_acc_id)
        
        # Se veio vazio e o item ainda está em processamento, aguarda brevemente e tenta novamente
        if not p_txs and item_status == "UPDATING":
            await asyncio.sleep(2.5)
            p_txs = await pluggy_service.get_transactions(p_acc_id)

        for p_tx in p_txs:
            tx_id = p_tx.get("id")
            existing_tx = db.query(Transaction).filter(Transaction.pluggy_transaction_id == tx_id).first()
            if not existing_tx:
                desc = p_tx.get("description") or "Transação Bancária"
                amount = Decimal(str(p_tx.get("amount", 0)))
                raw_date = p_tx.get("date", "")
                try:
                    if raw_date:
                        clean_date = raw_date.replace("Z", "+00:00")
                        dt = datetime.fromisoformat(clean_date)
                        tx_date = dt.replace(tzinfo=None)
                    else:
                        tx_date = datetime.utcnow()
                except Exception:
                    tx_date = datetime.utcnow()

                cat_id = auto_categorize(desc, current_user_id, db)

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
                synced_txs += 1

    db.commit()
    return synced_accs, synced_txs, item_status

@router.post("/sync-all")
async def sync_all_existing_items(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        items = await pluggy_service.get_all_items()
        total_accounts = 0
        total_transactions = 0
        items_processed = 0

        for item in items:
            item_id = item.get("id")
            if not item_id:
                continue
            accs, txs, it_status = await _process_item(item_id, current_user.id, db)
            total_accounts += accs
            total_transactions += txs
            items_processed += 1

        message = None
        if total_transactions == 0 and total_accounts > 0:
            message = "Contas sincronizadas! O banco ainda pode estar consolidando o extrato. Se as transações não aparecerem, aguarde 1 minuto e clique em Sincronizar novamente."

        return {
            "status": "success",
            "items_count": items_processed,
            "accounts_synced": total_accounts,
            "transactions_synced": total_transactions,
            "notice": message
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

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
        accs, txs, it_status = await _process_item(item_id, current_user.id, db)
        return {
            "status": "success",
            "accounts_synced": accs,
            "transactions_synced": txs
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
