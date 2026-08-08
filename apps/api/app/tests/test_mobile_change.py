"""Support-assisted mobile-number change integration tests.

Requires Postgres + Redis with the current Alembic head applied.
"""

from __future__ import annotations

import asyncio
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.mobile_change import MobileChangeRequest
from conftest import PASSWORD, full_registration, unique_mobile


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _user_id(mobile: str) -> str:
    import app.db.session as session_mod

    async with session_mod.AsyncSessionLocal() as db:
        value = await db.scalar(
            text("SELECT id FROM auth_users WHERE mobile = :number"),
            {"number": mobile},
        )
        assert value is not None
        return str(value)


def _admin_token(user_id: str) -> str:
    return create_access_token(
        {
            "sub": user_id,
            "role": "admin",
            "business_line": "",
            "platform_scope": "true",
            "session_version": 1,
        }
    )


async def _make_admin(client: AsyncClient) -> tuple[str, str, str]:
    _, mobile = await full_registration(client)
    user_id = await _user_id(mobile)
    import app.db.session as session_mod

    async with session_mod.AsyncSessionLocal() as db:
        await db.execute(
            text(
                "INSERT INTO staff_profiles "
                "(id, auth_user_uuid, role, scope, staff_code, status, created_at, updated_at) "
                "VALUES (:id, :uid, 'admin', 'platform', :code, 'active', now(), now())"
            ),
            {
                "id": uuid.uuid4(),
                "uid": user_id,
                "code": f"AD-{uuid.uuid4().hex[:10].upper()}",
            },
        )
        await db.commit()
    return _admin_token(user_id), user_id, mobile


