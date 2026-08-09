"""Referral program domain service.

PR 1 built accrual only (never paid). PR 2 (below, "Admin execution") adds the
Admin-facing list and the two functions that link/settle a referral against a
real services.payments payout — record_conversion itself still never calls
create_payout directly (ADR-0008 decision B): the admin router does, then
attach_payout links the result.

Decisions D1-D18 are recorded in docs/specs/referral-program.md; the load-
bearing ones repeated here for anyone reading this file cold:

  - A referral code is issued once per auth_user, only to an eligible CLIENT
    (FR-9.1: agents/staff never refer — D12). Eligibility is re-checked on
    every read AND at accrual time, not frozen at signup, so a client who
    later becomes an agent stops accruing without their old code vanishing.
  - Attribution happens once, at the referred person's registration
    (attribute_signup), and is first-claim-wins per mobile (D6). It is
    best-effort: a referral failure must never fail a registration.
  - Conversion (record_conversion) is called from the two terminal-status
    hooks — loan disbursed, property deal closed. It is best-effort for the
    same reason: a referral failure must never fail a disbursal.
  - Accrual computes an amount from the Sub Admin's referral_bonus_config,
    which stores rupees (Numeric) — every payout rail is integer paise, so
    the rupees->paise conversion happens in exactly one place here
    (_rupees_to_paise) and nowhere else.
  - PR 1 never calls services.payments.create_payout. bonus_amount_paise
    just sits on the referrals row until PR 2's Admin execution UI reads it.

All writes run on the bypass session (`app` superuser) via
`import app.db.session as db_session`, resolved at call time — NOT a
module-level `from app.db.session import AsyncSessionLocal` — so the test
suite's NullPool rebind is honoured with zero conftest changes (same
convention as jobs/cms_activation.py). Both referral_codes and referrals
grant SELECT only to api_user (D16), so a request-scoped session could not
write these tables even if it tried.
"""

from __future__ import annotations

import logging
from decimal import ROUND_DOWN, Decimal
from typing import Literal
from uuid import UUID

from sqlalchemy import func, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

import app.db.session as db_session
from app.core.config import settings
from app.core.masking import mask_mobile
from app.core.security import generate_referral_code
from app.models.lead import Lead
from app.models.notification import NotificationType
from app.models.profile import AgentProfile, ClientProfile, ProfileStatus, StaffProfile
from app.models.referral import Referral, ReferralCode, ReferralStatus
from app.models.referral_bonus_config import ReferralBonusConfig
from app.schemas.referrals import MyReferralResponse, ReferralStats
from app.services.notifications import emit_notification

logger = logging.getLogger(__name__)

# Same collision-retry budget as customer_code / profile_code issuance.
_MAX_CODE_ATTEMPTS = 5

_ACCRUAL_STATUSES = (ReferralStatus.ACCRUED, ReferralStatus.PAID)

IneligibleReason = Literal["agent", "staff", "no_client_profile"]


# ---------------------------------------------------------------------------
# Eligibility (D12) — evaluated fresh every time, never cached on the row
# ---------------------------------------------------------------------------


async def _referrer_is_eligible(
    session: AsyncSession, auth_user_uuid: UUID
) -> tuple[bool, IneligibleReason | None]:
    """FR-9.1: only clients refer. Checked on every read and at accrual time."""
    has_client = await session.scalar(
        select(ClientProfile.id)
        .where(
            ClientProfile.auth_user_uuid == auth_user_uuid,
            ClientProfile.status == ProfileStatus.ACTIVE,
        )
        .limit(1)
    )
    if has_client is None:
        return False, "no_client_profile"

    has_agent = await session.scalar(
        select(AgentProfile.id)
        .where(
            AgentProfile.auth_user_uuid == auth_user_uuid,
            AgentProfile.status == ProfileStatus.ACTIVE,
        )
        .limit(1)
    )
    if has_agent is not None:
        return False, "agent"

    has_staff = await session.scalar(
        select(StaffProfile.id)
        .where(
            StaffProfile.auth_user_uuid == auth_user_uuid,
            StaffProfile.status == ProfileStatus.ACTIVE,
        )
        .limit(1)
    )
    if has_staff is not None:
        return False, "staff"

    return True, None


# ---------------------------------------------------------------------------
# Code issuance (D1-D2)
# ---------------------------------------------------------------------------


