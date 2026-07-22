"""Bookmarks — a client's saved real-estate listings.

Identity-level owner FK (user_uuid -> auth_users.id, keyed on
app.auth_user_uuid), same identity key as site_visits/enquiries so a
"both"-line client's saved listing never vanishes behind the JWT's
loans-first client_profile_uuid claim. Unlike site_visits/enquiries, there is
NO staff/agent read branch: a saved list is private, and no staff workflow
consumes it (this is the support_tickets shape, not the site_visits shape).
business_line is still stamped (always "real_estate") and kept immutable for
invariant/analytics consistency, even though no RLS branch reads it.

property_ref plus a light display snapshot (title/locality/city) are
denormalized, not FKs — no properties table exists yet (mock listing catalog
lives in the web app only). The FE resolves bookmarks against that mock
catalog and silently drops a "ghost" id no longer present in it; the snapshot
exists so a ghosted bookmark stays identifiable (e.g. for a future migration
that maps old property_ref values onto a real properties table), not to
render a fallback card today.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.user import business_line_enum


class Bookmark(Base):
    __tablename__ = "bookmarks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=False
    )
    # Immutable once set (enforce_business_line_immutable trigger) — always
    # "real_estate" for this table, stamped server-side only. Provenance/
    # analytics metadata; no RLS branch reads it (see module docstring).
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    property_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    locality: Mapped[str | None] = mapped_column(String(120), nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
