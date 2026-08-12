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

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import generate_profile_code, generate_temp_password, hash_password
from app.models.audit_log import AuditAction
from app.models.notification import NotificationType
from app.models.profile import (
    AgentApplication,
    AgentProfile,
    ClientProfile,
    ProfileScope,
    ProfileStatus,
    StaffFeatureGrant,
    StaffProfile,
    StaffRole,
    SubmissionStatus,
)
from app.models.user import User, UserStatus
from app.schemas.admin import StaffCreateRequest
from app.services import storage
from app.services.admin_notify import notify_admins
from app.services.agent_applications import scrub_documents
from app.services.audit_log import record as record_audit


class StaffAlreadyExists(Exception):
    """Raised when the target mobile already has an ACTIVE staff profile."""


class PrimaryAdminRequired(Exception):
    """Raised when a Main-Admin-only hierarchy action is attempted."""


class AdditionalAdminLimitReached(Exception):
    """Raised when three active additional Admin accounts already exist."""


class InvalidStaffFeatureTarget(Exception):
    """Raised when a grant targets anyone except an active Sub Admin."""


class AdminUserUpdateForbidden(Exception):
    """Raised for self, immutable-Main-Admin, or non-operational status changes."""


class AdminUserNotFound(Exception):
    """Raised when an Admin targets a missing or deleted identity."""


ADDITIONAL_ADMIN_LIMIT = 3
SUPPORTED_STAFF_FEATURES = {"payout_requests"}
_email_adapter = TypeAdapter(EmailStr)


async def is_primary_admin(
    db: AsyncSession,
    *,
    auth_user_uuid: UUID,
    staff_profile_uuid: UUID | None,
) -> bool:
    if staff_profile_uuid is None:
        return False
    return bool(
        await db.scalar(
            select(StaffProfile.is_primary_admin).where(
                StaffProfile.id == staff_profile_uuid,
                StaffProfile.auth_user_uuid == auth_user_uuid,
                StaffProfile.role == StaffRole.ADMIN,
                StaffProfile.scope == ProfileScope.PLATFORM,
                StaffProfile.status == ProfileStatus.ACTIVE,
            )
        )
    )


