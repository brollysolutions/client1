"""Auth business logic — registration, login, token management (Auth Design §6)."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import BackgroundTasks, HTTPException, status
from jose import JWTError
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis_keys import (
    TTL_OTP,
    RedisCache,
    jwt_blacklist_key,
    otp_email_verify_key,
    otp_email_verify_target_key,
    reg_data_key,
)
from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    generate_profile_code,
    hash_password,
    hash_refresh_token,
    validate_password_policy,
    verify_password,
)
from app.models.auth import AuthEvent, RefreshToken
from app.models.profile import (
    AgentProfile,
    ClientProfile,
    ProfileScope,
    ProfileStatus,
    StaffFeatureGrant,
    StaffProfile,
)
from app.models.user import User, UserStatus
from app.schemas.auth import (
    AccountDeleteRequest,
    AuthTokensResponse,
    ChangePasswordRequest,
    ClientProfileSummary,
    EmailVerifyInitiateResponse,
    ForgotInitiateResponse,
    ForgotVerifyRequest,
    LoginRequest,
    MeResponse,
    MeUpdateRequest,
    RegisterInitiateRequest,
    RegisterInitiateResponse,
    RegisterVerifyOtpRequest,
    RegistrationTokenResponse,
    ResendOtpResponse,
    ResetPasswordRequest,
    ResetTokenResponse,
    SetPasswordRequest,
)
from app.services import account_deletion, referrals
from app.services.leads import (
    bind_registered_client_leads,
    capture_lead,
    lock_lead_mobile,
    notify_lead_assignments,
)
from app.services.otp import (
    check_login_lock,
    check_login_rate_ip,
    check_otp_rate_ip,
    clear_login_failures,
    ensure_active_otp_session,
    generate_and_store_otp,
    record_login_failure,
    record_login_failure_ip,
    resend_otp,
    verify_otp,
)
from app.services.otp_delivery import deliver_otp

logger = logging.getLogger(__name__)

_GENERIC_LOGIN_ERROR = "Invalid mobile number or password."


class NoActiveAccessProfile(Exception):
    """The auth identity has no active staff, Agent, or Client authority."""


def _is_mock_env() -> bool:
    # Fail-closed OTP-hint gate (audit L3). The old check was `ENV != "production"`,
    # which fails OPEN: any misread ENV (staging / "prod" / unset) leaked a live
    # code. Expose the hint only for the exact "development" sentinel — which the
    # SECRET_KEY guard already forbids in real deploys — or an explicit opt-in flag
    # for a controlled non-dev test box. Anything else never returns the code.
    return settings.OTP_EXPOSE_HINT or settings.ENV == "development"


def _email_verification_fingerprint(email: str) -> str:
    """Bind an OTP to an address without storing raw email in Redis."""
    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        email.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _build_tokens_response(access_token: str, user: User | None = None) -> AuthTokensResponse:
    return AuthTokensResponse(
        access_token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        phone_verified=bool(user and user.phone_verified_at),
        email_verified=bool(user and user.email_verified_at),
    )


async def _issue_tokens(
    db: AsyncSession,
    user: User,
    payload: dict | None = None,
) -> tuple[AuthTokensResponse, str]:
    """Issue access + refresh tokens. Returns (response, raw_refresh_token)."""
    payload = payload or await _build_access_claims(db, user)
    access_token = create_access_token(payload)
    raw_refresh, refresh_hash = create_refresh_token()

    now = datetime.now(UTC)
    token_row = RefreshToken(
        auth_user_uuid=user.id,
        token_hash=refresh_hash,
        issued_at=now,
        expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(token_row)
    await db.commit()
    await db.refresh(token_row)

    return _build_tokens_response(access_token, user), raw_refresh


async def _revoke_all_refresh_tokens(
    db: AsyncSession, auth_user_uuid: UUID, *, commit: bool = True
) -> None:
    """Revoke every live refresh token for a user.

    Used on (a) refresh-token reuse detection — revoke the whole chain so a stolen
    token can never mint again; (b) logout — terminate the session server-side
    regardless of whether the cookie reached this endpoint; (c) password
    change/reset — evict any pre-existing session (e.g. an attacker's) after the
    credential rotates. Pass commit=False to fold the revoke into the caller's own
    transaction (e.g. atomically with a password write); default commits its UPDATE.
    """
    await db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.auth_user_uuid == auth_user_uuid,
            RefreshToken.revoked.is_(False),
        )
        .values(revoked=True)
    )
    if commit:
        await db.commit()


async def _build_access_claims(db: AsyncSession, user: User) -> dict:
    """Resolve role + RLS claims from the user's profile rows.

    These claims drive the Postgres RLS session context that get_current_user
    installs before any business query: `app.role`, `app.business_line`,
    `app.platform_scope`, and the acting `app.*_profile_uuid`. The claim values
    must line up exactly with the policy predicates in the add_rls_policies
    migration (platform_scope == 'true' bypasses; role IN
    ('telecaller','employee','sub_admin') + matching business_line is the
    line-scoped staff branch).

    Precedence: staff > agent > client. A normal account is exactly one kind;
    if multiple ever coexist, the most privileged wins.
    """
    claims: dict = {"sub": str(user.id), "session_version": user.session_version}

    staff = await db.scalar(
        select(StaffProfile).where(
            StaffProfile.auth_user_uuid == user.id,
            StaffProfile.status == ProfileStatus.ACTIVE,
        )
    )
    if staff is not None:
        claims["role"] = staff.role.value
        claims["business_line"] = staff.business_line or ""
        # Platform-scoped staff (admin, platform sub-admin) bypass the line
        # filter; line-scoped staff are pinned to their one business_line.
        claims["platform_scope"] = "true" if staff.scope == ProfileScope.PLATFORM else "false"
        claims["staff_profile_uuid"] = str(staff.id)
        claims["staff_features"] = sorted(
            (
                await db.scalars(
                    select(StaffFeatureGrant.feature).where(
                        StaffFeatureGrant.staff_profile_uuid == staff.id
                    )
                )
            ).all()
        )
        return claims

    agent = await db.scalar(
        select(AgentProfile).where(
            AgentProfile.auth_user_uuid == user.id,
            AgentProfile.status == ProfileStatus.ACTIVE,
        )
    )
    if agent is not None:
        claims["role"] = "agent"
        claims["business_line"] = agent.business_line
        claims["platform_scope"] = "false"
        claims["agent_profile_uuid"] = str(agent.id)
        return claims

    clients = (
        await db.scalars(
            select(ClientProfile)
            .where(
                ClientProfile.auth_user_uuid == user.id,
                ClientProfile.status == ProfileStatus.ACTIVE,
            )
            .order_by(ClientProfile.business_line)
        )
    ).all()
    if not clients:
        raise NoActiveAccessProfile
    claims["role"] = "client"
    claims["platform_scope"] = "false"
    lines = {c.business_line for c in clients}
    # A client holding both lines carries "both"; the client policy filters
    # on own auth_user_uuid regardless, so this is only informational. The
    # ORDER BY makes the acting profile uuid deterministic (loans first).
    claims["business_line"] = "both" if len(lines) > 1 else next(iter(lines))
    claims["client_profile_uuid"] = str(clients[0].id)
    return claims


async def _log_event(
    db: AsyncSession,
    *,
    auth_user_uuid: UUID | None,
    event_type: str,
    mobile: str | None,
    ip: str | None,
    user_agent: str | None,
    success: bool,
    detail: dict | None = None,
) -> None:
    event = AuthEvent(
        auth_user_uuid=auth_user_uuid,
        event_type=event_type,
        mobile=mobile,
        ip=ip,
        user_agent=user_agent,
        success=success,
        detail=detail,
        created_at=datetime.now(UTC),
    )
    db.add(event)
    await db.commit()


# ---------------------------------------------------------------------------
# Registration (Auth Design §6.1)
# ---------------------------------------------------------------------------


async def register_initiate(
    db: AsyncSession,
    cache: RedisCache,
    req: RegisterInitiateRequest,
    ip: str | None = None,
    user_agent: str | None = None,
) -> RegisterInitiateResponse:
    await check_otp_rate_ip(cache, ip)
    existing = await db.scalar(select(User).where(User.mobile == req.mobile))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mobile number already registered.",
        )
    # Capture the number IN-LINE (not deferred): later rate-limit failures raise
    # HTTPException, and FastAPI never runs a BackgroundTask on a raised response.
    # The existing-user check above prevents operational identities from being
    # captured as customer leads through registration.
    # Profiles remain dual-line under CS-001; only explicitly requested service
    # journeys are captured for follow-up.
    for business_line in req.service_lines:
        await capture_lead(
            req.mobile,
            name=f"{req.first_name} {req.last_name}".strip(),
            business_line=business_line,
        )

    otp = await generate_and_store_otp(cache, req.mobile, "register")
    await cache.set(
        reg_data_key(req.mobile),
        json.dumps(
            {
                "first_name": req.first_name,
                "last_name": req.last_name,
                "referral_code": req.referral_code,
                "service_lines": req.service_lines,
            }
        ),
        TTL_OTP,
    )
    # Registration must prove control of the mobile. An unverified,
    # self-asserted email can never be a fallback for that proof.
    channel = await deliver_otp(req.mobile, "", otp, allow_email_fallback=False)

    await _log_event(
        db,
        auth_user_uuid=None,
        event_type="otp_sent",
        mobile=req.mobile,
        ip=ip,
        user_agent=user_agent,
        success=True,
        detail={"purpose": "register", "channel": channel},
    )

    return RegisterInitiateResponse(
        message="Verification code sent. You will receive a call shortly.",
        delivery_channel=channel,
        otp_hint=otp if (channel == "none" and _is_mock_env()) else None,
    )


async def register_verify_otp(
    db: AsyncSession,
    cache: RedisCache,
    req: RegisterVerifyOtpRequest,
) -> RegistrationTokenResponse:
    await verify_otp(cache, req.mobile, "register", req.otp)

    raw = await cache.get(reg_data_key(req.mobile))
    reg_data: dict = json.loads(raw) if raw else {}
    await cache.delete(reg_data_key(req.mobile))

    reg_token = create_access_token(
        {
            "purpose": "register",
            "mobile": req.mobile,
            "first_name": reg_data.get("first_name", ""),
            "last_name": reg_data.get("last_name", ""),
            # A referral code is a public shareable token, not a secret — fine
            # to carry in a signed, short-lived registration token.
            "referral_code": reg_data.get("referral_code"),
            "service_lines": reg_data.get("service_lines", ["loans"]),
        }
    )
    return RegistrationTokenResponse(registration_token=reg_token)


async def register_set_password(
    db: AsyncSession,
    cache: RedisCache,
    req: SetPasswordRequest,
    ip: str | None = None,
    user_agent: str | None = None,
) -> tuple[AuthTokensResponse, str]:
    """Create auth_user + client_profile(s). Returns (tokens_response, raw_refresh)."""
    try:
        claims = decode_access_token(req.registration_token)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired registration token.",
        ) from exc

    if claims.get("purpose") != "register":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid registration token.",
        )

    mobile: str = claims["mobile"]
    try:
        validate_password_policy(req.password, mobile)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    await lock_lead_mobile(db, mobile)
    existing = await db.scalar(select(User).where(User.mobile == mobile))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mobile number already registered.",
        )
    # Every self-registered client is enrolled in both business lines: one User,
    # two ClientProfiles (each with its own customer_code). See
    # docs/specs/dual-line-clients.md.
    lines: list[str] = ["loans", "real_estate"]

    user = User(
        first_name=claims.get("first_name", ""),
        last_name=claims.get("last_name", ""),
        mobile=mobile,
        email=None,
        password_hash=await hash_password(req.password),
        status=UserStatus.ACTIVE,
        phone_verified_at=datetime.now(UTC),  # mobile proven by the registration OTP
        # email_verified_at stays NULL — verified later via the post-login banner flow.
    )
    db.add(user)
    try:
        await db.flush()  # get user.id before creating profiles
    except IntegrityError as exc:  # mobile UNIQUE race between check and insert
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mobile number already registered.",
        ) from exc

    profiles_by_line: dict[str, UUID] = {}
    for line in lines:
        for attempt in range(5):
            code = generate_profile_code("client", user.first_name, line)
            try:
                async with db.begin_nested():
                    profile = ClientProfile(
                        auth_user_uuid=user.id,
                        business_line=line,
                        customer_code=code,
                        status=ProfileStatus.ACTIVE,
                    )
                    db.add(profile)
                break  # savepoint committed — next line
            except IntegrityError:
                if attempt == 4:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Could not generate unique profile code. Please try again.",
                    ) from None
        profiles_by_line[line] = profile.id

    # Issue this new client's own referral code inside the same transaction as
    # the profile rows, same savepoint + retry shape. skip_eligibility=True:
    # a brand-new self-registered client is eligible by construction (no
    # agent/staff profile can possibly exist yet for this auth_user). This
    # unauthenticated endpoint has no auth dependency, so get_current_user's
    # `SET LOCAL ROLE api_user` never runs on `db` — the session still holds
    # the engine's default (superuser) role, same as customer_code above, so
    # it can write the SELECT-only-for-api_user referral_codes table directly.
    await referrals.issue_code_on_session(db, user.id, skip_eligibility=True)

    requested_lines = {
        line for line in claims.get("service_lines", ["loans"]) if line in ("loans", "real_estate")
    }
    if not requested_lines:
        requested_lines = {"loans"}
    assignment_notices = await bind_registered_client_leads(
        db,
        mobile=mobile,
        profiles_by_line=profiles_by_line,
        requested_lines=requested_lines,
        name=f"{user.first_name} {user.last_name}".strip(),
    )

    await db.commit()
    await notify_lead_assignments(assignment_notices)

    # Best-effort attribution against the code the registering person entered
    # (if any). Never blocks or fails registration — see
    # services.referrals.attribute_signup's own try/except.
    referral_code: str | None = claims.get("referral_code")
    unmatched_code = await referrals.attribute_signup(
        code=referral_code,
        referred_mobile=mobile,
        referred_auth_user_uuid=user.id,
    )

    await _log_event(
        db,
        auth_user_uuid=user.id,
        event_type="register",
        mobile=mobile,
        ip=ip,
        user_agent=user_agent,
        success=True,
        detail={"referral_code_unmatched": unmatched_code} if unmatched_code else None,
    )

    return await _issue_tokens(db, user)


# ---------------------------------------------------------------------------
# Current user (dashboard)
# ---------------------------------------------------------------------------


async def get_me(db: AsyncSession, current_user_id: UUID) -> MeResponse:
    """Return the logged-in user's basic info + one summary per business line."""
    user = await db.get(User, current_user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized.")

    rows = await db.scalars(
        select(ClientProfile)
        .where(ClientProfile.auth_user_uuid == user.id)
        .order_by(ClientProfile.business_line)
    )
    # Client profiles are always created per line ("loans"/"real_estate"); guard
    # against a stray "both" row so the Literal response never 500s.
    profiles = [
        ClientProfileSummary(
            business_line=p.business_line,
            customer_code=p.customer_code,
        )
        for p in rows.all()
        if p.business_line in ("loans", "real_estate")
    ]
    return MeResponse(
        first_name=user.first_name,
        last_name=user.last_name,
        mobile=user.mobile,
        email=user.email,
        email_verified=user.email_verified_at is not None,
        gender=user.gender,
        gender_self_description=user.gender_self_description,
        income_source=user.income_source,
        income_amount_minor=user.income_amount_minor,
        income_period=user.income_period,
        occupation=user.occupation,
        address=user.address,
        profiles=profiles,
    )


async def update_me(
    db: AsyncSession,
    current_user_id: UUID,
    req: MeUpdateRequest,
    ip: str | None = None,
    user_agent: str | None = None,
) -> MeResponse:
    """Update the logged-in user's own identity-wide profile fields.

    Reachable by any authenticated, non-force-reset account; RLS confines every
    caller to their own auth_users row. mobile is immutable (account identity).
    Changing or clearing email resets email_verified_at. Same
    get->mutate->commit pattern as change_password.
    """
    user = await db.get(User, current_user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized.")

    supplied_fields = req.model_fields_set
    email_changed = "email" in supplied_fields and req.email != user.email

    user.first_name = req.first_name
    user.last_name = req.last_name
    if "email" in supplied_fields:
        user.email = req.email
        if email_changed:
            user.email_verified_at = None  # a new or cleared address is unverified

    for field in (
        "gender",
        "gender_self_description",
        "income_source",
        "income_amount_minor",
        "income_period",
        "occupation",
        "address",
    ):
        if field in supplied_fields:
            setattr(user, field, getattr(req, field))
    if (
        "gender" in supplied_fields
        and req.gender != "self_described"
        and "gender_self_description" not in supplied_fields
    ):
        user.gender_self_description = None

    # No pre-check for an email collision: under this caller's RLS context
    # (auth_users_rls restricts a client to their own row) a "SELECT another user
    # with this email" always returns nothing, so a pre-check would be dead code.
    # The auth_users.email UNIQUE constraint is the real backstop; on a clash the
    # commit raises IntegrityError, converted to one generic message that never
    # reveals which field collided.
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That email is already in use.",
        ) from exc

    await _log_event(
        db,
        auth_user_uuid=user.id,
        event_type="profile_updated",
        mobile=user.mobile,
        ip=ip,
        user_agent=user_agent,
        success=True,
        detail={"email_changed": email_changed},
    )
    return await get_me(db, user.id)


# ---------------------------------------------------------------------------
# Login (Auth Design §6.4)
# ---------------------------------------------------------------------------


async def login(
    db: AsyncSession,
    cache: RedisCache,
    req: LoginRequest,
    ip: str | None = None,
    user_agent: str | None = None,
) -> tuple[AuthTokensResponse, str]:
    await check_login_lock(cache, req.mobile)
    # Per-IP failed-login backstop against credential spraying across mobiles.
    await check_login_rate_ip(cache, ip)
    user = await db.scalar(select(User).where(User.mobile == req.mobile))
    if not user or not user.password_hash:
        # Unknown mobile still counts against the source IP: credential
        # spraying exercises exactly this path, one number after another.
        await record_login_failure_ip(cache, ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_GENERIC_LOGIN_ERROR,
        )

    if not await verify_password(req.password, user.password_hash):
        await record_login_failure(cache, req.mobile)
        await record_login_failure_ip(cache, ip)
        await _log_event(
            db,
            auth_user_uuid=user.id,
            event_type="login_fail",
            mobile=req.mobile,
            ip=ip,
            user_agent=user_agent,
            success=False,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_GENERIC_LOGIN_ERROR,
        )

    if user.status == UserStatus.SOFT_DELETED or user.status == UserStatus.SUSPENDED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is not active.",
        )

    claims: dict | None = None
    if user.status == UserStatus.ACTIVE:
        try:
            claims = await _build_access_claims(db, user)
        except NoActiveAccessProfile as exc:
            await _revoke_all_refresh_tokens(db, user.id)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is not active.",
            ) from exc

    await clear_login_failures(cache, req.mobile)

    # Update last_login_at
    user.last_login_at = datetime.now(UTC)
    await db.commit()

    await _log_event(
        db,
        auth_user_uuid=user.id,
        event_type="login",
        mobile=req.mobile,
        ip=ip,
        user_agent=user_agent,
        success=True,
    )

    # A user still owing a forced password reset gets a restricted, short-lived
    # access token (force_reset) and NO refresh token — they cannot obtain a full
    # session until they change the password. Emitting no refresh token (empty
    # string → no cookie set) also closes the old /refresh bypass; refresh
    # additionally rejects non-ACTIVE users as defence in depth.
    if user.status == UserStatus.PENDING_PASSWORD_RESET:
        access_token = create_access_token(
            {
                "sub": str(user.id),
                "role": "client",
                "force_reset": True,
                "session_version": user.session_version,
            }
        )
        return _build_tokens_response(access_token, user), ""

    return await _issue_tokens(db, user, claims)


