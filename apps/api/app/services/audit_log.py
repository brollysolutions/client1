"""Business-action audit trail (Admin design §5.6, FR-11.3, NFR-2.3).

One entry point, `record()`, deliberately taking the CALLER'S session rather than
opening its own. That is the whole design constraint: the audit row is written
inside the same transaction as the action it describes, so the two cannot
diverge. An action that rolls back takes its audit row with it, and an audit row
that is present is proof the action committed. Opening a separate session here —
the way `services/leads.py` does for best-effort lead capture — would trade that
guarantee for availability, which is the wrong trade for a compliance record.

Because the session is the caller's, this module never imports
`AsyncSessionLocal` and therefore does not need adding to conftest's
`_patch_db_null_pool` rebind list.

`record()` does not commit. It flushes, so the row has an id and any constraint
or RLS violation surfaces at the call site instead of at the caller's commit,
where it would be much harder to attribute.

Writes are append-only at the privilege layer (migration a1c4e77b93d2 grants
`api_user` only SELECT/INSERT). There is intentionally no update or delete
function in this module, and no grant that would let one work if it existed.
Correcting a wrong entry means appending a new one.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditAction, AuditLog
from app.models.user import User, UserStatus

# `detail` is free-form JSONB that Admin reads back in a console, so it is an
# easy accidental home for exactly the data .claude/rules/security.md forbids
# logging. Callers pass reasons, statuses, amounts and ids — never contact
# details, credentials, or KYC. Enforced rather than merely documented: a
# violation is a programming error, and failing loudly at the call site during
# development is the only point where it is cheap to fix.
#
# Matched per snake_case TOKEN, not as a raw substring. Substring matching would
# catch `recipient_mobile` correctly but also reject innocent keys on short
# entries here — `pan` alone appears inside "expand", "company" and "panel" — so
# a future caller passing `expanded_scope` would blow up for no reason. Tokens
# still catch every real case (`recipient_mobile`, `applicant_email`,
# `access_token`, `monthly_income`, `aadhaar_number`, `kyc_url`).
_FORBIDDEN_DETAIL_TOKENS = frozenset(
    {
        "mobile",
        "phone",
        "email",
        "password",
        "token",
        "otp",
        "aadhaar",
        "pan",
        "kyc",
        "income",
        "address",
    }
)

_TOKEN_SPLIT = re.compile(r"[^a-z0-9]+")


class AuditDetailRejected(ValueError):
    """Raised when a caller tries to put PII or a credential in `detail`."""


def _assert_detail_is_safe(detail: dict[str, Any]) -> None:
    for key in detail:
        tokens = {t for t in _TOKEN_SPLIT.split(key.lower()) if t}
        offending = tokens & _FORBIDDEN_DETAIL_TOKENS
        if offending:
            raise AuditDetailRejected(
                f"audit detail key {key!r} looks like PII or a credential "
                f"(matched {sorted(offending)}); audit entries record ids, statuses "
                f"and reasons, never contact details or KYC data"
            )


async def record(
    db: AsyncSession,
    *,
    action: AuditAction,
    entity_type: str,
    entity_uuid: uuid.UUID | None,
    actor_uuid: uuid.UUID | None,
    actor_role: str | None,
    business_line: str | None = None,
    detail: dict[str, Any] | None = None,
) -> AuditLog:
    """Append one audit entry on `db`, without committing.

    `actor_uuid=None` means the platform acted on a schedule with no human actor
    (a scheduler job). The table's `audit_log_insert` RLS policy pins a non-NULL
    actor to the caller's own session identity, so a NULL actor only succeeds on
    an RLS-bypassing superuser session — which is exactly where jobs run, and is
    why "no actor" cannot be forged from a request.

    `actor_role` is stored as the role held AT THE TIME of the action; see the
    model docstring for why it is denormalized rather than joined at read time.

    `business_line="both"` is normalized to NULL. Content rows may legitimately
    be cross-line -- `ck_banners_business_line_content_audience` and its offers
    twin allow 'both' -- but an audit entry's line is a SCOPE, and
    `ck_audit_log_business_line_optional_operational` allows only a concrete
    line or NULL (migration a3b4c5d6e7f8 also asserted zero pre-existing 'both'
    audit rows). For a cross-line action neither line is true, and NULL already
    means "not scoped to one line", so that is the honest value. Normalizing at
    this single funnel rather than in each caller: every caller forwards its
    entity's own column, so the alternative is the same ternary repeated at
    ~40 call sites with a 500 waiting behind whichever one is forgotten.
    Operational tables are constrained to a concrete line at the database level,
    so this can never silently mask a mis-scoped operational row.
    """
    if detail is not None:
        _assert_detail_is_safe(detail)

    entry = AuditLog(
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        action=action,
        entity_type=entity_type,
        entity_uuid=entity_uuid,
        business_line=None if business_line == "both" else business_line,
        detail=detail,
    )
    db.add(entry)
    await db.flush()
    return entry


# ---------------------------------------------------------------------------
# Read side (Admin console)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class AuditEntryView:
    entry: AuditLog
    actor_name: str | None


async def _resolve_actors(db: AsyncSession, actor_uuids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    """Batch-resolve actors to a display name, one query regardless of page size
    — the same shape as `services/support_tickets.py::_resolve_requesters`, minus
    the mobile: an activity feed has no need for a contact number.

    A soft-deleted actor is omitted from the result rather than returned as its
    tombstoned "Deleted User" name, so the caller renders "Deleted account"
    instead of a name that reads like a real one.
    """
    if not actor_uuids:
        return {}
    rows = (
        await db.execute(
            select(User.id, User.first_name, User.last_name, User.status).where(
                User.id.in_(actor_uuids)
            )
        )
    ).all()
    resolved: dict[uuid.UUID, str] = {}
    for uid, first, last, status in rows:
        if status == UserStatus.SOFT_DELETED:
            continue
        name = f"{first} {last}".strip()
        if name:
            resolved[uid] = name
    return resolved


async def list_for_admin(
    db: AsyncSession,
    *,
    action: AuditAction | None = None,
    actor_uuid: uuid.UUID | None = None,
    entity_type: str | None = None,
    entity_uuid: uuid.UUID | None = None,
    business_line: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[AuditEntryView], int]:
    """Return one page of entries (newest first) plus the total matching the
    filters, ignoring pagination.

    Visibility is the DB's job, not this function's: `audit_log_select` restricts
    SELECT to a full Admin, so a non-Admin session reaching here reads zero rows
    rather than being filtered in Python. The router's `require_admin` is the
    access gate; RLS is the wall behind it.
    """
    filters = []
    if action is not None:
        filters.append(AuditLog.action == action)
    if actor_uuid is not None:
        filters.append(AuditLog.actor_uuid == actor_uuid)
    if entity_type is not None:
        filters.append(AuditLog.entity_type == entity_type)
    if entity_uuid is not None:
        filters.append(AuditLog.entity_uuid == entity_uuid)
    if business_line is not None:
        filters.append(AuditLog.business_line == business_line)
    if since is not None:
        filters.append(AuditLog.created_at >= since)
    if until is not None:
        filters.append(AuditLog.created_at <= until)

    total = await db.scalar(select(func.count()).select_from(AuditLog).where(*filters)) or 0

    # created_at DESC matches ix_audit_log_created_at_desc; id is the tiebreaker
    # so two entries written in the same transaction (identical created_at) keep
    # a stable order across pages instead of being interleaved arbitrarily.
    entries = (
        await db.scalars(
            select(AuditLog)
            .where(*filters)
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()

    actors = await _resolve_actors(db, {e.actor_uuid for e in entries if e.actor_uuid is not None})
    return [
        AuditEntryView(entry=e, actor_name=actors.get(e.actor_uuid) if e.actor_uuid else None)
        for e in entries
    ], total
