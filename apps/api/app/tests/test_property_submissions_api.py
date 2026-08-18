"""property-submissions API — submit, queue, approve, reject, guards.

Mints role-specific access tokens (agent / admin) for an already-registered
auth_user: get_current_user reads the mobile from the row but takes role +
business_line + platform_scope from the JWT claims, so a client account can act
as an agent/admin for the endpoint under test.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.cache.redis_keys import RedisCache
from app.core.security import create_access_token
from app.models.audit_log import AuditAction, AuditLog
from app.models.property import Property
from app.models.property_media import PropertyMedia, PropertySubmissionMedia
from app.models.property_submission import PropertySubmission
from app.services import property_submissions as submission_service
from app.services import storage
from app.services.media_processing import MalwareDetected
from conftest import full_registration


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


def _agent_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "agent", "business_line": "real_estate", "platform_scope": "false"}
    )


def _admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "real_estate", "platform_scope": "true"}
    )


def _sub_admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "sub_admin", "business_line": "both", "platform_scope": "true"}
    )


_PAYLOAD = {
    "title": "2BHK Apartment",
    "type": "Apartment",
    "location": "Koramangala, Bengaluru",
    "category": "apartments",
    "property_subtype": "standalone_apartment",
    "city": "Bengaluru",
    "locality": "Koramangala",
    "pincode": "560095",
    "price_paise": 78_00_00_000,
    "furnishing": "furnished",
    "construction_status": "ready",
    "rera_number": "RERA/RE/2026/00099",
}


def _payload(uid: str) -> dict:
    return {
        **_PAYLOAD,
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


def _payload_with_document(uid: str) -> dict:
    payload = _payload(uid)
    payload["media"].append(
        {
            "kind": "document",
            "content_type": "application/pdf",
            "object_key": (f"private/property-submissions/staging/{uid}/{uuid.uuid4()}/asset.pdf"),
            "position": 1,
        }
    )
    return payload


def _payload_with_video(uid: str) -> dict:
    payload = _payload(uid)
    payload["media"].append(
        {
            "kind": "video",
            "content_type": "video/mp4",
            "object_key": (f"private/property-submissions/staging/{uid}/{uuid.uuid4()}/asset.mp4"),
            "position": 1,
        }
    )
    return payload


@pytest.fixture(autouse=True)
def _storage_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(storage, "head_object", lambda _key: 2048)
    monkeypatch.setattr(storage, "content_matches_declared_type", lambda _key, _ct: True)
    monkeypatch.setattr(
        submission_service,
        "canonicalize_object",
        lambda _source, _destination, _content_type, *, max_bytes: 2048,
    )
    monkeypatch.setattr(storage, "copy_object", lambda _source, _destination, _ct: None)
    monkeypatch.setattr(storage, "delete_object", lambda _key: None)


@pytest.mark.asyncio
async def test_agent_submit_creates_pending(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/property-submissions",
        json=_payload(uid),
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "pending"
    assert body["submitter_uuid"] == uid
    assert body["property_subtype"] == "standalone_apartment"
    assert body["approved_property_id"] is None
    assert len(body["media"]) == 1


@pytest.mark.asyncio
async def test_video_stays_private_pending_and_blocks_approval(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/property-submissions",
        json=_payload_with_video(uid),
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )

    assert created.status_code == 201, created.text
    video = next(item for item in created.json()["media"] if item["kind"] == "video")
    assert video["processing_status"] == "pending"
    assert video["duration_seconds"] is None

    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as session:
        with pytest.raises(IntegrityError):
            await session.execute(
                text(
                    "UPDATE property_submission_media SET processing_status = 'ready' "
                    "WHERE id = :media_id"
                ),
                {"media_id": video["id"]},
            )
            await session.commit()
        await session.rollback()

    approved = await client.post(
        f"/api/v1/property-submissions/{created.json()['id']}/approve",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert approved.status_code == 409, approved.text
    assert approved.json()["detail"] == "All media must finish processing before approval."


@pytest.mark.asyncio
async def test_video_presign_uses_twenty_megabyte_cap(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    response = await client.post(
        "/api/v1/property-submissions/media-upload-url",
        json={"kind": "video", "content_type": "video/mp4"},
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["max_bytes"] == 20 * 1024 * 1024
    assert response.json()["object_key"].endswith("/asset.mp4")


@pytest.mark.asyncio
async def test_submission_rejects_more_than_one_video(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    payload = _payload_with_video(uid)
    payload["media"].append(
        {
            "kind": "video",
            "content_type": "video/mp4",
            "object_key": (f"private/property-submissions/staging/{uid}/{uuid.uuid4()}/asset.mp4"),
            "position": 2,
        }
    )

    response = await client.post(
        "/api/v1/property-submissions",
        json=payload,
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_submission_canonicalizes_staging_upload_to_opaque_private_key(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import app.db.session as session_module

    copies: list[tuple[str, str]] = []
    monkeypatch.setattr(
        submission_service,
        "canonicalize_object",
        lambda source, destination, _ct, *, max_bytes: copies.append((source, destination)) or 2048,
    )
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    payload = _payload(uid)

    response = await client.post(
        "/api/v1/property-submissions",
        json=payload,
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )

    assert response.status_code == 201, response.text
    assert len(copies) == 1
    staging_key, canonical_key = copies[0]
    assert staging_key == payload["media"][0]["object_key"]
    assert canonical_key != staging_key
    assert f"private/property-submissions/staging/{uid}/" in staging_key
    assert f"private/property-submissions/canonical/{uid}/" in canonical_key
    assert canonical_key.endswith("/asset.jpg")
    async with session_module.AsyncSessionLocal() as session:
        stored_key = await session.scalar(
            select(PropertySubmissionMedia.object_key).where(
                PropertySubmissionMedia.submission_uuid == uuid.UUID(response.json()["id"])
            )
        )
    assert stored_key == canonical_key

    replay = _payload(uid)
    replay["media"][0]["object_key"] = canonical_key
    replay_response = await client.post(
        "/api/v1/property-submissions",
        json=replay,
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    assert replay_response.status_code == 422


@pytest.mark.asyncio
async def test_submission_malware_rejection_removes_staging_and_canonical_objects(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def malware(*_args, **_kwargs):
        raise MalwareDetected

    deleted: list[str] = []
    monkeypatch.setattr(submission_service, "canonicalize_object", malware)
    monkeypatch.setattr(storage, "delete_object", deleted.append)
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    payload = _payload(uid)

    response = await client.post(
        "/api/v1/property-submissions",
        json=payload,
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )

    assert response.status_code == 422, response.text
    assert payload["media"][0]["object_key"] in deleted
    assert len(deleted) == 2
    assert any("/canonical/" in key for key in deleted)


@pytest.mark.asyncio
async def test_client_can_submit(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    token = create_access_token(
        {"sub": uid, "role": "client", "business_line": "real_estate", "platform_scope": "false"}
    )
    res = await client.post(
        "/api/v1/property-submissions",
        json=_payload(uid),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 201, res.text
    assert res.json()["submitter_uuid"] == uid


@pytest.mark.asyncio
async def test_submit_validation_error(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    bad = {**_payload(uid), "price_paise": 0}  # gt=0 fails
    res = await client.post(
        "/api/v1/property-submissions",
        json=bad,
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_reviewer_approve_creates_property(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/property-submissions",
        json=_payload(uid),
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    sub_id = created.json()["id"]

    res = await client.post(
        f"/api/v1/property-submissions/{sub_id}/approve",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "approved"
    assert body["approved_property_id"] is not None

    # The new listing is now in the catalog.
    prop = await client.get(
        f"/api/v1/properties/{body['approved_property_id']}",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert prop.status_code == 200
    assert prop.json()["price_display"] == "₹78 L"
    assert prop.json()["property_subtype"] == "standalone_apartment"
    assert len(prop.json()["media_urls"]) == 1
    assert "/public/properties/" in prop.json()["media_urls"][0]


@pytest.mark.asyncio
async def test_reviewer_approve_preserves_legacy_image_without_managed_media(
    client: AsyncClient,
) -> None:
    import app.db.session as session_module

    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    async with session_module.AsyncSessionLocal() as session:
        submission = PropertySubmission(
            submitter_uuid=uuid.UUID(uid),
            business_line="real_estate",
            image="/illustrations/properties/plot-1.svg",
            **_PAYLOAD,
        )
        session.add(submission)
        await session.commit()
        submission_id = submission.id

    response = await client.post(
        f"/api/v1/property-submissions/{submission_id}/approve",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )

    assert response.status_code == 200, response.text
    property_response = await client.get(
        f"/api/v1/properties/{response.json()['approved_property_id']}",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert property_response.status_code == 200
    assert property_response.json()["image"] == "/illustrations/properties/plot-1.svg"
    assert property_response.json()["media_urls"] == []


@pytest.mark.asyncio
async def test_double_approve_conflicts(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/property-submissions",
        json=_payload(uid),
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    sub_id = created.json()["id"]
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}
    await client.post(f"/api/v1/property-submissions/{sub_id}/approve", headers=headers)
    second = await client.post(f"/api/v1/property-submissions/{sub_id}/approve", headers=headers)
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_reject_sets_note(client: AsyncClient) -> None:
    import app.db.session as session_module

    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/property-submissions",
        json=_payload(uid),
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    sub_id = created.json()["id"]
    res = await client.post(
        f"/api/v1/property-submissions/{sub_id}/reject",
        json={"note": "RERA number could not be verified."},
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "rejected"
    assert res.json()["review_note"] == "RERA number could not be verified."
    async with session_module.AsyncSessionLocal() as session:
        audit = await session.scalar(
            select(AuditLog).where(
                AuditLog.entity_uuid == uuid.UUID(sub_id),
                AuditLog.action == AuditAction.PROPERTY_SUBMISSION_REJECTED,
            )
        )
    assert audit is not None
    assert audit.detail == {"review_note_recorded": True, "submitter_uuid": uid}
    assert "RERA number" not in str(audit.detail)


@pytest.mark.asyncio
async def test_agent_cannot_approve(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/property-submissions",
        json=_payload(uid),
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    sub_id = created.json()["id"]
    res = await client.post(
        f"/api/v1/property-submissions/{sub_id}/approve",
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_approve_missing_is_404(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/property-submissions/00000000-0000-0000-0000-000000000000/approve",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_sub_admin_can_submit(client: AsyncClient) -> None:
    """require_re_submitter (deps.py) widens the submit gate from agent-only to
    agent OR sub_admin (SubAdmin slice 1, banners migration a4b5c6d7e8f9's PR)."""
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/property-submissions",
        json=_payload(uid),
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "pending"
    assert body["submitter_uuid"] == uid


@pytest.mark.asyncio
async def test_sub_admin_cannot_approve(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/property-submissions",
        json=_payload(uid),
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    sub_id = created.json()["id"]
    res = await client.post(
        f"/api/v1/property-submissions/{sub_id}/approve",
        headers={"Authorization": f"Bearer {_sub_admin_token(uid)}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_presign_returns_owner_bound_private_key(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/property-submissions/media-upload-url",
        json={"kind": "image", "content_type": "image/webp"},
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["object_key"].startswith(f"private/property-submissions/staging/{uid}/")
    assert body["object_key"].endswith("/asset.webp")
    assert "front" not in body["object_key"]
    assert body["max_bytes"] == 5 * 1024 * 1024
    assert body["fields"]["Content-Type"] == "image/webp"


@pytest.mark.asyncio
async def test_presign_rate_limit_fails_closed(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)

    async def over_limit(_cache: RedisCache, _key: str, _ttl: int) -> int:
        return 37

    monkeypatch.setattr(RedisCache, "incr_with_expire", over_limit)
    res = await client.post(
        "/api/v1/property-submissions/media-upload-url",
        json={"kind": "image", "content_type": "image/jpeg"},
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    assert res.status_code == 429, res.text


@pytest.mark.asyncio
async def test_submit_rejects_foreign_media_key(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    payload = _payload(uid)
    payload["media"][0]["object_key"] = (
        f"private/property-submissions/staging/{uuid.uuid4()}/{uuid.uuid4()}/asset.jpg"
    )
    res = await client.post(
        "/api/v1/property-submissions",
        json=payload,
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    assert res.status_code == 400, res.text


@pytest.mark.asyncio
async def test_submit_rejects_content_type_mismatch(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(storage, "content_matches_declared_type", lambda _key, _ct: False)
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        "/api/v1/property-submissions",
        json=_payload(uid),
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    assert res.status_code == 422, res.text


@pytest.mark.asyncio
async def test_owner_can_request_private_media_access(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(storage, "presign_preview", lambda _key: "https://storage.test/preview")
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_agent_token(uid)}"}
    created = await client.post("/api/v1/property-submissions", json=_payload(uid), headers=headers)
    body = created.json()
    res = await client.get(
        f"/api/v1/property-submissions/{body['id']}/media/{body['media'][0]['id']}/access",
        headers=headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["url"] == "https://storage.test/preview"


@pytest.mark.asyncio
async def test_private_media_access_fails_closed_when_object_changed(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_agent_token(uid)}"}
    created = await client.post("/api/v1/property-submissions", json=_payload(uid), headers=headers)
    body = created.json()
    monkeypatch.setattr(storage, "head_object", lambda _key: 4096)

    res = await client.get(
        f"/api/v1/property-submissions/{body['id']}/media/{body['media'][0]['id']}/access",
        headers=headers,
    )

    assert res.status_code == 409, res.text


@pytest.mark.asyncio
async def test_approval_revalidates_reviewer_only_document_before_copy(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/property-submissions",
        json=_payload_with_document(uid),
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    assert created.status_code == 201, created.text
    copied: list[str] = []
    monkeypatch.setattr(
        storage,
        "content_matches_declared_type",
        lambda _key, content_type: content_type != "application/pdf",
    )
    monkeypatch.setattr(
        storage,
        "copy_object",
        lambda _source, destination, _ct: copied.append(destination),
    )

    res = await client.post(
        f"/api/v1/property-submissions/{created.json()['id']}/approve",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )

    assert res.status_code == 409, res.text
    assert copied == []


@pytest.mark.asyncio
async def test_approval_cleans_unverified_public_copy_and_stays_pending(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import app.db.session as session_module

    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    created = await client.post(
        "/api/v1/property-submissions",
        json=_payload(uid),
        headers={"Authorization": f"Bearer {_agent_token(uid)}"},
    )
    assert created.status_code == 201, created.text
    copied: list[str] = []
    monkeypatch.setattr(
        storage,
        "copy_object",
        lambda _source, destination, _ct: copied.append(destination),
    )
    monkeypatch.setattr(
        storage,
        "head_object",
        lambda key: 4096 if key.startswith("public/properties/") else 2048,
    )
    deleted: list[str] = []
    monkeypatch.setattr(storage, "delete_object", deleted.append)

    response = await client.post(
        f"/api/v1/property-submissions/{created.json()['id']}/approve",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )

    assert response.status_code == 502, response.text
    assert len(copied) == 1
    assert deleted == copied
    async with session_module.AsyncSessionLocal() as session:
        submission = await session.get(PropertySubmission, uuid.UUID(created.json()["id"]))
    assert submission is not None
    assert submission.status.value == "pending"


@pytest.mark.asyncio
async def test_media_lifecycle_retains_references_and_purges_expired_objects(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import app.db.session as session_module

    _, mobile = await full_registration(client, lines=["real_estate"])
    uid = await _auth_user_uuid(mobile)
    submitter_headers = {"Authorization": f"Bearer {_agent_token(uid)}"}
    admin_headers = {"Authorization": f"Bearer {_admin_token(uid)}"}

    async def create(payload: dict) -> dict:
        response = await client.post(
            "/api/v1/property-submissions", json=payload, headers=submitter_headers
        )
        assert response.status_code == 201, response.text
        return response.json()

    pending_payload = _payload(uid)
    pending = await create(pending_payload)

    recent_rejected_payload = _payload(uid)
    recent_rejected = await create(recent_rejected_payload)
    await client.post(
        f"/api/v1/property-submissions/{recent_rejected['id']}/reject",
        json={"note": "Recent rejection"},
        headers=admin_headers,
    )

    old_rejected_payload = _payload(uid)
    old_rejected = await create(old_rejected_payload)
    await client.post(
        f"/api/v1/property-submissions/{old_rejected['id']}/reject",
        json={"note": "Old rejection"},
        headers=admin_headers,
    )

    approved_payload = _payload_with_document(uid)
    approved = await create(approved_payload)
    approved_response = await client.post(
        f"/api/v1/property-submissions/{approved['id']}/approve",
        headers=admin_headers,
    )
    assert approved_response.status_code == 200, approved_response.text

    inactive_payload = _payload(uid)
    inactive = await create(inactive_payload)
    inactive_response = await client.post(
        f"/api/v1/property-submissions/{inactive['id']}/approve",
        headers=admin_headers,
    )
    assert inactive_response.status_code == 200, inactive_response.text

    async with session_module.AsyncSessionLocal() as session:
        old_submission = await session.get(PropertySubmission, uuid.UUID(old_rejected["id"]))
        assert old_submission is not None
        old_submission.reviewed_at = datetime.now(UTC) - timedelta(days=31)
        inactive_property = await session.get(
            Property, uuid.UUID(inactive_response.json()["approved_property_id"])
        )
        assert inactive_property is not None
        inactive_property.active = False
        active_public = list(
            (
                await session.scalars(
                    select(PropertyMedia).where(
                        PropertyMedia.property_uuid
                        == uuid.UUID(approved_response.json()["approved_property_id"])
                    )
                )
            ).all()
        )
        inactive_public = list(
            (
                await session.scalars(
                    select(PropertyMedia).where(PropertyMedia.property_uuid == inactive_property.id)
                )
            ).all()
        )
        private_rows = list(
            (
                await session.scalars(
                    select(PropertySubmissionMedia)
                    .where(
                        PropertySubmissionMedia.submission_uuid.in_(
                            [
                                uuid.UUID(pending["id"]),
                                uuid.UUID(recent_rejected["id"]),
                                uuid.UUID(old_rejected["id"]),
                                uuid.UUID(approved["id"]),
                            ]
                        )
                    )
                    .order_by(
                        PropertySubmissionMedia.submission_uuid,
                        PropertySubmissionMedia.position,
                    )
                )
            ).all()
        )
        await session.commit()

    private_by_submission: dict[uuid.UUID, list[PropertySubmissionMedia]] = {}
    for asset in private_rows:
        private_by_submission.setdefault(asset.submission_uuid, []).append(asset)
    pending_private = private_by_submission[uuid.UUID(pending["id"])]
    recent_rejected_private = private_by_submission[uuid.UUID(recent_rejected["id"])]
    old_rejected_private = private_by_submission[uuid.UUID(old_rejected["id"])]
    approved_private = private_by_submission[uuid.UUID(approved["id"])]

    old_time = datetime.now(UTC) - timedelta(hours=2)
    recent_time = datetime.now(UTC) - timedelta(minutes=30)
    orphan_key = f"private/property-submissions/staging/{uid}/{uuid.uuid4()}/asset.jpg"
    recent_orphan_key = f"private/property-submissions/staging/{uid}/{uuid.uuid4()}/asset.jpg"
    private_keys = [
        pending_private[0].object_key,
        recent_rejected_private[0].object_key,
        old_rejected_private[0].object_key,
        *[asset.object_key for asset in approved_private],
        orphan_key,
    ]
    private_objects = [{"key": key, "last_modified": old_time} for key in private_keys]
    private_objects.append({"key": recent_orphan_key, "last_modified": recent_time})
    public_objects = [
        {"key": asset.object_key, "last_modified": old_time}
        for asset in [*active_public, *inactive_public]
    ]
    monkeypatch.setattr(
        storage,
        "list_objects",
        lambda prefix: private_objects if prefix.startswith("private/") else public_objects,
    )
    deleted: list[str] = []
    monkeypatch.setattr(storage, "delete_object", deleted.append)

    summary = await submission_service.purge_media_lifecycle()

    approved_image_key = next(
        asset.object_key for asset in approved_private if asset.kind == "image"
    )
    approved_document_key = next(
        asset.object_key for asset in approved_private if asset.kind == "document"
    )
    assert set(deleted) == {
        old_rejected_private[0].object_key,
        approved_image_key,
        orphan_key,
        inactive_public[0].object_key,
    }
    assert approved_document_key not in deleted
    assert active_public[0].object_key not in deleted
    assert recent_orphan_key not in deleted
    assert summary == {"scanned": len(private_objects) + len(public_objects), "deleted": 4}