# ---------------------------------------------------------------------------
# Token refresh (Auth Design §10)
# ---------------------------------------------------------------------------


async def refresh_token(
    db: AsyncSession,
    cache: RedisCache,
    raw_token: str,
) -> tuple[AuthTokensResponse, str]:
    token_hash = hash_refresh_token(raw_token)
    row = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))

    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token.",
        )

    # Revoked token = token reuse — revoke the entire chain so the live token the
    # attacker rotated to can never mint again (security.md: reuse revokes chain).
    if row.revoked:
        await _revoke_all_refresh_tokens(db, row.auth_user_uuid)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token already used. Please log in again.",
        )

    if row.expires_at < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired.",
        )

    # Serialize refresh rotation with identity/session-generation changes.
    # Mobile-number completion locks this same row before incrementing
    # session_version and revoking refresh tokens.  Without the row lock, a
    # concurrent rotation could insert a child after the revocation UPDATE's
    # statement snapshot and leave that child able to mint a post-change
    # access token.
    user = await db.scalar(select(User).where(User.id == row.auth_user_uuid).with_for_update())
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")

    # A suspended/soft-deleted account, or one still owing a forced password
    # reset, must not be able to mint fresh access tokens by rotating refresh
    # tokens. Login already blocks these; the refresh path must too.
    if user.status != UserStatus.ACTIVE:
        await _revoke_all_refresh_tokens(db, user.id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session is no longer valid. Please log in again.",
        )

    try:
        payload = await _build_access_claims(db, user)
    except NoActiveAccessProfile as exc:
        await _revoke_all_refresh_tokens(db, user.id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session is no longer valid. Please log in again.",
        ) from exc

    # Rotate: revoke old, issue new
    new_raw, new_hash = create_refresh_token()
    now = datetime.now(UTC)
    new_row = RefreshToken(
        auth_user_uuid=user.id,
        token_hash=new_hash,
        issued_at=now,
        expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(new_row)
    await db.flush()

    # Atomic claim: only the request that actually flips revoked False->True
    # wins the rotation. Under READ COMMITTED, two concurrent presentations
    # of the same cookie both pass the revoked check above; without this
    # conditional UPDATE both would mint children and the reuse would go
    # undetected (the second UPDATE waits on the first's row lock, re-reads
    # revoked=true, matches zero rows).
    user_uuid = user.id
    claimed = (
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.id == row.id, RefreshToken.revoked.is_(False))
            .values(revoked=True, replaced_by=new_row.id)
            .returning(RefreshToken.id)
        )
    ).scalar_one_or_none()
    if claimed is None:
        # Lost the race = this token was concurrently spent: treat as reuse.
        # Roll back our un-committed child token, then kill the whole chain.
        await db.rollback()
        await _revoke_all_refresh_tokens(db, user_uuid)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token already used. Please log in again.",
        )
    await db.commit()

    access_token = create_access_token(payload)
    return _build_tokens_response(access_token, user), new_raw


