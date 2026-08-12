"""Safe synthetic values shared by development-only seed scripts."""

from __future__ import annotations

import uuid

from pydantic import EmailStr, TypeAdapter, ValidationError

_email_adapter = TypeAdapter(EmailStr)


def dev_indian_mobile() -> str:
    """Return a synthetic ten-digit Indian mobile number in E.164 format."""
    local_number = uuid.uuid4().int % 4_000_000_000 + 6_000_000_000
    return f"+91{local_number}"


def dev_seed_email(value: str) -> str:
    """Normalize an email accepted by the application response contract."""
    try:
        return str(_email_adapter.validate_python(value))
    except ValidationError as exc:
        raise ValueError("Email must be a valid, non-reserved address.") from exc
