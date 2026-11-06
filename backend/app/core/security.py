import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import jwt
from app.core.config import settings

def get_password_hash(password: str) -> str:
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 310000)
    return "pbkdf2_sha256$310000$" + salt + "$" + key.hex()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        if hashed_password.startswith("pbkdf2_sha256$"):
            _, rounds, salt, expected = hashed_password.split("$", 3)
            count = int(rounds)
        else:
            salt, expected = hashed_password.split("$", 1)
            count = 100000
        actual = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt.encode("utf-8"), count).hex()
        return secrets.compare_digest(actual, expected)
    except Exception:
        return False

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    if not settings.SECRET_KEY or len(settings.SECRET_KEY) < 32:
        raise RuntimeError("SECRET_KEY deve ser configurada com pelo menos 32 caracteres.")
    payload = data.copy()
    payload.update({"exp": datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))})
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
