"""Properties — the real-estate listing catalog (read-only, this slice).

A SHARED catalog, not a user-owned record: unlike enquiries/site_visits/
bookmarks (which key RLS on the owning client), a property row belongs to no
single user. Its RLS is therefore catalog-shaped — every authenticated user
sees ``active`` listings, and platform Admin/Sub Admin additionally see
inactive ones (migration bf2c3d4e5a6b). There is deliberately no
``user_uuid`` owner branch and no ``business_line`` line predicate: the catalog
is public-equivalent (the same listings back the public marketing site), and a
line predicate would only risk a ``both``/loans-only visibility regression while
adding no security. Line-level access stays a route-layer concern on the FE.

``business_line`` is stamped ``real_estate`` and made immutable (the shared
enforce_business_line_immutable trigger) purely for segregation/analytics
consistency with the other real-estate tables, even though no policy branch
reads it.

Typed facet columns (category/city/bhk/price_paise/...) mirror the frontend
REListing shape so the generated TS contract is fully typed and the existing
client-side filter/sort engine consumes the API response unchanged; ``details``
(JSONB) is overflow for anything not promoted to a column. Money is integer
minor units (``price_paise``), never a float — the display string
``price_display`` is authored alongside but ``price_paise`` is the source of
truth.

No producer exists yet (listings go live via the Admin-approved
property_submissions workflow, a later slice), so this table ships EMPTY in
production; only SELECT is granted to api_user, and dev is populated by
app.scripts.seed_properties.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    DateTime,
    Integer,
    SmallInteger,
    String,
)
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.user import business_line_enum


class PropertyCategory(enum.StrEnum):
    HOUSES = "houses"
    APARTMENTS = "apartments"
    VILLAS = "villas"
    PLOTS = "plots"
    COMMERCIAL = "commercial"


class Furnishing(enum.StrEnum):
    UNFURNISHED = "unfurnished"
    SEMI = "semi"
    FURNISHED = "furnished"


class ConstructionStatus(enum.StrEnum):
    READY = "ready"
    UNDER_CONSTRUCTION = "under_construction"


_ev = lambda x: [e.value for e in x]  # noqa: E731
property_category_enum = ENUM(
    PropertyCategory, name="re_property_category", create_type=False, values_callable=_ev
)
furnishing_enum = ENUM(Furnishing, name="re_furnishing", create_type=False, values_callable=_ev)
construction_status_enum = ENUM(
    ConstructionStatus, name="re_construction_status", create_type=False, values_callable=_ev
)


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Stamped "real_estate", immutable (trigger). Not an RLS axis here (see module docstring).
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    # RLS predicate + prod-empty gate. Inactive rows are admin-only.
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Display fields the card renders verbatim.
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(40), nullable=False)  # badge: "House", "Office"
    location: Mapped[str] = mapped_column(String(160), nullable=False)  # "Locality, City"
    price_display: Mapped[str] = mapped_column(String(40), nullable=False)  # authored "₹78 L"
    meta: Mapped[str | None] = mapped_column(String(120), nullable=True)  # "2 bed · 1,120 sqft"
    image: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Structured facets (mirror REListing; filtered/sorted client-side).
    category: Mapped[PropertyCategory] = mapped_column(property_category_enum, nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    locality: Mapped[str] = mapped_column(String(120), nullable=False)
    pincode: Mapped[str] = mapped_column(String(6), nullable=False)
    # Money in integer minor units (source of truth; price_display is authored
    # alongside). BigInteger: ₹2.6 Cr = 2_600_000_000 paise exceeds int32.
    price_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    bhk: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0
    )  # 0 = N/A (plot/commercial)
    area_sqft: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    furnishing: Mapped[Furnishing] = mapped_column(furnishing_enum, nullable=False)
    construction_status: Mapped[ConstructionStatus] = mapped_column(
        construction_status_enum, nullable=False
    )
    amenities: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    age_years: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)

    # RERA registration number, shown on every listing (SRS 5.6).
    rera_number: Mapped[str] = mapped_column(String(40), nullable=False)

    # Overflow for anything not promoted to a typed column.
    details: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
