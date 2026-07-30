"""Self-service account deletion — DELETE /api/v1/auth/me (SRS 5.1, FR-17.3).

httpx 0.28 dropped body support from the AsyncClient.delete() convenience
method, so every call here goes through the generic .request("DELETE", ...)
instead — the server itself has no such restriction (matches the frontend's
fetch-based client, which also has no issue sending a DELETE body).

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import asyncio
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from conftest import PASSWORD, full_registration, unique_email, unique_mobile


async def _delete_me(client: AsyncClient, access_token: str, password: str = PASSWORD):
    return await client.request(
        "DELETE",
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"current_password": password},
    )


async def _get_user_row(uid: str) -> dict:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT id, mobile, email, status, password_hash, "
                    "phone_verified_at, email_verified_at FROM auth_users WHERE id = :id"
                ),
                {"id": uid},
            )
        ).fetchone()
        assert row is not None
        return dict(row._mapping)


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None, f"no auth_user for {mobile}"
        return str(row[0])


async def _client_profile_statuses(uid: str) -> list[str]:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                text("SELECT status FROM client_profiles WHERE auth_user_uuid = :uid"),
                {"uid": uid},
            )
        ).fetchall()
        return [r[0] for r in rows]


async def _seed_staff_profile(uid: str) -> None:
    """Ties a StaffProfile to an EXISTING auth_user (the same identity being
    deleted) — this is the row Phase B exists for: staff_profiles_rls's WITH
    CHECK has no owner branch, so a client-session write to it would fail."""
    import app.db.session as _session_mod
    from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole

    async with _session_mod.AsyncSessionLocal() as db:
        db.add(
            StaffProfile(
                auth_user_uuid=uuid.UUID(uid),
                role=StaffRole.TELECALLER,
                scope=ProfileScope.LINE,
                business_line="loans",
                staff_code=f"TC-{uuid.uuid4().hex[:8]}",
                status=ProfileStatus.ACTIVE,
            )
        )
        await db.commit()


async def _staff_profile_status(uid: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("SELECT status FROM staff_profiles WHERE auth_user_uuid = :uid"),
                {"uid": uid},
            )
        ).fetchone()
        assert row is not None
        return row[0]


async def _seed_agent_profile(uid: str) -> None:
    import app.db.session as _session_mod
    from app.models.profile import AgentProfile, ProfileStatus

    async with _session_mod.AsyncSessionLocal() as db:
        db.add(
            AgentProfile(
                auth_user_uuid=uuid.UUID(uid),
                agent_code=f"AG-{uuid.uuid4().hex[:8]}",
                business_line="real_estate",
                status=ProfileStatus.ACTIVE,
            )
        )
        await db.commit()


async def _agent_profile_status(uid: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("SELECT status FROM agent_profiles WHERE auth_user_uuid = :uid"),
                {"uid": uid},
            )
        ).fetchone()
        assert row is not None
        return row[0]


async def _seed_payout(uid: str, *, status=None, payout_type=None) -> str:
    import app.db.session as _session_mod
    from app.models.payout import Payout, PayoutDestination, PayoutStatus, PayoutType

    async with _session_mod.AsyncSessionLocal() as db:
        payout = Payout(
            recipient_user_uuid=uuid.UUID(uid),
            type=payout_type or PayoutType.CASHBACK,
            amount_paise=25_000,
            currency="INR",
            status=status or PayoutStatus.PAID,
            destination_type=PayoutDestination.VPA,
            destination_hint="***@okhdfc",
            idempotency_key=uuid.uuid4().hex,
            maker_user_uuid=uuid.UUID(uid),
        )
        db.add(payout)
        await db.commit()
        return str(payout.id)


async def _get_payout(payout_id: str) -> dict:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT recipient_user_uuid, retained_ref, delinked_at, status, "
                    "reject_reason FROM payouts WHERE id = :id"
                ),
                {"id": payout_id},
            )
        ).fetchone()
        assert row is not None
        return dict(row._mapping)


async def _auth_event_reason(uid: str) -> str | None:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT detail FROM auth_events "
                    "WHERE auth_user_uuid = :id AND event_type = 'account_deleted' "
                    "ORDER BY created_at DESC LIMIT 1"
                ),
                {"id": uid},
            )
        ).fetchone()
        assert row is not None
        return row[0].get("reason")


async def _seed_agent_application(uid: str) -> dict[str, str]:
    import app.db.session as _session_mod
    from app.models.profile import AgentApplication, SubmissionStatus

    keys = {
        "aadhaar_ref": f"agent-applications/{uuid.uuid4().hex}/aadhaar",
        "aadhaar_back_ref": f"agent-applications/{uuid.uuid4().hex}/aadhaar-back",
        "pan_ref": f"agent-applications/{uuid.uuid4().hex}/pan",
        "photo_ref": f"agent-applications/{uuid.uuid4().hex}/photo",
    }
    async with _session_mod.AsyncSessionLocal() as db:
        db.add(
            AgentApplication(
                applicant_auth_user_uuid=uuid.UUID(uid),
                first_name="Ravi",
                last_name="Kumar",
                mobile=unique_mobile(),
                email=unique_email(),
                business_line="real_estate",
                status=SubmissionStatus.PENDING,
                **keys,
            )
        )
        await db.commit()
    return keys


async def _seed_transaction(uid: str) -> str:
    import app.db.session as _session_mod
    from app.models.transaction import Transaction, TransactionStatus, TransactionType

    async with _session_mod.AsyncSessionLocal() as db:
        txn = Transaction(
            user_uuid=uuid.UUID(uid),
            business_line=None,
            type=TransactionType.CASHBACK,
            status=TransactionStatus.PAID,
            amount_paise=50_000,
            currency="INR",
            description="Test cashback",
        )
        db.add(txn)
        await db.commit()
        return str(txn.id)


async def _get_transaction(txn_id: str) -> dict:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT user_uuid, retained_ref, delinked_at FROM transactions WHERE id = :id"
                ),
                {"id": txn_id},
            )
        ).fetchone()
        assert row is not None
        return dict(row._mapping)


async def _seed_ticket(auth_user_uuid: str) -> str:
    """Insert a support_ticket via the app superuser (bypasses RLS)."""
    import app.db.session as _session_mod
    from app.models.support_ticket import SupportCategory, SupportTicket

    async with _session_mod.AsyncSessionLocal() as db:
        ticket = SupportTicket(
            auth_user_uuid=uuid.UUID(auth_user_uuid),
            category=SupportCategory.GENERAL,
            subject="Need help",
            body="Something went wrong.",
        )
        db.add(ticket)
        await db.commit()
        return str(ticket.id)


async def _get_ticket(ticket_id: str) -> dict:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("SELECT subject, body, category, status FROM support_tickets WHERE id = :id"),
                {"id": ticket_id},
            )
        ).fetchone()
        assert row is not None
        return dict(row._mapping)


# ---------------------------------------------------------------------------
# Core flow
# ---------------------------------------------------------------------------


async def test_delete_wrong_password_returns_401_and_nothing_mutated(
    client: AsyncClient,
) -> None:
    access_token, mobile = await full_registration(client)
    resp = await _delete_me(client, access_token, "WrongPass@1")
    assert resp.status_code == 401

    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me.status_code == 200
    assert me.json()["mobile"] == mobile


async def test_delete_correct_password_returns_200_and_tombstones(client: AsyncClient) -> None:
    access_token, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)

    resp = await _delete_me(client, access_token)
    assert resp.status_code == 200, resp.text

    row = await _get_user_row(uid)
    assert row["status"] == "soft_deleted"
    assert row["mobile"] != mobile
    assert row["mobile"] == f"deleted-{uid}"
    assert row["email"] == f"deleted+{uid}@deleted.invalid"
    assert row["password_hash"] is None
    assert row["phone_verified_at"] is None
    assert row["email_verified_at"] is None


async def test_delete_clears_refresh_cookie(client: AsyncClient) -> None:
    access_token, _ = await full_registration(client)
    resp = await _delete_me(client, access_token)
    set_cookie = resp.headers.get("set-cookie", "")
    assert "refresh_token" in set_cookie
    assert "max-age=0" in set_cookie.lower() or "expires=" in set_cookie.lower()


async def test_delete_revokes_refresh_token(client: AsyncClient) -> None:
    access_token, _ = await full_registration(client)
    live_cookie = client.cookies.get("refresh_token")

    await _delete_me(client, access_token)

    client.cookies.set("refresh_token", live_cookie)
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401


async def test_delete_blacklists_access_token(client: AsyncClient) -> None:
    access_token, _ = await full_registration(client)
    await _delete_me(client, access_token)
    resp = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert resp.status_code == 401


async def test_delete_second_attempt_returns_401_password_cleared(client: AsyncClient) -> None:
    """password_hash is None after deletion, so a second self-service attempt
    (even with a fresh, non-blacklisted token minted for the same identity)
    fails the password check before ever reaching the already-deleted guard."""
    from app.core.security import create_access_token

    access_token, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    await _delete_me(client, access_token)

    fresh_token = create_access_token({"sub": uid, "role": "client", "business_line": "loans"})
    resp = await _delete_me(client, fresh_token)
    assert resp.status_code == 401


async def test_delete_no_auth_header_returns_401(client: AsyncClient) -> None:
    resp = await client.request("DELETE", "/api/v1/auth/me", json={"current_password": PASSWORD})
    assert resp.status_code == 401


async def test_delete_missing_password_returns_422(client: AsyncClient) -> None:
    access_token, _ = await full_registration(client)
    resp = await client.request(
        "DELETE",
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
        json={},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Multi-profile identity
# ---------------------------------------------------------------------------


async def test_delete_flips_all_client_profiles_inactive(client: AsyncClient) -> None:
    """Every self-registered client holds TWO ClientProfile rows (loans +
    real_estate) — both must flip, not just one."""
    access_token, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    assert len(await _client_profile_statuses(uid)) == 2  # sanity: both lines exist pre-delete

    await _delete_me(client, access_token)

    statuses = await _client_profile_statuses(uid)
    assert len(statuses) == 2
    assert all(s == "inactive" for s in statuses)


async def test_delete_flips_staff_profile_inactive(client: AsyncClient) -> None:
    """The Phase B case this whole two-session design exists for:
    staff_profiles_rls's WITH CHECK has no owner branch, so this can only
    happen on the bypass session, never the caller's own RLS-scoped one."""
    access_token, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    await _seed_staff_profile(uid)

    await _delete_me(client, access_token)

    assert await _staff_profile_status(uid) == "inactive"


