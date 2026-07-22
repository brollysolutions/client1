"""Bookmark schemas — client saves/lists/removes their own bookmarked listings.

The client never supplies user_uuid/business_line — those are stamped
server-side (router) only.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class BookmarkCreate(BaseModel):
    property_ref: Annotated[str, Field(min_length=1, max_length=80)]
    title: Annotated[str | None, Field(default=None, max_length=200)] = None
    locality: Annotated[str | None, Field(default=None, max_length=120)] = None
    city: Annotated[str | None, Field(default=None, max_length=120)] = None

    @field_validator("property_ref", "title", "locality", "city")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return v.strip() if isinstance(v, str) else v

    @field_validator("property_ref")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v:
            raise ValueError("This field cannot be blank.")
        return v


class BookmarkRead(BaseModel):
    id: UUID
    property_ref: str
    title: str | None
    locality: str | None
    city: str | None
    created_at: datetime


class BookmarkListResponse(BaseModel):
    bookmarks: list[BookmarkRead]
