"""Conversion + accrual — the money path.

Two API-level happy-path tests drive the REAL hooks (loan disbursed,
property deal closed) end to end. Everything else calls
services.referrals.record_conversion directly against hand-seeded rows —
faster and more precise for the accrual-reason branches (D8-D12) than
driving the full state machine each time, and this is exactly the function
the two hooks call, so it's the same code path under test either way.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.security import create_access_token
from app.services import referrals
from conftest import full_registration, loan_application_payload, unique_mobile

from .test_property_deal_progress_api import _seed_property
from .test_property_deal_progress_api import _seed_telecaller as _seed_re_telecaller

_LOAN_STEPS = [
    "assigned",
    "contacted",
    "docs_collected",
    "submitted_to_bank",
    "sanctioned",
    "disbursed",
]
_DEAL_STEPS = [
    "contacted",
    "site_visit_done",
    "negotiation",
    "booked",
    "agreement_signed",
    "closed",
]


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None
        return str(row[0])


def _admin_token(uid: str) -> str:
    return create_access_token(
        {"sub": uid, "role": "admin", "business_line": "", "platform_scope": "true"}
    )


async def _my_code(client: AsyncClient, token: str) -> str:
    res = await client.get("/api/v1/referrals/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    return res.json()["code"]


async def _deactivate_configs(*business_lines: str) -> None:
    """The shared test DB never truncates between tests (repo gotcha), so a
    prior test's still-active config for the same line would otherwise win
    _select_config's tie-break over the one this test just seeded. Scope the
    deactivation to exactly the lines under test rather than truncating the
    table, so tests stay independent of execution order without touching
    unrelated rows."""
    from sqlalchemy import update as sa_update

    import app.db.session as _session_mod
    from app.models.referral_bonus_config import ReferralBonusConfig

    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(
            sa_update(ReferralBonusConfig)
            .where(
                ReferralBonusConfig.business_line.in_(business_lines),
                ReferralBonusConfig.active.is_(True),
            )
            .values(active=False)
        )
        await db.commit()


async def _seed_config(
    business_line: str, bonus_amount: str, rule: dict, *, created_by_uuid: str, active: bool = True
) -> str:
    import app.db.session as _session_mod
    from app.models.referral_bonus_config import ReferralBonusConfig

    if active:
        await _deactivate_configs(business_line)
    async with _session_mod.AsyncSessionLocal() as db:
        config = ReferralBonusConfig(
            business_line=business_line,
            bonus_amount=bonus_amount,
            rule=rule,
            active=active,
            created_by_uuid=uuid.UUID(created_by_uuid),
        )
        db.add(config)
        await db.commit()
        return str(config.id)


async def _seed_throwaway_user() -> str:
    """referred_auth_user_uuid is a real FK — record_conversion never reads
    anything off the referred person's own profile, so a bare auth_users row
    with no client/agent/staff profile at all is sufficient here."""
    import app.db.session as _session_mod
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Referred",
            mobile=unique_mobile(),
            email=f"referred_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.commit()
        return str(user.id)


async def _seed_pending_referral(
    referrer_uuid: str, referred_uuid: str | None = None
) -> tuple[str, str]:
    """Returns (referral_id, referred_auth_user_uuid)."""
    import app.db.session as _session_mod
    from app.models.referral import Referral

    referred = referred_uuid or await _seed_throwaway_user()
    async with _session_mod.AsyncSessionLocal() as db:
        row = Referral(
            referrer_auth_user_uuid=uuid.UUID(referrer_uuid),
            referred_mobile=unique_mobile(),
            referred_auth_user_uuid=uuid.UUID(referred),
        )
        db.add(row)
        await db.commit()
        return str(row.id), referred


async def _seed_accrued_referral(referrer_uuid: str, amount_paise: int) -> str:
    """Bypass the state machine entirely — represents "this referrer already
    has N accrued referrals" for D9/D10 threshold/cap tests."""
    import app.db.session as _session_mod
    from app.models.referral import Referral, ReferralStatus

    referred = await _seed_throwaway_user()
    async with _session_mod.AsyncSessionLocal() as db:
        row = Referral(
            referrer_auth_user_uuid=uuid.UUID(referrer_uuid),
            referred_mobile=unique_mobile(),
            referred_auth_user_uuid=uuid.UUID(referred),
            conversion_status=ReferralStatus.ACCRUED,
            business_line="loans",
            bonus_amount_paise=amount_paise,
            accrual_reason="accrued",
        )
        db.add(row)
        await db.commit()
        return str(row.id)


