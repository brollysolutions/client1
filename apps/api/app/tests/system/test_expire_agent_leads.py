"""Agent-lead expiry scheduler integration tests (FR-4.6)."""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.jobs.expire_agent_leads import expire_agent_leads
from app.models.audit_log import AuditAction, AuditLog
from app.models.lead import Lead, LeadOrigin, LeadStatus
from app.models.notification import Notification, NotificationType
from app.models.profile import (
    AgentProfile,
    ProfileScope,
    ProfileStatus,
    StaffProfile,
    StaffRole,
)
from app.models.user import User
from conftest import unique_mobile


async def _seed_people() -> tuple[AgentProfile, StaffProfile]:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        agent_user = User(
            first_name="Expiry",
            last_name="Agent",
            mobile=unique_mobile(),
            email=f"expiry-agent-{uuid.uuid4().hex[:10]}@example.com",
            password_hash="x",
        )
        telecaller_user = User(
            first_name="Expiry",
            last_name="Telecaller",
            mobile=unique_mobile(),
            email=f"expiry-tc-{uuid.uuid4().hex[:10]}@example.com",
            password_hash="x",
        )
        db.add_all([agent_user, telecaller_user])
        await db.flush()
        agent = AgentProfile(
            auth_user_uuid=agent_user.id,
            agent_code=f"AG-{uuid.uuid4().hex[:8]}",
            business_line="loans",
            status=ProfileStatus.ACTIVE,
        )
        telecaller = StaffProfile(
            auth_user_uuid=telecaller_user.id,
            role=StaffRole.TELECALLER,
            scope=ProfileScope.LINE,
            business_line="loans",
            staff_code=f"TC-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add_all([agent, telecaller])
        await db.commit()
        return agent, telecaller


async def _seed_lead(
    *,
    agent: AgentProfile | None,
    telecaller: StaffProfile | None = None,
    status: LeadStatus = LeadStatus.NEW,
    due: bool = True,
    already_expired: bool = False,
) -> uuid.UUID:
    import app.db.session as _session_mod

    now = datetime.now(UTC)
    async with _session_mod.AsyncSessionLocal() as db:
        lead = Lead(
            mobile=unique_mobile(),
            business_line="loans",
            origin=LeadOrigin.AGENT if agent else LeadOrigin.DIRECT,
            origin_agent_profile_uuid=agent.id if agent else None,
            assigned_telecaller_profile_uuid=telecaller.id if telecaller else None,
            status=status,
            expires_at=now + timedelta(minutes=-1 if due else 30) if agent else None,
            agent_expired_at=now - timedelta(minutes=2) if already_expired else None,
        )
        db.add(lead)
        await db.commit()
        return lead.id


async def _load_lead(lead_id: uuid.UUID) -> Lead:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        lead = await db.get(Lead, lead_id)
        assert lead is not None
        return lead


@pytest.mark.asyncio
async def test_due_working_lead_returns_to_pool_with_audit_and_notifications(
    client: AsyncClient,
) -> None:
    import app.db.session as _session_mod

    agent, telecaller = await _seed_people()
    lead_id = await _seed_lead(agent=agent, telecaller=telecaller, status=LeadStatus.WORKING)

    summary = await expire_agent_leads()
    assert summary["expired"] >= 1

    lead = await _load_lead(lead_id)
    assert lead.status == LeadStatus.RELEASED
    assert lead.assigned_telecaller_profile_uuid is None
    assert lead.agent_expired_at is not None
    assert lead.released_at is not None
    assert lead.release_reason == "Agent ownership window expired."
    assert lead.origin_agent_profile_uuid == agent.id
    assert lead.business_line == "loans"

    async with _session_mod.AsyncSessionLocal() as db:
        audit_count = await db.scalar(
            select(func.count())
            .select_from(AuditLog)
            .where(
                AuditLog.entity_uuid == lead_id,
                AuditLog.action == AuditAction.AGENT_LEAD_EXPIRED,
                AuditLog.actor_uuid.is_(None),
            )
        )
        agent_notice = await db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.user_uuid == agent.auth_user_uuid,
                Notification.type == NotificationType.AGENT_LEAD_EXPIRED,
            )
        )
        telecaller_notice = await db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(
                Notification.user_uuid == telecaller.auth_user_uuid,
                Notification.type == NotificationType.LEAD_RELEASED,
            )
        )
    assert audit_count == 1
    assert agent_notice == 1
    assert telecaller_notice == 1

    await expire_agent_leads()
    async with _session_mod.AsyncSessionLocal() as db:
        repeated_audit_count = await db.scalar(
            select(func.count())
            .select_from(AuditLog)
            .where(
                AuditLog.entity_uuid == lead_id,
                AuditLog.action == AuditAction.AGENT_LEAD_EXPIRED,
            )
        )
    assert repeated_audit_count == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [LeadStatus.NEW, LeadStatus.ASSIGNED, LeadStatus.RELEASED])
async def test_each_open_status_expires(status: LeadStatus, client: AsyncClient) -> None:
    agent, telecaller = await _seed_people()
    lead_id = await _seed_lead(
        agent=agent,
        telecaller=telecaller if status == LeadStatus.ASSIGNED else None,
        status=status,
    )

    await expire_agent_leads()

    lead = await _load_lead(lead_id)
    assert lead.status == LeadStatus.RELEASED
    assert lead.assigned_telecaller_profile_uuid is None
    assert lead.agent_expired_at is not None


