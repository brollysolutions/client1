"""Lead capture — durable, best-effort persistence of every enquiring mobile.

Called only after a visitor expresses Loans or Real Estate intent. Login and
password-recovery attempts remain authentication events, not sales leads.

Design notes:
  * Runs on its OWN session (not the request session). login/forgot raise
    HTTPException on the unknown-mobile path, and get_db rolls the request session
    back — a lead written there would be discarded. An independent session commits
    regardless of the request outcome.
  * That session connects as the 'app' superuser (DATABASE_URL), which bypasses RLS,
    so the unauthenticated INSERT always succeeds — same mechanism as the existing
    unauthenticated AuthEvent insert.
  * Idempotent through a mobile advisory lock plus per-line live indexes. One
    mobile can have independent Loans and Real Estate journeys.
  * Best-effort: all errors are swallowed so capture can never break or slow-fail
    the auth response (which would also leak timing — see enumeration-safety).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.masking import mask_mobile
from app.db.session import AsyncSessionLocal
from app.models.audit_log import AuditAction
from app.models.lead import Lead, LeadAssignmentCursor, LeadOrigin, LeadStatus
from app.models.notification import NotificationType
from app.models.profile import ClientProfile, ProfileStatus, StaffProfile, StaffRole
from app.models.user import User
from app.services.audit_log import record as record_audit
from app.services.notifications import emit_notification

logger = logging.getLogger(__name__)

_ASSIGNABLE_STATUSES = (LeadStatus.NEW, LeadStatus.RELEASED)
_VALID_LINES = frozenset({"loans", "real_estate"})


@dataclass(frozen=True)
class LeadAssignmentNotice:
    lead_id: UUID
    telecaller_user_uuid: UUID
    business_line: str


class AgentLeadConflict(Exception):
    """The mobile is registered, cross-line, expired, assigned, or owned elsewhere."""


class LeadNotFound(Exception):
    """Raised when the target lead id doesn't exist."""


class LeadAlreadyAssigned(Exception):
    """Raised when the lead already has a telecaller (no reassignment this slice)."""


class LeadHasNoBusinessLine(Exception):
    """Raised when the lead's line hasn't been triaged yet (business_line NULL)."""


class LeadNotAssignable(Exception):
    """Raised when the lead isn't in an assignable status (new/released). Guards
    against the orphaned-FK edge case: a lead whose assigned_telecaller_profile_uuid
    went NULL via ondelete="SET NULL" (e.g. the telecaller's staff profile was
    removed) while status stayed assigned/working/converted/closed must NOT be
    re-assignable via this path — that would silently rewind a forward-only
    lifecycle back to 'assigned'."""


class LeadNotReleasable(Exception):
    """Raised when the lead isn't in a releasable status (assigned/working).

    Deliberately does NOT require assigned_telecaller_profile_uuid to be set —
    unlike LeadNotAssignable's guard (which stops a forward-only lifecycle from
    rewinding through an orphaned FK), an assigned/working lead whose FK already
    went NULL (ondelete="SET NULL", the telecaller's staff profile was removed)
    is exactly the case release_lead_from_telecaller exists to repair: releasing
    it (no target) flips it to RELEASED and re-surfaces it in
    list_unassigned_leads for a normal assign.
    """


class InvalidTelecaller(Exception):
    """Raised when the target staff profile isn't an active telecaller on the lead's line."""


async def lock_lead_mobile(db: AsyncSession, mobile: str) -> None:
    """Serialize identity/lead decisions for one mobile across registration and Agents."""
    await db.scalar(select(func.pg_advisory_xact_lock(func.hashtextextended(mobile, 0))))


async def _lock_assignment_line(db: AsyncSession, business_line: str) -> None:
    await db.scalar(
        select(
            func.pg_advisory_xact_lock(func.hashtextextended(f"lead-assignment:{business_line}", 0))
        )
    )


async def lock_assignment_lines(db: AsyncSession, business_lines: set[str]) -> None:
    """Acquire automatic-assignment locks in one canonical order."""
    for business_line in sorted(business_lines & _VALID_LINES):
        await _lock_assignment_line(db, business_line)


