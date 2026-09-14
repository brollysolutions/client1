"""Reviewed identity map for the ten existing seeded banks.

No new provider rows are inferred or imported. See apps/web/public/provider-logos/PROVENANCE.md
for asset sources, checksums and review. A verified managed upload takes priority.
"""

from datetime import UTC, datetime

BUILT_IN_LOGO_REVIEWED_AT = datetime(2026, 9, 14, tzinfo=UTC)
BUILT_IN_PROVIDER_LOGOS: dict[str, tuple[str, str]] = {
    "hdfc bank": (
        "/provider-logos/hdfc.svg",
        "https://www.hdfc.bank.in/",
    ),
    "state bank of india": (
        "/provider-logos/sbi.png",
        "https://home.sbi.bank.in/o/SBI-Theme/images/custom/logo.png",
    ),
    "icici bank": (
        "/provider-logos/icici.png",
        "https://www.icici.bank.in/",
    ),
    "axis bank": (
        "/provider-logos/axis.svg",
        "https://www.axis.bank.in/assets/images/logo.svg",
    ),
    "kotak mahindra bank": (
        "/provider-logos/kotak.svg",
        "https://www.kotak.bank.in/en/home.html",
    ),
    "punjab national bank": (
        "/provider-logos/pnb.png",
        "https://pnb.bank.in/images/logo.png",
    ),
    "bank of baroda": (
        "/provider-logos/bob.png",
        "https://bankofbaroda.bank.in/",
    ),
    "canara bank": (
        "/provider-logos/canara.webp",
        "https://www.canarabank.bank.in/",
    ),
    "idfc first bank": (
        "/provider-logos/idfc.svg",
        "https://www.idfcfirst.bank.in/",
    ),
    "yes bank": (
        "/provider-logos/yes.png",
        "https://commons.wikimedia.org/wiki/File:Yes_Bank_Logo-01.png",
    ),
}