# ---------------------------------------------------------------------------
# Logout (Auth Design §10)
# ---------------------------------------------------------------------------


async def logout(
    db: AsyncSession,
    cache: RedisCache,
    jti: str,
    auth_user_uuid: UUID,
    access_token_exp: int,
) -> None:
    now_ts = int(datetime.now(UTC).timestamp())
    ttl = max(access_token_exp - now_ts, 1)
    await cache.set(jwt_blacklist_key(jti), 1, ttl)

    # Revoke by user id, not by the presented cookie: the refresh cookie is scoped
    # to /refresh and is never sent to /logout, so a hash lookup would revoke
    # nothing and leave the 30-day refresh token live. Kill all of the user's
    # refresh tokens so logout actually ends the session.
    await _revoke_all_refresh_tokens(db, auth_user_uuid)


# ---------------------------------------------------------------------------
# Forgot password (Auth Design §6.5)
# ---------------------------------------------------------------------------


async def _deliver_reset_otp_and_log(
    *,
    mobile: str,
    otp: str,
    auth_user_uuid: UUID,
    ip: str | None,
    user_agent: str | None,
) -> None:
    """Deliver after the neutral response so provider latency cannot enumerate accounts."""
    from app.db.session import AsyncSessionLocal

    channel = await deliver_otp(mobile, "", otp, allow_email_fallback=False)
    async with AsyncSessionLocal() as event_db:
        await _log_event(
            event_db,
            auth_user_uuid=auth_user_uuid,
            event_type="otp_sent",
            mobile=mobile,
            ip=ip,
            user_agent=user_agent,
            success=True,
            detail={"purpose": "reset", "channel": channel},
        )