async def test_delete_flips_agent_profile_inactive(client: AsyncClient) -> None:
    access_token, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    await _seed_agent_profile(uid)

    await _delete_me(client, access_token)

    assert await _agent_profile_status(uid) == "inactive"


# ---------------------------------------------------------------------------
# Agent-application PII scrub + storage cleanup
# ---------------------------------------------------------------------------


async def test_delete_scrubs_agent_application_and_deletes_storage(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services import storage

    deleted_keys: list[str] = []
    monkeypatch.setattr(storage, "delete_object", lambda key: deleted_keys.append(key))

    access_token, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    doc_keys = await _seed_agent_application(uid)

    await _delete_me(client, access_token)

    assert set(deleted_keys) == set(doc_keys.values())

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT first_name, mobile, email, aadhaar_ref, photo_ref "
                    "FROM agent_applications WHERE applicant_auth_user_uuid = :uid"
                ),
                {"uid": uid},
            )
        ).fetchone()
    assert row is not None
    assert row[0] is None and row[1] is None and row[2] is None
    assert row[3] is None and row[4] is None


# ---------------------------------------------------------------------------
# Financial de-link (transactions/payouts)
# ---------------------------------------------------------------------------


async def test_delete_delinks_transaction(client: AsyncClient) -> None:
    access_token, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    txn_id = await _seed_transaction(uid)

    await _delete_me(client, access_token)

    row = await _get_transaction(txn_id)
    assert row["user_uuid"] is None
    assert row["retained_ref"] == uid
    assert row["delinked_at"] is not None