async def _insert_code(session: AsyncSession, auth_user_uuid: UUID) -> str | None:
    """5-attempt collision-retry insert, same shape as generate_profile_code
    call sites (auth_service.register_set_password, backfill_customer_codes).
    """
    for attempt in range(_MAX_CODE_ATTEMPTS):
        code = generate_referral_code()
        try:
            async with session.begin_nested():
                session.add(ReferralCode(auth_user_uuid=auth_user_uuid, code=code))
            return code
        except IntegrityError:
            if attempt == _MAX_CODE_ATTEMPTS - 1:
                logger.warning("referrals.code_collision auth_user_uuid=%s", auth_user_uuid)
                return None
    return None


async def issue_code_on_session(
    session: AsyncSession, auth_user_uuid: UUID, *, skip_eligibility: bool = False
) -> str | None:
    """Idempotent: returns the existing code if one exists.

    skip_eligibility=True is for the registration call site only — a brand
    new self-registered client is eligible by construction (fresh
    ClientProfile just created in the same transaction, no agent/staff
    profile can possibly exist yet), so the query would be dead work.
    """
    existing = await session.get(ReferralCode, auth_user_uuid)
    if existing is not None:
        return existing.code
    if not skip_eligibility:
        eligible, _ = await _referrer_is_eligible(session, auth_user_uuid)
        if not eligible:
            return None
    return await _insert_code(session, auth_user_uuid)


async def _resolve_my_code(
    auth_user_uuid: UUID,
) -> tuple[str | None, bool, IneligibleReason | None]:
    async with db_session.AsyncSessionLocal() as session:
        eligible, reason = await _referrer_is_eligible(session, auth_user_uuid)
        if not eligible:
            return None, False, reason
        code = await issue_code_on_session(session, auth_user_uuid, skip_eligibility=True)
        await session.commit()
        return code, True, None


# ---------------------------------------------------------------------------
# Signup attribution (D3-D6) — best-effort, called after the new user commits
# ---------------------------------------------------------------------------


async def _lookup_lead_uuid(session: AsyncSession, mobile: str) -> UUID | None:
    return await session.scalar(
        select(Lead.id).where(Lead.mobile == mobile).order_by(Lead.created_at.desc()).limit(1)
    )


async def attribute_signup(
    *, code: str | None, referred_mobile: str, referred_auth_user_uuid: UUID
) -> str | None:
    """Create the referrer->referred edge at registration.

    Best-effort: swallows every error so a referral-attribution bug can never
    fail a registration (same discipline as services.notifications.emit_notification
    and services.leads.capture_lead). Returns the code verbatim if it did NOT
    resolve to a referrer (D4 — recorded in auth_events.detail, never surfaced
    to the registering user), else None.
    """
    if not code:
        return None
    try:
        async with db_session.AsyncSessionLocal() as session:
            referrer_auth_user_uuid = await session.scalar(
                select(ReferralCode.auth_user_uuid).where(ReferralCode.code == code)
            )
            if referrer_auth_user_uuid is None:
                logger.info(
                    "referrals.code_unmatched code=%s mobile=%s",
                    code,
                    mask_mobile(referred_mobile),
                )
                return code
            if referrer_auth_user_uuid == referred_auth_user_uuid:
                # Not reachable in practice (the referred person has no account
                # yet when their code is captured), kept as defense-in-depth.
                logger.warning(
                    "referrals.self_referral_at_signup auth_user_uuid=%s", referred_auth_user_uuid
                )
                return None

            lead_uuid = await _lookup_lead_uuid(session, referred_mobile)
            # First-claim-wins (D6): the UNIQUE constraint on referred_mobile
            # is the real guard; ON CONFLICT DO NOTHING makes a concurrent
            # second claim a silent no-op instead of an IntegrityError.
            await session.execute(
                pg_insert(Referral)
                .values(
                    referrer_auth_user_uuid=referrer_auth_user_uuid,
                    referred_mobile=referred_mobile,
                    referred_auth_user_uuid=referred_auth_user_uuid,
                    referred_lead_uuid=lead_uuid,
                )
                .on_conflict_do_nothing(index_elements=["referred_mobile"])
            )
            await session.commit()
    except Exception:
        logger.warning(
            "referrals.attribute_signup_failed mobile=%s",
            mask_mobile(referred_mobile),
            exc_info=True,
        )
    return None


# ---------------------------------------------------------------------------
# Conversion + accrual (D7-D11) — the money path, best-effort
# ---------------------------------------------------------------------------


def _rupees_to_paise(amount: Decimal) -> int:
    paise = (amount * 100).to_integral_value(rounding=ROUND_DOWN)
    return max(int(paise), 0)


