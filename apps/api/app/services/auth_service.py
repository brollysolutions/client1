"""Auth business logic — registration, login, token management (Auth Design §6)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis_keys import RedisCache, jwt_blacklist_key
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
from app.services.otp import (
    check_login_lock,
    clear_login_failures,
    generate_and_store_otp,
    record_login_failure,
    resend_otp,
    verify_otp,
)
from app.services.sms import send_otp_sms

logger = logging.getLogger(__name__)

_GENERIC_LOGIN_ERROR = "Invalid mobile number or password."


def _is_mock_env() -> bool:
    return settings.ENV != "production"


def _build_tokens_response(access_token: str) -> AuthTokensResponse:
    return AuthTokensResponse(
        access_token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
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

    return _build_tokens_response(access_token), raw_refresh


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
    existing = await db.scalar(select(User).where(User.mobile == req.mobile))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mobile number already registered.",
        )

    otp = await generate_and_store_otp(cache, req.mobile, "register")
    sms_sent = await send_otp_sms(req.mobile, otp)

    await _log_event(
        db,
        auth_user_uuid=None,
        event_type="otp_sent",
        mobile=req.mobile,
        ip=ip,
        user_agent=user_agent,
        success=True,
        detail={"purpose": "register"},
    )

    return RegisterInitiateResponse(
        message="OTP sent to your mobile number.",
        sms_sent=sms_sent,
        otp_hint=otp if (not sms_sent and _is_mock_env()) else None,
    )


async def register_verify_otp(
    db: AsyncSession,
    cache: RedisCache,
    req: RegisterVerifyOtpRequest,
) -> RegistrationTokenResponse:
    await verify_otp(cache, req.mobile, "register", req.otp)

    # Issue short-lived registration token (not a full access token)
    reg_token = create_access_token({"purpose": "register", "mobile": req.mobile})
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
    validate_password_policy(req.password, mobile)

    existing = await db.scalar(select(User).where(User.mobile == mobile))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mobile number already registered.",
        )

    # Extract lines from token — stored during initiate
    lines: list[str] = claims.get("lines", ["loans"])

    user = User(
        first_name=claims.get("first_name", ""),
        last_name=claims.get("last_name", ""),
        mobile=mobile,
        password_hash=hash_password(req.password),
        status=UserStatus.ACTIVE,
        phone_verified_at=datetime.now(UTC),
    )
    db.add(user)
    await db.flush()  # get user.id before creating profiles

    for line in lines:
        for _ in range(5):  # retry on UNIQUE collision
            code = generate_profile_code("client", user.first_name, line)
            profile = ClientProfile(
                auth_user_uuid=user.id,
                business_line=line,
                customer_code=code,
                status=ProfileStatus.ACTIVE,
            )
            db.add(profile)
            try:
                await db.flush()
                break
            except Exception:
                await db.rollback()
                raise

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
    return _build_tokens_response(access_token), new_raw


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
    user = await db.scalar(select(User).where(User.mobile == mobile))
    if not user:
        # Don't reveal whether mobile exists
        return ForgotInitiateResponse(
            message="If this number is registered, an OTP has been sent.",
            sms_sent=False,
        )

    otp = await generate_and_store_otp(cache, mobile, "reset")
    sms_sent = await send_otp_sms(mobile, otp)
    await _log_event(
        db,
        auth_user_uuid=user.id,
        event_type="otp_sent",
        mobile=mobile,
        ip=ip,
        user_agent=user_agent,
        success=True,
        detail={"purpose": "reset"},
    )
    return ForgotInitiateResponse(
        message="If this number is registered, an OTP has been sent.",
        sms_sent=sms_sent,
        otp_hint=otp if (not sms_sent and _is_mock_env()) else None,
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

    mobile: str = claims["mobile"]
    validate_password_policy(req.new_password, mobile)

    user = await db.scalar(select(User).where(User.mobile == mobile))
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User not found.")

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

    validate_password_policy(req.new_password, user.mobile)
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


async def resend_otp_service(
    db: AsyncSession,
    cache: RedisCache,
    mobile: str,
    purpose: str,
    ip: str | None = None,
) -> ResendOtpResponse:
    otp = await resend_otp(cache, mobile, purpose)
    sms_sent = await send_otp_sms(mobile, otp)
    return ResendOtpResponse(
        message="OTP resent.",
        sms_sent=sms_sent,
        otp_hint=otp if (not sms_sent and _is_mock_env()) else None,
    )
