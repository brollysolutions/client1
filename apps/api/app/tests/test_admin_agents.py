"""Admin agent-application approval queue API.

The public submit path (test_agent_application_intake.py) now feeds this
queue for real; these tests still insert AgentApplication rows directly
(mirroring app/scripts/seed_agent_applications.py) since they're exercising
the Admin-side approve/reject/detail surface in isolation, not the intake flow.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from conftest import full_registration, unique_email, unique_mobile


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


async def _user_email(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT email FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        return str(row[0])


async def _create_pending_application(
    mobile: str | None = None,
    applicant_auth_user_uuid: str | None = None,
    email: str | None = None,
    with_documents: bool = False,
) -> str:
    import app.db.session as session_mod
    from app.models.profile import AgentApplication, SubmissionStatus

    async with session_mod.AsyncSessionLocal() as db:
        application = AgentApplication(
            applicant_auth_user_uuid=applicant_auth_user_uuid,
            first_name="Ravi",
            last_name="Kumar",
            mobile=mobile,
            email=email,
            business_line="real_estate",
            rera_code="RERA/AG/2026/00099",
            status=SubmissionStatus.PENDING,
            aadhaar_ref="agent-applications/abc/def-aadhaar_front" if with_documents else None,
            aadhaar_back_ref="agent-applications/abc/def-aadhaar_back" if with_documents else None,
            pan_ref="agent-applications/abc/def-pan" if with_documents else None,
            photo_ref="agent-applications/abc/def-photo" if with_documents else None,
        )
        db.add(application)
        await db.commit()
        await db.refresh(application)
        return str(application.id)


def _admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "", "platform_scope": "true"}
    )


def _sub_admin_line_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "sub_admin", "business_line": "loans", "platform_scope": "false"}
    )


@pytest.mark.asyncio
async def test_admin_lists_pending_applications(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    await _create_pending_application(mobile=unique_mobile())
    res = await client.get(
        "/api/v1/admin/agents",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    assert len(res.json()["applications"]) >= 1


@pytest.mark.asyncio
async def test_approve_creates_new_agent_account(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    app_id = await _create_pending_application(mobile=unique_mobile())
    res = await client.post(
        f"/api/v1/admin/agents/{app_id}/approve",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["business_line"] == "real_estate"
    assert body["agent_code"].startswith("AG-")
    assert body["temp_password"]  # brand-new account gets a temp password


@pytest.mark.asyncio
async def test_approve_reuses_existing_account_no_temp_password(client: AsyncClient) -> None:
    _, applicant_mobile = await full_registration(client)
    applicant_uid = await _auth_user_uuid(applicant_mobile)
    applicant_email = unique_email()
    app_id = await _create_pending_application(
        applicant_auth_user_uuid=applicant_uid,
        email=applicant_email,
    )

    _, admin_mobile = await full_registration(client)
    admin_uid = await _auth_user_uuid(admin_mobile)
    res = await client.post(
        f"/api/v1/admin/agents/{app_id}/approve",
        headers={"Authorization": f"Bearer {_admin_token(admin_uid)}"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["temp_password"] is None
    assert await _user_email(applicant_mobile) == applicant_email


@pytest.mark.asyncio
async def test_double_approve_conflicts(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    app_id = await _create_pending_application(mobile=unique_mobile())
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}
    first = await client.post(f"/api/v1/admin/agents/{app_id}/approve", headers=headers)
    assert first.status_code == 200
    second = await client.post(f"/api/v1/admin/agents/{app_id}/approve", headers=headers)
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_reject_sets_status(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    app_id = await _create_pending_application(mobile=unique_mobile())
    res = await client.post(
        f"/api/v1/admin/agents/{app_id}/reject",
        json={"note": "RERA number could not be verified."},
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "rejected"


@pytest.mark.asyncio
async def test_reject_persists_note_visible_in_detail(client: AsyncClient) -> None:
    """Closes feature-status.md §2-11: the note used to reach only the audit
    log detail JSONB, not the application row itself."""
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    app_id = await _create_pending_application(mobile=unique_mobile())
    reject_res = await client.post(
        f"/api/v1/admin/agents/{app_id}/reject",
        json={"note": "RERA number could not be verified."},
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert reject_res.status_code == 200, reject_res.text

    detail_res = await client.get(
        f"/api/v1/admin/agents/{app_id}",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert detail_res.status_code == 200, detail_res.text
    assert detail_res.json()["review_note"] == "RERA number could not be verified."


@pytest.mark.asyncio
async def test_reject_purges_kyc_documents_from_storage(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Closes feature-status.md §2-11: a rejected application's KYC objects
    stayed referenced forever (never orphan-purge candidates) before this —
    reject must now null the refs and delete the objects outright."""
    from app.services import storage

    deleted_keys: list[str] = []
    monkeypatch.setattr(storage, "delete_object", lambda key: deleted_keys.append(key))

    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    app_id = await _create_pending_application(mobile=unique_mobile(), with_documents=True)

    reject_res = await client.post(
        f"/api/v1/admin/agents/{app_id}/reject",
        json={"note": "Documents unreadable."},
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert reject_res.status_code == 200, reject_res.text

    assert set(deleted_keys) == {
        "agent-applications/abc/def-aadhaar_front",
        "agent-applications/abc/def-aadhaar_back",
        "agent-applications/abc/def-pan",
        "agent-applications/abc/def-photo",
    }

    detail_res = await client.get(
        f"/api/v1/admin/agents/{app_id}",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert detail_res.status_code == 200, detail_res.text
    assert detail_res.json()["documents"] == []


@pytest.mark.asyncio
async def test_line_scoped_admin_role_gets_403_not_silent_result(client: AsyncClient) -> None:
    """Closes feature-status.md §2-20: a JWT carrying role='admin' but
    platform_scope='false' (should be impossible via the real staff-
    provisioning path, but was reachable via require_admin's role-only
    check) must now get a clean 403 from admin.py's list endpoint, not a
    silent RLS-empty 200."""
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    line_scoped_admin_token = create_access_token(
        {"sub": uid, "role": "admin", "business_line": "loans", "platform_scope": "false"}
    )
    res = await client.get(
        "/api/v1/admin/agents",
        headers={"Authorization": f"Bearer {line_scoped_admin_token}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_line_sub_admin_cannot_approve(client: AsyncClient) -> None:
    """RLS would allow this (agent_applications_rls has no line predicate for
    non-platform staff — only require_admin gates approve/reject), so this proves
    the app-layer wall, not the data-layer one."""
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    app_id = await _create_pending_application(mobile=unique_mobile())
    res = await client.post(
        f"/api/v1/admin/agents/{app_id}/approve",
        headers={"Authorization": f"Bearer {_sub_admin_line_token(uid)}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_approve_missing_is_404(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    res = await client.post(
        f"/api/v1/admin/agents/{uuid.uuid4()}/approve",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_new_agent_logs_in_via_forced_reset(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    agent_mobile = unique_mobile()
    app_id = await _create_pending_application(mobile=agent_mobile)
    approved = await client.post(
        f"/api/v1/admin/agents/{app_id}/approve",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert approved.status_code == 200, approved.text
    temp_password = approved.json()["temp_password"]
    assert temp_password

    login_res = await client.post(
        "/api/v1/auth/login",
        json={"mobile": agent_mobile, "password": temp_password},
    )
    assert login_res.status_code == 200, login_res.text


@pytest.mark.asyncio
async def test_list_includes_email(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    email = unique_email()
    await _create_pending_application(mobile=unique_mobile(), email=email)
    res = await client.get(
        "/api/v1/admin/agents",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    assert any(a["email"] == email for a in res.json()["applications"])


@pytest.mark.asyncio
async def test_get_application_detail_returns_documents(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    app_id = await _create_pending_application(mobile=unique_mobile(), with_documents=True)
    res = await client.get(
        f"/api/v1/admin/agents/{app_id}",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    documents = res.json()["documents"]
    assert len(documents) == 4
    assert {d["doc_type"] for d in documents} == {
        "aadhaar_front",
        "aadhaar_back",
        "pan",
        "photo",
    }
    assert all(d["download_url"].startswith("http") for d in documents)


@pytest.mark.asyncio
async def test_get_application_detail_empty_when_no_refs(client: AsyncClient) -> None:
    """Legacy/seed rows with no document refs must render an empty list, not error."""
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    app_id = await _create_pending_application(mobile=unique_mobile())
    res = await client.get(
        f"/api/v1/admin/agents/{app_id}",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["documents"] == []


@pytest.mark.asyncio
async def test_get_application_detail_non_admin_403(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    app_id = await _create_pending_application(mobile=unique_mobile())
    res = await client.get(
        f"/api/v1/admin/agents/{app_id}",
        headers={"Authorization": f"Bearer {_sub_admin_line_token(uid)}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_get_application_detail_missing_is_404(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    res = await client.get(
        f"/api/v1/admin/agents/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_approve_uses_application_email(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    agent_mobile = unique_mobile()
    agent_email = unique_email()
    app_id = await _create_pending_application(mobile=agent_mobile, email=agent_email)
    res = await client.post(
        f"/api/v1/admin/agents/{app_id}/approve",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    assert await _user_email(agent_mobile) == agent_email


@pytest.mark.asyncio
async def test_approve_email_conflict_returns_409(client: AsyncClient) -> None:
    _, admin_mobile = await full_registration(client)
    uid = await _auth_user_uuid(admin_mobile)
    # existing_email already belongs to a different, already-registered account.
    existing_email = unique_email()
    await full_registration(client, email=existing_email)
    app_id = await _create_pending_application(mobile=unique_mobile(), email=existing_email)
    res = await client.post(
        f"/api/v1/admin/agents/{app_id}/approve",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 409, res.text


@pytest.mark.asyncio
async def test_approve_legacy_null_email_still_succeeds(client: AsyncClient) -> None:
    """Rows predating migration c1d2e3f4a5b6 (or seed data) have no email —
    approval must still fall back to the placeholder rather than error."""
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    app_id = await _create_pending_application(mobile=unique_mobile(), email=None)
    res = await client.post(
        f"/api/v1/admin/agents/{app_id}/approve",
        headers={"Authorization": f"Bearer {_admin_token(uid)}"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["temp_password"]


@pytest.mark.asyncio
async def test_queue_status_filter(client: AsyncClient) -> None:
    """The queue used to be a one-way door: `status` was hardcoded to pending,
    so an Admin could never look back at what they had already decided."""
    _, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    headers = {"Authorization": f"Bearer {_admin_token(uid)}"}

    pending_id = await _create_pending_application(mobile=unique_mobile())
    rejected_id = await _create_pending_application(mobile=unique_mobile())
    rejected = await client.post(
        f"/api/v1/admin/agents/{rejected_id}/reject",
        json={"note": "RERA number could not be verified."},
        headers=headers,
    )
    assert rejected.status_code == 200, rejected.text

    # Omitting the parameter keeps the original pending-only behavior.
    default = await client.get("/api/v1/admin/agents", headers=headers)
    assert default.status_code == 200, default.text
    default_ids = {row["id"] for row in default.json()["applications"]}
    assert pending_id in default_ids
    assert rejected_id not in default_ids

    only_rejected = await client.get(
        "/api/v1/admin/agents", params={"status": "rejected"}, headers=headers
    )
    assert only_rejected.status_code == 200, only_rejected.text
    rejected_ids = {row["id"] for row in only_rejected.json()["applications"]}
    assert rejected_id in rejected_ids
    assert pending_id not in rejected_ids

    # "all" is an explicit member: FastAPI validates "" against the Literal
    # and rejects it rather than reading it as unset.
    everything = await client.get("/api/v1/admin/agents", params={"status": "all"}, headers=headers)
    assert everything.status_code == 200, everything.text
    all_ids = {row["id"] for row in everything.json()["applications"]}
    assert {pending_id, rejected_id} <= all_ids

    invalid = await client.get(
        "/api/v1/admin/agents", params={"status": "not-a-status"}, headers=headers
    )
    assert invalid.status_code == 422
