"""Auth endpoint integration tests.

Requires: running Postgres + Redis (provided by docker-compose up in CI).
Use: cd apps/api && uv run pytest app/tests/test_auth.py -v
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

MOBILE = "+919876543210"
PASSWORD = "Test@1234"


@pytest_asyncio.fixture
async def client(live_app):
    """Integration-test client — requires running Docker services (Redis + Postgres).
    Tests skip automatically when services are unavailable."""
    async with AsyncClient(
        transport=ASGITransport(app=live_app),
        base_url="http://test",
    ) as ac:
        yield ac


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _initiate_and_get_otp(client: AsyncClient, mobile: str = MOBILE) -> str:
    """Initiate registration and return OTP hint (mock mode)."""
    resp = await client.post(
        "/auth/register/initiate",
        json={
            "first_name": "Test",
            "last_name": "User",
            "mobile": mobile,
            "lines": ["loans"],
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["sms_sent"] is False
    otp: str = data["otp_hint"]
    assert len(otp) == 6
    return otp


async def _full_registration(
    client: AsyncClient, mobile: str = MOBILE, password: str = PASSWORD
) -> str:
    """Full 3-step registration. Returns access_token."""
    otp = await _initiate_and_get_otp(client, mobile)

    verify_resp = await client.post(
        "/auth/register/verify-otp",
        json={"mobile": mobile, "otp": otp},
    )
    assert verify_resp.status_code == 200, verify_resp.text
    reg_token = verify_resp.json()["registration_token"]

    set_pw_resp = await client.post(
        "/auth/register/set-password",
        json={
            "registration_token": reg_token,
            "password": password,
            "confirm_password": password,
        },
    )
    assert set_pw_resp.status_code == 201, set_pw_resp.text
    return set_pw_resp.json()["access_token"]


# ---------------------------------------------------------------------------
# Registration flow
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_register_initiate_new_mobile_returns_otp_hint(client: AsyncClient) -> None:
    resp = await client.post(
        "/auth/register/initiate",
        json={
            "first_name": "Test",
            "last_name": "User",
            "mobile": "+919000000001",
            "lines": ["loans"],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["sms_sent"] is False
    assert "otp_hint" in body
    assert len(body["otp_hint"]) == 6


@pytest.mark.asyncio
async def test_register_initiate_invalid_mobile_returns_422(client: AsyncClient) -> None:
    resp = await client.post(
        "/auth/register/initiate",
        json={
            "first_name": "Test",
            "last_name": "User",
            "mobile": "9876543210",  # missing +
            "lines": ["loans"],
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_initiate_no_lines_returns_422(client: AsyncClient) -> None:
    resp = await client.post(
        "/auth/register/initiate",
        json={
            "first_name": "Test",
            "last_name": "User",
            "mobile": "+919000000002",
            "lines": [],
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_verify_wrong_otp_returns_400(client: AsyncClient) -> None:
    await _initiate_and_get_otp(client, "+919000000003")
    resp = await client.post(
        "/auth/register/verify-otp",
        json={"mobile": "+919000000003", "otp": "000000"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_register_set_password_mismatch_returns_422(client: AsyncClient) -> None:
    otp = await _initiate_and_get_otp(client, "+919000000004")
    verify_resp = await client.post(
        "/auth/register/verify-otp",
        json={"mobile": "+919000000004", "otp": otp},
    )
    reg_token = verify_resp.json()["registration_token"]
    resp = await client.post(
        "/auth/register/set-password",
        json={
            "registration_token": reg_token,
            "password": "Test@1234",
            "confirm_password": "Different@5678",
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_full_registration_flow(client: AsyncClient) -> None:
    access_token = await _full_registration(client, "+919000000010")
    assert access_token


@pytest.mark.asyncio
async def test_register_duplicate_mobile_returns_400(client: AsyncClient) -> None:
    mobile = "+919000000011"
    await _full_registration(client, mobile)
    resp = await client.post(
        "/auth/register/initiate",
        json={
            "first_name": "Test",
            "last_name": "User",
            "mobile": mobile,
            "lines": ["loans"],
        },
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_valid_credentials_returns_tokens(client: AsyncClient) -> None:
    mobile = "+919000000020"
    await _full_registration(client, mobile)
    resp = await client.post(
        "/auth/login",
        json={"mobile": mobile, "password": PASSWORD},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 15 * 60


@pytest.mark.asyncio
async def test_login_wrong_password_returns_401(client: AsyncClient) -> None:
    mobile = "+919000000021"
    await _full_registration(client, mobile)
    resp = await client.post(
        "/auth/login",
        json={"mobile": mobile, "password": "WrongPass1"},
    )
    assert resp.status_code == 401
    # Must not reveal which field is wrong
    assert "invalid" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_login_unknown_mobile_returns_401(client: AsyncClient) -> None:
    resp = await client.post(
        "/auth/login",
        json={"mobile": "+919999999999", "password": PASSWORD},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_lockout_after_five_failures(client: AsyncClient) -> None:
    mobile = "+919000000022"
    await _full_registration(client, mobile)
    for _ in range(5):
        await client.post(
            "/auth/login",
            json={"mobile": mobile, "password": "WrongPass1"},
        )
    resp = await client.post(
        "/auth/login",
        json={"mobile": mobile, "password": PASSWORD},
    )
    assert resp.status_code == 429


# ---------------------------------------------------------------------------
# Token refresh + logout
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_refresh_with_valid_cookie_rotates_token(client: AsyncClient) -> None:
    mobile = "+919000000030"
    await _full_registration(client, mobile)
    await client.post(
        "/auth/login",
        json={"mobile": mobile, "password": PASSWORD},
    )
    # refresh_token cookie set by login
    refresh_resp = await client.post("/auth/refresh")
    assert refresh_resp.status_code == 200
    assert "access_token" in refresh_resp.json()


@pytest.mark.asyncio
async def test_refresh_without_cookie_returns_401(client: AsyncClient) -> None:
    resp = await client.post("/auth/refresh")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_logout_blacklists_access_token(client: AsyncClient) -> None:
    mobile = "+919000000031"
    access_token = await _full_registration(client, mobile)
    logout_resp = await client.post(
        "/auth/logout",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert logout_resp.status_code == 200

    # Immediately using the same token should fail
    change_resp = await client.post(
        "/auth/change-password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "current_password": PASSWORD,
            "new_password": "NewPass@9999",
            "confirm_password": "NewPass@9999",
        },
    )
    assert change_resp.status_code == 401


# ---------------------------------------------------------------------------
# OTP rate-limit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_otp_rate_limit_rejects_after_five_per_day(client: AsyncClient) -> None:
    mobile = "+919000000040"
    for _ in range(5):
        await client.post(
            "/auth/register/initiate",
            json={
                "first_name": "A",
                "last_name": "B",
                "mobile": mobile,
                "lines": ["loans"],
            },
        )
    resp = await client.post(
        "/auth/register/initiate",
        json={
            "first_name": "A",
            "last_name": "B",
            "mobile": mobile,
            "lines": ["loans"],
        },
    )
    assert resp.status_code == 429


# ---------------------------------------------------------------------------
# Password reset flow
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_forgot_initiate_unknown_mobile_does_not_reveal_existence(
    client: AsyncClient,
) -> None:
    resp = await client.post(
        "/auth/forgot/initiate",
        json={"mobile": "+919000000050"},
    )
    assert resp.status_code == 200
    assert "registered" in resp.json()["message"].lower()


@pytest.mark.asyncio
async def test_full_password_reset_flow(client: AsyncClient) -> None:
    mobile = "+919000000051"
    await _full_registration(client, mobile)

    # Initiate
    initiate_resp = await client.post(
        "/auth/forgot/initiate",
        json={"mobile": mobile},
    )
    assert initiate_resp.status_code == 200
    otp = initiate_resp.json().get("otp_hint")
    assert otp

    # Verify
    verify_resp = await client.post(
        "/auth/forgot/verify",
        json={"mobile": mobile, "otp": otp},
    )
    assert verify_resp.status_code == 200
    reset_token = verify_resp.json()["reset_token"]

    # Reset
    reset_resp = await client.post(
        "/auth/forgot/reset",
        json={
            "reset_token": reset_token,
            "new_password": "NewPass@5678",
            "confirm_password": "NewPass@5678",
        },
    )
    assert reset_resp.status_code == 200

    # Verify new password works
    login_resp = await client.post(
        "/auth/login",
        json={"mobile": mobile, "password": "NewPass@5678"},
    )
    assert login_resp.status_code == 200


# ---------------------------------------------------------------------------
# Change password
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_change_password_success(client: AsyncClient) -> None:
    mobile = "+919000000060"
    access_token = await _full_registration(client, mobile)

    resp = await client.post(
        "/auth/change-password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "current_password": PASSWORD,
            "new_password": "Changed@9876",
            "confirm_password": "Changed@9876",
        },
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_change_password_wrong_current_returns_401(client: AsyncClient) -> None:
    mobile = "+919000000061"
    access_token = await _full_registration(client, mobile)

    resp = await client.post(
        "/auth/change-password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "current_password": "WrongOld1",
            "new_password": "Changed@9876",
            "confirm_password": "Changed@9876",
        },
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# OTP resend
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resend_otp_returns_new_hint(client: AsyncClient) -> None:
    mobile = "+919000000070"
    await _initiate_and_get_otp(client, mobile)

    resp = await client.post(
        "/auth/otp/resend",
        json={"mobile": mobile, "purpose": "register"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["sms_sent"] is False
    assert len(body["otp_hint"]) == 6