def _merge_requirement(
    existing: dict[str, Any] | None, incoming: dict[str, Any] | None
) -> dict[str, Any] | None:
    if incoming is None:
        return existing
    merged = dict(existing) if isinstance(existing, dict) else {}
    merged.update(incoming)
    return merged


async def _select_round_robin_telecaller(
    db: AsyncSession, business_line: str
) -> StaffProfile | None:
    """Select and advance one durable same-line rotation turn.

    The caller holds the per-line advisory lock. The cursor and lead mutation
    therefore commit or roll back together, so concurrent capture and retry
    paths cannot consume the same turn or advance without an assignment.
    """
    telecallers = list(
        (
            await db.scalars(
                select(StaffProfile)
                .where(
                    StaffProfile.role == StaffRole.TELECALLER,
                    StaffProfile.status == ProfileStatus.ACTIVE,
                    StaffProfile.business_line == business_line,
                )
                .order_by(StaffProfile.created_at, StaffProfile.id)
                .with_for_update()
            )
        ).all()
    )
    if not telecallers:
        return None

    cursor = await db.scalar(
        select(LeadAssignmentCursor)
        .where(LeadAssignmentCursor.business_line == business_line)
        .with_for_update()
    )
    if cursor is None:
        cursor = LeadAssignmentCursor(business_line=business_line)
        db.add(cursor)

    selected = telecallers[0]
    if cursor.last_telecaller_profile_uuid is not None:
        last_profile = await db.get(StaffProfile, cursor.last_telecaller_profile_uuid)
        if last_profile is not None:
            last_key = (last_profile.created_at, last_profile.id)
            selected = next(
                (
                    telecaller
                    for telecaller in telecallers
                    if (telecaller.created_at, telecaller.id) > last_key
                ),
                telecallers[0],
            )

    cursor.last_telecaller_profile_uuid = selected.id
    cursor.updated_at = datetime.now(UTC)
    return selected


async def auto_assign_locked_lead(db: AsyncSession, lead: Lead) -> LeadAssignmentNotice | None:
    """Assign one caller-owned locked lead without committing or notifying."""
    if (
        lead.assigned_telecaller_profile_uuid is not None
        or lead.business_line not in _VALID_LINES
        or lead.status not in _ASSIGNABLE_STATUSES
    ):
        return None

    await _lock_assignment_line(db, lead.business_line)
    telecaller = await _select_round_robin_telecaller(db, lead.business_line)
    if telecaller is None:
        return None

    lead.assigned_telecaller_profile_uuid = telecaller.id
    lead.status = LeadStatus.ASSIGNED
    lead.updated_at = datetime.now(UTC)
    await record_audit(
        db,
        action=AuditAction.LEAD_ASSIGNED,
        entity_type="lead",
        entity_uuid=lead.id,
        actor_uuid=None,
        actor_role=None,
        business_line=lead.business_line,
        detail={
            "mode": "automatic",
            "telecaller_staff_profile_uuid": str(telecaller.id),
        },
    )
    await db.flush()
    return LeadAssignmentNotice(
        lead_id=lead.id,
        telecaller_user_uuid=telecaller.auth_user_uuid,
        business_line=lead.business_line,
    )


async def notify_lead_assignments(notices: list[LeadAssignmentNotice]) -> None:
    for notice in notices:
        await emit_notification(
            user_uuid=notice.telecaller_user_uuid,
            notification_type=NotificationType.LEAD_ASSIGNED,
            title="New lead assigned",
            body=f"A new {notice.business_line} lead has been assigned to you.",
            href="/dashboard/leads",
        )


async def has_expired_agent_lead(mobile: str) -> bool:
    """Return whether this mobile has ended Agent ownership history.

    Agent RLS exposes only the current Agent's rows, while the no-clock-reset
    rule applies across Agents and business lines. A reached deadline counts
    even before the scheduler stamps the transition marker. The database
    trigger is the race-safe guard; this bypass-session read lets the Agent API
    surface the normal conflict as 409.
    """
    async with AsyncSessionLocal() as session:
        return (
            await session.scalar(
                select(Lead.id)
                .where(
                    Lead.mobile == mobile,
                    or_(
                        Lead.agent_expired_at.is_not(None),
                        and_(Lead.expires_at.is_not(None), Lead.expires_at <= func.now()),
                    ),
                )
                .limit(1)
            )
        ) is not None


