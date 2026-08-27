"""First-login invite links for provisioned staff accounts.

Structurally the sibling of `models/field_visibility.ContactShareLink`: only a
SHA-256 token hash is persisted, the link is single-use, expiring and revocable,
and creating one revokes the invitee's outstanding link.

Its own module rather than an addition to `models/user.py`, which is identity
state, or `models/profile.py`, which is role state. This is neither — it is a
short-lived credential-handoff artifact whose whole lifecycle is measured in
days, and it carries no PII: the token hash and two foreign keys, nothing more.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class StaffInviteLink(Base):
    __tablename__ = "staff_invite_links"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    # The invitee. CASCADE because a link to a deleted identity is meaningless,
    # and account deletion must not be blocked by an unused invite.
    auth_user_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id", ondelete="CASCADE"), nullable=False
    )
    staff_profile_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_profiles.id", ondelete="CASCADE"), nullable=False
    )
    created_by_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id", ondelete="CASCADE"), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
