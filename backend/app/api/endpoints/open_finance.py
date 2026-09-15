from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any
import asyncio
from app.core.config import settings
from app.core.database import get_db
from app.models.entities import Account, Transaction, User, Asset, InvestmentTransaction
from app.services.pluggy_service import pluggy_service
from app.services.categorizer import auto_categorize, detect_cost_type
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
    c_type = detect_cost_type(desc)

    new_tx = Transaction(
        account_id=account_id,
        category_id=cat_id,
        description=desc,
        amount=amount,
        date=tx_date,
        is_manual=False,
        pluggy_transaction_id=tx_id,
        cost_type=c_type
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
        p_type = str(p_acc.get("type") or "").upper()
        p_subtype = str(p_acc.get("subtype") or "").upper()
        
        # Reconhecimento amplo de cartão de crédito
        is_cc = (
            p_type in ["CREDIT", "CREDIT_CARD"] or
            "CREDIT" in p_subtype or
            "CARD" in p_subtype or
            "CARTAO" in acc_name.upper() or
            "CRÉDITO" in acc_name.upper()
        )
        acc_type = "credit_card" if is_cc else "checking"
        acc_balance = Decimal(str(p_acc.get("balance", 0)))

        account = db.query(Account).filter(Account.pluggy_account_id == p_acc_id).first()
        if not account:
            account = Account(
                user_id=current_user_id,
                name=acc_name,
                type=acc_type,
                pluggy_account_id=p_acc_id,
                pluggy_item_id=item_id,
                balance=acc_balance
            )
            db.add(account)
            db.commit()
            db.refresh(account)
            synced_accs += 1
        else:
            account.balance = acc_balance
            account.type = acc_type
            account.pluggy_item_id = item_id
            db.commit()

        # 1. Transações diretas da conta
        p_txs = await pluggy_service.get_transactions(p_acc_id)
        
        # 2. Se for cartão de crédito (ou suspeita), busca também faturas (bills) e suas transações
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

    existing_accounts = db.query(Account).filter(
        Account.user_id == current_user.id,
        Account.pluggy_account_id.isnot(None)
    ).all()

    item_ids = set()
    for acc in existing_accounts:
        if getattr(acc, "pluggy_item_id", None):
            item_ids.add(acc.pluggy_item_id)
        else:
            try:
                p_acc = await pluggy_service.get_account(acc.pluggy_account_id)
                iid = p_acc.get("itemId")
                if iid:
                    item_ids.add(iid)
                    acc.pluggy_item_id = iid
                    db.commit()
            except Exception as e:
                print(f"[SYNC_ALL] Erro ao recuperar itemId da conta {acc.id}: {e}")

    for item_id in item_ids:
        try:
            accs, txs, invs, it_status = await _process_item(item_id, current_user.id, db)
            total_accounts += accs
            total_transactions += txs
            total_investments += invs
            items_processed += 1
        except Exception as e:
            print(f"[SYNC_ALL] Erro ao processar item {item_id}: {e}")

    # Garante sincronizacao direta para qualquer conta que ja esteja no banco
    for acc in existing_accounts:
        is_cc = (acc.type == "credit_card")
        try:
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
        except Exception as e:
            print(f"[SYNC_ALL] Erro ao sincronizar transacoes da conta {acc.id}: {e}")

    db.commit()

    return {
        "status": "success",
        "items_count": items_processed or len(item_ids),
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

@router.get("/diagnostics")
async def get_open_finance_diagnostics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Inspeciona detalhadamente o que a API da Pluggy está retornando para cada instituição conectada.
    Útil para verificar permissões de cartão de crédito e investimentos concedidas pelo usuário.
    """
    report = {
        "user_id": current_user.id,
        "timestamp": datetime.utcnow().isoformat(),
        "total_items_found": 0,
        "items": [],
        "database_summary": {
            "checking_accounts": db.query(Account).filter(Account.user_id == current_user.id, Account.type != "credit_card").count(),
            "credit_cards": db.query(Account).filter(Account.user_id == current_user.id, Account.type == "credit_card").count(),
            "transactions_count": db.query(Transaction).join(Account).filter(Account.user_id == current_user.id).count(),
            "investments_count": db.query(func.count(InvestmentTransaction.id)).filter(InvestmentTransaction.user_id == current_user.id).scalar() or 0
        }
    }

    try:
        user_accounts = db.query(Account).filter(
            Account.user_id == current_user.id,
            Account.pluggy_account_id.isnot(None)
        ).all()

        item_ids = set()
        for acc in user_accounts:
            if getattr(acc, "pluggy_item_id", None):
                item_ids.add(acc.pluggy_item_id)
            else:
                try:
                    p_acc = await pluggy_service.get_account(acc.pluggy_account_id)
                    iid = p_acc.get("itemId")
                    if iid:
                        item_ids.add(iid)
                        acc.pluggy_item_id = iid
                        db.commit()
                except Exception as e:
                    print(f"[DIAGNOSTICS] Erro ao recuperar itemId da conta {acc.id}: {e}")

        report["total_items_found"] = len(item_ids)

        for it_id in item_ids:
            it = await pluggy_service.get_item(it_id)
            connector = it.get("connector") or {}
            conn_name = connector.get("name") or "Desconhecido"
            it_status = it.get("status")
            it_exec = it.get("executionStatus")
            
            it_data = {
                "item_id": it_id,
                "connector_name": conn_name,
                "status": it_status,
                "execution_status": it_exec,
                "created_at": it.get("createdAt"),
                "updated_at": it.get("updatedAt"),
                "accounts": [],
                "investments": []
            }

            # Contas
            try:
                accs = await pluggy_service.get_accounts(it_id)
                for a in accs:
                    a_id = a.get("id")
                    a_type = a.get("type")
                    a_subtype = a.get("subtype")
                    a_name = a.get("name") or a.get("marketingName")
                    a_balance = a.get("balance")

                    # Faturas (se for cartão)
                    bills = []
                    if a_type == "CREDIT" or "CARD" in str(a_subtype):
                        raw_bills = await pluggy_service.get_bills(a_id)
                        bills = [{"id": b.get("id"), "dueDate": b.get("dueDate"), "totalAmount": b.get("totalAmount")} for b in raw_bills]

                    # Transações
                    txs = await pluggy_service.get_transactions(a_id)

                    it_data["accounts"].append({
                        "id": a_id,
                        "name": a_name,
                        "type": a_type,
                        "subtype": a_subtype,
                        "balance": a_balance,
                        "bills_found": len(bills),
                        "bills_sample": bills[:3],
                        "transactions_found": len(txs),
                        "transactions_sample": [t.get("description") for t in txs[:3]]
                    })
            except Exception as e:
                it_data["accounts_error"] = str(e)

            # Investimentos
            try:
                invs = await pluggy_service.get_investments(it_id)
                for inv in invs:
                    it_data["investments"].append({
                        "id": inv.get("id"),
                        "name": inv.get("name"),
                        "code": inv.get("code"),
                        "type": inv.get("type"),
                        "subtype": inv.get("subtype"),
                        "balance": inv.get("balance") or inv.get("amount"),
                        "quantity": inv.get("quantity")
                    })
            except Exception as e:
                it_data["investments_error"] = str(e)

            report["items"].append(it_data)

    except Exception as e:
        report["general_error"] = str(e)

    return report
