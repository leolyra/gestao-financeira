from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any
import asyncio
from app.core.config import settings
from app.core.database import get_db
from app.models.entities import Account, Transaction, User, Asset, InvestmentTransaction
from app.services.pluggy_service import pluggy_service
from app.services.categorizer import auto_categorize
from app.api.deps import get_current_user
from app.api.endpoints.investments import get_or_create_asset

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

def _save_transaction(p_tx: dict, account_id: int, is_credit_card: bool, user_id: int, db: Session) -> bool:
    tx_id = p_tx.get("id")
    if not tx_id:
        return False
    
    existing = db.query(Transaction).filter(Transaction.pluggy_transaction_id == tx_id).first()
    if existing:
        return False

    desc = p_tx.get("description") or "Transação Bancária"
    raw_amount = Decimal(str(p_tx.get("amount", 0)))
    
    # Para cartões de crédito: cobranças/compras (DEBIT) são valores positivos na Pluggy, convertemos para negativo (despesa)
    if is_credit_card:
        tx_type = str(p_tx.get("type", "")).upper()
        if tx_type == "DEBIT" or raw_amount > 0:
            amount = -abs(raw_amount)
        else:
            amount = abs(raw_amount) # Pagamento de fatura / estorno
    else:
        amount = raw_amount

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

    cat_id = auto_categorize(desc, user_id, db)

    new_tx = Transaction(
        account_id=account_id,
        category_id=cat_id,
        description=desc,
        amount=amount,
        date=tx_date,
        is_manual=False,
        pluggy_transaction_id=tx_id
    )
    db.add(new_tx)
    return True

async def _process_item(item_id: str, current_user_id: int, db: Session):
    item_info = await pluggy_service.get_item(item_id)
    item_status = item_info.get("status", "")

    pluggy_accounts = await pluggy_service.get_accounts(item_id)
    synced_accs = 0
    synced_txs = 0

    for p_acc in pluggy_accounts:
        p_acc_id = p_acc.get("id")
        acc_name = p_acc.get("name") or p_acc.get("marketingName") or "Conta Bancária"
        p_type = p_acc.get("type", "").upper()
        is_cc = (p_type == "CREDIT")
        acc_type = "credit_card" if is_cc else "checking"
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

        # 1. Transações diretas da conta
        p_txs = await pluggy_service.get_transactions(p_acc_id)
        
        # 2. Se for cartão de crédito, busca também todas as faturas (bills) e suas transações
        if is_cc:
            bills = await pluggy_service.get_bills(p_acc_id)
            for b in bills:
                b_id = b.get("id")
                if b_id:
                    b_txs = await pluggy_service.get_transactions(p_acc_id, bill_id=b_id)
                    p_txs.extend(b_txs)

        for p_tx in p_txs:
            if _save_transaction(p_tx, account.id, is_cc, current_user_id, db):
                synced_txs += 1

    # 3. Investimentos do Item
    synced_invs = 0
    try:
        investments = await pluggy_service.get_investments(item_id)
        for inv in investments:
            code = (inv.get("code") or inv.get("isin") or inv.get("name") or "INVEST").upper().strip()[:20]
            name = inv.get("name") or code
            inv_type = (inv.get("type") or "").upper()
            inv_subtype = (inv.get("subtype") or "").upper()

            if inv_subtype == "REAL_ESTATE_FUND" or "FII" in code or code.endswith("11"):
                asset_type = "FII"
            elif inv_subtype in ["STOCK", "BDR"] or inv_type == "EQUITY":
                asset_type = "Ação" if inv_subtype == "STOCK" else "BDR"
            elif inv_type == "ETF" or inv_subtype == "ETF":
                asset_type = "ETF"
            elif inv_type in ["FIXED_INCOME", "SECURITY"] or inv_subtype in ["CDB", "LCI", "LCA", "TREASURY"]:
                asset_type = "Renda Fixa"
            elif inv_type == "MUTUAL_FUND":
                asset_type = "Fundo"
            else:
                asset_type = "Outros"

            asset = get_or_create_asset(code, name, asset_type, db)

            qty = Decimal(str(inv.get("quantity") or 1))
            val = Decimal(str(inv.get("value") or (Decimal(str(inv.get("amount", 0))) / qty if qty > 0 else 0)))
            amt = Decimal(str(inv.get("amount") or inv.get("balance") or (qty * val)))
            amount_orig = Decimal(str(inv.get("amountOriginal") or amt))
            unit_p = (amount_orig / qty).quantize(Decimal("0.01")) if qty > 0 else val

            raw_d = inv.get("date") or ""
            trade_d = datetime.utcnow()
            if raw_d:
                try:
                    trade_d = datetime.fromisoformat(raw_d.replace("Z", "+00:00")).replace(tzinfo=None)
                except Exception:
                    pass

            existing_inv = db.query(InvestmentTransaction).filter(
                InvestmentTransaction.user_id == current_user_id,
                InvestmentTransaction.asset_id == asset.id,
                InvestmentTransaction.source == "open_finance"
            ).first()

            if not existing_inv:
                new_inv = InvestmentTransaction(
                    user_id=current_user_id,
                    asset_id=asset.id,
                    operation_type="buy",
                    quantity=qty,
                    unit_price=unit_p,
                    total_amount=amount_orig,
                    trade_date=trade_d,
                    source="open_finance",
                    notes=f"Posição Open Finance ({inv_type})"
                )
                db.add(new_inv)
                synced_invs += 1
            else:
                existing_inv.quantity = qty
                existing_inv.unit_price = unit_p
                existing_inv.total_amount = amount_orig
                existing_inv.trade_date = trade_d

            # Transações históricas do investimento
            inv_id = inv.get("id")
            if inv_id:
                inv_txs = await pluggy_service.get_investment_transactions(inv_id)
                for itx in inv_txs:
                    itx_id = itx.get("id")
                    if not itx_id:
                        continue
                    already = db.query(InvestmentTransaction).filter(
                        InvestmentTransaction.user_id == current_user_id,
                        InvestmentTransaction.notes.ilike(f"%PluggyTx:{itx_id}%")
                    ).first()
                    if not already:
                        itx_type = (itx.get("type") or "BUY").lower()
                        op_type = "dividend" if itx_type in ["dividend", "interest", "rendimento"] else ("sell" if itx_type == "sell" else "buy")
                        itx_qty = Decimal(str(itx.get("quantity") or 0))
                        itx_val = Decimal(str(itx.get("value") or 0))
                        itx_amt = Decimal(str(itx.get("amount") or (itx_qty * itx_val)))
                        itx_d = datetime.utcnow()
                        itx_raw_d = itx.get("tradeDate") or itx.get("date")
                        if itx_raw_d:
                            try:
                                itx_d = datetime.fromisoformat(itx_raw_d.replace("Z", "+00:00")).replace(tzinfo=None)
                            except Exception:
                                pass
                        sub_tx = InvestmentTransaction(
                            user_id=current_user_id,
                            asset_id=asset.id,
                            operation_type=op_type,
                            quantity=itx_qty,
                            unit_price=itx_val,
                            total_amount=itx_amt,
                            trade_date=itx_d,
                            source="open_finance",
                            notes=f"PluggyTx:{itx_id}"
                        )
                        db.add(sub_tx)
                        synced_invs += 1
    except Exception as e:
        print(f"[OPEN_FINANCE] Erro ao sincronizar investimentos do item {item_id}: {e}")

    db.commit()
    return synced_accs, synced_txs, synced_invs, item_status