async def forgot_initiate(
    db: AsyncSession,
    cache: RedisCache,
    mobile: str,
    background_tasks: BackgroundTasks,
    ip: str | None = None,
    user_agent: str | None = None,
) -> ForgotInitiateResponse:
    # Per-IP cap first (uniform for known/unknown mobile → enumeration-safe).
    await check_otp_rate_ip(cache, ip)
    user = await db.scalar(select(User).where(User.mobile == mobile))
    # Create the same short-lived, rate-limited challenge for known and unknown
    # mobiles. This keeps rate-limit and verification behavior uniform; an
    # unknown-mobile challenge can never reach password mutation because the
    # reset step resolves the account again.
    otp = await generate_and_store_otp(cache, mobile, "reset")
    if not user or user.status not in (UserStatus.ACTIVE, UserStatus.PENDING_PASSWORD_RESET):
        # Don't reveal whether mobile exists
        return ForgotInitiateResponse(
            message="If this number is registered, an OTP has been sent.",
            delivery_channel="none",
            otp_hint=otp if _is_mock_env() else None,
        )

    # Password reset still proves control of the registered mobile. Deliver
    # after returning the neutral response so provider latency does not reveal
    # whether the account exists.
    background_tasks.add_task(
        _deliver_reset_otp_and_log,
        mobile=mobile,
        otp=otp,
        auth_user_uuid=user.id,
        ip=ip,
        user_agent=user_agent,
    )
    return ForgotInitiateResponse(
        message="If this number is registered, an OTP has been sent.",
        delivery_channel="none",
        otp_hint=otp if _is_mock_env() else None,
    )


