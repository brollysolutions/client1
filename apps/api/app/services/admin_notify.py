"""Admin notification fan-out (FR-11.3) + broadcast (feature-status.md §3-12).

Two functions over related but distinct shapes — read both docstrings before
touching either, they follow OPPOSITE rules for a reason.

`notify_admins` tells every ACTIVE platform admin about a major action a
non-acting admin should know about. The rule, stated once: `record_audit(...)`
goes BEFORE the caller's commit; `notify_admins(...)` goes AFTER it. A
notification commits on its own bypass session and may already be on a
screen via web push — unretractable, so it must never fire for an action
that could still roll back. Precedents for this ordering elsewhere in the
codebase: `services.payments.reject_payout` calls `_payout_released_hook`
after `db.commit()`; `services.account_deletion` blacklists the actor's JTI
in Redis after commit — both are non-transactional side effects for the
identical reason. An `after_commit` SQLAlchemy session event would fix
ordering but not selectivity (it fires for every commit, with no per-action
copy and no way to skip the noisy majority of audited actions) — this
module is called explicitly, by name, from five hand-picked sites.

`broadcast` INVERTS that rule, deliberately, and is the one place in this
codebase where audit-before-action is correct: the fanout is N committed
writes with no single transaction to share, and the failure mode that
matters for a broadcast is "notifications went out and there's no record of
who sent them" — so the audit row is written and committed first, and only
then does the fanout run. See its own docstring below.
"""

from __future__ import annotations

import enum
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.db.session as db_session
from app.core.config import settings
from app.models.audit_log import AuditAction
from app.models.notification import Notification, NotificationType
from app.models.profile import (
    AgentProfile,
    ClientProfile,
    ProfileStatus,
    StaffProfile,
    StaffRole,
)
from app.models.user import User, UserStatus
from app.services import push
from app.services.audit_log import record as record_audit
from app.services.email import send_notification_email

logger = logging.getLogger(__name__)

# Log-and-truncate rather than an unbounded per-request fanout loop if the
# admin roster is ever misconfigured. 25 is far above any realistic admin
# headcount on this platform today.
_MAX_ADMIN_FANOUT = 25


async def _send_verified_notification_emails(
    session: AsyncSession,
    *,
    recipient_uuids: set[uuid.UUID],
    title: str,
    body: str,
    href: str | None,
) -> None:
    """Deliver best-effort email copies without expanding recipient scope."""
    if not settings.NOTIFICATION_EMAIL_ENABLED or not recipient_uuids:
        return
    users = (
        await session.scalars(
            select(User).where(
                User.id.in_(recipient_uuids),
                User.status == UserStatus.ACTIVE,
                User.email.is_not(None),
                User.email_verified_at.is_not(None),
            )
        )
    ).all()
    for user in users:
        # The predicate guarantees a non-null address; retain the guard so a
        # future model/query change cannot turn this into a transport error.
        if user.email:
            await send_notification_email(user.email, title, body, href)


async def _active_admin_uuids(session: AsyncSession) -> set[uuid.UUID]:
    rows = await session.scalars(
        select(StaffProfile.auth_user_uuid).where(
            StaffProfile.role == StaffRole.ADMIN,
            StaffProfile.status == ProfileStatus.ACTIVE,
        )
    )
    # A set, not a list: `uq_staff_profiles_one_active_per_user` already
    # guarantees at most one ACTIVE row per auth_user, so this isn't a
    # dedupe so much as the natural return shape for "the recipient uuids".
    return set(rows.all())


async def notify_admins(
    *,
    notification_type: NotificationType,
    title: str,
    body: str,
    href: str | None = None,
    exclude_user_uuid: uuid.UUID | None = None,
) -> None:
    """Fan out to every ACTIVE admin except `exclude_user_uuid` (the actor —
    an admin who just approved a payout should not be told they approved a
    payout). Best-effort: never raises, same posture as
    services.notifications.emit_notification — an admin-fanout failure must
    never break an already-committed business action.

    Runs on its own bypass session, not the caller's RLS-scoped one:
    `notifications_rls` is owner-keyed `FOR ALL`, so writing a row owned by
    someone other than the caller is only possible on a bypass session (the
    same reason `emit_notification` already opens one). `api_user` holds
    only SELECT+UPDATE on `notifications` — do not add INSERT there; this
    must stay a superuser-session write, which is also why the enumeration
    above runs on the same session rather than the caller's: whether an
    admin gets notified must not depend on who performed the action.

    Takes NO caller-supplied recipient list — the admin set is always
    resolved here, so no call site can be induced to notify an arbitrary
    user.
    """
    try:
        async with db_session.AsyncSessionLocal() as session:
            admin_uuids = await _active_admin_uuids(session)
            admin_uuids.discard(exclude_user_uuid)
            if not admin_uuids:
                return
            if len(admin_uuids) > _MAX_ADMIN_FANOUT:
                logger.warning(
                    "admin_notify.fanout_truncated total=%d cap=%d",
                    len(admin_uuids),
                    _MAX_ADMIN_FANOUT,
                )
                admin_uuids = set(sorted(admin_uuids, key=str)[:_MAX_ADMIN_FANOUT])

            for admin_uuid in admin_uuids:
                session.add(
                    Notification(
                        user_uuid=admin_uuid,
                        type=notification_type,
                        title=title,
                        body=body,
                        href=href,
                    )
                )
            await session.commit()

            if push._is_live():
                for admin_uuid in admin_uuids:
                    await push.send_to_user(
                        session, user_uuid=admin_uuid, title=title, body=body, href=href
                    )
            await _send_verified_notification_emails(
                session,
                recipient_uuids=admin_uuids,
                title=title,
                body=body,
                href=href,
            )
    except Exception:
        logger.warning(
            "admin_notify.notify_admins_failed type=%s", notification_type, exc_info=True
        )


