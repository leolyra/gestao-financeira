from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Finance Hub API"
    DATABASE_URL: str = "postgresql://postgres:postgres@postgres:5432/financas_db"
    SECRET_KEY: str = "troque_por_uma_chave_segura_em_producao"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    OLLAMA_BASE_URL: str = "http://host.docker.internal:11434"
    PLUGGY_CLIENT_ID: str = ""
    PLUGGY_CLIENT_SECRET: str = ""

    class Config:
        case_sensitive = True
        env_file = ".env"

settings = Settings()
