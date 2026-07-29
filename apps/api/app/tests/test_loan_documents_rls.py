"""loan_documents RLS — owning-client read/write, staff line-scoped read,
admin-only verify (migration f5a6b7c8d9e0).

Verifies: the owning client sees their own document; a different client sees
nothing; INSERT with a foreign client_profile_uuid is rejected by RLS; a
client's own request session cannot UPDATE `verified` (only the admin branch
of loan_documents_update passes); an assigned-line telecaller/employee sees
the row (loan_applications_rls's own staff branch has no per-assignment
join, and this table mirrors it); a different-line staff member sees
nothing; full Admin sees everything; a line-scoped admin sees nothing.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.models.lead import Lead, LeadOrigin, LeadStatus
from app.models.loan import LoanApplication, LoanStatus, LoanType
from app.models.loan_document import LoanDocument
from app.models.profile import ClientProfile, ProfileStatus
from app.models.user import User
from conftest import unique_mobile

pytestmark = pytest.mark.asyncio


async def _seed_client(business_line: str = "loans") -> tuple[str, str]:
    """Returns (auth_user_uuid, client_profile_uuid)."""
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Client",
            mobile=unique_mobile(),
            email=f"cl_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = ClientProfile(
            auth_user_uuid=user.id,
            business_line=business_line,
            customer_code=f"CL{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(user.id), str(profile.id)


async def _seed_application(client_profile_uuid: str, business_line: str = "loans") -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            name="Test Lead",
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus.NEW,
            origin=LeadOrigin.DIRECT,
        )
        loan_type = LoanType(name=f"lt_{uuid.uuid4().hex[:8]}", label="Test Loan Type")
        db.add_all([lead, loan_type])
        await db.flush()
        loan = LoanApplication(
            lead_uuid=lead.id,
            client_profile_uuid=uuid.UUID(client_profile_uuid),
            business_line=business_line,
            loan_type_id=loan_type.id,
            amount_requested=100000,
            status=LoanStatus.NEW,
            opened_at=datetime.now(UTC),
        )
        db.add(loan)
        await db.commit()
        return str(loan.id)


async def _seed_document(client_profile_uuid: str, business_line: str = "loans") -> tuple[str, str]:
    """Returns (loan_application_id, document_id)."""
    import app.db.session as _session_mod

    application_id = await _seed_application(client_profile_uuid, business_line)

    async with _session_mod.AsyncSessionLocal() as db:
        uploader = User(
            first_name="Test",
            last_name="Client",
            mobile=unique_mobile(),
            email=f"up_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(uploader)
        await db.flush()

        document = LoanDocument(
            loan_application_uuid=uuid.UUID(application_id),
            client_profile_uuid=uuid.UUID(client_profile_uuid),
            business_line=business_line,
            doc_type="aadhaar_front",
            object_key=f"loan-applications/{application_id}/{uuid.uuid4().hex}-aadhaar_front",
            content_type="image/jpeg",
            size_bytes=2048,
            uploaded_by_uuid=uploader.id,
        )
        db.add(document)
        await db.commit()
        return application_id, str(document.id)


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
    auth_user_uuid: str,
    role: str,
    business_line: str,
    ps: str,
    client_profile_uuid: str = "",
    staff_profile_uuid: str = "",
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
            "uuid": auth_user_uuid,
            "role": role,
            "bl": business_line,
            "ps": ps,
            "cpu": client_profile_uuid,
            "spu": staff_profile_uuid,
        },
    )


async def _select_ids_as(**kwargs) -> list[str]:
    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(conn, **kwargs)
            result = await conn.execute(text("SELECT id FROM loan_documents"))
            return [str(row[0]) for row in result.fetchall()]
    finally:
        await engine.dispose()


async def test_client_sees_own_document(client) -> None:
    client_uid, client_profile_uuid = await _seed_client("loans")
    _application_id, document_id = await _seed_document(client_profile_uuid, "loans")

    ids = await _select_ids_as(
        auth_user_uuid=client_uid,
        role="client",
        business_line="loans",
        ps="false",
        client_profile_uuid=client_profile_uuid,
    )
    assert document_id in ids


async def test_different_client_sees_nothing(client) -> None:
    client_a_uid, client_a_profile = await _seed_client("loans")
    _application_id, document_id = await _seed_document(client_a_profile, "loans")
    client_b_uid, client_b_profile = await _seed_client("loans")

    ids = await _select_ids_as(
        auth_user_uuid=client_b_uid,
        role="client",
        business_line="loans",
        ps="false",
        client_profile_uuid=client_b_profile,
    )
    assert document_id not in ids


async def test_assigned_line_telecaller_sees_document(client) -> None:
    _client_uid, client_profile_uuid = await _seed_client("loans")
    _application_id, document_id = await _seed_document(client_profile_uuid, "loans")

    ids = await _select_ids_as(
        auth_user_uuid=str(uuid.uuid4()),
        role="telecaller",
        business_line="loans",
        ps="false",
        staff_profile_uuid=str(uuid.uuid4()),
    )
    assert document_id in ids


async def test_different_line_staff_sees_nothing(client) -> None:
    _client_uid, client_profile_uuid = await _seed_client("loans")
    _application_id, document_id = await _seed_document(client_profile_uuid, "loans")

    ids = await _select_ids_as(
        auth_user_uuid=str(uuid.uuid4()),
        role="employee",
        business_line="real_estate",
        ps="false",
        staff_profile_uuid=str(uuid.uuid4()),
    )
    assert document_id not in ids


async def test_full_admin_sees_everything(client) -> None:
    _client_uid, client_profile_uuid = await _seed_client("loans")
    _application_id, document_id = await _seed_document(client_profile_uuid, "loans")

    ids = await _select_ids_as(
        auth_user_uuid=str(uuid.uuid4()), role="admin", business_line="", ps="true"
    )
    assert document_id in ids


async def test_line_scoped_admin_sees_nothing(client) -> None:
    _client_uid, client_profile_uuid = await _seed_client("loans")
    _application_id, document_id = await _seed_document(client_profile_uuid, "loans")

    ids = await _select_ids_as(
        auth_user_uuid=str(uuid.uuid4()), role="admin", business_line="", ps="line"
    )
    assert document_id not in ids


async def test_client_insert_with_foreign_client_profile_uuid_rejected(client) -> None:
    client_uid, client_profile_uuid = await _seed_client("loans")
    application_id = await _seed_application(client_profile_uuid, "loans")
    foreign_profile_uuid = str(uuid.uuid4())

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(
                conn,
                auth_user_uuid=client_uid,
                role="client",
                business_line="loans",
                ps="false",
                client_profile_uuid=client_profile_uuid,
            )
            with pytest.raises(DBAPIError):
                await conn.execute(
                    text(
                        "INSERT INTO loan_documents "
                        "(id, loan_application_uuid, client_profile_uuid, business_line, "
                        "doc_type, object_key, content_type, size_bytes, uploaded_by_uuid) "
                        "VALUES (:id, :app_id, :foreign_cpu, 'loans', 'pan', :key, "
                        "'image/jpeg', 100, :client_uid)"
                    ),
                    {
                        "id": str(uuid.uuid4()),
                        "app_id": application_id,
                        "foreign_cpu": foreign_profile_uuid,
                        "key": f"loan-applications/{application_id}/{uuid.uuid4().hex}-pan",
                        "client_uid": client_uid,
                    },
                )
    finally:
        await engine.dispose()


async def test_client_request_session_cannot_update_verified(client) -> None:
    client_uid, client_profile_uuid = await _seed_client("loans")
    _application_id, document_id = await _seed_document(client_profile_uuid, "loans")

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(
                conn,
                auth_user_uuid=client_uid,
                role="client",
                business_line="loans",
                ps="false",
                client_profile_uuid=client_profile_uuid,
            )
            result = await conn.execute(
                text("UPDATE loan_documents SET verified = true WHERE id = :id"),
                {"id": document_id},
            )
            # RLS filters rather than raising for an UPDATE matching no
            # visible-for-write row under loan_documents_update (admin-only).
            assert result.rowcount == 0
    finally:
        await engine.dispose()


async def test_api_user_column_scoped_update_grant(client) -> None:
    engine = _engine()
    try:
        async with engine.begin() as conn:
            result = await conn.execute(
                text(
                    "SELECT column_name FROM information_schema.column_privileges "
                    "WHERE table_name = 'loan_documents' AND grantee = 'api_user' "
                    "AND privilege_type = 'UPDATE'"
                )
            )
            columns = {row[0] for row in result.fetchall()}
    finally:
        await engine.dispose()
    assert columns == {"verified", "verified_by_profile_uuid", "verified_at", "review_note"}
