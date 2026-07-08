"""Password hashing, JWT encode/decode, and profile-code generation."""

from __future__ import annotations

import re
import secrets
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import anyio
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import JWTError, jwt

from app.core.config import settings

_ph = PasswordHasher()

# argon2id costs ~64 MiB per hash. anyio's default thread limiter (40) would let an
# auth burst allocate ~2.5 GiB of transient RAM and OOM a small replica. Cap concurrent
# argon2 work well under the memory budget; shared across password + OTP hashing so the
# ceiling bounds ALL argon2 threads, not each call site independently.
ARGON2_LIMITER = anyio.CapacityLimiter(8)

# ---------------------------------------------------------------------------
# Password
# ---------------------------------------------------------------------------

_COMMON_PASSWORDS = frozenset(
    {"password", "password1", "123456", "12345678", "qwerty", "qwerty123", "letmein", "welcome"}
)


async def hash_password(plain: str) -> str:
    # argon2id is deliberately CPU/memory-heavy; run it in a worker thread so a
    # single login/registration doesn't stall the event loop for other requests.
    return await anyio.to_thread.run_sync(_ph.hash, plain, limiter=ARGON2_LIMITER)


async def verify_password(plain: str, hashed: str) -> bool:
    def _verify() -> bool:
        try:
            return _ph.verify(hashed, plain)
        except VerifyMismatchError:
            return False

    return await anyio.to_thread.run_sync(_verify, limiter=ARGON2_LIMITER)


def validate_password_policy(password: str, mobile: str) -> None:
    """Raise ValueError if password fails policy (Auth Design §6.6)."""
    if len(password) < 8 or len(password) > 128:
        raise ValueError("Password must be 8–128 characters.")
    if not re.search(r"[A-Za-z]", password):
        raise ValueError("Password must contain at least one letter.")
    if not re.search(r"\d", password):
        raise ValueError("Password must contain at least one digit.")
    digits_only = re.sub(r"\D", "", mobile)
    if digits_only and digits_only in password:
        raise ValueError("Password must not contain your mobile number.")
    if password.lower() in _COMMON_PASSWORDS:
        raise ValueError("Password is too common.")


# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------


def create_access_token(payload: dict) -> str:
    """Issue a signed access JWT with exp + jti injected."""
    now = datetime.now(UTC)
    data = {
        **payload,
        "jti": str(uuid4()),
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(data, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token() -> tuple[str, str]:
    """Return (raw_token, sha256_hex_hash). Store only the hash."""
    import hashlib

    raw = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    return raw, token_hash


def hash_refresh_token(raw: str) -> str:
    import hashlib

    return hashlib.sha256(raw.encode()).hexdigest()


def decode_access_token(token: str) -> dict:
    """Decode + verify JWT. Raises jose.JWTError on any failure."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise


# ---------------------------------------------------------------------------
# Profile codes  (Auth Design §5 — Crockford base32)
# ---------------------------------------------------------------------------

_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

_ROLE_PREFIX: dict[str, str] = {
    "admin": "AD",
    "sub_admin": "SA",
    "agent": "AG",
    "telecaller": "TC",
    "employee": "EM",
    "client": "CL",
}

_LINE_PREFIX: dict[str, str] = {
    "loans": "LN",
    "real_estate": "RE",
}

# Clients use 5 chars (32^5 = 33.5M) to handle million-client target;
# staff/agent roles use 4 chars (32^4 = 1.05M, ample for those counts).
_CODE_LENGTH: dict[str, int] = {
    "client": 5,
}


def _encode_crockford(n: int, length: int = 4) -> str:
    out: list[str] = []
    for _ in range(length):
        out.append(_CROCKFORD[n & 0b11111])
        n >>= 5
    return "".join(reversed(out))


def _clean_name(name: str, cap: int = 10) -> str:
    return re.sub(r"[^A-Z]", "", name.upper())[:cap]


def generate_profile_code(role: str, first_name: str, business_line: str | None = None) -> str:
    """
    Generate a Crockford base32 profile code.
    Format: {ROLE_PREFIX}-{LINE_PREFIX}{CODE}{NAME}
    Example: CL-LN7K9FJOHN (5-char code for clients), AG-LN7K9FRAVI (4-char for agents)

    Caller must catch IntegrityError and retry on UNIQUE collision.
    """
    role_part = _ROLE_PREFIX.get(role, "XX")
    line_part = _LINE_PREFIX.get(business_line or "", "") if business_line else ""
    length = _CODE_LENGTH.get(role, 4)
    n = secrets.randbits(5 * length)
    code_part = _encode_crockford(n, length)
    name_part = _clean_name(first_name)
    return f"{role_part}-{line_part}{code_part}{name_part}"
