"""FastAPI dependency providers — DB session, Redis, and authenticated user."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from uuid import UUID

import redis.asyncio as aioredis
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.redis_keys import RedisCache, jwt_blacklist_key
from app.core.security import decode_access_token
from app.db.session import get_db

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


@dataclass
class CurrentUser:
    id: UUID
    role: str
    mobile: str
    jti: str
    exp: int
    business_line: str | None = None
    client_profile_uuid: UUID | None = None
    agent_profile_uuid: UUID | None = None
    staff_profile_uuid: UUID | None = None
    platform_scope: str | None = None
    force_reset: bool = field(default=False)


async def get_redis(request: Request) -> aioredis.Redis:
    return request.app.state.redis


async def get_cache(request: Request) -> RedisCache:
    return RedisCache(request.app.state.redis)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
    redis_client: aioredis.Redis = Depends(get_redis),
) -> CurrentUser:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        claims = decode_access_token(token)
    except JWTError as exc:
        raise credentials_error from exc

    jti: str | None = claims.get("jti")
    if not jti:
        raise credentials_error

    # JWT blacklist check
    cache = RedisCache(redis_client)
    if await cache.exists(jwt_blacklist_key(jti)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id_str: str | None = claims.get("sub")
    if not user_id_str:
        raise credentials_error

    try:
        user_id = UUID(user_id_str)
    except ValueError as exc:
        raise credentials_error from exc

    role: str = claims.get("role", "client")
    business_line: str | None = claims.get("business_line")

    # Set Postgres RLS session context (Auth Design §13, 7 variables)
    await _set_rls_context(
        db=db,
        user_uuid=str(user_id),
        role=role,
        business_line=business_line or "",
        client_profile_uuid=claims.get("client_profile_uuid", ""),
        agent_profile_uuid=claims.get("agent_profile_uuid", ""),
        staff_profile_uuid=claims.get("staff_profile_uuid", ""),
        platform_scope=claims.get("platform_scope", "line"),
    )

    # Fetch mobile from DB (needed for change-password policy check)

    from app.models.user import User  # local import to avoid circular

    user = await db.get(User, user_id)
    if not user:
        raise credentials_error

    return CurrentUser(
        id=user_id,
        role=role,
        mobile=user.mobile,
        jti=jti,
        exp=claims.get("exp", 0),
        business_line=business_line,
        client_profile_uuid=_parse_uuid(claims.get("client_profile_uuid")),
        agent_profile_uuid=_parse_uuid(claims.get("agent_profile_uuid")),
        staff_profile_uuid=_parse_uuid(claims.get("staff_profile_uuid")),
        platform_scope=claims.get("platform_scope"),
        force_reset=claims.get("force_reset", False),
    )


async def _set_rls_context(
    db: AsyncSession,
    *,
    user_uuid: str,
    role: str,
    business_line: str,
    client_profile_uuid: str,
    agent_profile_uuid: str,
    staff_profile_uuid: str,
    platform_scope: str,
) -> None:
    """Drop from superuser to api_user and set 7-variable Postgres session context.

    The API connects as 'app' (superuser) which bypasses RLS unconditionally.
    SET LOCAL ROLE api_user switches to a non-superuser role for this transaction
    so that RLS policies on auth/profile tables are enforced.  The role reverts
    automatically when the transaction ends (pgBouncer transaction mode safe).
    """
    await db.execute(text("SET LOCAL ROLE api_user"))
    await db.execute(
        text(
            "SELECT "
            "set_config('app.auth_user_uuid', :user_uuid, true), "
            "set_config('app.role', :role, true), "
            "set_config('app.business_line', :business_line, true), "
            "set_config('app.client_profile_uuid', :client_profile_uuid, true), "
            "set_config('app.agent_profile_uuid', :agent_profile_uuid, true), "
            "set_config('app.staff_profile_uuid', :staff_profile_uuid, true), "
            "set_config('app.platform_scope', :platform_scope, true)"
        ),
        {
            "user_uuid": user_uuid,
            "role": role,
            "business_line": business_line,
            "client_profile_uuid": client_profile_uuid,
            "agent_profile_uuid": agent_profile_uuid,
            "staff_profile_uuid": staff_profile_uuid,
            "platform_scope": platform_scope,
        },
    )


def _parse_uuid(val: str | None) -> UUID | None:
    if not val:
        return None
    try:
        return UUID(val)
    except ValueError:
        return None
