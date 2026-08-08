"""banners API — create, submit, approve, reject, guards.

Mints role-specific access tokens (sub_admin / admin) for an already-registered
auth_user: get_current_user reads the mobile from the row but takes role +
business_line + platform_scope from the JWT claims, so a client account can act
as a sub_admin/admin for the endpoint under test. Mirrors
test_property_submissions_api.py.
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
    "banner_type": "default",
    "title": "Diwali Loan Offer",
    "audience_rules": {},
    "priority": 1,
}


@pytest.mark.asyncio
async def test_sub_admin_create_starts_draft(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/banners",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "draft"
    assert body["created_by_uuid"] == uid
    assert body["approved_by_uuid"] is None


@pytest.mark.asyncio
async def test_client_cannot_create(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    token = create_access_token(
        {"sub": uid, "role": "client", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.post(
        "/api/v1/banners",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_create_validation_error(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    bad = {**_PAYLOAD, "title": ""}  # min_length=1 fails
    res = await client.post(
        "/api/v1/banners",
        json=bad,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_personalized_banner_requires_typed_audience(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}

    missing = await client.post(
        "/api/v1/banners",
        json={**_PAYLOAD, "banner_type": "personalized", "audience_rules": {}},
        headers=headers,
    )
    assert missing.status_code == 422

    targeted = await client.post(
        "/api/v1/banners",
        json={
            **_PAYLOAD,
            "banner_type": "personalized",
            "audience_rules": {
                "version": 1,
                "user_types": ["client"],
                "client_journey_stages": ["not_started"],
            },
        },
        headers=headers,
    )
    assert targeted.status_code == 201, targeted.text
    assert targeted.json()["audience_rules"]["user_types"] == ["client"]


@pytest.mark.asyncio
async def test_default_banner_rejects_targeting_rules(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    response = await client.post(
        "/api/v1/banners",
        json={**_PAYLOAD, "audience_rules": {"version": 1, "user_types": ["client"]}},
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_submit_moves_to_pending_approval(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/banners",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    banner_id = created.json()["id"]
    res = await client.post(
        f"/api/v1/banners/{banner_id}/submit",
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "pending_approval"


@pytest.mark.asyncio
async def test_sub_admin_cannot_approve_own_banner(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/banners",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    banner_id = created.json()["id"]
    await client.post(
        f"/api/v1/banners/{banner_id}/submit",
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    res = await client.post(
        f"/api/v1/banners/{banner_id}/approve",
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_approve(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/banners",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    banner_id = created.json()["id"]
    await client.post(
        f"/api/v1/banners/{banner_id}/submit",
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    res = await client.post(
        f"/api/v1/banners/{banner_id}/approve",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "approved"
    assert body["approved_by_uuid"] == uid


@pytest.mark.asyncio
async def test_admin_cannot_patch_a_banner(client: AsyncClient) -> None:
    """PATCH is a sub_admin-only create-time-editing action (require_sub_admin);
    Admin's role in this flow is approve/reject only, never field edits."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/banners",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    banner_id = created.json()["id"]
    res = await client.patch(
        f"/api/v1/banners/{banner_id}",
        json={"title": "Admin edit attempt"},
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_submit_an_already_approved_banner_conflicts(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/banners",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    banner_id = created.json()["id"]
    sub_admin_headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    await client.post(f"/api/v1/banners/{banner_id}/submit", headers=sub_admin_headers)
    await client.post(
        f"/api/v1/banners/{banner_id}/approve",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    res = await client.post(f"/api/v1/banners/{banner_id}/submit", headers=sub_admin_headers)
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_double_approve_conflicts(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/banners",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    banner_id = created.json()["id"]
    await client.post(
        f"/api/v1/banners/{banner_id}/submit",
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}
    await client.post(f"/api/v1/banners/{banner_id}/approve", headers=headers)
    second = await client.post(f"/api/v1/banners/{banner_id}/approve", headers=headers)
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_reject_sets_note(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/banners",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    banner_id = created.json()["id"]
    await client.post(
        f"/api/v1/banners/{banner_id}/submit",
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    res = await client.post(
        f"/api/v1/banners/{banner_id}/reject",
        json={"note": "Image asset missing."},
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "rejected"
    assert res.json()["review_note"] == "Image asset missing."


@pytest.mark.asyncio
async def test_reject_then_resubmit(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/banners",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    banner_id = created.json()["id"]
    sub_admin_headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    await client.post(f"/api/v1/banners/{banner_id}/submit", headers=sub_admin_headers)
    await client.post(
        f"/api/v1/banners/{banner_id}/reject",
        json={"note": "Fix the deep link."},
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    edited = await client.patch(
        f"/api/v1/banners/{banner_id}",
        json={"deep_link": "https://example.com/loans"},
        headers=sub_admin_headers,
    )
    assert edited.status_code == 200, edited.text
    resubmit = await client.post(f"/api/v1/banners/{banner_id}/submit", headers=sub_admin_headers)
    assert resubmit.status_code == 200
    assert resubmit.json()["status"] == "pending_approval"


@pytest.mark.asyncio
async def test_edit_while_pending_approval_conflicts(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/banners",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    banner_id = created.json()["id"]
    sub_admin_headers = {"Authorization": f"Bearer {_sub_admin_token(uid)}"}
    await client.post(f"/api/v1/banners/{banner_id}/submit", headers=sub_admin_headers)
    res = await client.patch(
        f"/api/v1/banners/{banner_id}",
        json={"title": "Edited while pending"},
        headers=sub_admin_headers,
    )
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_approve_missing_is_404(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/banners/00000000-0000-0000-0000-000000000000/approve",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_other_sub_admin_cannot_edit_or_submit(client: AsyncClient) -> None:
    """Shared visibility (any sub_admin sees every banner) is not shared write
    access — edit/submit stays owner-scoped (banners_update RLS policy)."""
    _, owner_mobile = await full_registration(client, lines=["loans"])
    owner_uid = await _auth_user_uuid(owner_mobile)
    created = await client.post(
        "/api/v1/banners",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_sub_admin_token(owner_uid)}"},
    )
    banner_id = created.json()["id"]

    _, other_mobile = await full_registration(client, lines=["loans"])
    other_uid = await _auth_user_uuid(other_mobile)
    other_headers = {"Authorization": f"Bearer {_sub_admin_token(other_uid)}"}

    edit_res = await client.patch(
        f"/api/v1/banners/{banner_id}",
        json={"title": "Hijacked"},
        headers=other_headers,
    )
    assert edit_res.status_code == 403

    submit_res = await client.post(f"/api/v1/banners/{banner_id}/submit", headers=other_headers)
    assert submit_res.status_code == 403


@pytest.mark.asyncio
async def test_non_sub_admin_non_admin_sees_empty_list(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    await client.post(
        "/api/v1/banners",
        json=_PAYLOAD,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    token = create_access_token(
        {"sub": uid, "role": "telecaller", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.get(
        "/api/v1/banners",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert res.json()["banners"] == []


@pytest.mark.asyncio
async def test_create_and_patch_carry_subtitle_and_cta_label(client: AsyncClient) -> None:
    """subtitle/cta_label (public-banner-serving PR B) round-trip through create and patch,
    same as every other free-text field on this schema."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    payload = {**_PAYLOAD, "subtitle": "Limited period offer", "cta_label": "Apply now"}
    created = await client.post(
        "/api/v1/banners",
        json=payload,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["subtitle"] == "Limited period offer"
    assert body["cta_label"] == "Apply now"

    banner_id = body["id"]
    patched = await client.patch(
        f"/api/v1/banners/{banner_id}",
        json={"cta_label": "Get started"},
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["cta_label"] == "Get started"
    assert patched.json()["subtitle"] == "Limited period offer"


@pytest.mark.asyncio
async def test_image_upload_url_returns_conforming_key(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/banners/image-upload-url",
        json={"content_type": "image/jpeg", "filename": "diwali-hero.jpg"},
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["object_key"].startswith("public/banners/")
    assert body["object_key"].endswith("diwali-hero.jpg")
    assert body["upload_url"].startswith("http")
    assert body["fields"]["key"] == body["object_key"]
    assert body["max_bytes"] == 2 * 1024 * 1024


@pytest.mark.asyncio
async def test_image_upload_url_rejects_unsupported_content_type(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/banners/image-upload-url",
        # image/svg+xml is deliberately not in the schema's Literal at all --
        # this is caught by Pydantic (422), not the service's UnsupportedImageType
        # branch (400). Both paths reject it; this asserts the 422 boundary.
        json={"content_type": "image/svg+xml", "filename": "logo.svg"},
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_image_upload_url_requires_sub_admin(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    token = create_access_token(
        {"sub": uid, "role": "client", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.post(
        "/api/v1/banners/image-upload-url",
        json={"content_type": "image/jpeg", "filename": "hero.jpg"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_create_accepts_a_conforming_image_key(client: AsyncClient) -> None:
    payload = {
        **_PAYLOAD,
        "image_key": "public/banners/11111111-1111-1111-1111-111111111111/hero.jpg",
    }
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/banners",
        json=payload,
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 201, res.text
    assert res.json()["image_key"] == payload["image_key"]


@pytest.mark.asyncio
async def test_create_rejects_a_non_conforming_image_key(client: AsyncClient) -> None:
    """The write-side half of the public/ security boundary: a free-text or
    mistyped image_key (or one pointing at a different, non-public prefix
    entirely) must never be accepted -- see schemas/banners.py's
    _IMAGE_KEY_PATTERN and services/storage.py::public_asset_url."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    for bad_key in [
        "agent-applications/abc-123/deadbeef-photo",  # a real KYC key shape
        "public/banners/not-a-uuid/hero.jpg",
        "public/banners/11111111-1111-1111-1111-111111111111/../evil.jpg",
        "public/banners/11111111-1111-1111-1111-111111111111/sub/hero.jpg",
    ]:
        res = await client.post(
            "/api/v1/banners",
            json={**_PAYLOAD, "image_key": bad_key},
            headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
        )
        assert res.status_code == 422, f"expected 422 for {bad_key!r}, got {res.status_code}"
