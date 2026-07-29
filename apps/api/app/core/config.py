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

    # Public agent-application intake (POST /api/v1/agent-applications) abuse
    # caps. Per-IP submit cap is a separate hourly window from the shared
    # otp_rate/otp_rate_ip OTP budget (register/reset share that one). Presign
    # quota is per-ticket (4 documents x up to 3 retries each).
    AGENT_APPLY_RATE_LIMIT_PER_IP: int = 20
    AGENT_APPLY_PRESIGN_LIMIT_PER_TICKET: int = 12
    # Purpose-scoped daily cap, independent of the shared otp_rate/{mobile} 5-per-
    # day budget (register/reset/agent_apply all draw from that one). Without
    # this, this endpoint is unauthenticated and needs only a target mobile
    # number — an attacker who knows a victim's number could burn their whole
    # shared daily OTP budget through this route alone, locking them out of
    # register/forgot for the day. Security review finding, 2026-07-26.
    AGENT_APPLY_OTP_DAILY_LIMIT: int = 3

    # Max KYC upload size for agent-application intake, signed into the
    # presigned-POST policy (storage rejects oversize bodies itself — never
    # trust the browser's own check). Mirrors DEFAULT_MAX_BYTES in
    # apps/web/components/apply-as-agent/file-field.tsx; keep both in sync.
    AGENT_APPLICATION_MAX_UPLOAD_BYTES: int = 5 * 1024 * 1024

    # Same reasoning as AGENT_APPLICATION_MAX_UPLOAD_BYTES, for the client
    # loan-application KYC upload path (services/loan_documents.py).
    LOAN_DOCUMENT_MAX_UPLOAD_BYTES: int = 5 * 1024 * 1024
    LOAN_DOCUMENT_MAX_PER_APPLICATION: int = 12

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

    # Payments — RazorpayX payouts (cashback / referral / commission only, never
    # loan principal or property purchase — the product's money invariant).
    #
    # Live-vs-mock is switched purely by credential presence, exactly like voice
    # OTP / email above: empty keys ⇒ mock producer (writes the ledger row, no
    # external call, no real money). The mainline (dev/staging) ships these empty
    # so the money path stays inert; the long-lived `prod` branch supplies real
    # values via env (.env.prod / secrets). See services/payments.py::_is_live.
    RAZORPAY_KEY_ID: str = ""  # secret
    RAZORPAY_KEY_SECRET: str = ""  # secret
    # HMAC-SHA256 secret for the payout webhook receiver. Empty ⇒ webhook is
    # fail-closed (every event rejected), so status can only settle once this is set.
    RAZORPAY_WEBHOOK_SECRET: str = ""  # secret
    # RazorpayX source account the payout debits (the "2323230000000000" style
    # virtual account number from the RazorpayX dashboard).
    RAZORPAYX_ACCOUNT_NUMBER: str = ""
    # Money-safety guards. amount_paise integer minor units.
    #   *_PAISE == 0 means "not configured": in LIVE mode an unset cap is treated
    #   as fail-closed (reject the payout — never move uncapped real money); in
    #   mock mode 0 means "no cap" for dev convenience. Enforced in the create guard.
    PAYOUT_MAX_AMOUNT_PAISE: int = 0  # per-payout ceiling
    PAYOUT_DAILY_CAP_PAISE: int = 0  # aggregate ceiling per calendar day (UTC)
    # Reject a duplicate (same recipient + type + amount + idempotency key) seen
    # within this window, backstopping the partial-unique index against retries.
    PAYOUT_DEDUPE_WINDOW_SECONDS: int = 300
    # Reconciliation grace: a live payout still INITIATED (webhook never arrived)
    # or FAILED with no gateway id (the POST response was lost) is only swept once
    # it has been stuck this long, so the reconciler never races a webhook that is
    # merely in flight. Mock mode settles synchronously, so this is a live-only path.
    PAYOUT_RECONCILE_STUCK_MINUTES: int = 30
    # Post-settlement drift audit: a PAID payout can still be reversed by
    # RazorpayX days later (e.g. a bank-side rejection after the transfer
    # already settled) if the payout.reversed webhook is lost. Only PAID
    # payouts settled within this trailing window are re-verified against the
    # gateway — reversals essentially never happen long after settlement
    # finality, so scanning unbounded history would be wasted API calls on
    # every future tick forever. See services/payments.py::
    # audit_paid_payouts_for_drift.
    PAYOUT_REVERSAL_AUDIT_WINDOW_DAYS: int = 7

    # 7-year PII retention purge (SRS 5.1). Anchor is `delinked_at` on
    # transactions/payouts, stamped by services/account_deletion.py's Phase B
    # — never `created_at`. See services/retention_purge.py.
    FINANCIAL_RECORD_RETENTION_YEARS: int = 7

    # Web push (VAPID) — browser push delivery for the existing notifications
    # feed (services/notifications.py::emit_notification). Live-vs-mock is
    # switched by credential presence alone, exactly like Razorpay above:
    # empty keys ⇒ push send is a no-op (see services/push.py::_is_live). The
    # mainline ships these empty so push stays inert until a real VAPID
    # keypair is provisioned. Unlike voice OTP, there's no separate "turn the
    # channel on" business flag — the keypair existing IS the channel.
    VAPID_PUBLIC_KEY: str = ""  # not secret — served to browsers via GET /push/vapid-public-key
    VAPID_PRIVATE_KEY: str = ""  # secret
    VAPID_SUBJECT: str = ""  # RFC 8292 aud claim, e.g. "mailto:ops@yourdomain.com"

    # Object storage — S3-compatible (minio in dev, DigitalOcean Spaces in
    # prod). Unlike payments/voice-OTP, this has no mock/live toggle: every
    # environment needs a real storage endpoint for the employee document
    # upload flow, only the endpoint + credentials differ per environment.
    # Dev points at the minio service in docker-compose with placeholder
    # creds; prod supplies real Spaces values via env/secrets.
    SPACES_ENDPOINT_URL: str = "http://minio:9000"
    # Presigned URLs are handed to the browser, which can't resolve the
    # container-network hostname above. Empty means "same as
    # SPACES_ENDPOINT_URL" (true in prod — Spaces is one public URL for
    # everyone); dev overrides this to the host-published port
    # (docker-compose.dev.yml), never a Settings-level default here.
    SPACES_PUBLIC_ENDPOINT_URL: str = ""
    SPACES_REGION: str = "us-east-1"
    SPACES_BUCKET: str = "task-documents"
    SPACES_ACCESS_KEY: str = "minioadmin"  # dev placeholder; real value in prod env
    SPACES_SECRET_KEY: str = "minioadmin"  # dev placeholder; real value in prod env

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

    @model_validator(mode="after")
    def _guard_storage_credentials(self) -> "Settings":
        # Same "prod must be explicitly configured" stance as _guard_secret_key:
        # the committed minio dev placeholders must never reach a real
        # deployment, where they'd point at (or authenticate against) nothing
        # real, or worse, a shared default anyone could guess.
        if self.ENV != "development":
            if self.SPACES_ACCESS_KEY == "minioadmin" or self.SPACES_SECRET_KEY == "minioadmin":
                raise ValueError(
                    "SPACES_ACCESS_KEY/SPACES_SECRET_KEY are the committed minio dev "
                    "placeholders. Set real DigitalOcean Spaces credentials for this "
                    "environment."
                )
            if self.SPACES_ENDPOINT_URL == "http://minio:9000":
                raise ValueError(
                    "SPACES_ENDPOINT_URL is the committed dev minio endpoint. Set the "
                    "real DigitalOcean Spaces endpoint for this environment."
                )
            # Presigned URLs carry the SigV4 signature (and, for uploads, the
            # document bytes) in plain query-string/body over the wire — a
            # plain-http endpoint outside dev would expose KYC documents to
            # network-level interception.
            if not self.SPACES_ENDPOINT_URL.startswith("https://"):
                raise ValueError("SPACES_ENDPOINT_URL must use https:// outside development.")
        return self

    @model_validator(mode="after")
    def _guard_live_payments(self) -> "Settings":
        # Partial credentials are a silent-mock trap: _is_live() ANDs the key id
        # and secret, so setting only one (secret-manager mis-sync, half-done
        # rotation) leaves the service in MOCK mode in production — payouts show
        # "paid" with no real money moving, and nothing fails or warns. Refuse to
        # boot outside development unless BOTH keys are set or NEITHER is.
        key_set = bool(self.RAZORPAY_KEY_ID)
        secret_set = bool(self.RAZORPAY_KEY_SECRET)
        if self.ENV != "development" and key_set != secret_set:
            raise ValueError(
                "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set together "
                "(both for live payouts, or neither for mock). Exactly one is set."
            )

        # A live payments config (real Razorpay creds present) outside development
        # MUST carry the full safety envelope or the service refuses to boot: a
        # payout gateway that can move real money without a webhook secret (no way
        # to settle/verify), a source account, and both caps set is a foot-gun.
        # Mirrors _guard_secret_key's "prod must be explicitly configured" stance.
        is_live = key_set and secret_set
        if self.ENV != "development" and is_live:
            missing: list[str] = []
            if not self.RAZORPAY_WEBHOOK_SECRET:
                missing.append("RAZORPAY_WEBHOOK_SECRET")
            if not self.RAZORPAYX_ACCOUNT_NUMBER:
                missing.append("RAZORPAYX_ACCOUNT_NUMBER")
            if self.PAYOUT_MAX_AMOUNT_PAISE <= 0:
                missing.append("PAYOUT_MAX_AMOUNT_PAISE")
            if self.PAYOUT_DAILY_CAP_PAISE <= 0:
                missing.append("PAYOUT_DAILY_CAP_PAISE")
            if missing:
                raise ValueError(
                    "Live Razorpay payments require these settings outside "
                    f"development: {', '.join(missing)}."
                )
        return self

    @model_validator(mode="after")
    def _guard_live_push(self) -> "Settings":
        # Same partial-credential silent-mock trap as _guard_live_payments:
        # services.push._is_live() ANDs all three VAPID settings, so setting
        # only some of them leaves push silently in mock mode in production —
        # subscribe calls succeed, nothing ever delivers, nothing warns.
        # Push moves no money, so no second "safety envelope" guard is needed
        # here the way live payments requires one.
        vapid_fields = (self.VAPID_PUBLIC_KEY, self.VAPID_PRIVATE_KEY, self.VAPID_SUBJECT)
        vapid_set = [bool(f) for f in vapid_fields]
        if self.ENV != "development" and len(set(vapid_set)) > 1:
            raise ValueError(
                "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT must be set "
                "together (all for live push, or none for mock). Only some are set."
            )
        return self


settings = Settings()