def _parse_rule_nonneg_int(rule: dict, key: str) -> int | None:
    """Malformed rule values are treated as absent (D11) — this is
    Sub-Admin-authored free-form JSONB and must never crash a disbursal."""
    val = rule.get(key)
    if val is None:
        return None
    try:
        n = int(val)
    except (TypeError, ValueError):
        return None
    return n if n >= 0 else None


async def _select_config(session: AsyncSession, business_line: str) -> ReferralBonusConfig | None:
    """Select the newest active config for the exact operational line."""
    return await session.scalar(
        select(ReferralBonusConfig)
        .where(
            ReferralBonusConfig.active.is_(True),
            ReferralBonusConfig.business_line == business_line,
        )
        .order_by(
            ReferralBonusConfig.updated_at.desc(),
            ReferralBonusConfig.id.desc(),
        )
        .limit(1)
    )


async def _compute_amount_paise(
    session: AsyncSession, config: ReferralBonusConfig, referrer_auth_user_uuid: UUID
) -> tuple[int | None, str]:
    """Returns (amount_paise, accrual_reason). amount_paise is None whenever
    the reason is not "accrued" — the row still records the reason so Admin
    can see why nothing accrued."""
    rule = config.rule or {}
    min_conversion = _parse_rule_nonneg_int(rule, "min_conversion") or 1
    cap_rupees = _parse_rule_nonneg_int(rule, "cap")

    prior_count = (
        await session.scalar(
            select(func.count())
            .select_from(Referral)
            .where(
                Referral.referrer_auth_user_uuid == referrer_auth_user_uuid,
                Referral.conversion_status.in_(_ACCRUAL_STATUSES),
            )
        )
        or 0
    )
    # D9: this conversion, if it accrues, would be the referrer's Nth. No
    # retro-accrual in PR 1 — an earlier below-threshold row stays converted.
    if prior_count + 1 < min_conversion:
        return None, "below_min_conversion"

    bonus_paise = _rupees_to_paise(config.bonus_amount)

    if cap_rupees is not None:
        cap_paise = _rupees_to_paise(Decimal(cap_rupees))
        already_paise = (
            await session.scalar(
                select(func.coalesce(func.sum(Referral.bonus_amount_paise), 0)).where(
                    Referral.referrer_auth_user_uuid == referrer_auth_user_uuid,
                    Referral.conversion_status.in_(_ACCRUAL_STATUSES),
                )
            )
            or 0
        )
        allowed = cap_paise - already_paise
        if allowed <= 0:
            return None, "cap_reached"
        bonus_paise = min(bonus_paise, allowed)

    if bonus_paise <= 0:
        return None, "cap_reached"

    # PAYOUT_MAX_AMOUNT_PAISE defaults to 0 (unconfigured) outside a live
    # Razorpay environment — guard on it being actually set, else every
    # accrual in dev/test would trip this and drown out a real signal.
    if settings.PAYOUT_MAX_AMOUNT_PAISE > 0 and bonus_paise > settings.PAYOUT_MAX_AMOUNT_PAISE:
        logger.warning(
            "referrals.accrual_exceeds_payout_max amount_paise=%d referrer_auth_user_uuid=%s",
            bonus_paise,
            referrer_auth_user_uuid,
        )

    return bonus_paise, "accrued"


