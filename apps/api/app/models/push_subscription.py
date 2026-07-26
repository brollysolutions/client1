"""Web Push subscriptions — one row per browser/device a user opted push into.

Written and read ONLY via the bypass superuser session (services/push.py),
same mechanism as services.notifications.emit_notification — api_user (the
role every authenticated request runs as) gets NO grants on this table at
all, stricter than notifications (SELECT+UPDATE). This is deliberate, not
just least-privilege: `endpoint` is UNIQUE (not `(user_uuid, endpoint)`)
because a shared/reused browser returns the SAME endpoint across different
logged-in accounts, so re-subscribing must upsert-reassign a row from user A
to user B. An owner-only RLS policy would block user B's own RLS-scoped
session from ever seeing user A's existing row to reassign it (RLS blocks
the ON CONFLICT UPDATE path the same way it blocks a plain UPDATE), so the
subscribe/unsubscribe routes go through the bypass session instead, with the
route itself as the authorization boundary (current_user.id from the
verified JWT, never client-supplied).

RLS is still enabled with an owner-only policy and NO platform_scope
admin-bypass branch, purely as defense-in-depth against a future
api_user-session query being added to this table by mistake: no admin has a
legitimate reason to read another user's raw push endpoint/keys.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=False
    )
    endpoint: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    # Denormalized for a future "manage devices" UI — not identity, not read by
    # any query today.
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
