"""Password hashing, JWT encode/decode, and profile-code generation."""

from __future__ import annotations

import re
import secrets
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import JWTError, jwt

from app.core.config import settings

_ph = PasswordHasher()

# ---------------------------------------------------------------------------
# Password
# ---------------------------------------------------------------------------

_COMMON_PASSWORDS = frozenset(
    {"password", "password1", "123456", "12345678", "qwerty", "qwerty123", "letmein", "welcome"}
)


def hash_password(plain: str) -> str:
    return _ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, plain)
    except VerifyMismatchError:
        return False


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
    Example: CL-LN7K9FJOHN

    Caller must catch IntegrityError and retry on UNIQUE collision.
    """
    role_part = _ROLE_PREFIX.get(role, "XX")
    line_part = _LINE_PREFIX.get(business_line or "", "") if business_line else ""
    n = secrets.randbits(20)
    code_part = _encode_crockford(n)
    name_part = _clean_name(first_name)
    return f"{role_part}-{line_part}{code_part}{name_part}"
