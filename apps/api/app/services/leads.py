"""Lead capture — durable, best-effort persistence of every enquiring mobile.

Called at the top of every auth entry point (register/initiate, login,
forgot/initiate) so no number is lost, even if the user never completes the flow.

Design notes:
  * Runs on its OWN session (not the request session). login/forgot raise
    HTTPException on the unknown-mobile path, and get_db rolls the request session
    back — a lead written there would be discarded. An independent session commits
    regardless of the request outcome.
  * That session connects as the 'app' superuser (DATABASE_URL), which bypasses RLS,
    so the unauthenticated INSERT always succeeds — same mechanism as the existing
    unauthenticated AuthEvent insert.
  * Idempotent via the partial-unique index on (mobile) WHERE status NOT IN
    ('closed','released'): ON CONFLICT enriches name/business_line (COALESCE keeps
    known values) and touches updated_at as a last-seen marker.
  * Best-effort: all errors are swallowed so capture can never break or slow-fail
    the auth response (which would also leak timing — see enumeration-safety).
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import case, func, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.masking import mask_mobile
from app.db.session import AsyncSessionLocal
from app.models.lead import Lead, LeadStatus
from app.models.notification import NotificationType
from app.models.profile import ClientProfile, ProfileStatus, StaffProfile, StaffRole
from app.models.user import User
from app.services.notifications import emit_notification

logger = logging.getLogger(__name__)

_ACTIVE_PREDICATE = "status NOT IN ('closed', 'released')"


class LeadNotFound(Exception):
    """Raised when the target lead id doesn't exist."""


class LeadAlreadyAssigned(Exception):
    """Raised when the lead already has a telecaller (no reassignment this slice)."""


class LeadHasNoBusinessLine(Exception):
    """Raised when the lead's line hasn't been triaged yet (business_line NULL)."""


class InvalidTelecaller(Exception):
    """Raised when the target staff profile isn't an active telecaller on the lead's line."""


async def capture_lead(
    mobile: str,
    *,
    name: str | None = None,
    business_line: str | None = None,
    origin: str = "direct",
    origin_agent_profile_uuid: str | None = None,
    requirement: dict[str, Any] | None = None,
) -> bool:
    """Insert-or-enrich a lead for this mobile. Never raises.

    Returns True when the write committed, False when it was swallowed — auth
    callers ignore this (capture must never break the auth flow); the public
    leads endpoint logs on False but still answers 202 (the visitor can do
    nothing useful with a storage error, and the failure is already logged
    with a traceback here for ops).
    """
    try:
        async with AsyncSessionLocal() as session:
            stmt = pg_insert(Lead).values(
                mobile=mobile,
                name=name,
                business_line=business_line,
                origin=origin,
                origin_agent_profile_uuid=origin_agent_profile_uuid,
                status="new",
                requirement=requirement,
            )
            # Agent-sourced captures are the only caller allowed to mutate an
            # EXISTING active lead through this bypass session, and only within
            # strict bounds: same business_line, not yet locked by a telecaller,
            # and not already attributed to a DIFFERENT agent. This session has
            # no RLS (it's the 'app' superuser), so the guard must be a SQL
            # predicate on the conflicting row itself — a pre-check-then-update
            # would race. When this predicate is false, Postgres leaves the
            # conflicting row completely untouched (0 rows affected, no error);
            # introduce_lead's re-select then finds nothing and raises
            # LeadCaptureFailed (409), exactly like a genuine cross-line conflict.
            conflict_guard = None
            if origin_agent_profile_uuid is not None:
                conflict_guard = (
                    (Lead.business_line == business_line)
                    & Lead.assigned_telecaller_profile_uuid.is_(None)
                    & (
                        Lead.origin_agent_profile_uuid.is_(None)
                        | (Lead.origin_agent_profile_uuid == origin_agent_profile_uuid)
                    )
                )
            stmt = stmt.on_conflict_do_update(
                index_elements=[Lead.mobile],
                index_where=text(_ACTIVE_PREDICATE),
                set_={
                    "name": func.coalesce(stmt.excluded.name, Lead.name),
                    # Keep the FIRST-set line: only fill business_line when the
                    # existing lead has none. business_line is immutable once set
                    # (a DB trigger enforces this), so preferring the incoming value
                    # would raise on a cross-line re-enquiry and — since capture is
                    # best-effort/swallowed — silently drop the lead.
                    "business_line": func.coalesce(Lead.business_line, stmt.excluded.business_line),
                    # Same first-write-wins discipline: an agent introducing an
                    # already-known mobile enriches the lead but never steals
                    # attribution from whichever origin touched it first.
                    "origin_agent_profile_uuid": func.coalesce(
                        Lead.origin_agent_profile_uuid, stmt.excluded.origin_agent_profile_uuid
                    ),
                    # Merge requirement JSONB, newest value wins per key; an
                    # incoming NULL leaves the stored blob untouched.
                    "requirement": case(
                        (stmt.excluded.requirement.is_(None), Lead.requirement),
                        else_=func.coalesce(Lead.requirement, text("'{}'::jsonb")).op("||")(
                            stmt.excluded.requirement
                        ),
                    ),
                    "updated_at": func.now(),
                },
                where=conflict_guard,
            )
            await session.execute(stmt)
            await session.commit()
            return True
    except Exception:  # capture is best-effort; never break the auth flow
        logger.warning("lead.capture_failed mobile=%s", mask_mobile(mobile), exc_info=True)
        return False


