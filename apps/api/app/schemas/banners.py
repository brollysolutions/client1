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
    subtitle: str | None = Field(default=None, max_length=300)
    cta_label: str | None = Field(default=None, max_length=40)
    image_key: str | None = Field(default=None, max_length=500)
    deep_link: str | None = Field(default=None, max_length=1000)
    audience_rules: dict = Field(default_factory=dict)
    priority: int = Field(default=0, ge=0)
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class BannerUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    subtitle: str | None = Field(default=None, max_length=300)
    cta_label: str | None = Field(default=None, max_length=40)
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
    subtitle: str | None
    cta_label: str | None
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


class PublicBannerRead(BaseModel):
    """Anonymous-read shape (docs/specs/public-banner-serving.md).

    Deliberately NOT a subclass of BannerRead: a separate hand-written schema
    means a future sensitive column added to the authenticated read can never
    silently surface here. Every exclusion below has a reason:

    - image_key: deferred this slice, and it's a storage key, not a URL --
      services/storage.py's presign_download forces
      ResponseContentDisposition: attachment (unusable as an <img> src) and
      next.config.ts has no images.remotePatterns configured. Serving banner
      images needs its own slice and its own security review.
    - audience_rules: targeting internals, meaningless (and a segmentation
      disclosure) to an anonymous client that can never be targeted.
    - priority: an ordering INPUT, already fully expressed by response order.
      Exposing it invites a client-side re-sort that would diverge from the
      server's.
    - status: constant "live" by construction on this path. Exposing a
      constant invites a client-side filter that would quietly become the
      de-facto access control.
    - created_by_uuid / approved_by_uuid: staff identities, never public.
    - review_note: candid reviewer-to-author feedback.
    - starts_at / ends_at: the endpoint has already applied the window
      (services/public_catalog.py); republishing it lets a client
      second-guess the server and discloses unlaunched campaign timing.
    - created_at / updated_at: internal metadata, no display use.
    - business_line: the public hero is cross-line (ADR-0007 makes both lines
      render identically -- blue-only accent), so nothing in the hero varies
      by line. Exposing it would also invite a client-side line filter that
      could become shadow access control.
    - banner_type: the two servable types (default, action) render
      identically on the hero; exposing it invites a client branch and makes
      a future enum value a silent frontend break instead of a backend
      allowlist decision (see services/public_catalog.py's banner_type filter).

    deep_link IS included -- it is the CTA href, author-supplied, and the hero
    cannot function without it. The frontend (lib/public-banners.ts) applies
    a same-origin guard before building a CTA from it; this schema stores
    exactly what the author typed.
    """

    id: UUID
    title: str
    subtitle: str | None
    cta_label: str | None
    deep_link: str | None


class PublicBannerListResponse(BaseModel):
    banners: list[PublicBannerRead]
