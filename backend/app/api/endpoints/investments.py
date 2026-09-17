from typing import List, Optional, Dict
from datetime import datetime, timedelta
from decimal import Decimal
import pandas as pd
import io
import re
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.core.database import get_db
from app.models.entities import Asset, AssetTickerHistory, InvestmentTransaction, User
from app.schemas.investment import (
    InvestmentTransactionCreate,
    InvestmentTransactionResponse,
    PortfolioPosition,
    AssetClassificationUpdate,
    TickerMigrationRequest,
    TickerMigrationResponse,
    InvestmentSummary,
    DividendPeriodResponse,
    DividendItem,
    DividendAssetBreakdown
)
from app.services.sinacor_parser import parse_sinacor_pdf, guess_asset_type
from app.services.categorizer import resolve_date_range
from app.api.deps import get_current_user

router = APIRouter(prefix="/investments", tags=["investments"])

ALLOWED_ASSET_CLASSES = [
    "Ações",
    "Fundos Imobiliários",
    "Internacional",
    "Renda Fixa",
    "Criptos"
]

def parse_br_decimal(val) -> Decimal:
    if val is None or pd.isna(val):
        return Decimal("0.00")
    if isinstance(val, (int, float)):
        return Decimal(str(val))
    s = str(val).strip()
    if not s or s.lower() == "nan":
        return Decimal("0.00")
    s = s.replace("R$", "").replace(" ", "").strip()
    if "." in s and "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return Decimal(s)
    except Exception:
        return Decimal("0.00")

def normalize_asset_class(raw_class: Optional[str]) -> str:
    if not raw_class:
        return "Ações"
    rc = raw_class.strip().lower()
    if rc in ["ação", "acoes", "ações", "acao", "stock", "stocks", "equity"]:
        return "Ações"
    elif rc in ["fii", "fiis", "fundo imobiliario", "fundos imobiliarios", "fundos imobiliários", "fiagro"]:
        return "Fundos Imobiliários"
    elif rc in ["bdr", "bdrs", "internacional", "global", "etf internacional", "exterior"]:
        return "Internacional"
    elif rc in ["renda fixa", "renda_fixa", "tesouro", "cdb", "lci", "lca", "etf renda fixa"]:
        return "Renda Fixa"
    elif rc in ["cripto", "criptos", "criptomoeda", "criptomoedas", "crypto", "btc"]:
        return "Criptos"
    elif rc in ["etf"]:
        return "Ações"
    for allowed in ALLOWED_ASSET_CLASSES:
        if allowed.lower() == rc:
            return allowed
    return "Ações"

def get_or_create_asset(ticker: str, name: Optional[str], asset_type: Optional[str], db: Session) -> Asset:
    clean_ticker = ticker.upper().strip()
    asset = db.query(Asset).filter(Asset.ticker_current == clean_ticker).first()
    normalized_type = normalize_asset_class(asset_type) if asset_type else guess_asset_type(clean_ticker)
    
    if not asset:
        asset = Asset(
            ticker_current=clean_ticker,
            name=name or clean_ticker,
            asset_type=normalized_type
        )
        db.add(asset)
        db.commit()
        db.refresh(asset)
    elif asset_type:
        asset.asset_type = normalized_type
        db.commit()
        db.refresh(asset)
    return asset

