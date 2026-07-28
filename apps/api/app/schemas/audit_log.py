"""Admin audit-log read contract.

Read-only by design: there is no create/update request schema here because the
audit trail has no HTTP write surface at all. Entries are written by the services
that perform the audited action (see `services/audit_log.py`), never by a client
posting to an endpoint — an audit log an API caller can write to is one they can
also fabricate.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel

from app.models.audit_log import AuditAction


class AuditLogRead(BaseModel):
    """One audit entry.

    `actor_name` is resolved server-side from `actor_uuid` (the same convention
    `SupportTicketAdminRead.requester_name` uses) so the console does not render a
    raw UUID. It is None in two distinct cases the frontend renders differently:
    a NULL `actor_uuid` means a scheduler job acted, while a non-NULL
    `actor_uuid` with no resolvable name means the actor's account was since
    deleted.

    `actor_role` is the role held AT THE TIME of the action, read straight off the
    row rather than re-derived from today's profile state — see the model
    docstring for why that distinction matters.

    Deliberately no mobile/email field: this is an activity feed, not a contact
    directory, and `.claude/rules/security.md` keeps PII out of surfaces that do
    not need it. `detail` is bounded by the same rule at write time —
    `services/audit_log.py` rejects PII-shaped keys outright.
    """

    id: UUID
    actor_uuid: UUID | None
    actor_name: str | None
    actor_role: str | None
    action: AuditAction
    entity_type: str
    entity_uuid: UUID | None
    business_line: str | None
    detail: dict[str, Any] | None
    created_at: datetime


class AuditLogListResponse(BaseModel):
    entries: list[AuditLogRead]
    # Total matching the active filters, ignoring limit/offset — the console needs
    # it to decide whether a "load more" control is meaningful.
    total: int
