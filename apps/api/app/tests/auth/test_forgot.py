"""Forgot-password flow integration tests.

Covers POST /auth/forgot/initiate, /forgot/verify, /forgot/reset.
Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

from httpx import AsyncClient

from app.core.security import decode_access_token
from app.schemas.auth import ForgotVerifyRequest
from app.services import auth_service
from conftest import PASSWORD, full_registration, initiate_and_get_otp, unique_mobile

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _initiate_forgot(client: AsyncClient, mobile: str) -> str | None:
    resp = await client.post("/api/v1/auth/forgot/initiate", json={"mobile": mobile})
    assert resp.status_code == 200
    return resp.json().get("otp_hint")


async def _full_forgot_flow(client: AsyncClient, mobile: str) -> str:
    otp = await _initiate_forgot(client, mobile)
    assert otp, "otp_hint missing — is ENV set to development?"
    resp = await client.post("/api/v1/auth/forgot/verify", json={"mobile": mobile, "otp": otp})
    assert resp.status_code == 200
    return resp.json()["reset_token"]


async def _set_user_status(mobile: str, user_status: str) -> None:
    from sqlalchemy import text

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(
            text(
                "UPDATE auth_users SET status = CAST(:status AS status_enum) WHERE mobile = :mobile"
            ),
            {"status": user_status, "mobile": mobile},
        )
        await db.commit()


# ---------------------------------------------------------------------------
# POST /auth/forgot/initiate
# ---------------------------------------------------------------------------


async def test_forgot_initiate_known_mobile_returns_200(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    resp = await client.post("/api/v1/auth/forgot/initiate", json={"mobile": mobile})
    assert resp.status_code == 200
    body = resp.json()
    assert body["delivery_channel"] == "none"
    assert body["otp_hint"] and len(body["otp_hint"]) == 6


async def test_forgot_initiate_unknown_mobile_returns_200(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/forgot/initiate", json={"mobile": unique_mobile()})
    assert resp.status_code == 200


async def test_forgot_initiate_known_and_unknown_same_message(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    known = await client.post("/api/v1/auth/forgot/initiate", json={"mobile": mobile})
    unknown = await client.post("/api/v1/auth/forgot/initiate", json={"mobile": unique_mobile()})
    assert known.json()["message"] == unknown.json()["message"]
    assert known.json()["delivery_channel"] == unknown.json()["delivery_channel"] == "none"


async def test_forgot_initiate_suspended_account_is_neutral_and_sends_nothing(
    client: AsyncClient, monkeypatch
) -> None:
    _, mobile = await full_registration(client)
    await _set_user_status(mobile, "suspended")
    deliveries: list[str] = []

    async def _record_delivery(**kwargs) -> None:
        deliveries.append(kwargs["mobile"])

    from app.services import auth_service

    monkeypatch.setattr(auth_service, "_deliver_reset_otp_and_log", _record_delivery)
    suspended = await client.post("/api/v1/auth/forgot/initiate", json={"mobile": mobile})
    unknown = await client.post("/api/v1/auth/forgot/initiate", json={"mobile": unique_mobile()})

    assert suspended.status_code == unknown.status_code == 200
    assert suspended.json()["message"] == unknown.json()["message"]
    assert suspended.json()["delivery_channel"] == unknown.json()["delivery_channel"] == "none"
    assert deliveries == []


async def test_forgot_verify_known_and_unknown_fail_with_same_detail(client: AsyncClient) -> None:
    _, known_mobile = await full_registration(client)
    await client.post("/api/v1/auth/forgot/initiate", json={"mobile": known_mobile})
    unknown_mobile = unique_mobile()

    known = await client.post(
        "/api/v1/auth/forgot/verify",
        json={"mobile": known_mobile, "otp": "000000"},
    )
    unknown = await client.post(
        "/api/v1/auth/forgot/verify",
        json={"mobile": unknown_mobile, "otp": "000000"},
    )

    assert known.status_code == unknown.status_code == 400
    assert known.json()["detail"] == unknown.json()["detail"]


async def test_forgot_initiate_otp_hint_is_6_numeric_digits(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    resp = await client.post("/api/v1/auth/forgot/initiate", json={"mobile": mobile})
    otp = resp.json()["otp_hint"]
    assert len(otp) == 6 and otp.isdigit()


async def test_forgot_initiate_channel_none_mock_mode(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    resp = await client.post("/api/v1/auth/forgot/initiate", json={"mobile": mobile})
    assert resp.json()["delivery_channel"] == "none"


async def test_forgot_initiate_response_shape(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    resp = await client.post("/api/v1/auth/forgot/initiate", json={"mobile": mobile})
    body = resp.json()
    assert "message" in body and "delivery_channel" in body and "otp_hint" in body


async def test_forgot_initiate_invalid_mobile_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/forgot/initiate", json={"mobile": "9876543210"})
    assert resp.status_code == 422


async def test_forgot_initiate_missing_mobile_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/forgot/initiate", json={})
    assert resp.status_code == 422


async def test_forgot_initiate_daily_rate_limit_blocks_sixth(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    for _ in range(5):
        await client.post("/api/v1/auth/forgot/initiate", json={"mobile": mobile})
    resp = await client.post("/api/v1/auth/forgot/initiate", json={"mobile": mobile})
    assert resp.status_code == 429


# ---------------------------------------------------------------------------
# POST /auth/forgot/verify
# ---------------------------------------------------------------------------


async def test_forgot_verify_correct_otp_returns_reset_token(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    otp = await _initiate_forgot(client, mobile)
    resp = await client.post("/api/v1/auth/forgot/verify", json={"mobile": mobile, "otp": otp})
    assert resp.status_code == 200
    assert resp.json()["reset_token"]


async def test_forgot_verify_reset_token_is_non_empty_string(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    otp = await _initiate_forgot(client, mobile)
    resp = await client.post("/api/v1/auth/forgot/verify", json={"mobile": mobile, "otp": otp})
    token = resp.json()["reset_token"]
    assert isinstance(token, str) and len(token) > 10


async def test_forgot_verify_reset_token_expires_in_ten_minutes(monkeypatch) -> None:
    async def _verified(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr(auth_service, "verify_otp", _verified)
    response = await auth_service.forgot_verify(
        object(),
        object(),
        ForgotVerifyRequest(mobile=unique_mobile(), otp="123456"),
    )

    claims = decode_access_token(response.reset_token)
    assert claims["exp"] - claims["iat"] == 10 * 60


async def test_forgot_verify_wrong_otp_returns_400(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    await _initiate_forgot(client, mobile)
    resp = await client.post("/api/v1/auth/forgot/verify", json={"mobile": mobile, "otp": "000000"})
    assert resp.status_code == 400


async def test_forgot_verify_uninitiated_mobile_returns_400(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/forgot/verify", json={"mobile": unique_mobile(), "otp": "123456"}
    )
    assert resp.status_code == 400


async def test_forgot_verify_otp_less_than_6_returns_422(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/forgot/verify", json={"mobile": unique_mobile(), "otp": "12345"}
    )
    assert resp.status_code == 422


async def test_forgot_verify_otp_more_than_6_returns_422(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/forgot/verify", json={"mobile": unique_mobile(), "otp": "1234567"}
    )
    assert resp.status_code == 422


async def test_forgot_verify_non_numeric_otp_returns_422(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/forgot/verify", json={"mobile": unique_mobile(), "otp": "abcdef"}
    )
    assert resp.status_code == 422


async def test_forgot_verify_invalid_mobile_format_returns_422(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/forgot/verify", json={"mobile": "9876543210", "otp": "123456"}
    )
    assert resp.status_code == 422


async def test_forgot_verify_missing_mobile_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/forgot/verify", json={"otp": "123456"})
    assert resp.status_code == 422


async def test_forgot_verify_missing_otp_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/forgot/verify", json={"mobile": unique_mobile()})
    assert resp.status_code == 422


async def test_forgot_verify_five_wrong_exhausts_attempts(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    await _initiate_forgot(client, mobile)
    for _ in range(5):
        await client.post("/api/v1/auth/forgot/verify", json={"mobile": mobile, "otp": "000000"})
    resp = await client.post("/api/v1/auth/forgot/verify", json={"mobile": mobile, "otp": "000000"})
    assert resp.status_code == 400


async def test_forgot_verify_otp_replay_fails_on_second_use(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    otp = await _initiate_forgot(client, mobile)
    await client.post("/api/v1/auth/forgot/verify", json={"mobile": mobile, "otp": otp})
    resp = await client.post("/api/v1/auth/forgot/verify", json={"mobile": mobile, "otp": otp})
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# POST /auth/forgot/reset
# ---------------------------------------------------------------------------


async def test_forgot_reset_valid_token_returns_200(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    reset_token = await _full_forgot_flow(client, mobile)
    resp = await client.post(
        "/api/v1/auth/forgot/reset",
        json={
            "reset_token": reset_token,
            "new_password": "NewPass@5678",
            "confirm_password": "NewPass@5678",
        },
    )
    assert resp.status_code == 200


async def test_forgot_reset_new_password_works_on_login(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    reset_token = await _full_forgot_flow(client, mobile)
    new_pw = "NewPass@5678"
    await client.post(
        "/api/v1/auth/forgot/reset",
        json={"reset_token": reset_token, "new_password": new_pw, "confirm_password": new_pw},
    )
    resp = await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": new_pw})
    assert resp.status_code == 200


async def test_forgot_reset_old_password_rejected(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    reset_token = await _full_forgot_flow(client, mobile)
    new_pw = "NewPass@5678"
    await client.post(
        "/api/v1/auth/forgot/reset",
        json={"reset_token": reset_token, "new_password": new_pw, "confirm_password": new_pw},
    )
    resp = await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    assert resp.status_code == 401


async def test_forgot_reset_rejects_and_burns_token_if_account_is_suspended(
    client: AsyncClient,
) -> None:
    _, mobile = await full_registration(client)
    reset_token = await _full_forgot_flow(client, mobile)
    await _set_user_status(mobile, "suspended")
    payload = {
        "reset_token": reset_token,
        "new_password": "NewPass@5678",
        "confirm_password": "NewPass@5678",
    }

    suspended = await client.post("/api/v1/auth/forgot/reset", json=payload)
    assert suspended.status_code == 400
    assert suspended.json()["detail"] == "Invalid or expired reset token."

    await _set_user_status(mobile, "active")
    reused = await client.post("/api/v1/auth/forgot/reset", json=payload)
    assert reused.status_code == 400
    assert reused.json()["detail"] == "Reset token already used."


async def test_forgot_reset_invalidates_preexisting_access_token(client: AsyncClient) -> None:
    access_token, mobile = await full_registration(client)
    refresh_token = client.cookies.get("refresh_token")
    reset_token = await _full_forgot_flow(client, mobile)
    reset = await client.post(
        "/api/v1/auth/forgot/reset",
        json={
            "reset_token": reset_token,
            "new_password": "NewPass@5678",
            "confirm_password": "NewPass@5678",
        },
    )
    assert reset.status_code == 200

    old_session = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"}
    )
    assert old_session.status_code == 401
    assert old_session.json()["detail"] == "Session is no longer valid. Please log in again."

    client.cookies.set("refresh_token", refresh_token)
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401


async def test_forgot_reset_malformed_token_returns_400(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/forgot/reset",
        json={
            "reset_token": "garbage.token.value",
            "new_password": "NewPass@5678",
            "confirm_password": "NewPass@5678",
        },
    )
    assert resp.status_code == 400


async def test_forgot_reset_wrong_purpose_token_returns_400(client: AsyncClient) -> None:
    """Registration token must be rejected when used as a reset token."""
    mobile = unique_mobile()
    otp = await initiate_and_get_otp(client, mobile)
    verify_resp = await client.post(
        "/api/v1/auth/register/verify-otp", json={"mobile": mobile, "otp": otp}
    )
    reg_token = verify_resp.json()["registration_token"]
    resp = await client.post(
        "/api/v1/auth/forgot/reset",
        json={
            "reset_token": reg_token,
            "new_password": "NewPass@5678",
            "confirm_password": "NewPass@5678",
        },
    )
    assert resp.status_code == 400


async def test_forgot_reset_password_mismatch_returns_422(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    reset_token = await _full_forgot_flow(client, mobile)
    resp = await client.post(
        "/api/v1/auth/forgot/reset",
        json={
            "reset_token": reset_token,
            "new_password": "NewPass@5678",
            "confirm_password": "Different@9876",
        },
    )
    assert resp.status_code == 422


async def test_forgot_reset_too_short_returns_422(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    reset_token = await _full_forgot_flow(client, mobile)
    resp = await client.post(
        "/api/v1/auth/forgot/reset",
        json={"reset_token": reset_token, "new_password": "Ab1234!", "confirm_password": "Ab1234!"},
    )
    assert resp.status_code == 422


async def test_forgot_reset_too_long_returns_422(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    reset_token = await _full_forgot_flow(client, mobile)
    pw = "A1" + "x" * 127
    resp = await client.post(
        "/api/v1/auth/forgot/reset",
        json={"reset_token": reset_token, "new_password": pw, "confirm_password": pw},
    )
    assert resp.status_code == 422


async def test_forgot_reset_no_letters_returns_422(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    reset_token = await _full_forgot_flow(client, mobile)
    resp = await client.post(
        "/api/v1/auth/forgot/reset",
        json={
            "reset_token": reset_token,
            "new_password": "12345678",
            "confirm_password": "12345678",
        },
    )
    assert resp.status_code == 422


async def test_forgot_reset_no_digits_returns_422(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    reset_token = await _full_forgot_flow(client, mobile)
    resp = await client.post(
        "/api/v1/auth/forgot/reset",
        json={
            "reset_token": reset_token,
            "new_password": "NoDigitsHere!",
            "confirm_password": "NoDigitsHere!",
        },
    )
    assert resp.status_code == 422


async def test_forgot_reset_common_password_returns_422(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    reset_token = await _full_forgot_flow(client, mobile)
    resp = await client.post(
        "/api/v1/auth/forgot/reset",
        json={
            "reset_token": reset_token,
            "new_password": "Password1",
            "confirm_password": "Password1",
        },
    )
    assert resp.status_code == 422


async def test_forgot_reset_token_reuse_returns_400(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    reset_token = await _full_forgot_flow(client, mobile)
    new_pw = "NewPass@5678"
    await client.post(
        "/api/v1/auth/forgot/reset",
        json={"reset_token": reset_token, "new_password": new_pw, "confirm_password": new_pw},
    )
    resp = await client.post(
        "/api/v1/auth/forgot/reset",
        json={
            "reset_token": reset_token,
            "new_password": "Another@9999",
            "confirm_password": "Another@9999",
        },
    )
    assert resp.status_code == 400


async def test_forgot_reset_missing_token_returns_422(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/forgot/reset",
        json={"new_password": "NewPass@5678", "confirm_password": "NewPass@5678"},
    )
    assert resp.status_code == 422


async def test_forgot_reset_missing_new_password_returns_422(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    reset_token = await _full_forgot_flow(client, mobile)
    resp = await client.post(
        "/api/v1/auth/forgot/reset",
        json={"reset_token": reset_token, "confirm_password": "NewPass@5678"},
    )
    assert resp.status_code == 422
