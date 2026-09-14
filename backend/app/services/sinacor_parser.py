import io
import re
from datetime import datetime
from decimal import Decimal
from typing import List, Dict, Any
import pdfplumber

def parse_decimal(val_str: str) -> Decimal:
    if not val_str:
        return Decimal("0.00")
    clean = val_str.replace(".", "").replace(",", ".").replace("R$", "").strip()
    try:
        return Decimal(clean)
    except Exception:
        return Decimal("0.00")

COMMON_B3_MAPPING = {
    "PETROBRAS PN": "PETR4",
    "PETROBRAS ON": "PETR3",
    "VALE ON": "VALE3",
    "BANCO DO BRASIL ON": "BBAS3",
    "BRASIL ON": "BBAS3",
    "ITAUUNIBANCO PN": "ITUB4",
    "BRADESCO PN": "BBDC4",
    "BRADESCO ON": "BBDC3",
    "AMBEV S/A ON": "ABEV3",
    "B3 ON": "B3SA3",
    "WEG ON": "WEGE3",
}

def guess_ticker(spec_text: str) -> str:
    spec_clean = spec_text.upper().strip()
    match = re.search(r"\b([A-Z]{4}[0-9]{1,2}[A-Z]?)\b", spec_clean)
    if match:
        return match.group(1)
    for pattern, ticker in COMMON_B3_MAPPING.items():
        if pattern in spec_clean:
            return ticker
    words = spec_clean.split()
    if words:
        base = re.sub(r"[^A-Z]", "", words[0])[:4]
        if "PN" in spec_clean:
            return f"{base}4"
        return f"{base}3"
    return "ATIVO3"

def guess_asset_type(ticker: str) -> str:
    t = ticker.upper()
    if t.endswith("11"):
        if any(etf in t for etf in ["BOVA11", "IVVB11", "SMAL11", "B5P211", "IMAB11", "AREA11", "AUPO11"]):
            return "ETF"
        return "FII"
    elif t.endswith("34") or t.endswith("35") or t.endswith("39"):
        return "BDR"
    elif t.endswith("3") or t.endswith("4") or t.endswith("5") or t.endswith("6"):
        return "Ação"
    return "Renda Fixa"

def parse_sinacor_pdf(file_bytes: bytes) -> Dict[str, Any]:
    operations = []
    trade_date = None
    note_number = None
    total_costs = Decimal("0.00")
    total_operations = Decimal("0.00")

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        full_text = ""
        for page in pdf.pages:
            text = page.extract_text() or ""
            full_text += "\n" + text

        date_match = re.search(r"Data\s+preg[aã]o[:\s]+(\d{2}/\d{2}/\d{4})", full_text, re.IGNORECASE)
        if not date_match:
            date_match = re.search(r"(\d{2}/\d{2}/\d{4})", full_text)
        if date_match:
            trade_date = datetime.strptime(date_match.group(1), "%d/%m/%Y")
        else:
            trade_date = datetime.utcnow()

        num_match = re.search(r"Nr\.?\s+nota[:\s]+(\d+)", full_text, re.IGNORECASE)
        if num_match:
            note_number = num_match.group(1)

        patterns_costs = [
            r"Taxa de liquida[çc][aã]o\s+([\d\.,]+)",
            r"Taxa de Registro\s+([\d\.,]+)",
            r"Emolumentos\s+([\d\.,]+)",
            r"Corretagem\s+([\d\.,]+)",
            r"Taxa de Cust[oó]dia\s+([\d\.,]+)",
            r"I\.S\.S\s+([\d\.,]+)",
            r"Outros\s+([\d\.,]+)",
        ]
        for pat in patterns_costs:
            for m in re.finditer(pat, full_text, re.IGNORECASE):
                total_costs += parse_decimal(m.group(1))

        lines = full_text.split("\n")
        for line in lines:
            m_op = re.search(
                r"(?:1-BOVESPA\s+)?([CV])\s+(VISTA|FRACIONARIO|FRACIONÁRIO|OPÇÃO|OPCAO|TERMO)?\s*(.+?)\s+(\d+)\s+([\d\.,]+)\s+([\d\.,]+)\s+([DC])?",
                line,
                re.IGNORECASE
            )
            if m_op:
                side_raw = m_op.group(1).upper()
                op_type = "buy" if side_raw == "C" else "sell"
                asset_spec = m_op.group(3).strip()
                quantity = Decimal(m_op.group(4))
                unit_price = parse_decimal(m_op.group(5))
                total_amount = parse_decimal(m_op.group(6))

                ticker = guess_ticker(asset_spec)
                asset_type = guess_asset_type(ticker)
                total_operations += total_amount

                operations.append({
                    "ticker": ticker,
                    "asset_name": asset_spec,
                    "asset_type": asset_type,
                    "operation_type": op_type,
                    "quantity": float(quantity),
                    "unit_price": float(unit_price),
                    "total_amount": float(total_amount),
                    "costs": 0.0
                })

    if total_operations > 0 and total_costs > 0:
        for op in operations:
            prop = Decimal(str(op["total_amount"])) / total_operations
            op["costs"] = float((total_costs * prop).quantize(Decimal("0.01")))

    return {
        "trade_date": trade_date.strftime("%Y-%m-%d"),
        "note_number": note_number,
        "total_costs": float(total_costs),
        "total_operations": float(total_operations),
        "operations": operations
    }
