"""Admin support-ticket triage (docs/specs/admin-support-ticket-console.md).

Runs on the caller's request-scoped session, not a bypass session:
support_tickets_rls's WITH CHECK already has a genuine admin-bypass branch
(`platform_scope='true' AND role='admin'`, migration
a0b1c2d3e4f5_rls_scope_platform_bypass_to_admin) and the Postgres GRANT now
covers `status`/`resolution_note`/`updated_at` (migration 871d5a7c34e1) --
unlike account_deletion.py's Phase B, there is no RLS gap here to route
around. No ownership check either: Admin isn't the ticket's owner the way a
sub_admin owns a content block, so any ticket the RLS bypass makes visible is
fair game to advance.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditAction
from app.models.mobile_change import MobileChangeRequest, MobileChangeStatus
from app.models.notification import NotificationType
from app.models.support_ticket import SupportStatus, SupportTicket
from app.models.user import User, UserStatus
from app.services.audit_log import record as record_audit
from app.services.notifications import emit_notification

# Forward-only, `closed` reachable as a manual override from any non-terminal
# state (a spam/duplicate ticket that should never show as "resolved"). The
# model's SupportStatus.CLOSED value predates this service -- nothing wrote
# it before now.
_TRANSITIONS: dict[SupportStatus, set[SupportStatus]] = {
    SupportStatus.OPEN: {SupportStatus.IN_PROGRESS, SupportStatus.CLOSED},
    SupportStatus.IN_PROGRESS: {SupportStatus.RESOLVED, SupportStatus.CLOSED},
    SupportStatus.RESOLVED: {SupportStatus.CLOSED},
    SupportStatus.CLOSED: set(),
}

_TERMINAL_NOTIFY_STATUSES = {SupportStatus.RESOLVED, SupportStatus.CLOSED}


class TicketNotFound(Exception):
    """Raised when the target ticket does not exist (or isn't visible under RLS)."""


class TicketIllegalTransition(Exception):
    """Raised when an advance targets a status not reachable from the current one."""


class TicketManagedWorkflow(Exception):
    """Raised when a structured recovery workflow owns this ticket's state."""


@dataclass(frozen=True)
class AdminTicketView:
    ticket: SupportTicket
    requester_name: str | None
    requester_mobile: str | None


async def _resolve_requesters(
    db: AsyncSession, auth_user_uuids: set[UUID]
) -> dict[UUID, tuple[str | None, str | None]]:
    """Batch-resolve ticket authors to a display name + contact number, one
    query regardless of ticket count. A soft-deleted account already has its
    name tombstoned to "Deleted User" (services/account_deletion.py) and its
    real mobile overwritten to a non-dialable placeholder -- both resolve to
    None here instead, so the frontend shows "Deleted account" rather than a
    fake tombstone number that looks real (same convention
    apps/web/features/admin/payouts-view.tsx uses for a delinked recipient)."""
    if not auth_user_uuids:
        return {}
    rows = (
        await db.execute(
            select(User.id, User.first_name, User.last_name, User.mobile, User.status).where(
                User.id.in_(auth_user_uuids)
            )
        )
    ).all()
    resolved: dict[UUID, tuple[str | None, str | None]] = {}
    for uid, first, last, mobile, status in rows:
        if status == UserStatus.SOFT_DELETED:
            resolved[uid] = (None, None)
            continue
        name = f"{first} {last}".strip() or None
        resolved[uid] = (name, mobile)
    return resolved


async def view_for_admin(db: AsyncSession, ticket: SupportTicket) -> AdminTicketView:
    """Single-ticket counterpart to list_for_admin, for a caller that already
    has the row in hand (e.g. right after advance_ticket) and would otherwise
    have to re-list every ticket just to resolve one requester's identity."""
    requesters = await _resolve_requesters(db, {ticket.auth_user_uuid})
    name, mobile = requesters.get(ticket.auth_user_uuid, (None, None))
    return AdminTicketView(ticket=ticket, requester_name=name, requester_mobile=mobile)


async def list_for_admin(
    db: AsyncSession, *, status_filter: SupportStatus | None = None
) -> list[AdminTicketView]:
    stmt = select(SupportTicket).order_by(SupportTicket.created_at.desc())
    if status_filter is not None:
        stmt = stmt.where(SupportTicket.status == status_filter)
    tickets = (await db.scalars(stmt)).all()

    requesters = await _resolve_requesters(db, {t.auth_user_uuid for t in tickets})
    return [
        AdminTicketView(
            ticket=t,
            requester_name=requesters.get(t.auth_user_uuid, (None, None))[0],
            requester_mobile=requesters.get(t.auth_user_uuid, (None, None))[1],
        )
        for t in tickets
    ]


_STATUS_NOTIFICATION_BODY = {
    SupportStatus.RESOLVED: "Your support ticket has been resolved.",
    SupportStatus.CLOSED: "Your support ticket has been closed.",
}


async def advance_ticket(
    db: AsyncSession,
    ticket_id: UUID,
    *,
    target_status: SupportStatus,
    resolution_note: str | None,
    actor_uuid: UUID | None = None,
    actor_role: str | None = None,
) -> SupportTicket:
    ticket = await db.scalar(
        select(SupportTicket).where(SupportTicket.id == ticket_id).with_for_update()
    )
    if ticket is None:
        raise TicketNotFound
    linked_recovery = await db.scalar(
        select(MobileChangeRequest.id).where(
            MobileChangeRequest.support_ticket_uuid == ticket.id,
            MobileChangeRequest.status.in_(
                (
                    MobileChangeStatus.PENDING_REVIEW,
                    MobileChangeStatus.PENDING_APPROVAL,
                )
            ),
        )
    )
    if linked_recovery is not None:
        raise TicketManagedWorkflow
    if target_status not in _TRANSITIONS.get(ticket.status, set()):
        raise TicketIllegalTransition

    previous_status = ticket.status
    ticket.status = target_status
    if resolution_note is not None:
        ticket.resolution_note = resolution_note
    # Recorded because these tickets are the account-recovery channel (FR-14.2):
    # "who closed the lost-mobile request, and what did they say" is exactly the
    # question an audit trail exists to answer. Ticket subject/body are NOT
    # copied in — they are user free text that can carry the reporter's own PII.
    await record_audit(
        db,
        action=AuditAction.SUPPORT_TICKET_ADVANCED,
        entity_type="support_ticket",
        entity_uuid=ticket.id,
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        detail={
            "from_status": previous_status.value,
            "to_status": target_status.value,
            "category": ticket.category.value,
            "resolution_note": resolution_note,
        },
    )
    await db.commit()
    await db.refresh(ticket)

    if target_status in _TERMINAL_NOTIFY_STATUSES:
        await emit_notification(
            user_uuid=ticket.auth_user_uuid,
            notification_type=NotificationType.SUPPORT_TICKET_RESOLVED,
            title="Support ticket update",
            body=_STATUS_NOTIFICATION_BODY[target_status],
            href="/dashboard/support",
        )
    return ticket
