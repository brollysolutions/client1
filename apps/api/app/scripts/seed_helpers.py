"""Safe synthetic values shared by development-only seed scripts."""

from __future__ import annotations

import uuid


def dev_indian_mobile() -> str:
    """Return a synthetic ten-digit Indian mobile number in E.164 format."""
    local_number = uuid.uuid4().int % 4_000_000_000 + 6_000_000_000
    return f"+91{local_number}"
