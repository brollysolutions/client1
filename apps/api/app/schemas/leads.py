"""Public lead-capture schemas (POST /api/v1/leads).

The write path is unauthenticated, so the schema is the first abuse gate:
tight length caps, a literal topic/origin whitelist, and the same E.164
mobile pattern the auth surface uses. `company` is a honeypot — humans never
see it (hidden input on the web form); anything non-empty marks a bot and the
route drops the write while still answering 202.
"""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

# Public sales enquiries must name one operational business line. Partner
# applications use their dedicated OTP/KYC flow and already choose a line.
LeadTopic = Literal["loans", "real_estate"]

# Origin page slug (contact, product-card, calculator-emi, ...). The web lib
# mints one per surface, so a Literal would drift every time a page ships; a
# tight slug pattern keeps the public JSONB write bounded without an enum.
LeadPage = Annotated[str, Field(pattern=r"^[a-z0-9-]{2,40}$")]


class PublicLeadCreate(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=100)]
    mobile: Annotated[str, Field(pattern=r"^\+[1-9]\d{6,14}$")]
    topic: LeadTopic
    origin: LeadPage
    product: Annotated[str | None, Field(default=None, max_length=120)] = None
    property_ref: UUID | None = None
    email: EmailStr | None = None
    message: Annotated[str | None, Field(default=None, max_length=1000)] = None
    # Honeypot: hidden on the real form, so any value = automation.
    company: Annotated[str | None, Field(default=None, max_length=200)] = None
    invitation_token: Annotated[str | None, Field(default=None, min_length=32, max_length=128)] = (
        None
    )

    @field_validator("name", "product", "message")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return v.strip() if isinstance(v, str) else v

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, v: str) -> str:
        if not v:
            raise ValueError("Name cannot be blank.")
        return v

    @model_validator(mode="after")
    def _property_requires_real_estate(self) -> PublicLeadCreate:
        if self.property_ref is not None and self.topic != "real_estate":
            raise ValueError("A property reference requires the real-estate topic.")
        return self


class PublicLeadResponse(BaseModel):
    ok: bool = True