async def capture_lead(
    mobile: str,
    *,
    name: str | None = None,
    business_line: str,
    origin: str = "direct",
    origin_agent_profile_uuid: str | None = None,
    requirement: dict[str, Any] | None = None,
) -> bool:
    """Insert-or-enrich a direct lead for this mobile. Never raises.

    Returns True when the write committed, False when it was swallowed — auth
    callers ignore this (capture must never break the auth flow); the public
    leads endpoint logs on False but still answers 202 (the visitor can do
    nothing useful with a storage error, and the failure is already logged
    with a traceback here for ops).
    """
    notice: LeadAssignmentNotice | None = None
    try:
        async with AsyncSessionLocal() as session:
            if business_line not in _VALID_LINES:
                raise ValueError("Operational leads require a supported business line.")
            if origin_agent_profile_uuid is not None or origin != LeadOrigin.DIRECT.value:
                raise ValueError("Agent lead capture must use capture_agent_lead().")

            await lock_lead_mobile(session, mobile)
            await _lock_assignment_line(session, business_line)
            live = Lead.status != LeadStatus.CLOSED
            candidate = await session.scalar(
                select(Lead)
                .where(
                    Lead.mobile == mobile,
                    live,
                    Lead.business_line == business_line,
                )
                .order_by(Lead.updated_at.desc(), Lead.id)
                .limit(1)
                .with_for_update()
            )

            if candidate is None:
                candidate = Lead(
                    mobile=mobile,
                    name=name,
                    business_line=business_line,
                    origin=LeadOrigin.DIRECT,
                    status=LeadStatus.NEW,
                    requirement=requirement,
                )
                session.add(candidate)
            else:
                # Public/auth capture must never rewrite an assigned workflow.
                # It may enrich only an open, unassigned enquiry.
                if (
                    candidate.assigned_telecaller_profile_uuid is None
                    and candidate.status in _ASSIGNABLE_STATUSES
                ):
                    if name is not None:
                        candidate.name = name
                    candidate.requirement = _merge_requirement(candidate.requirement, requirement)
                candidate.updated_at = datetime.now(UTC)
            await session.flush()
            notice = await auto_assign_locked_lead(session, candidate)
            await session.commit()
        if notice is not None:
            await notify_lead_assignments([notice])
        return True
    except Exception:  # capture is best-effort; never break the auth flow
        logger.warning("lead.capture_failed mobile=%s", mask_mobile(mobile), exc_info=True)
        return False


async def capture_agent_lead(
    *,
    mobile: str,
    name: str | None,
    business_line: str,
    agent_profile_uuid: UUID,
    requirement: dict[str, Any] | None,
) -> Lead:
    """Create/claim and automatically assign an Agent lead in one transaction."""
    if business_line not in _VALID_LINES:
        raise AgentLeadConflict

    notice: LeadAssignmentNotice | None = None
    try:
        async with AsyncSessionLocal() as session:
            await lock_lead_mobile(session, mobile)
            await _lock_assignment_line(session, business_line)
            if await session.scalar(select(User.id).where(User.mobile == mobile).limit(1)):
                raise AgentLeadConflict
            if await session.scalar(
                select(Lead.id)
                .where(
                    Lead.mobile == mobile,
                    or_(
                        Lead.agent_expired_at.is_not(None),
                        and_(Lead.expires_at.is_not(None), Lead.expires_at <= func.now()),
                    ),
                )
                .limit(1)
            ):
                raise AgentLeadConflict

            existing = list(
                (
                    await session.scalars(
                        select(Lead)
                        .where(Lead.mobile == mobile, Lead.status != LeadStatus.CLOSED)
                        .order_by(Lead.updated_at.desc(), Lead.id)
                        .with_for_update()
                    )
                ).all()
            )
            if any(
                row.business_line != business_line
                or (
                    row.origin_agent_profile_uuid is not None
                    and row.origin_agent_profile_uuid != agent_profile_uuid
                )
                for row in existing
            ):
                raise AgentLeadConflict

            lead = next(
                (row for row in existing if row.business_line == business_line),
                None,
            )
            if lead is None:
                lead = Lead(
                    mobile=mobile,
                    business_line=business_line,
                    origin=LeadOrigin.AGENT,
                    origin_agent_profile_uuid=agent_profile_uuid,
                    name=name,
                    requirement=requirement,
                    status=LeadStatus.NEW,
                    expires_at=datetime.now(UTC) + timedelta(days=settings.AGENT_LEAD_EXPIRY_DAYS),
                )
                session.add(lead)
                await session.flush()
            elif lead.origin_agent_profile_uuid == agent_profile_uuid:
                # An Agent retry is idempotent. Once assignment locks the lead,
                # do not allow the retry body to rewrite it.
                if (
                    lead.assigned_telecaller_profile_uuid is None
                    and lead.status in _ASSIGNABLE_STATUSES
                ):
                    if name is not None:
                        lead.name = name
                    lead.requirement = _merge_requirement(lead.requirement, requirement)
            else:
                if (
                    lead.assigned_telecaller_profile_uuid is not None
                    or lead.status not in _ASSIGNABLE_STATUSES
                ):
                    raise AgentLeadConflict
                lead.business_line = business_line
                lead.origin = LeadOrigin.AGENT
                lead.origin_agent_profile_uuid = agent_profile_uuid
                lead.expires_at = datetime.now(UTC) + timedelta(
                    days=settings.AGENT_LEAD_EXPIRY_DAYS
                )
                if name is not None:
                    lead.name = name
                lead.requirement = _merge_requirement(lead.requirement, requirement)

            notice = await auto_assign_locked_lead(session, lead)
            await session.commit()
    except AgentLeadConflict:
        raise
    except IntegrityError as exc:
        raise AgentLeadConflict from exc

    if notice is not None:
        await notify_lead_assignments([notice])
    return lead


