"""Public agent-application intake endpoint tests
(docs/specs/agent-application-intake.md).

Covers: OTP initiate/resend/verify -> ticket, upload presign, submit upsert,
enumeration-safety, honeypot, the email-fallback-must-be-off invariant, ticket
single-use, object-key verification, and the per-IP submit cap.

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import base64
import json

import pytest
import redis.asyncio as aioredis
from httpx import AsyncClient
from sqlalchemy import select

import app.db.session as db_session
import app.services.otp_delivery as otp_delivery
from app.cache.redis_keys import (
    agent_apply_otp_daily_key,
    agent_apply_presign_key,
    agent_apply_rate_ip_key,
    otp_agent_apply_key,
    otp_rate_key,
)
from app.core.config import settings
from app.core.security import decode_access_token
from app.models.lead import Lead
from app.models.profile import AgentApplication
from app.services import storage
from conftest import full_registration, unique_email, unique_mobile

# ASGITransport stamps every request with this client host.
_TEST_IP = "127.0.0.1"

_APPLY_URL = "/api/v1/agent-applications"
_DOC_TYPES = ("aadhaar_front", "aadhaar_back", "pan", "photo")


@pytest.fixture(autouse=True)
async def _clean_agent_apply_ip_window():
    """Every test shares the ASGI test IP; isolate the submit per-IP counter."""
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    await r.delete(agent_apply_rate_ip_key(_TEST_IP))
    try:
        yield
    finally:
        await r.delete(agent_apply_rate_ip_key(_TEST_IP))
        await r.aclose()


async def _get_application(
    mobile: str, business_line: str | None = None
) -> AgentApplication | None:
    async with db_session.AsyncSessionLocal() as session:
        stmt = select(AgentApplication).where(AgentApplication.mobile == mobile)
        if business_line:
            stmt = stmt.where(AgentApplication.business_line == business_line)
        return await session.scalar(stmt)


async def _get_lead(mobile: str) -> Lead | None:
    async with db_session.AsyncSessionLocal() as session:
        return await session.scalar(select(Lead).where(Lead.mobile == mobile))


async def _initiate(client: AsyncClient, mobile: str, **overrides) -> dict:
    body = {"mobile": mobile, **overrides}
    resp = await client.post(f"{_APPLY_URL}/otp/initiate", json=body)
    return resp.json() if resp.status_code == 200 else {"_status": resp.status_code}


async def _get_otp_hint(client: AsyncClient, mobile: str) -> str:
    resp = await client.post(f"{_APPLY_URL}/otp/initiate", json={"mobile": mobile})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["delivery_channel"] == "none"
    otp: str = data["otp_hint"]
    assert len(otp) == 6
    return otp


async def _get_ticket(client: AsyncClient, mobile: str) -> str:
    otp = await _get_otp_hint(client, mobile)
    resp = await client.post(f"{_APPLY_URL}/otp/verify", json={"mobile": mobile, "otp": otp})
    assert resp.status_code == 200, resp.text
    return resp.json()["application_ticket"]


async def _presign(
    client: AsyncClient, ticket: str, doc_type: str, content_type: str = "image/jpeg"
) -> dict:
    resp = await client.post(
        f"{_APPLY_URL}/uploads/presign",
        json={"application_ticket": ticket, "doc_type": doc_type, "content_type": content_type},
    )
    return resp.json() if resp.status_code == 200 else {"_status": resp.status_code}


async def _get_ticket_and_keys(client: AsyncClient, mobile: str) -> tuple[str, dict[str, str]]:
    ticket = await _get_ticket(client, mobile)
    keys = {}
    for doc_type in _DOC_TYPES:
        resp = await _presign(client, ticket, doc_type)
        assert "_status" not in resp, resp
        keys[doc_type] = resp["object_key"]
    return ticket, keys


def _submit_payload(
    ticket: str,
    keys: dict[str, str],
    *,
    business_line: str = "loans",
    rera_code: str | None = None,
    **overrides,
) -> dict:
    body = {
        "application_ticket": ticket,
        "first_name": "Ravi",
        "last_name": "Kumar",
        "email": unique_email(),
        "business_line": business_line,
        "rera_code": rera_code,
        "aadhaar_front_key": keys["aadhaar_front"],
        "aadhaar_back_key": keys["aadhaar_back"],
        "pan_key": keys["pan"],
        "photo_key": keys["photo"],
    }
    body.update(overrides)
    return body


def _mock_uploads_ok(monkeypatch: pytest.MonkeyPatch, size: int = 2048) -> None:
    monkeypatch.setattr(storage, "head_object", lambda _key: size)
    # Orthogonal to the size/existence check these helpers exist for — the
    # magic-byte sniff (feature-status.md §2-12) does a real ranged GET, and
    # these tests never upload real object bytes to minio, so it would 404
    # (content_type_is_recognized -> False) and mask whatever this helper is
    # actually testing.
    monkeypatch.setattr(storage, "content_type_is_recognized", lambda _key: True)


def _mock_uploads_missing(monkeypatch: pytest.MonkeyPatch, missing_key: str) -> None:
    def fake(key: str) -> int | None:
        return None if key == missing_key else 2048

    monkeypatch.setattr(storage, "head_object", fake)
    monkeypatch.setattr(storage, "content_type_is_recognized", lambda _key: True)


def _mock_uploads_transport_error(monkeypatch: pytest.MonkeyPatch, bad_key: str) -> None:
    def fake(key: str) -> int:
        if key == bad_key:
            raise RuntimeError("storage unreachable")
        return 2048

    monkeypatch.setattr(storage, "head_object", fake)
    monkeypatch.setattr(storage, "content_type_is_recognized", lambda _key: True)


# ---------------------------------------------------------------------------
# OTP initiate / resend / verify
# ---------------------------------------------------------------------------


async def test_initiate_returns_200_mock_channel(client: AsyncClient) -> None:
    mobile = unique_mobile()
    data = await _initiate(client, mobile)
    assert data["delivery_channel"] == "none"
    assert len(data["otp_hint"]) == 6


async def test_initiate_is_enumeration_safe(client: AsyncClient) -> None:
    """Registered vs never-seen mobile must be indistinguishable."""
    _, registered_mobile = await full_registration(client)
    fresh_mobile = unique_mobile()

    registered_resp = await client.post(
        f"{_APPLY_URL}/otp/initiate", json={"mobile": registered_mobile}
    )
    fresh_resp = await client.post(f"{_APPLY_URL}/otp/initiate", json={"mobile": fresh_mobile})

    assert registered_resp.status_code == fresh_resp.status_code == 200
    r_data, f_data = registered_resp.json(), fresh_resp.json()
    assert r_data["message"] == f_data["message"]
    assert r_data["delivery_channel"] == f_data["delivery_channel"] == "none"
    assert len(r_data["otp_hint"]) == len(f_data["otp_hint"]) == 6


async def test_initiate_honeypot_writes_nothing(client: AsyncClient) -> None:
    mobile = unique_mobile()
    resp = await client.post(
        f"{_APPLY_URL}/otp/initiate",
        json={"mobile": mobile, "company": "Definitely A Real Business Ltd"},
    )
    assert resp.status_code == 200

    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        assert await r.exists(otp_agent_apply_key(mobile)) == 0
        assert await r.exists(otp_rate_key(mobile)) == 0
    finally:
        await r.aclose()


async def test_initiate_daily_limit_trips_per_mobile(client: AsyncClient) -> None:
    """Regression for the security-review finding: a public route reachable
    with only a target mobile number needs its own daily cap, independent of
    the shared otp_rate/{mobile} budget register/reset also draw from —
    otherwise an attacker could exhaust a victim's whole shared budget here."""
    mobile = unique_mobile()
    original = settings.AGENT_APPLY_OTP_DAILY_LIMIT
    settings.AGENT_APPLY_OTP_DAILY_LIMIT = 2
    try:
        first = await client.post(f"{_APPLY_URL}/otp/initiate", json={"mobile": mobile})
        second = await client.post(f"{_APPLY_URL}/otp/initiate", json={"mobile": mobile})
        third = await client.post(f"{_APPLY_URL}/otp/initiate", json={"mobile": mobile})
        assert first.status_code == 200
        assert second.status_code == 200
        assert third.status_code == 429
    finally:
        settings.AGENT_APPLY_OTP_DAILY_LIMIT = original
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await r.delete(agent_apply_otp_daily_key(mobile))
        await r.aclose()


