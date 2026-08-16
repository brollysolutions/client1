"""Validation for browser-issued Web Push service endpoints.

Push endpoints are later dereferenced by the API with server credentials and
network access. Treating an arbitrary client-supplied URL as a subscription
would therefore create an authenticated SSRF primitive. Keep the accepted
providers explicit and revalidate immediately before every delivery so legacy
or directly-seeded rows cannot bypass the subscription boundary.
"""

from __future__ import annotations

from urllib.parse import urlsplit

from app.core.config import settings


class InvalidPushEndpoint(ValueError):
    """The URL is not a configured HTTPS browser push-service endpoint."""


def _allowed_hosts() -> tuple[str, ...]:
    return tuple(
        host.strip().lower().rstrip(".")
        for host in settings.PUSH_ENDPOINT_ALLOWED_HOSTS.split(",")
        if host.strip()
    )


def validate_push_endpoint(endpoint: str) -> str:
    """Return *endpoint* when it is safe for outbound Web Push delivery.

    A configured host also permits its subdomains (on a dot boundary), which
    covers provider-sharded endpoints such as ``*.notify.windows.com`` without
    accepting lookalikes such as ``evilnotify.windows.com``.
    """
    if not 1 <= len(endpoint) <= 2048:
        raise InvalidPushEndpoint("Push endpoint is too long.")
    try:
        parsed = urlsplit(endpoint)
        port = parsed.port
    except ValueError as exc:
        raise InvalidPushEndpoint("Push endpoint is invalid.") from exc
    hostname = parsed.hostname
    if (
        parsed.scheme.lower() != "https"
        or not hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or hostname.endswith(".")
        or port not in (None, 443)
    ):
        raise InvalidPushEndpoint("Push endpoint must use an approved HTTPS provider.")

    normalized = hostname.lower()
    allowed = _allowed_hosts()
    if not allowed or not any(
        normalized == host or normalized.endswith(f".{host}") for host in allowed
    ):
        raise InvalidPushEndpoint("Push endpoint provider is not approved.")
    return endpoint
