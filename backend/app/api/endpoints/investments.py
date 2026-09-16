from typing import List, Optional, Dict
from datetime import datetime
from decimal import Decimal
import pandas as pd
import io
import re
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.models.entities import Asset, AssetTickerHistory, InvestmentTransaction, User, Transaction, Account, Category
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

    positions = {}

    for tx, ticker, asset_name, asset_type in txs:
        if tx.asset_id not in positions:
            positions[tx.asset_id] = {
                "asset_id": tx.asset_id,
                "ticker": ticker,
                "name": asset_name,
                "asset_type": normalize_asset_class(asset_type),
                "quantity": Decimal("0"),
                "total_invested": Decimal("0.00"),
                "average_price": Decimal("0.00"),
                "total_dividends": Decimal("0.00")
            }

        pos = positions[tx.asset_id]
        op = tx.operation_type.lower()
        qty = Decimal(str(tx.quantity or 0))
        total_amt = Decimal(str(tx.total_amount or 0))
        costs = Decimal(str(tx.costs or 0))

        if op in ["buy", "compra"]:
            new_qty = pos["quantity"] + qty
            new_invested = pos["total_invested"] + total_amt + costs
            pos["quantity"] = new_qty
            pos["total_invested"] = new_invested
            pos["average_price"] = (new_invested / new_qty).quantize(Decimal("0.01")) if new_qty > 0 else Decimal("0.00")

        elif op in ["sell", "venda"]:
            if pos["quantity"] > 0:
                sell_proportion = min(qty / pos["quantity"], Decimal("1.0"))
                pos["total_invested"] -= (pos["total_invested"] * sell_proportion).quantize(Decimal("0.01"))
                pos["quantity"] = max(Decimal("0"), pos["quantity"] - qty)
                if pos["quantity"] == 0:
                    pos["total_invested"] = Decimal("0.00")
                    pos["average_price"] = Decimal("0.00")

        elif op in ["dividend", "jcp", "rendimento"]:
            if normalize_asset_class(asset_type) != "Renda Fixa":
                pos["total_dividends"] += total_amt

    res = [PortfolioPosition(**p) for p in positions.values() if p["quantity"] > 0 or p["total_dividends"] > 0]
    return sorted(res, key=lambda x: x.total_invested, reverse=True)

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

    results = query.order_by(InvestmentTransaction.trade_date.desc()).limit(200).all()

    response = []
    for tx, t_code, a_name, a_type in results:
        item = InvestmentTransactionResponse(
            id=tx.id,
            asset_id=tx.asset_id,
            ticker=t_code,
            asset_name=a_name,
            asset_type=normalize_asset_class(a_type),
            operation_type=tx.operation_type,
            quantity=tx.quantity,
            unit_price=tx.unit_price,
            costs=tx.costs,
            total_amount=tx.total_amount,
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

    tx = InvestmentTransaction(
        user_id=current_user.id,
        asset_id=asset.id,
        operation_type=tx_in.operation_type.lower(),
        quantity=tx_in.quantity,
        unit_price=tx_in.unit_price,
        costs=tx_in.costs,
        total_amount=tx_in.total_amount,
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
            notes=f"Nota B3 #{note_num}" if note_num else "Nota B3 Sinacor"
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

    df.columns = [c.lower().strip() for c in df.columns]

    col_date = next((c for c in df.columns if "data" in c), None)
    col_ticker = next((c for c in df.columns if "ticker" in c or "ativo" in c or "código" in c or "codigo" in c), None)
    col_op = next((c for c in df.columns if "oper" in c or "tipo" in c), None)
    col_qty = next((c for c in df.columns if "quant" in c or "qtd" in c), None)
    col_price = next((c for c in df.columns if "preço" in c or "preco" in c or "unit" in c), None)
    col_total = next((c for c in df.columns if "total" in c or "valor" in c), None)
    col_costs = next((c for c in df.columns if "taxa" in c or "custo" in c), None)
    col_class = next((c for c in df.columns if "classe" in c or "classif" in c or "categoria" in c), None)

    if not col_ticker or not col_qty:
        raise HTTPException(status_code=400, detail="A planilha precisa conter ao menos as colunas Ticker e Quantidade.")

    imported = 0
    for _, row in df.iterrows():
        ticker_val = str(row[col_ticker]).strip().upper()
        if not ticker_val or ticker_val == "NAN":
            continue

        raw_qty = Decimal(str(row[col_qty]).replace(",", "."))
        raw_price = Decimal(str(row[col_price]).replace(",", ".")) if col_price and pd.notna(row[col_price]) else Decimal("0.00")
        raw_total = Decimal(str(row[col_total]).replace(",", ".")) if col_total and pd.notna(row[col_total]) else (raw_qty * raw_price)
        raw_costs = Decimal(str(row[col_costs]).replace(",", ".")) if col_costs and pd.notna(row[col_costs]) else Decimal("0.00")

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

        row_date = datetime.utcnow()
        if col_date and pd.notna(row[col_date]):
            try:
                row_date = pd.to_datetime(row[col_date]).to_pydatetime()
            except Exception:
                row_date = datetime.utcnow()

        custom_class = str(row[col_class]).strip() if col_class and pd.notna(row[col_class]) else None
        asset = get_or_create_asset(ticker_val, None, custom_class, db)
        
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
    total_invested = sum(p.total_invested for p in portfolio)
    total_dividends = sum(p.total_dividends for p in portfolio if normalize_asset_class(p.asset_type) != 'Renda Fixa')

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
        total_dividends_received=total_dividends,
        positions_count=len([p for p in portfolio if p.quantity > 0])
    )

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

    # 1. Proventos do módulo de investimentos (InvestmentTransaction)
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

    inv_dividends = inv_query.order_by(InvestmentTransaction.trade_date.desc()).all()

    # 2. Proventos de extratos bancários (Transaction com categoria Proventos / Dividendos)
    bank_query = db.query(Transaction)\
        .join(Account, Transaction.account_id == Account.id)\
        .outerjoin(Category, Transaction.category_id == Category.id)\
        .filter(
            Account.user_id == current_user.id,
            (Category.name.ilike("%dividendo%") | Category.name.ilike("%provento%") | Transaction.description.ilike("%dividendo%") | Transaction.description.ilike("%jcp%") | Transaction.description.ilike("%rendimento b3%")),
            Transaction.amount > 0,
            Transaction.is_accounted.is_(True)
        )

    if p_start:
        bank_query = bank_query.filter(Transaction.date >= p_start)
    if p_end:
        bank_query = bank_query.filter(Transaction.date <= p_end)

    bank_txs = bank_query.order_by(Transaction.date.desc()).all()

    items: List[DividendItem] = []
    seen_signatures = set()

    for tx, asset in inv_dividends:
        norm_type = normalize_asset_class(asset.asset_type)
        if norm_type == "Renda Fixa":
            continue
        amt = Decimal(str(tx.total_amount or 0))
        dt_key = tx.trade_date.strftime("%Y-%m-%d") if tx.trade_date else "no-date"
        seen_signatures.add((dt_key, round(float(amt), 2)))

        op_display = "Dividendo"
        if tx.operation_type.lower() == "jcp":
            op_display = "JCP"
        elif tx.operation_type.lower() == "rendimento":
            op_display = "Rendimento FII"

        src_display = "Nota Sinacor B3" if tx.source == "pdf_sinacor" else ("Planilha" if tx.source == "spreadsheet" else "Manual (Carteira)")

        items.append(DividendItem(
            id=tx.id,
            trade_date=tx.trade_date,
            ticker=asset.ticker_current,
            asset_name=asset.name or asset.ticker_current,
            asset_type=norm_type,
            operation_type=op_display,
            total_amount=amt,
            quantity=Decimal(str(tx.quantity or 0)),
            unit_price=Decimal(str(tx.unit_price or 0)),
            source=src_display,
            notes=tx.notes
        ))

    for btx in bank_txs:
        b_amt = Decimal(str(btx.amount or 0))
        b_dt = btx.date.strftime("%Y-%m-%d") if btx.date else "no-date"
        sig = (b_dt, round(float(b_amt), 2))
        if sig in seen_signatures:
            continue

        m = re.search(r"\b([A-Z]{4}[0-9]{1,2}[A-Z]?)\b", btx.description.upper())
        t_found = m.group(1) if m else "PROVENTO"
        a_class = normalize_asset_class(guess_asset_type(t_found) if m else "Ações")
        if a_class == "Renda Fixa":
            continue

        items.append(DividendItem(
            id=-btx.id,
            trade_date=btx.date,
            ticker=t_found,
            asset_name=btx.description,
            asset_type=normalize_asset_class(a_class),
            operation_type="Provento Bancário",
            total_amount=b_amt,
            quantity=Decimal("0"),
            unit_price=Decimal("0"),
            source="Extrato Bancário",
            notes="Conta Corrente"
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
