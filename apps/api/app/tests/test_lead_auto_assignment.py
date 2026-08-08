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
from sqlalchemy import func, select, update
from sqlalchemy.exc import DBAPIError

import app.db.session as db_session
from app.jobs.assign_unassigned_leads import _assign_batch
from app.models.audit_log import AuditAction, AuditLog
from app.models.lead import Lead, LeadOrigin, LeadStatus
from app.models.profile import (
    AgentProfile,
    ClientProfile,
    ProfileScope,
    ProfileStatus,
    StaffProfile,
    StaffRole,
)
from app.models.user import User
from app.services.leads import auto_assign_locked_lead, capture_agent_lead, capture_lead
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
async def test_agent_lead_uses_least_loaded_same_line_telecaller() -> None:
    busy = await _seed_telecaller("loans")
    available = await _seed_telecaller("loans")
    await _seed_telecaller("real_estate")
    agent = await _seed_agent("loans")

    async with db_session.AsyncSessionLocal() as db:
        db.add(
            Lead(
                mobile=unique_mobile(),
                business_line="loans",
                status=LeadStatus.WORKING,
                assigned_telecaller_profile_uuid=busy.id,
            )
        )
        await db.commit()

    lead = await capture_agent_lead(
        mobile=unique_mobile(),
        name="Introduced Client",
        business_line="loans",
        agent_profile_uuid=agent.id,
        requirement={"notes": "Home loan"},
    )

    assert lead.status == LeadStatus.ASSIGNED
    assert lead.assigned_telecaller_profile_uuid == available.id
    async with db_session.AsyncSessionLocal() as db:
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
async def test_concurrent_assignment_keeps_workloads_balanced() -> None:
    telecallers = [await _seed_telecaller("loans") for _ in range(2)]
    agents = [await _seed_agent("loans") for _ in range(4)]

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
    assert set(counts) == {telecaller.id for telecaller in telecallers}
    assert max(counts.values()) - min(counts.values()) <= 1


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