async def _get_referral(referral_id: str) -> dict:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT conversion_status, business_line, bonus_amount_paise, "
                    "accrual_reason, bonus_config_uuid, converted_ref_type, converted_ref_uuid "
                    "FROM referrals WHERE id = :id"
                ),
                {"id": referral_id},
            )
        ).fetchone()
        assert row is not None
        return dict(zip(row._mapping.keys(), row, strict=True))


async def _notification_count(auth_user_uuid: str) -> int:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT count(*) FROM notifications "
                    "WHERE user_uuid = :uid AND type = 'referral_converted'"
                ),
                {"uid": auth_user_uuid},
            )
        ).fetchone()
        return int(row[0])


# ---------------------------------------------------------------------------
# Happy path — real hooks, end to end
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_loan_disbursal_accrues_referral(client: AsyncClient) -> None:
    token_a, mobile_a = await full_registration(client, lines=["loans"])
    uid_a = await _auth_user_uuid(mobile_a)
    code = await _my_code(client, token_a)

    token_b, _mobile_b = await full_registration(client, lines=["loans"], referral_code=code)

    await _seed_config("loans", "500", {"min_conversion": 1}, created_by_uuid=uid_a)

    payload = await loan_application_payload(client, token_b)
    created = await client.post(
        "/api/v1/loans/applications",
        headers={"Authorization": f"Bearer {token_b}"},
        json=payload,
    )
    assert created.status_code == 201, created.text
    application_id = created.json()["id"]

    admin_headers = {"Authorization": f"Bearer {_admin_token(uid_a)}"}
    for step in _LOAN_STEPS:
        res = await client.patch(
            f"/api/v1/admin/loan-applications/{application_id}",
            json={"status": step},
            headers=admin_headers,
        )
        assert res.status_code == 200, res.text
    assert res.json()["status"] == "disbursed"

    row = (
        await client.get("/api/v1/referrals", headers={"Authorization": f"Bearer {token_a}"})
    ).json()["referrals"][0]
    assert row["conversion_status"] == "accrued"
    # R1: bonus_amount is rupees (500), the wire value must be paise (50000).
    assert row["bonus_amount_paise"] == 50000
    assert row["business_line"] == "loans"

    assert await _notification_count(uid_a) == 1


