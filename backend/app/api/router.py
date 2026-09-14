from fastapi import APIRouter

api_router = APIRouter()

# Tenta importar os endpoints da pasta 'endpoints' ou direto de 'api'
try:
    from app.api.endpoints import auth, accounts, categories
except ImportError:
    from app.api import auth, accounts, categories

api_router.include_router(auth.router)
api_router.include_router(accounts.router)
api_router.include_router(categories.router)

# Transações (extrato / receitas e despesas)
try:
    from app.api.endpoints import transactions
    api_router.include_router(transactions.router)
except ImportError:
    try:
        from app.api import transactions
        api_router.include_router(transactions.router)
    except ImportError as e:
        print(f"[AVISO] Modulo transactions nao carregado: {e}")

# Open Finance (Pluggy)
try:
    from app.api.endpoints import open_finance
    api_router.include_router(open_finance.router)
except ImportError:
    try:
        from app.api import open_finance
        api_router.include_router(open_finance.router)
    except ImportError as e:
        print(f"[AVISO] Modulo open_finance nao carregado: {e}")
