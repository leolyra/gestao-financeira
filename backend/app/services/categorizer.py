from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.models.entities import Category, Transaction

KEYWORD_RULES = [
    (["mercado", "supermercado", "pao de acucar", "assai", "atacadão", "carrefour", "hortifruti", "padaria", "restaurante", "ifood", "burger", "pizza"], "Alimentação / Supermercado"),
    (["posto", "combustivel", "gasolina", "etanol", "shell", "ipiranga", "uber", "99app", "estacionamento", "zona azul"], "Transporte / Combustível"),
    (["aluguel", "condominio", "coelba", "embasa", "enel", "luz", "energia", "internet", "claro", "vivo"], "Moradia / Contas"),
    (["smartfit", "selfit", "crossfit", "academia", "farmacia", "droga silva", "drogasil", "pague menos", "medico", "consulta"], "Saúde & Treinos"),
    (["cinema", "netflix", "spotify", "ingresso", "viagem", "hotel", "latam", "gol"], "Lazer & Família"),
    (["salario", "remuneracao", "folha", "ted recebida", "pix recebido"], "Salário / Remuneração"),
    (["dividendo", "jcp", "rendimento", "b3"], "Proventos / Dividendos"),
]

def auto_categorize(description: str, user_id: int, db: Session) -> Optional[int]:
    desc_lower = description.lower()

    past_tx = db.query(Transaction).filter(
        Transaction.description.ilike(f"%{description[:15]}%"),
        Transaction.category_id.isnot(None)
    ).order_by(Transaction.id.desc()).first()

    if past_tx and past_tx.category_id:
        return past_tx.category_id

    for keywords, category_name in KEYWORD_RULES:
        if any(kw in desc_lower for kw in keywords):
            cat = db.query(Category).filter(
                Category.name.ilike(category_name),
                or_(Category.user_id == user_id, Category.user_id == None)
            ).first()
            if cat:
                return cat.id

    return None

FIXED_EXPENSE_KEYWORDS = [
    "aluguel", "condominio", "condominial", "coelba", "enel", "embasa", "luz", "energia", "agua",
    "internet", "claro", "vivo", "tim", "oi fib", "netflix", "spotify", "prime video",
    "disney", "youtube", "plano", "mensalidade", "escola", "faculdade", "academia",
    "smartfit", "selfit", "totalpass", "gympass", "ccaa", "seguro", "ipva", "iptu", "assefaz",
    "unimed", "bradesco saude", "sulamerica", "convenio", "salario", "remuneracao", "pensao",
    "diarista", "faxina", "google one", "melimais"
]

def detect_cost_type(description: str) -> str:
    desc_lower = description.lower()
    if any(kw in desc_lower for kw in FIXED_EXPENSE_KEYWORDS):
        return "fixa"
    return "variavel"

from datetime import datetime, timedelta
from typing import Tuple

def resolve_date_range(period: Optional[str]) -> Tuple[Optional[datetime], Optional[datetime]]:
    if not period:
        return None, None
    now = datetime.utcnow()
    p = period.lower().strip()

    if p in ["current_month", "mes_atual", "mês atual"]:
        start = datetime(now.year, now.month, 1, 0, 0, 0)
        if now.month == 12:
            next_m = datetime(now.year + 1, 1, 1, 0, 0, 0)
        else:
            next_m = datetime(now.year, now.month + 1, 1, 0, 0, 0)
        end = next_m - timedelta(seconds=1)
        return start, end

    elif p in ["30d", "30 dias", "30_dias"]:
        start = now - timedelta(days=30)
        return start, now

    elif p in ["previous_month", "mes_anterior", "mês anterior"]:
        first_this_month = datetime(now.year, now.month, 1, 0, 0, 0)
        last_prev_month = first_this_month - timedelta(seconds=1)
        first_prev_month = datetime(last_prev_month.year, last_prev_month.month, 1, 0, 0, 0)
        return first_prev_month, last_prev_month

    elif p in ["60d", "60 dias", "60_dias"]:
        start = now - timedelta(days=60)
        return start, now

    elif p in ["90d", "90 dias", "90_dias"]:
        start = now - timedelta(days=90)
        return start, now

    elif p in ["current_year", "esse_ano", "este_ano", "esse ano", "este ano"]:
        start = datetime(now.year, 1, 1, 0, 0, 0)
        end = datetime(now.year, 12, 31, 23, 59, 59)
        return start, end

    elif p in ["12m", "12 meses", "12_meses", "ultimos_12_meses", "365d"]:
        start = now - timedelta(days=365)
        return start, now

    elif p in ["all", "tudo", "todo_historico"]:
        return None, None
    return None, None
