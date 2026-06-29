from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_env_file = Path(__file__).resolve().parent.parent.parent / ".env.local"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_env_file,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    ENV: str = "development"
    DEBUG: bool = False
    LOG_LEVEL: str = "info"

    # Database — must point to pgbouncer, not postgres directly.
    # asyncpg: statement_cache_size=0 + unique prepared_statement_name_func wired in db/session.py.
    DATABASE_URL: str = "postgresql+asyncpg://app:app@pgbouncer:5432/app"
    DB_ECHO: bool = False
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_RECYCLE: int = 1800  # recycle below pgBouncer/Postgres idle timeouts

    # Redis — OTP rate-limit, JWT blacklist, selective cache
    REDIS_URL: str = "redis://redis:6379/0"

    # JWT
    SECRET_KEY: str = "a630038491ab971b65b3a3f85c91c7ab2e324a818d2deed0c1633a70504444a3"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # OTP (Redis-backed, hashed, single-use per security rules)
    OTP_EXPIRE_SECONDS: int = 300
    OTP_MAX_ATTEMPTS: int = 5
    OTP_RATE_LIMIT_PER_MOBILE: int = 3  # max initiation requests per mobile per hour
    OTP_RATE_LIMIT_PER_IP: int = 10  # max initiation requests per IP per hour

    # CORS — set as JSON array: '["http://localhost:3000","https://yourdomain.com"]'
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]

    # SMS — 2Factor.in primary, Fast2SMS failover
    TWOFACTOR_API_KEY: str = ""
    FAST2SMS_API_KEY: str = ""

    # Payments — Razorpay (cashback / referral / commission payouts only, never loan principal)
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""


settings = Settings()
