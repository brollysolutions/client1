"""Public lead endpoint tests (docs/specs/public-leads-endpoint.md).

Covers: classified insert, enrich-on-conflict, validation rejects, per-mobile
rate cap, and honeypot drop.

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import pytest
import redis.asyncio as aioredis
from httpx import AsyncClient
from sqlalchemy import select

import app.db.session as db_session
from app.cache.redis_keys import lead_rate_ip_key, lead_rate_mobile_key
from app.core.config import settings
from app.models.lead import Lead
from conftest import unique_mobile

# ASGITransport stamps every request with this client host.
_TEST_IP = "127.0.0.1"


def _payload(mobile: str | None = None, **overrides) -> dict:
    base = {
        "name": "Test Visitor",
        "mobile": mobile or unique_mobile(),
        "topic": "loans",
        "origin": "contact",
    }
    base.update(overrides)
    return base


async def _get_lead(mobile: str) -> Lead | None:
    # Attribute access at call time, not from-import: conftest swaps in a
    # NullPool sessionmaker per test session (see _patch_db_null_pool).
    async with db_session.AsyncSessionLocal() as session:
        return await session.scalar(select(Lead).where(Lead.mobile == mobile))


@pytest.fixture(autouse=True)
async def _clean_ip_window():
    """Every test shares the ASGI test IP; isolate the per-IP counter."""
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    await r.delete(lead_rate_ip_key(_TEST_IP))
    try:
        yield
    finally:
        await r.delete(lead_rate_ip_key(_TEST_IP))
        await r.aclose()


async def test_create_lead_persists_row(client: AsyncClient) -> None:
    mobile = unique_mobile()
    resp = await client.post(
        "/api/v1/leads",
        json=_payload(mobile, product="Personal Loan", message="Need 5 lakh"),
    )
    assert resp.status_code == 202
    assert resp.json() == {"ok": True}

    lead = await _get_lead(mobile)
    assert lead is not None
    assert lead.name == "Test Visitor"
    assert lead.business_line == "loans"
    assert lead.requirement["page"] == "contact"
    assert lead.requirement["product"] == "Personal Loan"
    assert lead.requirement["message"] == "Need 5 lakh"


async def test_create_lead_enriches_open_existing(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import app.services.leads as leads_service

    async def no_assignment(*_args, **_kwargs):
        return None

    monkeypatch.setattr(leads_service, "auto_assign_locked_lead", no_assignment)
    mobile = unique_mobile()
    assert (
        await client.post("/api/v1/leads", json=_payload(mobile, topic="loans"))
    ).status_code == 202
    # A second same-line request enriches the open, unassigned workflow.
    resp = await client.post(
        "/api/v1/leads",
        json=_payload(
            mobile,
            topic="loans",
            email="visitor@example.com",
            message="Call after 6pm",
        ),
    )
    assert resp.status_code == 202

    lead = await _get_lead(mobile)
    assert lead is not None
    assert lead.business_line == "loans"
    assert lead.requirement["email"] == "visitor@example.com"
    assert lead.requirement["message"] == "Call after 6pm"


@pytest.mark.parametrize(
    "bad",
    [
        {"mobile": "98765"},  # not E.164
        {"topic": "crypto"},  # outside whitelist
        {"topic": "agent"},  # partner enquiries are not operational leads
        {"origin": "https://evil.example"},  # outside whitelist
        {"name": ""},  # blank
        {"message": "x" * 1001},  # over cap
    ],
)
async def test_create_lead_validation_rejects(client: AsyncClient, bad: dict) -> None:
    resp = await client.post("/api/v1/leads", json=_payload(**bad))
    assert resp.status_code == 422


async def test_per_mobile_cap_trips(client: AsyncClient) -> None:
    mobile = unique_mobile()
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    original = settings.LEAD_RATE_LIMIT_PER_MOBILE
    settings.LEAD_RATE_LIMIT_PER_MOBILE = 2
    try:
        assert (await client.post("/api/v1/leads", json=_payload(mobile))).status_code == 202
        assert (await client.post("/api/v1/leads", json=_payload(mobile))).status_code == 202
        assert (await client.post("/api/v1/leads", json=_payload(mobile))).status_code == 429
    finally:
        settings.LEAD_RATE_LIMIT_PER_MOBILE = original
        await r.delete(lead_rate_mobile_key(mobile))
        await r.aclose()


async def test_honeypot_answers_202_without_writing(client: AsyncClient) -> None:
    mobile = unique_mobile()
    resp = await client.post(
        "/api/v1/leads", json=_payload(mobile, company="Definitely A Real Business Ltd")
    )
    assert resp.status_code == 202
    assert await _get_lead(mobile) is None
