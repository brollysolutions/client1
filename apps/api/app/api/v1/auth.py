"""Auth router — 11 endpoints (Auth Design §9)."""

from __future__ import annotations

from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis_keys import RedisCache
from app.core.deps import CurrentUser, get_cache, get_current_user
from app.core.security import hash_refresh_token
from app.db.session import get_db
from app.schemas.auth import (
    AuthTokensResponse,
    ChangePasswordRequest,
    EmailVerifyConfirmRequest,
    EmailVerifyInitiateResponse,
    ForgotInitiateRequest,
    ForgotInitiateResponse,
    ForgotVerifyRequest,
    LoginRequest,
    MessageResponse,
    RegisterInitiateRequest,
    RegisterInitiateResponse,
    RegisterVerifyOtpRequest,
    RegistrationTokenResponse,
    ResendOtpRequest,
    ResendOtpResponse,
    ResetPasswordRequest,
    ResetTokenResponse,
    SetPasswordRequest,
)
from app.services import auth_service

router = APIRouter()

# Cookie path must match the mounted endpoint path (router prefix is /api/v1/auth),
# otherwise the browser/client never sends the refresh cookie back to /refresh.
_REFRESH_PATH = "/api/v1/auth/refresh"
_REFRESH_COOKIE = "refresh_token"
_COOKIE_KWARGS = {
    "httponly": True,
    "secure": True,
    "samesite": "strict",
    "path": _REFRESH_PATH,
}


