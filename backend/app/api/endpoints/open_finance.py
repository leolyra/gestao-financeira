from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any
import asyncio
import re
from app.core.config import settings
from app.core.database import get_db
from app.models.entities import Account, Transaction, User, Asset, InvestmentTransaction
from app.services.pluggy_service import pluggy_service
from app.services.categorizer import auto_categorize, detect_cost_type
from app.api.deps import get_current_user
from app.api.endpoints.investments import get_or_create_asset, classify_asset_smart

router = APIRouter(prefix="/open-finance", tags=["open-finance"])

# Regex para captura de Tickers padrão B3 (4 letras seguidas de 3, 4, 5, 6, 11 ou 34)
TICKER_REGEX = re.compile(r'\b([A-Z]{4}(?:3|4|5|6|11|34))\b')

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
    desc_upper = desc.upper()
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
    is_acc = True

    # 1. Identificação de Proventos creditados na conta bancária (Open Finance)
    # Quando um dividendo/rendimento é pago na conta corrente, registramos tanto no fluxo de caixa quanto no módulo de Investimentos
    is_provento_kw = any(k in desc_upper for k in [
        "DIVIDEND", "DIVIDENDO", "JCP", "JUROS S/ CAPITAL", "JUROS SOBRE CAPITAL",
        "RENDIMENTO", "RENDIMENTOS", "PROVENTO", "PROVENTOS", "PAGTO DIVIDENDOS"
    ])

    if not is_credit_card and amount > 0 and is_provento_kw:
        tk_match = TICKER_REGEX.search(desc_upper)
        if tk_match:
            found_ticker = tk_match.group(1)
            op_t = "rendimento" if "REND" in desc_upper else ("jcp" if "JCP" in desc_upper or "JUROS" in desc_upper else "dividend")
            cls_t = "Fundos Imobiliários" if found_ticker.endswith("11") else "Ações"
            asset = get_or_create_asset(found_ticker, None, cls_t, db)

            already_itx = db.query(InvestmentTransaction).filter(
                InvestmentTransaction.user_id == user_id,
                InvestmentTransaction.notes.ilike(f"%PluggyBankTx:{tx_id}%")
            ).first()

            if not already_itx:
                inv_tx = InvestmentTransaction(
                    user_id=user_id,
                    asset_id=asset.id,
                    operation_type=op_t,
                    quantity=Decimal("1"),
                    unit_price=abs(amount),
                    costs=Decimal("0.00"),
                    total_amount=abs(amount),
                    trade_date=tx_date,
                    source="open_finance",
                    notes=f"PluggyBankTx:{tx_id} - {desc}"
                )
                db.add(inv_tx)

    # 2. Identificação de Compras/Débitos de investimentos na conta bancária
    # Débitos de bolsa/corretora não devem ser tratados como despesa de consumo para não inflar despesas pessoais
    is_invest_debit = any(k in desc_upper for k in [
        "INTER DTVM", "DEBITO B3", "COMPRA A VISTA B3", "B3 - NEGOCIACAO",
        "LIQUIDACAO B3", "APLICACAO ACOES", "CORRETORA"
    ])
    if not is_credit_card and amount < 0 and is_invest_debit:
        is_acc = False # Não contabiliza no painel de despesas do dia a dia
        tk_match = TICKER_REGEX.search(desc_upper)
        if tk_match:
            found_ticker = tk_match.group(1)
            cls_t = "Fundos Imobiliários" if found_ticker.endswith("11") else "Ações"
            asset = get_or_create_asset(found_ticker, None, cls_t, db)

            already_buy = db.query(InvestmentTransaction).filter(
                InvestmentTransaction.user_id == user_id,
                InvestmentTransaction.notes.ilike(f"%PluggyBankTx:{tx_id}%")
            ).first()

            if not already_buy:
                buy_tx = InvestmentTransaction(
                    user_id=user_id,
                    asset_id=asset.id,
                    operation_type="buy",
                    quantity=Decimal("1"),
                    unit_price=abs(amount),
                    costs=Decimal("0.00"),
                    total_amount=abs(amount),
                    trade_date=tx_date,
                    source="open_finance",
                    notes=f"PluggyBankTx:{tx_id} - {desc}"
                )
                db.add(buy_tx)

    new_tx = Transaction(
        account_id=account_id,
        category_id=cat_id,
        description=desc,
        amount=amount,
        date=tx_date,
        is_manual=False,
        pluggy_transaction_id=tx_id,
        cost_type=c_type,
        spending_nature="recorrente",
        is_accounted=is_acc
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

    # 3. Investimentos do Item: Custódia, Compras, Vendas e Proventos (Dividendos, JCP, Rendimentos)
    synced_invs = 0
    try:
        investments = await pluggy_service.get_investments(item_id)
        for inv in investments:
            raw_code = (inv.get("code") or inv.get("isin") or inv.get("name") or "INVEST").upper().strip()
            name = inv.get("name") or raw_code
            
            # Extrai ticker oficial (ex: PETR4, BBAS3, BTLG11) se estiver contido no código ou nome
            tk_match = TICKER_REGEX.search(f"{raw_code} {name}".upper())
            code = tk_match.group(1) if tk_match else raw_code[:20]

            inv_type = (inv.get("type") or "").upper()
            inv_subtype = (inv.get("subtype") or "").upper()

            if inv_subtype == "REAL_ESTATE_FUND" or "FII" in code or code.endswith("11"):
                asset_type = "Fundos Imobiliários"
            elif inv_subtype in ["STOCK", "BDR"] or inv_type == "EQUITY":
                asset_type = "Ações" if inv_subtype == "STOCK" else "Internacional"
            elif inv_type == "ETF" or inv_subtype == "ETF":
                asset_type = "Internacional" if "IVVB" in code or "AUPO" in code else "Ações"
            elif inv_type in ["FIXED_INCOME", "SECURITY"] or inv_subtype in ["CDB", "LCI", "LCA", "TREASURY"]:
                asset_type = "Renda Fixa"
            elif inv_type == "MUTUAL_FUND":
                asset_type = "Fundos Imobiliários" if "FII" in code else "Outros"
            else:
                asset_type = classify_asset_smart(code)

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

            # Transações históricas do investimento: Compras, Vendas, Dividendos, JCP, Rendimentos
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
                        itx_type = str(itx.get("type") or "").upper()
                        desc_text = str(itx.get("description") or "").upper()

                        # Classificação rigorosa de proventos e operações de bolsa
                        if itx_type in ["DIVIDEND", "DIVIDENDO"] or "DIVID" in desc_text:
                            op_type = "dividend"
                        elif itx_type in ["INTEREST", "JCP"] or "JCP" in desc_text or "JUROS" in desc_text:
                            op_type = "jcp"
                        elif itx_type in ["YIELD", "RENDIMENTO", "EARNINGS"] or "REND" in desc_text:
                            op_type = "rendimento"
                        elif itx_type in ["AMORTIZATION", "AMORTIZACAO"] or "AMORT" in desc_text:
                            op_type = "amortization"
                        elif itx_type in ["SELL", "VENDA"] or "VEND" in desc_text or "RESGATE" in desc_text:
                            op_type = "sell"
                        else:
                            op_type = "buy"

                        itx_qty = Decimal(str(itx.get("quantity") or 0))
                        itx_val = Decimal(str(itx.get("value") or 0))
                        itx_amt = Decimal(str(itx.get("amount") or 0))
                        if itx_amt == 0 and itx_qty > 0 and itx_val > 0:
                            itx_amt = (itx_qty * itx_val)
                        elif itx_amt > 0 and itx_qty > 0 and itx_val == 0:
                            itx_val = (itx_amt / itx_qty).quantize(Decimal("0.0001"))
                        elif itx_amt == 0 and itx_val > 0:
                            itx_amt = itx_val

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
                            total_amount=abs(itx_amt),
                            trade_date=itx_d,
                            source="open_finance",
                            notes=f"PluggyTx:{itx_id} - {itx.get('description', '')}"
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

    # 1. Busca todos os items diretamente da Pluggy para garantir que todas as instituições
    # (inclusive corretoras de investimentos e bancos) sejam mapeadas
    item_ids = set()
    try:
        all_pluggy_items = await pluggy_service.get_all_items()
        for item in all_pluggy_items:
            iid = item.get("id")
            if iid:
                item_ids.add(str(iid).strip())
    except Exception as e:
        print(f"[SYNC_ALL] Aviso ao buscar /items na Pluggy: {e}")

    # 2. Complementa com item_ids das contas já registradas localmente
    existing_accounts = db.query(Account).filter(
        Account.user_id == current_user.id,
        Account.pluggy_account_id.isnot(None)
    ).all()

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

    # 3. Garante sincronizacao direta para qualquer conta que ja esteja no banco
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

@router.post("/sync-investments")
async def sync_investments_only(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Sincroniza especificamente investimentos, compras, vendas e proventos
    de todas as instituições conectadas via Open Finance (Pluggy).
    """
    item_ids = set()
    try:
        all_pluggy_items = await pluggy_service.get_all_items()
        for item in all_pluggy_items:
            iid = item.get("id")
            if iid:
                item_ids.add(str(iid).strip())
    except Exception as e:
        print(f"[SYNC_INVESTMENTS] Aviso ao buscar /items: {e}")

    existing_accounts = db.query(Account).filter(
        Account.user_id == current_user.id,
        Account.pluggy_item_id.isnot(None)
    ).all()
    for acc in existing_accounts:
        item_ids.add(acc.pluggy_item_id)

    total_invs = 0
    items_done = 0
    for item_id in item_ids:
        try:
            _, _, invs, _ = await _process_item(item_id, current_user.id, db)
            total_invs += invs
            items_done += 1
        except Exception as e:
            print(f"[SYNC_INVESTMENTS] Erro no item {item_id}: {e}")

    db.commit()
    return {
        "status": "success",
        "items_processed": items_done,
        "investments_and_proventos_synced": total_invs,
        "message": f"Sincronização de Investimentos concluída: {total_invs} posições, operações e proventos processados via Open Finance."
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
            "accounts_in_db": db.query(Account).filter(Account.user_id == current_user.id).count(),
            "transactions_in_db": db.query(Transaction).join(Account).filter(Account.user_id == current_user.id).count(),
            "investments_in_db": db.query(InvestmentTransaction).filter(InvestmentTransaction.user_id == current_user.id).count()
        }
    }

    try:
        items = await pluggy_service.get_all_items()
        report["total_items_found"] = len(items)

        for it in items:
            it_id = it.get("id")
            it_connector = it.get("connector", {}).get("name", "Instituição")
            it_status = it.get("status")
            it_exec_status = it.get("executionStatus")
            
            res_data = await pluggy_service.get_item_resources(it_id) if it_id else {}
            item_accounts = await pluggy_service.get_accounts(it_id) if it_id else []
            item_investments = await pluggy_service.get_investments(it_id) if it_id else []

            report["items"].append({
                "item_id": it_id,
                "connector_name": it_connector,
                "status": it_status,
                "execution_status": it_exec_status,
                "declared_resources": res_data,
                "accounts_count": len(item_accounts),
                "investments_count": len(item_investments),
                "accounts": [
                    {
                        "id": a.get("id"),
                        "name": a.get("name"),
                        "type": a.get("type"),
                        "subtype": a.get("subtype")
                    } for a in item_accounts
                ],
                "investments": [
                    {
                        "id": i.get("id"),
                        "name": i.get("name"),
                        "code": i.get("code"),
                        "type": i.get("type"),
                        "subtype": i.get("subtype"),
                        "amount": i.get("amount")
                    } for i in item_investments
                ]
            })
    except Exception as e:
        report["error"] = str(e)

    return report
