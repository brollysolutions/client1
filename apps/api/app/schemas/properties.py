"""Property schemas — read-only real-estate listing catalog.

Enums are imported from the model so the values are a single source of truth
and land in the OpenAPI contract (the frontend consumes them as typed unions).
No Create/Update schema this slice: listings are seeded/admin-managed, and the
public API is read-only.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.models.property import ConstructionStatus, Furnishing, PropertyCategory


class PropertyRead(BaseModel):
    id: UUID
    title: str
    type: str
    location: str
    price_display: str
    price_paise: int
    meta: str | None
    image: str | None
    category: PropertyCategory
    city: str
    locality: str
    pincode: str
    bhk: int
    area_sqft: int
    furnishing: Furnishing
    construction_status: ConstructionStatus
    amenities: list[str]
    age_years: int
    rera_number: str
    active: bool
    created_at: datetime


class PropertyListResponse(BaseModel):
    properties: list[PropertyRead]


class PublicPropertyRead(BaseModel):
    """Anonymous-read shape (docs/specs/public-property-catalog.md).

    Deliberately NOT PropertyRead: a separate schema means a future sensitive
    column added to the authenticated read can never silently surface here.
    Excludes the dashboard's entire filter-facet vocabulary (price_paise, bhk,
    area_sqft, furnishing, construction_status, amenities, age_years, pincode,
    city, locality) and internal metadata (active, created_at). `rera_number`
    is deliberately included: RERA registration is a statutory disclosure on
    any advertisement of a registered project, and a public listing page is
    one.
    """

    id: UUID
    title: str
    type: str
    location: str
    price_display: str
    meta: str | None
    image: str | None
    category: PropertyCategory
    rera_number: str


class PublicPropertyListResponse(BaseModel):
    properties: list[PublicPropertyRead]
