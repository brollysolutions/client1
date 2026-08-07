"""Safe internal destinations shared by notification and email delivery.

Notification hrefs are persisted, sent through web push, and may be included
in email.  Treat all of those values as untrusted at their rendering boundary:
only an application-relative path is a valid destination.
"""

from __future__ import annotations

import re
from urllib.parse import urlsplit

_ENCODED_AUTHORITY_PREFIX = re.compile(r"^/%(?:2f|5c)", re.IGNORECASE)


def is_safe_internal_path(value: str) -> bool:
    """Return whether *value* is a browser-safe same-origin path.

    Reject protocol-relative paths, backslash variants, encoded authority
    prefixes, controls, and any parsed scheme/netloc.  Query strings and
    fragments remain valid for future workflow destinations.
    """
    if not value or not value.startswith("/") or value.startswith(("//", "/\\")):
        return False
    if "\\" in value or any(ord(char) < 0x20 for char in value):
        return False
    if _ENCODED_AUTHORITY_PREFIX.match(value):
        return False
    parsed = urlsplit(value)
    return not parsed.scheme and not parsed.netloc


def notification_path_or_none(value: str | None) -> str | None:
    """Fail closed for internal producers without breaking their durable action."""
    return value if value is not None and is_safe_internal_path(value) else None
