"""Role-safe lead-detail ownership request and response shapes (FR-2.8)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

LeadDetailOwner = Literal[
    "agent", "client", "telecaller", "admin", "system", "unclaimed", "legacy_locked"
]


class LeadDetailsPatch(BaseModel):
    name: Annotated[str | None, Field(default=None, max_length=100)] = None
    notes: Annotated[str | None, Field(default=None, max_length=1000)] = None

    @model_validator(mode="after")
    def _at_least_one_explicit_field(self) -> LeadDetailsPatch:
        if not ({"name", "notes"} & self.model_fields_set):
            raise ValueError("Provide at least one of name or notes.")
        if "name" in self.model_fields_set and self.name is not None and not self.name.strip():
            raise ValueError("name cannot be blank; use null to clear it.")
        return self


class AdminLeadDetailsPatch(LeadDetailsPatch):
    reason: Annotated[str, Field(min_length=1, max_length=500)]

    @field_validator("reason")
    @classmethod
    def _reason_must_be_meaningful(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("reason cannot be blank.")
        return value


class LeadDetailsRead(BaseModel):
    id: UUID
    business_line: Literal["loans", "real_estate"]
    status: Literal["new", "assigned", "working", "converted", "closed", "released"]
    name: str | None
    requirement: dict[str, Any] | None
    field_owners: dict[str, LeadDetailOwner]
    editable_fields: list[Literal["name", "requirement.notes"]]
    updated_at: datetime
