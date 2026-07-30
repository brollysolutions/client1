"""FastAPI dependency providers — DB session, Redis, and authenticated user."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from uuid import UUID

import redis.asyncio as aioredis
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session as SyncSession

from app.cache.redis_keys import RedisCache, jwt_blacklist_key
from app.core.security import decode_access_token
from app.db.session import get_db

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# The RLS session context (SET LOCAL ROLE + set_config(..., is_local=true)) is
# TRANSACTION-scoped. Services own their COMMIT, so a query issued after a commit
# begins a fresh transaction that would otherwise run as the `app` superuser with
# RLS disabled (fail-open). We stash the context on session.info and re-install it
# on every transaction via the after_begin listener below. LOCAL (not session)
# settings are required for pgBouncer transaction-pooling safety.
_RLS_CONTEXT_KEY = "rls_context"

_SET_ROLE_SQL = text("SET LOCAL ROLE api_user")
_SET_RLS_CONFIG_SQL = text(
    "SELECT "
    "set_config('app.auth_user_uuid', :user_uuid, true), "
    "set_config('app.role', :role, true), "
    "set_config('app.business_line', :business_line, true), "
    "set_config('app.client_profile_uuid', :client_profile_uuid, true), "
    "set_config('app.agent_profile_uuid', :agent_profile_uuid, true), "
    "set_config('app.staff_profile_uuid', :staff_profile_uuid, true), "
    "set_config('app.platform_scope', :platform_scope, true)"
)


@event.listens_for(SyncSession, "after_begin")
def _reinstall_rls_context(session: SyncSession, transaction, connection) -> None:
    """Re-apply the RLS context at the start of every transaction on a context-
    bearing session (no-op for sessions that never set one, e.g. the leads
    superuser-bypass session and test sessions). This closes the post-commit
    fail-open window: the implicit transaction after a service commit is dropped
    back to api_user with the same GUCs instead of the app superuser."""
    ctx = session.info.get(_RLS_CONTEXT_KEY)
    if ctx is None:
        return
    connection.execute(_SET_ROLE_SQL)
    connection.execute(_SET_RLS_CONFIG_SQL, ctx)


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
    """Authenticate the bearer token and install the RLS context.

    WARNING: this accepts a `force_reset` session (a user who still owes a forced
    password reset). Use it ONLY for the change-password and logout endpoints. For
    every other authenticated surface — /me, email-verify, and all future business
    endpoints — depend on `get_active_user`, which rejects force_reset so the reset
    cannot be skipped.
    """
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

    from app.models.user import User, UserStatus  # local import to avoid circular

    user = await db.get(User, user_id)
    if not user:
        raise credentials_error
    # Mirrors login()'s own gate (auth_service.py) — without this, an account
    # deleted/suspended mid-session keeps authenticating on every endpoint for
    # the rest of its access token's TTL, since the JWT blacklist only covers
    # the specific token the deletion/suspension actor happened to hold (which,
    # for an admin acting on someone else, is never the target's own token at
    # all). PENDING_PASSWORD_RESET is deliberately NOT rejected here — that
    # status's whole point is a restricted token that must still reach
    # change-password via this same dependency.
    if user.status in (UserStatus.SOFT_DELETED, UserStatus.SUSPENDED):
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


async def get_active_user(
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """Like get_current_user, but rejects a force-reset session.

    A user still owing a forced password reset carries a restricted access token
    (`force_reset`). That token may reach ONLY the change-password endpoint; every
    other authenticated surface must deny it so the reset cannot be skipped.
    """
    if current_user.force_reset:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Password reset required before continuing.",
        )
    return current_user


async def require_re_submitter(
    current_user: CurrentUser = Depends(get_active_user),
) -> CurrentUser:
    """A real-estate agent OR a Sub Admin may submit a property. App-layer
    defense atop the RLS INSERT policy (which also checks submitter ownership +
    line). The business_line check only applies to agent — a platform-scoped Sub
    Admin has business_line=None, and submissions are hardcoded to real_estate
    server-side regardless of submitter scope."""
    is_re_agent = current_user.role == "agent" and current_user.business_line in (
        "real_estate",
        "both",
    )
    is_sub_admin = current_user.role == "sub_admin"
    if not (is_re_agent or is_sub_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only real-estate agents or Sub Admin may submit properties.",
        )
    return current_user


async def require_sub_admin(
    current_user: CurrentUser = Depends(get_active_user),
) -> CurrentUser:
    """Only Sub Admin may create/edit content drafts (banners, offers, content
    blocks, referral-bonus config). App-layer defense atop the narrow-allowlist
    RLS policy on each content table — see migration a4b5c6d7e8f9 §7."""
    if current_user.role != "sub_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Sub Admin may perform this action.",
        )
    return current_user


async def require_telecaller(
    current_user: CurrentUser = Depends(get_active_user),
) -> CurrentUser:
    """Only a telecaller may work the assigned-leads surface. App-layer defense atop
    the leads_rls / lead_activities_rls own-assignment predicates."""
    if current_user.role != "telecaller":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only telecallers may access this.",
        )
    return current_user


async def require_agent(
    current_user: CurrentUser = Depends(get_active_user),
) -> CurrentUser:
    """Only an agent may work the lead-introduction surface. App-layer defense atop
    the leads_rls own-origin predicate."""
    if current_user.role != "agent":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only agents may access this.",
        )
    return current_user


async def require_employee(
    current_user: CurrentUser = Depends(get_active_user),
) -> CurrentUser:
    """Only an employee may work the assigned-task surface. App-layer defense atop
    the tasks_rls own-assignment predicate."""
    if current_user.role != "employee":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only employees may access this.",
        )
    return current_user


async def require_admin(
    current_user: CurrentUser = Depends(get_active_user),
) -> CurrentUser:
    """Only Admin may provision staff or approve/reject agent applications.

    RLS's `WITH CHECK` on staff_profiles/agent_profiles/agent_applications accepts
    ANY platform-scoped staff (including a platform sub_admin) — this app-layer
    gate, not RLS, is the actual admin-only wall for these writes."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin may perform this action.",
        )
    return current_user


