"""Contracts for staff first-login invite links.

The raw token appears in exactly one response — the one that creates the link —
and never again. `share_path` is a site-relative path, not an absolute URL, for
the same reason `ContactShareLinkRead.share_path` is: the API does not know
which host the console is served from, and returning one would let a
misconfigured deployment mint links pointing at somebody else's origin.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class StaffInviteLinkRead(BaseModel):
    id: UUID
    share_path: str
    expires_at: datetime


class StaffInvitePreview(BaseModel):
    """What an anonymous holder of the token may see before setting a password.

    First name and role only. Enough to confirm the link is meant for the person
    holding it; nothing that turns a guessed token into contact details.
    """

    first_name: str
    role: str


class StaffInviteAcceptRequest(BaseModel):
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)

    @field_validator("confirm_password")
    @classmethod
    def _passwords_match(cls, value: str, info) -> str:  # noqa: ANN001
        if info.data.get("password") is not None and value != info.data["password"]:
            raise ValueError("Passwords do not match.")
        return value
