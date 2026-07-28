"""Content-block schemas — Sub Admin drafts in, lifecycle out.

ContentBlockRead exposes the full row. There is no client-authored status field:
status only moves via the publish/archive actions. business_line and slug are
create-only — a published block's line tag and its public lookup handle must stay
stable, so neither appears in ContentBlockUpdate.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.content_block import ContentStatus

# Lowercase alphanumerics and single hyphens — a URL-safe page/section key.
_SLUG_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"


class ContentBlockCreate(BaseModel):
    slug: str = Field(pattern=_SLUG_PATTERN, min_length=1, max_length=200)
    section: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=500)
    body: str | None = Field(default=None, max_length=50_000)
    # Omitted / null = cross-line global content (spec §5.3).
    business_line: str | None = Field(default=None, pattern="^(loans|real_estate|both)$")


class ContentBlockUpdate(BaseModel):
    section: str | None = Field(default=None, min_length=1, max_length=200)
    title: str | None = Field(default=None, min_length=1, max_length=500)
    body: str | None = Field(default=None, max_length=50_000)


class ContentBlockRead(BaseModel):
    id: UUID
    slug: str
    section: str
    title: str
    body: str | None
    business_line: str | None
    status: ContentStatus
    created_by_uuid: UUID
    created_at: datetime
    updated_at: datetime


class ContentBlockListResponse(BaseModel):
    content_blocks: list[ContentBlockRead]


class PublicContentBlockRead(BaseModel):
    """Anonymous-read shape (docs/specs/public-content-block-serving.md).

    Deliberately NOT a subclass of ContentBlockRead -- a future sensitive
    column added to the authenticated read can never silently surface here.

    - id: no public use, would only invite ID-based scraping.
    - status: constant "published" by construction on this path (see
      services/public_catalog.py::list_public_content_blocks). Exposing a
      constant invites a client-side filter that would quietly become the
      de-facto access control (same reasoning as PublicOfferRead).
    - created_by_uuid: staff identity, never public.
    - created_at / updated_at: internal metadata, no display use.

    business_line IS included: a block can be line-scoped (spec §5.3), and a
    future line-specific placement needs it to decide whether to render.
    """

    slug: str
    section: str
    title: str
    body: str | None
    business_line: str | None


class PublicContentBlockListResponse(BaseModel):
    content_blocks: list[PublicContentBlockRead]
