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


_PROJECT_AMENITIES = " ".join(["landscaped"] * 150)

_SUBMISSION_PAYLOAD = {
    "title": "Home-queue submission",
    "type": "Apartment",
    "location": "Koramangala, Bengaluru",
    "category": "apartments",
    "property_subtype": "standalone_apartment",
    "city": "Bengaluru",
    "locality": "Koramangala",
    "state": "Karnataka",
    "pincode": "560095",
    "price_paise": 78_00_00_000,
    "area_sqft": 1200,
    "furnishing": "furnished",
    "construction_status": "ready",
    "rera_applicability": "applicable",
    "rera_number": "RERA/RE/2026/00099",
    "structured_details": {
        "kind": "project_residence",
        "project_name": "Sub Admin Home Residences",
        "project_area_acres": 4.5,
        "number_of_towers": 3,
        "total_units": 120,
        "configurations": ["2_bhk", "3_bhk"],
        "unit_or_plot_area_sqft": 1200,
        "price_per_sqft_paise": 650_000,
        "sale_type": "new_sale",
        "plot_facing": "not_applicable",
        "entrance_facing": "east",
        "amenities_description": _PROJECT_AMENITIES,
        "about_project": "A calm community with landscaped gardens and generous shared spaces.",
    },
}


def _submission_payload(uid: str) -> dict:
    return {
        **_SUBMISSION_PAYLOAD,
        "media": [
            {
                "kind": "image",
                "content_type": "image/jpeg",
                "object_key": (
                    f"private/property-submissions/staging/{uid}/{uuid.uuid4()}/asset.jpg"
                ),
                "position": 0,
            }
        ],
    }


@pytest.fixture
def storage_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import property_submissions, storage

    monkeypatch.setattr(storage, "head_object", lambda _key: 2048)
    monkeypatch.setattr(storage, "content_matches_declared_type", lambda _key, _ct: True)
    monkeypatch.setattr(
        property_submissions,
        "canonicalize_object",
        lambda _source, _destination, _content_type, *, max_bytes: 2048,
    )
    monkeypatch.setattr(storage, "copy_object", lambda _source, _destination, _ct: None)
    monkeypatch.setattr(storage, "delete_object", lambda _key: None)


@pytest.mark.asyncio
async def test_own_pending_property_submission_appears_in_queue(
    client: AsyncClient, storage_ok: None
) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}

    create_res = await client.post(
        "/api/v1/property-submissions", json=_submission_payload(uid), headers=headers
    )
    assert create_res.status_code == 201, create_res.text
    submission_id = create_res.json()["id"]

    res = await client.get(_URL, headers=headers)
    assert res.status_code == 200, res.text
    pending_ids = [item["id"] for item in res.json()["pending_approval"]]
    assert submission_id in pending_ids


@pytest.mark.asyncio
async def test_other_sub_admins_pending_submission_not_in_my_queue(
    client: AsyncClient, storage_ok: None
) -> None:
    """Same own-authored scoping as banners, applied to property_submissions
    (submitter_uuid, not created_by_uuid) — the other field name this
    aggregator has to get right."""
    _, owner_mobile = await full_registration(client, lines=["real_estate"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    owner_headers = {"Authorization": f"Bearer {_sub_admin_token(owner_uid)}"}

    create_res = await client.post(
        "/api/v1/property-submissions", json=_submission_payload(owner_uid), headers=owner_headers
    )
    assert create_res.status_code == 201, create_res.text
    submission_id = create_res.json()["id"]

    _, other_mobile = await full_registration(client, lines=["real_estate"])
    other_uid = await _auth_user_uuid(other_mobile)
    other_headers = {"Authorization": f"Bearer {_sub_admin_token(other_uid)}"}

    res = await client.get(_URL, headers=other_headers)
    assert res.status_code == 200, res.text
    pending_ids = [item["id"] for item in res.json()["pending_approval"]]
    assert submission_id not in pending_ids


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
    """Seeds the transactions under a DIFFERENT account than the querying
    sub_admin, so this only passes via transactions_rls's platform sub_admin/
    referral_bonus branch (e8f9a0b1c2d3) — not the unconditional owner branch,
    which would pass even if that branch were broken."""
    from app.models.transaction import Transaction, TransactionStatus, TransactionType

    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_uid = await _auth_user_uuid(owner_mobile)

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        for _ in range(7):
            db.add(
                Transaction(
                    user_uuid=uuid.UUID(owner_uid),
                    business_line="loans",
                    type=TransactionType.REFERRAL_BONUS,
                    status=TransactionStatus.PAID,
                    amount_paise=10_000,
                    currency="INR",
                    description="Referral payout",
                )
            )
        await db.commit()

    _, viewer_mobile = await full_registration(client, lines=["loans"])
    viewer_uid = await _auth_user_uuid(viewer_mobile)
    res = await client.get(
        _URL, headers={"Authorization": f"Bearer {_sub_admin_token(viewer_uid)}"}
    )
    assert res.status_code == 200, res.text
    assert len(res.json()["recent_referral_payouts"]) == 5
