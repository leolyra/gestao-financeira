from fastapi import APIRouter
from app.api.endpoints import auth, accounts, categories

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(accounts.router)
api_router.include_router(categories.router)
