# Plan: Auth Endpoints + Redis Services

## Context

The platform has models, config, and Docker wired but zero auth code. Nothing can be tested
end-to-end until registration/login/token flows exist. This plan implements the full auth
subsystem per `docs/architecture/Auth_System_Design.md` (v1.4, signed off 2026-06-28).

---

## Config fixes (before anything else)

Three values in `apps/api/app/core/config.py` contradict Auth_System_Design.md:

| Setting | Current | Correct | Source |
|---|---|---|---|
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 30 | **15** | Auth Design §10 |
| `REFRESH_TOKEN_EXPIRE_DAYS` | 25 | **30** | Auth Design §10 |
| `OTP_MAX_ATTEMPTS` | 3 | **5** | Auth Design §11 |

Fix all three before writing auth logic.

---

## New Alembic migration

Baseline migration (`114766dba120`) only created `auth_users` + 3 enums. All profile/session
tables are modeled but unmigrated. One new migration creates:

**New enums:**
- `profile_status` — active, inactive, pending, suspended
- `staff_role_enum` — admin, sub_admin, telecaller, employee
- `profile_scope_enum` — platform, line
- `submission_status_enum` — pending, approved, rejected

**New tables (in dependency order):**
1. `refresh_tokens` (FK → auth_users)
2. `auth_events` (FK → auth_users nullable)
3. `staff_profiles` (FK → auth_users x2)
4. `client_profiles` + `UNIQUE(auth_user_uuid, business_line)` constraint
5. `agent_applications` (FK → auth_users, staff_profiles)
6. `agent_profiles` (FK → auth_users, agent_applications, staff_profiles)

Migration must connect directly to postgres:5432 (not pgBouncer) for enum DDL — per ADR-0004.
Alembic env.py already handles this replacement.

---

## New files to create

```
apps/api/app/
  core/
    security.py        # password hash/verify (argon2id), JWT encode/decode, profile-code gen
    deps.py            # get_current_user(), get_db_with_rls() dependencies
  cache/
    redis_keys.py      # key namespace constants, get/set/delete helpers with TTL
  services/
    otp.py             # generate OTP, hash+store, verify, resend throttle, rate-limit
    sms.py             # 2Factor.in primary + Fast2SMS failover via httpx
    auth_service.py    # login, token issuance, refresh rotation, logout, provisioning
  schemas/
    auth.py            # Pydantic request/response models for all 11 endpoints
  api/
    __init__.py
    v1/
      __init__.py
      auth.py          # FastAPI router — 11 endpoints wired to auth_service
  tests/
    test_auth.py       # success + validation + auth-failure cases per endpoint
```

---

## Implementation layers (build in order)

### 1 — `app/core/security.py`

```python
# Password (argon2id via argon2-cffi)
hash_password(plain: str) -> str
verify_password(plain: str, hashed: str) -> bool
validate_password_policy(password: str, mobile: str) -> None  # 8-128 chars, 1 letter + 1 digit, no mobile, no blocklist

# JWT (python-jose)
create_access_token(payload: dict) -> str   # 15-min exp, includes jti
create_refresh_token() -> tuple[str, str]   # returns (raw_token, token_hash)
decode_access_token(token: str) -> dict     # raises on expired/invalid

# Profile codes (Crockford base32 per Auth Design §5)
generate_profile_code(prefix: str, first_name: str) -> str  # retry on UNIQUE collision
```

Deps available: `argon2-cffi`, `python-jose[cryptography]`, `passlib` — all in pyproject.toml.

### 2 — `app/cache/redis_keys.py`

Key constants matching Auth Design §8 exactly:

```python
OTP_REGISTER   = "otp:register:{mobile}"
OTP_RESET      = "otp:reset:{mobile}"
OTP_RESEND     = "otp_resend:{mobile}"
OTP_LOCK       = "otp_lock:{mobile}"
OTP_RATE       = "otp_rate:{mobile}"
LOGIN_FAIL     = "login_fail:{mobile}"
LOGIN_LOCK     = "login_lock:{mobile}"
JWT_BLACKLIST  = "jwt_blacklist:{jti}"
```

Helper: `RedisCache` thin wrapper on `app.state.redis` with typed `get`, `set`, `incr`, `delete`, `exists`, `ttl`.

### 3 — `app/services/otp.py`

```python
generate_and_store_otp(redis, mobile: str, purpose: str) -> None
  # secrets.randbelow(10**6) → 6-digit, argon2 hash, store in otp:{purpose}:{mobile}, TTL 5 min

verify_otp(redis, mobile: str, purpose: str, code: str) -> None
  # compare hash; decrement attempt counter; raise on wrong/expired/exceeded

resend_otp(redis, mobile: str, purpose: str) -> None
  # check otp_lock; INCR otp_resend; lock on >2; call generate_and_store_otp

check_otp_rate(redis, mobile: str) -> None
  # INCR otp_rate:{mobile}, EXPIRE 24h on first; raise TooManyRequests if >5/day
```

### 4 — `app/services/sms.py`

