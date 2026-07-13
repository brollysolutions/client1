"""Proxy-aware client IP resolution, shared by every per-IP rate-limited route."""

from __future__ import annotations

from fastapi import Request

from app.core.config import settings


def get_client_ip(request: Request) -> str | None:
    # Only honour X-Forwarded-For when explicitly configured to trust the proxy;
    # otherwise it is attacker-controlled and would forge the IP used for audit
    # logging and per-IP rate limiting. When trusted, take the RIGHTMOST entry
    # — the hop our own reverse proxy appended (the real peer it saw) — not the
    # leftmost, which any client can set freely. Assumes a single trusted proxy.
    if settings.TRUST_PROXY_HEADERS:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            parts = [p.strip() for p in forwarded.split(",") if p.strip()]
            if parts:
                return parts[-1]
    return request.client.host if request.client else None