async def forgot_verify(
    db: AsyncSession,
    cache: RedisCache,
    req: ForgotVerifyRequest,
) -> ResetTokenResponse:
    try:
        await verify_otp(cache, req.mobile, "reset", req.otp)
    except HTTPException as exc:
        if exc.status_code != status.HTTP_400_BAD_REQUEST:
            raise
        # Do not disclose whether a reset session exists, has expired, or has
        # remaining attempts for the supplied mobile number.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code.",
        ) from exc
    reset_token = create_access_token({"purpose": "reset", "mobile": req.mobile})
    return ResetTokenResponse(reset_token=reset_token)


async def forgot_reset(
    db: AsyncSession,
    cache: RedisCache,
    req: ResetPasswordRequest,
    ip: str | None = None,
    user_agent: str | None = None,
) -> None:
    try:
        claims = decode_access_token(req.reset_token)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token.",
        ) from exc

    if claims.get("purpose") != "reset":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset token.")

    jti: str = claims.get("jti", "")
    mobile = claims.get("mobile")
    if not isinstance(mobile, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token.",
        )
    try:
        validate_password_policy(req.new_password, mobile)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    # Serialize with Admin suspension/reactivation and refresh rotation. The
    # status is re-checked while holding the same user-row lock those flows
    # use, so a concurrent reset cannot undo a suspension.
    user = await db.scalar(select(User).where(User.mobile == mobile).with_for_update())
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token.",
        )

    if jti:
        import math

        exp = claims.get("exp", 0)
        ttl = max(1, math.ceil(exp - datetime.now(UTC).timestamp()))
        # Atomic single-use claim (SET NX) directly before the mutation: the
        # old EXISTS check up top plus a plain SET down here let two
        # concurrent submissions of the same reset token both pass the check
        # and both rotate the password. Claiming here (after the user lookup)
        # also means a failed lookup never burns an unused token.
        if not await cache.set_nx(jwt_blacklist_key(jti), 1, ttl):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reset token already used.",
            )

    if user.status not in (UserStatus.ACTIVE, UserStatus.PENDING_PASSWORD_RESET):
        # Keep account state enumeration-safe. The single-use token is already
        # burned above so it cannot become usable after a later reactivation.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token.",
        )

    user.password_hash = await hash_password(req.new_password)
    if user.status == UserStatus.PENDING_PASSWORD_RESET:
        user.status = UserStatus.ACTIVE
    user.session_version += 1
    # Evict any pre-existing session (e.g. an attacker's) atomically with the
    # password rotation — one transaction, so a revoke failure can't leave the new
    # password committed while old sessions stay live.
    await _revoke_all_refresh_tokens(db, user.id, commit=False)
    await db.commit()
    await _log_event(
        db,
        auth_user_uuid=user.id,
        event_type="password_reset",
        mobile=mobile,
        ip=ip,
        user_agent=user_agent,
        success=True,
    )