@router.patch("/assets/{asset_id}/classification")
def update_asset_classification(
    asset_id: int,
    payload: AssetClassificationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Ativo não encontrado.")
    
    norm = normalize_asset_class(payload.asset_type)
    asset.asset_type = norm
    db.commit()
    db.refresh(asset)
    return {
        "status": "success",
        "asset_id": asset.id,
        "ticker": asset.ticker_current,
        "asset_type": norm
    }

@router.get("/portfolio", response_model=List[PortfolioPosition])
def get_portfolio(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    txs = db.query(InvestmentTransaction, Asset.ticker_current, Asset.name, Asset.asset_type)\
        .join(Asset, InvestmentTransaction.asset_id == Asset.id)\
        .filter(InvestmentTransaction.user_id == current_user.id)\
        .order_by(InvestmentTransaction.trade_date.asc(), InvestmentTransaction.id.asc()).all()

    by_asset = {}
    for tx, ticker, asset_name, asset_type in txs:
        if not ticker:
            continue
        if tx.asset_id not in by_asset:
            by_asset[tx.asset_id] = {
                "ticker": ticker,
                "name": asset_name or ticker,
                "asset_type": normalize_asset_class(asset_type),
                "txs": []
            }
        by_asset[tx.asset_id]["txs"].append(tx)

    positions = []

    for asset_id, data in by_asset.items():
        ticker = data["ticker"]
        asset_name = data["name"]
        asset_type = data["asset_type"]
        asset_txs = data["txs"]

        trade_txs = [
            t for t in asset_txs 
            if (t.operation_type or "").lower().strip() in ["buy", "compra", "sell", "venda"]
            and "posição open finance" not in (t.notes or "").lower()
        ]
        snapshot_txs = [
            t for t in asset_txs
            if "posição open finance" in (t.notes or "").lower()
        ]

        total_qty = Decimal("0")
        total_cost = Decimal("0.00")
        avg_price = Decimal("0.00")
        total_divs = Decimal("0.00")

        # Proventos deste ativo
        if asset_type != "Renda Fixa":
            seen_div_events = set()
            for tx in asset_txs:
                op = (tx.operation_type or "").lower().strip()
                if op in ["dividend", "jcp", "rendimento"]:
                    if "posição open finance" in (tx.notes or "").lower():
                        continue
                    q = Decimal(str(tx.quantity or 0))
                    u = Decimal(str(tx.unit_price or 0))
                    amt = Decimal(str(tx.total_amount or 0))

                    if q > 1 and u >= Decimal("5.00") and amt >= (q * u - Decimal("0.05")):
                        amt = u

                    amt = abs(amt)
                    if amt > 0:
                        dt_str = tx.trade_date.strftime("%Y-%m-%d") if tx.trade_date else ""
                        key = (dt_str, round(float(amt), 2))
                        if key not in seen_div_events:
                            seen_div_events.add(key)
                            total_divs += amt

        # Se há compras/vendas manuais, sinacor ou de planilha:
        if trade_txs:
            for tx in trade_txs:
                op = (tx.operation_type or "").lower().strip()
                qty = Decimal(str(tx.quantity or 0))
                unit_p = Decimal(str(tx.unit_price or 0))
                total_amt = Decimal(str(tx.total_amount or 0))
                costs = Decimal(str(tx.costs or 0))

                if op in ["buy", "compra"]:
                    if qty > 0:
                        if total_amt > 0 and abs(total_amt - (qty * unit_p)) <= (costs + Decimal("1.00")):
                            trade_cost = total_amt
                        elif unit_p > 0:
                            trade_cost = (qty * unit_p) + costs
                        elif total_amt > 0:
                            trade_cost = total_amt
                        else:
                            trade_cost = Decimal("0.00")

                        new_qty = total_qty + qty
                        new_cost = total_cost + trade_cost
                        total_qty = new_qty
                        total_cost = new_cost
                        avg_price = (new_cost / new_qty).quantize(Decimal("0.01")) if new_qty > 0 else Decimal("0.00")

                elif op in ["sell", "venda"]:
                    if total_qty > 0:
                        sell_qty = min(qty, total_qty)
                        total_qty = total_qty - sell_qty
                        if total_qty <= Decimal("0"):
                            total_qty = Decimal("0")
                            total_cost = Decimal("0.00")
                            avg_price = Decimal("0.00")
                        else:
                            total_cost = (total_qty * avg_price).quantize(Decimal("0.01"))

        elif snapshot_txs:
            snap = snapshot_txs[-1]
            s_qty = Decimal(str(snap.quantity or 0))
            s_amt = Decimal(str(snap.total_amount or 0))
            s_price = Decimal(str(snap.unit_price or 0))
            if s_qty > 0:
                total_qty = s_qty
                total_cost = s_amt if s_amt > 0 else (s_qty * s_price).quantize(Decimal("0.01"))
                avg_price = (total_cost / s_qty).quantize(Decimal("0.01")) if s_qty > 0 else s_price

        if total_qty > Decimal("0"):
            positions.append(PortfolioPosition(
                asset_id=asset_id,
                ticker=ticker,
                name=asset_name,
                asset_type=asset_type,
                quantity=total_qty,
                average_price=avg_price,
                total_invested=total_cost,
                total_dividends=total_divs
            ))

    return sorted(positions, key=lambda x: x.total_invested, reverse=True)

@router.get("/transactions", response_model=List[InvestmentTransactionResponse])
def list_investment_transactions(
    ticker: Optional[str] = None,
    operation_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(
        InvestmentTransaction,
        Asset.ticker_current.label("ticker"),
        Asset.name.label("asset_name"),
        Asset.asset_type.label("asset_type")
    ).join(Asset, InvestmentTransaction.asset_id == Asset.id)\
     .filter(InvestmentTransaction.user_id == current_user.id)

    if ticker:
        query = query.filter(Asset.ticker_current == ticker.upper().strip())
    if operation_type:
        query = query.filter(InvestmentTransaction.operation_type == operation_type.lower())

    results = query.order_by(InvestmentTransaction.trade_date.desc(), InvestmentTransaction.id.desc()).limit(300).all()

    response = []
    for tx, t_code, a_name, a_type in results:
        amt = Decimal(str(tx.total_amount or 0))
        q = Decimal(str(tx.quantity or 0))
        u = Decimal(str(tx.unit_price or 0))
        op = (tx.operation_type or "").lower()

        # Sanity check no retorno da listagem
        if op in ["dividend", "jcp", "rendimento"] and q > 1 and u >= Decimal("5.00") and amt >= (q * u - Decimal("0.05")):
            amt = u

        item = InvestmentTransactionResponse(
            id=tx.id,
            asset_id=tx.asset_id,
            ticker=t_code,
            asset_name=a_name,
            asset_type=normalize_asset_class(a_type),
            operation_type=tx.operation_type,
            quantity=q,
            unit_price=u,
            costs=tx.costs or Decimal("0.00"),
            total_amount=amt,
            trade_date=tx.trade_date,
            source=tx.source,
            notes=tx.notes
        )
        response.append(item)
    return response

@router.post("/transactions", response_model=InvestmentTransactionResponse, status_code=status.HTTP_201_CREATED)
def create_investment_transaction(
    tx_in: InvestmentTransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    asset = get_or_create_asset(tx_in.ticker, None, tx_in.asset_type, db)

    q = Decimal(str(tx_in.quantity or 0))
    u = Decimal(str(tx_in.unit_price or 0))
    c = Decimal(str(tx_in.costs or 0))
    t = Decimal(str(tx_in.total_amount or 0))
    op = (tx_in.operation_type or "buy").lower().strip()

    if op in ["dividend", "jcp", "rendimento"]:
        # Para proventos, total_amount é o montante financeiro líquido recebido
        final_total = t if t > 0 else (u if u > 0 else q)
        final_unit = (final_total / q).quantize(Decimal("0.0001")) if q > 0 else final_total
    elif op in ["buy", "compra"]:
        final_total = t if t > 0 else (q * u + c)
        final_unit = u if u > 0 else (final_total / q if q > 0 else Decimal("0.00"))
    else:
        final_total = t if t > 0 else (q * u - c)
        final_unit = u if u > 0 else (final_total / q if q > 0 else Decimal("0.00"))

    tx = InvestmentTransaction(
        user_id=current_user.id,
        asset_id=asset.id,
        operation_type=op,
        quantity=q,
        unit_price=final_unit,
        costs=c,
        total_amount=final_total,
        trade_date=tx_in.trade_date,
        source="manual",
        notes=tx_in.notes
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)

    return InvestmentTransactionResponse(
        id=tx.id,
        asset_id=asset.id,
        ticker=asset.ticker_current,
        asset_name=asset.name,
        asset_type=normalize_asset_class(asset.asset_type),
        operation_type=tx.operation_type,
        quantity=tx.quantity,
        unit_price=tx.unit_price,
        costs=tx.costs,
        total_amount=tx.total_amount,
        trade_date=tx.trade_date,
        source=tx.source,
        notes=tx.notes
    )

@router.post("/upload-sinacor")
async def upload_sinacor_note(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="O arquivo deve ser um PDF de nota de corretagem.")

    content = await file.read()
    try:
        parsed = parse_sinacor_pdf(content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao processar PDF: {str(e)}")

    ops = parsed.get("operations", [])
    trade_date = datetime.strptime(parsed.get("trade_date"), "%Y-%m-%d")
    note_num = parsed.get("note_number")

    inserted_count = 0
    for op in ops:
        asset = get_or_create_asset(op["ticker"], op.get("asset_name"), op.get("asset_type"), db)
        
        # Deduplicação: verifica se já existe exatamente essa operação desta nota
        note_tag = f"Nota B3 #{note_num}" if note_num else "Nota B3 Sinacor"
        existing = db.query(InvestmentTransaction).filter(
            InvestmentTransaction.user_id == current_user.id,
            InvestmentTransaction.asset_id == asset.id,
            InvestmentTransaction.trade_date == trade_date,
            InvestmentTransaction.operation_type == op["operation_type"],
            InvestmentTransaction.quantity == Decimal(str(op["quantity"])),
            InvestmentTransaction.total_amount == Decimal(str(op["total_amount"]))
        ).first()

        if existing:
            continue

        tx = InvestmentTransaction(
            user_id=current_user.id,
            asset_id=asset.id,
            operation_type=op["operation_type"],
            quantity=Decimal(str(op["quantity"])),
            unit_price=Decimal(str(op["unit_price"])),
            costs=Decimal(str(op["costs"])),
            total_amount=Decimal(str(op["total_amount"])),
            trade_date=trade_date,
            source="pdf_sinacor",
            notes=note_tag
        )
        db.add(tx)
        inserted_count += 1

    db.commit()
    return {
        "status": "success",
        "trade_date": parsed.get("trade_date"),
        "note_number": note_num,
        "operations_imported": inserted_count,
        "total_costs": parsed.get("total_costs"),
        "total_operations": parsed.get("total_operations")
    }

@router.post("/upload-spreadsheet")
async def upload_spreadsheet(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    filename = file.filename.lower()
    content = await file.read()

    try:
        if filename.endswith(".xlsx") or filename.endswith(".xls"):
            df = pd.read_excel(io.BytesIO(content))
        elif filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Formato não suportado. Envie .xlsx ou .csv")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao ler planilha: {str(e)}")

    df.columns = [str(c).lower().strip() for c in df.columns]

    col_date = next((c for c in df.columns if "data" in c or "date" in c), None)
    col_ticker = next((c for c in df.columns if "ticker" in c or "ativo" in c or "código" in c or "codigo" in c or "papel" in c), None)
    col_op = next((c for c in df.columns if "oper" in c or "tipo" in c or "moviment" in c), None)
    col_qty = next((c for c in df.columns if "quant" in c or "qtd" in c or c == "q" or "cotas" in c), None)
    col_price = next((c for c in df.columns if "preço" in c or "preco" in c or "unit" in c or "pm" in c), None)
    col_total = next((c for c in df.columns if "total" in c or "líquido" in c or "liquido" in c or "montante" in c or "aplicado" in c or (c == "valor" and not col_price)), None)
    col_costs = next((c for c in df.columns if "taxa" in c or "custo" in c or "emol" in c or "corret" in c), None)
    col_class = next((c for c in df.columns if "classe" in c or "classif" in c or "categoria" in c), None)

    if not col_ticker or not col_qty:
        raise HTTPException(status_code=400, detail="A planilha precisa conter ao menos as colunas de Ticker (Ativo) e Quantidade.")

    imported = 0
    for _, row in df.iterrows():
        ticker_val = str(row[col_ticker]).strip().upper()
        if not ticker_val or ticker_val == "NAN":
            continue

        raw_qty = parse_br_decimal(row[col_qty])
        raw_price = parse_br_decimal(row[col_price]) if col_price else Decimal("0.00")
        raw_costs = parse_br_decimal(row[col_costs]) if col_costs else Decimal("0.00")

        op_type = "buy"
        if col_op and pd.notna(row[col_op]):
            op_str = str(row[col_op]).lower()
            if "vend" in op_str or op_str == "v":
                op_type = "sell"
            elif "divid" in op_str:
                op_type = "dividend"
            elif "jcp" in op_str:
                op_type = "jcp"
            elif "rend" in op_str:
                op_type = "rendimento"

        if col_total and pd.notna(row[col_total]):
            raw_total = parse_br_decimal(row[col_total])
        elif op_type in ["dividend", "jcp", "rendimento"]:
            if raw_qty <= 1 or raw_price > Decimal("10.00"):
                raw_total = raw_price
            else:
                raw_total = (raw_qty * raw_price).quantize(Decimal("0.01"))
        else:
            if raw_price > 0 and raw_qty > 0:
                raw_total = (raw_qty * raw_price + raw_costs).quantize(Decimal("0.01"))
            else:
                raw_total = raw_price

        row_date = datetime.utcnow()
        if col_date and pd.notna(row[col_date]):
            try:
                row_date = pd.to_datetime(row[col_date], dayfirst=True).to_pydatetime()
            except Exception:
                row_date = datetime.utcnow()

        custom_class = str(row[col_class]).strip() if col_class and pd.notna(row[col_class]) else None
        asset = get_or_create_asset(ticker_val, None, custom_class, db)
        
        # Deduplicação estrita
        existing = db.query(InvestmentTransaction).filter(
            InvestmentTransaction.user_id == current_user.id,
            InvestmentTransaction.asset_id == asset.id,
            InvestmentTransaction.trade_date == row_date,
            InvestmentTransaction.operation_type == op_type,
            InvestmentTransaction.quantity == raw_qty,
            InvestmentTransaction.total_amount == raw_total
        ).first()

        if existing:
            continue

        tx = InvestmentTransaction(
            user_id=current_user.id,
            asset_id=asset.id,
            operation_type=op_type,
            quantity=raw_qty,
            unit_price=raw_price,
            costs=raw_costs,
            total_amount=raw_total,
            trade_date=row_date,
            source="spreadsheet"
        )
        db.add(tx)
        imported += 1

    db.commit()
    return {"status": "success", "imported_rows": imported}

@router.post("/migrate-ticker", response_model=TickerMigrationResponse)
def migrate_ticker(
    req: TickerMigrationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    t_old = req.ticker_old.upper().strip()
    t_new = req.ticker_new.upper().strip()

    if t_old == t_new:
        raise HTTPException(status_code=400, detail="Os tickers antigo e novo devem ser diferentes.")

    asset_old = db.query(Asset).filter(Asset.ticker_current == t_old).first()
    if not asset_old:
        raise HTTPException(status_code=404, detail=f"Ativo com ticker {t_old} não encontrado.")

    asset_new = db.query(Asset).filter(Asset.ticker_current == t_new).first()

    tx_query = db.query(InvestmentTransaction).filter(
        InvestmentTransaction.asset_id == asset_old.id,
        InvestmentTransaction.user_id == current_user.id
    )
    tx_count = tx_query.count()

    if asset_new:
        tx_query.update({InvestmentTransaction.asset_id: asset_new.id})
        db.add(AssetTickerHistory(asset_id=asset_new.id, ticker_old=t_old))
    else:
        db.add(AssetTickerHistory(asset_id=asset_old.id, ticker_old=t_old))
        asset_old.ticker_current = t_new

    db.commit()
    return TickerMigrationResponse(
        status="success",
        ticker_old=t_old,
        ticker_new=t_new,
        transactions_updated=tx_count
    )

@router.get("/summary", response_model=InvestmentSummary)
def get_investment_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    portfolio = get_portfolio(db, current_user)
    # Total da custódia ativo (apenas posições que o usuário ainda detém)
    total_invested = sum((p.total_invested for p in portfolio if p.quantity > 0), Decimal("0.00"))

    # Total de proventos de renda variável de todo o histórico
    all_txs = db.query(InvestmentTransaction, Asset)\
        .join(Asset, InvestmentTransaction.asset_id == Asset.id)\
        .filter(
            InvestmentTransaction.user_id == current_user.id,
            InvestmentTransaction.operation_type.in_(["dividend", "jcp", "rendimento"])
        ).all()

    hist_dividends = Decimal("0.00")
    seen_events = set()

    for tx, asset in all_txs:
        if normalize_asset_class(asset.asset_type) != 'Renda Fixa':
            if "posição open finance" in (tx.notes or "").lower():
                continue
            amt = Decimal(str(tx.total_amount or 0))
            q = Decimal(str(tx.quantity or 0))
            u = Decimal(str(tx.unit_price or 0))
            if q > 1 and u >= Decimal("5.00") and amt >= (q * u - Decimal("0.05")):
                amt = u
            amt = abs(amt)
            if amt > 0:
                dt_str = tx.trade_date.strftime("%Y-%m-%d") if tx.trade_date else ""
                key = (tx.asset_id, dt_str, round(float(amt), 2))
                if key not in seen_events:
                    seen_events.add(key)
                    hist_dividends += amt

    now = datetime.utcnow()
    month_start = datetime(now.year, now.month, 1)

    sells = db.query(InvestmentTransaction)\
        .filter(
            InvestmentTransaction.user_id == current_user.id,
            InvestmentTransaction.operation_type == "sell",
            InvestmentTransaction.trade_date >= month_start
        ).all()

    monthly_gain = Decimal("0.00")
    pm_map = {p.asset_id: p.average_price for p in portfolio}
    for s in sells:
        pm = pm_map.get(s.asset_id, Decimal("0.00"))
        cost_basis = Decimal(str(s.quantity)) * pm
        net_sell = Decimal(str(s.total_amount)) - Decimal(str(s.costs or 0))
        monthly_gain += (net_sell - cost_basis)

    return InvestmentSummary(
        total_equity_invested=total_invested,
        monthly_capital_gain=monthly_gain,
        total_dividends_received=hist_dividends,
        positions_count=len([p for p in portfolio if p.quantity > 0])
    )

@router.post("/recalculate")
def recalculate_investments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. Deduplicação no banco
    db.execute(text("""
        DELETE FROM investment_transactions a USING investment_transactions b
        WHERE a.id > b.id
          AND a.user_id = b.user_id
          AND a.asset_id = b.asset_id
          AND a.operation_type = b.operation_type
          AND a.total_amount = b.total_amount
          AND a.trade_date = b.trade_date
          AND a.user_id = :uid;
    """), {"uid": current_user.id})

    # 2. Cura proventos multiplicados
    db.execute(text("""
        UPDATE investment_transactions
        SET total_amount = unit_price,
            unit_price = ROUND(unit_price / NULLIF(quantity, 0), 4)
        WHERE operation_type IN ('dividend', 'jcp', 'rendimento')
          AND quantity > 1
          AND unit_price >= 5.00
          AND total_amount >= (quantity * unit_price - 0.05)
          AND user_id = :uid;
    """), {"uid": current_user.id})

    # 3. Remove snapshots indevidos de dividendos
    db.execute(text("""
        DELETE FROM investment_transactions
        WHERE operation_type IN ('dividend', 'jcp', 'rendimento')
          AND notes ILIKE '%Posição Open Finance%'
          AND user_id = :uid;
    """), {"uid": current_user.id})

    db.commit()
    return get_investment_summary(db, current_user)

@router.post("/reset-data")
def reset_investment_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    deleted_count = db.query(InvestmentTransaction).filter(
        InvestmentTransaction.user_id == current_user.id
    ).delete(synchronize_session=False)
    db.commit()
    return {
        "status": "success",
        "message": f"{deleted_count} transações de investimentos foram removidas. Sua carteira foi reiniciada do zero.",
        "deleted_count": deleted_count
    }

PERIOD_LABELS = {
    "current_month": "Mês atual",
    "30d": "30 dias",
    "previous_month": "Mês anterior",
    "60d": "60 dias",
    "90d": "90 dias",
    "current_year": "Esse ano",
    "12m": "Últimos 12 meses",
    "all": "Todo o Histórico"
}

@router.get("/dividends", response_model=DividendPeriodResponse)
def get_dividends_by_period(
    period: Optional[str] = Query("current_month"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    p_code = (period or "current_month").lower().strip()
    p_start, p_end = resolve_date_range(p_code)
    p_label = PERIOD_LABELS.get(p_code, "Período Selecionado")

    inv_query = db.query(InvestmentTransaction, Asset)\
        .join(Asset, InvestmentTransaction.asset_id == Asset.id)\
        .filter(
            InvestmentTransaction.user_id == current_user.id,
            InvestmentTransaction.operation_type.in_(["dividend", "jcp", "rendimento"])
        )

    if p_start:
        inv_query = inv_query.filter(InvestmentTransaction.trade_date >= p_start)
    if p_end:
        inv_query = inv_query.filter(InvestmentTransaction.trade_date <= p_end)

    inv_dividends = inv_query.order_by(InvestmentTransaction.trade_date.desc(), InvestmentTransaction.id.desc()).all()

    items: List[DividendItem] = []
    seen_events = set()

    for tx, asset in inv_dividends:
        norm_type = normalize_asset_class(asset.asset_type)
        if norm_type == "Renda Fixa":
            continue

        if "posição open finance" in (tx.notes or "").lower():
            continue

        qty = Decimal(str(tx.quantity or 0))
        unit_p = Decimal(str(tx.unit_price or 0))
        amt = Decimal(str(tx.total_amount or 0))

        if qty > 1 and unit_p >= Decimal("5.00") and amt >= (qty * unit_p - Decimal("0.05")):
            amt = unit_p
            unit_p = (amt / qty).quantize(Decimal("0.0001"))

        amt = abs(amt)
        if amt <= Decimal("0.00"):
            continue

        dt_str = tx.trade_date.strftime("%Y-%m-%d") if tx.trade_date else "no-date"
        event_key = (tx.asset_id, dt_str, round(float(amt), 2))
        if event_key in seen_events:
            continue
        seen_events.add(event_key)

        op_display = "Dividendo"
        if (tx.operation_type or "").lower() == "jcp":
            op_display = "JCP"
        elif (tx.operation_type or "").lower() == "rendimento":
            op_display = "Rendimento FII"

        src_display = "Nota Sinacor B3" if tx.source == "pdf_sinacor" else ("Planilha" if tx.source == "spreadsheet" else "Manual")

        items.append(DividendItem(
            id=tx.id,
            trade_date=tx.trade_date,
            ticker=asset.ticker_current,
            asset_name=asset.name or asset.ticker_current,
            asset_type=norm_type,
            operation_type=op_display,
            total_amount=amt,
            quantity=qty,
            unit_price=unit_p,
            source=src_display,
            notes=tx.notes
        ))

    items.sort(key=lambda x: x.trade_date, reverse=True)

    total_amount = sum((it.total_amount for it in items), Decimal("0.00"))

    by_asset_dict = {}
    for it in items:
        tk = it.ticker
        if tk not in by_asset_dict:
            by_asset_dict[tk] = {
                "ticker": tk,
                "asset_name": it.asset_name,
                "asset_type": it.asset_type,
                "total_amount": Decimal("0.00"),
                "events_count": 0
            }
        by_asset_dict[tk]["total_amount"] += it.total_amount
        by_asset_dict[tk]["events_count"] += 1

    by_asset = []
    for tk, d in by_asset_dict.items():
        pct = float(d["total_amount"] / total_amount * 100) if total_amount > 0 else 0.0
        by_asset.append(DividendAssetBreakdown(
            ticker=tk,
            asset_name=d["asset_name"],
            asset_type=d["asset_type"],
            total_amount=d["total_amount"],
            percentage=round(pct, 1),
            events_count=d["events_count"]
        ))
    by_asset.sort(key=lambda x: x.total_amount, reverse=True)

    by_class_dict = {c: Decimal("0.00") for c in ALLOWED_ASSET_CLASSES if c != 'Renda Fixa'}
    for it in items:
        c = it.asset_type if it.asset_type in by_class_dict else "Ações"
        by_class_dict[c] += it.total_amount

    return DividendPeriodResponse(
        period=p_code,
        period_label=p_label,
        start_date=p_start,
        end_date=p_end,
        total_amount=total_amount,
        events_count=len(items),
        by_asset=by_asset,
        by_asset_class=by_class_dict,
        items=items
    )
