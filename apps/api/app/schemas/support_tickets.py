"""Support ticket schemas — client raises a ticket and lists their own, Admin
triages and resolves (docs/specs/admin-support-ticket-console.md).

Enums are imported from the model so the values are a single source of truth and
land in OpenAPI.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.support_ticket import SupportCategory, SupportStatus


class SupportTicketCreate(BaseModel):
    category: SupportCategory
    subject: Annotated[str, Field(min_length=1, max_length=200)]
    body: Annotated[str, Field(min_length=1, max_length=4000)]

    @field_validator("subject", "body")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("This field cannot be blank.")
        return v


class SupportTicketRead(BaseModel):
    id: UUID
    category: SupportCategory
    subject: str
    body: str
    status: SupportStatus
    created_at: datetime
    updated_at: datetime


class SupportTicketListResponse(BaseModel):
    tickets: list[SupportTicketRead]


class SupportTicketAdminRead(BaseModel):
    """Admin-only shape. Deliberately NOT a subclass of SupportTicketRead -- a
    future sensitive column added to the client-facing read can never
    silently surface here, and vice versa: resolution_note and the resolved
    requester identity must never leak into SupportTicketRead.

    requester_name / requester_mobile are resolved server-side from
    auth_user_uuid (services/support_tickets.py::list_for_admin) so the
    client never sees a raw UUID it has no use for. Both are None when the
    account is soft-deleted (account_deletion.py has already tombstoned the
    real mobile by then) -- the frontend renders "Deleted account" for that
    case, same convention apps/web/features/admin/payouts-view.tsx uses for
    a delinked payout recipient.
    """

    id: UUID
    category: SupportCategory
    subject: str
    body: str
    status: SupportStatus
    resolution_note: str | None
    created_at: datetime
    updated_at: datetime
    requester_name: str | None
    requester_mobile: str | None


class SupportTicketAdminListResponse(BaseModel):
    tickets: list[SupportTicketAdminRead]


class SupportTicketAdvanceRequest(BaseModel):
    status: SupportStatus
    # None (the default, e.g. omitted or explicit null) preserves whatever
    # note is already on the ticket -- advance_ticket only overwrites it when
    # this is not None. An explicit "" IS a valid value and does overwrite,
    # intentionally: it's the only way to clear a previously-set note.
    resolution_note: Annotated[str, Field(max_length=2000)] | None = None
