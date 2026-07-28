"""Auth router (Auth Design §9)."""

from __future__ import annotations

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Cookie,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis_keys import RedisCache
from app.core.client_ip import get_client_ip
from app.core.deps import CurrentUser, get_active_user, get_cache, get_current_user
from app.db.session import get_db
from app.schemas.auth import (
    AccountDeleteRequest,
    AuthTokensResponse,
    ChangePasswordRequest,
    EmailVerifyConfirmRequest,
    EmailVerifyInitiateResponse,
    ForgotInitiateRequest,
    ForgotInitiateResponse,
    ForgotVerifyRequest,
    LoginRequest,
    MeResponse,
    MessageResponse,
    MeUpdateRequest,
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
from app.services.account_deletion import AccountAlreadyDeleted

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


# Shared with the public leads route; see core/client_ip.py for the proxy rules.
_get_client_ip = get_client_ip


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
    # A force-reset login returns no refresh token (empty string) — do not set a
    # session cookie for an account that still owes a password reset.
    if raw_refresh:
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
) -> MessageResponse:
    await auth_service.logout(
        db,
        cache,
        jti=current_user.jti,
        auth_user_uuid=current_user.id,
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


@router.delete(
    "/me",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
)
async def delete_me(
    req: AccountDeleteRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    cache: RedisCache = Depends(get_cache),
    current_user: CurrentUser = Depends(get_active_user),
) -> MessageResponse:
    try:
        await auth_service.delete_own_account(
            db,
            cache,
            req,
            current_user_id=current_user.id,
            jti=current_user.jti,
            access_token_exp=current_user.exp,
            ip=_get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
            actor_role=current_user.role,
        )
    except AccountAlreadyDeleted as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account has already been deleted.",
        ) from exc
    _clear_refresh_cookie(response)
    return MessageResponse(message="Your account has been deleted.")


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
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    cache: RedisCache = Depends(get_cache),
) -> ForgotInitiateResponse:
    return await auth_service.forgot_initiate(
        db,
        cache,
        req.mobile,
        background_tasks,
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


@router.get("/me", response_model=MeResponse, status_code=status.HTTP_200_OK)
async def me(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_active_user),
) -> MeResponse:
    return await auth_service.get_me(db, current_user.id)


@router.patch("/me", response_model=MeResponse, status_code=status.HTTP_200_OK)
async def update_me(
    req: MeUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_active_user),
) -> MeResponse:
    return await auth_service.update_me(
        db,
        current_user.id,
        req,
        ip=_get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )


@router.post(
    "/email/verify/initiate",
    response_model=EmailVerifyInitiateResponse,
    status_code=status.HTTP_200_OK,
)
async def email_verify_initiate(
    request: Request,
    db: AsyncSession = Depends(get_db),
    cache: RedisCache = Depends(get_cache),
    current_user: CurrentUser = Depends(get_active_user),
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
    current_user: CurrentUser = Depends(get_active_user),
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