async def list_operational_users(
    db: AsyncSession, *, limit: int, offset: int
) -> tuple[list[tuple[User, list[str], list[ClientProfile]]], int]:
    total = await db.scalar(select(func.count()).select_from(User)) or 0
    users = (
        await db.scalars(
            select(User)
            .order_by(User.created_at.desc(), User.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    user_ids = [user.id for user in users]
    if not user_ids:
        return [], total
    roles: dict[UUID, set[str]] = {user_id: set() for user_id in user_ids}
    staff_rows = await db.execute(
        select(StaffProfile.auth_user_uuid, StaffProfile.role).where(
            StaffProfile.auth_user_uuid.in_(user_ids)
        )
    )
    for user_id, role in staff_rows.all():
        roles[user_id].add(role.value)
    agent_ids = await db.scalars(
        select(AgentProfile.auth_user_uuid).where(AgentProfile.auth_user_uuid.in_(user_ids))
    )
    for user_id in agent_ids.all():
        roles[user_id].add("agent")
    profiles: dict[UUID, list[ClientProfile]] = {user_id: [] for user_id in user_ids}
    client_profiles = await db.scalars(
        select(ClientProfile)
        .where(ClientProfile.auth_user_uuid.in_(user_ids))
        .order_by(ClientProfile.business_line.asc(), ClientProfile.id.asc())
    )
    for profile in client_profiles.all():
        roles[profile.auth_user_uuid].add("client")
        profiles[profile.auth_user_uuid].append(profile)
    return [(user, sorted(roles[user.id]), profiles[user.id]) for user in users], total


async def set_operational_user_status(
    db: AsyncSession,
    *,
    target_user_uuid: UUID,
    target_status: UserStatus,
    reason: str,
    actor_uuid: UUID,
    actor_role: str,
) -> User:
    target = await db.get(User, target_user_uuid, with_for_update=True)
    if target is None or target.status == UserStatus.SOFT_DELETED:
        raise AdminUserNotFound
    if target.id == actor_uuid or target.status not in (UserStatus.ACTIVE, UserStatus.SUSPENDED):
        raise AdminUserUpdateForbidden
    primary_admin = await db.scalar(
        select(StaffProfile.id).where(
            StaffProfile.auth_user_uuid == target.id, StaffProfile.is_primary_admin.is_(True)
        )
    )
    if primary_admin:
        raise AdminUserUpdateForbidden
    if target.status == target_status:
        return target
    previous_status = target.status
    target.status = target_status
    profile_status = (
        ProfileStatus.SUSPENDED if target_status == UserStatus.SUSPENDED else ProfileStatus.ACTIVE
    )
    for profile_model in (StaffProfile, AgentProfile, ClientProfile):
        await db.execute(
            update(profile_model)
            .where(profile_model.auth_user_uuid == target.id)
            .values(status=profile_status)
        )
    target.session_version += 1
    from app.services.auth_service import _revoke_all_refresh_tokens

    await _revoke_all_refresh_tokens(db, target.id, commit=False)
    await record_audit(
        db,
        action=AuditAction.ACCOUNT_STATUS_UPDATED,
        entity_type="auth_user",
        entity_uuid=target.id,
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        detail={
            "previous_status": previous_status.value,
            "status": target_status.value,
            "reason": reason,
        },
    )
    await db.commit()
    await db.refresh(target)
    return target


async def operational_roles_for(db: AsyncSession, user_id: UUID) -> list[str]:
    roles: set[str] = set()
    for role in (
        await db.scalars(select(StaffProfile.role).where(StaffProfile.auth_user_uuid == user_id))
    ).all():
        roles.add(role.value)
    if await db.scalar(select(AgentProfile.id).where(AgentProfile.auth_user_uuid == user_id)):
        roles.add("agent")
    if await db.scalar(select(ClientProfile.id).where(ClientProfile.auth_user_uuid == user_id)):
        roles.add("client")
    return sorted(roles)


async def operational_client_profiles_for(db: AsyncSession, user_id: UUID) -> list[ClientProfile]:
    return list(
        (
            await db.scalars(
                select(ClientProfile)
                .where(ClientProfile.auth_user_uuid == user_id)
                .order_by(ClientProfile.business_line.asc(), ClientProfile.id.asc())
            )
        ).all()
    )


def operational_email_for(user: User) -> str | None:
    """Return only a serializable address; redact deletion and malformed legacy values."""
    if user.status == UserStatus.SOFT_DELETED or user.email is None:
        return None
    try:
        return str(_email_adapter.validate_python(user.email))
    except ValidationError:
        return None


def operational_mobile_for(user: User) -> str | None:
    """Never return the internal deleted-{uuid} account-deletion tombstone."""
    return None if user.status == UserStatus.SOFT_DELETED else user.mobile


class AgentApplicationAlreadyReviewed(Exception):
    """Raised when approve/reject targets a row that is no longer pending."""


class AgentApplicationEmailConflict(Exception):
    """Raised when the application's email already belongs to another account."""


async def create_staff(
    db: AsyncSession,
    actor_id: UUID,
    payload: StaffCreateRequest,
    *,
    actor_role: str | None = None,
    actor_staff_profile_uuid: UUID | None = None,
) -> tuple[StaffProfile, str | None]:
    """Create or attach a staff profile. Returns (profile, temp_password).

    temp_password is None when attaching a staff role to an account that already
    has a working password (their existing credentials keep working — e.g. an
    existing client account being promoted to staff); a brand-new account gets a
    generated temp password and PENDING_PASSWORD_RESET so the unified /login
    forced-reset flow (Auth Design §6.2) takes over on first sign-in.
    """
    role = StaffRole(payload.role)
    if role == StaffRole.ADMIN:
        if not await is_primary_admin(
            db,
            auth_user_uuid=actor_id,
            staff_profile_uuid=actor_staff_profile_uuid,
        ):
            raise PrimaryAdminRequired
        # Serialize the count and INSERT so concurrent requests cannot both
        # observe the last free slot. The stable key is internal and held only
        # for this transaction.
        await db.execute(text("SELECT pg_advisory_xact_lock(73190421)"))
        additional_admins = await db.scalar(
            select(func.count())
            .select_from(StaffProfile)
            .where(
                StaffProfile.role == StaffRole.ADMIN,
                StaffProfile.status == ProfileStatus.ACTIVE,
                StaffProfile.is_primary_admin.is_(False),
            )
        )
        if (additional_admins or 0) >= ADDITIONAL_ADMIN_LIMIT:
            raise AdditionalAdminLimitReached

    scope = (
        ProfileScope.PLATFORM
        if role in (StaffRole.ADMIN, StaffRole.SUB_ADMIN)
        else ProfileScope.LINE
    )
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
        if user.email is None:
            # Mobile-first Clients may not yet have an email. Staff
            # provisioning still requires one, so attach the Admin-supplied
            # address without replacing an identity address already on file.
            user.email = payload.email
            user.email_verified_at = None
            try:
                await db.flush()
            except IntegrityError as exc:
                raise StaffAlreadyExists from exc
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
        is_primary_admin=False,
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

    # Same transaction as the provisioning itself, so a rolled-back create leaves
    # no audit row claiming it happened. No mobile/email in `detail` — the service
    # layer's audit helper rejects those keys outright.
    await record_audit(
        db,
        action=AuditAction.STAFF_CREATED,
        entity_type="staff_profile",
        entity_uuid=profile.id,
        actor_uuid=actor_id,
        actor_role=actor_role,
        business_line=None if business_line == "both" else business_line,
        detail={
            "role": role.value,
            "scope": scope.value,
            "assigned_business_line": business_line,
            "staff_code": profile.staff_code,
            "new_account": temp_password is not None,
        },
    )
    await db.commit()

    await notify_admins(
        notification_type=NotificationType.ADMIN_ACCOUNT_ACTION,
        title="Staff account created",
        body=(
            f"A new {role.value.replace('_', ' ')} account was provisioned ({profile.staff_code})."
        ),
        href="/dashboard/staff",
        exclude_user_uuid=actor_id,
    )

    return profile, temp_password


async def list_staff_access(db: AsyncSession) -> tuple[list[dict], int]:
    rows = (
        await db.execute(
            select(StaffProfile, User)
            .join(User, User.id == StaffProfile.auth_user_uuid)
            .where(
                StaffProfile.role.in_((StaffRole.ADMIN, StaffRole.SUB_ADMIN)),
                StaffProfile.status == ProfileStatus.ACTIVE,
            )
            .order_by(
                StaffProfile.is_primary_admin.desc(), StaffProfile.created_at, StaffProfile.id
            )
        )
    ).all()
    profile_ids = [profile.id for profile, _user in rows]
    grants = (
        await db.execute(
            select(StaffFeatureGrant.staff_profile_uuid, StaffFeatureGrant.feature).where(
                StaffFeatureGrant.staff_profile_uuid.in_(profile_ids)
            )
        )
    ).all()
    by_profile: dict[UUID, list[str]] = {}
    for profile_uuid, feature in grants:
        by_profile.setdefault(profile_uuid, []).append(feature)

    entries = [
        {
            "staff_profile_uuid": profile.id,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "staff_code": profile.staff_code,
            "role": profile.role.value,
            "is_primary_admin": profile.is_primary_admin,
            "features": sorted(by_profile.get(profile.id, [])),
        }
        for profile, user in rows
    ]
    additional_count = sum(
        1
        for profile, _user in rows
        if profile.role == StaffRole.ADMIN and not profile.is_primary_admin
    )
    return entries, additional_count


async def set_staff_feature(
    db: AsyncSession,
    *,
    actor_uuid: UUID,
    actor_staff_profile_uuid: UUID | None,
    target_staff_profile_uuid: UUID,
    feature: str,
    enabled: bool,
    actor_role: str | None,
) -> None:
    if feature not in SUPPORTED_STAFF_FEATURES:
        raise ValueError("Unsupported staff feature.")
    if not await is_primary_admin(
        db,
        auth_user_uuid=actor_uuid,
        staff_profile_uuid=actor_staff_profile_uuid,
    ):
        raise PrimaryAdminRequired

    target = await db.get(StaffProfile, target_staff_profile_uuid, with_for_update=True)
    if (
        target is None
        or target.role != StaffRole.SUB_ADMIN
        or target.scope != ProfileScope.PLATFORM
        or target.status != ProfileStatus.ACTIVE
    ):
        raise InvalidStaffFeatureTarget

    grant = await db.get(StaffFeatureGrant, (target_staff_profile_uuid, feature))
    changed = False
    if enabled and grant is None:
        db.add(
            StaffFeatureGrant(
                staff_profile_uuid=target_staff_profile_uuid,
                feature=feature,
                granted_by_auth_user_uuid=actor_uuid,
            )
        )
        changed = True
    elif not enabled and grant is not None:
        await db.execute(
            delete(StaffFeatureGrant).where(
                StaffFeatureGrant.staff_profile_uuid == target_staff_profile_uuid,
                StaffFeatureGrant.feature == feature,
            )
        )
        changed = True

    if not changed:
        return

    target_user = await db.get(User, target.auth_user_uuid, with_for_update=True)
    if target_user is not None:
        # Feature claims live in access tokens. Version invalidation makes a
        # grant/revocation effective on the target's very next request.
        target_user.session_version += 1
        from app.services.auth_service import _revoke_all_refresh_tokens

        await _revoke_all_refresh_tokens(db, target_user.id, commit=False)

    await record_audit(
        db,
        action=(
            AuditAction.STAFF_FEATURE_GRANTED if enabled else AuditAction.STAFF_FEATURE_REVOKED
        ),
        entity_type="staff_profile",
        entity_uuid=target.id,
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        business_line=None,
        detail={"feature": feature, "target_role": target.role.value},
    )
    await db.commit()


async def approve_agent_application(
    db: AsyncSession,
    application_id: UUID,
    reviewer_staff_uuid: UUID | None,
    *,
    actor_uuid: UUID | None = None,
    actor_role: str | None = None,
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
    elif user.email is None and application.email:
        # An existing mobile-first Client can reach Agent approval without an
        # identity email. Preserve mandatory Agent onboarding by attaching the
        # application's address, while never overwriting an existing address.
        user.email = application.email
        user.email_verified_at = None
        try:
            await db.flush()
        except IntegrityError as exc:
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
    # entity is the application (the thing reviewed); the profile it produced goes
    # in `detail` so the trail reads "approved application X, which created agent Y".
    await record_audit(
        db,
        action=AuditAction.AGENT_APPROVED,
        entity_type="agent_application",
        entity_uuid=application.id,
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        business_line=application.business_line,
        detail={
            "agent_profile_uuid": str(profile.id),
            "agent_code": profile.agent_code,
            "reviewer_staff_profile_uuid": (
                str(reviewer_staff_uuid) if reviewer_staff_uuid else None
            ),
            "new_account": temp_password is not None,
        },
    )
    await db.commit()
    return profile, temp_password


async def reject_agent_application(
    db: AsyncSession,
    application_id: UUID,
    reviewer_staff_uuid: UUID | None,
    note: str,
    *,
    actor_uuid: UUID | None = None,
    actor_role: str | None = None,
) -> bool:
    application = await db.get(AgentApplication, application_id, with_for_update=True)
    if application is None:
        return False
    if application.status != SubmissionStatus.PENDING:
        raise AgentApplicationAlreadyReviewed
    application.status = SubmissionStatus.REJECTED
    application.reviewed_by_staff_profile_uuid = reviewer_staff_uuid
    application.reviewed_at = datetime.now(UTC)
    # Persisted now (closes feature-status §2-11), not just carried in the
    # audit detail below — an admin re-opening a rejected application's
    # detail view needs to see why without reading the activity log.
    application.review_note = note
    # PII retention (closes feature-status §2-11): a rejected application's
    # KYC objects stayed referenced forever otherwise, so the orphan-purge
    # sweep (which only deletes UNREFERENCED objects) could never reach
    # them. Null the refs, flush so the DB write is durable, THEN delete
    # from storage — a storage failure must never roll back the rejection.
    doc_keys = scrub_documents(application)
    await record_audit(
        db,
        action=AuditAction.AGENT_REJECTED,
        entity_type="agent_application",
        entity_uuid=application.id,
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        business_line=application.business_line,
        detail={
            "note": note,
            "reviewer_staff_profile_uuid": (
                str(reviewer_staff_uuid) if reviewer_staff_uuid else None
            ),
        },
    )
    await db.commit()
    for key in doc_keys:
        storage.delete_object(key)  # best-effort, already swallows failures
    return True
