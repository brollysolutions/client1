"""Contracts for the Sub Admin campaign Media Library."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

CampaignMediaUsageType = Literal[
    "public_banner", "sponsor", "dashboard_banner", "dashboard_offer", "campaign"
]
CampaignImageContentType = Literal["image/jpeg", "image/png", "image/webp"]


class CampaignMediaUploadRequest(BaseModel):
    content_type: CampaignImageContentType
    filename: str = Field(min_length=1, max_length=200)


class CampaignMediaUploadResponse(BaseModel):
    object_key: str
    upload_url: str
    fields: dict[str, str]
    max_bytes: int


class CampaignMediaCreate(BaseModel):
    business_line: str = Field(pattern="^(loans|real_estate|both)$")
    usage_type: CampaignMediaUsageType
    title: str = Field(min_length=1, max_length=160)
    alt_text: str = Field(min_length=1, max_length=300)
    tags: list[str] = Field(default_factory=list, max_length=12)
    object_key: str = Field(
        min_length=1,
        max_length=500,
        pattern=(r"^private/campaign-media/staging/[0-9a-f-]{36}/[A-Za-z0-9._-]+$"),
    )
    content_type: CampaignImageContentType
    source_reference: str | None = Field(default=None, max_length=500)

    @field_validator("title", "alt_text")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value

    @field_validator("tags")
    @classmethod
    def _clean_tags(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip().lower() for item in value if item.strip()]
        if any(len(item) > 40 for item in cleaned):
            raise ValueError("Tags must be 40 characters or fewer.")
        return list(dict.fromkeys(cleaned))


class CampaignMediaUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    alt_text: str | None = Field(default=None, min_length=1, max_length=300)
    tags: list[str] | None = Field(default=None, max_length=12)
    source_reference: str | None = Field(default=None, max_length=500)
    active: bool | None = None

    @field_validator("active", mode="before")
    @classmethod
    def _active_cannot_be_cleared(cls, value: object) -> object:
        if value is None:
            raise ValueError("Active state cannot be null.")
        return value

    @field_validator("title", "alt_text")
    @classmethod
    def _not_blank_when_present(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("This field cannot be null.")
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value

    @field_validator("tags")
    @classmethod
    def _clean_tags_when_present(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            raise ValueError("Tags cannot be null.")
        cleaned = [item.strip().lower() for item in value if item.strip()]
        if any(len(item) > 40 for item in cleaned):
            raise ValueError("Tags must be 40 characters or fewer.")
        return list(dict.fromkeys(cleaned))


class CampaignMediaUsage(BaseModel):
    kind: Literal["banner_template", "banner", "offer"]
    entity_id: UUID
    label: str
    status: str


class CampaignMediaRead(BaseModel):
    id: UUID
    business_line: str
    usage_type: str
    title: str
    alt_text: str
    tags: list[str]
    image_url: str
    mime_type: str
    width: int | None
    height: int | None
    byte_size: int | None
    source_type: str
    source_reference: str | None
    active: bool
    created_by_uuid: UUID | None
    created_at: datetime
    updated_at: datetime | None
    archived_at: datetime | None
    usage_count: int
    usages: list[CampaignMediaUsage]


class CampaignMediaListResponse(BaseModel):
    assets: list[CampaignMediaRead]
