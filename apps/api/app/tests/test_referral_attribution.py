"""Registration-time referral attribution — services.referrals.attribute_signup,
wired through auth_service.register_set_password.

D4: an unknown code never fails registration (logged instead, in auth_events).
D3: Crockford aliasing (O/I/L) makes a typo'd code still resolve.
D5/D6: self-referral is a no-op, and first-claim-wins on referred_mobile.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from conftest import full_registration, unique_mobile


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None
        return str(row[0])


async def _referral_for_mobile(mobile: str) -> dict | None:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT referrer_auth_user_uuid, referred_auth_user_uuid, "
                    "referred_lead_uuid, conversion_status, business_line "
                    "FROM referrals WHERE referred_mobile = :m"
                ),
                {"m": mobile},
            )
        ).fetchone()
        if row is None:
            return None
        return dict(zip(row._mapping.keys(), row, strict=True))


async def _register_detail(mobile: str) -> dict | None:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT detail FROM auth_events "
                    "WHERE mobile = :m AND event_type = 'register' "
                    "ORDER BY created_at DESC LIMIT 1"
                ),
                {"m": mobile},
            )
        ).fetchone()
        return row[0] if row else None


async def _my_code(client: AsyncClient, token: str) -> str:
    res = await client.get("/api/v1/referrals/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    return res.json()["code"]


@pytest.mark.asyncio
async def test_happy_path_creates_pending_referral(client: AsyncClient) -> None:
    token_a, mobile_a = await full_registration(client, lines=["loans"])
    code = await _my_code(client, token_a)
    uid_a = await _auth_user_uuid(mobile_a)

    _, mobile_b = await full_registration(client, lines=["loans"], referral_code=code)
    uid_b = await _auth_user_uuid(mobile_b)

    row = await _referral_for_mobile(mobile_b)
    assert row is not None
    assert str(row["referrer_auth_user_uuid"]) == uid_a
    assert str(row["referred_auth_user_uuid"]) == uid_b
    assert row["conversion_status"] == "pending"
    assert row["business_line"] is None
    # capture_lead runs on every register/initiate, so a lead for this mobile
    # should exist and get linked.
    assert row["referred_lead_uuid"] is not None


@pytest.mark.asyncio
async def test_unknown_code_does_not_fail_registration(client: AsyncClient) -> None:
    mobile = unique_mobile()
    token, _ = await full_registration(
        client, mobile=mobile, lines=["loans"], referral_code="ZZZZZZZZ"
    )
    assert token  # registration succeeded (201 inside full_registration's own assert)

    assert await _referral_for_mobile(mobile) is None
    detail = await _register_detail(mobile)
    assert detail == {"referral_code_unmatched": "ZZZZZZZZ"}


@pytest.mark.asyncio
async def test_malformed_code_rejected_at_initiate(client: AsyncClient) -> None:
    res = await client.post(
        "/api/v1/auth/register/initiate",
        json={
            "first_name": "Test",
            "last_name": "User",
            "mobile": unique_mobile(),
            "email": f"test_{uuid.uuid4().hex[:12]}@example.com",
            "referral_code": "!!!!",
        },
    )
    assert res.status_code == 422, res.text


@pytest.mark.asyncio
async def test_lowercase_code_still_resolves(client: AsyncClient) -> None:
    """Case-insensitive end to end. The O/I/L alias mapping (the other half of
    D3) is covered at the unit level in tests/auth/test_codegen.py — a
    generated code never itself contains those letters, so an integration
    round-trip can't exercise the alias substitution deterministically."""
    token_a, _ = await full_registration(client, lines=["loans"])
    code = await _my_code(client, token_a)

    _, mobile_b = await full_registration(client, lines=["loans"], referral_code=code.lower())
    row = await _referral_for_mobile(mobile_b)
    assert row is not None


@pytest.mark.asyncio
async def test_self_referral_creates_no_row(client: AsyncClient) -> None:
    from app.services.referrals import attribute_signup

    token_a, mobile_a = await full_registration(client, lines=["loans"])
    code = await _my_code(client, token_a)
    uid_a = await _auth_user_uuid(mobile_a)

    result = await attribute_signup(
        code=code, referred_mobile=mobile_a, referred_auth_user_uuid=uuid.UUID(uid_a)
    )
    assert result is None
    assert await _referral_for_mobile(mobile_a) is None


@pytest.mark.asyncio
async def test_first_claim_wins_on_referred_mobile(client: AsyncClient) -> None:
    from app.services.referrals import attribute_signup

    token_a, mobile_a = await full_registration(client, lines=["loans"])
    code_a = await _my_code(client, token_a)
    uid_a = await _auth_user_uuid(mobile_a)
    token_c, _ = await full_registration(client, lines=["loans"])
    code_c = await _my_code(client, token_c)
    # A third real account stands in for "the referred person" — the FK on
    # referred_auth_user_uuid requires a real auth_users row.
    _, mobile_referred = await full_registration(client, lines=["loans"])
    uid_referred = await _auth_user_uuid(mobile_referred)

    referred_mobile = unique_mobile()
    referred_uuid = uuid.UUID(uid_referred)

    await attribute_signup(
        code=code_a, referred_mobile=referred_mobile, referred_auth_user_uuid=referred_uuid
    )
    await attribute_signup(
        code=code_c, referred_mobile=referred_mobile, referred_auth_user_uuid=referred_uuid
    )

    row = await _referral_for_mobile(referred_mobile)
    assert row is not None
    assert str(row["referrer_auth_user_uuid"]) == uid_a
