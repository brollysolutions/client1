"""Admin fee-cashback entry + oversight + cancel (FR-6.6).

Covers the eligible-application queue (all four conjuncts: disbursed,
fee_outcome='cashback', positive processing_fee, no live cashback), the
create-from-row invariant (recipient/line/fee snapshot derived server-side,
never from the request body), the amount<=fee DB+schema invariant, the
partial-unique double-entry guard, cancel + its payout-attached guard, and
role gating (line-scoped admin rejected — the same guard commissions.py,
reporting.py, and referrals.py all need, since deps.require_admin is
role-only).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.security import create_access_token
from app.models.lead import Lead, LeadOrigin, LeadStatus
from app.models.loan import FeeOutcome, LoanApplication, LoanStatus, LoanType
from app.models.payout import Payout, PayoutDestination, PayoutStatus, PayoutType
from app.models.profile import ClientProfile, ProfileStatus
from app.models.user import User
from conftest import full_registration, unique_mobile

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Seed helpers — bypass session, mirrors test_commission_api.py's shape
# ---------------------------------------------------------------------------


async def _auth_user_id(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None, f"no auth_user for {mobile}"
        return str(row[0])


def _admin_token(user_id: str, *, platform_scope: str = "true") -> str:
    return create_access_token(
        {"sub": user_id, "role": "admin", "business_line": "", "platform_scope": platform_scope}
    )


async def _make_admin(client: AsyncClient) -> tuple[str, str]:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_id(mobile)
    return _admin_token(uid), uid


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _seed_loan_application(
    *,
    business_line: str = "loans",
    status: LoanStatus = LoanStatus.DISBURSED,
    disbursed_at: datetime | None = "unset",  # type: ignore[assignment]
    fee_outcome: FeeOutcome | None = FeeOutcome.CASHBACK,
    processing_fee: float | None = 5000.00,
) -> tuple[str, str]:
    """Returns (loan_application_id, client_auth_user_uuid)."""
    import app.db.session as _session_mod

    if disbursed_at == "unset":
        disbursed_at = (
            datetime.now(UTC) if status in (LoanStatus.DISBURSED, LoanStatus.CLOSED) else None
        )

    async with _session_mod.AsyncSessionLocal() as db:
        client_user = User(
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
            business_line=business_line,
            customer_code=f"CL{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        lead = Lead(
            name="Test Lead",
            mobile=unique_mobile(),
            business_line=business_line,
            status=LeadStatus.NEW,
            origin=LeadOrigin.DIRECT,
        )
        loan_type = LoanType(name=f"lt_{uuid.uuid4().hex[:8]}", label="Test Loan Type")
        db.add_all([client_profile, lead, loan_type])
        await db.flush()
        application = LoanApplication(
            lead_uuid=lead.id,
            client_profile_uuid=client_profile.id,
            business_line=business_line,
            loan_type_id=loan_type.id,
            amount_requested=100000,
            processing_fee=processing_fee,
            fee_outcome=fee_outcome,
            status=status,
            opened_at=datetime.now(UTC),
            closed_at=datetime.now(UTC),
            disbursed_at=disbursed_at,
        )
        db.add(application)
        await db.commit()
        return str(application.id), str(client_user.id)


async def _get_cashback_row(cashback_id: str) -> dict:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT status, recipient_auth_user_uuid, business_line, payout_uuid, "
                    "processing_fee_paise, amount_paise "
                    "FROM fee_cashbacks WHERE id = :id"
                ),
                {"id": cashback_id},
            )
        ).fetchone()
        assert row is not None
        return {
            "status": row[0],
            "recipient_auth_user_uuid": row[1],
            "business_line": row[2],
            "payout_uuid": row[3],
            "processing_fee_paise": row[4],
            "amount_paise": row[5],
        }


# ---------------------------------------------------------------------------
# Eligible-application queue — all four conjuncts
# ---------------------------------------------------------------------------


async def test_eligible_includes_disbursed_cashback_application(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    loan_id, _ = await _seed_loan_application()

    res = await client.get("/api/v1/admin/fee-cashbacks/eligible", headers=_headers(admin_token))
    assert res.status_code == 200, res.text
    ids = [a["loan_application_uuid"] for a in res.json()["applications"]]
    assert loan_id in ids
    row = next(a for a in res.json()["applications"] if a["loan_application_uuid"] == loan_id)
    assert row["processing_fee_paise"] == 500_000  # 5000.00 rupees * 100


async def test_eligible_excludes_non_disbursed(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    loan_id, _ = await _seed_loan_application(status=LoanStatus.SANCTIONED, disbursed_at=None)

    res = await client.get("/api/v1/admin/fee-cashbacks/eligible", headers=_headers(admin_token))
    ids = [a["loan_application_uuid"] for a in res.json()["applications"]]
    assert loan_id not in ids


async def test_eligible_excludes_waived_fee_outcome(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    loan_id, _ = await _seed_loan_application(fee_outcome=FeeOutcome.WAIVED)

    res = await client.get("/api/v1/admin/fee-cashbacks/eligible", headers=_headers(admin_token))
    ids = [a["loan_application_uuid"] for a in res.json()["applications"]]
    assert loan_id not in ids


async def test_eligible_excludes_zero_processing_fee(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    loan_id, _ = await _seed_loan_application(processing_fee=0)

    res = await client.get("/api/v1/admin/fee-cashbacks/eligible", headers=_headers(admin_token))
    ids = [a["loan_application_uuid"] for a in res.json()["applications"]]
    assert loan_id not in ids


async def test_eligible_excludes_application_with_live_cashback(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    loan_id, _ = await _seed_loan_application()

    create_res = await client.post(
        "/api/v1/admin/fee-cashbacks",
        headers=_headers(admin_token),
        json={"loan_application_uuid": loan_id, "amount_paise": 200_000},
    )
    assert create_res.status_code == 201, create_res.text

    res = await client.get("/api/v1/admin/fee-cashbacks/eligible", headers=_headers(admin_token))
    ids = [a["loan_application_uuid"] for a in res.json()["applications"]]
    assert loan_id not in ids


async def test_loan_disbursed_then_closed_stays_eligible(client: AsyncClient) -> None:
    """Regression, mirroring commissions' identical fix: DISBURSED is not
    terminal — a loan normally moves on to CLOSED afterward. Eligibility
    must key off disbursed_at, not live status."""
    admin_token, _ = await _make_admin(client)
    loan_id, _ = await _seed_loan_application(status=LoanStatus.CLOSED)

    res = await client.get("/api/v1/admin/fee-cashbacks/eligible", headers=_headers(admin_token))
    ids = [a["loan_application_uuid"] for a in res.json()["applications"]]
    assert loan_id in ids


# ---------------------------------------------------------------------------
# Create — happy path + recipient/line/fee-snapshot-from-row invariant
# ---------------------------------------------------------------------------


async def test_create_fee_cashback_happy_path(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    loan_id, client_uid = await _seed_loan_application(processing_fee=3000.00)

    res = await client.post(
        "/api/v1/admin/fee-cashbacks",
        headers=_headers(admin_token),
        json={"loan_application_uuid": loan_id, "amount_paise": 250_000, "notes": "full refund"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["loan_application_uuid"] == loan_id
    assert body["business_line"] == "loans"
    assert body["processing_fee_paise"] == 300_000
    assert body["amount_paise"] == 250_000
    assert body["status"] == "pending"

    row = await _get_cashback_row(body["id"])
    assert row["recipient_auth_user_uuid"] == uuid.UUID(client_uid)
    assert row["processing_fee_paise"] == 300_000


async def test_create_amount_exceeding_fee_rejected(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    loan_id, _ = await _seed_loan_application(processing_fee=1000.00)  # 100_000 paise

    res = await client.post(
        "/api/v1/admin/fee-cashbacks",
        headers=_headers(admin_token),
        json={"loan_application_uuid": loan_id, "amount_paise": 150_000},
    )
    assert res.status_code == 409, res.text


async def test_create_non_disbursed_rejected(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    loan_id, _ = await _seed_loan_application(
        status=LoanStatus.SUBMITTED_TO_BANK, disbursed_at=None
    )

    res = await client.post(
        "/api/v1/admin/fee-cashbacks",
        headers=_headers(admin_token),
        json={"loan_application_uuid": loan_id, "amount_paise": 50_000},
    )
    assert res.status_code == 409, res.text


async def test_create_non_cashback_fee_outcome_rejected(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    loan_id, _ = await _seed_loan_application(fee_outcome=FeeOutcome.NONE_)

    res = await client.post(
        "/api/v1/admin/fee-cashbacks",
        headers=_headers(admin_token),
        json={"loan_application_uuid": loan_id, "amount_paise": 50_000},
    )
    assert res.status_code == 409, res.text


async def test_create_unknown_application_404s(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    res = await client.post(
        "/api/v1/admin/fee-cashbacks",
        headers=_headers(admin_token),
        json={"loan_application_uuid": str(uuid.uuid4()), "amount_paise": 50_000},
    )
    assert res.status_code == 404, res.text


async def test_double_entry_on_same_application_conflicts(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    loan_id, _ = await _seed_loan_application()

    body = {"loan_application_uuid": loan_id, "amount_paise": 50_000}
    res1 = await client.post(
        "/api/v1/admin/fee-cashbacks", headers=_headers(admin_token), json=body
    )
    assert res1.status_code == 201, res1.text

    res2 = await client.post(
        "/api/v1/admin/fee-cashbacks", headers=_headers(admin_token), json=body
    )
    assert res2.status_code == 409, res2.text


async def test_amount_and_recipient_come_from_row_not_body(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    loan_id, client_uid = await _seed_loan_application(business_line="loans")

    res = await client.post(
        "/api/v1/admin/fee-cashbacks",
        headers=_headers(admin_token),
        json={
            "loan_application_uuid": loan_id,
            "amount_paise": 50_000,
            "client_profile_uuid": str(uuid.uuid4()),  # ignored — not a schema field
            "business_line": "real_estate",  # ignored — not a schema field
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["business_line"] == "loans"
    row = await _get_cashback_row(res.json()["id"])
    assert row["recipient_auth_user_uuid"] == uuid.UUID(client_uid)


# ---------------------------------------------------------------------------
# Role gating
# ---------------------------------------------------------------------------


async def test_line_scoped_admin_rejected(client: AsyncClient) -> None:
    """Same guard reporting.py/referrals.py/commissions.py all need: RLS's
    admin bypass requires platform_scope='true', not just role='admin'."""
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_id(mobile)
    token = _admin_token(uid, platform_scope="line")

    res = await client.get("/api/v1/admin/fee-cashbacks/eligible", headers=_headers(token))
    assert res.status_code == 403


async def test_sub_admin_forbidden(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["loans"])
    uid = await _auth_user_id(mobile)
    token = create_access_token(
        {"sub": uid, "role": "sub_admin", "business_line": "", "platform_scope": "true"}
    )
    res = await client.get("/api/v1/admin/fee-cashbacks/eligible", headers=_headers(token))
    assert res.status_code == 403


async def test_client_forbidden_from_create(client: AsyncClient) -> None:
    loan_id, client_uid = await _seed_loan_application()
    token = create_access_token(
        {"sub": client_uid, "role": "client", "business_line": "both", "platform_scope": "false"}
    )
    res = await client.post(
        "/api/v1/admin/fee-cashbacks",
        headers=_headers(token),
        json={"loan_application_uuid": loan_id, "amount_paise": 50_000},
    )
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# Cancel
# ---------------------------------------------------------------------------


async def test_cancel_pending_cashback(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    loan_id, _ = await _seed_loan_application()

    create_res = await client.post(
        "/api/v1/admin/fee-cashbacks",
        headers=_headers(admin_token),
        json={"loan_application_uuid": loan_id, "amount_paise": 50_000},
    )
    cashback_id = create_res.json()["id"]

    cancel_res = await client.post(
        f"/api/v1/admin/fee-cashbacks/{cashback_id}/cancel",
        headers=_headers(admin_token),
        json={"reason": "duplicate entry"},
    )
    assert cancel_res.status_code == 204, cancel_res.text

    row = await _get_cashback_row(cashback_id)
    assert row["status"] == "cancelled"

    # A cancelled cashback frees the application for legitimate re-entry.
    retry_res = await client.post(
        "/api/v1/admin/fee-cashbacks",
        headers=_headers(admin_token),
        json={"loan_application_uuid": loan_id, "amount_paise": 60_000},
    )
    assert retry_res.status_code == 201, retry_res.text


async def test_cancel_already_cancelled_conflicts(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    loan_id, _ = await _seed_loan_application()

    create_res = await client.post(
        "/api/v1/admin/fee-cashbacks",
        headers=_headers(admin_token),
        json={"loan_application_uuid": loan_id, "amount_paise": 50_000},
    )
    cashback_id = create_res.json()["id"]
    await client.post(
        f"/api/v1/admin/fee-cashbacks/{cashback_id}/cancel",
        headers=_headers(admin_token),
        json={"reason": "first cancel"},
    )
    res = await client.post(
        f"/api/v1/admin/fee-cashbacks/{cashback_id}/cancel",
        headers=_headers(admin_token),
        json={"reason": "second cancel"},
    )
    assert res.status_code == 409


async def test_cancel_blocked_once_payout_attached(client: AsyncClient) -> None:
    admin_token, admin_uid = await _make_admin(client)
    loan_id, client_uid = await _seed_loan_application()

    create_res = await client.post(
        "/api/v1/admin/fee-cashbacks",
        headers=_headers(admin_token),
        json={"loan_application_uuid": loan_id, "amount_paise": 50_000},
    )
    cashback_id = create_res.json()["id"]

    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        payout = Payout(
            recipient_user_uuid=uuid.UUID(client_uid),
            business_line="loans",
            type=PayoutType.CASHBACK,
            amount_paise=50_000,
            currency="INR",
            status=PayoutStatus.PENDING_APPROVAL,
            destination_type=PayoutDestination.VPA,
            destination_hint="***@okhdfc",
            idempotency_key=uuid.uuid4().hex,
            maker_user_uuid=uuid.UUID(admin_uid),
        )
        db.add(payout)
        await db.flush()
        await db.execute(
            text("UPDATE fee_cashbacks SET payout_uuid = :p WHERE id = :id"),
            {"p": str(payout.id), "id": cashback_id},
        )
        await db.commit()

    res = await client.post(
        f"/api/v1/admin/fee-cashbacks/{cashback_id}/cancel",
        headers=_headers(admin_token),
        json={"reason": "too late"},
    )
    assert res.status_code == 409


async def test_cancel_unknown_cashback_404s(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    res = await client.post(
        f"/api/v1/admin/fee-cashbacks/{uuid.uuid4()}/cancel",
        headers=_headers(admin_token),
        json={"reason": "n/a"},
    )
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# Oversight list
# ---------------------------------------------------------------------------


async def test_list_filters_by_status(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    loan_id, _ = await _seed_loan_application()

    create_res = await client.post(
        "/api/v1/admin/fee-cashbacks",
        headers=_headers(admin_token),
        json={"loan_application_uuid": loan_id, "amount_paise": 50_000},
    )
    cashback_id = create_res.json()["id"]

    res_pending = await client.get(
        "/api/v1/admin/fee-cashbacks?status_filter=pending", headers=_headers(admin_token)
    )
    assert cashback_id in [c["id"] for c in res_pending.json()["cashbacks"]]

    res_paid = await client.get(
        "/api/v1/admin/fee-cashbacks?status_filter=paid", headers=_headers(admin_token)
    )
    assert cashback_id not in [c["id"] for c in res_paid.json()["cashbacks"]]


async def test_list_rejects_invalid_business_line(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    res = await client.get(
        "/api/v1/admin/fee-cashbacks?business_line=garbage", headers=_headers(admin_token)
    )
    assert res.status_code == 422


# ---------------------------------------------------------------------------
# Amount bounds
# ---------------------------------------------------------------------------


async def test_create_zero_amount_rejected(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    loan_id, _ = await _seed_loan_application()

    res = await client.post(
        "/api/v1/admin/fee-cashbacks",
        headers=_headers(admin_token),
        json={"loan_application_uuid": loan_id, "amount_paise": 0},
    )
    assert res.status_code == 422, res.text


async def test_create_negative_amount_rejected(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    loan_id, _ = await _seed_loan_application()

    res = await client.post(
        "/api/v1/admin/fee-cashbacks",
        headers=_headers(admin_token),
        json={"loan_application_uuid": loan_id, "amount_paise": -100},
    )
    assert res.status_code == 422, res.text


async def test_create_amount_over_cap_rejected(client: AsyncClient) -> None:
    admin_token, _ = await _make_admin(client)
    loan_id, _ = await _seed_loan_application(processing_fee=999_999_999.00)

    res = await client.post(
        "/api/v1/admin/fee-cashbacks",
        headers=_headers(admin_token),
        json={"loan_application_uuid": loan_id, "amount_paise": 10_000_000_001},
    )
    assert res.status_code == 422, res.text
