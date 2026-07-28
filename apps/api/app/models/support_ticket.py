"""Support tickets — identity-level, client-owned help requests.

Unlike loans/leads (line-scoped, keyed on client_profile_uuid), support tickets
are line-agnostic: a client raises them against their account identity, so RLS
keys on auth_user_uuid (the auth_events / agent_applications identity pattern in
f2e4d6c8a0b1) and there is no business_line column. The account_login / otp /
lost_mobile categories are the recovery paths that route to Admin.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SupportCategory(enum.StrEnum):
    ACCOUNT_LOGIN = "account_login"
    OTP = "otp"
    LOST_MOBILE = "lost_mobile"
    GENERAL = "general"


class SupportStatus(enum.StrEnum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


_ev = lambda x: [e.value for e in x]  # noqa: E731
support_category_enum = ENUM(
    SupportCategory, name="support_category", create_type=False, values_callable=_ev
)
support_status_enum = ENUM(
    SupportStatus, name="support_status", create_type=False, values_callable=_ev
)


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    auth_user_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=False
    )
    category: Mapped[SupportCategory] = mapped_column(support_category_enum, nullable=False)
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[SupportStatus] = mapped_column(
        support_status_enum, nullable=False, default=SupportStatus.OPEN
    )
    # Staff-only: what Admin told the ticket's author, off-platform (WhatsApp/
    # phone — this product has no in-app reply thread). Never exposed on
    # SupportTicketRead, only on the admin-only SupportTicketAdminRead.
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