def _set_refresh_cookie(response: Response, raw_token: str, max_age: int) -> None:
    response.set_cookie(
        _REFRESH_COOKIE,
        raw_token,
        max_age=max_age,
        **_COOKIE_KWARGS,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(_REFRESH_COOKIE, path=_REFRESH_PATH)


def _get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


@router.post(
    "/register/initiate",
    response_model=RegisterInitiateResponse,
    status_code=status.HTTP_200_OK,
)
async def register_initiate(
    req: RegisterInitiateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    cache: RedisCache = Depends(get_cache),
) -> RegisterInitiateResponse:
    return await auth_service.register_initiate(
        db,
        cache,
        req,
        ip=_get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )


@router.post(
    "/register/verify-otp",
    response_model=RegistrationTokenResponse,
    status_code=status.HTTP_200_OK,
)
async def register_verify_otp(
    req: RegisterVerifyOtpRequest,
    db: AsyncSession = Depends(get_db),
    cache: RedisCache = Depends(get_cache),
) -> RegistrationTokenResponse:
    return await auth_service.register_verify_otp(db, cache, req)


@router.post(
    "/register/set-password",
    response_model=AuthTokensResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_set_password(
    req: SetPasswordRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    cache: RedisCache = Depends(get_cache),
) -> AuthTokensResponse:
    from app.core.config import settings

    tokens, raw_refresh = await auth_service.register_set_password(
        db,
        cache,
        req,
        ip=_get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    _set_refresh_cookie(
        response,
        raw_refresh,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )
    return tokens


# ---------------------------------------------------------------------------
# Login & session
# ---------------------------------------------------------------------------


@router.post(
    "/login",
    response_model=AuthTokensResponse,
    status_code=status.HTTP_200_OK,
)
async def login(
    req: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    cache: RedisCache = Depends(get_cache),
) -> AuthTokensResponse:
    from app.core.config import settings

    tokens, raw_refresh = await auth_service.login(
        db,
        cache,
        req,
        ip=_get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    _set_refresh_cookie(
        response,
        raw_refresh,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )
    return tokens


@router.post(
    "/refresh",
    response_model=AuthTokensResponse,
    status_code=status.HTTP_200_OK,
)
async def refresh_token(
    response: Response,
    db: AsyncSession = Depends(get_db),
    cache: RedisCache = Depends(get_cache),
    raw_token: str | None = Cookie(default=None, alias=_REFRESH_COOKIE),
) -> AuthTokensResponse:
    from app.core.config import settings

    if not raw_token:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing.",
        )
    tokens, new_raw = await auth_service.refresh_token(db, cache, raw_token)
    _set_refresh_cookie(
        response,
        new_raw,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )
    return tokens


@router.post(
    "/logout",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
)
async def logout(
    response: Response,
    db: AsyncSession = Depends(get_db),
    cache: RedisCache = Depends(get_cache),
    current_user: CurrentUser = Depends(get_current_user),
    raw_token: str | None = Cookie(default=None, alias=_REFRESH_COOKIE),
) -> MessageResponse:
    refresh_hash = hash_refresh_token(raw_token) if raw_token else ""
    await auth_service.logout(
        db,
        cache,
        jti=current_user.jti,
        refresh_token_hash=refresh_hash,
        access_token_exp=current_user.exp,
    )
    _clear_refresh_cookie(response)
    return MessageResponse(message="Logged out successfully.")


@router.post(
    "/change-password",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
)
async def change_password(
    req: ChangePasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> MessageResponse:
    await auth_service.change_password(
        db,
        req,
        current_user_id=current_user.id,
        ip=_get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    return MessageResponse(message="Password changed successfully.")


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------


@router.post(
    "/forgot/initiate",
    response_model=ForgotInitiateResponse,
    status_code=status.HTTP_200_OK,
)
async def forgot_initiate(
    req: ForgotInitiateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    cache: RedisCache = Depends(get_cache),
) -> ForgotInitiateResponse:
    return await auth_service.forgot_initiate(
        db,
        cache,
        req.mobile,
        ip=_get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )


@router.post(
    "/forgot/verify",
    response_model=ResetTokenResponse,
    status_code=status.HTTP_200_OK,
)
async def forgot_verify(
    req: ForgotVerifyRequest,
    db: AsyncSession = Depends(get_db),
    cache: RedisCache = Depends(get_cache),
) -> ResetTokenResponse:
    return await auth_service.forgot_verify(db, cache, req)


@router.post(
    "/forgot/reset",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
)
async def forgot_reset(
    req: ResetPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    cache: RedisCache = Depends(get_cache),
) -> MessageResponse:
    await auth_service.forgot_reset(
        db,
        cache,
        req,
        ip=_get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    return MessageResponse(message="Password reset successfully.")


# ---------------------------------------------------------------------------
# OTP utility
# ---------------------------------------------------------------------------


@router.post(
    "/otp/resend",
    response_model=ResendOtpResponse,
    status_code=status.HTTP_200_OK,
)
async def resend_otp(
    req: ResendOtpRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    cache: RedisCache = Depends(get_cache),
) -> ResendOtpResponse:
    return await auth_service.resend_otp_service(
        db,
        cache,
        req.mobile,
        req.purpose,
        ip=_get_client_ip(request),
        via_email=req.via_email,
    )


# ---------------------------------------------------------------------------
# Email verification — post-login soft 2FA
# ---------------------------------------------------------------------------


@router.post(
    "/email/verify/initiate",
    response_model=EmailVerifyInitiateResponse,
    status_code=status.HTTP_200_OK,
)
async def email_verify_initiate(
    request: Request,
    db: AsyncSession = Depends(get_db),
    cache: RedisCache = Depends(get_cache),
    current_user: CurrentUser = Depends(get_current_user),
) -> EmailVerifyInitiateResponse:
    from app.models.user import User

    user = await db.get(User, current_user.id)
    if user is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized.")
    return await auth_service.email_verify_initiate(
        db,
        cache,
        user,
        ip=_get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )


@router.post(
    "/email/verify/confirm",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
)
async def email_verify_confirm(
    req: EmailVerifyConfirmRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    cache: RedisCache = Depends(get_cache),
    current_user: CurrentUser = Depends(get_current_user),
) -> MessageResponse:
    from app.models.user import User

    user = await db.get(User, current_user.id)
    if user is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized.")
    await auth_service.email_verify_confirm(
        db,
        cache,
        user,
        req.otp,
        ip=_get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    return MessageResponse(message="Email verified successfully.")
