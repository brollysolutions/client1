"""offers API — authoring, Admin approval, lifecycle, and guards.

Mints role-specific access tokens (sub_admin / admin) for an already-registered
auth_user: get_current_user reads the mobile from the row but takes role +
business_line + platform_scope from the JWT claims, so a client account can act
as a sub_admin/admin for the endpoint under test. Mirrors test_banners_api.py.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from conftest import full_registration


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


def _admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "both", "platform_scope": "true"}
    )


_PAYLOAD = {
    "business_line": "loans",
    "title": "Diwali Cashback Offer",
    "discount_type": "percentage",
    "discount_value": "10",
    "code": "SAVE10",
    "partner_name": "Example Partner",
    "redemption_url": "https://partner.example/checkout",
    "terms_summary": "Valid once per customer while campaign inventory lasts.",
    "image_key": "public/banners/11111111-1111-1111-1111-111111111111/offer.webp",
    "audience_rules": {"version": 1, "user_types": ["client"]},
}


async def _submit_and_approve(
    client: AsyncClient, offer_id: str, owner_headers: dict[str, str]
) -> None:
    submitted = await client.post(f"/api/v1/offers/{offer_id}/submit", headers=owner_headers)
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["status"] == "pending_approval"
    _, admin_mobile = await full_registration(client, lines=["loans"])
    admin_uid = await _auth_user_uuid(admin_mobile)
    approved = await client.post(
        f"/api/v1/offers/{offer_id}/approve",
        headers={"Authorization": f"Bearer {_admin_token(admin_uid)}"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"


@pytest.mark.asyncio
async def test_sub_admin_create_starts_draft(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/offers",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "draft"
    assert body["created_by_uuid"] == uid


@pytest.mark.asyncio
async def test_client_cannot_create(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    token = create_access_token(
        {"sub": uid, "role": "client", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.post(
        "/api/v1/offers",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_create_percentage_over_100_is_validation_error(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    bad = {**_PAYLOAD, "discount_value": "150"}
    res = await client.post(
        "/api/v1/offers",
        json=bad,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_create_negative_discount_is_validation_error(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    bad = {**_PAYLOAD, "discount_value": "-5"}
    res = await client.post(
        "/api/v1/offers",
        json=bad,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_create_rejects_blank_title(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/offers",
        json={**_PAYLOAD, "title": "   "},
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_create_targeted_offer_persists_closed_rules_and_priority(
    client: AsyncClient,
) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    response = await client.post(
        "/api/v1/offers",
        json={
            **_PAYLOAD,
            "priority": 12,
            "audience_rules": {
                "version": 1,
                "user_types": ["client"],
                "client_journey_stages": ["not_started"],
            },
        },
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )

    assert response.status_code == 201, response.text
    assert response.json()["priority"] == 12
    assert response.json()["audience_rules"]["client_journey_stages"] == ["not_started"]


@pytest.mark.asyncio
async def test_offer_accepts_agent_targeting(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    response = await client.post(
        "/api/v1/offers",
        json={
            **_PAYLOAD,
            "audience_rules": {
                "version": 1,
                "user_types": ["agent"],
                "agent_signals": ["no_leads"],
            },
        },
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )

    assert response.status_code == 201, response.text


@pytest.mark.asyncio
async def test_schedule_then_activate_then_archive(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    created = await client.post("/api/v1/offers", json=_PAYLOAD, headers=headers)
    offer_id = created.json()["id"]
    await _submit_and_approve(client, offer_id, headers)

    scheduled = await client.post(f"/api/v1/offers/{offer_id}/schedule", headers=headers)
    assert scheduled.status_code == 200, scheduled.text
    assert scheduled.json()["status"] == "scheduled"

    activated = await client.post(f"/api/v1/offers/{offer_id}/activate", headers=headers)
    assert activated.status_code == 200, activated.text
    assert activated.json()["status"] == "active"

    archived = await client.post(f"/api/v1/offers/{offer_id}/archive", headers=headers)
    assert archived.status_code == 200, archived.text
    assert archived.json()["status"] == "archived"


@pytest.mark.asyncio
async def test_activate_from_draft_is_illegal_transition(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    created = await client.post("/api/v1/offers", json=_PAYLOAD, headers=headers)
    offer_id = created.json()["id"]

    res = await client.post(f"/api/v1/offers/{offer_id}/activate", headers=headers)
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_edit_while_active_conflicts(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    created = await client.post("/api/v1/offers", json=_PAYLOAD, headers=headers)
    offer_id = created.json()["id"]
    await _submit_and_approve(client, offer_id, headers)
    await client.post(f"/api/v1/offers/{offer_id}/activate", headers=headers)

    res = await client.patch(
        f"/api/v1/offers/{offer_id}",
        json={"title": "Edited while active"},
        headers=headers,
    )
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_edit_while_draft_succeeds(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    created = await client.post("/api/v1/offers", json=_PAYLOAD, headers=headers)
    offer_id = created.json()["id"]

    res = await client.patch(
        f"/api/v1/offers/{offer_id}",
        json={"title": "Edited while draft"},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["title"] == "Edited while draft"


@pytest.mark.asyncio
async def test_patch_rejects_null_for_non_nullable_fields(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    created = await client.post("/api/v1/offers", json=_PAYLOAD, headers=headers)
    offer_id = created.json()["id"]

    for field in ("title", "discount_type", "discount_value", "audience_rules", "priority"):
        response = await client.patch(
            f"/api/v1/offers/{offer_id}",
            json={field: None},
            headers=headers,
        )
        assert response.status_code == 422, f"{field} accepted explicit null: {response.text}"


@pytest.mark.asyncio
async def test_rejected_offer_can_fix_full_campaign_and_resubmit(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    owner_uid = await _auth_user_uuid(mobile)
    owner_headers = {"Authorization": f"Bearer {_sub_admin_token(owner_uid)}"}
    created = await client.post("/api/v1/offers", json=_PAYLOAD, headers=owner_headers)
    offer_id = created.json()["id"]
    submitted = await client.post(f"/api/v1/offers/{offer_id}/submit", headers=owner_headers)
    assert submitted.status_code == 200, submitted.text

    _, admin_mobile = await full_registration(client, lines=["loans"])
    admin_uid = await _auth_user_uuid(admin_mobile)
    admin_headers = {"Authorization": f"Bearer {_admin_token(admin_uid)}"}
    rejected = await client.post(
        f"/api/v1/offers/{offer_id}/reject",
        json={"note": "Replace the artwork and target the staff dashboard."},
        headers=admin_headers,
    )
    assert rejected.status_code == 200, rejected.text

    updated = await client.patch(
        f"/api/v1/offers/{offer_id}",
        json={
            "discount_type": "flat",
            "discount_value": "250",
            "image_key": ("public/banners/22222222-2222-2222-2222-222222222222/revised.webp"),
            "audience_rules": {
                "version": 1,
                "user_types": ["employee", "telecaller"],
            },
            "priority": 20,
        },
        headers=owner_headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["status"] == "rejected"
    assert updated.json()["audience_rules"]["user_types"] == ["employee", "telecaller"]

    resubmitted = await client.post(f"/api/v1/offers/{offer_id}/submit", headers=owner_headers)
    assert resubmitted.status_code == 200, resubmitted.text
    assert resubmitted.json()["status"] == "pending_approval"


@pytest.mark.asyncio
async def test_partial_patch_cannot_bypass_percentage_cap(client: AsyncClient) -> None:
    """OfferUpdate's validator only sees fields in the request, so a bare
    discount_value patch can't check itself against the existing (unsent)
    discount_type — the route re-validates the merged row instead."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    created = await client.post("/api/v1/offers", json=_PAYLOAD, headers=headers)
    offer_id = created.json()["id"]

    res = await client.patch(
        f"/api/v1/offers/{offer_id}",
        json={"discount_value": "500"},
        headers=headers,
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_schedule_then_archive_directly_without_activating(client: AsyncClient) -> None:
    """scheduled -> archived is a legal cancel-in-place edge, skipping active."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    created = await client.post("/api/v1/offers", json=_PAYLOAD, headers=headers)
    offer_id = created.json()["id"]
    await _submit_and_approve(client, offer_id, headers)

    scheduled = await client.post(f"/api/v1/offers/{offer_id}/schedule", headers=headers)
    assert scheduled.status_code == 200, scheduled.text

    archived = await client.post(f"/api/v1/offers/{offer_id}/archive", headers=headers)
    assert archived.status_code == 200, archived.text
    assert archived.json()["status"] == "archived"


@pytest.mark.asyncio
async def test_platform_admin_cannot_create_offer(client: AsyncClient) -> None:
    """Admin gets read-only oversight — no create/action write path exists."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/offers",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_platform_admin_can_approve_a_sub_admins_offer(client: AsyncClient) -> None:
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    created = await client.post(
        "/api/v1/offers",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_sub_admin_token(owner_uid)}"},
    )
    offer_id = created.json()["id"]
    submitted = await client.post(
        f"/api/v1/offers/{offer_id}/submit",
        headers={"Authorization": f"Bearer {_sub_admin_token(owner_uid)}"},
    )
    assert submitted.status_code == 200, submitted.text
    _, admin_mobile = await full_registration(client, lines=["loans"])
    admin_uid = await _auth_user_uuid(admin_mobile)
    res = await client.post(
        f"/api/v1/offers/{offer_id}/approve",
        headers={"Authorization": f"Bearer {_admin_token(admin_uid)}"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "approved"


@pytest.mark.asyncio
async def test_schedule_missing_is_404(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/offers/00000000-0000-0000-0000-000000000000/schedule",
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_other_sub_admin_can_edit_and_advance_shared_offer(client: AsyncClient) -> None:
    """The Sub Admin team may continue another team member's editable offer."""
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    created = await client.post(
        "/api/v1/offers",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_sub_admin_token(owner_uid)}"},
    )
    offer_id = created.json()["id"]

    _, other_mobile = await full_registration(client, lines=["loans"])
    other_uid = await _auth_user_uuid(other_mobile)
    other_headers = {"Authorization": f"Bearer {_sub_admin_token(other_uid)}"}

    edit_res = await client.patch(
        f"/api/v1/offers/{offer_id}",
        json={"title": "Hijacked"},
        headers=other_headers,
    )
    assert edit_res.status_code == 200, edit_res.text
    assert edit_res.json()["title"] == "Hijacked"

    submit_res = await client.post(f"/api/v1/offers/{offer_id}/submit", headers=other_headers)
    assert submit_res.status_code == 200, submit_res.text
    assert submit_res.json()["status"] == "pending_approval"


@pytest.mark.asyncio
async def test_offer_patch_rejects_a_stale_team_edit(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    created = await client.post("/api/v1/offers", json=_PAYLOAD, headers=headers)
    assert created.status_code == 201, created.text
    offer = created.json()

    first = await client.patch(
        f"/api/v1/offers/{offer['id']}",
        json={"title": "First team edit", "expected_version": offer["version"]},
        headers=headers,
    )
    assert first.status_code == 200, first.text
    assert first.json()["version"] == offer["version"] + 1

    stale = await client.patch(
        f"/api/v1/offers/{offer['id']}",
        json={"title": "Stale overwrite", "expected_version": offer["version"]},
        headers=headers,
    )
    assert stale.status_code == 409


@pytest.mark.asyncio
async def test_admin_soft_removes_offer_and_it_leaves_queue(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    sub_headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    admin_headers = {"Authorization": f"Bearer {_admin_token(uid)}"}
    created = await client.post("/api/v1/offers", json=_PAYLOAD, headers=sub_headers)
    offer_id = created.json()["id"]
    await client.post(f"/api/v1/offers/{offer_id}/submit", headers=sub_headers)

    blank_reason = await client.post(
        f"/api/v1/offers/{offer_id}/remove",
        json={"note": "   "},
        headers=admin_headers,
    )
    assert blank_reason.status_code == 422

    removed = await client.post(
        f"/api/v1/offers/{offer_id}/remove",
        json={"note": "Partner withdrew the campaign."},
        headers=admin_headers,
    )
    assert removed.status_code == 200, removed.text
    assert removed.json()["removed_at"] is not None
    assert removed.json()["removal_reason"] == "Partner withdrew the campaign."

    queue = await client.get("/api/v1/offers", headers=admin_headers)
    assert offer_id not in {item["id"] for item in queue.json()["offers"]}
    notifications = await client.get("/api/v1/notifications", headers=sub_headers)
    assert any(
        item["type"] == "campaign_removed" and item["href"] == "/dashboard/campaigns?type=offers"
        for item in notifications.json()["notifications"]
    )


@pytest.mark.asyncio
async def test_non_sub_admin_non_admin_sees_empty_list(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    await client.post(
        "/api/v1/offers",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    token = create_access_token(
        {"sub": uid, "role": "telecaller", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.get(
        "/api/v1/offers",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert res.json()["offers"] == []
