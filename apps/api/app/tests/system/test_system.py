"""System / health endpoint integration tests.

Covers GET / and GET /health.
Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

from httpx import AsyncClient


async def test_root_returns_200(client: AsyncClient) -> None:
    resp = await client.get("/")
    assert resp.status_code == 200


async def test_root_response_values(client: AsyncClient) -> None:
    resp = await client.get("/")
    body = resp.json()
    assert body["service"] == "loans-realestate-api"
    assert body["status"] == "ok"


async def test_health_returns_200(client: AsyncClient) -> None:
    resp = await client.get("/health")
    assert resp.status_code == 200


async def test_health_database_check_ok(client: AsyncClient) -> None:
    resp = await client.get("/health")
    assert resp.json()["checks"]["database"] == "ok"


async def test_health_redis_check_ok(client: AsyncClient) -> None:
    resp = await client.get("/health")
    assert resp.json()["checks"]["redis"] == "ok"


async def test_health_overall_status_ok(client: AsyncClient) -> None:
    resp = await client.get("/health")
    assert resp.json()["status"] == "ok"
