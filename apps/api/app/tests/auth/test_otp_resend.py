"""OTP resend endpoint integration tests.

Covers POST /auth/otp/resend.
Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

from httpx import AsyncClient

from conftest import full_registration, initiate_and_get_otp, unique_mobile


async def test_resend_register_purpose_returns_new_otp_hint(client: AsyncClient) -> None:
    mobile = unique_mobile()
    await initiate_and_get_otp(client, mobile)
    resp = await client.post(
        "/api/v1/auth/otp/resend", json={"mobile": mobile, "purpose": "register"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["delivery_channel"] == "none"
    assert body["otp_hint"] and len(body["otp_hint"]) == 6


async def test_resend_reset_purpose_returns_new_otp_hint(client: AsyncClient) -> None:
    _, mobile = await full_registration(client)
    await client.post("/api/v1/auth/forgot/initiate", json={"mobile": mobile})
    resp = await client.post("/api/v1/auth/otp/resend", json={"mobile": mobile, "purpose": "reset"})
    assert resp.status_code == 200
    assert resp.json()["otp_hint"] and len(resp.json()["otp_hint"]) == 6


async def test_resend_channel_none_mock_mode(client: AsyncClient) -> None:
    mobile = unique_mobile()
    await initiate_and_get_otp(client, mobile)
    resp = await client.post(
        "/api/v1/auth/otp/resend", json={"mobile": mobile, "purpose": "register"}
    )
    assert resp.json()["delivery_channel"] == "none"


async def test_resend_via_email_recovery_returns_otp(client: AsyncClient) -> None:
    """via_email forces the email channel (mock → 'none' + hint in dev)."""
    mobile = unique_mobile()
    await initiate_and_get_otp(client, mobile)
    resp = await client.post(
        "/api/v1/auth/otp/resend",
        json={"mobile": mobile, "purpose": "register", "via_email": True},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["delivery_channel"] == "none"
    assert body["otp_hint"] and len(body["otp_hint"]) == 6


async def test_resend_invalidates_old_otp(client: AsyncClient) -> None:
    mobile = unique_mobile()
    old_otp = await initiate_and_get_otp(client, mobile)
    await client.post("/api/v1/auth/otp/resend", json={"mobile": mobile, "purpose": "register"})
    resp = await client.post(
        "/api/v1/auth/register/verify-otp", json={"mobile": mobile, "otp": old_otp}
    )
    assert resp.status_code == 400


async def test_resend_second_within_limit_succeeds(client: AsyncClient) -> None:
    mobile = unique_mobile()
    await initiate_and_get_otp(client, mobile)
    await client.post("/api/v1/auth/otp/resend", json={"mobile": mobile, "purpose": "register"})
    resp = await client.post(
        "/api/v1/auth/otp/resend", json={"mobile": mobile, "purpose": "register"}
    )
    assert resp.status_code == 200


async def test_resend_third_within_limit_succeeds(client: AsyncClient) -> None:
    mobile = unique_mobile()
    await initiate_and_get_otp(client, mobile)
    for _ in range(2):
        await client.post("/api/v1/auth/otp/resend", json={"mobile": mobile, "purpose": "register"})
    resp = await client.post(
        "/api/v1/auth/otp/resend", json={"mobile": mobile, "purpose": "register"}
    )
    assert resp.status_code == 200


async def test_resend_fourth_exceeds_limit_returns_429(client: AsyncClient) -> None:
    mobile = unique_mobile()
    await initiate_and_get_otp(client, mobile)
    for _ in range(3):
        await client.post("/api/v1/auth/otp/resend", json={"mobile": mobile, "purpose": "register"})
    resp = await client.post(
        "/api/v1/auth/otp/resend", json={"mobile": mobile, "purpose": "register"}
    )
    assert resp.status_code == 429


async def test_resend_after_attempts_exhausted_succeeds(client: AsyncClient) -> None:
    """Exhausting wrong-OTP attempts must not strand the user: resend still
    works, since the backend's own "No attempts remaining" message tells them
    to do exactly that."""
    mobile = unique_mobile()
    await initiate_and_get_otp(client, mobile)
    for _ in range(5):
        await client.post(
            "/api/v1/auth/register/verify-otp", json={"mobile": mobile, "otp": "000000"}
        )
    resp = await client.post(
        "/api/v1/auth/otp/resend", json={"mobile": mobile, "purpose": "register"}
    )
    assert resp.status_code == 200
    assert resp.json()["otp_hint"] and len(resp.json()["otp_hint"]) == 6


async def test_resend_no_prior_otp_returns_400(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/otp/resend",
        json={"mobile": unique_mobile(), "purpose": "register"},
    )
    assert resp.status_code == 400


async def test_resend_invalid_mobile_format_returns_422(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/otp/resend", json={"mobile": "9876543210", "purpose": "register"}
    )
    assert resp.status_code == 422


async def test_resend_invalid_purpose_returns_422(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/otp/resend", json={"mobile": unique_mobile(), "purpose": "login"}
    )
    assert resp.status_code == 422


async def test_resend_missing_mobile_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/otp/resend", json={"purpose": "register"})
    assert resp.status_code == 422


async def test_resend_missing_purpose_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/otp/resend", json={"mobile": unique_mobile()})
    assert resp.status_code == 422
