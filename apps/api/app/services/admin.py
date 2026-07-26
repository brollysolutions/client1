"""Admin provisioning — staff create + agent-application approval.

Every write here runs on the request session under RLS (Depends(get_db) from the
router), NOT a bypass AsyncSessionLocal session. An Admin's JWT carries
platform_scope="true", which the WITH CHECK clauses in
alembic/versions/f2e4d6c8a0b1_add_rls_policies.py accept on auth_users,
staff_profiles, agent_profiles, and agent_applications — unlike
services.property_submissions, no bypass producer is needed here because api_user
can INSERT/UPDATE these tables directly under the admin's own RLS context.
core.deps.require_admin (not RLS) is the real admin-only access gate: RLS's
platform_scope check alone would let any platform-scoped staff (e.g. a platform
sub_admin) write staff_profiles too.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import generate_profile_code, generate_temp_password, hash_password
from app.models.profile import (
    AgentApplication,
    AgentProfile,
    ProfileScope,
    ProfileStatus,
    StaffProfile,
    StaffRole,
    SubmissionStatus,
)
from app.models.user import User, UserStatus
from app.schemas.admin import StaffCreateRequest


class StaffAlreadyExists(Exception):
    """Raised when the target mobile already has an ACTIVE staff profile."""


class AgentApplicationAlreadyReviewed(Exception):
    """Raised when approve/reject targets a row that is no longer pending."""


class AgentApplicationEmailConflict(Exception):
    """Raised when the application's email already belongs to another account."""


async def create_staff(
    db: AsyncSession, actor_id: UUID, payload: StaffCreateRequest
) -> tuple[StaffProfile, str | None]:
    """Create or attach a staff profile. Returns (profile, temp_password).

    temp_password is None when attaching a staff role to an account that already
    has a working password (their existing credentials keep working — e.g. an
    existing client account being promoted to staff); a brand-new account gets a
    generated temp password and PENDING_PASSWORD_RESET so the unified /login
    forced-reset flow (Auth Design §6.2) takes over on first sign-in.
    """
    role = StaffRole(payload.role)
    scope = ProfileScope.PLATFORM if role == StaffRole.SUB_ADMIN else ProfileScope.LINE
    business_line = None if scope == ProfileScope.PLATFORM else payload.business_line

    user = await db.scalar(select(User).where(User.mobile == payload.mobile))
    temp_password: str | None = None

    if user is not None:
        existing = await db.scalar(
            select(StaffProfile).where(
                StaffProfile.auth_user_uuid == user.id,
                StaffProfile.status == ProfileStatus.ACTIVE,
            )
        )
        if existing is not None:
            raise StaffAlreadyExists
    else:
        temp_password = generate_temp_password(payload.mobile)
        user = User(
            first_name=payload.first_name,
            last_name=payload.last_name,
            mobile=payload.mobile,
            email=payload.email,
            password_hash=await hash_password(temp_password),
            status=UserStatus.PENDING_PASSWORD_RESET,
            phone_verified_at=datetime.now(UTC),
            created_by_auth_user_uuid=actor_id,
        )
        db.add(user)
        try:
            await db.flush()  # get user.id; also surfaces a mobile/email UNIQUE race
        except IntegrityError as exc:
            raise StaffAlreadyExists from exc

    profile = StaffProfile(
        auth_user_uuid=user.id,
        role=role,
        scope=scope,
        business_line=business_line,
        staff_code="",
        status=ProfileStatus.ACTIVE,
        created_by_auth_user_uuid=actor_id,
    )
    for attempt in range(5):
        profile.staff_code = generate_profile_code(role.value, payload.first_name, business_line)
        try:
            async with db.begin_nested():
                db.add(profile)
            break  # savepoint committed
        except IntegrityError:
            if attempt == 4:
                raise

    await db.commit()
    return profile, temp_password


async def approve_agent_application(
    db: AsyncSession, application_id: UUID, reviewer_staff_uuid: UUID | None
) -> tuple[AgentProfile, str | None] | None:
    """Approve a pending agent application. Returns (profile, temp_password), or
    None if the application id doesn't exist. Raises AgentApplicationAlreadyReviewed
    if it's no longer pending."""
    application = await db.get(AgentApplication, application_id, with_for_update=True)
    if application is None:
        return None
    if application.status != SubmissionStatus.PENDING:
        raise AgentApplicationAlreadyReviewed

    temp_password: str | None = None
    user: User | None = None
    if application.applicant_auth_user_uuid is not None:
        user = await db.get(User, application.applicant_auth_user_uuid)
    elif application.mobile:
        user = await db.scalar(select(User).where(User.mobile == application.mobile))

    if user is None:
        if not application.mobile:
            raise ValueError("Application has no applicant account and no mobile to create one.")
        temp_password = generate_temp_password(application.mobile)
        # The public intake endpoint (migration c1d2e3f4a5b6) now collects a
        # real email; use it so the new agent can actually receive
        # notifications and complete email-verify 2FA. Rows predating that
        # migration (seed data, legacy) have no email — fall back to the
        # non-deliverable placeholder rather than block approval on old data.
        email = application.email or f"agent-{application.id.hex[:12]}@no-reply.invalid"
        if application.email and await db.scalar(select(User).where(User.email == email)):
            # Admin-gated endpoint, so revealing "this email is taken" here is
            # not an enumeration risk the way it would be on a public route.
            raise AgentApplicationEmailConflict
        user = User(
            first_name=application.first_name or "",
            last_name=application.last_name or "",
            mobile=application.mobile,
            email=email,
            password_hash=await hash_password(temp_password),
            status=UserStatus.PENDING_PASSWORD_RESET,
            phone_verified_at=datetime.now(UTC),
        )
        db.add(user)
        try:
            await db.flush()
        except IntegrityError as exc:  # UNIQUE race between the check above and this insert
            raise AgentApplicationEmailConflict from exc

    profile = AgentProfile(
        auth_user_uuid=user.id,
        agent_code="",
        business_line=application.business_line,
        application_uuid=application.id,
        rera_code=application.rera_code,
        status=ProfileStatus.ACTIVE,
        approved_by_staff_profile_uuid=reviewer_staff_uuid,
        approved_at=datetime.now(UTC),
    )
    for attempt in range(5):
        profile.agent_code = generate_profile_code(
            "agent", application.first_name or "AGNT", application.business_line
        )
        try:
            async with db.begin_nested():
                db.add(profile)
            break
        except IntegrityError:
            if attempt == 4:
                raise

    application.status = SubmissionStatus.APPROVED
    application.reviewed_by_staff_profile_uuid = reviewer_staff_uuid
    application.reviewed_at = datetime.now(UTC)
    await db.commit()
    return profile, temp_password


async def reject_agent_application(
    db: AsyncSession,
    application_id: UUID,
    reviewer_staff_uuid: UUID | None,
    note: str,  # noqa: ARG001 — accepted for reviewer context, not persisted this slice
) -> bool:
    application = await db.get(AgentApplication, application_id, with_for_update=True)
    if application is None:
        return False
    if application.status != SubmissionStatus.PENDING:
        raise AgentApplicationAlreadyReviewed
    application.status = SubmissionStatus.REJECTED
    application.reviewed_by_staff_profile_uuid = reviewer_staff_uuid
    application.reviewed_at = datetime.now(UTC)
    await db.commit()
    return True
