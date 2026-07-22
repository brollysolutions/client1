"""Property submissions — agent-authored listing drafts awaiting Admin/Sub Admin review.

The WRITE path that populates the read-only `properties` catalog (models/property.py).
Unlike the catalog (a shared, public-equivalent row owned by no one), a submission
IS owned — by the agent who created it (``submitter_uuid`` -> auth_users.id). RLS is
hybrid (migration c3d4e5f6a7b8): the owning agent sees only their own drafts;
platform reviewers (Admin + Sub Admin, ``platform_scope='true'``) and a real-estate
Sub Admin see the whole RE queue. Other RE staff (telecaller/employee/other agents)
see nothing — review is a platform concern, unlike enquiries which every RE staffer sees.

Carries the full typed property payload (mirrors ``Property`` 1:1) so approval is a
clean field copy into a new active ``Property``. Money is integer paise
(``price_paise`` BIGINT); ``price_display`` is DERIVED server-side at approval, never
authored here, so the catalog's display string can't drift from the paise truth.

State machine: ``pending`` -> ``approved`` | ``rejected``, both terminal. Approval and
rejection run in a bypass-session service (services/property_submissions.py), the same
superuser mechanism as services.notifications.emit_notification, so the catalog keeps
its SELECT-only api_user grant and the status flip never rides the reviewer's request txn.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    ARRAY,
    BigInteger,
    DateTime,
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
    PropertyCategory,
    construction_status_enum,
    furnishing_enum,
    property_category_enum,
)
from app.models.user import business_line_enum


class SubmissionStatus(enum.StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


_ev = lambda x: [e.value for e in x]  # noqa: E731
submission_status_enum = ENUM(
    SubmissionStatus, name="re_submission_status", create_type=False, values_callable=_ev
)


class PropertySubmission(Base):
    __tablename__ = "property_submissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # RLS owner axis: the submitting agent's auth_users.id (keyed on app.auth_user_uuid).
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
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    location: Mapped[str] = mapped_column(String(160), nullable=False)
    meta: Mapped[str | None] = mapped_column(String(120), nullable=True)
    image: Mapped[str | None] = mapped_column(String(200), nullable=True)
    category: Mapped[PropertyCategory] = mapped_column(property_category_enum, nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    locality: Mapped[str] = mapped_column(String(120), nullable=False)
    pincode: Mapped[str] = mapped_column(String(6), nullable=False)
    price_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    bhk: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    area_sqft: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    furnishing: Mapped[Furnishing] = mapped_column(furnishing_enum, nullable=False)
    construction_status: Mapped[ConstructionStatus] = mapped_column(
        construction_status_enum, nullable=False
    )
    amenities: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    age_years: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    rera_number: Mapped[str] = mapped_column(String(40), nullable=False)
    details: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