# ---------------------------------------------------------------------------
# Change password (forced reset on first login)
# ---------------------------------------------------------------------------


async def change_password(
    db: AsyncSession,
    req: ChangePasswordRequest,
    current_user_id: UUID,
    ip: str | None = None,
    user_agent: str | None = None,
) -> None:
    # get_current_user already loaded this identity in the same session. Force
    # a row-locked refresh so a suspension committed between dependency
    # resolution and this mutation is observed rather than overwritten.
    user = await db.scalar(
        select(User)
        .where(User.id == current_user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if not user or not user.password_hash:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized.")
    if user.status not in (UserStatus.ACTIVE, UserStatus.PENDING_PASSWORD_RESET):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized.")

    if not await verify_password(req.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect.",
        )

    try:
        validate_password_policy(req.new_password, user.mobile)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    user.password_hash = await hash_password(req.new_password)
    if user.status == UserStatus.PENDING_PASSWORD_RESET:
        user.status = UserStatus.ACTIVE
    user.session_version += 1
    # Password rotated → drop any other live sessions atomically with the write.
    await _revoke_all_refresh_tokens(db, user.id, commit=False)
    await db.commit()
    await _log_event(
        db,
        auth_user_uuid=user.id,
        event_type="password_changed",
        mobile=user.mobile,
        ip=ip,
        user_agent=user_agent,
        success=True,
    )


# ---------------------------------------------------------------------------
# Account deletion (SRS 5.1, FR-17.3) — self-service
# ---------------------------------------------------------------------------


async def delete_own_account(
    db: AsyncSession,
    cache: RedisCache,
    req: AccountDeleteRequest,
    current_user_id: UUID,
    jti: str,
    access_token_exp: int,
    ip: str | None = None,
    user_agent: str | None = None,
    actor_role: str | None = None,
) -> None:
    """Verify the caller's current password, then run the shared deletion flow.

    Password re-entry is this product's existing bar for a security-sensitive
    action taken from within a live session (see change_password) — the SRS
    only mandates a warning/confirmation step, not a new OTP purpose.
    """
    user = await db.get(User, current_user_id)
    if not user or not user.password_hash:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized.")

    if not await verify_password(req.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect.",
        )

    await account_deletion.delete_account(
        db,
        cache,
        target_auth_user_uuid=current_user_id,
        actor_auth_user_uuid=current_user_id,
        actor_jti=jti,
        actor_access_token_exp=access_token_exp,
        reason=None,
        ip=ip,
        user_agent=user_agent,
        actor_role=actor_role,
    )


# ---------------------------------------------------------------------------
# OTP resend (proxy)
# ---------------------------------------------------------------------------


async def _resolve_resend_email(
    db: AsyncSession,
    mobile: str,
    purpose: str,
) -> str | None:
    """Return the verified reset email allowed for an explicit email resend."""
    if purpose == "register":
        return None
    user = await db.scalar(select(User).where(User.mobile == mobile))
    if user is None or user.email_verified_at is None:
        return None
    return user.email


async def resend_otp_service(
    db: AsyncSession,
    cache: RedisCache,
    mobile: str,
    purpose: str,
    background_tasks: BackgroundTasks,
    ip: str | None = None,
    via_email: bool = False,
) -> ResendOtpResponse:
    # Per-IP cap — resend is an initiate path (places a call / sends email).
    await check_otp_rate_ip(cache, ip)
    try:
        await ensure_active_otp_session(cache, mobile, purpose)
    except HTTPException:
        if purpose == "reset":
            # A reset session only exists for a registered mobile. Keep the
            # result indistinguishable while doing no delivery work.
            return ResendOtpResponse(message="Code resent.", delivery_channel="none")
        raise
    if purpose == "reset":
        reset_user = await db.scalar(select(User.id).where(User.mobile == mobile))
        if reset_user is None:
            return ResendOtpResponse(message="Code resent.", delivery_channel="none")
    if via_email:
        email = await _resolve_resend_email(db, mobile, purpose)
        if email is None:
            # Keep the current voice OTP valid. A neutral response avoids
            # revealing whether the account has a verified email and avoids
            # replacing a usable code with one delivered nowhere.
            return ResendOtpResponse(message="Code resent.", delivery_channel="none")
        otp = await resend_otp(cache, mobile, purpose)
        background_tasks.add_task(deliver_otp, mobile, email, otp, via_email=True)
        # This endpoint is public. Returning the actual channel would disclose
        # that the supplied mobile belongs to an account with a verified email.
        # The UI already presents a neutral acknowledgement, so keep the wire
        # response neutral as well and never expose an email-resend OTP hint.
        return ResendOtpResponse(message="Code resent.", delivery_channel="none")
    else:
        otp = await resend_otp(cache, mobile, purpose)
        if purpose == "reset":
            background_tasks.add_task(
                deliver_otp,
                mobile,
                "",
                otp,
                allow_email_fallback=False,
            )
            return ResendOtpResponse(
                message="Code resent.",
                delivery_channel="none",
                otp_hint=otp if _is_mock_env() else None,
            )
        channel = await deliver_otp(mobile, "", otp, allow_email_fallback=False)
    return ResendOtpResponse(
        message="Code resent.",
        delivery_channel=channel,
        otp_hint=otp if (channel == "none" and _is_mock_env()) else None,
    )


# ---------------------------------------------------------------------------
# Email verification — post-login soft 2FA (Auth Design §6.7)
# ---------------------------------------------------------------------------


async def email_verify_initiate(
    db: AsyncSession,
    cache: RedisCache,
    user: User,
    ip: str | None = None,
    user_agent: str | None = None,
) -> EmailVerifyInitiateResponse:
    """Send an OTP to the logged-in user's email to verify it (deferred 2FA)."""
    if not user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add an email address before requesting verification.",
        )
    if user.email_verified_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already verified.",
        )
    otp = await generate_and_store_otp(cache, user.mobile, "email_verify")
    await cache.set(
        otp_email_verify_target_key(user.mobile),
        _email_verification_fingerprint(user.email),
        TTL_OTP,
    )
    channel = await deliver_otp(user.mobile, user.email, otp, via_email=True)
    await _log_event(
        db,
        auth_user_uuid=user.id,
        event_type="otp_sent",
        mobile=user.mobile,
        ip=ip,
        user_agent=user_agent,
        success=True,
        detail={"purpose": "email_verify", "channel": channel},
    )
    return EmailVerifyInitiateResponse(
        message="Verification code sent to your email.",
        delivery_channel=channel,
        otp_hint=otp if (channel == "none" and _is_mock_env()) else None,
    )