@router.post("/sync-all")
async def sync_all_existing_items(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    total_accounts = 0
    total_transactions = 0
    total_investments = 0
    items_processed = 0
    items_success = False

    # 1. Busca e sincroniza itens gerais na Pluggy
    try:
        items = await pluggy_service.get_all_items()
        for item in items:
            item_id = item.get("id")
            if not item_id:
                continue
            accs, txs, invs, it_status = await _process_item(item_id, current_user.id, db)
            total_accounts += accs
            total_transactions += txs
            total_investments += invs
            items_processed += 1
        items_success = True
    except Exception as e:
        print(f"[OPEN_FINANCE] Aviso ao listar items gerais: {e}")

    # 2. Sincroniza contas já salvas no banco de dados (especialmente faturas de cartões de crédito)
    existing_accounts = db.query(Account).filter(
        Account.user_id == current_user.id,
        Account.pluggy_account_id.isnot(None)
    ).all()

    for acc in existing_accounts:
        is_cc = (acc.type == "credit_card")
        p_txs = await pluggy_service.get_transactions(acc.pluggy_account_id)
        if is_cc:
            bills = await pluggy_service.get_bills(acc.pluggy_account_id)
            for b in bills:
                b_id = b.get("id")
                if b_id:
                    b_txs = await pluggy_service.get_transactions(acc.pluggy_account_id, bill_id=b_id)
                    p_txs.extend(b_txs)

        for p_tx in p_txs:
            if _save_transaction(p_tx, acc.id, is_cc, current_user.id, db):
                total_transactions += 1
    
    db.commit()

    if not items_success and not existing_accounts:
        try:
            await pluggy_service.get_all_items()
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

    return {
        "status": "success",
        "items_count": items_processed or len(existing_accounts),
        "accounts_synced": total_accounts or len(existing_accounts),
        "transactions_synced": total_transactions,
        "investments_synced": total_investments
    }

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
        accs, txs, invs, it_status = await _process_item(item_id, current_user.id, db)
        return {
            "status": "success",
            "accounts_synced": accs,
            "transactions_synced": txs,
            "investments_synced": invs
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
