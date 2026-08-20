"""Property-submission schemas — managed submitter intake, review state out.

The submitter sends structured facets + integer price_paise (never a display
string): price_display is derived server-side at approval so the catalog can't
drift from the paise truth. SubmissionRead exposes the full row incl. review
state; there is no client-authored status/review field.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.property import (
    PROPERTY_CATEGORY_BY_SUBTYPE,
    ConstructionStatus,
    Furnishing,
    PropertyCategory,
    PropertySubtype,
)
from app.models.property_submission import SubmissionStatus

PropertyImageContentType = Literal["image/jpeg", "image/png", "image/webp"]
PropertyPanoramaContentType = Literal["image/jpeg", "image/webp"]
PropertyDocumentContentType = Literal["application/pdf"]
PropertyMediaContentType = PropertyImageContentType | PropertyDocumentContentType

_PRIVATE_KEY_PATTERN = (
    r"^private/property-submissions/staging/"
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/"
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/"
    r"asset\.(jpg|png|webp|pdf)$"
)


class SubmissionMediaInput(BaseModel):
    kind: Literal["image", "document", "panorama"]
    content_type: PropertyMediaContentType
    object_key: str = Field(min_length=1, max_length=600, pattern=_PRIVATE_KEY_PATTERN)
    position: int = Field(ge=0, le=12)

    @model_validator(mode="after")
    def validate_kind_matches_type(self) -> SubmissionMediaInput:
        is_document = self.content_type == "application/pdf"
        if (self.kind == "document") != is_document:
            raise ValueError("Media kind does not match content type.")
        if self.kind == "panorama" and self.content_type not in {"image/jpeg", "image/webp"}:
            raise ValueError("Panoramas must be JPEG or WebP images.")
        return self


class SubmissionFacts(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    type: str = Field(min_length=1, max_length=40)
    location: str = Field(min_length=1, max_length=160)
    meta: str | None = Field(default=None, max_length=120)
    category: PropertyCategory
    property_subtype: PropertySubtype
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

    @model_validator(mode="after")
    def validate_property_subtype(self) -> SubmissionFacts:
        if PROPERTY_CATEGORY_BY_SUBTYPE[self.property_subtype] != self.category:
            raise ValueError("Property subtype does not belong to the selected category.")
        return self


class SubmissionCreate(SubmissionFacts):
    media: list[SubmissionMediaInput] = Field(min_length=1, max_length=13)

    @model_validator(mode="after")
    def validate_submission(self) -> SubmissionCreate:
        images = [asset for asset in self.media if asset.kind == "image"]
        documents = [asset for asset in self.media if asset.kind == "document"]
        panoramas = [asset for asset in self.media if asset.kind == "panorama"]
        if not 1 <= len(images) <= 10:
            raise ValueError("A submission requires between one and ten images.")
        if len(documents) > 2:
            raise ValueError("A submission may include at most two PDF documents.")
        if len(panoramas) > 1:
            raise ValueError("A submission may include at most one panorama.")
        keys = [asset.object_key for asset in self.media]
        positions = [asset.position for asset in self.media]
        if len(keys) != len(set(keys)):
            raise ValueError("Duplicate media object keys are not allowed.")
        if len(positions) != len(set(positions)):
            raise ValueError("Duplicate media positions are not allowed.")
        return self


class SubmissionUpdate(SubmissionFacts):
    """Editable listing facts; managed media remains immutable after intake."""


class SubmissionMediaRead(BaseModel):
    id: UUID
    kind: Literal["image", "document", "panorama"]
    content_type: str
    size_bytes: int
    position: int
    processing_status: Literal["pending", "processing", "ready", "failed"]
    processing_error_code: str | None


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
    property_subtype: PropertySubtype | None
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
    details: dict
    created_at: datetime
    updated_at: datetime
    media: list[SubmissionMediaRead] = Field(default_factory=list)


class SubmissionListResponse(BaseModel):
    submissions: list[SubmissionRead]


class RejectRequest(BaseModel):
    note: str = Field(min_length=1, max_length=1000)


class PropertyMediaUploadRequest(BaseModel):
    kind: Literal["image", "document", "panorama"]
    content_type: PropertyMediaContentType

    @model_validator(mode="after")
    def validate_kind_matches_type(self) -> PropertyMediaUploadRequest:
        is_document = self.content_type == "application/pdf"
        if (self.kind == "document") != is_document:
            raise ValueError("Media kind does not match content type.")
        if self.kind == "panorama" and self.content_type not in {"image/jpeg", "image/webp"}:
            raise ValueError("Panoramas must be JPEG or WebP images.")
        return self


class PropertyMediaUploadResponse(BaseModel):
    object_key: str
    upload_url: str
    fields: dict[str, str]
    max_bytes: int


class SubmissionMediaAccessResponse(BaseModel):
    url: str
