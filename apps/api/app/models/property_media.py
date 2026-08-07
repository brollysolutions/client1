"""Managed media for property submissions and approved public listings."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, SmallInteger, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.user import business_line_enum


class PropertyMediaKind(enum.StrEnum):
    IMAGE = "image"
    DOCUMENT = "document"


class PropertySubmissionMedia(Base):
    """Private asset attached to one pending/reviewed property submission."""

    __tablename__ = "property_submission_media"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    submission_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("property_submissions.id", ondelete="CASCADE"),
        nullable=False,
    )
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    content_type: Mapped[str] = mapped_column(String(80), nullable=False)
    object_key: Mapped[str] = mapped_column(String(600), nullable=False, unique=True)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )


class PropertyMedia(Base):
    """Public image belonging to one approved property catalogue row."""

    __tablename__ = "property_media"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    property_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
    )
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    content_type: Mapped[str] = mapped_column(String(80), nullable=False)
    object_key: Mapped[str] = mapped_column(String(600), nullable=False, unique=True)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