async def test_delete_delinks_payout(client: AsyncClient) -> None:
    access_token, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    payout_id = await _seed_payout(uid)

    await _delete_me(client, access_token)

    row = await _get_payout(payout_id)
    assert row["recipient_user_uuid"] is None
    assert row["retained_ref"] == uid
    assert row["delinked_at"] is not None


# ---------------------------------------------------------------------------
# In-flight payout at deletion time (feature-status.md §2 #17)
# ---------------------------------------------------------------------------


async def _payout_rejected_audit_count(payout_id: str) -> int:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        return await db.scalar(
            text(
                "SELECT count(*) FROM audit_log WHERE action = 'payout_rejected' "
                "AND entity_uuid = :id"
            ),
            {"id": payout_id},
        )


async def _seed_commission_linked_to_payout(uid: str, payout_id: str) -> str:
    """A minimal commission row pointing at payout_id, PENDING (unpaid) —
    proves apply_release_link actually fires for a payout rejected at
    deletion time, not just that the payout's own status flips."""
    import app.db.session as _session_mod
    from app.models.commission import Commission, CommissionStatus
    from app.models.lead import Lead, LeadOrigin, LeadStatus
    from app.models.loan import LoanApplication, LoanStatus, LoanType
    from app.models.profile import AgentProfile, ClientProfile, ProfileStatus

    async with _session_mod.AsyncSessionLocal() as db:
        agent = AgentProfile(
            auth_user_uuid=uuid.UUID(uid),
            agent_code=f"AG-{uuid.uuid4().hex[:8]}",
            business_line="loans",
            status=ProfileStatus.ACTIVE,
        )
        lead = Lead(
            name="Test Lead",
            mobile=unique_mobile(),
            business_line="loans",
            status=LeadStatus.NEW,
            origin=LeadOrigin.AGENT,
        )
        client_user_id = uuid.uuid4()
        db.add_all([agent, lead])
        await db.flush()
        lead.origin_agent_profile_uuid = agent.id
        from app.models.user import User

        client_user = User(
            id=client_user_id,
            first_name="Test",
            last_name="Client",
            mobile=unique_mobile(),
            email=f"cl_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(client_user)
        await db.flush()
        client_profile = ClientProfile(
            auth_user_uuid=client_user.id,
            business_line="loans",
            customer_code=f"CL{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        loan_type = LoanType(name=f"lt_{uuid.uuid4().hex[:8]}", label="Test Loan Type")
        db.add_all([client_profile, loan_type])
        await db.flush()
        from datetime import UTC, datetime

        loan = LoanApplication(
            lead_uuid=lead.id,
            client_profile_uuid=client_profile.id,
            business_line="loans",
            loan_type_id=loan_type.id,
            amount_requested=100000,
            status=LoanStatus.DISBURSED,
            opened_at=datetime.now(UTC),
            closed_at=datetime.now(UTC),
            disbursed_at=datetime.now(UTC),
        )
        db.add(loan)
        await db.flush()
        commission = Commission(
            agent_auth_user_uuid=uuid.UUID(uid),
            agent_profile_uuid=agent.id,
            business_line="loans",
            lead_uuid=lead.id,
            loan_application_uuid=loan.id,
            agreed_amount_paise=25_000,
            status=CommissionStatus.PENDING,
            entered_by_uuid=uuid.UUID(uid),
            payout_uuid=uuid.UUID(payout_id),
        )
        db.add(commission)
        await db.commit()
        return str(commission.id)


async def _get_commission_status(commission_id: str) -> dict:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text("SELECT status, payout_uuid FROM commissions WHERE id = :id"),
                {"id": commission_id},
            )
        ).fetchone()
        assert row is not None
        return dict(row._mapping)


