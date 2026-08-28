"""First-login invite links for provisioned staff.

Replaces relaying a generated temp password out of band. The Admin creates a
link, hands it over however they like, and the invitee sets their own password —
so the credential is never spoken aloud, pasted into a chat, or left sitting in
an Admin's clipboard.

Mirrors `services/field_visibility`'s contact-share-link handling: only a
SHA-256 hash of the token is persisted, creating a link revokes the invitee's
outstanding one, and validation/consumption run on the internal service session
(`AsyncSessionLocal`) because the caller is anonymous and has no RLS context.
Those two functions are the only place in this module that bypasses the request
session, and both re-derive every eligibility condition from the database rather
than trusting anything in the URL.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, validate_password_policy
from app.db import session as db_session
from app.models.audit_log import AuditAction
from app.models.profile import ProfileStatus, StaffProfile
from app.models.staff_invite import StaffInviteLink
from app.models.user import User, UserStatus
from app.services.audit_log import record as record_audit

# Long enough that an Admin can provision ahead of a start date, short enough
# that a forgotten link is not a standing way in. Deliberately much longer than
# the contact share link's window: that one is handed over during a live call,
# this one is handed to someone who may not read it until Monday.
INVITE_TTL = timedelta(days=7)

# Bounds mirror services/field_visibility: a token outside this range cannot be
# one we minted, so it is rejected before any query runs.
_MIN_TOKEN_LEN = 32
_MAX_TOKEN_LEN = 128


class StaffInviteNotAllowed(Exception):
    """Raised when the target is not an active staff account awaiting a password."""


class StaffInviteNotFound(Exception):
    """Raised when revoking a link that does not exist."""


class StaffInvitePasswordRejected(Exception):
    """Raised when the chosen password fails the platform policy.

    Distinct from an invalid token so the route can explain what to fix. Safe to
    distinguish: the caller has already proven they hold a live token, so this
    leaks nothing a brute-forcer could use.
    """


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def create_invite_link(
    db: AsyncSession,
    *,
    auth_user_uuid: uuid.UUID,
    actor_uuid: uuid.UUID,
    actor_role: str | None = None,
) -> tuple[StaffInviteLink, str]:
    """Mint a link for a staff account that has not set its own password yet.

    Restricted to `PENDING_PASSWORD_RESET` on purpose. An account whose owner
    has already chosen a password must go through the normal reset flow — an
    Admin-minted link that could overwrite a working credential would be an
    account-takeover primitive, not an onboarding convenience.
    """
    profile = await db.scalar(
        select(StaffProfile).where(
            StaffProfile.auth_user_uuid == auth_user_uuid,
            StaffProfile.status == ProfileStatus.ACTIVE,
        )
    )
    if profile is None:
        raise StaffInviteNotAllowed

    user = await db.get(User, auth_user_uuid)
    if user is None or user.status != UserStatus.PENDING_PASSWORD_RESET:
        raise StaffInviteNotAllowed

    now = datetime.now(UTC)
    # Re-issuing replaces rather than adds: the partial unique index would
    # reject a second live row anyway, and two working links would mean two
    # credentials outstanding for one account.
    await db.execute(
        update(StaffInviteLink)
        .where(
            StaffInviteLink.auth_user_uuid == auth_user_uuid,
            StaffInviteLink.revoked_at.is_(None),
            StaffInviteLink.used_at.is_(None),
        )
        .values(revoked_at=now)
    )

    token = secrets.token_urlsafe(32)
    link = StaffInviteLink(
        token_hash=_token_hash(token),
        auth_user_uuid=auth_user_uuid,
        staff_profile_uuid=profile.id,
        created_by_uuid=actor_uuid,
        expires_at=now + INVITE_TTL,
    )
    db.add(link)
    await db.flush()

    # No mobile, email, or token in `detail` — the audit helper rejects those
    # keys, and a link id is enough to trace the handoff.
    await record_audit(
        db,
        action=AuditAction.STAFF_INVITE_CREATED,
        entity_type="staff_invite_link",
        entity_uuid=link.id,
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        business_line=None,
        detail={"staff_profile_uuid": str(profile.id), "action": "invite_link_created"},
    )
    await db.commit()
    await db.refresh(link)
    return link, token


async def revoke_invite_link(
    db: AsyncSession, *, link_uuid: uuid.UUID, actor_uuid: uuid.UUID
) -> None:
    link = await db.scalar(select(StaffInviteLink).where(StaffInviteLink.id == link_uuid))
    if link is None:
        raise StaffInviteNotFound
    if link.revoked_at is None and link.used_at is None:
        link.revoked_at = datetime.now(UTC)
        await record_audit(
            db,
            action=AuditAction.STAFF_INVITE_REVOKED,
            entity_type="staff_invite_link",
            entity_uuid=link.id,
            actor_uuid=actor_uuid,
            actor_role="admin",
            business_line=None,
            detail={"action": "invite_link_revoked"},
        )
        await db.commit()


async def describe_invite(token: str) -> dict[str, str] | None:
    """What the public page may show before a password is set.

    Returns the invitee's first name and role only. Enough to confirm the link
    is meant for the person holding it, and nothing an attacker who guessed a
    token could turn into contact details.
    """
    if not _MIN_TOKEN_LEN <= len(token) <= _MAX_TOKEN_LEN:
        return None
    now = datetime.now(UTC)
    async with db_session.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                select(User.first_name, StaffProfile.role)
                .join(StaffInviteLink, StaffInviteLink.auth_user_uuid == User.id)
                .join(StaffProfile, StaffProfile.id == StaffInviteLink.staff_profile_uuid)
                .where(
                    StaffInviteLink.token_hash == _token_hash(token),
                    StaffInviteLink.expires_at > now,
                    StaffInviteLink.revoked_at.is_(None),
                    StaffInviteLink.used_at.is_(None),
                    StaffProfile.status == ProfileStatus.ACTIVE,
                    User.status == UserStatus.PENDING_PASSWORD_RESET,
                )
            )
        ).one_or_none()
    if row is None:
        return None
    return {"first_name": row[0] or "", "role": row[1].value}


async def consume_invite(token: str, password: str) -> bool:
    """Set the invitee's password and burn the link, in one transaction.

    Every eligibility condition is rechecked here rather than trusted from the
    earlier `describe_invite` call: the two are separate requests, and the link
    can be revoked or the account suspended in between.
    """
    if not _MIN_TOKEN_LEN <= len(token) <= _MAX_TOKEN_LEN:
        return False
    now = datetime.now(UTC)
    async with db_session.AsyncSessionLocal() as db:
        link = await db.scalar(
            select(StaffInviteLink)
            .where(
                StaffInviteLink.token_hash == _token_hash(token),
                StaffInviteLink.expires_at > now,
                StaffInviteLink.revoked_at.is_(None),
                StaffInviteLink.used_at.is_(None),
            )
            .with_for_update()
        )
        if link is None:
            return False

        profile = await db.get(StaffProfile, link.staff_profile_uuid)
        user = await db.get(User, link.auth_user_uuid, with_for_update=True)
        if (
            profile is None
            or profile.status != ProfileStatus.ACTIVE
            or user is None
            or user.status != UserStatus.PENDING_PASSWORD_RESET
        ):
            return False

        # The same policy the forced-reset flow enforces. Checked here, not in
        # the schema, because it needs the account's mobile to reject a password
        # containing it — and the anonymous caller never sends that number.
        try:
            validate_password_policy(password, user.mobile or "")
        except ValueError as exc:
            raise StaffInvitePasswordRejected(str(exc)) from exc

        user.password_hash = await hash_password(password)
        user.status = UserStatus.ACTIVE
        link.used_at = now
        await db.commit()
        return True
