"""Payout identity resolution + recipient search — read-only, caller's RLS session.

Unlike services/payments.py, this module NEVER uses the AsyncSessionLocal bypass
session. Both functions run on the request session, so `auth_users_rls` /
`client_profiles_rls` / `agent_profiles_rls` apply exactly as they do for any
other admin query. A platform Sub Admin caller resolving nothing here (all
identity fields come back null) is the CORRECT outcome under
a0b1c2d3e4f5_rls_scope_platform_bypass_to_admin's Group-1 bypass
(`platform_scope='true' AND role='admin'` only) — not a bug to "fix" by widening
the query or the RLS policy.
"""

from __future__ import annotations

from collections.abc import Collection, Mapping
from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile import AgentProfile, ClientProfile, StaffProfile
from app.models.user import User, UserStatus

_SEARCH_MAX_ROWS = 50
_INACTIVE_STATUSES = (UserStatus.SUSPENDED, UserStatus.SOFT_DELETED)


@dataclass(frozen=True)
class Identity:
    name: str
    code: str | None


async def resolve_identities(
    db: AsyncSession,
    user_uuids: Collection[UUID],
    *,
    prefer_line: Mapping[UUID, str | None] | None = None,
) -> dict[UUID, Identity]:
    """Batch-resolve auth_user uuids to a display name + best profile code.

    Three fixed queries total regardless of row count (never N+1). Code
    precedence: agent_code -> customer_code matching prefer_line[uuid] ->
    oldest customer_code -> staff_code -> None. Uuids invisible under RLS (or
    with no matching auth_users row) are simply absent from the result dict —
    callers must treat a missing key as "unknown", not an error.
    """
    ids = {u for u in user_uuids if u is not None}
    if not ids:
        return {}
    prefer_line = prefer_line or {}

    users = (
        await db.execute(select(User.id, User.first_name, User.last_name).where(User.id.in_(ids)))
    ).all()
    names: dict[UUID, str] = {}
    for uid, first, last in users:
        name = f"{first} {last}".strip()
        if name:
            names[uid] = name

    client_rows = (
        await db.execute(
            select(
                ClientProfile.auth_user_uuid,
                ClientProfile.business_line,
                ClientProfile.customer_code,
            )
            .where(ClientProfile.auth_user_uuid.in_(ids))
            .order_by(ClientProfile.created_at.asc())
        )
    ).all()
    client_codes: dict[UUID, list[tuple[str, str]]] = {}
    for uid, line, code in client_rows:
        client_codes.setdefault(uid, []).append((line, code))

    agent_rows = (
        await db.execute(
            select(AgentProfile.auth_user_uuid, AgentProfile.agent_code).where(
                AgentProfile.auth_user_uuid.in_(ids)
            )
        )
    ).all()
    agent_codes: dict[UUID, str] = dict(agent_rows)

    staff_rows = (
        await db.execute(
            select(StaffProfile.auth_user_uuid, StaffProfile.staff_code).where(
                StaffProfile.auth_user_uuid.in_(ids)
            )
        )
    ).all()
    staff_codes: dict[UUID, str] = dict(staff_rows)

    result: dict[UUID, Identity] = {}
    for uid in ids:
        name = names.get(uid)
        if name is None:
            continue
        code: str | None = agent_codes.get(uid)
        if code is None:
            lines = client_codes.get(uid, [])
            if lines:
                wanted = prefer_line.get(uid)
                match = next((c for line, c in lines if line == wanted), None)
                code = match if match is not None else lines[0][1]
        if code is None:
            code = staff_codes.get(uid)
        result[uid] = Identity(name=name, code=code)
    return result


@dataclass(frozen=True)
class RecipientHit:
    auth_user_uuid: UUID
    name: str
    codes: list[str]
    kind: Literal["client", "agent", "staff"]
    mobile_last4: str


async def search_recipients(
    db: AsyncSession, *, q: str, limit: int, exclude_user_uuid: UUID
) -> list[RecipientHit]:
    """Admin-only recipient picker search. Filters mirror the create_payout
    guards (services/payments.py) so the picker never offers a choice that
    would then 422/403 on submit: active only, never the caller themself.
    """
    limit = min(limit, _SEARCH_MAX_ROWS)
    like = f"%{q}%"

    client_exists = (
        select(ClientProfile.auth_user_uuid)
        .where(
            ClientProfile.auth_user_uuid == User.id,
            ClientProfile.customer_code.ilike(like),
        )
        .exists()
    )
    agent_exists = (
        select(AgentProfile.auth_user_uuid)
        .where(
            AgentProfile.auth_user_uuid == User.id,
            AgentProfile.agent_code.ilike(like),
        )
        .exists()
    )
    staff_exists = (
        select(StaffProfile.auth_user_uuid)
        .where(
            StaffProfile.auth_user_uuid == User.id,
            StaffProfile.staff_code.ilike(like),
        )
        .exists()
    )

    filters = [
        User.first_name.ilike(like),
        User.last_name.ilike(like),
        (User.first_name + " " + User.last_name).ilike(like),
        client_exists,
        agent_exists,
        staff_exists,
    ]
    stripped = q.strip()
    if stripped.isdigit() and len(stripped) >= 6:
        filters.append(User.mobile.like(f"%{stripped}"))

    stmt = (
        select(User.id, User.first_name, User.last_name, User.mobile)
        .where(
            User.id != exclude_user_uuid,
            User.status.not_in(_INACTIVE_STATUSES),
            or_(*filters),
        )
        # Most-recently-created first: a deterministic tiebreak (created_at is
        # effectively unique) that also surfaces the account an admin most
        # likely just created, ahead of a large accumulated user base sharing
        # the same query term.
        .order_by(User.created_at.desc(), User.id)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    if not rows:
        return []

    ids = [row[0] for row in rows]
    client_rows = (
        await db.execute(
            select(ClientProfile.auth_user_uuid, ClientProfile.customer_code).where(
                ClientProfile.auth_user_uuid.in_(ids)
            )
        )
    ).all()
    client_codes: dict[UUID, list[str]] = {}
    for uid, code in client_rows:
        client_codes.setdefault(uid, []).append(code)

    agent_rows = (
        await db.execute(
            select(AgentProfile.auth_user_uuid, AgentProfile.agent_code).where(
                AgentProfile.auth_user_uuid.in_(ids)
            )
        )
    ).all()
    agent_codes: dict[UUID, str] = dict(agent_rows)

    staff_rows = (
        await db.execute(
            select(StaffProfile.auth_user_uuid, StaffProfile.staff_code).where(
                StaffProfile.auth_user_uuid.in_(ids)
            )
        )
    ).all()
    staff_codes: dict[UUID, str] = dict(staff_rows)

    hits: list[RecipientHit] = []
    for uid, first, last, mobile in rows:
        if uid in agent_codes:
            kind: Literal["client", "agent", "staff"] = "agent"
            codes = [agent_codes[uid]]
        elif uid in client_codes:
            kind = "client"
            codes = client_codes[uid]
        elif uid in staff_codes:
            kind = "staff"
            codes = [staff_codes[uid]]
        else:
            continue
        hits.append(
            RecipientHit(
                auth_user_uuid=uid,
                name=f"{first} {last}".strip(),
                codes=codes,
                kind=kind,
                mobile_last4=mobile[-4:],
            )
        )
    return hits
