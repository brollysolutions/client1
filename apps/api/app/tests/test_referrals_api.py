"""GET /api/v1/referrals/me + GET /api/v1/referrals — client's own code +
conversion tracking. Covers self-heal issuance, agent ineligibility (FR-9.1),
own-rows-only visibility, and PII masking on the wire.
"""

from __future__ import annotations

import re
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from conftest import full_registration

_CODE_RE = re.compile(r"^[0-9A-HJKMNP-TV-Z]{8}$")


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None
        return str(row[0])


async def _delete_code(auth_user_uuid: str) -> None:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(
            text("DELETE FROM referral_codes WHERE auth_user_uuid = :uid"), {"uid": auth_user_uuid}
        )
        await db.commit()


async def _seed_active_agent(auth_user_uuid: str, business_line: str = "loans") -> None:
    import app.db.session as _session_mod
    from app.models.profile import AgentProfile, ProfileStatus

    async with _session_mod.AsyncSessionLocal() as db:
        db.add(
            AgentProfile(
                auth_user_uuid=uuid.UUID(auth_user_uuid),
                agent_code=f"AG-{uuid.uuid4().hex[:8]}",
                business_line=business_line,
                status=ProfileStatus.ACTIVE,
            )
        )
        await db.commit()


async def _seed_referral(referrer_uuid: str, referred_uuid: str, referred_mobile: str) -> str:
    import app.db.session as _session_mod
    from app.models.referral import Referral

    async with _session_mod.AsyncSessionLocal() as db:
        row = Referral(
            referrer_auth_user_uuid=uuid.UUID(referrer_uuid),
            referred_mobile=referred_mobile,
            referred_auth_user_uuid=uuid.UUID(referred_uuid),
        )
        db.add(row)
        await db.commit()
        return str(row.id)


@pytest.mark.asyncio
async def test_fresh_client_gets_a_valid_code(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    res = await client.get("/api/v1/referrals/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["eligible"] is True
    assert body["ineligible_reason"] is None
    assert _CODE_RE.match(body["code"]), body["code"]
    assert body["stats"] == {
        "total": 0,
        "pending": 0,
        "converted": 0,
        "accrued": 0,
        "paid": 0,
        "void": 0,
        "accrued_amount_paise": 0,
        "paid_amount_paise": 0,
    }


@pytest.mark.asyncio
async def test_code_stable_across_calls(client: AsyncClient) -> None:
    token, _ = await full_registration(client, lines=["loans"])
    headers = {"Authorization": f"Bearer {token}"}
    first = (await client.get("/api/v1/referrals/me", headers=headers)).json()["code"]
    second = (await client.get("/api/v1/referrals/me", headers=headers)).json()["code"]
    assert first == second


@pytest.mark.asyncio
async def test_self_heals_after_code_row_deleted(client: AsyncClient) -> None:
    token, mobile = await full_registration(client, lines=["loans"])
    headers = {"Authorization": f"Bearer {token}"}
    original = (await client.get("/api/v1/referrals/me", headers=headers)).json()["code"]

    uid = await _auth_user_uuid(mobile)
    await _delete_code(uid)

    healed = (await client.get("/api/v1/referrals/me", headers=headers)).json()
    assert healed["eligible"] is True
    assert _CODE_RE.match(healed["code"])
    # A fresh code, not necessarily different in value, but definitely re-issued
    # (the row existed, was deleted, and now exists again).
    assert healed["code"] is not None
    assert original  # sanity: the original call did succeed


@pytest.mark.asyncio
async def test_approved_agent_is_ineligible(client: AsyncClient) -> None:
    """FR-9.1: referrals are Clients only. An approved agent gets no code,
    even though they still hold an underlying ClientProfile."""
    token, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    await _seed_active_agent(uid, "loans")

    res = await client.get("/api/v1/referrals/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["eligible"] is False
    assert body["ineligible_reason"] == "agent"
    assert body["code"] is None


@pytest.mark.asyncio
async def test_list_returns_only_own_rows_and_masks_mobile(client: AsyncClient) -> None:
    token_a, mobile_a = await full_registration(client, lines=["loans"])
    uid_a = await _auth_user_uuid(mobile_a)
    token_b, mobile_b = await full_registration(client, lines=["loans"])
    uid_b = await _auth_user_uuid(mobile_b)
    referred_mobile = f"+91{uuid.uuid4().int % 900_000_000 + 100_000_000}"
    ref_id = await _seed_referral(uid_a, uid_b, referred_mobile)

    res_a = await client.get("/api/v1/referrals", headers={"Authorization": f"Bearer {token_a}"})
    assert res_a.status_code == 200, res_a.text
    rows_a = res_a.json()["referrals"]
    assert ref_id in [r["id"] for r in rows_a]
    row = next(r for r in rows_a if r["id"] == ref_id)
    assert row["referred_mobile_masked"] == f"***{referred_mobile[-4:]}"
    # PII minimisation: the raw referred mobile must never appear on the wire.
    assert referred_mobile not in res_a.text

    res_b = await client.get("/api/v1/referrals", headers={"Authorization": f"Bearer {token_b}"})
    assert res_b.status_code == 200, res_b.text
    assert ref_id not in [r["id"] for r in res_b.json()["referrals"]]


@pytest.mark.asyncio
async def test_unauthenticated_rejected(client: AsyncClient) -> None:
    res = await client.get("/api/v1/referrals/me")
    assert res.status_code == 401
    res = await client.get("/api/v1/referrals")
    assert res.status_code == 401
