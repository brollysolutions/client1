"""FR-4.2/FR-4.3 automatic assignment and OTP-gated lead binding."""

from __future__ import annotations

import asyncio
import uuid
from collections import Counter
from collections.abc import AsyncIterator
from datetime import UTC, datetime

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import DBAPIError

import app.db.session as db_session
from app.jobs.assign_unassigned_leads import _assign_batch
from app.models.audit_log import AuditAction, AuditLog
from app.models.lead import Lead, LeadAssignmentCursor, LeadOrigin, LeadStatus
from app.models.profile import (
    AgentProfile,
    ClientProfile,
    ProfileScope,
    ProfileStatus,
    StaffProfile,
    StaffRole,
)
from app.models.user import User
from app.services.leads import (
    assign_lead_to_telecaller,
    auto_assign_locked_lead,
    capture_agent_lead,
    capture_lead,
)
from conftest import full_registration, unique_mobile


@pytest_asyncio.fixture(autouse=True)
async def _isolate_eligible_telecallers() -> AsyncIterator[None]:
    """Preserve the shared integration DB while making assignment deterministic."""
    async with db_session.AsyncSessionLocal() as db:
        previously_active = set(
            (
                await db.scalars(
                    select(StaffProfile.id).where(
                        StaffProfile.role == StaffRole.TELECALLER,
                        StaffProfile.status == ProfileStatus.ACTIVE,
                    )
                )
            ).all()
        )
        await db.execute(
            update(StaffProfile)
            .where(StaffProfile.role == StaffRole.TELECALLER)
            .values(status=ProfileStatus.INACTIVE)
        )
        await db.commit()
    try:
        yield
    finally:
        async with db_session.AsyncSessionLocal() as db:
            await db.execute(
                update(StaffProfile)
                .where(StaffProfile.role == StaffRole.TELECALLER)
                .values(status=ProfileStatus.INACTIVE)
            )
            if previously_active:
                await db.execute(
                    update(StaffProfile)
                    .where(StaffProfile.id.in_(previously_active))
                    .values(status=ProfileStatus.ACTIVE)
                )
            await db.commit()