@pytest.mark.asyncio
async def test_property_deal_closed_accrues_referral(client: AsyncClient) -> None:
    from sqlalchemy import update

    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus

    token_a, mobile_a = await full_registration(client, lines=["loans"])
    uid_a = await _auth_user_uuid(mobile_a)
    code = await _my_code(client, token_a)

    tc_uid, tc_staff_uuid = await _seed_re_telecaller()
    tc_token = create_access_token(
        {
            "sub": tc_uid,
            "role": "telecaller",
            "business_line": "real_estate",
            "staff_profile_uuid": tc_staff_uuid,
            "platform_scope": "false",
        }
    )
    tc_headers = {"Authorization": f"Bearer {tc_token}"}

    _, mobile_b = await full_registration(
        client, lines=["loans", "real_estate"], referral_code=code
    )

    # capture_lead always anchors the registration-time lead to loans; close
    # it and seed a fresh real_estate lead for the same mobile (same
    # technique as test_property_deal_progress_api._seed_registered_lead).
    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(update(Lead).where(Lead.mobile == mobile_b).values(status="closed"))
        lead = Lead(
            mobile=mobile_b,
            business_line="real_estate",
            status=LeadStatus.ASSIGNED,
            origin=LeadOrigin.DIRECT,
            assigned_telecaller_profile_uuid=uuid.UUID(tc_staff_uuid),
        )
        db.add(lead)
        await db.commit()
        lead_id = str(lead.id)

    await _seed_config("real_estate", "500", {"min_conversion": 1}, created_by_uuid=uid_a)

    property_id = await _seed_property()
    created = await client.post(
        f"/api/v1/telecaller/leads/{lead_id}/property-deals",
        json={"property_id": property_id},
        headers=tc_headers,
    )
    assert created.status_code == 201, created.text
    deal_id = created.json()["id"]

    admin_headers = {"Authorization": f"Bearer {_admin_token(uid_a)}"}
    for step in _DEAL_STEPS:
        res = await client.patch(
            f"/api/v1/admin/property-deals/{deal_id}",
            json={"status": step},
            headers=admin_headers,
        )
        assert res.status_code == 200, res.text
    assert res.json()["status"] == "closed"

    row = (
        await client.get("/api/v1/referrals", headers={"Authorization": f"Bearer {token_a}"})
    ).json()["referrals"][0]
    assert row["conversion_status"] == "accrued"
    assert row["bonus_amount_paise"] == 50000
    assert row["business_line"] == "real_estate"
    assert await _notification_count(uid_a) == 1


# ---------------------------------------------------------------------------
# Accrual-reason branches — direct service calls (D7-D12)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_idempotent_against_double_call(client: AsyncClient) -> None:
    _, mobile_a = await full_registration(client, lines=["loans"])
    uid_a = await _auth_user_uuid(mobile_a)
    referral_id, referred_uuid = await _seed_pending_referral(uid_a)
    await _seed_config("loans", "500", {}, created_by_uuid=uid_a)

    kwargs = dict(
        referred_auth_user_uuid=uuid.UUID(referred_uuid),
        business_line="loans",
        ref_type="loan_application",
        ref_uuid=uuid.uuid4(),
    )
    await referrals.record_conversion(**kwargs)
    await referrals.record_conversion(**kwargs)

    row = await _get_referral(referral_id)
    assert row["conversion_status"] == "accrued"
    assert row["bonus_amount_paise"] == 50000
    assert await _notification_count(uid_a) == 1


@pytest.mark.asyncio
async def test_no_active_config_records_reason_without_amount(client: AsyncClient) -> None:
    _, mobile_a = await full_registration(client, lines=["loans"])
    uid_a = await _auth_user_uuid(mobile_a)
    referral_id, referred_uuid = await _seed_pending_referral(uid_a)
    # Earlier tests in this module leave active Loans configs behind (the
    # shared test DB never truncates), so clear them to exercise zero candidates.
    await _deactivate_configs("loans")

    await referrals.record_conversion(
        referred_auth_user_uuid=uuid.UUID(referred_uuid),
        business_line="loans",
        ref_type="loan_application",
        ref_uuid=uuid.uuid4(),
    )

    row = await _get_referral(referral_id)
    assert row["conversion_status"] == "converted"
    assert row["accrual_reason"] == "no_active_config"
    assert row["bonus_amount_paise"] is None
    assert await _notification_count(uid_a) == 1  # a real conversion happened, just no config


@pytest.mark.asyncio
async def test_identity_only_both_config_is_rejected(client: AsyncClient) -> None:
    _, mobile_a = await full_registration(client, lines=["loans"])
    uid_a = await _auth_user_uuid(mobile_a)
    with pytest.raises(IntegrityError, match="ck_referral_bonus_config_business_line_operational"):
        await _seed_config("both", "100", {}, created_by_uuid=uid_a)


