"""Credentialed browser CORS policy regressions."""

from __future__ import annotations

from urllib.parse import urlsplit

import pytest
from httpx import ASGITransport, AsyncClient, Response
from starlette.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp

from app.core.config import settings
from app.main import (
    CORS_ALLOW_HEADERS,
    CORS_ALLOW_METHODS,
    CORS_EXPOSE_HEADERS,
    app,
)

_BROWSER_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}
_BROWSER_HEADERS = {"authorization", "content-type", "x-business-line"}
_PREFLIGHT_ALLOW_HEADERS = _BROWSER_HEADERS | {
    "accept",
    "accept-language",
    "content-language",
}


def _configured_origin() -> str:
    assert settings.ALLOWED_ORIGINS
    assert all(origin not in {"*", "null"} for origin in settings.ALLOWED_ORIGINS)
    origin = settings.ALLOWED_ORIGINS[0]
    return origin


def _suffix_confusion_origin(origin: str) -> str:
    parsed = urlsplit(origin)
    assert parsed.scheme and parsed.hostname
    port = f":{parsed.port}" if parsed.port is not None else ""
    return f"{parsed.scheme}://{parsed.hostname}.attacker.invalid{port}"


def test_declared_policy_matches_browser_inventory() -> None:
    assert set(CORS_ALLOW_METHODS) == _BROWSER_METHODS
    assert {header.lower() for header in CORS_ALLOW_HEADERS} == _BROWSER_HEADERS
    assert CORS_EXPOSE_HEADERS == ("X-Report-Truncated",)


async def _preflight(
    *,
    origin: str,
    method: str,
    request_headers: str | None = None,
    path: str = "/api/v1/auth/refresh",
    target_app: ASGIApp = app,
) -> Response:
    headers = {
        "Origin": origin,
        "Access-Control-Request-Method": method,
    }
    if request_headers is not None:
        headers["Access-Control-Request-Headers"] = request_headers
    async with AsyncClient(
        transport=ASGITransport(app=target_app), base_url="https://api.test"
    ) as client:
        return await client.options(path, headers=headers)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("path", "method", "request_headers"),
    [
        ("/api/v1/auth/refresh", "POST", None),
        ("/api/v1/auth/me", "GET", "Authorization"),
        (
            "/api/v1/loans/applications/example/documents/presign",
            "POST",
            "Authorization, Content-Type, X-Business-Line",
        ),
        ("/api/v1/admin/reports/leads/export", "GET", "Authorization, X-Business-Line"),
    ],
)
async def test_configured_origin_preflights_cover_browser_flows(
    path: str,
    method: str,
    request_headers: str | None,
) -> None:
    response = await _preflight(
        origin=_configured_origin(),
        method=method,
        request_headers=request_headers,
        path=path,
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == _configured_origin()
    assert response.headers["access-control-allow-credentials"] == "true"
    assert {
        value.strip() for value in response.headers["access-control-allow-methods"].split(",")
    } == _BROWSER_METHODS
    allowed_headers = {
        value.strip().lower()
        for value in response.headers["access-control-allow-headers"].split(",")
    }
    assert allowed_headers == _PREFLIGHT_ALLOW_HEADERS


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("path", "method", "request_headers"),
    [
        ("/api/v1/auth/refresh", "POST", None),
        ("/api/v1/auth/me", "GET", "Authorization"),
        (
            "/api/v1/loans/applications/example/documents/presign",
            "POST",
            "Authorization, Content-Type, X-Business-Line",
        ),
    ],
)
async def test_representative_https_production_origin_preflights(
    path: str,
    method: str,
    request_headers: str | None,
) -> None:
    production_origin = "https://app.example.com"
    production_cors_app = CORSMiddleware(
        app,
        allow_origins=[production_origin],
        allow_credentials=True,
        allow_methods=CORS_ALLOW_METHODS,
        allow_headers=CORS_ALLOW_HEADERS,
        expose_headers=CORS_EXPOSE_HEADERS,
    )

    response = await _preflight(
        origin=production_origin,
        method=method,
        request_headers=request_headers,
        path=path,
        target_app=production_cors_app,
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == production_origin
    assert response.headers["access-control-allow-credentials"] == "true"


@pytest.mark.asyncio
@pytest.mark.parametrize("method", sorted(_BROWSER_METHODS))
async def test_each_browser_method_is_allowed(method: str) -> None:
    response = await _preflight(origin=_configured_origin(), method=method)

    assert response.status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "origin",
    [
        "https://attacker.invalid",
        "null",
        pytest.param(None, id="suffix-confusion"),
    ],
)
async def test_unapproved_origins_receive_no_cors_grant(origin: str | None) -> None:
    rejected_origin = origin or _suffix_confusion_origin(_configured_origin())
    response = await _preflight(
        origin=rejected_origin,
        method="POST",
        request_headers="Authorization, Content-Type",
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


@pytest.mark.asyncio
@pytest.mark.parametrize("method", ["HEAD", "TRACE"])
async def test_unapproved_method_fails_preflight(method: str) -> None:
    response = await _preflight(origin=_configured_origin(), method=method)

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_unapproved_header_fails_preflight() -> None:
    response = await _preflight(
        origin=_configured_origin(),
        method="POST",
        request_headers="Authorization, X-Admin-Override",
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_simple_and_same_origin_requests_keep_normal_behavior() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://api.test") as client:
        same_origin = await client.get("/")
        allowed_cross_origin = await client.get("/", headers={"Origin": _configured_origin()})
        rejected_cross_origin = await client.get(
            "/", headers={"Origin": "https://attacker.invalid"}
        )

    assert same_origin.status_code == 200
    assert same_origin.json()["status"] == "ok"
    assert "access-control-allow-origin" not in same_origin.headers

    assert allowed_cross_origin.status_code == 200
    assert allowed_cross_origin.headers["access-control-allow-origin"] == _configured_origin()
    assert allowed_cross_origin.headers["access-control-allow-credentials"] == "true"
    assert allowed_cross_origin.headers["access-control-expose-headers"].lower() == (
        "x-report-truncated"
    )

    assert rejected_cross_origin.status_code == 200
    assert "access-control-allow-origin" not in rejected_cross_origin.headers