async def _seed_agent(line: str = "loans") -> AgentProfile:
    async with db_session.AsyncSessionLocal() as db:
        user = User(
            first_name="Assignment",
            last_name="Agent",
            mobile=unique_mobile(),
            email=f"assignment-agent-{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = AgentProfile(
            auth_user_uuid=user.id,
            agent_code=f"AG-{uuid.uuid4().hex[:8]}",
            business_line=line,
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return profile


async def _seed_telecaller(line: str = "loans", *, active: bool = True) -> StaffProfile:
    async with db_session.AsyncSessionLocal() as db:
        user = User(
            first_name="Assignment",
            last_name="Telecaller",
            mobile=unique_mobile(),
            email=f"assignment-tc-{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = StaffProfile(
            auth_user_uuid=user.id,
            role=StaffRole.TELECALLER,
            scope=ProfileScope.LINE,
            business_line=line,
            staff_code=f"TC-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE if active else ProfileStatus.INACTIVE,
        )
        db.add(profile)
        await db.commit()
        return profile


@pytest.fixture(autouse=True)
def _silence_assignment_notifications(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _noop(**_kwargs: object) -> None:
        return None

    monkeypatch.setattr("app.services.leads.emit_notification", _noop)


@pytest.mark.asyncio
async def test_agent_leads_rotate_in_stable_order_independent_of_workload() -> None:
    telecallers = [await _seed_telecaller("loans") for _ in range(3)]
    await _seed_telecaller("real_estate")

    async with db_session.AsyncSessionLocal() as db:
        db.add(
            Lead(
                mobile=unique_mobile(),
                business_line="loans",
                status=LeadStatus.WORKING,
                assigned_telecaller_profile_uuid=telecallers[0].id,
            )
        )
        await db.commit()

    leads = []
    for _ in range(6):
        agent = await _seed_agent("loans")
        leads.append(
            await capture_agent_lead(
                mobile=unique_mobile(),
                name="Introduced Client",
                business_line="loans",
                agent_profile_uuid=agent.id,
                requirement={"notes": "Home loan"},
            )
        )

    assert [lead.assigned_telecaller_profile_uuid for lead in leads] == [
        telecallers[0].id,
        telecallers[1].id,
        telecallers[2].id,
        telecallers[0].id,
        telecallers[1].id,
        telecallers[2].id,
    ]
    assert all(lead.status == LeadStatus.ASSIGNED for lead in leads)
    async with db_session.AsyncSessionLocal() as db:
        audit_count = await db.scalar(
            select(func.count())
            .select_from(AuditLog)
            .where(
                AuditLog.entity_uuid.in_([lead.id for lead in leads]),
                AuditLog.action == AuditAction.LEAD_ASSIGNED,
                AuditLog.actor_uuid.is_(None),
            )
        )
    assert audit_count == 6


@pytest.mark.asyncio
async def test_round_robin_skips_inactive_telecaller_and_rejoins_in_order() -> None:
    first = await _seed_telecaller("loans")
    second = await _seed_telecaller("loans", active=False)
    third = await _seed_telecaller("loans")
    agents = [await _seed_agent("loans") for _ in range(4)]

    leads = []
    for agent in agents[:2]:
        leads.append(
            await capture_agent_lead(
                mobile=unique_mobile(),
                name=None,
                business_line="loans",
                agent_profile_uuid=agent.id,
                requirement=None,
            )
        )

    async with db_session.AsyncSessionLocal() as db:
        stored = await db.get(StaffProfile, second.id)
        assert stored is not None
        stored.status = ProfileStatus.ACTIVE
        await db.commit()

    for agent in agents[2:]:
        leads.append(
            await capture_agent_lead(
                mobile=unique_mobile(),
                name=None,
                business_line="loans",
                agent_profile_uuid=agent.id,
                requirement=None,
            )
        )

    assert [lead.assigned_telecaller_profile_uuid for lead in leads] == [
        first.id,
        third.id,
        first.id,
        second.id,
    ]


@pytest.mark.asyncio
async def test_business_lines_advance_independent_round_robin_cursors() -> None:
    loans = [await _seed_telecaller("loans") for _ in range(2)]
    real_estate = [await _seed_telecaller("real_estate") for _ in range(2)]
    assignments: dict[str, list[uuid.UUID | None]] = {"loans": [], "real_estate": []}

    for line in ("loans", "real_estate", "loans", "real_estate"):
        agent = await _seed_agent(line)
        lead = await capture_agent_lead(
            mobile=unique_mobile(),
            name=None,
            business_line=line,
            agent_profile_uuid=agent.id,
            requirement=None,
        )
        assignments[line].append(lead.assigned_telecaller_profile_uuid)

    assert assignments == {
        "loans": [loans[0].id, loans[1].id],
        "real_estate": [real_estate[0].id, real_estate[1].id],
    }


@pytest.mark.asyncio
async def test_manual_assignment_does_not_consume_automatic_turn() -> None:
    first = await _seed_telecaller("loans")
    second = await _seed_telecaller("loans")
    actor = await _seed_agent("loans")

    async with db_session.AsyncSessionLocal() as db:
        manually_assigned = Lead(
            mobile=unique_mobile(),
            business_line="loans",
            status=LeadStatus.NEW,
            origin=LeadOrigin.DIRECT,
        )
        db.add(manually_assigned)
        await db.commit()
        await assign_lead_to_telecaller(
            db,
            manually_assigned.id,
            second.id,
            actor_uuid=actor.auth_user_uuid,
            actor_role="admin",
        )

    automatic_agent = await _seed_agent("loans")
    automatically_assigned = await capture_agent_lead(
        mobile=unique_mobile(),
        name=None,
        business_line="loans",
        agent_profile_uuid=automatic_agent.id,
        requirement=None,
    )

    assert manually_assigned.assigned_telecaller_profile_uuid == second.id
    assert automatically_assigned.assigned_telecaller_profile_uuid == first.id


@pytest.mark.asyncio
async def test_direct_line_capture_is_assigned_immediately() -> None:
    telecaller = await _seed_telecaller("real_estate")
    mobile = unique_mobile()

    assert await capture_lead(
        mobile,
        name="Direct Enquiry",
        business_line="real_estate",
        requirement={"property_ref": "listing-123"},
    )

    async with db_session.AsyncSessionLocal() as db:
        lead = await db.scalar(
            select(Lead).where(
                Lead.mobile == mobile,
                Lead.business_line == "real_estate",
                Lead.status != LeadStatus.CLOSED,
            )
        )
        assert lead is not None
        assert lead.status == LeadStatus.ASSIGNED
        assert lead.assigned_telecaller_profile_uuid == telecaller.id
        audit_count = await db.scalar(
            select(func.count())
            .select_from(AuditLog)
            .where(
                AuditLog.entity_uuid == lead.id,
                AuditLog.action == AuditAction.LEAD_ASSIGNED,
                AuditLog.actor_uuid.is_(None),
            )
        )
    assert audit_count == 1

    assert await capture_lead(
        mobile,
        name="Anonymous Rewrite",
        business_line="real_estate",
        requirement={"property_ref": "attacker-controlled"},
    )
    async with db_session.AsyncSessionLocal() as db:
        lead = await db.scalar(
            select(Lead).where(
                Lead.mobile == mobile,
                Lead.business_line == "real_estate",
                Lead.status != LeadStatus.CLOSED,
            )
        )
        assert lead is not None
        assert lead.status == LeadStatus.ASSIGNED
        assert lead.assigned_telecaller_profile_uuid == telecaller.id
        assert lead.name == "Direct Enquiry"
        assert lead.requirement == {"property_ref": "listing-123"}


@pytest.mark.asyncio
async def test_no_eligible_telecaller_keeps_agent_lead_in_queue() -> None:
    await _seed_telecaller("loans", active=False)
    agent = await _seed_agent("loans")

    lead = await capture_agent_lead(
        mobile=unique_mobile(),
        name=None,
        business_line="loans",
        agent_profile_uuid=agent.id,
        requirement=None,
    )

    assert lead.status == LeadStatus.NEW
    assert lead.assigned_telecaller_profile_uuid is None


@pytest.mark.asyncio
async def test_retry_job_assigns_a_previously_queued_lead() -> None:
    agent = await _seed_agent("loans")
    lead = await capture_agent_lead(
        mobile=unique_mobile(),
        name=None,
        business_line="loans",
        agent_profile_uuid=agent.id,
        requirement=None,
    )
    async with db_session.AsyncSessionLocal() as db:
        queued = await db.get(Lead, lead.id)
        assert queued is not None
        queued.created_at = datetime(2000, 1, 1, tzinfo=UTC)
        await db.commit()
    telecaller = await _seed_telecaller("loans")

    async with db_session.AsyncSessionLocal() as db:
        attempted, notices = await _assign_batch(db)

    assert attempted >= 1
    assert any(notice.lead_id == lead.id for notice in notices)
    async with db_session.AsyncSessionLocal() as db:
        refreshed = await db.get(Lead, lead.id)
        assert refreshed is not None
        assert refreshed.assigned_telecaller_profile_uuid == telecaller.id


@pytest.mark.asyncio
async def test_registration_binds_agent_lead_after_mobile_otp(client: AsyncClient) -> None:
    agent = await _seed_agent("loans")
    await _seed_telecaller("loans")
    mobile = unique_mobile()
    lead = await capture_agent_lead(
        mobile=mobile,
        name="OTP Owner",
        business_line="loans",
        agent_profile_uuid=agent.id,
        requirement=None,
    )

    await full_registration(client, mobile=mobile, lines=["loans"])

    async with db_session.AsyncSessionLocal() as db:
        refreshed = await db.get(Lead, lead.id)
        assert refreshed is not None
        assert refreshed.client_profile_uuid is not None
        profile_line = await db.scalar(
            select(ClientProfile.business_line).where(
                ClientProfile.id == refreshed.client_profile_uuid
            )
        )
        assert profile_line == "loans"
        assert refreshed.origin_agent_profile_uuid == agent.id


@pytest.mark.asyncio
async def test_registration_binding_survives_assignee_deactivation(
    client: AsyncClient,
) -> None:
    agent = await _seed_agent("loans")
    telecaller = await _seed_telecaller("loans")
    mobile = unique_mobile()
    lead = await capture_agent_lead(
        mobile=mobile,
        name="OTP Owner",
        business_line="loans",
        agent_profile_uuid=agent.id,
        requirement=None,
    )
    async with db_session.AsyncSessionLocal() as db:
        stored_telecaller = await db.get(StaffProfile, telecaller.id)
        assert stored_telecaller is not None
        stored_telecaller.status = ProfileStatus.INACTIVE
        await db.commit()

    await full_registration(client, mobile=mobile, lines=["loans"])

    async with db_session.AsyncSessionLocal() as db:
        refreshed = await db.get(Lead, lead.id)
        assert refreshed is not None
        assert refreshed.client_profile_uuid is not None
        assert refreshed.assigned_telecaller_profile_uuid == telecaller.id


@pytest.mark.asyncio
async def test_direct_both_intent_creates_independent_assigned_journeys(
    client: AsyncClient,
) -> None:
    loans_tc = await _seed_telecaller("loans")
    real_estate_tc = await _seed_telecaller("real_estate")
    _access, mobile = await full_registration(client, lines=["loans", "real_estate"])

    async with db_session.AsyncSessionLocal() as db:
        leads = list(
            (
                await db.scalars(
                    select(Lead)
                    .where(Lead.mobile == mobile, Lead.status != LeadStatus.CLOSED)
                    .order_by(Lead.business_line)
                )
            ).all()
        )
    assert [(lead.business_line, lead.assigned_telecaller_profile_uuid) for lead in leads] == [
        ("loans", loans_tc.id),
        ("real_estate", real_estate_tc.id),
    ]
    assert all(lead.client_profile_uuid is not None for lead in leads)


@pytest.mark.asyncio
async def test_concurrent_assignment_consumes_each_round_robin_turn_once() -> None:
    telecallers = [await _seed_telecaller("loans") for _ in range(3)]
    agents = [await _seed_agent("loans") for _ in range(6)]

    leads = await asyncio.gather(
        *[
            capture_agent_lead(
                mobile=unique_mobile(),
                name=None,
                business_line="loans",
                agent_profile_uuid=agent.id,
                requirement=None,
            )
            for agent in agents
        ]
    )

    counts = Counter(lead.assigned_telecaller_profile_uuid for lead in leads)
    assert counts == Counter({telecaller.id: 2 for telecaller in telecallers})


@pytest.mark.asyncio
async def test_cursor_state_is_unreachable_to_api_user() -> None:
    async with db_session.AsyncSessionLocal() as db:
        grants = list(
            (
                await db.scalars(
                    text(
                        "SELECT privilege_type "
                        "FROM information_schema.role_table_grants "
                        "WHERE table_schema = 'public' "
                        "AND table_name = 'lead_assignment_cursors' "
                        "AND grantee = 'api_user'"
                    )
                )
            ).all()
        )
        rls = (
            await db.execute(
                text(
                    "SELECT relrowsecurity, relforcerowsecurity FROM pg_class "
                    "WHERE relname = 'lead_assignment_cursors'"
                )
            )
        ).one()

    assert grants == []
    assert rls == (True, True)

    async with db_session.engine.connect() as connection:
        transaction = await connection.begin()
        try:
            await connection.execute(text("SET LOCAL ROLE api_user"))
            with pytest.raises(DBAPIError):
                await connection.execute(text("SELECT * FROM lead_assignment_cursors"))
        finally:
            await transaction.rollback()


@pytest.mark.asyncio
async def test_database_rejects_cross_line_assignment_cursor() -> None:
    await _seed_telecaller("loans")
    real_estate = await _seed_telecaller("real_estate")

    async with db_session.AsyncSessionLocal() as db:
        cursor = await db.get(LeadAssignmentCursor, "loans")
        assert cursor is not None
        cursor.last_telecaller_profile_uuid = real_estate.id
        with pytest.raises(DBAPIError):
            await db.commit()
        await db.rollback()


@pytest.mark.asyncio
async def test_terminal_lead_is_never_automatically_reassigned() -> None:
    await _seed_telecaller("loans")
    async with db_session.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=unique_mobile(),
            business_line="loans",
            status=LeadStatus.CONVERTED,
            origin=LeadOrigin.DIRECT,
        )
        db.add(lead)
        await db.flush()

        notice = await auto_assign_locked_lead(db, lead)
        await db.commit()

    assert notice is None
    assert lead.status == LeadStatus.CONVERTED
    assert lead.assigned_telecaller_profile_uuid is None


@pytest.mark.asyncio
async def test_database_rejects_cross_line_assignee() -> None:
    telecaller = await _seed_telecaller("real_estate")
    async with db_session.AsyncSessionLocal() as db:
        db.add(
            Lead(
                mobile=unique_mobile(),
                business_line="loans",
                status=LeadStatus.ASSIGNED,
                origin=LeadOrigin.DIRECT,
                assigned_telecaller_profile_uuid=telecaller.id,
            )
        )
        with pytest.raises(DBAPIError):
            await db.commit()
        await db.rollback()