async def email_verify_confirm(
    db: AsyncSession,
    cache: RedisCache,
    user: User,
    otp: str,
    ip: str | None = None,
    user_agent: str | None = None,
) -> None:
    """Confirm the email OTP and stamp email_verified_at."""
    # Lock and refresh the identity row so a concurrent profile edit cannot
    # swap the address between the fingerprint check and verification stamp.
    db_user = await db.scalar(
        select(User)
        .where(User.id == user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if db_user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized.")
    target_key = otp_email_verify_target_key(user.mobile)
    expected_target = await cache.get(target_key)
    current_target = (
        _email_verification_fingerprint(db_user.email) if db_user.email is not None else None
    )
    if (
        expected_target is None
        or current_target is None
        or not hmac.compare_digest(expected_target, current_target)
    ):
        await cache.delete(
            otp_email_verify_key(user.mobile),
            f"{otp_email_verify_key(user.mobile)}:attempts",
            target_key,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email changed. Request a new verification code.",
        )

    await verify_otp(cache, user.mobile, "email_verify", otp)
    await cache.delete(target_key)
    db_user.email_verified_at = datetime.now(UTC)
    await db.commit()
    await _log_event(
        db,
        auth_user_uuid=user.id,
        event_type="email_verified",
        mobile=user.mobile,
        ip=ip,
        user_agent=user_agent,
        success=True,
    )