async def record_conversion(
    *,
    referred_auth_user_uuid: UUID,
    business_line: str,
    ref_type: str,
    ref_uuid: UUID,
) -> None:
    """Called from the two terminal-status hooks: loan_applications on
    DISBURSED, property_deals on CLOSED. Both call sites are AFTER their own
    db.commit(), so an accrual can never outlive a rolled-back status change.

    Idempotency is the atomic UPDATE ... WHERE conversion_status='pending'
    below (layer b) — the two source hooks are also transition-gated (layer
    a) and uq_referrals_converted_ref is a DB-level backstop (layer c). A
    notification only fires on a non-empty RETURNING and a non-void outcome
    (layer d).

    Best-effort: swallows every error so a referral bug can never fail a
    loan disbursal or a property deal close.
    """
    try:
        async with db_session.AsyncSessionLocal() as session:
            referral = await session.scalar(
                select(Referral)
                .where(
                    Referral.referred_auth_user_uuid == referred_auth_user_uuid,
                    Referral.conversion_status == ReferralStatus.PENDING,
                )
                .limit(1)
            )
            if referral is None:
                return  # no pending referral for this person, or already resolved

            referrer_auth_user_uuid = referral.referrer_auth_user_uuid

            # Serialize per-referrer: _compute_amount_paise reads this
            # referrer's OTHER accrued/paid rows to enforce min_conversion
            # and cap (D9/D10). Those are plain SELECTs against different
            # Referral rows than the one the CAS below locks, so two
            # different referred people converting for the same referrer at
            # once could both read the same stale aggregate and both accrue
            # — overrunning cap or accruing below min_conversion. Same
            # pattern as payments.create_payout's daily-cap TOCTOU guard
            # (services/payments.py); held until this transaction commits.
            await session.execute(
                text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
                {"key": str(referrer_auth_user_uuid)},
            )

            if referrer_auth_user_uuid == referred_auth_user_uuid:
                new_status, reason, config_id, amount_paise = (
                    ReferralStatus.VOID,
                    "self_referral",
                    None,
                    None,
                )
            else:
                eligible, _ = await _referrer_is_eligible(session, referrer_auth_user_uuid)
                if not eligible:
                    new_status, reason, config_id, amount_paise = (
                        ReferralStatus.VOID,
                        "referrer_not_client",
                        None,
                        None,
                    )
                else:
                    config = await _select_config(session, business_line)
                    if config is None:
                        new_status, reason, config_id, amount_paise = (
                            ReferralStatus.CONVERTED,
                            "no_active_config",
                            None,
                            None,
                        )
                    else:
                        amount_paise, reason = await _compute_amount_paise(
                            session, config, referrer_auth_user_uuid
                        )
                        new_status = (
                            ReferralStatus.ACCRUED
                            if amount_paise is not None
                            else ReferralStatus.CONVERTED
                        )
                        config_id = config.id

            result = await session.execute(
                update(Referral)
                .where(
                    Referral.id == referral.id,
                    Referral.conversion_status == ReferralStatus.PENDING,
                )
                .values(
                    conversion_status=new_status,
                    business_line=business_line,
                    converted_at=func.now(),
                    converted_ref_type=ref_type,
                    converted_ref_uuid=ref_uuid,
                    bonus_config_uuid=config_id,
                    bonus_amount_paise=amount_paise,
                    accrual_reason=reason,
                    updated_at=func.now(),
                )
                .returning(Referral.id)
            )
            claimed = result.scalar_one_or_none()
            await session.commit()

        if claimed is not None and new_status != ReferralStatus.VOID:
            # Neutral copy: this also fires for CONVERTED-but-not-accrued
            # (no_active_config, below_min_conversion) — the referral is real,
            # a bonus is not guaranteed, so the notification must not promise
            # one. Check the referrals dashboard for the actual outcome.
            await emit_notification(
                user_uuid=referrer_auth_user_uuid,
                notification_type=NotificationType.REFERRAL_CONVERTED,
                title="Your referral converted",
                body=(
                    "Someone you referred just completed their first deal. "
                    "Check your referrals for details."
                ),
                href="/dashboard/referrals",
            )
    except Exception:
        logger.warning(
            "referrals.record_conversion_failed referred_auth_user_uuid=%s ref_type=%s ref_uuid=%s",
            referred_auth_user_uuid,
            ref_type,
            ref_uuid,
            exc_info=True,
        )


# ---------------------------------------------------------------------------
# Reads (router-facing)
# ---------------------------------------------------------------------------


async def _compute_stats(db: AsyncSession) -> ReferralStats:
    # No explicit WHERE on referrer_auth_user_uuid: `db` is the caller's own
    # RLS-scoped request session, so referrals_rls already confines this to
    # their own rows (same trust-RLS convention as api/v1/transactions.py).
    rows = (await db.execute(select(Referral.conversion_status, Referral.bonus_amount_paise))).all()
    counts = dict.fromkeys(ReferralStatus, 0)
    accrued_amount = 0
    paid_amount = 0
    for conversion_status, amount in rows:
        counts[conversion_status] += 1
        if amount:
            if conversion_status == ReferralStatus.ACCRUED:
                accrued_amount += amount
            elif conversion_status == ReferralStatus.PAID:
                paid_amount += amount
    return ReferralStats(
        total=len(rows),
        pending=counts[ReferralStatus.PENDING],
        converted=counts[ReferralStatus.CONVERTED],
        accrued=counts[ReferralStatus.ACCRUED],
        paid=counts[ReferralStatus.PAID],
        void=counts[ReferralStatus.VOID],
        accrued_amount_paise=accrued_amount,
        paid_amount_paise=paid_amount,
    )


