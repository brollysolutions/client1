"""Client KYC-upload against a loan application (docs/specs/client-kyc-upload.md).

Covers presign/confirm/list/delete, the object-key-claim guards (foreign
prefix, doc_type-suffix mismatch, replay), the confirm-time head_object
verification (missing object -> 422, transport failure -> 502), the
per-application document cap, the terminal-application write guard, cross-
client 404 (RLS-indistinguishable-from-missing), and the
verified-document-cannot-be-deleted guard.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text

from app.cache.redis_keys import RedisCache
from app.models.loan_document import LoanDocument
from app.services import storage
from conftest import full_registration

pytestmark = pytest.mark.asyncio


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _mock_uploads_ok(monkeypatch: pytest.MonkeyPatch, size: int = 2048) -> None:
    monkeypatch.setattr(storage, "head_object", lambda _key: size)
    # Orthogonal to size/existence — the magic-byte sniff (feature-status.md
    # §2-12) does a real ranged GET, and these tests never PUT real bytes to
    # the presigned URL, so it would 404 and mask whatever this is testing.
    monkeypatch.setattr(storage, "content_matches_declared_type", lambda _key, _ct: True)
    monkeypatch.setattr(storage, "copy_object", lambda _source, _destination, _ct: None)
    monkeypatch.setattr(storage, "delete_object", lambda _key: None)


def _mock_uploads_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(storage, "head_object", lambda _key: None)


def _mock_uploads_transport_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake(_key: str) -> int:
        raise ConnectionError("storage unreachable")

    monkeypatch.setattr(storage, "head_object", fake)


async def _make_client_with_application(client: AsyncClient) -> tuple[str, str]:
    """Registers a real client and creates a real loan application via the
    HTTP API. Returns (access_token, application_id)."""
    token, _mobile = await full_registration(client, lines=["loans"])
    res = await client.get("/api/v1/loans/loan-types", headers=_headers(token))
    assert res.status_code == 200, res.text
    loan_types = res.json()["loan_types"]
    if not loan_types:
        # Seed one directly if none exist yet in this dev/test DB.
        loan_type_id = await _seed_loan_type()
    else:
        loan_type_id = loan_types[0]["id"]

    create_res = await client.post(
        "/api/v1/loans/applications",
        headers=_headers(token),
        json={"loan_type_id": loan_type_id, "amount_requested": "100000"},
    )
    assert create_res.status_code == 201, create_res.text
    return token, create_res.json()["id"]


async def _seed_loan_type() -> str:
    import app.db.session as _session_mod
    from app.models.loan import LoanType

    async with _session_mod.AsyncSessionLocal() as db:
        loan_type = LoanType(name=f"lt_{uuid.uuid4().hex[:8]}", label="Test Loan Type")
        db.add(loan_type)
        await db.commit()
        return str(loan_type.id)


async def _presign_and_confirm(
    client: AsyncClient,
    token: str,
    application_id: str,
    *,
    doc_type: str = "aadhaar_front",
    content_type: str = "image/jpeg",
) -> dict:
    presign_res = await client.post(
        f"/api/v1/loans/applications/{application_id}/documents/presign",
        headers=_headers(token),
        json={"doc_type": doc_type, "content_type": content_type},
    )
    assert presign_res.status_code == 200, presign_res.text
    object_key = presign_res.json()["object_key"]

    confirm_res = await client.post(
        f"/api/v1/loans/applications/{application_id}/documents",
        headers=_headers(token),
        json={"doc_type": doc_type, "object_key": object_key, "content_type": content_type},
    )
    return confirm_res


async def _set_application_status(application_id: str, status: str) -> None:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(
            text("UPDATE loan_applications SET status = :s WHERE id = :id"),
            {"s": status, "id": application_id},
        )
        await db.commit()


async def _set_document_verified(document_id: str, verified: bool = True) -> None:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(
            text("UPDATE loan_documents SET verified = :v WHERE id = :id"),
            {"v": verified, "id": document_id},
        )
        await db.commit()


# ---------------------------------------------------------------------------
# Presign
# ---------------------------------------------------------------------------


async def test_presign_returns_fields_and_max_bytes(client: AsyncClient) -> None:
    token, application_id = await _make_client_with_application(client)
    res = await client.post(
        f"/api/v1/loans/applications/{application_id}/documents/presign",
        headers=_headers(token),
        json={"doc_type": "aadhaar_front", "content_type": "image/jpeg"},
    )
    assert res.status_code == 200, res.text
    assert res.headers["cache-control"] == "private, no-store"
    body = res.json()
    assert "/staging/" in body["object_key"]
    assert f"/{application_id}/" in body["object_key"]
    assert body["object_key"].endswith("/aadhaar_front.jpg")
    assert "upload_url" in body
    assert isinstance(body["fields"], dict)
    assert body["max_bytes"] == 5 * 1024 * 1024


async def test_presign_on_closed_application_conflicts(client: AsyncClient) -> None:
    token, application_id = await _make_client_with_application(client)
    await _set_application_status(application_id, "closed")
    res = await client.post(
        f"/api/v1/loans/applications/{application_id}/documents/presign",
        headers=_headers(token),
        json={"doc_type": "aadhaar_front", "content_type": "image/jpeg"},
    )
    assert res.status_code == 409, res.text


async def test_presign_rate_limit_fails_closed(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token, application_id = await _make_client_with_application(client)

    async def over_limit(_cache: RedisCache, _key: str, _ttl: int) -> int:
        return 37

    monkeypatch.setattr(RedisCache, "incr_with_expire", over_limit)
    res = await client.post(
        f"/api/v1/loans/applications/{application_id}/documents/presign",
        headers=_headers(token),
        json={"doc_type": "aadhaar_front", "content_type": "image/jpeg"},
    )
    assert res.status_code == 429, res.text


async def test_presign_on_another_clients_application_404s(client: AsyncClient) -> None:
    _owner_token, application_id = await _make_client_with_application(client)
    other_token, _mobile = await full_registration(client, lines=["loans"])
    res = await client.post(
        f"/api/v1/loans/applications/{application_id}/documents/presign",
        headers=_headers(other_token),
        json={"doc_type": "aadhaar_front", "content_type": "image/jpeg"},
    )
    assert res.status_code == 404, res.text


# ---------------------------------------------------------------------------
# Confirm — key-claim guards + head_object verification
# ---------------------------------------------------------------------------


async def test_confirm_happy_path(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _mock_uploads_ok(monkeypatch)
    copies: list[tuple[str, str]] = []
    deleted: list[str] = []
    monkeypatch.setattr(
        storage,
        "copy_object",
        lambda source, destination, _ct: copies.append((source, destination)),
    )
    monkeypatch.setattr(storage, "delete_object", deleted.append)
    token, application_id = await _make_client_with_application(client)
    res = await _presign_and_confirm(client, token, application_id)
    assert res.status_code == 201, res.text
    assert res.headers["cache-control"] == "private, no-store"
    body = res.json()
    assert body["doc_type"] == "aadhaar_front"
    assert body["verified"] is False
    assert body["review_note"] is None
    assert body["content_type"] == "image/jpeg"
    assert body["size_bytes"] == 2048
    assert body["preview_url"].startswith("http")
    assert "download_url" in body
    assert "object_key" not in body

    assert len(copies) == 1
    staging_key, canonical_key = copies[0]
    assert "/staging/" in staging_key
    assert "/canonical/" in canonical_key
    assert canonical_key.endswith("/asset.jpg")
    assert deleted == [staging_key]

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        stored_key = await db.scalar(
            select(LoanDocument.object_key).where(LoanDocument.id == uuid.UUID(body["id"]))
        )
    assert stored_key == canonical_key


async def test_confirm_pdf_has_download_without_inline_preview(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_uploads_ok(monkeypatch)
    token, application_id = await _make_client_with_application(client)
    res = await _presign_and_confirm(
        client,
        token,
        application_id,
        doc_type="bank_statement",
        content_type="application/pdf",
    )
    assert res.status_code == 201, res.text
    assert res.json()["content_type"] == "application/pdf"
    assert res.json()["preview_url"] is None
    assert res.json()["download_url"].startswith("http")


async def test_confirm_content_type_mismatch_rejected_and_deletes_object(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Closes feature-status.md §2-12: the declared content_type is signed
    into the presigned-POST policy, but nothing previously verified the
    uploaded BYTES matched it. Simulates the real-PNG-declared-as-JPEG case
    (content_matches_declared_type is the strict variant available here,
    since content_type is carried at confirm time — unlike the other two
    upload flows)."""
    from app.services import storage

    monkeypatch.setattr(storage, "head_object", lambda _key: 2048)
    monkeypatch.setattr(storage, "content_matches_declared_type", lambda _key, _ct: False)
    deleted_keys: list[str] = []
    monkeypatch.setattr(storage, "delete_object", lambda key: deleted_keys.append(key))

    token, application_id = await _make_client_with_application(client)
    res = await _presign_and_confirm(client, token, application_id)
    assert res.status_code == 422, res.text
    assert len(deleted_keys) == 1  # the mismatched object was cleaned up, not left orphaned


