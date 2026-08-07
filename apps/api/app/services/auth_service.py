"""Auth business logic — registration, login, token management (Auth Design §6)."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import BackgroundTasks, HTTPException, status
from jose import JWTError
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis_keys import TTL_OTP, RedisCache, jwt_blacklist_key, reg_data_key
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
from app.services.leads import capture_lead
from app.services.otp import (
    check_login_lock,
    check_login_rate_ip,
    check_otp_rate_ip,
    clear_login_failures,
    generate_and_store_otp,
    record_login_failure,
    record_login_failure_ip,
    resend_otp,
    verify_otp,
)
from app.services.otp_delivery import deliver_otp

logger = logging.getLogger(__name__)

_GENERIC_LOGIN_ERROR = "Invalid mobile number or password."


def _is_mock_env() -> bool:
    # Fail-closed OTP-hint gate (audit L3). The old check was `ENV != "production"`,
    # which fails OPEN: any misread ENV (staging / "prod" / unset) leaked a live
    # code. Expose the hint only for the exact "development" sentinel — which the
    # SECRET_KEY guard already forbids in real deploys — or an explicit opt-in flag
    # for a controlled non-dev test box. Anything else never returns the code.
    return settings.OTP_EXPOSE_HINT or settings.ENV == "development"


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
) -> tuple[AuthTokensResponse, str]:
    """Issue access + refresh tokens. Returns (response, raw_refresh_token)."""
    payload = await _build_access_claims(db, user)
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
    claims["role"] = "client"
    claims["platform_scope"] = "false"
    if clients:
        lines = {c.business_line for c in clients}
        # A client holding both lines carries "both"; the client policy filters
        # on own auth_user_uuid regardless, so this is only informational. The
        # ORDER BY makes the acting profile uuid deterministic (loans first).
        claims["business_line"] = "both" if len(lines) > 1 else next(iter(lines))
        claims["client_profile_uuid"] = str(clients[0].id)
    else:
        claims["business_line"] = ""
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
    # Per-IP cap first — stop one host iterating numbers before any DB / OTP work.
    await check_otp_rate_ip(cache, ip)
    # Capture the number first, IN-LINE (not deferred): the duplicate-email / duplicate-
    # mobile (400) and rate-limit (429) branches below raise HTTPException, and FastAPI
    # never runs a BackgroundTask on a raised response — a deferred capture would be
    # dropped there, losing a genuinely new number that merely reused an existing email.
    # Self-registered clients enroll in both lines; the lead is anchored to loans.
    await capture_lead(
        req.mobile,
        name=f"{req.first_name} {req.last_name}".strip(),
        business_line="loans",
    )

    # Enumeration-safe: one neutral message for either a duplicate mobile OR a
    # duplicate email. Distinct "mobile already registered" vs "email already
    # registered" strings turned the public sign-up form into an account-existence
    # oracle that also leaked which field was taken (audit M1). Signup inherently
    # signals that *some* detail exists; we no longer reveal which one.
    existing = await db.scalar(select(User).where(User.mobile == req.mobile))
    email_taken = None if existing else await db.scalar(select(User).where(User.email == req.email))
    if existing or email_taken:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mobile number or email already registered.",
        )

    otp = await generate_and_store_otp(cache, req.mobile, "register")
    await cache.set(
        reg_data_key(req.mobile),
        json.dumps(
            {
                "first_name": req.first_name,
                "last_name": req.last_name,
                "email": req.email,
                "referral_code": req.referral_code,
            }
        ),
        TTL_OTP,
    )
    # Voice call first; email is the same-OTP fallback if the call API hard-errors.
    channel = await deliver_otp(req.mobile, req.email, otp)

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
            "email": reg_data.get("email", ""),
            # A referral code is a public shareable token, not a secret — fine
            # to carry in a signed, short-lived registration token.
            "referral_code": reg_data.get("referral_code"),
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

    email: str = claims.get("email", "")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid registration token.",
        )

    existing = await db.scalar(select(User).where(User.mobile == mobile))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mobile number already registered.",
        )
    email_taken = await db.scalar(select(User).where(User.email == email))
    if email_taken:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered.",
        )

    # Every self-registered client is enrolled in both business lines: one User,
    # two ClientProfiles (each with its own customer_code). See
    # docs/specs/dual-line-clients.md.
    lines: list[str] = ["loans", "real_estate"]

    user = User(
        first_name=claims.get("first_name", ""),
        last_name=claims.get("last_name", ""),
        mobile=mobile,
        email=email,
        password_hash=await hash_password(req.password),
        status=UserStatus.ACTIVE,
        phone_verified_at=datetime.now(UTC),  # mobile proven by the registration OTP
        # email_verified_at stays NULL — verified later via the post-login banner flow.
    )
    db.add(user)
    try:
        await db.flush()  # get user.id before creating profiles
    except IntegrityError as exc:  # mobile/email UNIQUE race between check and insert
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mobile number or email already registered.",
        ) from exc

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

    # Issue this new client's own referral code inside the same transaction as
    # the profile rows, same savepoint + retry shape. skip_eligibility=True:
    # a brand-new self-registered client is eligible by construction (no
    # agent/staff profile can possibly exist yet for this auth_user). This
    # unauthenticated endpoint has no auth dependency, so get_current_user's
    # `SET LOCAL ROLE api_user` never runs on `db` — the session still holds
    # the engine's default (superuser) role, same as customer_code above, so
    # it can write the SELECT-only-for-api_user referral_codes table directly.
    await referrals.issue_code_on_session(db, user.id, skip_eligibility=True)

    await db.commit()

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
        profiles=profiles,
    )


async def update_me(
    db: AsyncSession,
    current_user_id: UUID,
    req: MeUpdateRequest,
    ip: str | None = None,
    user_agent: str | None = None,
) -> MeResponse:
    """Update the logged-in user's own name (and optionally email).

    Reachable by any authenticated, non-force-reset account; RLS confines every
    caller to their own auth_users row. mobile is immutable (account identity).
    Changing the email resets email_verified_at so the post-login verify flow runs
    again. Same get->mutate->commit pattern as change_password.
    """
    user = await db.get(User, current_user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized.")

    email_changed = req.email is not None and req.email != user.email

    user.first_name = req.first_name
    user.last_name = req.last_name
    if email_changed:
        user.email = req.email
        user.email_verified_at = None  # re-verify the new address

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
    # Capture every login attempt's number as a lead (unconditional → enumeration-safe).
    # Kept IN-LINE, not deferred to a BackgroundTask: FastAPI runs background tasks only
    # when the endpoint returns a response, and the unknown-mobile / wrong-password paths
    # raise HTTPException — a deferred capture would be silently dropped there, which is
    # exactly the failed-login lead we most want to keep.
    await capture_lead(req.mobile)

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

    return await _issue_tokens(db, user)


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

    payload = await _build_access_claims(db, user)
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
    # Capture unconditionally, but deferred to a background task — the response path
    # stays identical for known vs unknown mobile (enumeration-safe) and no longer
    # pays the lead-write round-trip in-line.
    background_tasks.add_task(capture_lead, mobile)

    user = await db.scalar(select(User).where(User.mobile == mobile))
    if not user:
        # Don't reveal whether mobile exists
        return ForgotInitiateResponse(
            message="If this number is registered, an OTP has been sent.",
            delivery_channel="none",
        )

    otp = await generate_and_store_otp(cache, mobile, "reset")
    channel = await deliver_otp(mobile, user.email, otp)
    await _log_event(
        db,
        auth_user_uuid=user.id,
        event_type="otp_sent",
        mobile=mobile,
        ip=ip,
        user_agent=user_agent,
        success=True,
        detail={"purpose": "reset", "channel": channel},
    )
    return ForgotInitiateResponse(
        message="If this number is registered, an OTP has been sent.",
        delivery_channel=channel,
        otp_hint=otp if (channel == "none" and _is_mock_env()) else None,
    )


async def forgot_verify(
    db: AsyncSession,
    cache: RedisCache,
    req: ForgotVerifyRequest,
) -> ResetTokenResponse:
    await verify_otp(cache, req.mobile, "reset", req.otp)
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
    mobile: str = claims["mobile"]
    try:
        validate_password_policy(req.new_password, mobile)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    user = await db.scalar(select(User).where(User.mobile == mobile))
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User not found.")

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

    user.password_hash = await hash_password(req.new_password)
    user.status = UserStatus.ACTIVE
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
    user = await db.get(User, current_user_id)
    if not user or not user.password_hash:
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
    user.status = UserStatus.ACTIVE
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
    cache: RedisCache,
    mobile: str,
    purpose: str,
) -> str | None:
    """Find the email to use for an email-fallback resend (register=reg_data, reset=user)."""
    if purpose == "register":
        raw = await cache.get(reg_data_key(mobile))
        if raw:
            return json.loads(raw).get("email") or None
        return None
    user = await db.scalar(select(User).where(User.mobile == mobile))
    return user.email if user else None


async def resend_otp_service(
    db: AsyncSession,
    cache: RedisCache,
    mobile: str,
    purpose: str,
    ip: str | None = None,
    via_email: bool = False,
) -> ResendOtpResponse:
    # Per-IP cap — resend is an initiate path (places a call / sends email).
    await check_otp_rate_ip(cache, ip)
    otp = await resend_otp(cache, mobile, purpose)
    email = await _resolve_resend_email(db, cache, mobile, purpose)
    channel = await deliver_otp(mobile, email or "", otp, via_email=via_email and bool(email))
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
    if user.email_verified_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already verified.",
        )
    otp = await generate_and_store_otp(cache, user.mobile, "email_verify")
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
    await verify_otp(cache, user.mobile, "email_verify", otp)
    db_user = await db.get(User, user.id)
    if db_user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized.")
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
