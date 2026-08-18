"""Banner schemas — Sub Admin drafts in, review state out.

BannerRead exposes the full row incl. review state; there is no client-authored
status/review field — status only moves via submit/approve/reject actions.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.banner import BannerPlacement, BannerStatus, BannerType
from app.schemas.personalization import AudienceRules, audience_rules_valid_for_banner

# Matches services/banners.py::build_image_key's `public/banners/{uuid4}/{name}`
# shape exactly -- this is the write-side half of the public/ security
# boundary (services/storage.py::public_asset_url is the read-side half). A
# free-text image_key was the pre-slice shape of this field; without this
# pattern a typo or a pasted KYC object key would be one PATCH away from
# being treated as a public asset. Filename part excludes "/" and "\\" so a
# path-traversal-shaped value (e.g. "../agent-applications/...") can never
# match.
_IMAGE_KEY_PATTERN = (
    r"^public/banners/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    r"/[A-Za-z0-9._-]+$"
)

# jpeg/png/webp only -- no SVG. An SVG is an XML document that can carry
# <script>, and this bucket prefix is anonymously readable with no auth wall
# an executing script could be caught by.
BannerImageContentTypeLiteral = Literal["image/jpeg", "image/png", "image/webp"]


class BannerCreate(BaseModel):
    business_line: str = Field(pattern="^(loans|real_estate|both)$")
    placement: BannerPlacement = BannerPlacement.HOMEPAGE
    template_id: UUID | None = None
    offer_id: UUID | None = None
    property_id: UUID | None = None
    banner_type: BannerType
    title: str = Field(min_length=1, max_length=500)
    subtitle: str | None = Field(default=None, max_length=300)
    cta_label: str | None = Field(default=None, max_length=40)
    image_key: str | None = Field(default=None, max_length=500, pattern=_IMAGE_KEY_PATTERN)
    deep_link: str | None = Field(default=None, max_length=1000)
    audience_rules: AudienceRules = Field(default_factory=AudienceRules)
    priority: int = Field(default=0, ge=0)
    starts_at: datetime | None = None
    ends_at: datetime | None = None

    @model_validator(mode="after")
    def audience_matches_banner_type(self) -> BannerCreate:
        if not audience_rules_valid_for_banner(self.banner_type, self.audience_rules):
            if self.banner_type == BannerType.PERSONALIZED:
                raise ValueError("Personalized banners require at least one user type.")
            raise ValueError("Default and action banners cannot carry audience rules.")
        if self.banner_type == BannerType.PERSONALIZED and "placement" not in self.model_fields_set:
            self.placement = BannerPlacement.DASHBOARD
        if (
            self.banner_type == BannerType.PERSONALIZED
            and self.placement != BannerPlacement.DASHBOARD
        ):
            raise ValueError("Personalized banners are dashboard-only.")
        if self.placement == BannerPlacement.DASHBOARD and self.template_id is not None:
            raise ValueError("Dashboard banners do not use public templates.")
        if self.placement == BannerPlacement.DASHBOARD and self.property_id is not None:
            raise ValueError("Dashboard banners cannot promote public properties.")
        if self.offer_id is not None and self.property_id is not None:
            raise ValueError("A banner cannot link both an Offer and a property.")
        if (
            self.placement != BannerPlacement.DASHBOARD
            and self.template_id is None
            and "placement" in self.model_fields_set
        ):
            raise ValueError("Public banner campaigns require a template.")
        return self


class BannerUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    subtitle: str | None = Field(default=None, max_length=300)
    cta_label: str | None = Field(default=None, max_length=40)
    image_key: str | None = Field(default=None, max_length=500, pattern=_IMAGE_KEY_PATTERN)
    deep_link: str | None = Field(default=None, max_length=1000)
    audience_rules: AudienceRules | None = None
    priority: int | None = Field(default=None, ge=0)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    template_id: UUID | None = None
    offer_id: UUID | None = None
    property_id: UUID | None = None


class BannerTemplateCreate(BaseModel):
    placement: BannerPlacement
    category_key: str = Field(min_length=1, max_length=80)
    image_ref: str = Field(min_length=1, max_length=500)
    content_type: BannerImageContentTypeLiteral | None = None


class BannerTemplateRead(BaseModel):
    id: UUID
    placement: BannerPlacement
    category_key: str
    label: str
    version: int
    image_url: str
    active: bool
    created_at: datetime


class BannerTemplateListResponse(BaseModel):
    templates: list[BannerTemplateRead]


class BannerImageUploadRequest(BaseModel):
    content_type: BannerImageContentTypeLiteral
    # Original filename, used only to keep a human-readable suffix on the
    # generated key (services/banners.py::build_image_key sanitizes it) --
    # never trusted as a path.
    filename: str = Field(min_length=1, max_length=200)


class BannerImageUploadResponse(BaseModel):
    object_key: str
    upload_url: str
    fields: dict[str, str]
    max_bytes: int


class BannerRead(BaseModel):
    id: UUID
    business_line: str
    placement: BannerPlacement
    category_key: str | None
    template_id: UUID | None
    offer_id: UUID | None
    property_id: UUID | None
    replaces_banner_id: UUID | None
    banner_type: BannerType
    title: str
    subtitle: str | None
    cta_label: str | None
    image_key: str | None
    deep_link: str | None
    audience_rules: AudienceRules
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

    - image_key: still excluded -- it's a storage key, not a URL, and its
      shape (`public/banners/{uuid}/{name}`) leaks bucket layout for no
      benefit to a public consumer. `image_url` (below) is the servable
      replacement, computed at the router from image_key via
      services/storage.py::public_asset_url -- never round-tripped from the
      column directly, so a non-`public/`-prefixed key (shouldn't exist post
      write-validator, but see the backfill migration) degrades to None
      instead of ever reaching a client.
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

    image_url IS included -- the direct, unsigned URL for a `public/`-prefixed
    image_key (None if the banner has no image, or -- should never happen
    post write-validator -- a non-conforming one). The frontend applies an
    allowed-host guard before ever passing this to next/image, mirroring the
    deep_link same-origin guard above: see lib/public-banners.ts.
    """

    id: UUID
    title: str
    subtitle: str | None
    cta_label: str | None
    deep_link: str | None
    image_url: str | None
    offer_badge: str | None = None
    rera_verified: bool = False


class PublicBannerListResponse(BaseModel):
    banners: list[PublicBannerRead]