@pytest.mark.asyncio
async def test_below_min_conversion_does_not_accrue(client: AsyncClient) -> None:
    _, mobile_a = await full_registration(client, lines=["loans"])
    uid_a = await _auth_user_uuid(mobile_a)
    referral_id, referred_uuid = await _seed_pending_referral(uid_a)
    await _seed_config("loans", "500", {"min_conversion": 2}, created_by_uuid=uid_a)

    await referrals.record_conversion(
        referred_auth_user_uuid=uuid.UUID(referred_uuid),
        business_line="loans",
        ref_type="loan_application",
        ref_uuid=uuid.uuid4(),
    )

    row = await _get_referral(referral_id)
    assert row["conversion_status"] == "converted"
    assert row["accrual_reason"] == "below_min_conversion"
    assert row["bonus_amount_paise"] is None
    assert await _notification_count(uid_a) == 1


@pytest.mark.asyncio
async def test_min_conversion_satisfied_by_prior_accrual(client: AsyncClient) -> None:
    _, mobile_a = await full_registration(client, lines=["loans"])
    uid_a = await _auth_user_uuid(mobile_a)
    await _seed_accrued_referral(uid_a, 30000)  # this referrer's 1st accrual
    referral_id, referred_uuid = await _seed_pending_referral(uid_a)
    await _seed_config("loans", "500", {"min_conversion": 2}, created_by_uuid=uid_a)

    await referrals.record_conversion(
        referred_auth_user_uuid=uuid.UUID(referred_uuid),
        business_line="loans",
        ref_type="loan_application",
        ref_uuid=uuid.uuid4(),
    )

    row = await _get_referral(referral_id)
    assert row["conversion_status"] == "accrued"
    assert row["bonus_amount_paise"] == 50000


@pytest.mark.asyncio
async def test_cap_clamps_then_blocks(client: AsyncClient) -> None:
    _, mobile_a = await full_registration(client, lines=["loans"])
    uid_a = await _auth_user_uuid(mobile_a)
    await _seed_config("loans", "500", {"cap": 600}, created_by_uuid=uid_a)

    r1_id, r1_referred = await _seed_pending_referral(uid_a)
    await referrals.record_conversion(
        referred_auth_user_uuid=uuid.UUID(r1_referred),
        business_line="loans",
        ref_type="loan_application",
        ref_uuid=uuid.uuid4(),
    )
    row1 = await _get_referral(r1_id)
    assert row1["bonus_amount_paise"] == 50000  # full 500 rupees, cap not yet hit

    r2_id, r2_referred = await _seed_pending_referral(uid_a)
    await referrals.record_conversion(
        referred_auth_user_uuid=uuid.UUID(r2_referred),
        business_line="loans",
        ref_type="loan_application",
        ref_uuid=uuid.uuid4(),
    )
    row2 = await _get_referral(r2_id)
    assert row2["bonus_amount_paise"] == 10000  # clamped: 60000 cap - 50000 already = 10000

    r3_id, r3_referred = await _seed_pending_referral(uid_a)
    await referrals.record_conversion(
        referred_auth_user_uuid=uuid.UUID(r3_referred),
        business_line="loans",
        ref_type="loan_application",
        ref_uuid=uuid.uuid4(),
    )
    row3 = await _get_referral(r3_id)
    assert row3["conversion_status"] == "converted"
    assert row3["accrual_reason"] == "cap_reached"
    assert row3["bonus_amount_paise"] is None


@pytest.mark.asyncio
async def test_malformed_rule_falls_back_to_unrestricted(client: AsyncClient) -> None:
    _, mobile_a = await full_registration(client, lines=["loans"])
    uid_a = await _auth_user_uuid(mobile_a)
    referral_id, referred_uuid = await _seed_pending_referral(uid_a)
    await _seed_config("loans", "500", {"min_conversion": "abc", "cap": -5}, created_by_uuid=uid_a)

    await referrals.record_conversion(
        referred_auth_user_uuid=uuid.UUID(referred_uuid),
        business_line="loans",
        ref_type="loan_application",
        ref_uuid=uuid.uuid4(),
    )

    row = await _get_referral(referral_id)
    assert row["conversion_status"] == "accrued"
    assert row["bonus_amount_paise"] == 50000