async def _ensure_client_line_lead(
    db: AsyncSession,
    *,
    mobile: str,
    business_line: str,
    client_profile_uuid: UUID,
    name: str | None = None,
) -> tuple[Lead, LeadAssignmentNotice | None]:
    if business_line not in _VALID_LINES:
        raise ValueError("Unsupported Client journey line.")

    await _lock_assignment_line(db, business_line)
    lead = await db.scalar(
        select(Lead)
        .where(
            Lead.mobile == mobile,
            Lead.business_line == business_line,
            Lead.status != LeadStatus.CLOSED,
        )
        .order_by(Lead.updated_at.desc(), Lead.id)
        .limit(1)
        .with_for_update()
    )
    if lead is None:
        lead = Lead(
            mobile=mobile,
            business_line=business_line,
            client_profile_uuid=client_profile_uuid,
            origin=LeadOrigin.DIRECT,
            status=LeadStatus.NEW,
            name=name,
        )
        db.add(lead)
        await db.flush()
    else:
        if lead.client_profile_uuid not in (None, client_profile_uuid):
            raise ValueError("Lead is already claimed by a different Client profile.")
        lead.client_profile_uuid = client_profile_uuid
        if lead.name is None and name is not None:
            lead.name = name
        lead.updated_at = datetime.now(UTC)

    return lead, await auto_assign_locked_lead(db, lead)


async def bind_registered_client_leads(
    db: AsyncSession,
    *,
    mobile: str,
    profiles_by_line: dict[str, UUID],
    requested_lines: set[str],
    name: str,
) -> list[LeadAssignmentNotice]:
    """Bind OTP-proven ownership and assign requested plus Agent-attributed lines."""
    await lock_lead_mobile(db, mobile)
    agent_lines = set(
        (
            await db.scalars(
                select(Lead.business_line).where(
                    Lead.mobile == mobile,
                    Lead.origin_agent_profile_uuid.is_not(None),
                    Lead.agent_expired_at.is_(None),
                    Lead.status != LeadStatus.CLOSED,
                    Lead.business_line.in_(_VALID_LINES),
                )
            )
        ).all()
    )
    lines = (requested_lines & _VALID_LINES) | agent_lines
    notices: list[LeadAssignmentNotice] = []
    for line in sorted(lines):
        profile_uuid = profiles_by_line.get(line)
        if profile_uuid is None:
            raise ValueError("The verified account has no profile for the requested line.")
        _lead, notice = await _ensure_client_line_lead(
            db,
            mobile=mobile,
            business_line=line,
            client_profile_uuid=profile_uuid,
            name=name,
        )
        if notice is not None:
            notices.append(notice)
    return notices