async def test_confirm_foreign_object_key_rejected(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_uploads_ok(monkeypatch)
    token, application_id = await _make_client_with_application(client)
    res = await client.post(
        f"/api/v1/loans/applications/{application_id}/documents",
        headers=_headers(token),
        json={
            "doc_type": "aadhaar_front",
            "object_key": f"loan-applications/{uuid.uuid4()}/{uuid.uuid4().hex}-aadhaar_front",
            "content_type": "image/jpeg",
        },
    )
    assert res.status_code == 400, res.text


async def test_confirm_doc_type_suffix_mismatch_rejected(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_uploads_ok(monkeypatch)
    token, application_id = await _make_client_with_application(client)
    presign_res = await client.post(
        f"/api/v1/loans/applications/{application_id}/documents/presign",
        headers=_headers(token),
        json={"doc_type": "aadhaar_front", "content_type": "image/jpeg"},
    )
    object_key = presign_res.json()["object_key"]
    # Confirm with a DIFFERENT doc_type than the key was presigned for.
    res = await client.post(
        f"/api/v1/loans/applications/{application_id}/documents",
        headers=_headers(token),
        json={"doc_type": "pan", "object_key": object_key, "content_type": "image/jpeg"},
    )
    assert res.status_code == 400, res.text


async def test_confirm_missing_upload_rejected(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token, application_id = await _make_client_with_application(client)
    presign_res = await client.post(
        f"/api/v1/loans/applications/{application_id}/documents/presign",
        headers=_headers(token),
        json={"doc_type": "aadhaar_front", "content_type": "image/jpeg"},
    )
    object_key = presign_res.json()["object_key"]
    _mock_uploads_missing(monkeypatch)
    res = await client.post(
        f"/api/v1/loans/applications/{application_id}/documents",
        headers=_headers(token),
        json={"doc_type": "aadhaar_front", "object_key": object_key, "content_type": "image/jpeg"},
    )
    assert res.status_code == 422, res.text


async def test_confirm_storage_transport_error_502s(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    token, application_id = await _make_client_with_application(client)
    presign_res = await client.post(
        f"/api/v1/loans/applications/{application_id}/documents/presign",
        headers=_headers(token),
        json={"doc_type": "aadhaar_front", "content_type": "image/jpeg"},
    )
    object_key = presign_res.json()["object_key"]
    _mock_uploads_transport_error(monkeypatch)
    res = await client.post(
        f"/api/v1/loans/applications/{application_id}/documents",
        headers=_headers(token),
        json={"doc_type": "aadhaar_front", "object_key": object_key, "content_type": "image/jpeg"},
    )
    assert res.status_code == 502, res.text


async def test_confirm_copy_failure_502s_without_creating_row(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(storage, "head_object", lambda _key: 2048)
    monkeypatch.setattr(storage, "content_matches_declared_type", lambda _key, _ct: True)

    def copy_fails(_source: str, _destination: str, _content_type: str) -> None:
        raise ConnectionError("copy unavailable")

    deleted: list[str] = []
    monkeypatch.setattr(storage, "copy_object", copy_fails)
    monkeypatch.setattr(storage, "delete_object", deleted.append)
    token, application_id = await _make_client_with_application(client)

    res = await _presign_and_confirm(client, token, application_id)

    assert res.status_code == 502, res.text
    assert len(deleted) == 1
    assert "/canonical/" in deleted[0]
    list_res = await client.get(
        f"/api/v1/loans/applications/{application_id}/documents",
        headers=_headers(token),
    )
    assert list_res.status_code == 200, list_res.text
    assert list_res.json()["documents"] == []


async def test_confirm_key_replay_rejected(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_uploads_ok(monkeypatch)
    token, application_id = await _make_client_with_application(client)
    presign_res = await client.post(
        f"/api/v1/loans/applications/{application_id}/documents/presign",
        headers=_headers(token),
        json={"doc_type": "aadhaar_front", "content_type": "image/jpeg"},
    )
    object_key = presign_res.json()["object_key"]
    body = {"doc_type": "aadhaar_front", "object_key": object_key, "content_type": "image/jpeg"}
    res1 = await client.post(
        f"/api/v1/loans/applications/{application_id}/documents",
        headers=_headers(token),
        json=body,
    )
    assert res1.status_code == 201, res1.text
    res2 = await client.post(
        f"/api/v1/loans/applications/{application_id}/documents",
        headers=_headers(token),
        json=body,
    )
    assert res2.status_code == 400, res2.text


async def test_concurrent_replay_copies_once_and_keeps_accepted_canonical(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_uploads_ok(monkeypatch)
    copies: list[tuple[str, str]] = []
    deleted: list[str] = []
    monkeypatch.setattr(
        storage,
        "copy_object",
        lambda source, destination, _ct: copies.append((source, destination)),
    )
    monkeypatch.setattr(storage, "delete_object", deleted.append)
    token, application_id = await _make_client_with_application(client)
    presign_res = await client.post(
        f"/api/v1/loans/applications/{application_id}/documents/presign",
        headers=_headers(token),
        json={"doc_type": "photo", "content_type": "image/jpeg"},
    )
    assert presign_res.status_code == 200, presign_res.text
    object_key = presign_res.json()["object_key"]
    payload = {"doc_type": "photo", "object_key": object_key, "content_type": "image/jpeg"}

    responses = await asyncio.gather(
        *(
            client.post(
                f"/api/v1/loans/applications/{application_id}/documents",
                headers=_headers(token),
                json=payload,
            )
            for _ in range(2)
        )
    )

    assert sorted(response.status_code for response in responses) == [201, 400]
    assert len(copies) == 1
    assert deleted == [object_key]


async def test_confirm_accepts_already_issued_legacy_presign(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_uploads_ok(monkeypatch)
    copies: list[tuple[str, str]] = []
    monkeypatch.setattr(
        storage,
        "copy_object",
        lambda source, destination, _ct: copies.append((source, destination)),
    )
    token, application_id = await _make_client_with_application(client)
    legacy_key = f"loan-applications/{application_id}/{uuid.uuid4().hex}-photo"

    res = await client.post(
        f"/api/v1/loans/applications/{application_id}/documents",
        headers=_headers(token),
        json={"doc_type": "photo", "object_key": legacy_key, "content_type": "image/jpeg"},
    )

    assert res.status_code == 201, res.text
    assert copies[0][0] == legacy_key
    assert "/canonical/" in copies[0][1]


async def test_confirm_on_closed_application_conflicts(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_uploads_ok(monkeypatch)
    token, application_id = await _make_client_with_application(client)
    presign_res = await client.post(
        f"/api/v1/loans/applications/{application_id}/documents/presign",
        headers=_headers(token),
        json={"doc_type": "aadhaar_front", "content_type": "image/jpeg"},
    )
    object_key = presign_res.json()["object_key"]
    await _set_application_status(application_id, "closed")
    res = await client.post(
        f"/api/v1/loans/applications/{application_id}/documents",
        headers=_headers(token),
        json={"doc_type": "aadhaar_front", "object_key": object_key, "content_type": "image/jpeg"},
    )
    assert res.status_code == 409, res.text


async def test_document_cap_enforced(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _mock_uploads_ok(monkeypatch)
    token, application_id = await _make_client_with_application(client)
    doc_types = [
        "aadhaar_front",
        "aadhaar_back",
        "pan",
        "salary_slip",
        "bank_statement",
        "sale_deed",
        "photo",
        "other",
        "aadhaar_front",
        "aadhaar_back",
        "pan",
    ]
    assert len(doc_types) == 11
    for doc_type in doc_types:
        res = await _presign_and_confirm(client, token, application_id, doc_type=doc_type)
        assert res.status_code == 201, res.text

    pending: list[dict[str, str]] = []
    for doc_type in ("salary_slip", "bank_statement"):
        presign_res = await client.post(
            f"/api/v1/loans/applications/{application_id}/documents/presign",
            headers=_headers(token),
            json={"doc_type": doc_type, "content_type": "image/jpeg"},
        )
        assert presign_res.status_code == 200, presign_res.text
        pending.append(
            {
                "doc_type": doc_type,
                "object_key": presign_res.json()["object_key"],
                "content_type": "image/jpeg",
            }
        )

    # With eleven existing documents, two concurrent confirms race for the
    # final slot. The application-row lock admits exactly one.
    final_responses = await asyncio.gather(
        *(
            client.post(
                f"/api/v1/loans/applications/{application_id}/documents",
                headers=_headers(token),
                json=payload,
            )
            for payload in pending
        )
    )
    assert sorted(response.status_code for response in final_responses) == [201, 409]

    list_res = await client.get(
        f"/api/v1/loans/applications/{application_id}/documents",
        headers=_headers(token),
    )
    assert len(list_res.json()["documents"]) == 12


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


async def test_list_per_application(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _mock_uploads_ok(monkeypatch)
    token, application_id = await _make_client_with_application(client)
    await _presign_and_confirm(client, token, application_id)

    res = await client.get(
        f"/api/v1/loans/applications/{application_id}/documents", headers=_headers(token)
    )
    assert res.status_code == 200, res.text
    assert res.headers["cache-control"] == "private, no-store"
    assert len(res.json()["documents"]) == 1


async def test_list_own_documents_across_applications_scoped_to_caller(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_uploads_ok(monkeypatch)
    token_a, application_a = await _make_client_with_application(client)
    await _presign_and_confirm(client, token_a, application_a)

    token_b, application_b = await _make_client_with_application(client)
    await _presign_and_confirm(client, token_b, application_b)

    res_a = await client.get("/api/v1/loans/documents", headers=_headers(token_a))
    assert res_a.status_code == 200, res_a.text
    assert res_a.headers["cache-control"] == "private, no-store"
    ids_a = {d["loan_application_uuid"] for d in res_a.json()["documents"]}
    assert application_a in ids_a
    assert application_b not in ids_a


async def test_orphan_sweep_covers_both_layouts_and_keeps_referenced_canonical(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services import loan_documents

    _mock_uploads_ok(monkeypatch)
    copies: list[tuple[str, str]] = []
    monkeypatch.setattr(
        storage,
        "copy_object",
        lambda source, destination, _ct: copies.append((source, destination)),
    )
    token, application_id = await _make_client_with_application(client)
    confirmed = await _presign_and_confirm(client, token, application_id)
    assert confirmed.status_code == 201, confirmed.text
    canonical_key = copies[0][1]

    old = datetime.now(UTC) - timedelta(hours=2)
    fresh = datetime.now(UTC) - timedelta(minutes=5)
    legacy_orphan = f"loan-applications/{application_id}/{uuid.uuid4().hex}-other"
    staging_fresh = copies[0][0]

    def list_objects(prefix: str) -> list[dict]:
        if prefix == "loan-applications/":
            return [{"key": legacy_orphan, "last_modified": old}]
        return [
            {"key": canonical_key, "last_modified": old},
            {"key": staging_fresh, "last_modified": fresh},
        ]

    deleted: list[str] = []
    monkeypatch.setattr(storage, "list_objects", list_objects)
    monkeypatch.setattr(storage, "delete_object", deleted.append)

    summary = await loan_documents.purge_orphaned_uploads()

    assert summary == {"scanned": 3, "deleted": 1}
    assert deleted == [legacy_orphan]


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


async def test_delete_own_document(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _mock_uploads_ok(monkeypatch)
    token, application_id = await _make_client_with_application(client)
    confirm_res = await _presign_and_confirm(client, token, application_id)
    document_id = confirm_res.json()["id"]

    delete_res = await client.delete(
        f"/api/v1/loans/applications/{application_id}/documents/{document_id}",
        headers=_headers(token),
    )
    assert delete_res.status_code == 204, delete_res.text

    list_res = await client.get(
        f"/api/v1/loans/applications/{application_id}/documents", headers=_headers(token)
    )
    assert list_res.json()["documents"] == []


async def test_delete_verified_document_conflicts(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_uploads_ok(monkeypatch)
    token, application_id = await _make_client_with_application(client)
    confirm_res = await _presign_and_confirm(client, token, application_id)
    document_id = confirm_res.json()["id"]

    await _set_document_verified(document_id, verified=True)

    delete_res = await client.delete(
        f"/api/v1/loans/applications/{application_id}/documents/{document_id}",
        headers=_headers(token),
    )
    assert delete_res.status_code == 409, delete_res.text
