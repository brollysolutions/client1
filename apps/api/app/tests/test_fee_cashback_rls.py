"""fee_cashbacks RLS — identity-keyed client read (NO business_line
predicate), admin-only write (migration e4f5a6b7c8d9).

Verifies: the recipient client sees only their own cashback; a different
client sees nothing; a DUAL-LINE client (app.business_line='both', the JWT
claim every self-registered client carries) still sees their own row — the
whole point of the owner branch having no line predicate at all, unlike
commissions_select's agent branch; Sub Admin sees nothing; full Admin sees
everything; a line-scoped admin sees nothing; a request session (api_user,
client role) cannot INSERT/UPDATE even a row it can SELECT — only the admin
branch of fee_cashbacks_insert/fee_cashbacks_update passes; api_user has no
DELETE grant at all.
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
from app.models.fee_cashback import FeeCashback
from app.models.lead import Lead, LeadOrigin, LeadStatus
from app.models.loan import FeeOutcome, LoanApplication, LoanStatus, LoanType
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


async def _seed_application(client_profile_uuid: str, business_line: str) -> str:
    """A disbursed, fee_outcome='cashback' loan application — returns
    loan_application_id. Real FK-satisfying rows: fee_cashbacks.loan_application_uuid
    /client_profile_uuid are enforced FKs."""
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
            processing_fee=5000.00,
            fee_outcome=FeeOutcome.CASHBACK,
            status=LoanStatus.DISBURSED,
            opened_at=datetime.now(UTC),
            closed_at=datetime.now(UTC),
            disbursed_at=datetime.now(UTC),
        )
        db.add(loan)
        await db.commit()
        return str(loan.id)


async def _seed_cashback(
    recipient_auth_user_uuid: str, client_profile_uuid: str, business_line: str
) -> str:
    import app.db.session as _session_mod

    loan_id = await _seed_application(client_profile_uuid, business_line)

    async with _session_mod.AsyncSessionLocal() as db:
        admin_user = User(
            first_name="Test",
            last_name="Admin",
            mobile=unique_mobile(),
            email=f"admin_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(admin_user)
        await db.flush()

        cashback = FeeCashback(
            loan_application_uuid=uuid.UUID(loan_id),
            client_profile_uuid=uuid.UUID(client_profile_uuid),
            recipient_auth_user_uuid=uuid.UUID(recipient_auth_user_uuid),
            business_line=business_line,
            processing_fee_paise=500_000,
            amount_paise=250_000,
            entered_by_uuid=admin_user.id,
        )
        db.add(cashback)
        await db.commit()
        return str(cashback.id)


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


async def _set_context(conn, auth_user_uuid: str, role: str, business_line: str, ps: str) -> None:
    await conn.execute(text("SET LOCAL ROLE api_user"))
    await conn.execute(
        text(
            "SELECT "
            "set_config('app.auth_user_uuid', :uuid, true),"
            "set_config('app.role', :role, true),"
            "set_config('app.business_line', :bl, true),"
            "set_config('app.client_profile_uuid', '', true),"
            "set_config('app.agent_profile_uuid', '', true),"
            "set_config('app.staff_profile_uuid', '', true),"
            "set_config('app.platform_scope', :ps, true)"
        ),
        {"uuid": auth_user_uuid, "role": role, "bl": business_line, "ps": ps},
    )


async def _select_ids_as(
    *, auth_user_uuid: str, role: str, business_line: str = "", platform_scope: str = "false"
) -> list[str]:
    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(conn, auth_user_uuid, role, business_line, platform_scope)
            result = await conn.execute(text("SELECT id FROM fee_cashbacks"))
            return [str(row[0]) for row in result.fetchall()]
    finally:
        await engine.dispose()


async def test_client_sees_own_cashback(client) -> None:
    client_uid, client_profile_uuid = await _seed_client("loans")
    cashback_id = await _seed_cashback(client_uid, client_profile_uuid, "loans")

    ids = await _select_ids_as(auth_user_uuid=client_uid, role="client", business_line="loans")
    assert cashback_id in ids


async def test_dual_line_client_still_sees_own_cashback(client) -> None:
    """The carve-out this table exists for: a self-registered client's JWT
    business_line claim is literally 'both', not one of the two real lines.
    Unlike commissions_select's agent branch, fee_cashbacks_select's owner
    branch has NO business_line predicate at all — so 'both' must still see
    the row."""
    client_uid, client_profile_uuid = await _seed_client("loans")
    cashback_id = await _seed_cashback(client_uid, client_profile_uuid, "loans")

    ids = await _select_ids_as(auth_user_uuid=client_uid, role="client", business_line="both")
    assert cashback_id in ids


async def test_different_client_sees_nothing(client) -> None:
    client_a_uid, client_a_profile = await _seed_client("loans")
    cashback_id = await _seed_cashback(client_a_uid, client_a_profile, "loans")
    client_b_uid, _ = await _seed_client("loans")

    ids = await _select_ids_as(auth_user_uuid=client_b_uid, role="client", business_line="loans")
    assert cashback_id not in ids


async def test_sub_admin_sees_nothing(client) -> None:
    client_uid, client_profile_uuid = await _seed_client("loans")
    cashback_id = await _seed_cashback(client_uid, client_profile_uuid, "loans")

    ids = await _select_ids_as(
        auth_user_uuid=str(uuid.uuid4()), role="sub_admin", platform_scope="true"
    )
    assert cashback_id not in ids
    assert ids == []


async def test_full_admin_sees_everything(client) -> None:
    client_uid, client_profile_uuid = await _seed_client("loans")
    cashback_id = await _seed_cashback(client_uid, client_profile_uuid, "loans")

    ids = await _select_ids_as(
        auth_user_uuid=str(uuid.uuid4()), role="admin", platform_scope="true"
    )
    assert cashback_id in ids


async def test_line_scoped_admin_sees_nothing(client) -> None:
    """fee_cashbacks_select's admin branch requires platform_scope='true',
    not just role='admin' — same as every other admin-bypass predicate."""
    client_uid, client_profile_uuid = await _seed_client("loans")
    cashback_id = await _seed_cashback(client_uid, client_profile_uuid, "loans")

    ids = await _select_ids_as(
        auth_user_uuid=str(uuid.uuid4()), role="admin", platform_scope="line"
    )
    assert cashback_id not in ids


async def test_client_request_session_cannot_insert(client) -> None:
    """fee_cashbacks_insert requires the admin predicate — a client's own
    request session (even though it can SELECT its own rows) cannot write.
    Uses a real, well-formed application (via _seed_application) so a
    rejected INSERT is attributable to RLS, not a FK/CHECK violation."""
    client_uid, client_profile_uuid = await _seed_client("loans")
    loan_id = await _seed_application(client_profile_uuid, "loans")

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(conn, client_uid, "client", "loans", "false")
            with pytest.raises(DBAPIError):
                await conn.execute(
                    text(
                        "INSERT INTO fee_cashbacks "
                        "(id, loan_application_uuid, client_profile_uuid, "
                        "recipient_auth_user_uuid, business_line, processing_fee_paise, "
                        "amount_paise, entered_by_uuid) "
                        "VALUES (:id, :loan_id, :profile_id, :client_uid, 'loans', "
                        "500000, 250000, :client_uid)"
                    ),
                    {
                        "id": str(uuid.uuid4()),
                        "loan_id": loan_id,
                        "profile_id": client_profile_uuid,
                        "client_uid": client_uid,
                    },
                )
    finally:
        await engine.dispose()


async def test_client_request_session_cannot_update(client) -> None:
    client_uid, client_profile_uuid = await _seed_client("loans")
    cashback_id = await _seed_cashback(client_uid, client_profile_uuid, "loans")

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_context(conn, client_uid, "client", "loans", "false")
            result = await conn.execute(
                text("UPDATE fee_cashbacks SET notes = 'hacked' WHERE id = :id"),
                {"id": cashback_id},
            )
            # RLS silently filters rather than raising for a WHERE-clause
            # UPDATE that matches no visible-for-write row.
            assert result.rowcount == 0
    finally:
        await engine.dispose()


async def test_api_user_has_no_delete_grant(client) -> None:
    engine = _engine()
    try:
        async with engine.begin() as conn:
            result = await conn.execute(
                text(
                    "SELECT privilege_type FROM information_schema.role_table_grants "
                    "WHERE table_name = 'fee_cashbacks' AND grantee = 'api_user'"
                )
            )
            privileges = {row[0] for row in result.fetchall()}
    finally:
        await engine.dispose()
    assert privileges == {"SELECT", "INSERT", "UPDATE"}
