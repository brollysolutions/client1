"""Pydantic v2 request/response schemas for all auth endpoints."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.core.security import REFERRAL_CODE_RE, normalize_referral_code

# Channel an OTP was actually delivered through. "none" = all channels mocked/failed
# (dev only — the response then carries otp_hint in non-production).
DeliveryChannel = Literal["voice", "email", "none"]
ServiceLine = Literal["loans", "real_estate"]

# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


class RegisterInitiateRequest(BaseModel):
    first_name: Annotated[str, Field(min_length=1, max_length=100)]
    last_name: Annotated[str, Field(min_length=1, max_length=100)]
    mobile: Annotated[str, Field(pattern=r"^\+[1-9]\d{6,14}$")]
    # This is follow-up intent, not profile enrollment: every Client still gets
    # both line profiles under CS-001. The default preserves older callers that
    # predate the explicit intent field.
    service_lines: list[ServiceLine] = Field(
        default_factory=lambda: ["loans"], min_length=1, max_length=2
    )
    # Format-validated only — whether it matches a real referral code is never
    # checked here (docs/specs/referral-program.md D4): that would turn this
    # public endpoint into a code-existence oracle. An unmatched code is
    # silently ignored later in register_set_password.
    referral_code: str | None = None

    @field_validator("service_lines")
    @classmethod
    def service_lines_are_unique(cls, v: list[ServiceLine]) -> list[ServiceLine]:
        if len(set(v)) != len(v):
            raise ValueError("Choose each service line at most once.")
        return sorted(v)

    @field_validator("referral_code")
    @classmethod
    def referral_code_format(cls, v: str | None) -> str | None:
        normalized = normalize_referral_code(v)
        if normalized is None:
            return None
        if not REFERRAL_CODE_RE.match(normalized):
            raise ValueError("Invalid referral code.")
        return normalized


class RegisterInitiateResponse(BaseModel):
    message: str
    delivery_channel: DeliveryChannel
    otp_hint: str | None = None  # only in non-production when delivery_channel == "none"


class RegisterVerifyOtpRequest(BaseModel):
    mobile: Annotated[str, Field(pattern=r"^\+[1-9]\d{6,14}$")]
    otp: Annotated[str, Field(pattern=r"^\d{6}$")]


class RegistrationTokenResponse(BaseModel):
    registration_token: str


class SetPasswordRequest(BaseModel):
    registration_token: str
    password: Annotated[str, Field(min_length=8, max_length=128)]
    confirm_password: str

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, v: str, info: object) -> str:
        data = getattr(info, "data", {})
        if "password" in data and v != data["password"]:
            raise ValueError("Passwords do not match")
        return v


# ---------------------------------------------------------------------------
# Login & session
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    mobile: Annotated[str, Field(pattern=r"^\+[1-9]\d{6,14}$")]
    password: Annotated[str, Field(min_length=1, max_length=128)]


class AuthTokensResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds
    phone_verified: bool = False
    email_verified: bool = False  # drives the post-login "verify your email" banner


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------


class ForgotInitiateRequest(BaseModel):
    mobile: Annotated[str, Field(pattern=r"^\+[1-9]\d{6,14}$")]


class ForgotInitiateResponse(BaseModel):
    message: str
    delivery_channel: DeliveryChannel
    otp_hint: str | None = None


class ForgotVerifyRequest(BaseModel):
    mobile: Annotated[str, Field(pattern=r"^\+[1-9]\d{6,14}$")]
    otp: Annotated[str, Field(pattern=r"^\d{6}$")]


class ResetTokenResponse(BaseModel):
    reset_token: str


class ResetPasswordRequest(BaseModel):
    reset_token: str
    new_password: Annotated[str, Field(min_length=8, max_length=128)]
    confirm_password: str

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, v: str, info: object) -> str:
        data = getattr(info, "data", {})
        if "new_password" in data and v != data["new_password"]:
            raise ValueError("Passwords do not match")
        return v


class ChangePasswordRequest(BaseModel):
    current_password: Annotated[str, Field(min_length=1, max_length=128)]
    new_password: Annotated[str, Field(min_length=8, max_length=128)]
    confirm_password: str

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, v: str, info: object) -> str:
        data = getattr(info, "data", {})
        if "new_password" in data and v != data["new_password"]:
            raise ValueError("Passwords do not match")
        return v


# ---------------------------------------------------------------------------
# OTP utility
# ---------------------------------------------------------------------------


class ResendOtpRequest(BaseModel):
    mobile: Annotated[str, Field(pattern=r"^\+[1-9]\d{6,14}$")]
    purpose: Literal["register", "reset"]
    via_email: bool = False  # reset only: explicitly use the verified account email


class ResendOtpResponse(BaseModel):
    message: str
    delivery_channel: DeliveryChannel
    otp_hint: str | None = None


# ---------------------------------------------------------------------------
# Email verification (post-login soft 2FA)
# ---------------------------------------------------------------------------


class EmailVerifyInitiateResponse(BaseModel):
    message: str
    delivery_channel: DeliveryChannel
    otp_hint: str | None = None


class EmailVerifyConfirmRequest(BaseModel):
    otp: Annotated[str, Field(pattern=r"^\d{6}$")]


# ---------------------------------------------------------------------------
# Generic
# ---------------------------------------------------------------------------


class MessageResponse(BaseModel):
    message: str


class AccountDeleteRequest(BaseModel):
    """Re-confirmation for self-service deletion — same bar as change-password:
    the caller already holds a live session, so password re-entry proves
    intent at equal strength without a new OTP purpose."""

    current_password: Annotated[str, Field(min_length=1, max_length=128)]


# ---------------------------------------------------------------------------
# Current user (dashboard)
# ---------------------------------------------------------------------------


class ClientProfileSummary(BaseModel):
    business_line: Literal["loans", "real_estate"]
    customer_code: str


class MeResponse(BaseModel):
    first_name: str
    last_name: str
    mobile: str
    email: str | None
    email_verified: bool
    gender: Literal["female", "male", "non_binary", "self_described", "prefer_not_to_say"] | None
    gender_self_description: str | None
    income_source: Literal["salaried", "business_income"] | None
    income_amount_minor: int | None
    income_period: Literal["monthly", "annual"] | None
    occupation: str | None
    location: str | None
    # One summary per business line the client holds (both, for self-registered
    # clients). The dashboard switches between these.
    profiles: list[ClientProfileSummary]


class MeUpdateRequest(BaseModel):
    """Client edit of their own profile. mobile is immutable (account identity)."""

    first_name: Annotated[str, Field(min_length=1, max_length=100)]
    last_name: Annotated[str, Field(min_length=1, max_length=100)]
    # Omit to leave unchanged; send null to clear. A change resets verification.
    email: EmailStr | None = None
    gender: (
        Literal["female", "male", "non_binary", "self_described", "prefer_not_to_say"] | None
    ) = None
    gender_self_description: Annotated[str | None, Field(min_length=1, max_length=100)] = None
    income_source: Literal["salaried", "business_income"] | None = None
    income_amount_minor: Annotated[int | None, Field(ge=1, le=1_000_000_000_000)] = None
    income_period: Literal["monthly", "annual"] | None = None
    occupation: Annotated[str | None, Field(min_length=1, max_length=120)] = None
    location: Annotated[str | None, Field(min_length=1, max_length=500)] = None

    @field_validator("first_name", "last_name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("This field cannot be blank.")
        return v

    @field_validator("email")
    @classmethod
    def email_normalize(cls, v: str | None) -> str | None:
        return v.strip().lower() if v else v

    @field_validator("gender_self_description", "occupation", "location")
    @classmethod
    def optional_text_not_blank(cls, v: str | None) -> str | None:
        if v is None:
            return None
        value = v.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value

    @model_validator(mode="after")
    def optional_groups_consistent(self) -> MeUpdateRequest:
        fields = self.model_fields_set
        gender_fields = {"gender", "gender_self_description"}
        if fields & gender_fields:
            if "gender_self_description" in fields and "gender" not in fields:
                raise ValueError("Gender must be supplied with its description.")
            if self.gender == "self_described" and not self.gender_self_description:
                raise ValueError("Describe your gender when self-described is selected.")
            if self.gender != "self_described" and self.gender_self_description is not None:
                raise ValueError("A gender description is only valid for self-described gender.")

        income_fields = {"income_source", "income_amount_minor", "income_period"}
        if fields & income_fields:
            if not income_fields.issubset(fields):
                raise ValueError("Income source, amount, and period must be supplied together.")
            values = (self.income_source, self.income_amount_minor, self.income_period)
            partially_supplied = any(value is not None for value in values) and any(
                value is None for value in values
            )
            if partially_supplied:
                raise ValueError("Income source, amount, and period must be supplied together.")
        return self
