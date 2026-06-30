"""Post-login email verification (soft 2FA) integration tests.

Covers POST /auth/email/verify/initiate and /email/verify/confirm.
Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

from httpx import AsyncClient

from conftest import PASSWORD, full_registration


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_email_verify_full_flow_sets_email_verified(client: AsyncClient) -> None:
    access, mobile = await full_registration(client)
    init = await client.post("/api/v1/auth/email/verify/initiate", headers=_auth(access))
    assert init.status_code == 200, init.text
    body = init.json()
    assert body["delivery_channel"] == "none"  # email mocked in dev
    otp = body["otp_hint"]
    assert otp and len(otp) == 6

    confirm = await client.post(
        "/api/v1/auth/email/verify/confirm", headers=_auth(access), json={"otp": otp}
    )
    assert confirm.status_code == 200, confirm.text

    # Subsequent login now reports email_verified=True.
    login = await client.post("/api/v1/auth/login", json={"mobile": mobile, "password": PASSWORD})
    assert login.json()["email_verified"] is True


async def test_email_verify_wrong_otp_returns_400(client: AsyncClient) -> None:
    access, _ = await full_registration(client)
    await client.post("/api/v1/auth/email/verify/initiate", headers=_auth(access))
    resp = await client.post(
        "/api/v1/auth/email/verify/confirm", headers=_auth(access), json={"otp": "000000"}
    )
    assert resp.status_code == 400


async def test_email_verify_confirm_without_initiate_returns_400(client: AsyncClient) -> None:
    access, _ = await full_registration(client)
    resp = await client.post(
        "/api/v1/auth/email/verify/confirm", headers=_auth(access), json={"otp": "123456"}
    )
    assert resp.status_code == 400


async def test_email_verify_already_verified_returns_400(client: AsyncClient) -> None:
    access, _ = await full_registration(client)
    init = await client.post("/api/v1/auth/email/verify/initiate", headers=_auth(access))
    otp = init.json()["otp_hint"]
    await client.post("/api/v1/auth/email/verify/confirm", headers=_auth(access), json={"otp": otp})
    # Second initiate after already verified → 400.
    resp = await client.post("/api/v1/auth/email/verify/initiate", headers=_auth(access))
    assert resp.status_code == 400


async def test_email_verify_initiate_unauthenticated_returns_401(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/email/verify/initiate")
    assert resp.status_code == 401


async def test_email_verify_confirm_unauthenticated_returns_401(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/email/verify/confirm", json={"otp": "123456"})
    assert resp.status_code == 401


async def test_email_verify_confirm_missing_otp_returns_422(client: AsyncClient) -> None:
    access, _ = await full_registration(client)
    resp = await client.post("/api/v1/auth/email/verify/confirm", headers=_auth(access), json={})
    assert resp.status_code == 422