async def _initiate(client: AsyncClient, current: str, requested: str) -> tuple[str, str]:
    response = await client.post(
        "/api/v1/mobile-change/initiate",
        json={"current_mobile": current, "requested_mobile": requested, "company": ""},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["delivery_channel"] == "none"
    assert body["otp_hint"]
    return body["challenge_token"], body["otp_hint"]


async def _submit_request(client: AsyncClient, current: str, requested: str) -> None:
    challenge, otp = await _initiate(client, current, requested)
    response = await client.post(
        "/api/v1/mobile-change/verify",
        json={"challenge_token": challenge, "otp": otp},
    )
    assert response.status_code == 200, response.text


async def _request_for(client: AsyncClient, admin_token: str, user_id: str) -> dict[str, object]:
    response = await client.get(
        "/api/v1/admin/mobile-change-requests", headers=_headers(admin_token)
    )
    assert response.status_code == 200, response.text
    return next(row for row in response.json()["requests"] if row["auth_user_uuid"] == user_id)


async def test_public_responses_do_not_enumerate_account_existence(client: AsyncClient) -> None:
    _, known = await full_registration(client)
    known_new = unique_mobile()
    unknown = unique_mobile()
    unknown_new = unique_mobile()

    known_challenge, known_otp = await _initiate(client, known, known_new)
    unknown_challenge, unknown_otp = await _initiate(client, unknown, unknown_new)
    known_result = await client.post(
        "/api/v1/mobile-change/verify",
        json={"challenge_token": known_challenge, "otp": known_otp},
    )
    unknown_result = await client.post(
        "/api/v1/mobile-change/verify",
        json={"challenge_token": unknown_challenge, "otp": unknown_otp},
    )
    assert known_result.status_code == unknown_result.status_code == 200
    assert known_result.json() == unknown_result.json()


async def test_challenge_ticket_cannot_authenticate_as_target(client: AsyncClient) -> None:
    _, current = await full_registration(client)
    challenge, _ = await _initiate(client, current, unique_mobile())
    response = await client.get("/api/v1/auth/me", headers=_headers(challenge))
    assert response.status_code == 401


async def test_authenticated_initiation_requires_current_password(client: AsyncClient) -> None:
    token, _ = await full_registration(client)
    response = await client.post(
        "/api/v1/mobile-change/authenticated/initiate",
        headers=_headers(token),
        json={"requested_mobile": unique_mobile(), "current_password": "Wrong@123"},
    )
    assert response.status_code == 403


async def test_sub_admin_cannot_list_or_review_requests(client: AsyncClient) -> None:
    token, user_id, _ = await _make_admin(client)
    sub_admin_token = create_access_token(
        {
            "sub": user_id,
            "role": "sub_admin",
            "business_line": "",
            "platform_scope": "true",
            "session_version": 1,
        }
    )
    response = await client.get(
        "/api/v1/admin/mobile-change-requests", headers=_headers(sub_admin_token)
    )
    assert response.status_code == 403
    assert token


async def test_deactivated_admin_token_cannot_read_queue(client: AsyncClient) -> None:
    admin_token, admin_id, _ = await _make_admin(client)
    import app.db.session as session_mod

    async with session_mod.AsyncSessionLocal() as db:
        await db.execute(
            text("UPDATE staff_profiles SET status = 'inactive' WHERE auth_user_uuid = :uid"),
            {"uid": admin_id},
        )
        await db.commit()

    response = await client.get(
        "/api/v1/admin/mobile-change-requests", headers=_headers(admin_token)
    )
    assert response.status_code == 403


async def test_platform_admin_account_is_not_eligible_target(client: AsyncClient) -> None:
    admin_token, admin_id, admin_mobile = await _make_admin(client)
    await _submit_request(client, admin_mobile, unique_mobile())
    response = await client.get(
        "/api/v1/admin/mobile-change-requests", headers=_headers(admin_token)
    )
    assert response.status_code == 200
    assert all(row["auth_user_uuid"] != admin_id for row in response.json()["requests"])


async def test_replacement_collision_blocks_identity_verification(client: AsyncClient) -> None:
    _, current = await full_registration(client)
    _, replacement = await full_registration(client)
    target_id = await _user_id(current)
    admin_token, _, _ = await _make_admin(client)
    await _submit_request(client, current, replacement)
    request = await _request_for(client, admin_token, target_id)
    assert "replacement_number_in_use" in request["conflicts"]

    response = await client.post(
        f"/api/v1/admin/mobile-change-requests/{request['id']}/verify",
        headers=_headers(admin_token),
        json={
            "proof_method": "in_person",
            "proof_attestation": "branch-visit-case-42",
            "current_password": PASSWORD,
        },
    )
    assert response.status_code == 409


async def test_unlinked_lead_collision_is_not_hidden_by_linked_rows(
    client: AsyncClient,
) -> None:
    _, current = await full_registration(client)
    target_id = await _user_id(current)
    replacement = unique_mobile()
    admin_token, _, _ = await _make_admin(client)
    import app.db.session as session_mod

    async with session_mod.AsyncSessionLocal() as db:
        profile_id = await db.scalar(
            text(
                "SELECT id FROM client_profiles "
                "WHERE auth_user_uuid = :uid AND business_line = 'loans'"
            ),
            {"uid": target_id},
        )
        assert profile_id is not None
        for _ in range(3):
            await db.execute(
                text(
                    "INSERT INTO leads "
                    "(id, client_profile_uuid, business_line, origin, mobile, status, "
                    "created_at, updated_at) VALUES "
                    "(:id, :profile, 'loans', 'direct', :number, 'closed', now(), now())"
                ),
                {"id": uuid.uuid4(), "profile": profile_id, "number": replacement},
            )
        await db.execute(
            text(
                "INSERT INTO leads "
                "(id, origin, mobile, status, created_at, updated_at) "
                "VALUES (:id, 'direct', :number, 'new', now(), now())"
            ),
            {"id": uuid.uuid4(), "number": replacement},
        )
        await db.commit()

    await _submit_request(client, current, replacement)
    request = await _request_for(client, admin_token, target_id)
    assert "replacement_number_has_unlinked_lead" in request["conflicts"]


async def test_proof_attestation_rejects_contact_details(client: AsyncClient) -> None:
    _, current = await full_registration(client)
    target_id = await _user_id(current)
    admin_token, _, _ = await _make_admin(client)
    await _submit_request(client, current, unique_mobile())
    request = await _request_for(client, admin_token, target_id)
    response = await client.post(
        f"/api/v1/admin/mobile-change-requests/{request['id']}/verify",
        headers=_headers(admin_token),
        json={
            "proof_method": "verified_email",
            "proof_attestation": "customer@example.com",
            "current_password": PASSWORD,
        },
    )
    assert response.status_code == 422

    rejected = await client.post(
        f"/api/v1/admin/mobile-change-requests/{request['id']}/reject",
        headers=_headers(admin_token),
        json={
            "reason": "Contact customer@example.com for the failure detail",
            "current_password": PASSWORD,
        },
    )
    assert rejected.status_code == 422


async def test_generic_ticket_advance_cannot_bypass_structured_review(client: AsyncClient) -> None:
    _, current = await full_registration(client)
    target_id = await _user_id(current)
    admin_token, _, _ = await _make_admin(client)
    await _submit_request(client, current, unique_mobile())
    request = await _request_for(client, admin_token, target_id)
    response = await client.patch(
        f"/api/v1/admin/support-tickets/{request['support_ticket_uuid']}",
        headers=_headers(admin_token),
        json={"status": "in_progress"},
    )
    assert response.status_code == 409


async def test_account_deletion_cancels_and_scrubs_active_request(client: AsyncClient) -> None:
    access_token, current = await full_registration(client)
    target_id = await _user_id(current)
    admin_token, _, _ = await _make_admin(client)
    await _submit_request(client, current, unique_mobile())
    request = await _request_for(client, admin_token, target_id)

    deleted = await client.request(
        "DELETE",
        "/api/v1/auth/me",
        headers=_headers(access_token),
        json={"current_password": PASSWORD},
    )
    assert deleted.status_code == 200, deleted.text

    import app.db.session as session_mod

    async with session_mod.AsyncSessionLocal() as db:
        scrubbed = (
            await db.execute(
                text(
                    "SELECT status, current_mobile, requested_mobile, proof_attestation, "
                    "rejection_reason FROM mobile_change_requests WHERE id = :id"
                ),
                {"id": request["id"]},
            )
        ).one()
    assert scrubbed.status == "cancelled"
    assert scrubbed.current_mobile is None
    assert scrubbed.requested_mobile is None
    assert scrubbed.proof_attestation is None
    assert scrubbed.rejection_reason is None


async def test_maker_checker_completion_updates_identity_and_revokes_sessions(
    client: AsyncClient,
) -> None:
    old_access, current = await full_registration(client)
    target_refresh = client.cookies.get("refresh_token")
    assert target_refresh is not None
    old_reset_initiate = await client.post("/api/v1/auth/forgot/initiate", json={"mobile": current})
    old_reset_otp = old_reset_initiate.json()["otp_hint"]
    old_reset_verify = await client.post(
        "/api/v1/auth/forgot/verify",
        json={"mobile": current, "otp": old_reset_otp},
    )
    old_reset_token = old_reset_verify.json()["reset_token"]
    target_id = await _user_id(current)
    replacement = unique_mobile()
    historical_referral_mobile = unique_mobile()
    maker_token, maker_id, _ = await _make_admin(client)
    checker_token, checker_id, _ = await _make_admin(client)
    assert len({target_id, maker_id, checker_id}) == 3

    # Seed linked operational contact snapshots; terminal/history rows are
    # intentionally not rewritten by completion.
    import app.db.session as session_mod

    async with session_mod.AsyncSessionLocal() as db:
        profile_id = await db.scalar(
            text(
                "SELECT id FROM client_profiles "
                "WHERE auth_user_uuid = :uid AND business_line = 'loans'"
            ),
            {"uid": target_id},
        )
        assert profile_id is not None
        await db.execute(
            text(
                "INSERT INTO leads "
                "(id, origin, mobile, status, created_at, updated_at) "
                "VALUES (:id, 'direct', :number, 'new', now(), now())"
            ),
            {"id": uuid.uuid4(), "number": current},
        )
        await db.execute(
            text(
                "INSERT INTO leads "
                "(id, client_profile_uuid, business_line, origin, mobile, status, "
                "created_at, updated_at) VALUES "
                "(:id, :profile, 'loans', 'direct', :number, 'closed', now(), now())"
            ),
            {"id": uuid.uuid4(), "profile": profile_id, "number": current},
        )
        await db.execute(
            text(
                "INSERT INTO enquiries "
                "(id, user_uuid, business_line, property_ref, title, locality, city, "
                "contact_name, contact_mobile, status, created_at, updated_at) VALUES "
                "(:id, :uid, 'real_estate', 'prop-1', 'Home', 'Area', 'City', "
                "'Customer', :number, 'new', now(), now())"
            ),
            {"id": uuid.uuid4(), "uid": target_id, "number": current},
        )
        await db.execute(
            text(
                "INSERT INTO enquiries "
                "(id, user_uuid, business_line, property_ref, title, locality, city, "
                "contact_name, contact_mobile, status, created_at, updated_at) VALUES "
                "(:id, :uid, 'real_estate', 'prop-closed', 'Old home', 'Area', 'City', "
                "'Customer', :number, 'closed', now(), now())"
            ),
            {"id": uuid.uuid4(), "uid": target_id, "number": current},
        )
        await db.execute(
            text(
                "INSERT INTO site_visits "
                "(id, user_uuid, business_line, property_ref, title, locality, city, "
                "contact_name, contact_mobile, preferred_date, preferred_time_slot, status, "
                "created_at, updated_at) VALUES "
                "(:id, :uid, 'real_estate', 'visit-live', 'Home', 'Area', 'City', "
                "'Customer', :number, current_date + 1, 'morning', 'requested', now(), now())"
            ),
            {"id": uuid.uuid4(), "uid": target_id, "number": current},
        )
        await db.execute(
            text(
                "INSERT INTO site_visits "
                "(id, user_uuid, business_line, property_ref, title, locality, city, "
                "contact_name, contact_mobile, preferred_date, preferred_time_slot, status, "
                "created_at, updated_at) VALUES "
                "(:id, :uid, 'real_estate', 'visit-done', 'Old home', 'Area', 'City', "
                "'Customer', :number, current_date - 1, 'morning', 'done', now(), now())"
            ),
            {"id": uuid.uuid4(), "uid": target_id, "number": current},
        )
        await db.execute(
            text(
                "INSERT INTO referrals "
                "(id, referrer_auth_user_uuid, referred_mobile, referred_auth_user_uuid, "
                "conversion_status, created_at, updated_at) VALUES "
                "(:id, :referrer, :number, :target, 'pending', now(), now())"
            ),
            {
                "id": uuid.uuid4(),
                "referrer": maker_id,
                "number": current,
                "target": target_id,
            },
        )
        await db.execute(
            text(
                "INSERT INTO referrals "
                "(id, referrer_auth_user_uuid, referred_mobile, referred_auth_user_uuid, "
                "conversion_status, created_at, updated_at) VALUES "
                "(:id, :referrer, :number, :target, 'void', now(), now())"
            ),
            {
                "id": uuid.uuid4(),
                "referrer": checker_id,
                "number": historical_referral_mobile,
                "target": target_id,
            },
        )
        await db.execute(
            text(
                "INSERT INTO agent_applications "
                "(id, applicant_auth_user_uuid, first_name, last_name, mobile, business_line, "
                "status, created_at) VALUES "
                "(:id, :uid, 'Target', 'User', :number, 'loans', 'pending', now())"
            ),
            {"id": uuid.uuid4(), "uid": target_id, "number": current},
        )
        await db.commit()

    await _submit_request(client, current, replacement)
    request = await _request_for(client, maker_token, target_id)
    verified = await client.post(
        f"/api/v1/admin/mobile-change-requests/{request['id']}/verify",
        headers=_headers(maker_token),
        json={
            "proof_method": "in_person",
            "proof_attestation": "branch-visit-case-84",
            "current_password": PASSWORD,
        },
    )
    assert verified.status_code == 200, verified.text

    same_admin = await client.post(
        f"/api/v1/admin/mobile-change-requests/{request['id']}/complete",
        headers=_headers(maker_token),
        json={"current_password": PASSWORD},
    )
    assert same_admin.status_code == 409

    completed = await client.post(
        f"/api/v1/admin/mobile-change-requests/{request['id']}/complete",
        headers=_headers(checker_token),
        json={"current_password": PASSWORD},
    )
    assert completed.status_code == 200, completed.text

    assert (await client.get("/api/v1/auth/me", headers=_headers(old_access))).status_code == 401
    assert (
        await client.post("/api/v1/auth/login", json={"mobile": current, "password": PASSWORD})
    ).status_code == 401
    assert (
        await client.post("/api/v1/auth/login", json={"mobile": replacement, "password": PASSWORD})
    ).status_code == 200
    client.cookies.set("refresh_token", target_refresh)
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
    stale_reset = await client.post(
        "/api/v1/auth/forgot/reset",
        json={
            "reset_token": old_reset_token,
            "new_password": "Changed@456",
            "confirm_password": "Changed@456",
        },
    )
    assert stale_reset.status_code == 400

    new_reset_initiate = await client.post(
        "/api/v1/auth/forgot/initiate", json={"mobile": replacement}
    )
    new_reset_otp = new_reset_initiate.json()["otp_hint"]
    new_reset_verify = await client.post(
        "/api/v1/auth/forgot/verify",
        json={"mobile": replacement, "otp": new_reset_otp},
    )
    new_reset = await client.post(
        "/api/v1/auth/forgot/reset",
        json={
            "reset_token": new_reset_verify.json()["reset_token"],
            "new_password": "Changed@456",
            "confirm_password": "Changed@456",
        },
    )
    assert new_reset.status_code == 200, new_reset.text
    assert (
        await client.post(
            "/api/v1/auth/login",
            json={"mobile": replacement, "password": "Changed@456"},
        )
    ).status_code == 200

    async with session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("SELECT mobile, session_version FROM auth_users WHERE id = :uid"),
                {"uid": target_id},
            )
        ).one()
        assert row.mobile == replacement
        assert row.session_version == 2
        lead_numbers = (
            await db.execute(
                text(
                    "SELECT status, mobile FROM leads WHERE client_profile_uuid IN "
                    "(SELECT id FROM client_profiles WHERE auth_user_uuid = :uid) "
                    "ORDER BY status"
                ),
                {"uid": target_id},
            )
        ).all()
        assert any(row.status == "closed" and row.mobile == current for row in lead_numbers)
        live_leads = [row for row in lead_numbers if row.status != "closed"]
        assert len(live_leads) == 1
        assert live_leads[0].status in {"new", "assigned"}
        assert live_leads[0].mobile == replacement
        unlinked_old_count = await db.scalar(
            text(
                "SELECT count(*) FROM leads WHERE client_profile_uuid IS NULL AND mobile = :number"
            ),
            {"number": current},
        )
        assert unlinked_old_count and unlinked_old_count >= 1
        enquiry_numbers = (
            await db.execute(
                text(
                    "SELECT status, contact_mobile FROM enquiries WHERE user_uuid = :uid "
                    "ORDER BY status"
                ),
                {"uid": target_id},
            )
        ).all()
        assert {row.status: row.contact_mobile for row in enquiry_numbers} == {
            "closed": current,
            "new": replacement,
        }
        visit_numbers = (
            await db.execute(
                text(
                    "SELECT status, contact_mobile FROM site_visits WHERE user_uuid = :uid "
                    "ORDER BY status"
                ),
                {"uid": target_id},
            )
        ).all()
        assert {row.status: row.contact_mobile for row in visit_numbers} == {
            "done": current,
            "requested": replacement,
        }
        referral_numbers = (
            await db.execute(
                text(
                    "SELECT conversion_status, referred_mobile FROM referrals "
                    "WHERE referred_auth_user_uuid = :uid ORDER BY conversion_status"
                ),
                {"uid": target_id},
            )
        ).all()
        assert {row.conversion_status: row.referred_mobile for row in referral_numbers} == {
            "pending": replacement,
            "void": historical_referral_mobile,
        }
        application_number = await db.scalar(
            text(
                "SELECT mobile FROM agent_applications "
                "WHERE applicant_auth_user_uuid = :uid AND status = 'pending'"
            ),
            {"uid": target_id},
        )
        assert application_number == replacement
        terminal = (
            await db.execute(
                text(
                    "SELECT status, current_mobile, requested_mobile FROM mobile_change_requests "
                    "WHERE id = :id"
                ),
                {"id": request["id"]},
            )
        ).one()
        assert terminal.status == "completed"
        assert terminal.current_mobile is None
        assert terminal.requested_mobile is None
        audit_details = (
            await db.scalars(
                text(
                    "SELECT detail::text FROM audit_log WHERE entity_uuid = :id ORDER BY created_at"
                ),
                {"id": request["id"]},
            )
        ).all()
        assert audit_details
        assert all(current not in detail and replacement not in detail for detail in audit_details)


