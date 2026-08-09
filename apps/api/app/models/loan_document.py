"""Client-uploaded KYC documents against a loan application.

Its own module, not appended to models/loan.py: `loan.py` is reference data
+ the loan-application journey, while this is a storage-backed child table
with its own verification lifecycle (written by a later Admin-side slice —
see the class docstring below). Structurally the client-facing counterpart
to `models/task.TaskDocument` (employee-collected).

`client_profile_uuid` is denormalized from the parent `loan_applications`
row — this table is read on every `/dashboard/documents` page load, and a
flat RLS equality predicate is much cheaper than an EXISTS join for that hot
path (migration f5a6b7c8d9e0 has the full reasoning).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.property_media import MediaProcessingStatus
from app.models.user import business_line_enum


class LoanDocument(Base):
    """`verified` / `verified_by_profile_uuid` / `verified_at` / `review_note`
    are written by a later Admin-side slice (FR-7.4 document verification),
    never by the uploading client — created now so that slice extends this
    table rather than re-migrating it, the same precedent
    `models/task.TaskDocument`'s docstring records."""

    __tablename__ = "loan_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    loan_application_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("loan_applications.id", ondelete="CASCADE"), nullable=False
    )
    client_profile_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_profiles.id"), nullable=False
    )
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    doc_type: Mapped[str] = mapped_column(Text, nullable=False)
    object_key: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(Text, nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    uploaded_by_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=False
    )
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    verified_by_profile_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_profiles.id"), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    processing_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=MediaProcessingStatus.READY
    )
    processing_error_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    processing_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sanitized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    # Deliberately NO updated_at — see migration f5a6b7c8d9e0's docstring
    # (column-scoped GRANT + onupdate timestamp is the 875b08101bea trap).