@pytest.mark.asyncio
async def test_future_terminal_and_direct_leads_are_untouched(client: AsyncClient) -> None:
    agent, _ = await _seed_people()
    future_id = await _seed_lead(agent=agent, due=False)
    converted_id = await _seed_lead(agent=agent, status=LeadStatus.CONVERTED)
    closed_id = await _seed_lead(agent=agent, status=LeadStatus.CLOSED)
    direct_id = await _seed_lead(agent=None)

    await expire_agent_leads()

    assert (await _load_lead(future_id)).agent_expired_at is None
    assert (await _load_lead(converted_id)).status == LeadStatus.CONVERTED
    assert (await _load_lead(converted_id)).agent_expired_at is None
    assert (await _load_lead(closed_id)).status == LeadStatus.CLOSED
    assert (await _load_lead(closed_id)).agent_expired_at is None
    assert (await _load_lead(direct_id)).status == LeadStatus.NEW


@pytest.mark.asyncio
async def test_reassigned_expired_lead_does_not_expire_again(client: AsyncClient) -> None:
    agent, telecaller = await _seed_people()
    lead_id = await _seed_lead(
        agent=agent,
        telecaller=telecaller,
        status=LeadStatus.ASSIGNED,
        already_expired=True,
    )

    await expire_agent_leads()

    lead = await _load_lead(lead_id)
    assert lead.status == LeadStatus.ASSIGNED
    assert lead.assigned_telecaller_profile_uuid == telecaller.id


@pytest.mark.asyncio
async def test_live_per_line_index_rejects_released_and_new_duplicate(
    client: AsyncClient,
) -> None:
    import app.db.session as _session_mod

    agent, _ = await _seed_people()
    mobile = unique_mobile()
    now = datetime.now(UTC)
    async with _session_mod.AsyncSessionLocal() as db:
        expired_candidate = Lead(
            mobile=mobile,
            business_line="loans",
            origin=LeadOrigin.AGENT,
            origin_agent_profile_uuid=agent.id,
            status=LeadStatus.RELEASED,
            expires_at=now - timedelta(minutes=1),
        )
        active_duplicate = Lead(
            mobile=mobile,
            business_line="loans",
            origin=LeadOrigin.DIRECT,
            status=LeadStatus.NEW,
        )
        db.add_all([expired_candidate, active_duplicate])
        with pytest.raises(IntegrityError, match="uq_leads_mobile_line_live"):
            await db.commit()


@pytest.mark.asyncio
async def test_database_trigger_rejects_clock_reset_racing_with_expiry(
    client: AsyncClient,
) -> None:
    """Reject an insert that waits for a concurrent expiry to free the index."""
    import app.db.session as _session_mod

    agent, _ = await _seed_people()
    mobile = unique_mobile()
    now = datetime.now(UTC)
    async with _session_mod.AsyncSessionLocal() as seed_db:
        old_lead = Lead(
            mobile=mobile,
            business_line="loans",
            origin=LeadOrigin.AGENT,
            origin_agent_profile_uuid=agent.id,
            status=LeadStatus.NEW,
            expires_at=now - timedelta(minutes=1),
        )
        seed_db.add(old_lead)
        await seed_db.commit()
        old_lead_id = old_lead.id

    async def attempt_reset() -> None:
        async with _session_mod.AsyncSessionLocal() as insert_db:
            insert_db.add(
                Lead(
                    mobile=mobile,
                    business_line="loans",
                    origin=LeadOrigin.AGENT,
                    origin_agent_profile_uuid=agent.id,
                    status=LeadStatus.NEW,
                    expires_at=now + timedelta(days=30),
                )
            )
            await insert_db.commit()

    async with _session_mod.AsyncSessionLocal() as expiry_db:
        old = await expiry_db.get(Lead, old_lead_id, with_for_update=True)
        assert old is not None
        old.status = LeadStatus.RELEASED
        old.agent_expired_at = now
        old.released_at = now
        await expiry_db.flush()
        insert_task = asyncio.create_task(attempt_reset())
        await asyncio.sleep(0.1)
        assert not insert_task.done(), "INSERT did not wait on the active-mobile index"
        await expiry_db.commit()

    with pytest.raises(IntegrityError):
        await insert_task

    async with _session_mod.AsyncSessionLocal() as verify_db:
        matching = (await verify_db.scalars(select(Lead).where(Lead.mobile == mobile))).all()
    assert [lead.id for lead in matching] == [old_lead_id]


@pytest.mark.asyncio
async def test_database_trigger_rejects_agent_clock_reset(client: AsyncClient) -> None:
    import app.db.session as _session_mod

    agent, _ = await _seed_people()
    mobile = unique_mobile()
    now = datetime.now(UTC)
    async with _session_mod.AsyncSessionLocal() as db:
        db.add(
            Lead(
                mobile=mobile,
                business_line="loans",
                origin=LeadOrigin.AGENT,
                origin_agent_profile_uuid=agent.id,
                status=LeadStatus.RELEASED,
                expires_at=now - timedelta(days=1),
                agent_expired_at=now,
            )
        )
        await db.commit()

    async with _session_mod.AsyncSessionLocal() as db:
        db.add(
            Lead(
                mobile=mobile,
                business_line="loans",
                origin=LeadOrigin.AGENT,
                origin_agent_profile_uuid=agent.id,
                status=LeadStatus.NEW,
                expires_at=now + timedelta(days=30),
            )
        )
        with pytest.raises(Exception):  # noqa: B017 — database trigger is the backstop
            await db.commit()
