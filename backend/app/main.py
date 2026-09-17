from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from app.core.config import settings
from app.core.database import Base, engine
from app.api.router import api_router

def run_migrations():
    try:
        with engine.begin() as conn:
            conn.execute(text('ALTER TABLE investment_transactions ADD COLUMN IF NOT EXISTS costs NUMERIC(14, 2) DEFAULT 0.00;'))
            conn.execute(text('ALTER TABLE investment_transactions ADD COLUMN IF NOT EXISTS notes VARCHAR(255);'))
            conn.execute(text('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS pluggy_item_id VARCHAR(100);'))
            conn.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cost_type VARCHAR(20) DEFAULT 'variavel';"))
            conn.execute(text("UPDATE transactions SET cost_type = 'variavel' WHERE cost_type IS NULL;"))
            conn.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_accounted BOOLEAN DEFAULT TRUE;"))
            conn.execute(text("UPDATE transactions SET is_accounted = TRUE WHERE is_accounted IS NULL;"))
            conn.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS spending_nature VARCHAR(20) DEFAULT 'recorrente';"))
            conn.execute(text("UPDATE transactions SET spending_nature = 'recorrente' WHERE spending_nature IS NULL;"))
            print('Database auto-migrations executed successfully.')
    except Exception as e:
        print(f'Migration notice: {e}')

Base.metadata.create_all(bind=engine)
run_migrations()

app = FastAPI(title=settings.PROJECT_NAME, version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.leo\.lyra\.nom\.br|http://localhost:.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    origin = request.headers.get("origin", "*")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers={
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
        }
    )

app.include_router(api_router, prefix="/api/v1")

@app.get("/")
def root():
    return {"status": "ok", "service": "finance-api"}

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "finance-api"}
