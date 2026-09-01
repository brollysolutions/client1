"""Issue, list, revoke, and consume approved-Agent first-login links."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, validate_password_policy
from app.db import session as db_session
from app.models.agent_invite import AgentInviteLink
from app.models.audit_log import AuditAction
from app.models.profile import AgentApplication, AgentProfile, ProfileStatus, SubmissionStatus
from app.models.user import User, UserStatus
from app.services.audit_log import record as record_audit

INVITE_TTL = timedelta(days=7)
_MIN_TOKEN_LEN = 32
_MAX_TOKEN_LEN = 128


class AgentInviteNotAllowed(Exception):
    """The application is not an active approved Agent awaiting a password."""


class AgentInviteNotFound(Exception):
    """The requested invite-link row does not exist."""


class AgentInvitePasswordRejected(Exception):
    """The chosen password violates the account-aware password policy."""


@dataclass(frozen=True)
class AgentInviteCandidate:
    application_id: uuid.UUID
    agent_code: str
    first_name: str
    last_name: str
    mobile: str | None
    business_line: str
    approved_at: datetime


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def list_candidates(db: AsyncSession) -> list[AgentInviteCandidate]:
    rows = (
        await db.execute(
            select(AgentApplication, AgentProfile, User)
            .join(AgentProfile, AgentProfile.application_uuid == AgentApplication.id)
            .join(User, User.id == AgentProfile.auth_user_uuid)
            .where(
                AgentApplication.status == SubmissionStatus.APPROVED,
                AgentProfile.status == ProfileStatus.ACTIVE,
                User.status == UserStatus.PENDING_PASSWORD_RESET,
            )
            .order_by(AgentProfile.approved_at.desc(), AgentApplication.id)
        )
    ).all()
    return [
        AgentInviteCandidate(
            application_id=application.id,
            agent_code=profile.agent_code,
            first_name=user.first_name or application.first_name or "",
            last_name=user.last_name or application.last_name or "",
            mobile=user.mobile,
            business_line=profile.business_line,
            approved_at=profile.approved_at or profile.created_at,
        )
        for application, profile, user in rows
    ]


async def create_invite_link(
    db: AsyncSession,
    *,
    application_uuid: uuid.UUID,
    actor_uuid: uuid.UUID,
    actor_role: str | None,
) -> tuple[AgentInviteLink, str]:
    application = await db.get(AgentApplication, application_uuid, with_for_update=True)
    if application is None or application.status != SubmissionStatus.APPROVED:
        raise AgentInviteNotAllowed
    profile = await db.scalar(
        select(AgentProfile)
        .where(
            AgentProfile.application_uuid == application_uuid,
            AgentProfile.status == ProfileStatus.ACTIVE,
        )
        .with_for_update()
    )
    if profile is None:
        raise AgentInviteNotAllowed
    user = await db.get(User, profile.auth_user_uuid, with_for_update=True)
    if user is None or user.status != UserStatus.PENDING_PASSWORD_RESET:
        raise AgentInviteNotAllowed

    now = datetime.now(UTC)
    await db.execute(
        update(AgentInviteLink)
        .where(
            AgentInviteLink.auth_user_uuid == user.id,
            AgentInviteLink.revoked_at.is_(None),
            AgentInviteLink.used_at.is_(None),
        )
        .values(revoked_at=now)
    )
    token = secrets.token_urlsafe(32)
    link = AgentInviteLink(
        token_hash=_token_hash(token),
        auth_user_uuid=user.id,
        agent_profile_uuid=profile.id,
        application_uuid=application.id,
        created_by_uuid=actor_uuid,
        expires_at=now + INVITE_TTL,
    )
    db.add(link)
    await db.flush()
    await record_audit(
        db,
        action=AuditAction.AGENT_INVITE_CREATED,
        entity_type="agent_invite_link",
        entity_uuid=link.id,
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        business_line=profile.business_line,
        detail={
            "agent_profile_uuid": str(profile.id),
            "application_uuid": str(application.id),
            "action": "agent_invite_created",
        },
    )
    await db.commit()
    await db.refresh(link)
    return link, token


async def revoke_invite_link(
    db: AsyncSession,
    *,
    link_uuid: uuid.UUID,
    actor_uuid: uuid.UUID,
    actor_role: str | None,
) -> None:
    link = await db.scalar(select(AgentInviteLink).where(AgentInviteLink.id == link_uuid))
    if link is None:
        raise AgentInviteNotFound
    if link.revoked_at is None and link.used_at is None:
        link.revoked_at = datetime.now(UTC)
        profile = await db.get(AgentProfile, link.agent_profile_uuid)
        await record_audit(
            db,
            action=AuditAction.AGENT_INVITE_REVOKED,
            entity_type="agent_invite_link",
            entity_uuid=link.id,
            actor_uuid=actor_uuid,
            actor_role=actor_role,
            business_line=profile.business_line if profile else None,
            detail={"action": "agent_invite_revoked"},
        )
        await db.commit()


async def describe_invite(token: str) -> dict[str, str] | None:
    if not _MIN_TOKEN_LEN <= len(token) <= _MAX_TOKEN_LEN:
        return None
    now = datetime.now(UTC)
    async with db_session.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                select(User.first_name, AgentProfile.agent_code)
                .join(AgentInviteLink, AgentInviteLink.auth_user_uuid == User.id)
                .join(AgentProfile, AgentProfile.id == AgentInviteLink.agent_profile_uuid)
                .join(
                    AgentApplication,
                    AgentApplication.id == AgentInviteLink.application_uuid,
                )
                .where(
                    AgentInviteLink.token_hash == _token_hash(token),
                    AgentInviteLink.expires_at > now,
                    AgentInviteLink.revoked_at.is_(None),
                    AgentInviteLink.used_at.is_(None),
                    AgentProfile.status == ProfileStatus.ACTIVE,
                    AgentApplication.status == SubmissionStatus.APPROVED,
                    User.status == UserStatus.PENDING_PASSWORD_RESET,
                )
            )
        ).one_or_none()
    if row is None:
        return None
    return {"first_name": row[0] or "", "agent_code": row[1]}


async def consume_invite(token: str, password: str) -> bool:
    if not _MIN_TOKEN_LEN <= len(token) <= _MAX_TOKEN_LEN:
        return False
    now = datetime.now(UTC)
    async with db_session.AsyncSessionLocal() as db:
        link = await db.scalar(
            select(AgentInviteLink)
            .where(
                AgentInviteLink.token_hash == _token_hash(token),
                AgentInviteLink.expires_at > now,
                AgentInviteLink.revoked_at.is_(None),
                AgentInviteLink.used_at.is_(None),
            )
            .with_for_update()
        )
        if link is None:
            return False
        profile = await db.get(AgentProfile, link.agent_profile_uuid)
        application = await db.get(AgentApplication, link.application_uuid)
        user = await db.get(User, link.auth_user_uuid, with_for_update=True)
        if (
            profile is None
            or profile.status != ProfileStatus.ACTIVE
            or application is None
            or application.status != SubmissionStatus.APPROVED
            or user is None
            or user.status != UserStatus.PENDING_PASSWORD_RESET
        ):
            return False
        try:
            validate_password_policy(password, user.mobile or "")
        except ValueError as exc:
            raise AgentInvitePasswordRejected(str(exc)) from exc
        user.password_hash = await hash_password(password)
        user.status = UserStatus.ACTIVE
        link.used_at = now
        await db.commit()
        return True
