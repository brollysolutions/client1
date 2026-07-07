"""Pydantic v2 request/response schemas for all auth endpoints."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

# Channel an OTP was actually delivered through. "none" = all channels mocked/failed
# (dev only — the response then carries otp_hint in non-production).
DeliveryChannel = Literal["voice", "email", "none"]

# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


class RegisterInitiateRequest(BaseModel):
    first_name: Annotated[str, Field(min_length=1, max_length=100)]
    last_name: Annotated[str, Field(min_length=1, max_length=100)]
    mobile: Annotated[str, Field(pattern=r"^\+[1-9]\d{6,14}$")]
    email: EmailStr  # mandatory + unique; OTP fallback channel + post-login 2FA target
    # No line picker: every client is enrolled in both loans and real_estate at
    # signup (one User, two ClientProfiles). See docs/specs/dual-line-clients.md.

    @field_validator("email")
    @classmethod
    def email_normalize(cls, v: str) -> str:
        return v.strip().lower()


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
    via_email: bool = False  # recovery: "didn't get the call? email my code"


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
    email: str
    email_verified: bool
    # One summary per business line the client holds (both, for self-registered
    # clients). The dashboard switches between these.
    profiles: list[ClientProfileSummary]
