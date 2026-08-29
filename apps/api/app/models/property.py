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

This is a CONSCIOUS, SCOPED exception to the product's "RLS is the wall, never
UI hiding alone" invariant, justified ONLY because the catalog is
public-equivalent (no confidentiality boundary is crossed by an authenticated
loans-only client seeing listings that are already public). Do NOT copy this
no-line-predicate shape onto a genuinely sensitive/owner-scoped table — use the
site_visits/enquiries hybrid predicate there instead.

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
from datetime import date, datetime

from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
)
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.user import business_line_enum


class ListingIntent(enum.StrEnum):
    """Whether the listing is offered for sale or for rent/lease.

    Deliberately two-valued. Indian practice distinguishes short-term "rent"
    from long-term/commercial "lease", but they share every field this catalog
    captures (headline amount, deposit, minimum term, availability date), so a
    single ``rent`` intent labelled "Rent / Lease" carries both. Splitting them
    later is an additive ALTER TYPE ... ADD VALUE, the same shape as every other
    enum extension here.
    """

    SALE = "sale"
    RENT = "rent"


class PropertyCategory(enum.StrEnum):
    HOUSES = "houses"
    APARTMENTS = "apartments"
    VILLAS = "villas"
    PLOTS = "plots"
    COMMERCIAL = "commercial"


class PropertySubtype(enum.StrEnum):
    INDIVIDUAL_HOUSE = "individual_house"
    STANDALONE_APARTMENT = "standalone_apartment"
    GATED_COMMUNITY_APARTMENT = "gated_community_apartment"
    VILLA = "villa"
    LOCKED_SPACE = "locked_space"
    UNLOCKED_SPACE = "unlocked_space"
    PLOT = "plot"
    FARMLAND = "farmland"
    AGRILAND = "agriland"


PROPERTY_CATEGORY_BY_SUBTYPE: dict[PropertySubtype, PropertyCategory] = {
    PropertySubtype.INDIVIDUAL_HOUSE: PropertyCategory.HOUSES,
    PropertySubtype.STANDALONE_APARTMENT: PropertyCategory.APARTMENTS,
    PropertySubtype.GATED_COMMUNITY_APARTMENT: PropertyCategory.APARTMENTS,
    PropertySubtype.VILLA: PropertyCategory.VILLAS,
    PropertySubtype.LOCKED_SPACE: PropertyCategory.COMMERCIAL,
    PropertySubtype.UNLOCKED_SPACE: PropertyCategory.COMMERCIAL,
    PropertySubtype.PLOT: PropertyCategory.PLOTS,
    PropertySubtype.FARMLAND: PropertyCategory.PLOTS,
    PropertySubtype.AGRILAND: PropertyCategory.PLOTS,
}


class Furnishing(enum.StrEnum):
    UNFURNISHED = "unfurnished"
    SEMI = "semi"
    FURNISHED = "furnished"


class ConstructionStatus(enum.StrEnum):
    READY = "ready"
    UNDER_CONSTRUCTION = "under_construction"


class ReraApplicability(enum.StrEnum):
    APPLICABLE = "applicable"
    EXEMPTION_CLAIMED = "exemption_claimed"
    UNSURE = "unsure"


class ReraVerificationStatus(enum.StrEnum):
    NOT_REVIEWED = "not_reviewed"
    VERIFIED = "verified"
    MISMATCH = "mismatch"
    EXEMPTION_VERIFIED = "exemption_verified"


_ev = lambda x: [e.value for e in x]  # noqa: E731
listing_intent_enum = ENUM(
    ListingIntent, name="re_listing_intent", create_type=False, values_callable=_ev
)
property_category_enum = ENUM(
    PropertyCategory, name="re_property_category", create_type=False, values_callable=_ev
)
property_subtype_enum = ENUM(
    PropertySubtype, name="re_property_subtype", create_type=False, values_callable=_ev
)
furnishing_enum = ENUM(Furnishing, name="re_furnishing", create_type=False, values_callable=_ev)
construction_status_enum = ENUM(
    ConstructionStatus, name="re_construction_status", create_type=False, values_callable=_ev
)
rera_applicability_enum = ENUM(
    ReraApplicability, name="re_rera_applicability", create_type=False, values_callable=_ev
)
rera_verification_status_enum = ENUM(
    ReraVerificationStatus,
    name="re_rera_verification_status",
    create_type=False,
    values_callable=_ev,
)


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Stamped "real_estate", immutable (trigger). Not an RLS axis here (see module docstring).
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    # RLS predicate + prod-empty gate. Inactive rows are admin-only.
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Sale vs rent/lease. NOT NULL with a "sale" server default: every row that
    # predates this column was a sale listing, so the backfill is exact.
    listing_intent: Mapped[ListingIntent] = mapped_column(
        listing_intent_enum, nullable=False, default=ListingIntent.SALE
    )

    # Display fields the card renders verbatim.
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(40), nullable=False)  # badge: "House", "Office"
    location: Mapped[str] = mapped_column(String(160), nullable=False)  # "Locality, City"
    price_display: Mapped[str] = mapped_column(String(40), nullable=False)  # authored "₹78 L"
    meta: Mapped[str | None] = mapped_column(String(120), nullable=True)  # "2 bed · 1,120 sqft"
    image: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Structured facets (mirror REListing; filtered/sorted client-side).
    category: Mapped[PropertyCategory] = mapped_column(property_category_enum, nullable=False)
    # Nullable only for listings created before the structured subtype taxonomy.
    property_subtype: Mapped[PropertySubtype | None] = mapped_column(
        property_subtype_enum, nullable=True
    )
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    locality: Mapped[str] = mapped_column(String(120), nullable=False)
    state: Mapped[str | None] = mapped_column(String(120), nullable=True)
    pincode: Mapped[str] = mapped_column(String(6), nullable=False)
    # Money in integer minor units (source of truth; price_display is authored
    # alongside). BigInteger: ₹2.6 Cr = 2_600_000_000 paise exceeds int32.
    price_paise: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # Rent-only terms. Nullable because they are meaningless for a sale listing,
    # and the schema layer rejects them unless listing_intent is "rent" — so
    # NULL here is "not a rental", never "a rental we forgot to price".
    security_deposit_paise: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    minimum_lease_months: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    available_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    bhk: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0
    )  # 0 = N/A (plot/commercial)
    area_sqft: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    furnishing: Mapped[Furnishing | None] = mapped_column(furnishing_enum, nullable=True)
    construction_status: Mapped[ConstructionStatus | None] = mapped_column(
        construction_status_enum, nullable=True
    )
    amenities: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    age_years: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)

    # Applicant-provided RERA number; the public projection discloses it only
    # after a platform Admin records a verified applicable registration.
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

    # Author-supplied links to this property elsewhere (YouTube walkthrough,
    # Instagram reel, Facebook post). JSONB rather than a child table: the list
    # is capped at ListingLink.MAX_LINKS, is only ever read with its parent, and
    # a child table would need its own policy + grants for no benefit. Every
    # entry is host-allowlisted at write AND re-checked at render.
    listing_links: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Overflow for anything not promoted to a typed column.
    details: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    details_version: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    structured_details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
