"""Support ticket schemas — client raises a ticket and lists their own.

Enums are imported from the model so the values are a single source of truth and
land in OpenAPI. Assigning/replying is staff-side and out of scope here.
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