class BroadcastAudience(enum.StrEnum):
    ADMINS = "admins"
    STAFF = "staff"
    AGENTS = "agents"
    CLIENTS = "clients"
    ALL = "all"


class BroadcastTooLarge(Exception):
    """Resolved audience exceeds settings.ADMIN_BROADCAST_MAX_RECIPIENTS."""

    def __init__(self, count: int) -> None:
        self.count = count
        super().__init__(f"Broadcast audience of {count} exceeds the configured cap.")


async def resolve_broadcast_recipients(
    *, audience: BroadcastAudience, business_line: str | None
) -> set[uuid.UUID]:
    """Read-only audience resolution, exposed separately so the preview
    endpoint can show a count without sending anything.

    Dedupes by auth_user_uuid — a dual-line client holds TWO client_profiles
    rows (SRS §5.9), so a naive per-row fan-out would double-notify them; the
    set union here collapses that automatically. Filters out
    `User.status == SOFT_DELETED` explicitly: the tombstoned auth_users row
    still exists and its FK would happily accept a notification insert.
    """
    async with db_session.AsyncSessionLocal() as session:
        uuids: set[uuid.UUID] = set()

        if audience in (BroadcastAudience.ADMINS, BroadcastAudience.STAFF, BroadcastAudience.ALL):
            stmt = select(StaffProfile.auth_user_uuid).where(
                StaffProfile.status == ProfileStatus.ACTIVE
            )
            if audience == BroadcastAudience.ADMINS:
                stmt = stmt.where(StaffProfile.role == StaffRole.ADMIN)
            if business_line is not None:
                stmt = stmt.where(
                    (StaffProfile.business_line.in_((business_line, "both")))
                    | (StaffProfile.business_line.is_(None))
                )
            uuids |= set((await session.scalars(stmt)).all())

        if audience in (BroadcastAudience.CLIENTS, BroadcastAudience.ALL):
            stmt = select(ClientProfile.auth_user_uuid).where(
                ClientProfile.status == ProfileStatus.ACTIVE
            )
            if business_line is not None:
                stmt = stmt.where(ClientProfile.business_line == business_line)
            uuids |= set((await session.scalars(stmt)).all())

        if audience in (BroadcastAudience.AGENTS, BroadcastAudience.ALL):
            stmt = select(AgentProfile.auth_user_uuid).where(
                AgentProfile.status == ProfileStatus.ACTIVE
            )
            if business_line is not None:
                stmt = stmt.where(AgentProfile.business_line == business_line)
            uuids |= set((await session.scalars(stmt)).all())

        if not uuids:
            return uuids

        live_uuids = set(
            (
                await session.scalars(
                    select(User.id).where(
                        User.id.in_(uuids), User.status != UserStatus.SOFT_DELETED
                    )
                )
            ).all()
        )
        return uuids & live_uuids


async def broadcast(
    db: AsyncSession,
    *,
    audience: BroadcastAudience,
    business_line: str | None,
    title: str,
    body: str,
    href: str | None,
    actor_uuid: uuid.UUID,
    actor_role: str | None,
) -> int:
    """Send a notification to every resolved recipient. Returns the
    recipient count.

    Two deliberate inversions of the `notify_admins` rules above, both
    load-bearing:

    1. Audits BEFORE the fanout, on `db` (the caller's own RLS-scoped
       session — the router's). The fanout below is N committed writes with
       no shared transaction; the failure mode that matters here is
       "notifications went out and there's no record of who sent them", so
       the audit row is written and committed FIRST. This directly
       contradicts the notify-after-commit rule two functions above, on
       purpose: for a broadcast, an audit row for a send that then partially
       fails is the safe direction, not the unsafe one.
    2. Does NOT reuse `services.notifications.emit_notification`. That
       helper's one-row-one-commit shape is right for a single incidental
       notification and wrong for tens of thousands — this does one bulk
       `session.add_all` insert in a single bypass transaction instead.

    Raises BroadcastTooLarge before writing anything if the resolved
    audience exceeds the configured cap — callers (the router) map this to
    an HTTP 400 naming the count, before any audit row or notification is
    written.
    """
    recipients = await resolve_broadcast_recipients(audience=audience, business_line=business_line)

    if len(recipients) > settings.ADMIN_BROADCAST_MAX_RECIPIENTS:
        raise BroadcastTooLarge(len(recipients))

    await record_audit(
        db,
        action=AuditAction.NOTIFICATION_BROADCAST,
        entity_type="notification_broadcast",
        entity_uuid=None,
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        business_line=business_line,
        detail={
            "audience": audience.value,
            "business_line": business_line,
            "recipient_count": len(recipients),
            "title": title,
        },
    )
    await db.commit()

    if not recipients:
        return 0

    try:
        async with db_session.AsyncSessionLocal() as session:
            session.add_all(
                [
                    Notification(
                        user_uuid=recipient_uuid,
                        type=NotificationType.ADMIN_BROADCAST,
                        title=title,
                        body=body,
                        href=href,
                    )
                    for recipient_uuid in recipients
                ]
            )
            await session.commit()
            if push._is_live():
                for recipient_uuid in recipients:
                    await push.send_to_user(
                        session, user_uuid=recipient_uuid, title=title, body=body, href=href
                    )
            await _send_verified_notification_emails(
                session,
                recipient_uuids=recipients,
                title=title,
                body=body,
                href=href,
            )
    except Exception:
        # The audit row above already committed and survives this failure —
        # that is the point of writing it first.
        logger.warning("admin_notify.broadcast_fanout_failed audience=%s", audience, exc_info=True)

    return len(recipients)
