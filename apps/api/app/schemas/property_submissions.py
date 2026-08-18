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
PropertyDocumentContentType = Literal["application/pdf"]
PropertyVideoContentType = Literal["video/mp4"]
PropertyMediaContentType = (
    PropertyImageContentType | PropertyDocumentContentType | PropertyVideoContentType
)

_PRIVATE_KEY_PATTERN = (
    r"^private/property-submissions/staging/"
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/"
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/"
    r"asset\.(jpg|png|webp|pdf|mp4)$"
)


class SubmissionMediaInput(BaseModel):
    kind: Literal["image", "document", "video"]
    content_type: PropertyMediaContentType
    object_key: str = Field(min_length=1, max_length=600, pattern=_PRIVATE_KEY_PATTERN)
    position: int = Field(ge=0, le=12)

    @model_validator(mode="after")
    def validate_kind_matches_type(self) -> SubmissionMediaInput:
        expected = (
            "document"
            if self.content_type == "application/pdf"
            else "video"
            if self.content_type == "video/mp4"
            else "image"
        )
        if self.kind != expected:
            raise ValueError("Media kind does not match content type.")
        return self


class SubmissionCreate(BaseModel):
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
    media: list[SubmissionMediaInput] = Field(min_length=1, max_length=13)

    @model_validator(mode="after")
    def validate_submission(self) -> SubmissionCreate:
        if PROPERTY_CATEGORY_BY_SUBTYPE[self.property_subtype] != self.category:
            raise ValueError("Property subtype does not belong to the selected category.")
        images = [asset for asset in self.media if asset.kind == "image"]
        documents = [asset for asset in self.media if asset.kind == "document"]
        videos = [asset for asset in self.media if asset.kind == "video"]
        if not 1 <= len(images) <= 10:
            raise ValueError("A submission requires between one and ten images.")
        if len(documents) > 2:
            raise ValueError("A submission may include at most two PDF documents.")
        if len(videos) > 1:
            raise ValueError("A submission may include at most one video.")
        keys = [asset.object_key for asset in self.media]
        positions = [asset.position for asset in self.media]
        if len(keys) != len(set(keys)):
            raise ValueError("Duplicate media object keys are not allowed.")
        if len(positions) != len(set(positions)):
            raise ValueError("Duplicate media positions are not allowed.")
        return self


class SubmissionMediaRead(BaseModel):
    id: UUID
    kind: Literal["image", "document", "video"]
    content_type: str
    size_bytes: int
    position: int
    processing_status: Literal["pending", "processing", "ready", "failed"]
    processing_error_code: str | None
    duration_seconds: int | None


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
    created_at: datetime
    media: list[SubmissionMediaRead] = Field(default_factory=list)


class SubmissionListResponse(BaseModel):
    submissions: list[SubmissionRead]


class RejectRequest(BaseModel):
    note: str = Field(min_length=1, max_length=1000)


class PropertyMediaUploadRequest(BaseModel):
    kind: Literal["image", "document", "video"]
    content_type: PropertyMediaContentType

    @model_validator(mode="after")
    def validate_kind_matches_type(self) -> PropertyMediaUploadRequest:
        expected = (
            "document"
            if self.content_type == "application/pdf"
            else "video"
            if self.content_type == "video/mp4"
            else "image"
        )
        if self.kind != expected:
            raise ValueError("Media kind does not match content type.")
        return self


class PropertyMediaUploadResponse(BaseModel):
    object_key: str
    upload_url: str
    fields: dict[str, str]
    max_bytes: int


class SubmissionMediaAccessResponse(BaseModel):
    url: str
