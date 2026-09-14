from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import Base, engine
from app.api.router import api_router

# Criação das tabelas
Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.PROJECT_NAME, version="1.0.0")

# Permite qualquer subdomínio do seu domínio leo.lyra.nom.br e localhost
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.leo\.lyra\.nom\.br|http://localhost:.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inclusão das rotas da aplicação
app.include_router(api_router, prefix="/api/v1")

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "finance-api"}