@pytest.mark.parametrize("status", ["pending_approval", "approved"])
async def test_delete_rejects_not_yet_departed_payout(client: AsyncClient, status: str) -> None:
    """A payout still awaiting approval or approved-but-not-initiated has not
    left the platform — deletion must reject it outright, not merely
    de-link it, so the deleted account is never paid."""
    from app.models.payout import PayoutStatus

    access_token, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    payout_id = await _seed_payout(uid, status=PayoutStatus(status))

    await _delete_me(client, access_token)

    row = await _get_payout(payout_id)
    assert row["status"] == "rejected"
    assert row["reject_reason"] is not None
    # Also de-linked in the same pass, since the account is gone regardless.
    assert row["recipient_user_uuid"] is None
    assert row["delinked_at"] is not None
    assert await _payout_rejected_audit_count(payout_id) == 1


async def test_delete_releases_commission_linked_to_rejected_payout(client: AsyncClient) -> None:
    """The source row of a payout rejected at deletion time must be released
    (apply_release_link), not left stranded pointing at a dead payout."""
    from app.models.payout import PayoutStatus, PayoutType

    access_token, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    payout_id = await _seed_payout(
        uid, status=PayoutStatus.PENDING_APPROVAL, payout_type=PayoutType.COMMISSION
    )
    commission_id = await _seed_commission_linked_to_payout(uid, payout_id)

    await _delete_me(client, access_token)

    commission = await _get_commission_status(commission_id)
    assert commission["status"] == "pending"
    assert commission["payout_uuid"] is None


