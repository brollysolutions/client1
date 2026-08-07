"""Support-assisted account mobile-number change requests.

The replacement number is verified before a row is created, then two distinct
platform Admins act as maker and checker.  The account UUID never changes.
Raw old/new numbers are retained only while the request is active and are
cleared on every terminal transition; audit rows carry only request ids,
states, and proof categories.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import ENUM, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MobileChangeStatus(enum.StrEnum):
    PENDING_REVIEW = "pending_review"
    PENDING_APPROVAL = "pending_approval"
    COMPLETED = "completed"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class MobileChangeSource(enum.StrEnum):
    PUBLIC = "public"
    AUTHENTICATED = "authenticated"


class MobileChangeProof(enum.StrEnum):
    VERIFIED_EMAIL = "verified_email"
    EXISTING_KYC = "existing_kyc"
    STAFF_CONFIRMATION = "staff_confirmation"
    IN_PERSON = "in_person"


_ev = lambda x: [e.value for e in x]  # noqa: E731
mobile_change_status_enum = ENUM(
    MobileChangeStatus, name="mobile_change_status", create_type=False, values_callable=_ev
)
mobile_change_source_enum = ENUM(
    MobileChangeSource, name="mobile_change_source", create_type=False, values_callable=_ev
)
mobile_change_proof_enum = ENUM(
    MobileChangeProof, name="mobile_change_proof", create_type=False, values_callable=_ev
)


class MobileChangeRequest(Base):
    __tablename__ = "mobile_change_requests"
    __table_args__ = (
        CheckConstraint(
            "current_mobile IS NULL OR requested_mobile IS NULL "
            "OR current_mobile <> requested_mobile",
            name="different_numbers",
        ),
        Index(
            "uq_mobile_change_active_target",
            "auth_user_uuid",
            unique=True,
            postgresql_where=text("status IN ('pending_review', 'pending_approval')"),
        ),
        Index(
            "uq_mobile_change_active_requested",
            "requested_mobile",
            unique=True,
            postgresql_where=text(
                "requested_mobile IS NOT NULL AND status IN ('pending_review', 'pending_approval')"
            ),
        ),
        Index("ix_mobile_change_requests_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    auth_user_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("auth_users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    support_ticket_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("support_tickets.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    source: Mapped[MobileChangeSource] = mapped_column(mobile_change_source_enum, nullable=False)
    status: Mapped[MobileChangeStatus] = mapped_column(
        mobile_change_status_enum,
        nullable=False,
        default=MobileChangeStatus.PENDING_REVIEW,
    )
    current_mobile: Mapped[str | None] = mapped_column(String(20), nullable=True)
    requested_mobile: Mapped[str | None] = mapped_column(String(20), nullable=True)
    requested_mobile_verified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    proof_method: Mapped[MobileChangeProof | None] = mapped_column(
        mobile_change_proof_enum, nullable=True
    )
    # PII-free operational reference only (for example a branch visit id or
    # internal HR confirmation id).  Routes reject contact/KYC-like content.
    proof_attestation: Mapped[str | None] = mapped_column(String(300), nullable=True)
    verified_by_user_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_by_user_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_by_user_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