async def test_completion_serializes_with_concurrent_refresh_rotation(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, current = await full_registration(client)
    target_refresh = client.cookies.get("refresh_token")
    assert target_refresh is not None
    target_id = await _user_id(current)
    replacement = unique_mobile()
    maker_token, _, _ = await _make_admin(client)
    checker_token, _, _ = await _make_admin(client)

    await _submit_request(client, current, replacement)
    request = await _request_for(client, maker_token, target_id)
    verified = await client.post(
        f"/api/v1/admin/mobile-change-requests/{request['id']}/verify",
        headers=_headers(maker_token),
        json={
            "proof_method": "in_person",
            "proof_attestation": "branch-visit-race-11",
            "current_password": PASSWORD,
        },
    )
    assert verified.status_code == 200, verified.text

    import app.services.mobile_change as mobile_change_service

    transaction_ready = asyncio.Event()
    allow_commit = asyncio.Event()
    original_record_audit = mobile_change_service.record_audit

    async def hold_before_commit(*args: object, **kwargs: object) -> object:
        result = await original_record_audit(*args, **kwargs)
        transaction_ready.set()
        await allow_commit.wait()
        return result

    monkeypatch.setattr(mobile_change_service, "record_audit", hold_before_commit)
    completion_task = asyncio.create_task(
        client.post(
            f"/api/v1/admin/mobile-change-requests/{request['id']}/complete",
            headers=_headers(checker_token),
            json={"current_password": PASSWORD},
        )
    )
    await asyncio.wait_for(transaction_ready.wait(), timeout=5)

    refresh_task = asyncio.create_task(
        client.post(
            "/api/v1/auth/refresh",
            headers={"Cookie": f"refresh_token={target_refresh}"},
        )
    )
    await asyncio.sleep(0.05)
    assert not refresh_task.done()

    allow_commit.set()
    completed, refreshed = await asyncio.gather(completion_task, refresh_task)
    assert completed.status_code == 200, completed.text
    assert refreshed.status_code == 401, refreshed.text


async def test_concurrent_registration_wins_as_atomic_completion_conflict(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, current = await full_registration(client)
    target_id = await _user_id(current)
    replacement = unique_mobile()
    maker_token, _, _ = await _make_admin(client)
    checker_token, _, _ = await _make_admin(client)

    await _submit_request(client, current, replacement)
    request = await _request_for(client, maker_token, target_id)
    verified = await client.post(
        f"/api/v1/admin/mobile-change-requests/{request['id']}/verify",
        headers=_headers(maker_token),
        json={
            "proof_method": "in_person",
            "proof_attestation": "branch-visit-race-22",
            "current_password": PASSWORD,
        },
    )
    assert verified.status_code == 200, verified.text

    import app.services.mobile_change as mobile_change_service

    preflight_done = asyncio.Event()
    allow_completion = asyncio.Event()
    original_conflicts = mobile_change_service._conflicts

    async def hold_after_preflight(db: AsyncSession, request_row: MobileChangeRequest) -> list[str]:
        result = await original_conflicts(db, request_row)
        preflight_done.set()
        await allow_completion.wait()
        return result

    monkeypatch.setattr(mobile_change_service, "_conflicts", hold_after_preflight)
    completion_task = asyncio.create_task(
        client.post(
            f"/api/v1/admin/mobile-change-requests/{request['id']}/complete",
            headers=_headers(checker_token),
            json={"current_password": PASSWORD},
        )
    )
    await asyncio.wait_for(preflight_done.wait(), timeout=5)

    await full_registration(client, mobile=replacement)
    allow_completion.set()
    completed = await completion_task
    assert completed.status_code == 409, completed.text

    import app.db.session as session_mod

    async with session_mod.AsyncSessionLocal() as db:
        target_mobile = await db.scalar(
            text("SELECT mobile FROM auth_users WHERE id = :uid"), {"uid": target_id}
        )
        request_status = await db.scalar(
            text("SELECT status FROM mobile_change_requests WHERE id = :id"),
            {"id": request["id"]},
        )
    assert target_mobile == current
    assert request_status == "pending_approval"
