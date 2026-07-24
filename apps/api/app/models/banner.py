"""Banners — Sub Admin content, Admin-approved go-live.

The first of four Sub Admin content tables (SubAdmin_Dashboard_System_Design.md
§5.1). Unlike property_submissions (owner-scoped: an agent sees only their own
drafts), banners is a SHARED content-team surface — any sub_admin sees every
banner, not just ones they created (migration a4b5c6d7e8f9 §7). business_line is
still per-row (immutable, shared trigger) even though the sub_admin role itself
is platform-scoped/cross-line: individual banners are line-tagged for
customer-facing filtering.

State machine: draft -> pending_approval -> approved -> live -> archived, with a
rejected side-branch back to draft (edit + resubmit). Sub Admin can reach
pending_approval; approved/live is Admin's transition, run on a bypass session
(services/banners.py), the same mechanism as services/property_submissions.py.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, Text
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.user import business_line_enum


class BannerType(enum.StrEnum):
    DEFAULT = "default"
    PERSONALIZED = "personalized"
    ACTION = "action"


class BannerStatus(enum.StrEnum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    LIVE = "live"
    REJECTED = "rejected"
    ARCHIVED = "archived"


_ev = lambda x: [e.value for e in x]  # noqa: E731
banner_type_enum = ENUM(BannerType, name="banner_type", create_type=False, values_callable=_ev)
banner_status_enum = ENUM(
    BannerStatus, name="banner_status", create_type=False, values_callable=_ev
)


class Banner(Base):
    __tablename__ = "banners"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Line-tag for the customer-facing surface; immutable (shared trigger).
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    banner_type: Mapped[BannerType] = mapped_column(banner_type_enum, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    image_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    deep_link: Mapped[str | None] = mapped_column(Text, nullable=True)
    # user_type / location / business_status matchers — write-only in slice 1, no
    # consumer endpoint yet (customer-facing serving is out of scope, spec Open C).
    audience_rules: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Tie-break when multiple banners' audience_rules match — unused until a
    # future serving endpoint exists.
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[BannerStatus] = mapped_column(
        banner_status_enum, nullable=False, default=BannerStatus.DRAFT
    )
    # RLS owner axis for INSERT/UPDATE-while-draft, keyed on app.auth_user_uuid.
    created_by_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    approved_by_uuid: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
