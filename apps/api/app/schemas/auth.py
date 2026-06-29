"""Pydantic v2 request/response schemas for all auth endpoints."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


class RegisterInitiateRequest(BaseModel):
    first_name: Annotated[str, Field(min_length=1, max_length=100)]
    last_name: Annotated[str, Field(min_length=1, max_length=100)]
    mobile: Annotated[str, Field(pattern=r"^\+[1-9]\d{6,14}$")]
    lines: list[Literal["loans", "real_estate"]] = Field(
        min_length=1,
        description="One or both business lines to enroll in.",
    )

    @field_validator("lines")
    @classmethod
    def lines_unique(cls, v: list[str]) -> list[str]:
        if len(set(v)) != len(v):
            raise ValueError("lines must be unique")
        return v


class RegisterInitiateResponse(BaseModel):
    message: str
    sms_sent: bool
    otp_hint: str | None = None  # only in non-production when sms_sent=False


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


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------


class ForgotInitiateRequest(BaseModel):
    mobile: Annotated[str, Field(pattern=r"^\+[1-9]\d{6,14}$")]


class ForgotInitiateResponse(BaseModel):
    message: str
    sms_sent: bool
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


class ResendOtpResponse(BaseModel):
    message: str
    sms_sent: bool
    otp_hint: str | None = None


# ---------------------------------------------------------------------------
# Generic
# ---------------------------------------------------------------------------


class MessageResponse(BaseModel):
    message: str
