"""Content blocks — Sub Admin website CMS, no Admin-approval gate.

The third of four Sub Admin content tables (SubAdmin_Dashboard_System_Design.md
§5.3). Like banners and offers this is a SHARED content-team surface — any
sub_admin sees every block, not just ones they created (migration d7e8f9a0b1c2) —
and like offers the whole lifecycle is sub_admin-owned: draft -> published ->
archived (forward-only, app-layer guarded in services/content.py). Admin has
read-only oversight; there is no approve/reject step and no bypass session.

business_line is nullable here and only here among the Sub Admin content tables:
NULL means cross-line/global content. It is create-only (absent from
ContentBlockUpdate), so a block's line tag never changes after insert.

slug is globally unique — the lookup handle for a future public renderer. No
public read path exists yet; this slice is admin CRUD only.
"""

from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Text
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.user import business_line_enum


class ContentStatus(enum.StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


_ev = lambda x: [e.value for e in x]  # noqa: E731
content_status_enum = ENUM(
    ContentStatus, name="content_status", create_type=False, values_callable=_ev
)


class ContentBlock(Base):
    __tablename__ = "content_blocks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    section: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    # Nullable so a block can be drafted before its copy exists; publishing
    # requires non-empty body (services/content.py), not a DB constraint.
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    # NULL = cross-line/global. Create-only; immutable via the shared trigger.
    business_line: Mapped[str | None] = mapped_column(business_line_enum, nullable=True)
    status: Mapped[ContentStatus] = mapped_column(
        content_status_enum, nullable=False, default=ContentStatus.DRAFT
    )
    # RLS owner axis for INSERT/UPDATE, keyed on app.auth_user_uuid.
    created_by_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    # tz-aware (models/payout.py's convention) — datetime.utcnow is deprecated and
    # returns a naive value against a timestamptz column.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
