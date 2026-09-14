from typing import List, Optional
from datetime import datetime
from decimal import Decimal
import io
import pdfplumber
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.entities import Asset, AssetAlert, AssetReport, User
from app.schemas.monitoring import (
    AssetAlertCreate,
    AssetAlertResponse,
    SwapRequest,
    ReportSummaryResponse
)
from app.services.ollama_service import ollama_service
from app.services.swap_analyzer import analyze_asset_swap
from app.services.report_crawler import fetch_and_analyze_reports_for_user
from app.api.deps import get_current_user

router = APIRouter(prefix="/monitoring", tags=["monitoring"])

def get_or_create_asset(ticker: str, db: Session) -> Asset:
    t = ticker.upper().strip()
    asset = db.query(Asset).filter(Asset.ticker_current == t).first()
    if not asset:
        asset = Asset(ticker_current=t, name=t, asset_type="Ação" if not t.endswith("11") else "FII")
        db.add(asset)
        db.commit()
        db.refresh(asset)
    return asset

@router.get("/rules", response_model=List[AssetAlertResponse])
def list_alert_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    alerts = db.query(AssetAlert, Asset.ticker_current, Asset.name)\
        .join(Asset, AssetAlert.asset_id == Asset.id)\
        .filter(AssetAlert.user_id == current_user.id)\
        .order_by(AssetAlert.id.desc()).all()

    res = []
    for a, ticker, name in alerts:
        res.append(AssetAlertResponse(
            id=a.id,
            asset_id=a.asset_id,
            ticker=ticker,
            asset_name=name,
            rule_type=a.rule_type,
            target_value=a.target_value,
            current_value=a.current_value,
            is_triggered=a.is_triggered,
            is_active=a.is_active,
            notes=a.notes,
            created_at=a.created_at
        ))
    return res

@router.post("/rules", response_model=AssetAlertResponse, status_code=status.HTTP_201_CREATED)
def create_alert_rule(
    rule_in: AssetAlertCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    asset = get_or_create_asset(rule_in.ticker, db)
    alert = AssetAlert(
        user_id=current_user.id,
        asset_id=asset.id,
        rule_type=rule_in.rule_type,
        target_value=rule_in.target_value,
        current_value=rule_in.current_value,
        notes=rule_in.notes,
        is_active=True,
        is_triggered=False
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)

    return AssetAlertResponse(
        id=alert.id,
        asset_id=asset.id,
        ticker=asset.ticker_current,
        asset_name=asset.name,
        rule_type=alert.rule_type,
        target_value=alert.target_value,
        current_value=alert.current_value,
        is_triggered=alert.is_triggered,
        is_active=alert.is_active,
        notes=alert.notes,
        created_at=alert.created_at
    )

@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_alert_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    alert = db.query(AssetAlert).filter(AssetAlert.id == rule_id, AssetAlert.user_id == current_user.id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Regra não encontrada.")
    db.delete(alert)
    db.commit()
    return None

@router.post("/swap-analysis")
def get_swap_analysis(
    req: SwapRequest,
    current_user: User = Depends(get_current_user)
):
    if req.source_price <= 0 or req.target_price <= 0:
        raise HTTPException(status_code=400, detail="Os preços dos ativos devem ser maiores que zero.")
    if req.capital_amount <= 0:
        raise HTTPException(status_code=400, detail="O valor aplicado deve ser maior que zero.")

    analysis = analyze_asset_swap(
        source_ticker=req.source_ticker,
        source_price=req.source_price,
        source_yield_annual=req.source_yield_annual,
        target_ticker=req.target_ticker,
        target_price=req.target_price,
        target_yield_annual=req.target_yield_annual,
        capital_amount=req.capital_amount
    )
    return analysis

@router.post("/reports/summarize", response_model=ReportSummaryResponse)
async def summarize_report_pdf(
    ticker: str = Form(...),
    title: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Envie um arquivo PDF do relatório.")

    content = await file.read()
    extracted_text = ""
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages[:10]: # primeiras 10 páginas para foco nos dados relevantes
            txt = page.extract_text()
            if txt:
                extracted_text += "\n" + txt

    if not extracted_text.strip():
        raise HTTPException(status_code=400, detail="Não foi possível extrair texto do PDF.")

    summary = await ollama_service.summarize_report(extracted_text, ticker)

    asset = get_or_create_asset(ticker, db)
    report = AssetReport(
        user_id=current_user.id,
        asset_id=asset.id,
        title=title,
        report_type="gerencial",
        published_at=datetime.utcnow(),
        ai_summary=summary
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return ReportSummaryResponse(
        id=report.id,
        ticker=asset.ticker_current,
        title=report.title,
        report_type=report.report_type,
        published_at=report.published_at,
        ai_summary=report.ai_summary,
        created_at=report.created_at
    )

@router.get("/reports", response_model=List[ReportSummaryResponse])
def list_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    reports = db.query(AssetReport, Asset.ticker_current)\
        .join(Asset, AssetReport.asset_id == Asset.id)\
        .filter(AssetReport.user_id == current_user.id)\
        .order_by(AssetReport.id.desc()).all()

    res = []
    for r, ticker in reports:
        res.append(ReportSummaryResponse(
            id=r.id,
            ticker=ticker,
            title=r.title,
            report_type=r.report_type,
            published_at=r.published_at,
            ai_summary=r.ai_summary,
            created_at=r.created_at
        ))
    return res

@router.post("/auto-fetch-reports")
async def auto_fetch_and_analyze(
    ticker: Optional[str] = None,
    token: Optional[str] = None,
    db: Session = Depends(get_db)
):
    # Permite chamada direta pelo n8n com token ou usuário padrão #1
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=400, detail="Nenhum usuário cadastrado no sistema.")

    new_reports = await fetch_and_analyze_reports_for_user(user.id, db, ticker)
    return {
        "status": "success",
        "new_reports_count": len(new_reports),
        "reports": new_reports
    }
