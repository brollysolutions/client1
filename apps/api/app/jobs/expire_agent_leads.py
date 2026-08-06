"""Expire overdue Agent attribution and return leads to the open pool (FR-4.6).

The operational Lead.status axis is intentionally preserved: expiry writes
RELEASED so the existing Admin queue can assign the lead normally, while
agent_expired_at permanently records that the originating Agent's protection
window ended. Later assignment does not restart or re-run expiry.

Each bounded batch is claimed and updated by one ``UPDATE ... FROM`` statement
fed by a ``FOR UPDATE SKIP LOCKED`` CTE. The status/deadline predicates are
evaluated while the rows are locked, so a concurrent converted/closed commit is
re-checked and never overwritten. ``agent_expired_at IS NULL`` makes retries and
multiple scheduler replicas idempotent. Audit rows share the same transaction;
best-effort notifications are emitted only after it commits.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

import app.db.session as db_session
from app.models.audit_log import AuditAction
from app.models.lead import Lead, LeadStatus
from app.models.notification import NotificationType
from app.models.profile import AgentProfile, StaffProfile
from app.services.audit_log import record
from app.services.notifications import emit_notification

logger = logging.getLogger("scheduler")

_BATCH_SIZE = 500
_RELEASE_REASON = "Agent ownership window expired."


@dataclass(frozen=True)
class _ExpiredLead:
    lead_id: UUID
    agent_user_uuid: UUID | None
    telecaller_user_uuid: UUID | None


async def _profile_users(
    session: AsyncSession,
    *,
    agent_profile_ids: set[UUID],
    telecaller_profile_ids: set[UUID],
) -> tuple[dict[UUID, UUID], dict[UUID, UUID]]:
    agent_users = dict(
        (
            await session.execute(
                select(AgentProfile.id, AgentProfile.auth_user_uuid).where(
                    AgentProfile.id.in_(agent_profile_ids)
                )
            )
        ).all()
    )
    telecaller_users = dict(
        (
            await session.execute(
                select(StaffProfile.id, StaffProfile.auth_user_uuid).where(
                    StaffProfile.id.in_(telecaller_profile_ids)
                )
            )
        ).all()
    )
    return agent_users, telecaller_users


async def _expire_batch(session: AsyncSession) -> list[_ExpiredLead]:
    due = (
        select(
            Lead.id.label("lead_id"),
            Lead.business_line.label("business_line"),
            Lead.origin_agent_profile_uuid.label("agent_profile_id"),
            Lead.assigned_telecaller_profile_uuid.label("telecaller_profile_id"),
            Lead.status.label("previous_status"),
        )
        .where(
            Lead.expires_at.is_not(None),
            Lead.expires_at <= func.now(),
            Lead.agent_expired_at.is_(None),
            Lead.status.not_in((LeadStatus.CONVERTED, LeadStatus.CLOSED)),
        )
        .order_by(Lead.expires_at, Lead.id)
        .limit(_BATCH_SIZE)
        .with_for_update(skip_locked=True)
        .cte("due_agent_leads")
    )
    rows = (
        await session.execute(
            update(Lead)
            .where(Lead.id == due.c.lead_id)
            .values(
                assigned_telecaller_profile_uuid=None,
                status=LeadStatus.RELEASED,
                released_at=func.now(),
                release_reason=_RELEASE_REASON,
                agent_expired_at=func.now(),
                updated_at=func.now(),
            )
            .returning(
                Lead.id,
                Lead.business_line,
                due.c.agent_profile_id,
                due.c.telecaller_profile_id,
                due.c.previous_status,
            )
            .execution_options(synchronize_session=False)
        )
    ).all()
    if not rows:
        await session.rollback()
        return []

    agent_users, telecaller_users = await _profile_users(
        session,
        agent_profile_ids={row.agent_profile_id for row in rows if row.agent_profile_id},
        telecaller_profile_ids={
            row.telecaller_profile_id for row in rows if row.telecaller_profile_id
        },
    )
    for row in rows:
        await record(
            session,
            action=AuditAction.AGENT_LEAD_EXPIRED,
            entity_type="lead",
            entity_uuid=row.id,
            actor_uuid=None,
            actor_role=None,
            business_line=row.business_line,
            detail={
                "previous_status": row.previous_status.value,
                "previous_telecaller_profile_uuid": (
                    str(row.telecaller_profile_id) if row.telecaller_profile_id else None
                ),
            },
        )
    await session.commit()

    return [
        _ExpiredLead(
            lead_id=row.id,
            agent_user_uuid=agent_users.get(row.agent_profile_id),
            telecaller_user_uuid=telecaller_users.get(row.telecaller_profile_id),
        )
        for row in rows
    ]


async def _notify(expired: _ExpiredLead) -> None:
    if expired.agent_user_uuid is not None:
        await emit_notification(
            user_uuid=expired.agent_user_uuid,
            notification_type=NotificationType.AGENT_LEAD_EXPIRED,
            title="Lead ownership expired",
            body="Your lead's conversion window ended and it returned to the open pool.",
            href=f"/dashboard/leads/{expired.lead_id}",
        )
    if expired.telecaller_user_uuid is not None:
        await emit_notification(
            user_uuid=expired.telecaller_user_uuid,
            notification_type=NotificationType.LEAD_RELEASED,
            title="Lead returned to the open pool",
            body="An assigned lead reached its Agent conversion deadline.",
            href="/dashboard/leads",
        )


async def expire_agent_leads() -> dict[str, int]:
    started = time.monotonic()
    logger.info("job.expire_agent_leads.start")
    expired_count = 0
    try:
        while True:
            async with db_session.AsyncSessionLocal() as session:
                expired = await _expire_batch(session)
            for row in expired:
                await _notify(row)
            expired_count += len(expired)
            if len(expired) < _BATCH_SIZE:
                break
    except Exception:
        logger.exception("job.expire_agent_leads.failed")
        raise
    else:
        logger.info(
            "job.expire_agent_leads.success expired=%d duration_ms=%d",
            expired_count,
            (time.monotonic() - started) * 1000,
        )
        return {"expired": expired_count}
