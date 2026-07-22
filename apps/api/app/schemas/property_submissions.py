"""Property-submission schemas — agent draft in, review state out.

The submitter sends structured facets + integer price_paise (never a display
string): price_display is derived server-side at approval so the catalog can't
drift from the paise truth. SubmissionRead exposes the full row incl. review
state; there is no client-authored status/review field.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.property import ConstructionStatus, Furnishing, PropertyCategory
from app.models.property_submission import SubmissionStatus


class SubmissionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    type: str = Field(min_length=1, max_length=40)
    location: str = Field(min_length=1, max_length=160)
    meta: str | None = Field(default=None, max_length=120)
    image: str | None = Field(default=None, max_length=200)
    category: PropertyCategory
    city: str = Field(min_length=1, max_length=120)
    locality: str = Field(min_length=1, max_length=120)
    pincode: str = Field(min_length=6, max_length=6)
    price_paise: int = Field(gt=0)
    bhk: int = Field(default=0, ge=0)
    area_sqft: int = Field(default=0, ge=0)
    furnishing: Furnishing
    construction_status: ConstructionStatus
    amenities: list[str] = Field(default_factory=list)
    age_years: int = Field(default=0, ge=0)
    rera_number: str = Field(min_length=1, max_length=40)
    details: dict = Field(default_factory=dict)


class SubmissionRead(BaseModel):
    id: UUID
    submitter_uuid: UUID
    status: SubmissionStatus
    review_note: str | None
    reviewed_by_uuid: UUID | None
    reviewed_at: datetime | None
    approved_property_id: UUID | None
    title: str
    type: str
    location: str
    meta: str | None
    image: str | None
    category: PropertyCategory
    city: str
    locality: str
    pincode: str
    price_paise: int
    bhk: int
    area_sqft: int
    furnishing: Furnishing
    construction_status: ConstructionStatus
    amenities: list[str]
    age_years: int
    rera_number: str
    created_at: datetime


class SubmissionListResponse(BaseModel):
    submissions: list[SubmissionRead]


class RejectRequest(BaseModel):
    note: str = Field(min_length=1, max_length=1000)
