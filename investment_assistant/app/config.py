from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    assistant_user_id: int = 1

    openai_api_key: str
    openai_model: str
    mcp_public_url: str
    mcp_bearer_token: str

    telegram_bot_token: str
    telegram_webhook_secret: str
    telegram_allowed_chat_ids: str = ""

    log_level: str = "INFO"

    @property
    def allowed_chat_ids(self) -> set[int]:
        return {
            int(value.strip())
            for value in self.telegram_allowed_chat_ids.split(",")
            if value.strip()
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
