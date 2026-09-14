from fastapi import APIRouter
from app.api.endpoints import auth, accounts, categories, transactions, open_finance

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(accounts.router)
api_router.include_router(categories.router)
api_router.include_router(transactions.router)
api_router.include_router(open_finance.router)