async def test_delete_leaves_initiated_payout_status_untouched(client: AsyncClient) -> None:
    """An INITIATED payout may already be at the gateway and unrecallable —
    deletion must not reject it, only de-link it (existing behaviour)."""
    from app.models.payout import PayoutStatus

    access_token, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    payout_id = await _seed_payout(uid, status=PayoutStatus.INITIATED)

    await _delete_me(client, access_token)

    row = await _get_payout(payout_id)
    assert row["status"] == "initiated"
    assert row["reject_reason"] is None
    assert row["recipient_user_uuid"] is None
    assert row["delinked_at"] is not None
    assert await _payout_rejected_audit_count(payout_id) == 0


async def test_delete_regression_live_settle_leaves_transaction_not_delinked(
    client: AsyncClient,
) -> None:
    """Regression for the emitted-Transaction stamping in
    services/payments.py::_emit_ledger_row — a normal settle for a LIVE
    (never-deleted) account must leave retained_ref/delinked_at NULL."""
    import app.db.session as _session_mod
    from app.models.payout import Payout, PayoutDestination, PayoutStatus, PayoutType
    from app.services.payments import _emit_ledger_row

    access_token, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)

    async with _session_mod.AsyncSessionLocal() as db:
        payout = Payout(
            recipient_user_uuid=uuid.UUID(uid),
            type=PayoutType.CASHBACK,
            amount_paise=25_000,
            currency="INR",
            status=PayoutStatus.PAID,
            destination_type=PayoutDestination.VPA,
            destination_hint="***@okhdfc",
            idempotency_key=uuid.uuid4().hex,
            maker_user_uuid=uuid.UUID(uid),
        )
        db.add(payout)
        await db.flush()
        txn_id = await _emit_ledger_row(db, payout)
        await db.commit()

    row = await _get_transaction(str(txn_id))
    assert row["retained_ref"] is None
    assert row["delinked_at"] is None


# ---------------------------------------------------------------------------
# Support-ticket PII scrub
# ---------------------------------------------------------------------------


async def test_delete_scrubs_support_ticket_text_keeps_category_and_status(
    client: AsyncClient,
) -> None:
    access_token, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)
    ticket_id = await _seed_ticket(uid)

    await _delete_me(client, access_token)

    row = await _get_ticket(ticket_id)
    assert row["subject"] == "[deleted account — content removed]"
    assert row["body"] == "[deleted account — content removed]"
    assert row["category"] == "general"
    assert row["status"] == "open"


# ---------------------------------------------------------------------------
# Audit trail
# ---------------------------------------------------------------------------


async def test_delete_self_service_auth_event_has_no_reason(client: AsyncClient) -> None:
    access_token, mobile = await full_registration(client)
    uid = await _auth_user_uuid(mobile)

    await _delete_me(client, access_token)

    assert await _auth_event_reason(uid) is None


# ---------------------------------------------------------------------------
# Concurrency — the with_for_update lock is the sole idempotency guarantee
# ---------------------------------------------------------------------------


async def test_concurrent_delete_requests_serialize_via_row_lock(client: AsyncClient) -> None:
    """Two simultaneous DELETE /me calls for the same identity must not both
    "win": the row lock in delete_account forces the second to block until the
    first commits, then hit the already-deleted guard."""
    access_token, _ = await full_registration(client)

    results = await asyncio.gather(
        _delete_me(client, access_token),
        _delete_me(client, access_token),
    )

    statuses = sorted(r.status_code for r in results)
    assert statuses == [200, 409]


# ---------------------------------------------------------------------------
# Re-registration with the freed mobile/email
# ---------------------------------------------------------------------------


async def test_reregistration_with_freed_mobile_succeeds(client: AsyncClient) -> None:
    mobile = unique_mobile()
    email = unique_email()
    access_token, _ = await full_registration(client, mobile=mobile, email=email)
    old_uid = await _auth_user_uuid(mobile)
    old_me = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"}
    )
    old_codes = {p["customer_code"] for p in old_me.json()["profiles"]}

    await _delete_me(client, access_token)

    new_token, _ = await full_registration(
        client, mobile=mobile, email=email, password="NewPass@1234"
    )
    new_uid = await _auth_user_uuid(mobile)  # now resolves to the NEW row
    assert new_uid != old_uid

    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new_token}"})
    assert me.status_code == 200
    body = me.json()
    assert body["mobile"] == mobile
    # A brand-new registration mints its own customer codes — none of the old
    # identity's codes carry over, satisfying "none of the previous details
    # are visible on re-registration" (SRS 5.1).
    new_codes = {p["customer_code"] for p in body["profiles"]}
    assert new_codes.isdisjoint(old_codes)