async def test_resend_not_gated_by_daily_initiate_limit(client: AsyncClient) -> None:
    """resend must NOT share the tiny daily cap with initiate — resend_otp
    already has its own dedicated 3-per-window/1h-lock cap (services/otp.py),
    and counting resends against the same daily budget as initiate would let
    a single legitimate verify-then-resend session lock a real applicant out
    before they ever hit resend's own limit."""
    mobile = unique_mobile()
    original = settings.AGENT_APPLY_OTP_DAILY_LIMIT
    settings.AGENT_APPLY_OTP_DAILY_LIMIT = 1
    try:
        assert (
            await client.post(f"{_APPLY_URL}/otp/initiate", json={"mobile": mobile})
        ).status_code == 200
        resp = await client.post(f"{_APPLY_URL}/otp/resend", json={"mobile": mobile})
        assert resp.status_code == 200
    finally:
        settings.AGENT_APPLY_OTP_DAILY_LIMIT = original
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await r.delete(agent_apply_otp_daily_key(mobile))
        await r.aclose()


async def test_initiate_never_falls_back_to_email(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The single highest-severity invariant of this slice: agent_apply OTP
    delivery must never reach send_email, even though voice is mocked/failing
    in every test — a fallback here would let anyone who knows a mobile number
    (but cannot answer it) still receive the code via a self-asserted email."""
    calls = []

    async def _fake_send_email(to: str, subject: str, body: str) -> bool:
        calls.append(to)
        return True

    monkeypatch.setattr(otp_delivery, "send_email", _fake_send_email)
    mobile = unique_mobile()
    data = await _initiate(client, mobile)
    assert data["delivery_channel"] == "none"
    assert calls == []


async def test_verify_wrong_otp_returns_400(client: AsyncClient) -> None:
    mobile = unique_mobile()
    await _get_otp_hint(client, mobile)
    resp = await client.post(f"{_APPLY_URL}/otp/verify", json={"mobile": mobile, "otp": "000000"})
    assert resp.status_code == 400


async def test_verify_five_wrong_exhausts_attempts(client: AsyncClient) -> None:
    # 5 wrong guesses exceeds OTP_MAX_ATTEMPTS regardless of its configured
    # value (matches the existing forgot/register five-wrong-attempts tests,
    # which likewise only assert the final 400, not attempt-count-specific
    # message text).
    mobile = unique_mobile()
    await _get_otp_hint(client, mobile)
    for _ in range(5):
        resp = await client.post(
            f"{_APPLY_URL}/otp/verify", json={"mobile": mobile, "otp": "000000"}
        )
        assert resp.status_code == 400
    resp = await client.post(f"{_APPLY_URL}/otp/verify", json={"mobile": mobile, "otp": "000000"})
    assert resp.status_code == 400


async def test_resend_issues_new_verifiable_otp(client: AsyncClient) -> None:
    """Regression test for the services.otp._otp_key fix: before that fix,
    resend_otp hardcoded register/reset keys, so an agent_apply resend would
    silently check/clear the wrong Redis key."""
    mobile = unique_mobile()
    await _get_otp_hint(client, mobile)
    resend_resp = await client.post(f"{_APPLY_URL}/otp/resend", json={"mobile": mobile})
    assert resend_resp.status_code == 200, resend_resp.text
    new_otp = resend_resp.json()["otp_hint"]

    verify_resp = await client.post(
        f"{_APPLY_URL}/otp/verify", json={"mobile": mobile, "otp": new_otp}
    )
    assert verify_resp.status_code == 200, verify_resp.text
    assert verify_resp.json()["application_ticket"]


async def test_ticket_has_agent_apply_purpose_and_no_sub(client: AsyncClient) -> None:
    mobile = unique_mobile()
    ticket = await _get_ticket(client, mobile)
    claims = decode_access_token(ticket)
    assert claims["purpose"] == "agent_apply"
    assert claims["mobile"] == mobile
    assert "sub" not in claims


async def test_ticket_cannot_be_used_as_access_token(client: AsyncClient) -> None:
    mobile = unique_mobile()
    ticket = await _get_ticket(client, mobile)
    resp = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {ticket}"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Upload presign
# ---------------------------------------------------------------------------


async def test_presign_returns_key_under_ticket_jti(client: AsyncClient) -> None:
    mobile = unique_mobile()
    ticket = await _get_ticket(client, mobile)
    jti = decode_access_token(ticket)["jti"]
    resp = await _presign(client, ticket, "aadhaar_front")
    assert resp["object_key"].startswith(f"agent-applications/{jti}/")
    assert resp["object_key"].endswith("-aadhaar_front")
    assert resp["max_bytes"] == settings.AGENT_APPLICATION_MAX_UPLOAD_BYTES


async def test_presign_policy_carries_signed_size_cap(client: AsyncClient) -> None:
    mobile = unique_mobile()
    ticket = await _get_ticket(client, mobile)
    resp = await _presign(client, ticket, "photo")
    policy = json.loads(base64.b64decode(resp["fields"]["policy"]))
    length_range = next(
        c for c in policy["conditions"] if isinstance(c, list) and c[0] == "content-length-range"
    )
    assert length_range == ["content-length-range", 1, settings.AGENT_APPLICATION_MAX_UPLOAD_BYTES]


async def test_presign_bad_content_type_returns_422(client: AsyncClient) -> None:
    mobile = unique_mobile()
    ticket = await _get_ticket(client, mobile)
    resp = await client.post(
        f"{_APPLY_URL}/uploads/presign",
        json={"application_ticket": ticket, "doc_type": "photo", "content_type": "text/html"},
    )
    assert resp.status_code == 422


async def test_presign_garbage_ticket_returns_400(client: AsyncClient) -> None:
    resp = await client.post(
        f"{_APPLY_URL}/uploads/presign",
        json={
            "application_ticket": "not-a-real-token",
            "doc_type": "photo",
            "content_type": "image/jpeg",
        },
    )
    assert resp.status_code == 400


async def test_presign_quota_trips(client: AsyncClient) -> None:
    mobile = unique_mobile()
    ticket = await _get_ticket(client, mobile)
    original = settings.AGENT_APPLY_PRESIGN_LIMIT_PER_TICKET
    settings.AGENT_APPLY_PRESIGN_LIMIT_PER_TICKET = 2
    try:
        assert (await _presign(client, ticket, "photo")).get("_status") != 429
        assert (await _presign(client, ticket, "photo")).get("_status") != 429
        third = await client.post(
            f"{_APPLY_URL}/uploads/presign",
            json={
                "application_ticket": ticket,
                "doc_type": "photo",
                "content_type": "image/jpeg",
            },
        )
        assert third.status_code == 429
    finally:
        settings.AGENT_APPLY_PRESIGN_LIMIT_PER_TICKET = original
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        jti = decode_access_token(ticket)["jti"]
        await r.delete(agent_apply_presign_key(jti))
        await r.aclose()


# ---------------------------------------------------------------------------
# Submit
# ---------------------------------------------------------------------------


async def test_submit_happy_path_persists_row(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_uploads_ok(monkeypatch)
    mobile = unique_mobile()
    ticket, keys = await _get_ticket_and_keys(client, mobile)
    resp = await client.post(_APPLY_URL, json=_submit_payload(ticket, keys))
    assert resp.status_code == 202, resp.text
    assert resp.json() == {"ok": True}

    application = await _get_application(mobile, "loans")
    assert application is not None
    assert application.first_name == "Ravi"
    assert application.email is not None
    assert application.aadhaar_ref == keys["aadhaar_front"]
    assert application.aadhaar_back_ref == keys["aadhaar_back"]
    assert application.pan_ref == keys["pan"]
    assert application.photo_ref == keys["photo"]
    assert application.status == "pending"
    assert application.applicant_auth_user_uuid is None  # unregistered mobile


async def test_submit_links_applicant_for_registered_mobile(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_uploads_ok(monkeypatch)
    _, mobile = await full_registration(client)
    ticket, keys = await _get_ticket_and_keys(client, mobile)
    resp = await client.post(_APPLY_URL, json=_submit_payload(ticket, keys))
    assert resp.status_code == 202, resp.text

    application = await _get_application(mobile, "loans")
    assert application is not None
    assert application.applicant_auth_user_uuid is not None


async def test_submit_foreign_ticket_key_rejected(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_uploads_ok(monkeypatch)
    ticket_a, keys_a = await _get_ticket_and_keys(client, unique_mobile())
    _ticket_b, keys_b = await _get_ticket_and_keys(client, unique_mobile())
    payload = _submit_payload(ticket_a, keys_a, photo_key=keys_b["photo"])
    resp = await client.post(_APPLY_URL, json=payload)
    assert resp.status_code == 400


async def test_submit_tasks_prefixed_key_rejected(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_uploads_ok(monkeypatch)
    ticket, keys = await _get_ticket_and_keys(client, unique_mobile())
    tasks_key = "tasks/11111111-1111-1111-1111-111111111111/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-photo"
    payload = _submit_payload(ticket, keys, photo_key=tasks_key)
    resp = await client.post(_APPLY_URL, json=payload)
    assert resp.status_code == 400


async def test_submit_doc_type_swap_rejected(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_uploads_ok(monkeypatch)
    ticket, keys = await _get_ticket_and_keys(client, unique_mobile())
    payload = _submit_payload(ticket, keys, pan_key=keys["photo"], photo_key=keys["pan"])
    resp = await client.post(_APPLY_URL, json=payload)
    assert resp.status_code == 400


async def test_submit_missing_upload_rejected(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ticket, keys = await _get_ticket_and_keys(client, unique_mobile())
    _mock_uploads_missing(monkeypatch, keys["photo"])
    resp = await client.post(_APPLY_URL, json=_submit_payload(ticket, keys))
    assert resp.status_code == 400


async def test_submit_polyglot_content_rejected_and_deletes_object(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Closes feature-status.md §2-12: a real polyglot upload (any type this
    module doesn't recognize) must be rejected at submit and its object
    deleted, not silently accepted into a KYC application row."""
    ticket, keys = await _get_ticket_and_keys(client, unique_mobile())
    monkeypatch.setattr(storage, "head_object", lambda _key: 2048)
    monkeypatch.setattr(storage, "content_type_is_recognized", lambda key: key != keys["pan"])
    deleted_keys: list[str] = []
    monkeypatch.setattr(storage, "delete_object", lambda key: deleted_keys.append(key))

    resp = await client.post(_APPLY_URL, json=_submit_payload(ticket, keys))
    assert resp.status_code == 422, resp.text
    assert deleted_keys == [keys["pan"]]


async def test_submit_storage_transport_error_returns_502(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    ticket, keys = await _get_ticket_and_keys(client, unique_mobile())
    _mock_uploads_transport_error(monkeypatch, keys["pan"])
    resp = await client.post(_APPLY_URL, json=_submit_payload(ticket, keys))
    assert resp.status_code == 502


async def test_submit_ticket_reuse_returns_409(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_uploads_ok(monkeypatch)
    ticket, keys = await _get_ticket_and_keys(client, unique_mobile())
    payload = _submit_payload(ticket, keys)
    first = await client.post(_APPLY_URL, json=payload)
    assert first.status_code == 202
    second = await client.post(_APPLY_URL, json=payload)
    assert second.status_code == 409


async def test_submit_same_mobile_same_line_upserts_single_row(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_uploads_ok(monkeypatch)
    mobile = unique_mobile()

    ticket1, keys1 = await _get_ticket_and_keys(client, mobile)
    resp1 = await client.post(_APPLY_URL, json=_submit_payload(ticket1, keys1))
    assert resp1.status_code == 202, resp1.text
    first_app = await _get_application(mobile, "loans")
    assert first_app is not None
    first_created_at = first_app.created_at

    ticket2, keys2 = await _get_ticket_and_keys(client, mobile)
    resp2 = await client.post(_APPLY_URL, json=_submit_payload(ticket2, keys2))
    assert resp2.status_code == 202, resp2.text

    async with db_session.AsyncSessionLocal() as session:
        rows = (
            await session.scalars(
                select(AgentApplication).where(
                    AgentApplication.mobile == mobile, AgentApplication.business_line == "loans"
                )
            )
        ).all()
    assert len(rows) == 1
    assert rows[0].photo_ref == keys2["photo"]
    assert rows[0].created_at == first_created_at


async def test_submit_same_mobile_different_line_creates_second_row(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_uploads_ok(monkeypatch)
    mobile = unique_mobile()

    ticket1, keys1 = await _get_ticket_and_keys(client, mobile)
    resp1 = await client.post(
        _APPLY_URL, json=_submit_payload(ticket1, keys1, business_line="loans")
    )
    assert resp1.status_code == 202, resp1.text

    ticket2, keys2 = await _get_ticket_and_keys(client, mobile)
    resp2 = await client.post(
        _APPLY_URL,
        json=_submit_payload(
            ticket2, keys2, business_line="real_estate", rera_code="RERA/AG/2026/00123"
        ),
    )
    assert resp2.status_code == 202, resp2.text

    loans_app = await _get_application(mobile, "loans")
    re_app = await _get_application(mobile, "real_estate")
    assert loans_app is not None and re_app is not None
    assert loans_app.id != re_app.id


async def test_submit_does_not_capture_agent_applicant_as_customer_lead(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_uploads_ok(monkeypatch)
    mobile = unique_mobile()
    ticket, keys = await _get_ticket_and_keys(client, mobile)
    resp = await client.post(_APPLY_URL, json=_submit_payload(ticket, keys))
    assert resp.status_code == 202, resp.text

    assert await _get_lead(mobile) is None


async def test_submit_real_estate_without_rera_returns_422(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_uploads_ok(monkeypatch)
    ticket, keys = await _get_ticket_and_keys(client, unique_mobile())
    payload = _submit_payload(ticket, keys, business_line="real_estate", rera_code=None)
    resp = await client.post(_APPLY_URL, json=payload)
    assert resp.status_code == 422


async def test_submit_per_ip_cap_trips(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_uploads_ok(monkeypatch)
    original = settings.AGENT_APPLY_RATE_LIMIT_PER_IP
    settings.AGENT_APPLY_RATE_LIMIT_PER_IP = 1
    try:
        ticket1, keys1 = await _get_ticket_and_keys(client, unique_mobile())
        first = await client.post(_APPLY_URL, json=_submit_payload(ticket1, keys1))
        assert first.status_code == 202, first.text

        ticket2, keys2 = await _get_ticket_and_keys(client, unique_mobile())
        second = await client.post(_APPLY_URL, json=_submit_payload(ticket2, keys2))
        assert second.status_code == 429
    finally:
        settings.AGENT_APPLY_RATE_LIMIT_PER_IP = original


async def test_submit_honeypot_answers_202_without_writing(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_uploads_ok(monkeypatch)
    mobile = unique_mobile()
    ticket, keys = await _get_ticket_and_keys(client, mobile)
    payload = _submit_payload(ticket, keys, company="Definitely A Real Business Ltd")
    resp = await client.post(_APPLY_URL, json=payload)
    assert resp.status_code == 202
    assert await _get_application(mobile, "loans") is None
