"""Wire contract for support-assisted mobile-number changes."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.mobile_change import (
    MobileChangeProof,
    MobileChangeSource,
    MobileChangeStatus,
)
from app.schemas.auth import DeliveryChannel

E164Mobile = Annotated[str, Field(pattern=r"^\+[1-9]\d{6,14}$")]


def _normalize_pii_free(value: str) -> str:
    value = " ".join(value.split())
    if re.search(r"\+?\d[\d\s-]{6,}", value) or "@" in value:
        raise ValueError("Use PII-free operational text only.")
    return value


class MobileChangePublicInitiateRequest(BaseModel):
    current_mobile: E164Mobile
    requested_mobile: E164Mobile
    company: Annotated[str, Field(max_length=200)] = ""  # honeypot

    @field_validator("requested_mobile")
    @classmethod
    def numbers_must_differ(cls, value: str, info: object) -> str:
        current = getattr(info, "data", {}).get("current_mobile")
        if current == value:
            raise ValueError("The replacement number must be different.")
        return value


class MobileChangeAuthenticatedInitiateRequest(BaseModel):
    requested_mobile: E164Mobile
    current_password: Annotated[str, Field(min_length=1, max_length=128)]


class MobileChangeChallengeResponse(BaseModel):
    message: str
    challenge_token: str
    delivery_channel: DeliveryChannel
    otp_hint: str | None = None


class MobileChangeResendRequest(BaseModel):
    challenge_token: str


class MobileChangeVerifyOtpRequest(BaseModel):
    challenge_token: str
    otp: Annotated[str, Field(pattern=r"^\d{6}$")]


class MobileChangeAdminVerifyRequest(BaseModel):
    proof_method: MobileChangeProof
    proof_attestation: Annotated[str, Field(min_length=3, max_length=300)]
    current_password: Annotated[str, Field(min_length=1, max_length=128)]

    @field_validator("proof_attestation")
    @classmethod
    def attestation_is_operational_reference(cls, value: str) -> str:
        # The field is deliberately not an escape hatch for contact details or
        # KYC numbers.  It stores an internal visit/HR/case reference only.
        return _normalize_pii_free(value)


class MobileChangeAdminCompleteRequest(BaseModel):
    current_password: Annotated[str, Field(min_length=1, max_length=128)]


class MobileChangeAdminRejectRequest(BaseModel):
    reason: Annotated[str, Field(min_length=3, max_length=500)]
    current_password: Annotated[str, Field(min_length=1, max_length=128)]

    @field_validator("reason")
    @classmethod
    def reason_not_blank(cls, value: str) -> str:
        return _normalize_pii_free(value)


class MobileChangeAdminRead(BaseModel):
    id: UUID
    auth_user_uuid: UUID
    support_ticket_uuid: UUID
    source: MobileChangeSource
    status: MobileChangeStatus
    current_mobile: str | None
    requested_mobile: str | None
    requester_name: str
    requester_role: str
    proof_method: MobileChangeProof | None
    proof_attestation: str | None
    verified_by_name: str | None
    conflicts: list[str]
    expires_at: datetime
    created_at: datetime
    updated_at: datetime


class MobileChangeAdminListResponse(BaseModel):
    requests: list[MobileChangeAdminRead]
