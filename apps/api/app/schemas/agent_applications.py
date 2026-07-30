"""Public agent-application intake schemas (POST /api/v1/agent-applications/*).

Unauthenticated write path, so the schema is the first abuse gate — same
posture as schemas/leads.py: tight length caps, Literal whitelists, E.164
mobile pattern, and a `company` honeypot on both the OTP-initiate and the
final submit call (a bot could skip straight to whichever it discovers first).

The OTP/ticket shapes mirror schemas/auth.py's Register/Forgot request and
response models on purpose — same fields, same patterns — because the
underlying service reuses services/otp.py and services/otp_delivery.py
verbatim rather than inventing a parallel OTP contract.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

AgentBusinessLine = Literal["loans", "real_estate"]

AgentDocTypeLiteral = Literal["aadhaar_front", "aadhaar_back", "pan", "photo"]

# Same content-type set as schemas/employee.DocContentTypeLiteral and
# schemas/loan_documents.LoanDocContentTypeLiteral — matches what
# components/apply-as-agent/file-field.tsx advertises.
AgentDocContentTypeLiteral = Literal["image/jpeg", "image/png", "image/webp", "application/pdf"]

_MobileField = Annotated[str, Field(pattern=r"^\+[1-9]\d{6,14}$")]
_HoneypotField = Annotated[str | None, Field(default=None, max_length=200)]


class AgentApplyOtpInitiateRequest(BaseModel):
    mobile: _MobileField
    company: _HoneypotField = None


class AgentApplyOtpInitiateResponse(BaseModel):
    message: str
    delivery_channel: Literal["voice", "email", "none"]
    otp_hint: str | None = None  # non-production only, same gate as auth


class AgentApplyOtpResendRequest(BaseModel):
    mobile: _MobileField


class AgentApplyOtpVerifyRequest(BaseModel):
    mobile: _MobileField
    otp: Annotated[str, Field(pattern=r"^\d{6}$")]


class AgentApplyTicketResponse(BaseModel):
    application_ticket: str
    expires_in: int  # seconds remaining on the ticket, drives the FE countdown


class AgentApplyUploadPresignRequest(BaseModel):
    application_ticket: str
    doc_type: AgentDocTypeLiteral
    content_type: AgentDocContentTypeLiteral


class AgentApplyUploadPresignResponse(BaseModel):
    object_key: str
    upload_url: str
    fields: dict[str, str]
    max_bytes: int


class AgentApplicationSubmitRequest(BaseModel):
    # No `mobile` field, deliberately: the number comes only from the ticket,
    # so a caller can never bind an application to a number they did not prove
    # control of via OTP.
    application_ticket: str
    first_name: Annotated[str, Field(min_length=1, max_length=100)]
    last_name: Annotated[str, Field(min_length=1, max_length=100)]
    email: EmailStr
    business_line: AgentBusinessLine
    rera_code: Annotated[str | None, Field(default=None, max_length=64)] = None
    aadhaar_front_key: Annotated[str, Field(max_length=200)]
    aadhaar_back_key: Annotated[str, Field(max_length=200)]
    pan_key: Annotated[str, Field(max_length=200)]
    photo_key: Annotated[str, Field(max_length=200)]
    company: _HoneypotField = None

    @field_validator("first_name", "last_name", "rera_code")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return v.strip() if isinstance(v, str) else v

    @field_validator("email")
    @classmethod
    def _email_normalize(cls, v: str) -> str:
        return v.strip().lower()

    @model_validator(mode="after")
    def _rera_required_for_real_estate(self) -> AgentApplicationSubmitRequest:
        # Mirrors the FE's own fieldError('rera', ...) rule
        # (agent-application-form.tsx) — enforced again server-side since this
        # is a public, unauthenticated endpoint.
        if self.business_line == "real_estate" and not self.rera_code:
            raise ValueError("RERA code is required for real estate applications.")
        return self


class AgentApplicationSubmitResponse(BaseModel):
    ok: bool = True