async def ensure_client_line_lead(
    *, mobile: str, client_profile_uuid: UUID, business_line: str
) -> UUID:
    """Hard-require one claimed Client journey and retry automatic assignment."""
    notice: LeadAssignmentNotice | None
    async with AsyncSessionLocal() as session:
        await lock_lead_mobile(session, mobile)
        profile = await session.get(ClientProfile, client_profile_uuid)
        if (
            profile is None
            or profile.business_line != business_line
            or profile.status != ProfileStatus.ACTIVE
        ):
            raise ValueError("Client profile does not match the requested journey line.")
        lead, notice = await _ensure_client_line_lead(
            session,
            mobile=mobile,
            business_line=business_line,
            client_profile_uuid=client_profile_uuid,
        )
        await session.commit()
    if notice is not None:
        await notify_lead_assignments([notice])
    return lead.id


async def ensure_client_line_lead_for_user(
    *, auth_user_uuid: UUID, mobile: str, business_line: str
) -> UUID:
    """Resolve the user's same-line profile, then create/assign that journey."""
    async with AsyncSessionLocal() as session:
        profile_uuid = await session.scalar(
            select(ClientProfile.id).where(
                ClientProfile.auth_user_uuid == auth_user_uuid,
                ClientProfile.business_line == business_line,
                ClientProfile.status == ProfileStatus.ACTIVE,
            )
        )
    if profile_uuid is None:
        raise ValueError("Client profile does not match the requested journey line.")
    return await ensure_client_line_lead(
        mobile=mobile,
        client_profile_uuid=profile_uuid,
        business_line=business_line,
    )


async def resolve_loans_lead(mobile: str, client_profile_uuid: UUID) -> UUID:
    return await ensure_client_line_lead(
        mobile=mobile,
        client_profile_uuid=client_profile_uuid,
        business_line="loans",
    )


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
            .where(
                Lead.mobile == mobile,
                Lead.business_line == "real_estate",
                Lead.client_profile_uuid.is_(None),
            )
            .values(client_profile_uuid=client_profile_id)
        )
        await session.commit()
        return client_profile_id


