"""Contracts for approved-Agent first-login setup links."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class AgentInviteLinkRead(BaseModel):
    id: UUID
    share_path: str
    expires_at: datetime


class AgentInviteCandidateRead(BaseModel):
    application_id: UUID
    agent_code: str
    first_name: str
    last_name: str
    mobile: str | None
    business_line: Literal["loans", "real_estate"]
    approved_at: datetime


class AgentInviteCandidateListResponse(BaseModel):
    agents: list[AgentInviteCandidateRead]


class AgentInvitePreview(BaseModel):
    first_name: str
    agent_code: str


class AgentInviteAcceptRequest(BaseModel):
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)

    @field_validator("confirm_password")
    @classmethod
    def _passwords_match(cls, value: str, info) -> str:  # noqa: ANN001
        if info.data.get("password") is not None and value != info.data["password"]:
            raise ValueError("Passwords do not match.")
        return value