async def require_platform_admin(
    current_user: CurrentUser = Depends(get_active_user),
) -> CurrentUser:
    """Only a PLATFORM-SCOPED Admin — role-only `require_admin` above is not
    enough for these routes. Every RLS admin-bypass predicate in this
    codebase independently requires `role='admin' AND platform_scope='true'`
    (see e.g. `f2e4d6c8a0b1_add_rls_policies.py`), so a role-only app-layer
    gate lets a line-scoped admin through into either a silent RLS-empty
    result or a 403 further down — neither is a substitute for a real 403
    at the boundary, and the empty-result case is the worse of the two
    since the response still looks like real (if incomplete) data.

    Promoted here (feature-status.md §2-20) from five byte-identical local
    `_require_admin` copies in reporting.py / commissions.py / referrals.py
    / fee_cashbacks.py / document_verification.py. Consolidating onto
    `require_admin` above instead would have WEAKENED all five — this is a
    tightening, not a refactor for its own sake.

    Not the same check as `api/v1/payments.py`'s own `_require_platform_admin`
    (admin OR sub_admin, for lower-risk payout listing) despite the similar
    name — that one stays local, out of scope here.
    """
    if not is_platform_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only platform Admin may perform this action.",
        )
    return current_user


def is_platform_admin(current_user: CurrentUser) -> bool:
    """The bare predicate behind require_platform_admin, exposed separately
    for the one caller that needs a custom per-action error message instead
    of the fixed one above: api/v1/payments.py's own `_require_admin(...,
    action=...)` — a thin wrapper around this, not a duplicate of the
    condition itself."""
    return current_user.role == "admin" and current_user.platform_scope == "true"


async def require_re_reviewer(
    current_user: CurrentUser = Depends(get_active_user),
) -> CurrentUser:
    """Only Admin or Sub Admin may approve/reject a submission. App-layer defense;
    the mutation itself runs on a bypass session, so this guard is the access check."""
    if current_user.role not in ("admin", "sub_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin or Sub Admin may review submissions.",
        )
    # Platform-scoped reviewers (Admin, platform Sub Admin) act across lines; a
    # line-scoped Sub Admin must be on the real-estate line. The mutation runs on
    # a bypass session that skips RLS, so this guard is the segregation wall.
    if current_user.platform_scope != "true" and current_user.business_line not in (
        "real_estate",
        "both",
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only real-estate reviewers may review these submissions.",
        )
    return current_user


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
    """Drop from superuser to api_user and set the 7-variable Postgres RLS context.

    The API connects as 'app' (superuser) which bypasses RLS unconditionally.
    SET LOCAL ROLE api_user switches to a non-superuser role so RLS policies are
    enforced. Both the role and the GUCs are transaction-local (pgBouncer
    transaction-mode safe); the context is stashed on session.info so the
    after_begin listener re-installs it for every subsequent transaction on this
    session, including the one that begins after a service commit.
    """
    ctx = {
        "user_uuid": user_uuid,
        "role": role,
        "business_line": business_line,
        "client_profile_uuid": client_profile_uuid,
        "agent_profile_uuid": agent_profile_uuid,
        "staff_profile_uuid": staff_profile_uuid,
        "platform_scope": platform_scope,
    }
    db.sync_session.info[_RLS_CONTEXT_KEY] = ctx
    # Apply to the current transaction now; the listener only fires for
    # transactions that begin AFTER the context is stashed.
    await db.execute(_SET_ROLE_SQL)
    await db.execute(_SET_RLS_CONFIG_SQL, ctx)


def _parse_uuid(val: str | None) -> UUID | None:
    if not val:
        return None
    try:
        return UUID(val)
    except ValueError:
        return None
