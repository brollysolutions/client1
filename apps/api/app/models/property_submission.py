"""Property submissions — owner-authored listing drafts awaiting Admin review.

The WRITE path that populates the read-only `properties` catalog (models/property.py).
Unlike the catalog (a shared, public-equivalent row owned by no one), a submission
IS owned by the Agent, Sub Admin, or platform Admin who created it (``submitter_uuid`` ->
auth_users.id). RLS is owner-or-platform-Admin: the submitter sees their own rows,
only platform Admin sees the shared queue, and other staff see nothing.

Carries the full typed property payload (mirrors ``Property`` 1:1) so approval is a
clean field copy into a new active ``Property``. Money is integer paise
(``price_paise`` BIGINT); ``price_display`` is DERIVED server-side at approval, never
authored here, so the catalog's display string can't drift from the paise truth.

State machine: ``pending`` -> ``approved`` | ``rejected``; owner edits return a
reviewed row to ``pending`` and owner deletion records ``withdrawn``. Approval and
rejection run in a bypass-session service (services/property_submissions.py), the same
superuser mechanism as services.notifications.emit_notification, so the catalog keeps
its SELECT-only api_user grant and the status flip never rides the reviewer's request txn.
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    ARRAY,
    BigInteger,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.property import (
    ConstructionStatus,
    Furnishing,
    ListingIntent,
    PropertyCategory,
    PropertySubtype,
    ReraApplicability,
    ReraVerificationStatus,
    construction_status_enum,
    furnishing_enum,
    listing_intent_enum,
    property_category_enum,
    property_subtype_enum,
    rera_applicability_enum,
    rera_verification_status_enum,
)
from app.models.user import business_line_enum


class SubmissionStatus(enum.StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


_ev = lambda x: [e.value for e in x]  # noqa: E731
submission_status_enum = ENUM(
    SubmissionStatus, name="re_submission_status", create_type=False, values_callable=_ev
)


class PropertySubmission(Base):
    __tablename__ = "property_submissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # RLS owner axis: the submitter's auth_users.id (keyed on app.auth_user_uuid).
    submitter_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    # Stamped "real_estate", immutable (shared trigger). Segregation/analytics.
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    status: Mapped[SubmissionStatus] = mapped_column(
        submission_status_enum, nullable=False, default=SubmissionStatus.PENDING
    )
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by_uuid: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Audit link to the Property row created on approval.
    approved_property_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    # --- Payload (mirrors Property; approval copies these 1:1) ---
    listing_intent: Mapped[ListingIntent] = mapped_column(
        listing_intent_enum, nullable=False, default=ListingIntent.SALE
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    location: Mapped[str] = mapped_column(String(160), nullable=False)
    meta: Mapped[str | None] = mapped_column(String(120), nullable=True)
    image: Mapped[str | None] = mapped_column(String(200), nullable=True)
    category: Mapped[PropertyCategory] = mapped_column(property_category_enum, nullable=False)
    # Nullable at the database layer for pre-taxonomy drafts. New submissions
    # require this through SubmissionCreate.
    property_subtype: Mapped[PropertySubtype | None] = mapped_column(
        property_subtype_enum, nullable=True
    )
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    locality: Mapped[str] = mapped_column(String(120), nullable=False)
    state: Mapped[str | None] = mapped_column(String(120), nullable=True)
    pincode: Mapped[str] = mapped_column(String(6), nullable=False)
    price_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # Rent-only terms; see the matching block on Property.
    security_deposit_paise: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    minimum_lease_months: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    available_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    bhk: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    area_sqft: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    furnishing: Mapped[Furnishing | None] = mapped_column(furnishing_enum, nullable=True)
    construction_status: Mapped[ConstructionStatus | None] = mapped_column(
        construction_status_enum, nullable=True
    )
    amenities: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    age_years: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    rera_number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    rera_applicability: Mapped[ReraApplicability] = mapped_column(
        rera_applicability_enum, nullable=False, default=ReraApplicability.UNSURE
    )
    rera_verification_status: Mapped[ReraVerificationStatus] = mapped_column(
        rera_verification_status_enum,
        nullable=False,
        default=ReraVerificationStatus.NOT_REVIEWED,
    )
    rera_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rera_verified_by_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True
    )
    rera_review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    listing_links: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    details: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    details_version: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    structured_details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
