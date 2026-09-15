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
    "aluguel", "condominio", "coelba", "enel", "embasa", "luz", "energia", "agua",
    "internet", "claro", "vivo", "tim", "oi fib", "netflix", "spotify", "prime video",
    "disney", "youtube", "plano", "mensalidade", "escola", "faculdade", "academia",
    "smartfit", "selfit", "seguro", "ipva", "iptu", "assefaz", "unimed", "bradesco saude",
    "sulamerica", "convenio", "salario", "remuneracao", "pensao"
]

def detect_cost_type(description: str) -> str:
    desc_lower = description.lower()
    if any(kw in desc_lower for kw in FIXED_EXPENSE_KEYWORDS):
        return "fixa"
    return "variavel"
