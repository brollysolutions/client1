"""Schemas for Admin field projection and Employee contact invitations."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field

FieldTargetRoleLiteral = Literal["agent", "telecaller", "employee"]
FieldVisibilityModeLiteral = Literal["allow", "deny", "share_link"]


class FieldVisibilityEntryRead(BaseModel):
    id: UUID | None = None
    target_role: FieldTargetRoleLiteral
    entity: str
    field_key: str
    label: str
    mode: FieldVisibilityModeLiteral
    default_mode: FieldVisibilityModeLiteral
    allowed_modes: list[FieldVisibilityModeLiteral]
    locked: bool
    lock_reason: str | None = None
    updated_at: datetime | None = None


class FieldVisibilityListResponse(BaseModel):
    entries: list[FieldVisibilityEntryRead]


class FieldVisibilityUpdateRequest(BaseModel):
    target_role: FieldTargetRoleLiteral
    entity: Annotated[str, Field(min_length=1, max_length=64)]
    field_key: Annotated[str, Field(min_length=1, max_length=64)]
    mode: FieldVisibilityModeLiteral


class ContactShareLinkRead(BaseModel):
    id: UUID
    share_path: str
    expires_at: datetime


class ContactInvitationRead(BaseModel):
    valid: bool
