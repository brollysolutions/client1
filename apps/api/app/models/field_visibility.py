"""Admin-managed response projection and provider-neutral contact invitations.

FieldVisibilityConfig stores only overrides for the closed catalogue defined in
``services.field_visibility``.  Entity and field keys intentionally remain text:
the server registry, not database content or an Admin-supplied arbitrary path,
decides what may be projected.

ContactShareLink stores a SHA-256 token hash, never the bearer token included in
the browser URL.  The link is scoped to an Employee-owned task/lead and is
expiring, single-use, and revocable.
"""

from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class FieldTargetRole(enum.StrEnum):
    AGENT = "agent"
    TELECALLER = "telecaller"
    EMPLOYEE = "employee"


class FieldVisibilityMode(enum.StrEnum):
    ALLOW = "allow"
    DENY = "deny"
    SHARE_LINK = "share_link"


_ev = lambda x: [e.value for e in x]  # noqa: E731
field_target_role_enum = ENUM(
    FieldTargetRole,
    name="field_target_role",
    create_type=False,
    values_callable=_ev,
)
field_visibility_mode_enum = ENUM(
    FieldVisibilityMode,
    name="field_visibility_mode",
    create_type=False,
    values_callable=_ev,
)


class FieldVisibilityConfig(Base):
    __tablename__ = "field_visibility_config"
    __table_args__ = (
        UniqueConstraint(
            "target_role",
            "entity",
            "field_key",
            name="uq_field_visibility_config_role_entity_field",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    target_role: Mapped[FieldTargetRole] = mapped_column(field_target_role_enum, nullable=False)
    entity: Mapped[str] = mapped_column(Text, nullable=False)
    field_key: Mapped[str] = mapped_column(Text, nullable=False)
    mode: Mapped[FieldVisibilityMode] = mapped_column(field_visibility_mode_enum, nullable=False)
    updated_by_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("auth_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class ContactShareLink(Base):
    __tablename__ = "contact_share_links"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    task_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    lead_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False
    )
    created_by_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("auth_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
