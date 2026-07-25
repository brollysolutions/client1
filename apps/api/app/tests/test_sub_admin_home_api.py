"""sub_admin home API — aggregated summary (slice 5).

Every underlying query runs on the request session under each table's own
RLS; this test suite exercises the aggregation and role gate, not RLS itself
(each domain's own RLS test file already covers that).
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from conftest import full_registration

_URL = "/api/v1/sub-admin/home"


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


def _sub_admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "sub_admin", "business_line": "both", "platform_scope": "true"}
    )


@pytest.mark.asyncio
async def test_sub_admin_can_load_home(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.get(_URL, headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body["pending_approval"], list)
    assert isinstance(body["live_banners_count"], int)
    assert isinstance(body["live_offers_count"], int)
    assert isinstance(body["content_drafts_count"], int)
    assert isinstance(body["recent_referral_payouts"], list)


@pytest.mark.asyncio
async def test_own_pending_banner_appears_in_queue(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}

    create_res = await client.post(
        "/api/v1/banners",
        json={
            "business_line": "loans",
            "banner_type": "default",
            "title": "Home-queue banner",
        },
        headers=headers,
    )
    assert create_res.status_code == 201, create_res.text
    banner_id = create_res.json()["id"]
    submit_res = await client.post(f"/api/v1/banners/{banner_id}/submit", headers=headers)
    assert submit_res.status_code == 200, submit_res.text

    res = await client.get(_URL, headers=headers)
    assert res.status_code == 200, res.text
    pending_ids = [item["id"] for item in res.json()["pending_approval"]]
    assert banner_id in pending_ids


@pytest.mark.asyncio
async def test_other_sub_admins_pending_banner_not_in_my_queue(client: AsyncClient) -> None:
    """Pending-approval is an OWN-authored queue, not the shared visibility
    every other list endpoint in this domain has."""
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    owner_headers = {"Authorization": f"Bearer {_sub_admin_token(owner_uid)}"}

    create_res = await client.post(
        "/api/v1/banners",
        json={
            "business_line": "loans",
            "banner_type": "default",
            "title": "Not-yours banner",
        },
        headers=owner_headers,
    )
    banner_id = create_res.json()["id"]
    await client.post(f"/api/v1/banners/{banner_id}/submit", headers=owner_headers)

    _, other_mobile = await full_registration(client, lines=["loans"])
    other_uid = await _auth_user_uuid(other_mobile)
    other_headers = {"Authorization": f"Bearer {_sub_admin_token(other_uid)}"}

    res = await client.get(_URL, headers=other_headers)
    assert res.status_code == 200, res.text
    pending_ids = [item["id"] for item in res.json()["pending_approval"]]
    assert banner_id not in pending_ids


@pytest.mark.asyncio
async def test_client_cannot_load_home(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    token = create_access_token(
        {"sub": uid, "role": "client", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.get(_URL, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_cannot_load_sub_admin_home(client: AsyncClient) -> None:
    """This is a role-specific landing page, not a shared-oversight endpoint —
    unlike the domain list routes, Admin has no reason to load it."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    token = create_access_token(
        {"sub": uid, "role": "admin", "business_line": "both", "platform_scope": "true"}
    )
    res = await client.get(_URL, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_recent_referral_payouts_capped_at_five(client: AsyncClient) -> None:
    from app.models.transaction import Transaction, TransactionStatus, TransactionType

    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        for _ in range(7):
            db.add(
                Transaction(
                    user_uuid=uuid.UUID(uid),
                    business_line=None,
                    type=TransactionType.REFERRAL_BONUS,
                    status=TransactionStatus.PAID,
                    amount_paise=10_000,
                    currency="INR",
                    description="Referral payout",
                )
            )
        await db.commit()

    res = await client.get(_URL, headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"})
    assert res.status_code == 200, res.text
    assert len(res.json()["recent_referral_payouts"]) == 5
