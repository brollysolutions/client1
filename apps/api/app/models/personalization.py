"""Consent and the latest coarse location used for dashboard placements."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, SmallInteger
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PersonalizationPreference(Base):
    __tablename__ = "personalization_preferences"
    __table_args__ = (
        CheckConstraint(
            "latitude_e2 IS NULL OR latitude_e2 BETWEEN -9000 AND 9000",
            name="latitude_bounds",
        ),
        CheckConstraint(
            "longitude_e2 IS NULL OR longitude_e2 BETWEEN -18000 AND 18000",
            name="longitude_bounds",
        ),
        CheckConstraint(
            "(NOT personalization_enabled AND personalization_consented_at IS NULL) OR "
            "(personalization_enabled AND personalization_consented_at IS NOT NULL)",
            name="personalization_consent_consistent",
        ),
        CheckConstraint(
            "personalization_enabled OR NOT location_enabled",
            name="location_requires_personalization",
        ),
        CheckConstraint(
            "(NOT location_enabled AND latitude_e2 IS NULL AND longitude_e2 IS NULL "
            "AND location_captured_at IS NULL AND location_consented_at IS NULL) OR "
            "(location_enabled AND latitude_e2 IS NOT NULL AND longitude_e2 IS NOT NULL "
            "AND location_captured_at IS NOT NULL AND location_consented_at IS NOT NULL)",
            name="location_consistent",
        ),
    )

    auth_user_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("auth_users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    personalization_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    personalization_consented_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    location_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Integer hundredths of a degree. Exact browser coordinates are rounded
    # before assignment and never reach persistent storage.
    latitude_e2: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    longitude_e2: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    location_captured_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    location_consented_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
