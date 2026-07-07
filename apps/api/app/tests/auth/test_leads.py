"""Lead-capture integration tests.

Verifies that every auth entry point persists the mobile to the leads table, that
re-capture is idempotent (partial-unique on active leads), and that a later
registration enriches the existing lead's name/business_line.
Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy import select

from conftest import initiate_and_get_otp, unique_email, unique_mobile


async def _leads_for(mobile: str) -> list:
    import app.db.session as _session_mod
    from app.models.lead import Lead

    async with _session_mod.AsyncSessionLocal() as session:
        return list((await session.scalars(select(Lead).where(Lead.mobile == mobile))).all())


async def test_register_initiate_captures_lead_with_name_and_line(client: AsyncClient) -> None:
    mobile = unique_mobile()
    await client.post(
        "/api/v1/auth/register/initiate",
        json={
            "first_name": "Asha",
            "last_name": "Rao",
            "mobile": mobile,
            "email": unique_email(),
        },
    )
    leads = await _leads_for(mobile)
    assert len(leads) == 1
    assert leads[0].name == "Asha Rao"
    # Self-registered clients enroll in both lines; the lead is anchored to loans.
    assert leads[0].business_line == "loans"
    assert leads[0].status == "new"


async def test_forgot_initiate_captures_lead(client: AsyncClient) -> None:
    mobile = unique_mobile()
    await client.post("/api/v1/auth/forgot/initiate", json={"mobile": mobile})
    assert len(await _leads_for(mobile)) == 1


async def test_repeated_capture_is_deduped(client: AsyncClient) -> None:
    """Multiple entries for the same mobile keep exactly one active lead."""
    mobile = unique_mobile()
    for _ in range(3):
        await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": "X@123456"})
    assert len(await _leads_for(mobile)) == 1


async def test_capture_enriches_line_on_later_register(client: AsyncClient) -> None:
    """A login (no line) then a register (loans) enriches the same lead's line."""
    mobile = unique_mobile()
    await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": "X@123456"})
    before = await _leads_for(mobile)
    assert before[0].business_line is None

    await initiate_and_get_otp(client, mobile, lines=["loans"])
    after = await _leads_for(mobile)
    assert len(after) == 1  # still one lead — enriched, not duplicated
    assert after[0].business_line == "loans"
    assert after[0].name == "Test User"
