"""Auth business logic — registration, login, token management (Auth Design §6)."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status
from jose import JWTError
from sqlalchemy import select
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
from app.models.profile import ClientProfile, ProfileStatus
from app.models.user import User, UserStatus
from app.schemas.auth import (
    AuthTokensResponse,
    ChangePasswordRequest,
    EmailVerifyInitiateResponse,
    ForgotInitiateResponse,
    ForgotVerifyRequest,
    LoginRequest,
    RegisterInitiateRequest,
    RegisterInitiateResponse,
    RegisterVerifyOtpRequest,
    RegistrationTokenResponse,
    ResendOtpResponse,
    ResetPasswordRequest,
    ResetTokenResponse,
    SetPasswordRequest,
)
from app.services.leads import capture_lead
from app.services.otp import (
    check_login_lock,
    clear_login_failures,
    generate_and_store_otp,
    record_login_failure,
    resend_otp,
    verify_otp,
)
from app.services.otp_delivery import deliver_otp

logger = logging.getLogger(__name__)

_GENERIC_LOGIN_ERROR = "Invalid mobile number or password."


def _is_mock_env() -> bool:
    return settings.ENV != "production"


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
    # Build JWT payload
    payload = {
        "sub": str(user.id),
        "role": _resolve_primary_role(user),
    }
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


def _resolve_primary_role(user: User) -> str:
    """Placeholder: role resolution will use profile tables once fully wired."""
    return "client"


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
    # Capture the number first — durable lead even if registration is abandoned.
    await capture_lead(
        req.mobile,
        name=f"{req.first_name} {req.last_name}".strip(),
        business_line=req.lines[0] if req.lines else None,
    )

    existing = await db.scalar(select(User).where(User.mobile == req.mobile))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mobile number already registered.",
        )
    email_taken = await db.scalar(select(User).where(User.email == req.email))
    if email_taken:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered.",
        )

    otp = await generate_and_store_otp(cache, req.mobile, "register")
    await cache.set(
        reg_data_key(req.mobile),
        json.dumps(
            {
                "first_name": req.first_name,
                "last_name": req.last_name,
                "email": req.email,
                "lines": req.lines,
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
        message="Verification code sent. Answer the call or check your email.",
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
            "lines": reg_data.get("lines", ["loans"]),
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

    # Extract lines from token — stored during initiate
    lines: list[str] = claims.get("lines", ["loans"])

    user = User(
        first_name=claims.get("first_name", ""),
        last_name=claims.get("last_name", ""),
        mobile=mobile,
        email=email,
        password_hash=hash_password(req.password),
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

    await db.commit()
    await _log_event(
        db,
        auth_user_uuid=user.id,
        event_type="register",
        mobile=mobile,
        ip=ip,
        user_agent=user_agent,
        success=True,
    )

    return await _issue_tokens(db, user)


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
    # Capture every login attempt's number as a lead (unconditional → enumeration-safe).
    await capture_lead(req.mobile)

    user = await db.scalar(select(User).where(User.mobile == req.mobile))
    if not user or not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_GENERIC_LOGIN_ERROR,
        )

    if not verify_password(req.password, user.password_hash):
        await record_login_failure(cache, req.mobile)
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

    response, raw_refresh = await _issue_tokens(db, user)

    # Flag forced password reset
    if user.status == UserStatus.PENDING_PASSWORD_RESET:
        response.access_token = create_access_token(
            {"sub": str(user.id), "role": "client", "force_reset": True}
        )

    return response, raw_refresh


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

    # Revoked token = possible token reuse — revoke chain
    if row.revoked:
        await db.execute(
            select(RefreshToken).where(RefreshToken.auth_user_uuid == row.auth_user_uuid)
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token already used. Please log in again.",
        )

    if row.expires_at < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired.",
        )

    user = await db.get(User, row.auth_user_uuid)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")

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

    row.revoked = True
    row.replaced_by = new_row.id
    await db.commit()

    payload = {"sub": str(user.id), "role": _resolve_primary_role(user)}
    access_token = create_access_token(payload)
    return _build_tokens_response(access_token, user), new_raw


# ---------------------------------------------------------------------------
# Logout (Auth Design §10)
# ---------------------------------------------------------------------------


async def logout(
    db: AsyncSession,
    cache: RedisCache,
    jti: str,
    refresh_token_hash: str,
    access_token_exp: int,
) -> None:
    now_ts = int(datetime.now(UTC).timestamp())
    ttl = max(access_token_exp - now_ts, 1)
    await cache.set(jwt_blacklist_key(jti), 1, ttl)

    row = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == refresh_token_hash))
    if row and not row.revoked:
        row.revoked = True
        await db.commit()


# ---------------------------------------------------------------------------
# Forgot password (Auth Design §6.5)
# ---------------------------------------------------------------------------


async def forgot_initiate(
    db: AsyncSession,
    cache: RedisCache,
    mobile: str,
    ip: str | None = None,
    user_agent: str | None = None,
) -> ForgotInitiateResponse:
    # Capture first (unconditional → identical timing/branch for known vs unknown).
    await capture_lead(mobile)

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
    if jti and await cache.exists(jwt_blacklist_key(jti)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token already used.",
        )

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
        from datetime import UTC, datetime

        exp = claims.get("exp", 0)
        ttl = max(1, math.ceil(exp - datetime.now(UTC).timestamp()))
        await cache.set(jwt_blacklist_key(jti), 1, ttl)

    user.password_hash = hash_password(req.new_password)
    user.status = UserStatus.ACTIVE
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

    if not verify_password(req.current_password, user.password_hash):
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
    user.password_hash = hash_password(req.new_password)
    user.status = UserStatus.ACTIVE
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