```python
send_sms(mobile: str, message: str) -> None
  # 1. try 2Factor.in API (settings.TWOFACTOR_API_KEY)
  # 2. on error → fallback to Fast2SMS (settings.FAST2SMS_API_KEY)
  # 3. on both fail → log + raise SMSDeliveryError
  # Never raise if keys are empty in dev (log warning only)
```

Uses `httpx.AsyncClient`. Async context manager in service.

### 5 — `app/schemas/auth.py`

Pydantic v2 schemas for all 11 endpoints. Key ones:

```python
RegisterInitiateRequest    # first_name, last_name, mobile (E.164), line: list[Literal["loans","real_estate"]]
RegisterVerifyOtpRequest   # mobile, otp (6 digits)
RegistrationTokenResponse  # registration_token (JWT)
SetPasswordRequest         # registration_token, password, confirm_password
AuthTokensResponse         # access_token, token_type, expires_in; refresh in httpOnly cookie

LoginRequest               # mobile, password
ForgotInitiateRequest      # mobile
ForgotVerifyRequest        # mobile, otp
ResetPasswordRequest       # reset_token, new_password
ChangePasswordRequest      # current_password, new_password

ResendOtpRequest           # mobile, purpose: Literal["register","reset"]
```

### 6 — `app/services/auth_service.py`

Business logic per flow in Auth Design §6:

```python
register_initiate(db, redis, req) -> None
register_verify_otp(db, redis, req) -> RegistrationTokenResponse
register_set_password(db, redis, req) -> AuthTokensResponse
  # Creates auth_user + client_profile(s); generates customer_code; issues JWTs

login(db, redis, req) -> AuthTokensResponse
  # check login_lock → verify pwd (argon2) → clear fail counter → check status
  # → issue access+refresh → set last_login_at → log auth_event

refresh_token(db, redis, raw_token: str) -> AuthTokensResponse
  # hash token → find row → check revoked → rotate (mark replaced_by, issue new)

logout(db, redis, jti: str, refresh_token_id: UUID) -> None
  # blacklist jti in Redis; mark refresh_token revoked

forgot_initiate / forgot_verify / forgot_reset  # per flow §6.5
change_password                                  # per §6 provisioned flow
```

### 7 — `app/core/deps.py`

```python
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
    redis = Depends(get_redis),
) -> CurrentUser:
    # 1. decode JWT (raises 401 if expired/invalid)
    # 2. check jwt_blacklist:{jti} in Redis → 401 if present
    # 3. SET LOCAL session context:
    #    app.auth_user_uuid, app.role, app.client_profile_uuid,
    #    app.agent_profile_uuid, app.staff_profile_uuid,
    #    app.business_line, app.platform_scope
    # 4. return CurrentUser dataclass

get_db_with_rls = Depends(get_current_user)  # session already context-set above
```

RLS context matches Auth Design §13 exactly (7 variables).

### 8 — `app/api/v1/auth.py` router

All 11 endpoints from Auth Design §9 wired to auth_service functions.
Refresh token sent as `httpOnly` + `Secure` + `SameSite=Strict` cookie.
Generic error message on bad credentials ("invalid mobile number or password").

### 9 — Wire into `app/main.py`

```python
from app.api.v1.auth import router as auth_router
app.include_router(auth_router, prefix="/auth", tags=["auth"])
```

### 10 — Tests (`app/tests/test_auth.py`)

One test file covering per endpoint: success, validation failure, auth failure, edge cases.
Priority cases:
- Full registration flow (initiate → verify → set-password)
- Login + token issuance
- Refresh rotation
- Logout + blacklist check
- OTP rate-limit (5 attempts exhausted)
- Login lockout (5 failures → 15 min)
- Provisioned account forced password reset
- RLS: client cannot read another user's profile

Use pytest-asyncio (already in dev deps). Test DB = Postgres service (no mocking per `.claude/rules/testing.md`).

---

## Verification

```bash
# Run verify script
./scripts/verify.sh --changed

# Manual smoke test
curl -X POST http://localhost:8000/auth/register/initiate \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Test","last_name":"User","mobile":"+919876543210","line":["loans"]}'

# Check health still green
curl http://localhost:8000/health
```

Expected: all new tests pass, existing test unbroken, health OK, no ruff/mypy errors.

---

## Files to modify

- `apps/api/app/core/config.py` — fix 3 config values
- `apps/api/app/main.py` — include auth router + expose redis to deps
- `apps/api/alembic/versions/` — new migration file (profile + session tables)

## Files to create (~10 new)

- `apps/api/app/core/security.py`
- `apps/api/app/core/deps.py`
- `apps/api/app/cache/redis_keys.py`
- `apps/api/app/services/otp.py`
- `apps/api/app/services/sms.py`
- `apps/api/app/services/auth_service.py`
- `apps/api/app/schemas/auth.py`
- `apps/api/app/api/__init__.py`
- `apps/api/app/api/v1/__init__.py`
- `apps/api/app/api/v1/auth.py`
- `apps/api/app/tests/test_auth.py`
