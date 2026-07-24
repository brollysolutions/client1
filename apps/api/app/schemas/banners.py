"""Banner schemas — Sub Admin drafts in, review state out.

BannerRead exposes the full row incl. review state; there is no client-authored
status/review field — status only moves via submit/approve/reject actions.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.banner import BannerStatus, BannerType


class BannerCreate(BaseModel):
    business_line: str = Field(pattern="^(loans|real_estate|both)$")
    banner_type: BannerType
    title: str = Field(min_length=1, max_length=500)
    image_key: str | None = Field(default=None, max_length=500)
    deep_link: str | None = Field(default=None, max_length=1000)
    audience_rules: dict = Field(default_factory=dict)
    priority: int = Field(default=0, ge=0)
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class BannerUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    image_key: str | None = Field(default=None, max_length=500)
    deep_link: str | None = Field(default=None, max_length=1000)
    audience_rules: dict | None = None
    priority: int | None = Field(default=None, ge=0)
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class BannerRead(BaseModel):
    id: UUID
    business_line: str
    banner_type: BannerType
    title: str
    image_key: str | None
    deep_link: str | None
    audience_rules: dict
    priority: int
    status: BannerStatus
    created_by_uuid: UUID
    approved_by_uuid: UUID | None
    review_note: str | None
    starts_at: datetime | None
    ends_at: datetime | None
    created_at: datetime
    updated_at: datetime


class BannerListResponse(BaseModel):
    banners: list[BannerRead]


class RejectRequest(BaseModel):
    note: str = Field(min_length=1, max_length=1000)
