from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_env_file = Path(__file__).resolve().parent.parent.parent / ".env.local"

# Committed dev-only signing key. Usable for local development, but the app
# refuses to boot with it (or any unset/short key) outside ENV=development —
# HS256 is symmetric, so a known key lets anyone forge admin tokens and bypass
# every RLS policy. Rotate to a unique per-environment secret in real deploys.
_INSECURE_DEFAULT_SECRET = "a630038491ab971b65b3a3f85c91c7ab2e324a818d2deed0c1633a70504444a3"


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
    SECRET_KEY: str = _INSECURE_DEFAULT_SECRET
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # OTP (Redis-backed, hashed, single-use per security rules)
    OTP_EXPIRE_SECONDS: int = 300
    OTP_MAX_ATTEMPTS: int = 5
    OTP_RATE_LIMIT_PER_MOBILE: int = 3  # max initiation requests per mobile per hour
    # Max OTP initiations per client IP per hour. IMPORTANT: this is only per-CLIENT
    # when TRUST_PROXY_HEADERS is on. Behind a reverse proxy with it OFF, every
    # request carries the proxy's IP, so this collapses to a single global bucket
    # and would throttle all users after this many initiations/hour. Keep it
    # generous and set TRUST_PROXY_HEADERS=True in any proxied deployment.
    OTP_RATE_LIMIT_PER_IP: int = 50
    # Max FAILED logins per client IP per hour. Backstops the per-mobile lock
    # against credential spraying (many numbers, few tries each, one source).
    # Same proxy caveat as OTP_RATE_LIMIT_PER_IP: keep generous, NAT offices
    # share one IP; only failures count, successful logins never do.
    LOGIN_RATE_LIMIT_PER_IP: int = 30

    # Public lead form (POST /api/v1/leads) abuse caps, hourly windows. Same
    # proxy caveat as the other per-IP limits.
    LEAD_RATE_LIMIT_PER_IP: int = 10
    LEAD_RATE_LIMIT_PER_MOBILE: int = 5

    # Return the plaintext OTP in the API response (otp_hint) when delivery is
    # mocked, so local/dev flows are testable without a real voice/email channel.
    # SECURITY: fail-closed. Must be explicitly turned on; never enable in any
    # environment reachable by real users — it discloses a live login/reset code.
    # Gating on "ENV != production" alone was unsafe: any misread ENV (prod/staging/
    # unset) would leak the code (audit L3).
    OTP_EXPOSE_HINT: bool = False

    # Trust X-Forwarded-For only when the app runs behind a single reverse proxy
    # (e.g. nginx) that sets it. Default False: the header is client-controlled and
    # would let a caller forge the IP used for audit logging + per-IP OTP limits.
    # PRODUCTION (the documented nginx topology): set this True, otherwise the
    # per-IP OTP cap above degrades to a global cap (see OTP_RATE_LIMIT_PER_IP).
    TRUST_PROXY_HEADERS: bool = False

    # CORS — set as JSON array: '["http://localhost:3000","https://yourdomain.com"]'
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]

    # OTP delivery channels — Voice (2Factor.in) primary, Email (SMTP) fallback.
    # SMS is intentionally NOT used: India DLT registration is out of scope and
    # operators block non-DLT A2P SMS, so we deliver OTP by voice call + email only.
    #
    # Voice is OFF by default: the mainline (dev/staging) never places real
    # 2Factor calls, so the code path stays inert without prod credentials. The
    # long-lived `prod` branch enables it via env (VOICE_OTP_ENABLED=true +
    # TWOFACTOR_API_KEY in .env.prod / secrets). Even when enabled, an empty
    # TWOFACTOR_API_KEY falls back to mock+email (see services/otp_delivery).
    VOICE_OTP_ENABLED: bool = False
    TWOFACTOR_API_KEY: str = ""  # 2Factor.in — voice OTP (prod only)

    # Email (transactional OTP + verification). SMTP transport, vendor-neutral.
    # Point at AWS SES SMTP (email-smtp.<region>.amazonaws.com:587) or any SMTP host.
    EMAIL_ENABLED: bool = False
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""  # secret
    SMTP_PASSWORD: str = ""  # secret
    SMTP_FROM: str = ""  # e.g. "Loans & Real Estate <no-reply@yourdomain.com>"
    SMTP_USE_TLS: bool = True  # STARTTLS on port 587

    # Payments — Razorpay (cashback / referral / commission payouts only, never loan principal)
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""

    @model_validator(mode="after")
    def _guard_secret_key(self) -> "Settings":
        # Fail fast outside development if the signing key is the committed
        # default, empty, or too short to be safe. Dev keeps the default so the
        # stack boots without extra setup.
        if self.ENV != "development":
            if self.SECRET_KEY == _INSECURE_DEFAULT_SECRET:
                raise ValueError(
                    "SECRET_KEY is the committed development default. Set a unique, "
                    "secret SECRET_KEY for this environment."
                )
            if len(self.SECRET_KEY) < 32:
                raise ValueError("SECRET_KEY must be at least 32 characters.")
        return self


settings = Settings()
