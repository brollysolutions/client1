"""PII masking helpers for logs.

security.md forbids logging raw PII (mobile numbers, email, KYC, income). These
helpers keep just enough of an identifier to correlate log lines during an
incident without storing the full value in centralised logs.
"""

from __future__ import annotations


def mask_mobile(mobile: str | None) -> str:
    """Mask a mobile number to its last 4 digits, e.g. +919876543210 → ***3210."""
    if not mobile:
        return "***"
    tail = mobile[-4:]
    return f"***{tail}"


def mask_email(email: str | None) -> str:
    """Mask an email local-part, e.g. jane.doe@example.com → j***@example.com."""
    if not email or "@" not in email:
        return "***"
    local, _, domain = email.partition("@")
    first = local[0] if local else ""
    return f"{first}***@{domain}"
