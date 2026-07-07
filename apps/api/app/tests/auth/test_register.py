"""Registration flow integration tests.

Covers POST /auth/register/initiate, /register/verify-otp, /register/set-password.
Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

from httpx import AsyncClient

from app.core.config import settings
from conftest import (
    PASSWORD,
    do_login,
    full_registration,
    initiate_and_get_otp,
    unique_email,
    unique_mobile,
)


def _payload(**overrides) -> dict:
    """A valid register/initiate body; override any field per test."""
    body = {
        "first_name": "Test",
        "last_name": "User",
        "mobile": unique_mobile(),
        "email": unique_email(),
        "lines": ["loans"],
    }
    body.update(overrides)
    return body


# ---------------------------------------------------------------------------
# POST /auth/register/initiate
# ---------------------------------------------------------------------------


async def test_register_initiate_loans_returns_otp_hint(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/register/initiate", json=_payload(lines=["loans"]))
    assert resp.status_code == 200
    body = resp.json()
    assert body["delivery_channel"] == "none"  # mock mode: no voice/email creds
    assert "otp_hint" in body
    assert len(body["otp_hint"]) == 6


async def test_register_initiate_real_estate_returns_otp_hint(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/register/initiate", json=_payload(lines=["real_estate"]))
    assert resp.status_code == 200
    assert resp.json()["otp_hint"] is not None


async def test_register_initiate_otp_is_6_numeric_digits(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/register/initiate", json=_payload())
    otp = resp.json()["otp_hint"]
    assert len(otp) == 6 and otp.isdigit()


async def test_register_initiate_response_shape(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/register/initiate", json=_payload())
    body = resp.json()
    assert "message" in body and "delivery_channel" in body and "otp_hint" in body


async def test_register_initiate_first_name_100_chars_valid(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/register/initiate", json=_payload(first_name="A" * 100))
    assert resp.status_code == 200


# -- email validation (new: mandatory + unique) --


async def test_register_initiate_missing_email_returns_422(client: AsyncClient) -> None:
    body = _payload()
    del body["email"]
    resp = await client.post("/api/v1/auth/register/initiate", json=body)
    assert resp.status_code == 422


async def test_register_initiate_invalid_email_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/register/initiate", json=_payload(email="not-an-email"))
    assert resp.status_code == 422


async def test_register_initiate_duplicate_email_returns_400(client: AsyncClient) -> None:
    email = unique_email()
    await full_registration(client, email=email)
    resp = await client.post("/api/v1/auth/register/initiate", json=_payload(email=email))
    assert resp.status_code == 400


# -- mobile / lines validation --


async def test_register_initiate_mobile_without_plus_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/register/initiate", json=_payload(mobile="9876543210"))
    assert resp.status_code == 422


async def test_register_initiate_mobile_too_short_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/register/initiate", json=_payload(mobile="+91123"))
    assert resp.status_code == 422


async def test_register_initiate_mobile_with_letters_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/register/initiate", json=_payload(mobile="+91ABCD12345"))
    assert resp.status_code == 422


async def test_register_initiate_first_name_empty_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/register/initiate", json=_payload(first_name=""))
    assert resp.status_code == 422


async def test_register_initiate_first_name_too_long_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/register/initiate", json=_payload(first_name="A" * 101))
    assert resp.status_code == 422


async def test_register_initiate_last_name_empty_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/register/initiate", json=_payload(last_name=""))
    assert resp.status_code == 422


async def test_register_initiate_last_name_too_long_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/register/initiate", json=_payload(last_name="B" * 101))
    assert resp.status_code == 422


async def test_register_initiate_missing_first_name_returns_422(client: AsyncClient) -> None:
    body = _payload()
    del body["first_name"]
    resp = await client.post("/api/v1/auth/register/initiate", json=body)
    assert resp.status_code == 422


async def test_register_initiate_missing_last_name_returns_422(client: AsyncClient) -> None:
    body = _payload()
    del body["last_name"]
    resp = await client.post("/api/v1/auth/register/initiate", json=body)
    assert resp.status_code == 422


async def test_register_initiate_missing_mobile_returns_422(client: AsyncClient) -> None:
    body = _payload()
    del body["mobile"]
    resp = await client.post("/api/v1/auth/register/initiate", json=body)
    assert resp.status_code == 422


async def test_register_initiate_duplicate_mobile_returns_400(client: AsyncClient) -> None:
    mobile = unique_mobile()
    await full_registration(client, mobile)
    resp = await client.post("/api/v1/auth/register/initiate", json=_payload(mobile=mobile))
    assert resp.status_code == 400


async def test_register_initiate_daily_rate_limit_429_on_sixth(client: AsyncClient) -> None:
    mobile = unique_mobile()
    # Same mobile each call (rate key is per-mobile); unique email each call.
    for _ in range(5):
        await client.post(
            "/api/v1/auth/register/initiate", json=_payload(mobile=mobile, email=unique_email())
        )
    resp = await client.post(
        "/api/v1/auth/register/initiate", json=_payload(mobile=mobile, email=unique_email())
    )
    assert resp.status_code == 429


# ---------------------------------------------------------------------------
# POST /auth/register/verify-otp
# ---------------------------------------------------------------------------


async def test_register_verify_correct_otp_returns_token(client: AsyncClient) -> None:
    mobile = unique_mobile()
    otp = await initiate_and_get_otp(client, mobile)
    resp = await client.post(
        "/api/v1/auth/register/verify-otp", json={"mobile": mobile, "otp": otp}
    )
    assert resp.status_code == 200
    assert resp.json()["registration_token"]


async def test_register_verify_token_is_non_empty_string(client: AsyncClient) -> None:
    mobile = unique_mobile()
    otp = await initiate_and_get_otp(client, mobile)
    resp = await client.post(
        "/api/v1/auth/register/verify-otp", json={"mobile": mobile, "otp": otp}
    )
    token = resp.json()["registration_token"]
    assert isinstance(token, str) and len(token) > 10


async def test_register_verify_wrong_otp_returns_400(client: AsyncClient) -> None:
    mobile = unique_mobile()
    await initiate_and_get_otp(client, mobile)
    resp = await client.post(
        "/api/v1/auth/register/verify-otp", json={"mobile": mobile, "otp": "000000"}
    )
    assert resp.status_code == 400


async def test_register_verify_uninitiated_mobile_returns_400(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/register/verify-otp",
        json={"mobile": unique_mobile(), "otp": "123456"},
    )
    assert resp.status_code == 400


async def test_register_verify_otp_less_than_6_digits_returns_422(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/register/verify-otp",
        json={"mobile": unique_mobile(), "otp": "12345"},
    )
    assert resp.status_code == 422


async def test_register_verify_otp_more_than_6_digits_returns_422(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/register/verify-otp",
        json={"mobile": unique_mobile(), "otp": "1234567"},
    )
    assert resp.status_code == 422


async def test_register_verify_non_numeric_otp_returns_422(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/register/verify-otp",
        json={"mobile": unique_mobile(), "otp": "abcdef"},
    )
    assert resp.status_code == 422


async def test_register_verify_invalid_mobile_format_returns_422(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/register/verify-otp",
        json={"mobile": "9876543210", "otp": "123456"},
    )
    assert resp.status_code == 422


async def test_register_verify_missing_mobile_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/register/verify-otp", json={"otp": "123456"})
    assert resp.status_code == 422


async def test_register_verify_missing_otp_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/register/verify-otp", json={"mobile": unique_mobile()})
    assert resp.status_code == 422


async def test_register_verify_five_wrong_otps_exhausts_attempts(client: AsyncClient) -> None:
    mobile = unique_mobile()
    await initiate_and_get_otp(client, mobile)
    for _ in range(5):
        await client.post(
            "/api/v1/auth/register/verify-otp", json={"mobile": mobile, "otp": "000000"}
        )
    resp = await client.post(
        "/api/v1/auth/register/verify-otp", json={"mobile": mobile, "otp": "000000"}
    )
    assert resp.status_code == 400


async def test_register_verify_correct_before_exhaustion_succeeds(client: AsyncClient) -> None:
    """Correct OTP on the last attempt (one before max) must still succeed."""
    mobile = unique_mobile()
    otp = await initiate_and_get_otp(client, mobile)
    for _ in range(settings.OTP_MAX_ATTEMPTS - 1):
        await client.post(
            "/api/v1/auth/register/verify-otp", json={"mobile": mobile, "otp": "000000"}
        )
    resp = await client.post(
        "/api/v1/auth/register/verify-otp", json={"mobile": mobile, "otp": otp}
    )
    assert resp.status_code == 200


async def test_register_verify_otp_replay_fails_on_second_use(client: AsyncClient) -> None:
    mobile = unique_mobile()
    otp = await initiate_and_get_otp(client, mobile)
    await client.post("/api/v1/auth/register/verify-otp", json={"mobile": mobile, "otp": otp})
    resp = await client.post(
        "/api/v1/auth/register/verify-otp", json={"mobile": mobile, "otp": otp}
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# POST /auth/register/set-password
# ---------------------------------------------------------------------------


async def _get_reg_token(client: AsyncClient, mobile: str, lines: list[str] | None = None) -> str:
    otp = await initiate_and_get_otp(client, mobile, lines)
    resp = await client.post(
        "/api/v1/auth/register/verify-otp", json={"mobile": mobile, "otp": otp}
    )
    return resp.json()["registration_token"]


async def test_set_password_valid_token_returns_201(client: AsyncClient) -> None:
    mobile = unique_mobile()
    token = await _get_reg_token(client, mobile)
    resp = await client.post(
        "/api/v1/auth/register/set-password",
        json={"registration_token": token, "password": PASSWORD, "confirm_password": PASSWORD},
    )
    assert resp.status_code == 201
    assert resp.json()["access_token"]


async def test_set_password_stamps_phone_verified_email_unverified(client: AsyncClient) -> None:
    """After signup: mobile is verified (voice/OTP), email verification is deferred."""
    _, mobile = await full_registration(client)
    resp = await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    body = resp.json()
    assert body["phone_verified"] is True
    assert body["email_verified"] is False


async def test_set_password_refresh_cookie_set(client: AsyncClient) -> None:
    mobile = unique_mobile()
    token = await _get_reg_token(client, mobile)
    resp = await client.post(
        "/api/v1/auth/register/set-password",
        json={"registration_token": token, "password": PASSWORD, "confirm_password": PASSWORD},
    )
    assert resp.status_code == 201
    assert "refresh_token" in resp.cookies or "set-cookie" in {k.lower() for k in resp.headers}


async def test_set_password_mismatch_returns_422(client: AsyncClient) -> None:
    mobile = unique_mobile()
    token = await _get_reg_token(client, mobile)
    resp = await client.post(
        "/api/v1/auth/register/set-password",
        json={"registration_token": token, "password": PASSWORD, "confirm_password": "Different@9"},
    )
    assert resp.status_code == 422


async def test_set_password_7_chars_too_short_returns_422(client: AsyncClient) -> None:
    mobile = unique_mobile()
    token = await _get_reg_token(client, mobile)
    resp = await client.post(
        "/api/v1/auth/register/set-password",
        json={"registration_token": token, "password": "Aa1234!", "confirm_password": "Aa1234!"},
    )
    assert resp.status_code == 422


async def test_set_password_8_chars_boundary_valid(client: AsyncClient) -> None:
    mobile = unique_mobile()
    token = await _get_reg_token(client, mobile)
    pw = "Aa12345!"
    resp = await client.post(
        "/api/v1/auth/register/set-password",
        json={"registration_token": token, "password": pw, "confirm_password": pw},
    )
    assert resp.status_code == 201


async def test_set_password_129_chars_too_long_returns_422(client: AsyncClient) -> None:
    mobile = unique_mobile()
    token = await _get_reg_token(client, mobile)
    pw = "A1" + "x" * 127
    resp = await client.post(
        "/api/v1/auth/register/set-password",
        json={"registration_token": token, "password": pw, "confirm_password": pw},
    )
    assert resp.status_code == 422


async def test_set_password_128_chars_boundary_valid(client: AsyncClient) -> None:
    mobile = unique_mobile()
    token = await _get_reg_token(client, mobile)
    pw = "A1" + "x" * 126
    resp = await client.post(
        "/api/v1/auth/register/set-password",
        json={"registration_token": token, "password": pw, "confirm_password": pw},
    )
    assert resp.status_code == 201


async def test_set_password_no_digits_returns_422(client: AsyncClient) -> None:
    mobile = unique_mobile()
    token = await _get_reg_token(client, mobile)
    resp = await client.post(
        "/api/v1/auth/register/set-password",
        json={
            "registration_token": token,
            "password": "NoDigitsHere!",
            "confirm_password": "NoDigitsHere!",
        },
    )
    assert resp.status_code == 422


async def test_set_password_no_letters_returns_422(client: AsyncClient) -> None:
    mobile = unique_mobile()
    token = await _get_reg_token(client, mobile)
    resp = await client.post(
        "/api/v1/auth/register/set-password",
        json={"registration_token": token, "password": "12345678", "confirm_password": "12345678"},
    )
    assert resp.status_code == 422


async def test_set_password_common_password_returns_422(client: AsyncClient) -> None:
    mobile = unique_mobile()
    token = await _get_reg_token(client, mobile)
    resp = await client.post(
        "/api/v1/auth/register/set-password",
        json={
            "registration_token": token,
            "password": "Password1",
            "confirm_password": "Password1",
        },
    )
    assert resp.status_code == 422


async def test_set_password_malformed_token_returns_400(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/register/set-password",
        json={
            "registration_token": "garbage.token.value",
            "password": PASSWORD,
            "confirm_password": PASSWORD,
        },
    )
    assert resp.status_code == 400


async def test_set_password_missing_token_returns_422(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/register/set-password",
        json={"password": PASSWORD, "confirm_password": PASSWORD},
    )
    assert resp.status_code == 422


async def test_set_password_missing_password_returns_422(client: AsyncClient) -> None:
    mobile = unique_mobile()
    token = await _get_reg_token(client, mobile)
    resp = await client.post(
        "/api/v1/auth/register/set-password",
        json={"registration_token": token, "confirm_password": PASSWORD},
    )
    assert resp.status_code == 422


async def test_set_password_missing_confirm_returns_422(client: AsyncClient) -> None:
    mobile = unique_mobile()
    token = await _get_reg_token(client, mobile)
    resp = await client.post(
        "/api/v1/auth/register/set-password",
        json={"registration_token": token, "password": PASSWORD},
    )
    assert resp.status_code == 422


async def test_register_creates_both_line_profiles(client: AsyncClient) -> None:
    """Every self-registered client gets both loans + real_estate profiles, each
    with its own customer_code (docs/specs/dual-line-clients.md)."""
    access, _mobile = await full_registration(client)
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert me.status_code == 200
    profiles = me.json()["profiles"]
    assert sorted(p["business_line"] for p in profiles) == ["loans", "real_estate"]
    codes = [p["customer_code"] for p in profiles]
    assert len(set(codes)) == 2  # distinct code per line
    assert all(c for c in codes)


async def test_me_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


async def test_client_access_token_carries_both_line_claims(client: AsyncClient) -> None:
    """A dual-line client's JWT resolves role=client, business_line=both, so the
    RLS session context is populated (not the old placeholder). See
    docs/adr/ dual-line + role-claim resolution."""
    from app.core.security import decode_access_token

    access, _mobile = await full_registration(client)
    claims = decode_access_token(access)
    assert claims["role"] == "client"
    assert claims["business_line"] == "both"
    assert claims["platform_scope"] == "false"


async def test_set_password_custom_name_propagated(client: AsyncClient) -> None:
    """Regression: first_name/last_name must be stored via Redis and embedded in JWT."""
    mobile = unique_mobile()
    resp = await client.post(
        "/api/v1/auth/register/initiate",
        json=_payload(first_name="Mahesh", last_name="Kumar", mobile=mobile),
    )
    otp = resp.json()["otp_hint"]
    verify_resp = await client.post(
        "/api/v1/auth/register/verify-otp", json={"mobile": mobile, "otp": otp}
    )
    token = verify_resp.json()["registration_token"]
    set_resp = await client.post(
        "/api/v1/auth/register/set-password",
        json={"registration_token": token, "password": PASSWORD, "confirm_password": PASSWORD},
    )
    assert set_resp.status_code == 201
    # And the new user can log in with their password (OTP not used for login).
    await do_login(client, mobile)
