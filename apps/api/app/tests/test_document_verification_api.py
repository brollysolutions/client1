"""Unified Admin document verification — task_documents + loan_documents (FR-7.4).

Covers: subjects merge both sources under one lead, the only_unverified
filter, verifying each source, unverifying without a note (422), role
gating (non-admin 403, line-scoped admin 403 not an empty list), a
source/document_id mismatch (404), the audit trail, and the unverify
notification.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from conftest import full_registration, unique_mobile

pytestmark = pytest.mark.asyncio


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _seed_admin() -> tuple[str, str]:
    """Returns (auth_user_uuid, staff_profile_uuid). A real StaffProfile row
    is required: verified_by_profile_uuid is a genuine FK into staff_profiles."""
    import app.db.session as _session_mod
    from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Admin",
            mobile=unique_mobile(),
            email=f"adm_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = StaffProfile(
            auth_user_uuid=user.id,
            role=StaffRole.ADMIN,
            scope=ProfileScope.PLATFORM,
            business_line=None,
            staff_code=f"AD-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(user.id), str(profile.id)


def _admin_token(auth_uuid: str, staff_uuid: str, *, platform_scope: str = "true") -> str:
    return create_access_token(
        {
            "sub": auth_uuid,
            "role": "admin",
            "business_line": "",
            "staff_profile_uuid": staff_uuid,
            "platform_scope": platform_scope,
        }
    )


async def _seed_lead(business_line: str) -> str:
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            name="Shared Lead",
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus.NEW,
            origin=LeadOrigin.DIRECT,
        )
        db.add(lead)
        await db.commit()
        return str(lead.id)


async def _seed_task_document(lead_id: str, business_line: str = "loans") -> tuple[str, str, str]:
    """Returns (task_id, task_document_id, employee_auth_user_uuid)."""
    import app.db.session as _session_mod
    from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
    from app.models.task import Task, TaskDocument, TaskStatus, TaskType
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        raiser = User(
            first_name="Test",
            last_name="Telecaller",
            mobile=unique_mobile(),
            email=f"tc_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        employee_user = User(
            first_name="Test",
            last_name="Employee",
            mobile=unique_mobile(),
            email=f"em_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add_all([raiser, employee_user])
        await db.flush()
        raiser_profile = StaffProfile(
            auth_user_uuid=raiser.id,
            role=StaffRole.TELECALLER,
            scope=ProfileScope.LINE,
            business_line=business_line,
            staff_code=f"TC-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        employee_profile = StaffProfile(
            auth_user_uuid=employee_user.id,
            role=StaffRole.EMPLOYEE,
            scope=ProfileScope.LINE,
            business_line=business_line,
            staff_code=f"EM-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add_all([raiser_profile, employee_profile])
        await db.flush()
        task = Task(
            raised_by_staff_profile_uuid=raiser_profile.id,
            assigned_employee_profile_uuid=employee_profile.id,
            business_line=business_line,
            task_type=TaskType.DOCUMENT_COLLECTION,
            lead_uuid=uuid.UUID(lead_id),
            status=TaskStatus.ASSIGNED,
        )
        db.add(task)
        await db.flush()
        document = TaskDocument(
            task_uuid=task.id,
            doc_type="pan",
            object_key=f"tasks/{task.id}/{uuid.uuid4().hex}-pan",
        )
        db.add(document)
        await db.commit()
        return str(task.id), str(document.id), str(employee_user.id)


async def _seed_loan_document(lead_id: str, business_line: str = "loans") -> tuple[str, str, str]:
    """Returns (application_id, loan_document_id, client_auth_user_uuid)."""
    import app.db.session as _session_mod
    from app.models.loan import LoanApplication, LoanStatus, LoanType
    from app.models.loan_document import LoanDocument
    from app.models.profile import ClientProfile, ProfileStatus
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        client_user = User(
            first_name="Test",
            last_name="Client",
            mobile=unique_mobile(),
            email=f"cl_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(client_user)
        await db.flush()
        client_profile = ClientProfile(
            auth_user_uuid=client_user.id,
            business_line=business_line,
            customer_code=f"CL{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        loan_type = LoanType(name=f"lt_{uuid.uuid4().hex[:8]}", label="Test Loan Type")
        db.add_all([client_profile, loan_type])
        await db.flush()
        application = LoanApplication(
            lead_uuid=uuid.UUID(lead_id),
            client_profile_uuid=client_profile.id,
            business_line=business_line,
            loan_type_id=loan_type.id,
            amount_requested=100000,
            status=LoanStatus.NEW,
            opened_at=datetime.now(UTC),
        )
        db.add(application)
        await db.flush()
        document = LoanDocument(
            loan_application_uuid=application.id,
            client_profile_uuid=client_profile.id,
            business_line=business_line,
            doc_type="aadhaar_front",
            object_key=f"loan-applications/{application.id}/{uuid.uuid4().hex}-aadhaar_front",
            content_type="image/jpeg",
            size_bytes=2048,
            uploaded_by_uuid=client_user.id,
        )
        db.add(document)
        await db.commit()
        return str(application.id), str(document.id), str(client_user.id)


async def _get_task_document_row(document_id: str) -> dict:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT verified, verified_by_profile_uuid, review_note "
                    "FROM task_documents WHERE id = :id"
                ),
                {"id": document_id},
            )
        ).fetchone()
        return {"verified": row[0], "verified_by_profile_uuid": row[1], "review_note": row[2]}


async def _get_notification_count(auth_user_uuid: str) -> int:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        return (
            await db.scalar(
                text("SELECT COUNT(*) FROM notifications WHERE user_uuid = :uid"),
                {"uid": auth_user_uuid},
            )
        ) or 0


async def _get_audit_count(action: str, entity_uuid: str) -> int:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        return (
            await db.scalar(
                text("SELECT COUNT(*) FROM audit_log WHERE action = :a AND entity_uuid = :e"),
                {"a": action, "e": entity_uuid},
            )
        ) or 0


# ---------------------------------------------------------------------------
# Subjects
# ---------------------------------------------------------------------------


async def test_subjects_merge_both_sources_under_one_lead(client: AsyncClient) -> None:
    admin_auth, admin_staff = await _seed_admin()
    token = _admin_token(admin_auth, admin_staff)

    lead_id = await _seed_lead("loans")
    task_id, _task_doc_id, _emp_auth = await _seed_task_document(lead_id, "loans")
    application_id, _loan_doc_id, _client_auth = await _seed_loan_document(lead_id, "loans")

    res = await client.get("/api/v1/admin/document-verification/subjects", headers=_headers(token))
    assert res.status_code == 200, res.text
    subjects = res.json()["subjects"]
    matching = [s for s in subjects if s["subject_uuid"] in (task_id, application_id)]
    assert len(matching) == 2
    lead_uuids = {s["lead_uuid"] for s in matching}
    assert lead_uuids == {lead_id}
    sources = {s["source"] for s in matching}
    assert sources == {"task", "loan_application"}


async def test_only_unverified_filter(client: AsyncClient) -> None:
    admin_auth, admin_staff = await _seed_admin()
    token = _admin_token(admin_auth, admin_staff)

    lead_id = await _seed_lead("loans")
    task_id, task_doc_id, _emp_auth = await _seed_task_document(lead_id, "loans")

    verify_res = await client.patch(
        f"/api/v1/admin/document-verification/documents/{task_doc_id}?source=task",
        headers=_headers(token),
        json={"verified": True},
    )
    assert verify_res.status_code == 200, verify_res.text

    res_unverified_only = await client.get(
        "/api/v1/admin/document-verification/subjects?only_unverified=true",
        headers=_headers(token),
    )
    ids = [s["subject_uuid"] for s in res_unverified_only.json()["subjects"]]
    assert task_id not in ids

    res_all = await client.get(
        "/api/v1/admin/document-verification/subjects?only_unverified=false",
        headers=_headers(token),
    )
    ids_all = [s["subject_uuid"] for s in res_all.json()["subjects"]]
    assert task_id in ids_all


# ---------------------------------------------------------------------------
# Verify / unverify
# ---------------------------------------------------------------------------


async def test_verify_task_document(client: AsyncClient) -> None:
    admin_auth, admin_staff = await _seed_admin()
    token = _admin_token(admin_auth, admin_staff)
    lead_id = await _seed_lead("loans")
    _task_id, task_doc_id, _emp_auth = await _seed_task_document(lead_id, "loans")

    res = await client.patch(
        f"/api/v1/admin/document-verification/documents/{task_doc_id}?source=task",
        headers=_headers(token),
        json={"verified": True},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["verified"] is True
    assert body["verified_by_name"] is not None

    row = await _get_task_document_row(task_doc_id)
    assert row["verified"] is True
    assert str(row["verified_by_profile_uuid"]) == admin_staff

    count = await _get_audit_count("document_verified", task_doc_id)
    assert count == 1


async def test_verify_loan_document(client: AsyncClient) -> None:
    admin_auth, admin_staff = await _seed_admin()
    token = _admin_token(admin_auth, admin_staff)
    lead_id = await _seed_lead("loans")
    _application_id, loan_doc_id, _client_auth = await _seed_loan_document(lead_id, "loans")

    res = await client.patch(
        f"/api/v1/admin/document-verification/documents/{loan_doc_id}?source=loan_application",
        headers=_headers(token),
        json={"verified": True},
    )
    assert res.status_code == 200, res.text
    assert res.json()["verified"] is True


async def test_unverify_without_note_rejected(client: AsyncClient) -> None:
    admin_auth, admin_staff = await _seed_admin()
    token = _admin_token(admin_auth, admin_staff)
    lead_id = await _seed_lead("loans")
    _task_id, task_doc_id, _emp_auth = await _seed_task_document(lead_id, "loans")

    res = await client.patch(
        f"/api/v1/admin/document-verification/documents/{task_doc_id}?source=task",
        headers=_headers(token),
        json={"verified": False},
    )
    assert res.status_code == 422, res.text


async def test_unverify_with_note_notifies_employee(client: AsyncClient) -> None:
    admin_auth, admin_staff = await _seed_admin()
    token = _admin_token(admin_auth, admin_staff)
    lead_id = await _seed_lead("loans")
    _task_id, task_doc_id, employee_auth = await _seed_task_document(lead_id, "loans")

    res = await client.patch(
        f"/api/v1/admin/document-verification/documents/{task_doc_id}?source=task",
        headers=_headers(token),
        json={"verified": False, "review_note": "Blurry scan, please re-upload."},
    )
    assert res.status_code == 200, res.text
    assert res.json()["review_note"] == "Blurry scan, please re-upload."

    notif_count = await _get_notification_count(employee_auth)
    assert notif_count >= 1

    audit_count = await _get_audit_count("document_unverified", task_doc_id)
    assert audit_count == 1


async def test_source_document_id_mismatch_404s(client: AsyncClient) -> None:
    admin_auth, admin_staff = await _seed_admin()
    token = _admin_token(admin_auth, admin_staff)
    lead_id = await _seed_lead("loans")
    _task_id, task_doc_id, _emp_auth = await _seed_task_document(lead_id, "loans")

    # Real task document id, but claimed as a loan_application source.
    res = await client.patch(
        f"/api/v1/admin/document-verification/documents/{task_doc_id}?source=loan_application",
        headers=_headers(token),
        json={"verified": True},
    )
    assert res.status_code == 404, res.text


# ---------------------------------------------------------------------------
# Role gating
# ---------------------------------------------------------------------------


async def test_non_admin_forbidden(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        uid = str(row[0])
    token = create_access_token(
        {"sub": uid, "role": "sub_admin", "business_line": "", "platform_scope": "true"}
    )
    res = await client.get("/api/v1/admin/document-verification/subjects", headers=_headers(token))
    assert res.status_code == 403


async def test_line_scoped_admin_forbidden_not_empty_list(client: AsyncClient) -> None:
    """A line-scoped admin must get a 403 at the boundary, not a confusing
    empty list — the same guard commissions.py/fee_cashbacks.py both need."""
    admin_auth, admin_staff = await _seed_admin()
    token = _admin_token(admin_auth, admin_staff, platform_scope="false")

    res = await client.get("/api/v1/admin/document-verification/subjects", headers=_headers(token))
    assert res.status_code == 403