@pytest.mark.asyncio
async def test_self_referral_voids_without_notification(client: AsyncClient) -> None:
    """Not reachable via attribute_signup in practice — a raw row for defense
    in depth (D5), e.g. a future admin hand-edit."""
    import app.db.session as _session_mod
    from app.models.referral import Referral

    _, mobile_a = await full_registration(client, lines=["loans"])
    uid_a = await _auth_user_uuid(mobile_a)
    async with _session_mod.AsyncSessionLocal() as db:
        row = Referral(
            referrer_auth_user_uuid=uuid.UUID(uid_a),
            referred_mobile=unique_mobile(),
            referred_auth_user_uuid=uuid.UUID(uid_a),
        )
        db.add(row)
        await db.commit()
        referral_id = str(row.id)
    await _seed_config("loans", "500", {}, created_by_uuid=uid_a)

    await referrals.record_conversion(
        referred_auth_user_uuid=uuid.UUID(uid_a),
        business_line="loans",
        ref_type="loan_application",
        ref_uuid=uuid.uuid4(),
    )

    row = await _get_referral(referral_id)
    assert row["conversion_status"] == "void"
    assert row["accrual_reason"] == "self_referral"
    assert await _notification_count(uid_a) == 0


@pytest.mark.asyncio
async def test_agent_referrer_voids_without_notification(client: AsyncClient) -> None:
    """FR-9.1/D12: eligibility is re-checked at accrual time, not frozen at
    signup — a referrer who became an agent after sharing their code earns
    nothing on a later conversion."""
    import app.db.session as _session_mod
    from app.models.profile import AgentProfile, ProfileStatus

    _, mobile_a = await full_registration(client, lines=["loans"])
    uid_a = await _auth_user_uuid(mobile_a)
    referral_id, referred_uuid = await _seed_pending_referral(uid_a)
    await _seed_config("loans", "500", {}, created_by_uuid=uid_a)

    async with _session_mod.AsyncSessionLocal() as db:
        db.add(
            AgentProfile(
                auth_user_uuid=uuid.UUID(uid_a),
                agent_code=f"AG-{uuid.uuid4().hex[:8]}",
                business_line="loans",
                status=ProfileStatus.ACTIVE,
            )
        )
        await db.commit()

    await referrals.record_conversion(
        referred_auth_user_uuid=uuid.UUID(referred_uuid),
        business_line="loans",
        ref_type="loan_application",
        ref_uuid=uuid.uuid4(),
    )

    row = await _get_referral(referral_id)
    assert row["conversion_status"] == "void"
    assert row["accrual_reason"] == "referrer_not_client"
    assert await _notification_count(uid_a) == 0


@pytest.mark.asyncio
async def test_internal_failure_never_raises_and_leaves_row_pending(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The best-effort contract: whatever breaks inside record_conversion, it
    must never propagate — the two call sites (loan_applications.py,
    property_deals.py) call it with no try/except of their own, trusting
    this. Confirms the row is untouched (no partial write) rather than
    silently wrong."""
    _, mobile_a = await full_registration(client, lines=["loans"])
    uid_a = await _auth_user_uuid(mobile_a)
    referral_id, referred_uuid = await _seed_pending_referral(uid_a)
    await _seed_config("loans", "500", {}, created_by_uuid=uid_a)

    async def _boom(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(referrals, "_select_config", _boom)

    await referrals.record_conversion(
        referred_auth_user_uuid=uuid.UUID(referred_uuid),
        business_line="loans",
        ref_type="loan_application",
        ref_uuid=uuid.uuid4(),
    )  # must not raise

    row = await _get_referral(referral_id)
    assert row["conversion_status"] == "pending"
    assert await _notification_count(uid_a) == 0