async def assign_lead_to_telecaller(
    db: AsyncSession,
    lead_id: UUID,
    telecaller_staff_profile_uuid: UUID,
    *,
    actor_uuid: UUID,
    actor_role: str,
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
    if lead.status not in (LeadStatus.NEW, LeadStatus.RELEASED):
        raise LeadNotAssignable

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
    await record_audit(
        db,
        action=AuditAction.LEAD_ASSIGNED,
        entity_type="lead",
        entity_uuid=lead.id,
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        business_line=lead.business_line,
        detail={
            "mode": "manual",
            "telecaller_staff_profile_uuid": str(telecaller.id),
        },
    )
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


async def release_lead_from_telecaller(
    db: AsyncSession,
    lead_id: UUID,
    *,
    telecaller_staff_profile_uuid: UUID | None,
    release_reason: str | None,
    actor_uuid: UUID,
    actor_role: str,
) -> tuple[Lead, UUID | None]:
    """Release an assigned/working lead, optionally reassigning it to a new
    telecaller in the SAME transaction (no intermediate unassigned window).
    Admin-only (core.deps.require_admin).

    Validation order mirrors assign_lead_to_telecaller: lock row, validate lead
    state (LeadNotReleasable), validate the target telecaller only if one was
    given (InvalidTelecaller — same exists/role/status/business_line checks),
    mutate, commit, refresh, then best-effort notify. Runs on the admin's own
    request session for the same reason assign_lead_to_telecaller does (JWT
    platform_scope bypasses leads_rls, no superuser session needed).

    Returns (lead, previous_telecaller_staff_profile_uuid) — the previous id is
    captured before mutation since a reassign overwrites
    assigned_telecaller_profile_uuid with the new target.
    """
    lead = await db.get(Lead, lead_id, with_for_update=True)
    if lead is None:
        raise LeadNotFound
    if lead.status not in (LeadStatus.ASSIGNED, LeadStatus.WORKING):
        raise LeadNotReleasable

    previous_telecaller_uuid = lead.assigned_telecaller_profile_uuid
    previous_telecaller = (
        await db.get(StaffProfile, previous_telecaller_uuid)
        if previous_telecaller_uuid is not None
        else None
    )

    new_telecaller = None
    if telecaller_staff_profile_uuid is not None:
        new_telecaller = await db.get(StaffProfile, telecaller_staff_profile_uuid)
        if (
            new_telecaller is None
            or new_telecaller.role != StaffRole.TELECALLER
            or new_telecaller.status != ProfileStatus.ACTIVE
            or new_telecaller.business_line != lead.business_line
        ):
            raise InvalidTelecaller

    lead.released_at = datetime.now(UTC)
    lead.release_reason = release_reason
    if new_telecaller is not None:
        lead.assigned_telecaller_profile_uuid = new_telecaller.id
        lead.status = LeadStatus.ASSIGNED
        await record_audit(
            db,
            action=AuditAction.LEAD_ASSIGNED,
            entity_type="lead",
            entity_uuid=lead.id,
            actor_uuid=actor_uuid,
            actor_role=actor_role,
            business_line=lead.business_line,
            detail={
                "mode": "manual_reassignment",
                "telecaller_staff_profile_uuid": str(new_telecaller.id),
                "previous_telecaller_staff_profile_uuid": (
                    str(previous_telecaller_uuid) if previous_telecaller_uuid else None
                ),
            },
        )
    else:
        lead.assigned_telecaller_profile_uuid = None
        lead.status = LeadStatus.RELEASED

    await db.commit()
    await db.refresh(lead)

    if previous_telecaller is not None:
        await emit_notification(
            user_uuid=previous_telecaller.auth_user_uuid,
            notification_type=NotificationType.LEAD_RELEASED,
            title="Lead reassigned" if new_telecaller is not None else "Lead released",
            body=(
                f"A {lead.business_line} lead has been reassigned to another telecaller."
                if new_telecaller is not None
                else f"A {lead.business_line} lead has been released back to the queue."
            ),
            href="/dashboard/leads",
        )
    if new_telecaller is not None:
        await emit_notification(
            user_uuid=new_telecaller.auth_user_uuid,
            notification_type=NotificationType.LEAD_ASSIGNED,
            title="New lead assigned",
            body=f"A {lead.business_line} lead has been assigned to you.",
            href="/dashboard/leads",
        )
    return lead, previous_telecaller_uuid


async def list_unassigned_leads(db: AsyncSession, limit: int = 100, offset: int = 0) -> list[Lead]:
    """Leads eligible for assignment right now: same predicate assign_lead_to_telecaller
    itself validates against (unassigned + triaged + status new/released), so the
    queue never lists a lead that would then 409/422 on assign. The status filter
    also excludes the orphaned-FK edge case: a lead whose
    assigned_telecaller_profile_uuid went NULL (ondelete="SET NULL") while it
    stayed assigned/working/converted/closed is not "unassigned" — it must not be
    listed here nor be assignable via assign_lead_to_telecaller."""
    stmt = (
        select(Lead)
        .where(
            Lead.assigned_telecaller_profile_uuid.is_(None),
            Lead.business_line.is_not(None),
            Lead.status.in_((LeadStatus.NEW, LeadStatus.RELEASED)),
        )
        .order_by(Lead.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list((await db.scalars(stmt)).all())


async def list_assigned_leads(
    db: AsyncSession, limit: int = 100, offset: int = 0
) -> list[tuple[Lead, StaffProfile | None, User | None]]:
    """Leads currently ASSIGNED/WORKING, joined to their telecaller. Uses an
    OUTER join (not inner) so a lead whose assigned_telecaller_profile_uuid went
    NULL via ondelete="SET NULL" while status stayed assigned/working (the
    orphaned-FK edge case LeadNotAssignable/LeadNotReleasable guard against)
    still surfaces here with staff/user None — giving admin the one place to
    find and repair it via release_lead_from_telecaller (no target)."""
    stmt = (
        select(Lead, StaffProfile, User)
        .outerjoin(StaffProfile, StaffProfile.id == Lead.assigned_telecaller_profile_uuid)
        .outerjoin(User, User.id == StaffProfile.auth_user_uuid)
        .where(Lead.status.in_((LeadStatus.ASSIGNED, LeadStatus.WORKING)))
        .order_by(Lead.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    return [(lead, staff, user) for lead, staff, user in result.all()]
