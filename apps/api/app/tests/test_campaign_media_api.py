"""Campaign Media Library role, upload, metadata, and usage contracts."""

from __future__ import annotations

from io import BytesIO

import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import text

from app.core.security import create_access_token
from conftest import full_registration


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("SELECT id FROM auth_users WHERE mobile = :mobile"), {"mobile": mobile}
            )
        ).fetchone()
        return str(row[0])


def _token(uid: str, role: str) -> str:
    return create_access_token(
        {"sub": uid, "role": role, "business_line": "both", "platform_scope": "true"}
    )


@pytest.mark.asyncio
async def test_sub_admin_uploads_reusable_media_and_admin_has_no_library_access(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services import campaign_media, storage

    buffer = BytesIO()
    Image.new("RGB", (1200, 600), "#17375e").save(buffer, format="WEBP")
    image_bytes = buffer.getvalue()
    monkeypatch.setattr(
        campaign_media.media_processing,
        "canonicalize_object",
        lambda _source, _destination, _content_type, *, max_bytes: len(image_bytes),
    )
    monkeypatch.setattr(storage, "read_object_bytes", lambda _key, *, max_bytes: image_bytes)
    monkeypatch.setattr(storage, "delete_object", lambda _key: None)

    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    sub_headers = {"Authorization": f"Bearer {_token(uid, 'sub_admin')}"}
    admin_headers = {"Authorization": f"Bearer {_token(uid, 'admin')}"}

    upload = await client.post(
        "/api/v1/campaign-media/image-upload-url",
        json={"content_type": "image/webp", "filename": "loan-progress.webp"},
        headers=sub_headers,
    )
    assert upload.status_code == 200, upload.text
    assert upload.json()["object_key"].startswith("private/campaign-media/staging/")

    denied = await client.post(
        "/api/v1/campaign-media/image-upload-url",
        json={"content_type": "image/webp", "filename": "admin-edit.webp"},
        headers=admin_headers,
    )
    assert denied.status_code == 403

    created = await client.post(
        "/api/v1/campaign-media",
        json={
            "business_line": "loans",
            "usage_type": "campaign",
            "title": "Loan journey",
            "alt_text": "A family reviewing a clear loan journey",
            "tags": ["Loans", "Client"],
            "object_key": upload.json()["object_key"],
            "content_type": "image/webp",
            "source_reference": "Dhanadhara starter collection",
        },
        headers=sub_headers,
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["width"] == 1200
    assert body["height"] == 600
    assert body["usage_count"] == 0
    assert body["tags"] == ["loans", "client"]

    patched = await client.patch(
        f"/api/v1/campaign-media/{body['id']}",
        json={
            "title": "Loan journey, refreshed",
            "alt_text": "A family reviewing the refreshed loan journey",
            "tags": ["Journey", "Client"],
            "source_reference": "Commissioned campaign artwork",
        },
        headers=sub_headers,
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["title"] == "Loan journey, refreshed"
    assert patched.json()["tags"] == ["journey", "client"]
    assert patched.json()["source_reference"] == "Commissioned campaign artwork"

    offer = await client.post(
        "/api/v1/offers",
        json={
            "business_line": "loans",
            "title": "Reusable artwork offer",
            "discount_type": "percentage",
            "discount_value": "10",
            "code": "MEDIA10",
            "partner_name": "Example Partner",
            "redemption_url": "https://partner.example/checkout",
            "terms_summary": "Valid once per customer while campaign inventory lasts.",
            "media_asset_id": body["id"],
            "audience_rules": {"version": 1, "user_types": ["client"]},
        },
        headers=sub_headers,
    )
    assert offer.status_code == 201, offer.text

    archived = await client.patch(
        f"/api/v1/campaign-media/{body['id']}", json={"active": False}, headers=sub_headers
    )
    assert archived.status_code == 200, archived.text
    assert archived.json()["usage_count"] == 1

    # Archiving stops new selections, but it must not block an unrelated edit
    # to a draft that already retains this immutable media reference.
    offer_edit = await client.patch(
        f"/api/v1/offers/{offer.json()['id']}",
        json={"title": "Offer copy corrected", "expected_version": offer.json()["version"]},
        headers=sub_headers,
    )
    assert offer_edit.status_code == 200, offer_edit.text
    assert offer_edit.json()["media_asset_id"] == body["id"]

    sub_admin_list = await client.get("/api/v1/campaign-media", headers=sub_headers)
    assert sub_admin_list.status_code == 200, sub_admin_list.text
    assert body["id"] in {item["id"] for item in sub_admin_list.json()["assets"]}

    admin_list = await client.get("/api/v1/campaign-media", headers=admin_headers)
    assert admin_list.status_code == 403


@pytest.mark.asyncio
async def test_media_metadata_patch_rejects_null_and_oversized_tags(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_token(uid, 'sub_admin')}"}

    missing = "00000000-0000-0000-0000-000000000001"
    assert (
        await client.patch(
            f"/api/v1/campaign-media/{missing}", json={"title": None}, headers=headers
        )
    ).status_code == 422
    assert (
        await client.patch(
            f"/api/v1/campaign-media/{missing}",
            json={"tags": ["x" * 41]},
            headers=headers,
        )
    ).status_code == 422
    assert (
        await client.patch(
            f"/api/v1/campaign-media/{missing}", json={"active": None}, headers=headers
        )
    ).status_code == 422


@pytest.mark.asyncio
async def test_non_campaign_role_cannot_read_media_library(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    client_headers = {"Authorization": f"Bearer {_token(uid, 'client')}"}
    response = await client.get("/api/v1/campaign-media", headers=client_headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_failed_media_transaction_removes_untracked_public_object(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services import campaign_media, storage

    buffer = BytesIO()
    Image.new("RGB", (1200, 600), "#17375e").save(buffer, format="WEBP")
    image_bytes = buffer.getvalue()
    deleted: list[str] = []

    monkeypatch.setattr(
        campaign_media.media_processing,
        "canonicalize_object",
        lambda _source, _destination, _content_type, *, max_bytes: len(image_bytes),
    )
    monkeypatch.setattr(storage, "read_object_bytes", lambda _key, *, max_bytes: image_bytes)
    monkeypatch.setattr(storage, "delete_object", deleted.append)

    async def fail_audit(*_args, **_kwargs) -> None:
        raise RuntimeError("simulated audit transaction failure")

    monkeypatch.setattr(campaign_media, "record_audit", fail_audit)

    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_token(uid, 'sub_admin')}"}
    staging_key = "private/campaign-media/staging/11111111-1111-1111-1111-111111111111/fail.webp"

    with pytest.raises(RuntimeError, match="simulated audit transaction failure"):
        await client.post(
            "/api/v1/campaign-media",
            json={
                "business_line": "loans",
                "usage_type": "campaign",
                "title": "Uncommitted artwork",
                "alt_text": "Artwork that must not remain public",
                "object_key": staging_key,
                "content_type": "image/webp",
            },
            headers=headers,
        )

    assert staging_key in deleted
    assert any(key.startswith("public/campaign-media/") for key in deleted)
