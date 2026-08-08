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


def mask_vpa(vpa: str | None) -> str:
    """Mask a UPI VPA to its handle, e.g. 9876543210@okhdfc → ***@okhdfc.

    The local part carries the account holder's identifier (often a mobile
    number) and must never be stored/logged raw; the bank handle is safe to keep
    for the admin to recognise the destination.
    """
    if not vpa or "@" not in vpa:
        return "***"
    _, _, handle = vpa.partition("@")
    return f"***@{handle}"


def mask_cheque_reference(reference: str | None) -> str:
    """Show only the final four characters of an offline cheque reference."""
    if not reference:
        return "Cheque"
    compact = reference.strip()
    if len(compact) <= 4:
        return "Cheque ••••"
    suffix = compact[-4:]
    return f"Cheque ••••{suffix}"


def mask_bank_account(ifsc: str | None, account_number: str | None) -> str:
    """Mask a bank account to IFSC bank-prefix + last 4, e.g.
    (HDFC0001234, 50100123456789) → HDFC ****6789.
    """
    tail = (account_number or "")[-4:] or "****"
    bank = (ifsc or "")[:4].upper() or "BANK"
    return f"{bank} ****{tail}"
