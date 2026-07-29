"""task_documents / loan_documents verify-grant RLS — the security-critical
regression for migration c8d9e0f1a2b3.

The whole point of this migration: an assigned employee's own request
session must NOT be able to UPDATE `task_documents.verified` (it could
before the split, since `task_documents_rls` was a single FOR ALL policy —
granting UPDATE onto it unchanged would have let the collecting employee
mark their own uploads verified). Admin's session must. The employee's
INSERT/DELETE must be completely unaffected by the split. The identical
guard applies to `loan_documents.verified` against a client's own session.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.lead import Lead, LeadOrigin, LeadStatus
from app.models.loan import LoanApplication, LoanStatus, LoanType
from app.models.loan_document import LoanDocument
from app.models.profile import ClientProfile, ProfileScope, ProfileStatus, StaffProfile, StaffRole
from app.models.task import Task, TaskDocument, TaskStatus, TaskType
from app.models.user import User
from conftest import unique_mobile

pytestmark = pytest.mark.asyncio


async def _seed_task_document(business_line: str = "loans") -> tuple[str, str, str]:
    """Returns (task_document_id, assigned_employee_staff_uuid, business_line)."""
    import app.db.session as _session_mod

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
        lead = Lead(
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus.NEW,
            origin=LeadOrigin.DIRECT,
        )
        db.add(lead)
        await db.flush()
        task = Task(
            raised_by_staff_profile_uuid=raiser_profile.id,
            assigned_employee_profile_uuid=employee_profile.id,
            business_line=business_line,
            task_type=TaskType.DOCUMENT_COLLECTION,
            lead_uuid=lead.id,
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
        return str(document.id), str(employee_profile.id), str(task.id)


async def _seed_loan_document(business_line: str = "loans") -> tuple[str, str]:
    """Returns (loan_document_id, client_profile_uuid)."""
    import app.db.session as _session_mod

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
        lead = Lead(
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus.NEW,
            origin=LeadOrigin.DIRECT,
        )
        loan_type = LoanType(name=f"lt_{uuid.uuid4().hex[:8]}", label="Test Loan Type")
        db.add_all([client_profile, lead, loan_type])
        await db.flush()
        application = LoanApplication(
            lead_uuid=lead.id,
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
        return str(document.id), str(client_profile.id)


def _engine():
    raw_url = settings.DATABASE_URL.replace("pgbouncer:5432", "postgres:5432")
    return create_async_engine(
        raw_url,
        poolclass=NullPool,
        connect_args={
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4()}__",
        },
    )


async def _set_context(
    conn,
    *,
    role: str,
    business_line: str,
    ps: str,
    staff_profile_uuid: str = "",
    client_profile_uuid: str = "",
) -> None:
    await conn.execute(text("SET LOCAL ROLE api_user"))
    await conn.execute(
        text(
            "SELECT "
            "set_config('app.auth_user_uuid', :uuid, true),"
            "set_config('app.role', :role, true),"
            "set_config('app.business_line', :bl, true),"
            "set_config('app.client_profile_uuid', :cpu, true),"
            "set_config('app.agent_profile_uuid', '', true),"
            "set_config('app.staff_profile_uuid', :spu, true),"
            "set_config('app.platform_scope', :ps, true)"
        ),
        {
            "uuid": str(uuid.uuid4()),
            "role": role,
            "bl": business_line,
            "ps": ps,
            "cpu": client_profile_uuid,
            "spu": staff_profile_uuid,
        },
    )


async def test_assigned_employee_cannot_update_verified(client) -> None:
    document_id, employee_staff_uuid, _task_id = await _seed_task_document("loans")

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(
                conn,
                role="employee",
                business_line="loans",
                ps="false",
                staff_profile_uuid=employee_staff_uuid,
            )
            result = await conn.execute(
                text("UPDATE task_documents SET verified = true WHERE id = :id"),
                {"id": document_id},
            )
            # RLS filters rather than raises: the row is invisible for
            # UPDATE under task_documents_update (admin-only), so it
            # matches zero rows rather than erroring.
            assert result.rowcount == 0
    finally:
        await engine.dispose()

    # Confirm the row genuinely wasn't touched.
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("SELECT verified FROM task_documents WHERE id = :id"), {"id": document_id}
            )
        ).fetchone()
    assert row[0] is False


async def test_admin_can_update_verified(client) -> None:
    document_id, _employee_staff_uuid, _task_id = await _seed_task_document("loans")

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(conn, role="admin", business_line="", ps="true")
            result = await conn.execute(
                text("UPDATE task_documents SET verified = true WHERE id = :id"),
                {"id": document_id},
            )
            assert result.rowcount == 1
    finally:
        await engine.dispose()


async def test_employee_insert_and_delete_still_work(client) -> None:
    """The split must not regress the pre-existing employee upload/delete
    flow — task_documents_insert/_delete keep the exact predicate they
    already had."""
    _document_id, employee_staff_uuid, task_id = await _seed_task_document("loans")

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(
                conn,
                role="employee",
                business_line="loans",
                ps="false",
                staff_profile_uuid=employee_staff_uuid,
            )
            new_id = str(uuid.uuid4())
            insert_result = await conn.execute(
                text(
                    "INSERT INTO task_documents (id, task_uuid, doc_type, object_key) "
                    "VALUES (:id, :task_id, 'salary_slip', :key)"
                ),
                {
                    "id": new_id,
                    "task_id": task_id,
                    "key": f"tasks/{task_id}/{uuid.uuid4().hex}-salary_slip",
                },
            )
            assert insert_result.rowcount == 1

            delete_result = await conn.execute(
                text("DELETE FROM task_documents WHERE id = :id"), {"id": new_id}
            )
            assert delete_result.rowcount == 1
    finally:
        await engine.dispose()


async def test_client_cannot_update_loan_document_verified(client) -> None:
    document_id, client_profile_uuid = await _seed_loan_document("loans")

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(
                conn,
                role="client",
                business_line="loans",
                ps="false",
                client_profile_uuid=client_profile_uuid,
            )
            result = await conn.execute(
                text("UPDATE loan_documents SET verified = true WHERE id = :id"),
                {"id": document_id},
            )
            assert result.rowcount == 0
    finally:
        await engine.dispose()


async def test_task_documents_has_four_policies() -> None:
    engine = _engine()
    try:
        async with engine.begin() as conn:
            result = await conn.execute(
                text(
                    "SELECT polname, polcmd FROM pg_policy "
                    "WHERE polrelid = 'task_documents'::regclass ORDER BY polname"
                )
            )
            rows = {
                r[0]: (r[1].decode() if isinstance(r[1], bytes) else r[1])
                for r in result.fetchall()
            }
    finally:
        await engine.dispose()
    assert rows == {
        "task_documents_select": "r",
        "task_documents_insert": "a",
        "task_documents_delete": "d",
        "task_documents_update": "w",
    }