async def resolve_loans_lead(mobile: str, client_profile_uuid: UUID) -> UUID:
    """Find-or-create the client's loans lead and return its id.

    Every loan_application must hang off a lead (the lead spine — see
    models/lead.py); this is the FK anchor a real "Apply" write needs. Unlike
    capture_lead (auth-flow, best-effort, swallows errors), this RAISES: the
    lead id is a hard requirement for creating a loan application, not a
    best-effort side write.

    Runs on the bypass superuser session, like capture_lead, because a
    not-yet-claimed lead (client_profile_uuid IS NULL — the shape every
    register/login capture leaves it in) is invisible to the client's own
    RLS-scoped session: leads_rls (d4a1b2c3e5f6) has no branch for an
    unclaimed lead under role='client'. Idempotent via the same partial-unique
    index capture_lead relies on (mobile WHERE status NOT IN ('closed',
    'released')); COALESCE only fills business_line/client_profile_uuid when
    unset, respecting the business_line-immutability trigger and never
    reassigning a lead someone else already claimed.
    """
    async with AsyncSessionLocal() as session:
        stmt = pg_insert(Lead).values(
            mobile=mobile,
            business_line="loans",
            client_profile_uuid=client_profile_uuid,
            origin="direct",
            status="new",
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[Lead.mobile],
            index_where=text(_ACTIVE_PREDICATE),
            set_={
                "business_line": func.coalesce(Lead.business_line, stmt.excluded.business_line),
                "client_profile_uuid": func.coalesce(
                    Lead.client_profile_uuid, stmt.excluded.client_profile_uuid
                ),
                "updated_at": func.now(),
            },
        ).returning(Lead.id)
        result = await session.execute(stmt)
        lead_id = result.scalar_one()
        await session.commit()
        return lead_id


async def resolve_realestate_client_profile(mobile: str) -> UUID | None:
    """Find the mobile's real-estate ClientProfile and backfill it onto any
    unclaimed lead for that mobile. Returns None if the mobile isn't a
    registered active real-estate client.

    Unlike resolve_loans_lead (called by the client's OWN request, which
    already knows its client_profile_uuid from the JWT), a telecaller opening
    a property deal only has a Lead row in hand — Lead.client_profile_uuid is
    nullable and, for real-estate leads, never populated by capture_lead. This
    looks the client up by mobile instead, then idempotently claims the lead
    (COALESCE-style: only fills a NULL client_profile_uuid, never overwrites
    one someone else already claimed).

    Runs on the bypass superuser session: the telecaller's own request-scoped
    session cannot see auth_users/client_profiles across RLS, and the
    not-yet-claimed lead itself may be invisible under leads_rls's client
    branch until client_profile_uuid is set.
    """
    async with AsyncSessionLocal() as session:
        client_profile_id = await session.scalar(
            select(ClientProfile.id)
            .join(User, User.id == ClientProfile.auth_user_uuid)
            .where(
                User.mobile == mobile,
                ClientProfile.business_line == "real_estate",
                ClientProfile.status == ProfileStatus.ACTIVE,
            )
        )
        if client_profile_id is None:
            return None
        await session.execute(
            update(Lead)
            .where(Lead.mobile == mobile, Lead.client_profile_uuid.is_(None))
            .values(client_profile_uuid=client_profile_id)
        )
        await session.commit()
        return client_profile_id


async def assign_lead_to_telecaller(
    db: AsyncSession, lead_id: UUID, telecaller_staff_profile_uuid: UUID
) -> Lead:
    """Assign an unassigned lead to a telecaller. Admin-only (core.deps.require_admin).

    Runs on the admin's own request session: their JWT carries platform_scope="true",
    which leads_rls's platform bypass branch accepts, so no bypass superuser session
    is needed (same reasoning services.admin.create_staff already documents). Sends
    a best-effort notification to the telecaller (emit_notification swallows its own
    errors, so a failed notification never blocks the assignment).
    """
    lead = await db.get(Lead, lead_id, with_for_update=True)
    if lead is None:
        raise LeadNotFound
    if lead.assigned_telecaller_profile_uuid is not None:
        raise LeadAlreadyAssigned
    if lead.business_line is None:
        raise LeadHasNoBusinessLine

    telecaller = await db.get(StaffProfile, telecaller_staff_profile_uuid)
    if (
        telecaller is None
        or telecaller.role != StaffRole.TELECALLER
        or telecaller.status != ProfileStatus.ACTIVE
        or telecaller.business_line != lead.business_line
    ):
        raise InvalidTelecaller

    lead.assigned_telecaller_profile_uuid = telecaller.id
    lead.status = LeadStatus.ASSIGNED
    await db.commit()
    await db.refresh(lead)

    await emit_notification(
        user_uuid=telecaller.auth_user_uuid,
        notification_type=NotificationType.LEAD_ASSIGNED,
        title="New lead assigned",
        body=f"A new {lead.business_line} lead has been assigned to you.",
        href="/dashboard/leads",
    )
    return lead
