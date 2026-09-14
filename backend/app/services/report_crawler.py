import httpx
import re
import io
import pdfplumber
from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.entities import Asset, AssetReport, InvestmentTransaction
from app.services.ollama_service import ollama_service

# Endpoint público CVM/B3 (Fundos.NET) para busca de documentos de FIIs
B3_FNET_URL = "https://fnet.bmfbovespa.com.br/fnet/publico/pesquisarGerenciadorDocumentosDados"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
}

async def fetch_and_analyze_reports_for_user(user_id: int, db: Session, target_ticker: Optional[str] = None) -> List[Dict[str, Any]]:
    # 1. Identifica os tickers que o usuário possui em carteira
    query = db.query(Asset.ticker_current, Asset.id, Asset.name, Asset.asset_type)\
        .join(InvestmentTransaction, InvestmentTransaction.asset_id == Asset.id)\
        .filter(InvestmentTransaction.user_id == user_id)
    
    if target_ticker:
        query = query.filter(Asset.ticker_current == target_ticker.upper().strip())
    
    assets_in_portfolio = query.distinct().all()
    if not assets_in_portfolio:
        return []

    newly_analyzed = []

    async with httpx.AsyncClient(headers=HEADERS, timeout=30.0, follow_redirects=True) as client:
        for ticker, asset_id, asset_name, asset_type in assets_in_portfolio:
            try:
                # Busca documentos recentes para o ticker na B3 / CVM Fundos.NET
                params = {
                    "d": "1",
                    "s": "0",
                    "l": "10",
                    "tipoFundo": "1",
                    "strSigla": ticker
                }
                res = await client.get(B3_FNET_URL, params=params)
                if res.status_code != 200:
                    continue

                data = res.json()
                docs = data.get("data", [])

                for doc in docs:
                    # Filtra por documentos de interesse: Relatório Gerencial ou Fato Relevante
                    doc_desc = doc.get("descricaoCategoria", "") or doc.get("tipoDocumento", "") or ""
                    doc_name = doc.get("nomeDocumento", "") or doc_desc or f"Relatório {ticker}"
                    doc_id = doc.get("id")
                    
                    if not doc_id:
                        continue

                    # Aceita Relatório Gerencial, Fato Relevante ou Comunicado ao Mercado
                    if not any(k in doc_desc.lower() for k in ["gerencial", "fato relevante", "comunicado", "desempenho"]):
                        continue

                    doc_title = f"{doc_desc} - {doc_name}".strip(" - ")

                    # Verifica se já foi analisado anteriormente
                    existing = db.query(AssetReport).filter(
                        AssetReport.asset_id == asset_id,
                        AssetReport.user_id == user_id,
                        AssetReport.title.ilike(f"%{doc_title[:30]}%")
                    ).first()

                    if existing:
                        continue

                    # Baixa o PDF do documento oficial da CVM/B3
                    doc_url = f"https://fnet.bmfbovespa.com.br/fnet/publico/downloadDocumento?id={doc_id}"
                    pdf_res = await client.get(doc_url)
                    if pdf_res.status_code != 200:
                        continue

                    # Extrai texto do PDF
                    extracted_text = ""
                    try:
                        with pdfplumber.open(io.BytesIO(pdf_res.content)) as pdf:
                            for page in pdf.pages[:12]: # Primeiras 12 páginas para foco
                                txt = page.extract_text()
                                if txt:
                                    extracted_text += "\n" + txt
                    except Exception:
                        continue

                    if len(extracted_text.strip()) < 100:
                        continue

                    # Sumariza usando o Ollama local na VPS
                    summary = await ollama_service.summarize_report(extracted_text, ticker)

                    # Salva no banco
                    new_report = AssetReport(
                        user_id=user_id,
                        asset_id=asset_id,
                        title=doc_title,
                        report_type="gerencial" if "gerencial" in doc_desc.lower() else "fato_relevante",
                        published_at=datetime.utcnow(),
                        ai_summary=summary
                    )
                    db.add(new_report)
                    db.commit()
                    db.refresh(new_report)

                    newly_analyzed.append({
                        "id": new_report.id,
                        "ticker": ticker,
                        "title": doc_title,
                        "summary": summary,
                        "url": doc_url,
                        "created_at": new_report.created_at.isoformat()
                    })

            except Exception as e:
                print(f"[CRAWLER] Erro ao buscar relatorios de {ticker}: {e}")
                continue

    return newly_analyzed