async def get_my_referral(db: AsyncSession, auth_user_uuid: UUID) -> MyReferralResponse:
    code, eligible, reason = await _resolve_my_code(auth_user_uuid)
    stats = await _compute_stats(db)
    return MyReferralResponse(code=code, eligible=eligible, ineligible_reason=reason, stats=stats)


async def list_referrals(db: AsyncSession) -> list[Referral]:
    # Trust RLS, same convention as _compute_stats / api/v1/transactions.py.
    result = await db.execute(select(Referral).order_by(Referral.created_at.desc()))
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Admin execution (PR 2) — turning an accrued row into a real payout
# ---------------------------------------------------------------------------


async def list_for_admin(
    db: AsyncSession,
    *,
    status_filter: ReferralStatus | None = None,
    business_line: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[Referral]:
    """Admin oversight read (FR-9.5). Runs on the caller's REQUEST session, not
    the bypass session: referrals_rls's platform-admin branch already grants
    full reach across every referrer, same trust-RLS convention as
    list_referrals / _compute_stats."""
    stmt = select(Referral).order_by(Referral.created_at.desc()).limit(limit).offset(offset)
    if status_filter is not None:
        stmt = stmt.where(Referral.conversion_status == status_filter)
    if business_line is not None:
        stmt = stmt.where(Referral.business_line == business_line)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def attach_payout(*, referral_id: UUID, payout_id: UUID) -> bool:
    """Links a newly-created payout to an accrued, unlinked referral row.

    The CAS (WHERE conversion_status='accrued' AND reward_payout_uuid IS NULL)
    is the double-pay guard: two concurrent admin actions on the same referral
    can only ever have one winner. A False return means the row was already
    claimed (or is no longer accrued) — the router turns that into a 409. The
    payout itself is NOT rolled back here; it is left pending_approval for a
    human to reject, the same "never auto-cancel a maker-checker artifact"
    discipline services/payments.py already follows elsewhere.
    """
    async with db_session.AsyncSessionLocal() as session:
        result = await session.execute(
            update(Referral)
            .where(
                Referral.id == referral_id,
                Referral.conversion_status == ReferralStatus.ACCRUED,
                Referral.reward_payout_uuid.is_(None),
            )
            .values(reward_payout_uuid=payout_id, updated_at=func.now())
            .returning(Referral.id)
        )
        claimed = result.scalar_one_or_none()
        await session.commit()
        return claimed is not None


async def mark_paid_from_payout(*, payout_id: UUID, transaction_id: UUID) -> None:
    """Called by services.payments once a REFERRAL_BONUS payout settles to PAID
    (mock-path settle and the webhook settle path both call this).

    Best-effort: swallows every error so a referral bug can never fail a
    payment settlement, same discipline as record_conversion. The CAS (WHERE
    conversion_status='accrued') makes a redelivered settle a no-op — the
    second call finds the row already 'paid' and updates zero rows.
    """
    try:
        async with db_session.AsyncSessionLocal() as session:
            await session.execute(
                update(Referral)
                .where(
                    Referral.reward_payout_uuid == payout_id,
                    Referral.conversion_status == ReferralStatus.ACCRUED,
                )
                .values(
                    conversion_status=ReferralStatus.PAID,
                    reward_txn_uuid=transaction_id,
                    updated_at=func.now(),
                )
            )
            await session.commit()
    except Exception:
        logger.warning("referrals.mark_paid_failed payout_id=%s", payout_id, exc_info=True)


async def release_payout_link(*, payout_id: UUID) -> None:
    """Called by services.payments when a REFERRAL_BONUS payout lands on a
    terminal non-paid status (failed, rejected, or reversed after having been
    paid). Frees the referral row so Admin can pay it again: back to accrued,
    both reward UUIDs cleared.

    Matches on reward_payout_uuid alone (not a status filter) so it correctly
    unwinds both a payout that never reached paid (referral still 'accrued')
    and a post-settlement reversal (referral already flipped to 'paid' by
    mark_paid_from_payout) in one shared path. Idempotent: a row with no
    matching reward_payout_uuid (already released, or never linked) updates
    zero rows. Best-effort, same discipline as mark_paid_from_payout.
    """
    try:
        async with db_session.AsyncSessionLocal() as session:
            await session.execute(
                update(Referral)
                .where(Referral.reward_payout_uuid == payout_id)
                .values(
                    conversion_status=ReferralStatus.ACCRUED,
                    reward_payout_uuid=None,
                    reward_txn_uuid=None,
                    updated_at=func.now(),
                )
            )
            await session.commit()
    except Exception:
        logger.warning(
            "referrals.release_payout_link_failed payout_id=%s", payout_id, exc_info=True
        )
