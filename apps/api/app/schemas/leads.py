"""Public lead-capture schemas (POST /api/v1/leads).

The write path is unauthenticated, so the schema is the first abuse gate:
tight length caps, a literal topic/origin whitelist, and the same E.164
mobile pattern the auth surface uses. `company` is a honeypot — humans never
see it (hidden input on the web form); anything non-empty marks a bot and the
route drops the write while still answering 202.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

# What a public enquiry is about. "agent" is not a business line: it lands as
# business_line NULL + requirement.topic = "agent" for triage (leads.business_line
# is immutable once set, so guessing a line here would be worse than none).
LeadTopic = Literal["loans", "real_estate", "agent"]

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
    email: EmailStr | None = None
    message: Annotated[str | None, Field(default=None, max_length=1000)] = None
    # Honeypot: hidden on the real form, so any value = automation.
    company: Annotated[str | None, Field(default=None, max_length=200)] = None

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


class PublicLeadResponse(BaseModel):
    ok: bool = True
