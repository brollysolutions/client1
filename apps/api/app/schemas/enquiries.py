"""Enquiry schemas — client raises a listing enquiry and lists their own.

Enums are imported from the model so the values are a single source of truth
and land in OpenAPI. The client never supplies user_uuid/business_line/status —
those are stamped server-side (router) only.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.enquiry import EnquiryStatus


class EnquiryCreate(BaseModel):
    property_ref: Annotated[str, Field(min_length=1, max_length=80)]
    title: Annotated[str, Field(min_length=1, max_length=200)]
    locality: Annotated[str, Field(min_length=1, max_length=120)]
    city: Annotated[str, Field(min_length=1, max_length=120)]
    contact_name: Annotated[str, Field(min_length=1, max_length=100)]
    # Same E.164 pattern as PublicLeadCreate.mobile (schemas/leads.py).
    contact_mobile: Annotated[str, Field(pattern=r"^\+[1-9]\d{6,14}$")]
    message: Annotated[str | None, Field(default=None, max_length=1000)] = None

    @field_validator("property_ref", "title", "locality", "city", "contact_name", "message")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return v.strip() if isinstance(v, str) else v

    @field_validator("property_ref", "title", "locality", "city", "contact_name")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v:
            raise ValueError("This field cannot be blank.")
        return v


class EnquiryRead(BaseModel):
    id: UUID
    property_ref: str
    title: str
    locality: str
    city: str
    contact_name: str
    contact_mobile: str
    message: str | None
    status: EnquiryStatus
    created_at: datetime
    updated_at: datetime


class EnquiryListResponse(BaseModel):
    enquiries: list[EnquiryRead]
