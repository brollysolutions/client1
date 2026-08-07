"""OTP resend endpoint integration tests.

Covers POST /auth/otp/resend.
Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

from httpx import AsyncClient

from conftest import full_registration, initiate_and_get_otp, unique_email, unique_mobile


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


async def test_resend_via_email_requires_verified_account_email(
    client: AsyncClient, monkeypatch
) -> None:
    email = unique_email()
    access, mobile = await full_registration(client, email=email)
    headers = {"Authorization": f"Bearer {access}"}
    verify = await client.post("/api/v1/auth/email/verify/initiate", headers=headers)
    assert verify.status_code == 200, verify.text
    confirmed = await client.post(
        "/api/v1/auth/email/verify/confirm",
        headers=headers,
        json={"otp": verify.json()["otp_hint"]},
    )
    assert confirmed.status_code == 200, confirmed.text
    initiated = await client.post("/api/v1/auth/forgot/initiate", json={"mobile": mobile})
    assert initiated.status_code == 200, initiated.text

    from app.services import otp_delivery

    sent: list[str] = []

    async def _capture_email(to: str, subject: str, body: str) -> bool:
        sent.append(to)
        return True

    monkeypatch.setattr(otp_delivery, "send_email", _capture_email)
    resp = await client.post(
        "/api/v1/auth/otp/resend",
        json={"mobile": mobile, "purpose": "reset", "via_email": True},
    )
    assert resp.status_code == 200
    assert resp.json() == {
        "message": "Code resent.",
        "delivery_channel": "none",
        "otp_hint": None,
    }
    assert sent == [email]


async def test_voice_resend_never_falls_back_to_verified_email(
    client: AsyncClient, monkeypatch
) -> None:
    email = unique_email()
    access, mobile = await full_registration(client, email=email)
    headers = {"Authorization": f"Bearer {access}"}
    verify = await client.post("/api/v1/auth/email/verify/initiate", headers=headers)
    assert verify.status_code == 200, verify.text
    confirmed = await client.post(
        "/api/v1/auth/email/verify/confirm",
        headers=headers,
        json={"otp": verify.json()["otp_hint"]},
    )
    assert confirmed.status_code == 200, confirmed.text
    initiated = await client.post("/api/v1/auth/forgot/initiate", json={"mobile": mobile})
    assert initiated.status_code == 200, initiated.text

    from app.services import otp_delivery

    sent: list[str] = []

    async def _capture_email(to: str, subject: str, body: str) -> bool:
        sent.append(to)
        return True

    monkeypatch.setattr(otp_delivery, "send_email", _capture_email)
    response = await client.post(
        "/api/v1/auth/otp/resend",
        json={"mobile": mobile, "purpose": "reset", "via_email": False},
    )
    assert response.status_code == 200
    assert response.json()["delivery_channel"] == "none"
    assert sent == []


async def test_unverified_email_is_not_used_for_reset_resend(
    client: AsyncClient, monkeypatch
) -> None:
    _, mobile = await full_registration(client, email=unique_email())
    initiated = await client.post("/api/v1/auth/forgot/initiate", json={"mobile": mobile})
    assert initiated.status_code == 200, initiated.text

    from app.services import otp_delivery

    sent: list[str] = []

    async def _capture_email(to: str, subject: str, body: str) -> bool:
        sent.append(to)
        return True

    monkeypatch.setattr(otp_delivery, "send_email", _capture_email)
    resp = await client.post(
        "/api/v1/auth/otp/resend",
        json={"mobile": mobile, "purpose": "reset", "via_email": True},
    )
    assert resp.status_code == 200
    assert resp.json()["delivery_channel"] == "none"
    assert sent == []
    still_valid = await client.post(
        "/api/v1/auth/forgot/verify",
        json={"mobile": mobile, "otp": initiated.json()["otp_hint"]},
    )
    assert still_valid.status_code == 200, still_valid.text


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


async def test_reset_resend_without_session_is_enumeration_safe(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/otp/resend",
        json={"mobile": unique_mobile(), "purpose": "reset", "via_email": True},
    )
    assert resp.status_code == 200
    assert resp.json() == {
        "message": "Code resent.",
        "delivery_channel": "none",
        "otp_hint": None,
    }


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
