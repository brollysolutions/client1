"""Payments / payouts service — provider-routed online and manual disbursement.

Live-vs-mock is switched by credential presence alone (``_is_live``), exactly
like services/otp_delivery.py and services/email.py: empty RAZORPAY_* keys ⇒ the
mock producer runs (writes rows, no external call, no real money). The mainline
ships empty keys, so the money path is inert on ``main`` by construction; the
long-lived ``prod`` branch supplies real credentials via env.

All persistence runs on the app-superuser bypass session (``AsyncSessionLocal``),
mirroring services.notifications.emit_notification — this is what lets the
auth-less webhook receiver settle status, and it means only SELECT is granted to
api_user on ``payouts`` (see migration 9d2e3f4a5b6c).

Split of concerns:
  * create_payout — validates the four safety guards, provisions the RazorpayX
    contact+fund_account (real mode), persists a pending_approval row. Validation
    failures raise typed PayoutError subclasses which the router maps to HTTP
    codes. Raw VPA/bank details are handed to the gateway and NEVER persisted.
  * approve_payout / reject_payout — maker-checker transitions; approve initiates
    the transfer.
  * initiate_payout / settle_from_webhook — best-effort gateway interaction that
    NEVER raises into the caller (a gateway fault sets status=failed and is
    visible in the admin list), the same discipline as OTP delivery.

A REFERRAL_BONUS, COMMISSION, or CASHBACK payout's source row hears about
every terminal transition via _payout_paid_hook / _payout_released_hook,
called right after each status-changing commit — see those call sites in
initiate_payout (mock), settle_from_webhook (paid/reversed/failed),
reject_payout, and _mark_failed. Both hooks delegate to
services/payout_links.py, which also runs a scheduled sweep
(jobs/reconcile_payout_links.py) re-driving either hook for any source row
whose write silently failed — see that module's docstring.

Money is integer minor units (amount_paise), never a float.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Protocol

import httpx
from sqlalchemy import func, or_, select, text, update
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.masking import mask_bank_account, mask_cheque_reference, mask_vpa
from app.db.session import AsyncSessionLocal
from app.models.audit_log import AuditAction
from app.models.notification import NotificationType
from app.models.payout import (
    Payout,
    PayoutDestination,
    PayoutProvider,
    PayoutStatus,
    PayoutType,
)
from app.models.profile import AgentProfile, ClientProfile, StaffProfile
from app.models.transaction import Transaction, TransactionStatus, TransactionType
from app.services import payout_links
from app.services.admin_notify import notify_admins
from app.services.audit_log import record as record_audit

logger = logging.getLogger(__name__)

_RAZORPAYX_BASE = "https://api.razorpay.com/v1"

# Terminal states in which the idempotency key is considered freed for a retry —
# must stay in sync with the partial-unique index predicate in the migration.
_DEDUPE_DEAD_STATES = (PayoutStatus.REJECTED, PayoutStatus.FAILED, PayoutStatus.REVERSED)

# RazorpayX payout webhook events → our status. `payout.rejected` (compliance /
# beneficiary rejection) is a genuine terminal failure, mapped to FAILED so it is
# recorded, not silently acked-and-ignored.
_WEBHOOK_STATUS_MAP = {
    "payout.processed": PayoutStatus.PAID,
    "payout.failed": PayoutStatus.FAILED,
    "payout.rejected": PayoutStatus.FAILED,
    "payout.reversed": PayoutStatus.REVERSED,
}

# RazorpayX payout `status` field (from a GET) → the equivalent webhook event, so
# the reconciler can reuse the idempotent settle_from_webhook path. The terminal
# failure statuses `rejected` and `cancelled` map to FAILED so a stuck payout is
# resolved (with a reason) instead of being re-scanned forever; the non-terminal
# statuses (queued/pending/processing) map to nothing — still in flight.
_GATEWAY_STATUS_TO_EVENT = {
    "processed": "payout.processed",
    "failed": "payout.failed",
    "rejected": "payout.failed",
    "cancelled": "payout.failed",
    "reversed": "payout.reversed",
}

# Bound each reconciliation tick. A live backlog larger than this signals a
# systemic webhook-delivery problem worth alerting on, not silently grinding.
_RECONCILE_SCAN_LIMIT = 500


# ---------------------------------------------------------------------------
# Typed domain errors (router maps these to HTTP status codes)
# ---------------------------------------------------------------------------


class PayoutError(Exception):
    """Base for create/transition validation failures."""


class RecipientNotFound(PayoutError):
    """recipient_user_uuid does not resolve to a platform account (guard d)."""


class RecipientInactive(PayoutError):
    """recipient account exists but is not ACTIVE (suspended / de-linked)."""


class RecipientLineMismatch(PayoutError):
    """business_line was given but the recipient holds no profile on that line."""


class SelfPayoutForbidden(PayoutError):
    """the acting admin is also the payee — an insider self-payout is blocked."""


class GatewayError(PayoutError):
    """the payment gateway rejected or failed a create-time provisioning call."""


class PayoutAmountExceeded(PayoutError):
    """amount over the per-payout cap (guard a)."""


class PayoutDailyCapExceeded(PayoutError):
    """today's paid+pending total would cross the daily cap (guard c)."""


class DuplicatePayout(PayoutError):
    """an active payout with the same (recipient, type, amount, key) exists (guard b)."""


class PayoutCapNotConfigured(PayoutError):
    """live mode but a required cap is unset — fail closed rather than move uncapped money."""


class PayoutNotFound(PayoutError):
    """no such payout row."""


class PayoutStateError(PayoutError):
    """transition not allowed from the payout's current status."""


class MakerCheckerViolation(PayoutError):
    """the checker is the same account as the maker."""


class DuplicateManualReference(PayoutError):
    """the manual cheque reference fingerprint already belongs to a payout."""


# ---------------------------------------------------------------------------
# Live/mock switch
# ---------------------------------------------------------------------------


def _is_live() -> bool:
    """Real RazorpayX disbursement only when both credentials are present.

    Empty keys ⇒ mock producer. Mirrors otp_delivery's ``VOICE_OTP_ENABLED and
    TWOFACTOR_API_KEY`` gate; there is no separate PAYMENTS_LIVE flag by design.
    """
    return bool(settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET)


def _provider_for_destination(destination_type: PayoutDestination) -> PayoutProvider:
    if destination_type == PayoutDestination.CHEQUE:
        return PayoutProvider.MANUAL
    return PayoutProvider.RAZORPAYX


def _requires_configured_caps(provider: PayoutProvider) -> bool:
    """Manual cheques are real outside development even without gateway keys."""
    return _is_live() or (provider == PayoutProvider.MANUAL and settings.ENV != "development")


# ---------------------------------------------------------------------------
# Create (maker) — guards + provision + persist
# ---------------------------------------------------------------------------


async def create_payout(
    *,
    recipient_user_uuid: uuid.UUID,
    payout_type: PayoutType,
    business_line: str,
    amount_paise: int,
    destination_type: PayoutDestination,
    destination: dict,
    idempotency_key: str,
    maker_user_uuid: uuid.UUID,
) -> uuid.UUID:
    """Validate the four safety guards, provision the gateway fund account (real
    mode), and persist a pending_approval payout. Returns the new payout id.

    Runs entirely on the bypass session: the guard reads (recipient, daily cap,
    dedupe) and the insert must not depend on the caller's RLS scope.
    """
    # Pydantic's Field(gt=0, le=10_000_000_000) on PayoutCreate (the one
    # existing HTTP caller) bounded this at the schema layer only — a second
    # caller reaching this function directly (api/v1/referrals.py) had no
    # such bound. The invariant belongs with the money path, not with one of
    # its two routes in.
    if not 0 < amount_paise <= 10_000_000_000:
        raise PayoutAmountExceeded("Amount must be greater than 0 and within the payout bound.")
    provider = _provider_for_destination(destination_type)

    async with AsyncSessionLocal() as db:
        # Serialize the daily-cap read+insert against concurrent creates: a
        # transaction-scoped advisory lock keyed on the UTC date closes the
        # TOCTOU window where two racing makers both read a stale daily total and
        # jointly exceed the cap. Held until this transaction commits/rolls back.
        # Admin-driven create volume is low, so contention is negligible.
        today_key = int(datetime.now(UTC).strftime("%Y%m%d"))
        await db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": today_key})

        # Guard (d): recipient must be a real, usable platform account.
        recipient_status = await db.scalar(
            select(_auth_users_table().c.status).where(
                _auth_users_table().c.id == recipient_user_uuid
            )
        )
        if recipient_status is None:
            raise RecipientNotFound("Unknown recipient account.")
        if str(recipient_status) in ("suspended", "soft_deleted"):
            raise RecipientInactive("Recipient account is not active.")

        if business_line not in {"loans", "real_estate"}:
            raise RecipientLineMismatch("A payout requires one operational business line.")

        # Guard (d cont.): business_line must match a profile the
        # recipient actually holds, or the ledger row silently mis-tags itself
        # for per-line reporting/reconciliation even though RLS visibility (by
        # user_uuid) is unaffected. A staff profile with no line (line-agnostic
        # staff) matches any requested line. Every self-registered CLIENT is
        # dual-line by design (auth_service.register_set_password creates one
        # ClientProfile per line, always both), so this only ever rejects in
        # practice for a single-line Agent/Staff recipient (e.g. a commission
        # payout tagged with the line the agent doesn't hold).
        client_match = (
            select(ClientProfile.auth_user_uuid)
            .where(
                ClientProfile.auth_user_uuid == recipient_user_uuid,
                ClientProfile.business_line == business_line,
            )
            .exists()
        )
        agent_match = (
            select(AgentProfile.auth_user_uuid)
            .where(
                AgentProfile.auth_user_uuid == recipient_user_uuid,
                AgentProfile.business_line == business_line,
            )
            .exists()
        )
        staff_match = (
            select(StaffProfile.auth_user_uuid)
            .where(
                StaffProfile.auth_user_uuid == recipient_user_uuid,
                or_(
                    StaffProfile.business_line == business_line,
                    StaffProfile.business_line.is_(None),
                ),
            )
            .exists()
        )
        matched = await db.scalar(select(or_(client_match, agent_match, staff_match)))
        if not matched:
            raise RecipientLineMismatch(
                "Recipient does not hold a profile on the specified business line."
            )

        # Insider-fraud guard: the maker cannot pay themselves. (approve adds the
        # symmetric checker!=recipient guard, so no single admin can self-disburse.)
        if recipient_user_uuid == maker_user_uuid:
            raise SelfPayoutForbidden("A payout cannot be created to your own account.")

        # Guard (a): per-payout cap. 0 ⇒ unset: fail-closed when live, no cap in mock.
        max_cap = settings.PAYOUT_MAX_AMOUNT_PAISE
        if max_cap <= 0 and _requires_configured_caps(provider):
            raise PayoutCapNotConfigured("Per-payout cap is not configured.")
        if max_cap > 0 and amount_paise > max_cap:
            raise PayoutAmountExceeded("Amount exceeds the per-payout cap.")

        # Guard (c): daily aggregate cap over today's non-dead payouts (under the lock).
        daily_cap = settings.PAYOUT_DAILY_CAP_PAISE
        if daily_cap <= 0 and _requires_configured_caps(provider):
            raise PayoutCapNotConfigured("Daily payout cap is not configured.")
        if daily_cap > 0:
            start_of_day = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
            today_total = (
                await db.scalar(
                    select(func.coalesce(func.sum(Payout.amount_paise), 0)).where(
                        Payout.created_at >= start_of_day,
                        Payout.status.not_in(_DEDUPE_DEAD_STATES),
                    )
                )
            ) or 0
            if today_total + amount_paise > daily_cap:
                raise PayoutDailyCapExceeded("Amount would exceed the daily payout cap.")

        # Guard (b): dedupe window over active payouts with the same natural key.
        window = timedelta(seconds=settings.PAYOUT_DEDUPE_WINDOW_SECONDS)
        cutoff = datetime.now(UTC) - window
        dup = await db.scalar(
            select(func.count())
            .select_from(Payout)
            .where(
                Payout.recipient_user_uuid == recipient_user_uuid,
                Payout.type == payout_type,
                Payout.amount_paise == amount_paise,
                Payout.idempotency_key == idempotency_key,
                Payout.status.not_in(_DEDUPE_DEAD_STATES),
                Payout.created_at >= cutoff,
            )
        )
        if dup:
            raise DuplicatePayout("A matching payout was already created recently.")

        # Provision online destinations now (no money moves) so approval carries
        # no raw PII. Manual cheques collect their reference only at issuance.
        # In every case only a masked hint is persisted.
        hint = _mask_destination(destination_type, destination)
        contact_id: str | None = None
        fund_account_id: str | None = None
        if provider == PayoutProvider.RAZORPAYX:
            try:
                contact_id, fund_account_id = await _provision_fund_account(
                    recipient_user_uuid=recipient_user_uuid,
                    destination_type=destination_type,
                    destination=destination,
                    provider=provider,
                )
            except httpx.HTTPError:
                # Never stringify the httpx error — its body can echo the destination.
                logger.warning("payout.provision_failed recipient=%s", recipient_user_uuid)
                raise GatewayError(
                    "Could not validate the destination with the payment gateway."
                ) from None

        payout = Payout(
            recipient_user_uuid=recipient_user_uuid,
            business_line=business_line,
            type=payout_type,
            amount_paise=amount_paise,
            currency="INR",
            status=PayoutStatus.PENDING_APPROVAL,
            destination_type=destination_type,
            provider=provider,
            destination_hint=hint,
            idempotency_key=idempotency_key,
            maker_user_uuid=maker_user_uuid,
            gateway_contact_id=contact_id,
            gateway_fund_account_id=fund_account_id,
        )
        db.add(payout)
        try:
            await db.commit()
        except IntegrityError:
            # The partial-unique index catches a dedupe race the SELECT missed.
            # Only a unique-violation means "duplicate" — re-raise anything else.
            await db.rollback()
            raise DuplicatePayout("A matching payout already exists.") from None
        return payout.id


# ---------------------------------------------------------------------------
# Approve / reject (checker)
# ---------------------------------------------------------------------------


async def approve_payout(
    *,
    payout_id: uuid.UUID,
    checker_user_uuid: uuid.UUID,
    checker_role: str | None = None,
) -> None:
    """Approve a pending payout (checker) and initiate the transfer.

    Enforces maker != checker and checker != recipient. The status flip is an
    atomic compare-and-swap (UPDATE ... WHERE status='pending_approval'), so two
    concurrent approvals can never both proceed to initiate the transfer — the
    loser gets 0 rows and a PayoutStateError. The gateway call inside
    initiate_payout is best-effort and never raises.
    """
    async with AsyncSessionLocal() as db:
        payout = await db.get(Payout, payout_id)
        if payout is None:
            raise PayoutNotFound("Payout not found.")
        if payout.status != PayoutStatus.PENDING_APPROVAL:
            raise PayoutStateError("Payout is not awaiting approval.")
        if payout.maker_user_uuid == checker_user_uuid:
            raise MakerCheckerViolation("The approver must differ from the creator.")
        if payout.recipient_user_uuid == checker_user_uuid:
            raise SelfPayoutForbidden("You cannot approve a payout to your own account.")

        # Atomic claim: only the row still pending_approval flips to approved.
        result = await db.execute(
            update(Payout)
            .where(
                Payout.id == payout_id,
                Payout.status == PayoutStatus.PENDING_APPROVAL,
            )
            .values(status=PayoutStatus.APPROVED, checker_user_uuid=checker_user_uuid)
        )
        if result.rowcount == 0:
            # Lost a concurrent race — another approver already advanced it.
            await db.rollback()
            raise PayoutStateError("Payout is not awaiting approval.")
        # Written inside the same transaction as the compare-and-swap, so the
        # loser of a concurrent approval logs nothing: exactly one audit row per
        # payout approval, matching the one that actually moved money.
        await record_audit(
            db,
            action=AuditAction.PAYOUT_APPROVED,
            entity_type="payout",
            entity_uuid=payout_id,
            actor_uuid=checker_user_uuid,
            actor_role=checker_role,
            business_line=payout.business_line,
            detail={
                "amount_paise": payout.amount_paise,
                "payout_type": payout.type.value,
                "maker_user_uuid": str(payout.maker_user_uuid),
            },
        )
        await db.commit()

    await notify_admins(
        notification_type=NotificationType.ADMIN_PAYOUT_REVIEWED,
        title="Payout approved",
        body=f"A {payout.type.value.replace('_', ' ')} payout was approved.",
        href="/dashboard/payouts",
        exclude_user_uuid=checker_user_uuid,
    )

    # Separate step: initiate on its own session, best-effort.
    await initiate_payout(payout_id)


async def reject_payout(
    *,
    payout_id: uuid.UUID,
    rejector_user_uuid: uuid.UUID,
    reason: str,
    rejector_role: str | None = None,
) -> None:
    """Reject a pending payout. Reject is not value-moving, so maker==rejector is allowed."""
    async with AsyncSessionLocal() as db:
        payout = await db.get(Payout, payout_id)
        if payout is None:
            raise PayoutNotFound("Payout not found.")
        if payout.status != PayoutStatus.PENDING_APPROVAL:
            raise PayoutStateError("Payout is not awaiting approval.")
        payout.status = PayoutStatus.REJECTED
        payout.rejected_by_user_uuid = rejector_user_uuid
        payout.reject_reason = reason
        await record_audit(
            db,
            action=AuditAction.PAYOUT_REJECTED,
            entity_type="payout",
            entity_uuid=payout_id,
            actor_uuid=rejector_user_uuid,
            actor_role=rejector_role,
            business_line=payout.business_line,
            detail={
                "amount_paise": payout.amount_paise,
                "payout_type": payout.type.value,
                "reason": reason,
            },
        )
        await db.commit()
        await _payout_released_hook(payout)

    await notify_admins(
        notification_type=NotificationType.ADMIN_PAYOUT_REVIEWED,
        title="Payout rejected",
        body=f"A {payout.type.value.replace('_', ' ')} payout was rejected: {reason}",
        href="/dashboard/payouts",
        exclude_user_uuid=rejector_user_uuid,
    )


# ---------------------------------------------------------------------------
# Manual cheque lifecycle
# ---------------------------------------------------------------------------


def _manual_reference_fingerprint(reference: str) -> str:
    normalized = reference.strip().upper()
    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        f"payout-cheque:{normalized}".encode(),
        hashlib.sha256,
    ).hexdigest()


async def _manual_payout_for_update(db, payout_id: uuid.UUID) -> Payout:
    payout = await db.scalar(select(Payout).where(Payout.id == payout_id).with_for_update())
    if payout is None:
        raise PayoutNotFound("Payout not found.")
    if (
        payout.provider != PayoutProvider.MANUAL
        or payout.destination_type != PayoutDestination.CHEQUE
    ):
        raise PayoutStateError("Payout is not a manual cheque payout.")
    return payout


def _deny_manual_self_action(payout: Payout, actor_user_uuid: uuid.UUID) -> None:
    if payout.recipient_user_uuid == actor_user_uuid:
        raise SelfPayoutForbidden("You cannot operate a cheque payout to your own account.")


async def issue_manual_cheque(
    *,
    payout_id: uuid.UUID,
    reference: str,
    actor_user_uuid: uuid.UUID,
    actor_role: str | None,
) -> None:
    """Record offline issuance without marking the recipient ledger paid."""
    fingerprint = _manual_reference_fingerprint(reference)
    hint = mask_cheque_reference(reference)
    try:
        async with AsyncSessionLocal() as db:
            payout = await _manual_payout_for_update(db, payout_id)
            _deny_manual_self_action(payout, actor_user_uuid)
            if payout.status != PayoutStatus.APPROVED:
                raise PayoutStateError("Cheque payout is not awaiting issuance.")

            payout.status = PayoutStatus.PROCESSING
            payout.destination_hint = hint
            payout.manual_reference_fingerprint = fingerprint
            payout.manual_issued_at = datetime.now(UTC)
            await record_audit(
                db,
                action=AuditAction.PAYOUT_MANUAL_ISSUED,
                entity_type="payout",
                entity_uuid=payout.id,
                actor_uuid=actor_user_uuid,
                actor_role=actor_role,
                business_line=payout.business_line,
                detail={
                    "amount_paise": payout.amount_paise,
                    "payout_type": payout.type.value,
                    "destination_hint": hint,
                },
            )
            await db.commit()
    except IntegrityError as exc:
        if getattr(exc.orig, "sqlstate", None) != "23505":
            raise
        raise DuplicateManualReference("Cheque reference is already in use.") from None

    await notify_admins(
        notification_type=NotificationType.ADMIN_PAYOUT_REVIEWED,
        title="Cheque payout issued",
        body=f"A {payout.type.value.replace('_', ' ')} cheque payout was issued.",
        href="/dashboard/payouts",
        exclude_user_uuid=actor_user_uuid,
    )


async def clear_manual_cheque(
    *, payout_id: uuid.UUID, actor_user_uuid: uuid.UUID, actor_role: str | None
) -> None:
    """Record clearance and emit the one recipient-owned paid ledger row."""
    async with AsyncSessionLocal() as db:
        payout = await _manual_payout_for_update(db, payout_id)
        _deny_manual_self_action(payout, actor_user_uuid)
        if payout.status != PayoutStatus.PROCESSING or payout.manual_issued_at is None:
            raise PayoutStateError("Cheque payout is not awaiting clearance.")
        if payout.ledger_transaction_id is not None:
            raise PayoutStateError("Cheque payout is already settled.")

        transaction_id = await _emit_ledger_row(db, payout)
        payout.status = PayoutStatus.PAID
        payout.ledger_transaction_id = transaction_id
        payout.manual_cleared_at = datetime.now(UTC)
        await record_audit(
            db,
            action=AuditAction.PAYOUT_MANUAL_CLEARED,
            entity_type="payout",
            entity_uuid=payout.id,
            actor_uuid=actor_user_uuid,
            actor_role=actor_role,
            business_line=payout.business_line,
            detail={"amount_paise": payout.amount_paise, "payout_type": payout.type.value},
        )
        await db.commit()
        await _payout_paid_hook(payout, transaction_id)

    await notify_admins(
        notification_type=NotificationType.ADMIN_PAYOUT_REVIEWED,
        title="Cheque payout cleared",
        body=f"A {payout.type.value.replace('_', ' ')} cheque payout cleared.",
        href="/dashboard/payouts",
        exclude_user_uuid=actor_user_uuid,
    )


async def fail_manual_cheque(
    *,
    payout_id: uuid.UUID,
    reason: str,
    actor_user_uuid: uuid.UUID,
    actor_role: str | None,
) -> None:
    """Void an approved cheque or record a pre-clearance bounce/failure."""
    async with AsyncSessionLocal() as db:
        payout = await _manual_payout_for_update(db, payout_id)
        _deny_manual_self_action(payout, actor_user_uuid)
        if payout.status not in (PayoutStatus.APPROVED, PayoutStatus.PROCESSING):
            raise PayoutStateError("Cheque payout cannot fail from its current state.")

        payout.status = PayoutStatus.FAILED
        payout.failure_reason = reason
        await record_audit(
            db,
            action=AuditAction.PAYOUT_MANUAL_FAILED,
            entity_type="payout",
            entity_uuid=payout.id,
            actor_uuid=actor_user_uuid,
            actor_role=actor_role,
            business_line=payout.business_line,
            detail={
                "amount_paise": payout.amount_paise,
                "payout_type": payout.type.value,
                "reason": reason,
            },
        )
        await db.commit()
        await _payout_released_hook(payout)


async def reverse_manual_cheque(
    *,
    payout_id: uuid.UUID,
    reason: str,
    actor_user_uuid: uuid.UUID,
    actor_role: str | None,
) -> None:
    """Reverse a cleared cheque with exactly one compensating ledger row."""
    async with AsyncSessionLocal() as db:
        payout = await _manual_payout_for_update(db, payout_id)
        _deny_manual_self_action(payout, actor_user_uuid)
        if payout.status != PayoutStatus.PAID or payout.reversal_transaction_id is not None:
            raise PayoutStateError("Cheque payout is not eligible for reversal.")

        reversal_id = await _emit_clawback_row(db, payout)
        payout.status = PayoutStatus.REVERSED
        payout.reversal_transaction_id = reversal_id
        payout.failure_reason = reason
        await record_audit(
            db,
            action=AuditAction.PAYOUT_MANUAL_REVERSED,
            entity_type="payout",
            entity_uuid=payout.id,
            actor_uuid=actor_user_uuid,
            actor_role=actor_role,
            business_line=payout.business_line,
            detail={
                "amount_paise": payout.amount_paise,
                "payout_type": payout.type.value,
                "reason": reason,
            },
        )
        await db.commit()
        await _payout_released_hook(payout)


# ---------------------------------------------------------------------------
# Initiate + settle (gateway; best-effort, never raises)
# ---------------------------------------------------------------------------


async def initiate_payout(payout_id: uuid.UUID) -> None:
    """Send the approved payout to RazorpayX (real) or settle it locally (mock).

    Concurrency: the APPROVED→INITIATED transition is an atomic compare-and-swap,
    so exactly one caller can ever claim a given payout — this is what prevents a
    concurrent double-initiate from emitting two ledger rows (a double-pay).

    Best-effort: any gateway fault sets status=failed with a reason and returns
    without raising, so the approving request still completes and the failure is
    visible in the admin list (OTP-delivery discipline).

    LIVE-MODE RECONCILIATION CAVEAT (before enabling real credentials): if the
    RazorpayX POST /payouts succeeds server-side but the response is lost
    (timeout/reset), this marks the payout FAILED without a gateway_payout_id, so
    the later webhook cannot match it — money would have moved with no local
    record. A reconciliation job (list RazorpayX payouts by reference_id=payout.id
    for stuck FAILED rows) is REQUIRED before go-live. The mock path is unaffected.
    """
    try:
        async with AsyncSessionLocal() as db:
            # Atomic claim: flip APPROVED→INITIATED. rowcount 0 ⇒ another worker
            # already claimed it (or it was never approved) — do nothing.
            claim = await db.execute(
                update(Payout)
                .where(
                    Payout.id == payout_id,
                    Payout.status == PayoutStatus.APPROVED,
                    Payout.provider == PayoutProvider.RAZORPAYX,
                )
                .values(status=PayoutStatus.INITIATED)
            )
            if claim.rowcount == 0:
                await db.rollback()
                return
            await db.commit()

        async with AsyncSessionLocal() as db:
            payout = await db.get(Payout, payout_id)
            if payout is None:
                return

            if not _is_live():
                # Mock producer: fabricate a gateway id, settle to paid, emit ledger.
                payout.gateway_payout_id = f"pout_mock_{uuid.uuid4().hex[:14]}"
                payout.gateway_status = "processed"
                logger.info(
                    "PAYOUT_MOCK payout_id=%s recipient=%s type=%s amount_paise=%s dest=%s",
                    payout.id,
                    payout.recipient_user_uuid,
                    payout.type,
                    payout.amount_paise,
                    payout.destination_hint,
                )
                await _settle_paid(db, payout)
                await db.commit()
                await _payout_paid_hook(payout, payout.ledger_transaction_id)
                return

            # Real RazorpayX transfer. Contact+fund_account were provisioned at
            # create time; here we only create the payout and await the webhook.
            gateway_payout_id, gateway_status = await _create_gateway_payout(payout)
            payout.gateway_payout_id = gateway_payout_id
            payout.gateway_status = gateway_status
            # status stays INITIATED (set by the claim); webhook settles it.
            await db.commit()
    except Exception:
        logger.warning("payout.initiate_failed payout_id=%s", payout_id, exc_info=True)
        await _mark_failed(payout_id, "Payout initiation failed.")


async def settle_from_webhook(
    *,
    event: str,
    gateway_payout_id: str,
    provider: PayoutProvider = PayoutProvider.RAZORPAYX,
) -> None:
    """Apply a verified RazorpayX webhook event to the matching payout.

    Idempotent: a redelivered ``payout.processed`` never emits a second ledger
    row (guarded by ledger_transaction_id). Unknown events are ignored.
    """
    target = _WEBHOOK_STATUS_MAP.get(event)
    if target is None:
        return
    async with AsyncSessionLocal() as db:
        payout = await db.scalar(
            select(Payout).where(
                Payout.provider == provider,
                Payout.gateway_payout_id == gateway_payout_id,
            )
        )
        if payout is None:
            logger.warning("payout.webhook_unmatched gateway_payout_id=%s", gateway_payout_id)
            return

        if target == PayoutStatus.PAID:
            if payout.ledger_transaction_id is not None:
                return  # already settled — redelivery, no second ledger row
            # Insert the ledger row first, then claim the settle with an atomic
            # compare-and-swap on ledger_transaction_id IS NULL. Two concurrent
            # settles (a redelivered webhook, or — routinely now — the reconciler
            # racing a merely-delayed webhook) both pass the read above, but under
            # Postgres row locking only ONE UPDATE matches (rowcount 1); the loser
            # sees rowcount 0 and rolls back its insert, so a payout is credited
            # exactly once. The claim is a Core UPDATE and the loaded `payout` is
            # never ORM-dirtied here, so commit() issues no second, stale UPDATE.
            txn_id = await _emit_ledger_row(db, payout)
            claim = await db.execute(
                update(Payout)
                .where(
                    Payout.id == payout.id,
                    Payout.ledger_transaction_id.is_(None),
                )
                .values(
                    status=PayoutStatus.PAID,
                    gateway_status=event.split(".", 1)[-1],
                    ledger_transaction_id=txn_id,
                )
            )
            if claim.rowcount == 0:
                await db.rollback()  # lost the race — no second ledger row
                return
            await db.commit()
            await _payout_paid_hook(payout, txn_id)
            return

        # FAILED / REVERSED. A settled (PAID) payout must never regress to FAILED
        # on a stale or duplicate event — that would desync the admin view from
        # the client-facing ledger row (which stays PAID). A genuine post-payment
        # REVERSED (funds returned by the gateway) posts a compensating NEGATIVE
        # ledger row so the recipient's balance nets back to zero.
        if payout.status == PayoutStatus.PAID:
            if target == PayoutStatus.REVERSED:
                # Insert the clawback row first (so we have its id), then claim the
                # transition with an atomic compare-and-swap. Only the first
                # `payout.reversed` event matches (rowcount 1) and keeps the
                # inserted row; a redelivery loses it (rowcount 0) and the insert is
                # rolled back, so the negative row is emitted exactly once. The
                # claim is a Core UPDATE and the loaded `payout` is never
                # ORM-dirtied here, so commit() issues no second, stale UPDATE.
                clawback_id = await _emit_clawback_row(db, payout)
                claim = await db.execute(
                    update(Payout)
                    .where(
                        Payout.id == payout.id,
                        Payout.status == PayoutStatus.PAID,
                        Payout.reversal_transaction_id.is_(None),
                    )
                    .values(
                        status=PayoutStatus.REVERSED,
                        gateway_status="reversed",
                        reversal_transaction_id=clawback_id,
                    )
                )
                if claim.rowcount == 0:
                    await db.rollback()  # redelivery — no second clawback row
                    return
                await db.commit()
                await _payout_released_hook(payout)
            else:
                logger.warning("payout.stale_failed_ignored payout_id=%s", payout.id)
            return

        payout.gateway_status = event.split(".", 1)[-1]
        payout.status = target
        if target == PayoutStatus.FAILED:
            payout.failure_reason = "Gateway reported payout failed."
        await db.commit()
        await _payout_released_hook(payout)


# ---------------------------------------------------------------------------
# Reconciliation (scheduler job entrypoint; live-only, best-effort)
# ---------------------------------------------------------------------------


async def reconcile_stuck_payouts() -> dict:
    """Settle live payouts stuck past the grace window from the gateway's record.

    LIVE-ONLY: mock mode settles synchronously, so there is nothing to reconcile
    and this returns immediately on ``main``. Closes the reconciliation caveat
    documented in initiate_payout — two stuck classes:

      * INITIATED with a gateway_payout_id — the ``payout.processed`` webhook was
        lost; GET the payout by id and settle from its status.
      * INITIATED / FAILED with NO gateway_payout_id — the create POST response
        was lost, so no webhook can ever match; look the payout up by
        ``reference_id=payout.id``, backfill the gateway id, then settle.

    Reuses the idempotent settle_from_webhook path, so a webhook arriving
    concurrently with this sweep can never double-emit a ledger row. Per-payout
    faults are logged and skipped (never abort the whole sweep). Returns a
    ``{scanned, reconciled}`` summary for the job to log.
    """
    if not _is_live():
        return {"skipped": "mock", "scanned": 0, "reconciled": 0}

    cutoff = datetime.now(UTC) - timedelta(minutes=settings.PAYOUT_RECONCILE_STUCK_MINUTES)
    async with AsyncSessionLocal() as db:
        stuck = (
            await db.scalars(
                select(Payout)
                .where(
                    Payout.provider == PayoutProvider.RAZORPAYX,
                    Payout.status.in_((PayoutStatus.INITIATED, PayoutStatus.FAILED)),
                    Payout.updated_at < cutoff,
                )
                .order_by(Payout.updated_at)
                .limit(_RECONCILE_SCAN_LIMIT)
            )
        ).all()

    reconciled = 0
    for payout in stuck:
        # A FAILED payout is only ambiguous (money may have moved) when it carries
        # no gateway id; a FAILED-with-id is a genuine gateway failure — leave it.
        if payout.status == PayoutStatus.FAILED and payout.gateway_payout_id:
            continue
        # One poison payout must never abort the batch: the whole per-payout body
        # (gateway fetch, backfill, settle) is guarded so a fault on the oldest
        # row can't head-of-line-block every newer stuck payout behind it.
        try:
            resolved = await _fetch_gateway_state(payout)
            if resolved is None:
                continue  # gateway has no record — nothing moved; leave as-is
            gateway_payout_id, gateway_status = resolved
            event = _GATEWAY_STATUS_TO_EVENT.get(gateway_status)
            if event is None:
                continue  # still queued/processing at the gateway — settle later
            if not payout.gateway_payout_id:
                await _backfill_gateway_id(payout.id, gateway_payout_id)
            if payout.status == PayoutStatus.FAILED and event == "payout.processed":
                # Financially significant: a payout we recorded as FAILED actually
                # settled at the gateway (lost create-response). Log distinctly for
                # audit — id + statuses only, no PII.
                logger.warning(
                    "payout.reconcile_resurrected payout_id=%s from=failed to=paid", payout.id
                )
            await settle_from_webhook(
                event=event,
                gateway_payout_id=gateway_payout_id,
                provider=payout.provider,
            )
            reconciled += 1
        except Exception:
            logger.warning("payout.reconcile_failed payout_id=%s", payout.id, exc_info=True)
            continue
    return {"scanned": len(stuck), "reconciled": reconciled}


async def audit_paid_payouts_for_drift() -> dict:
    """Re-verify recently-settled payouts against RazorpayX's own record.

    Closes a gap reconcile_stuck_payouts does not cover: that function only
    scans INITIATED/FAILED, so a payout that settled successfully (webhook
    received, ledger row emitted, status=PAID) and is later reversed by
    RazorpayX (e.g. a bank-side rejection days after the transfer) is never
    re-checked if the payout.reversed webhook is itself lost. This sweep
    catches that: only PAID payouts settled within
    PAYOUT_REVERSAL_AUDIT_WINDOW_DAYS are GET-checked, and only a gateway
    status of "reversed" triggers action, via the same idempotent
    settle_from_webhook CAS reconcile_stuck_payouts uses (so a redelivered
    webhook racing this sweep can never double-clawback).

    LIVE-ONLY, like reconcile_stuck_payouts: mock mode settles synchronously
    and never reverses, so this returns immediately on ``main``/dev.
    """
    if not _is_live():
        return {"skipped": "mock", "scanned": 0, "reconciled": 0}

    cutoff = datetime.now(UTC) - timedelta(days=settings.PAYOUT_REVERSAL_AUDIT_WINDOW_DAYS)
    async with AsyncSessionLocal() as db:
        recent_paid = (
            await db.scalars(
                select(Payout)
                .where(
                    Payout.provider == PayoutProvider.RAZORPAYX,
                    Payout.status == PayoutStatus.PAID,
                    Payout.updated_at >= cutoff,
                    # Always true for a PAID row (settle only matches by
                    # gateway id) — kept explicit so _fetch_gateway_state
                    # always takes the cheap GET-by-id path, never the
                    # reference_id search.
                    Payout.gateway_payout_id.is_not(None),
                )
                .order_by(Payout.updated_at)
                .limit(_RECONCILE_SCAN_LIMIT)
            )
        ).all()

    reconciled = 0
    for payout in recent_paid:
        # One poison payout must never abort the batch — same discipline as
        # reconcile_stuck_payouts.
        try:
            resolved = await _fetch_gateway_state(payout)
            if resolved is None:
                continue  # gateway has no record at all — leave as-is
            gateway_payout_id, gateway_status = resolved
            if gateway_status == "processed":
                continue  # no drift — still settled, matches our record
            event = _GATEWAY_STATUS_TO_EVENT.get(gateway_status)
            if event == "payout.reversed":
                logger.warning("payout.reconcile_drift_reversed payout_id=%s", payout.id)
                await settle_from_webhook(
                    event=event,
                    gateway_payout_id=gateway_payout_id,
                    provider=payout.provider,
                )
                reconciled += 1
                continue
            # Any other terminal/unmapped gateway status is unexpected for an
            # already-PAID payout — log for investigation; do not mutate
            # local state (settle_from_webhook would only log+ignore it via
            # the payout.status==PAID guard anyway).
            logger.warning(
                "payout.audit_paid_unexpected_status payout_id=%s gateway_status=%s",
                payout.id,
                gateway_status,
            )
        except Exception:
            logger.warning("payout.audit_paid_failed payout_id=%s", payout.id, exc_info=True)
            continue
    return {"scanned": len(recent_paid), "reconciled": reconciled}


async def _backfill_gateway_id(payout_id: uuid.UUID, gateway_payout_id: str) -> None:
    """Persist a gateway id discovered by reference lookup so the idempotent
    settle path can match it. Guarded on gateway_payout_id IS NULL so a webhook
    that lands concurrently can't be clobbered."""
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(Payout)
            .where(Payout.id == payout_id, Payout.gateway_payout_id.is_(None))
            .values(gateway_payout_id=gateway_payout_id)
        )
        await db.commit()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _emit_ledger_row(db, payout: Payout) -> uuid.UUID:
    """Insert the single positive client-facing ledger row for a settled payout
    and return its id. Insert-only (no payout mutation) so callers can claim the
    settle with an atomic CAS. Caller commits (or rolls back on a lost CAS).

    retained_ref/delinked_at are copied straight from the payout: for a live
    payout both are NULL (no-op). For a payout that was already de-linked at
    account-deletion time (feature-status.md §2 #17 — an INITIATED payout
    settling days after its recipient's account was deleted), the emitted
    ledger row is born already de-linked instead of pointing at the now-freed
    user_uuid with no delinked_at at all — otherwise it would be an orphan the
    retention purge (which scopes strictly to delinked_at IS NOT NULL) could
    never find."""
    txn = Transaction(
        user_uuid=payout.recipient_user_uuid,
        business_line=payout.business_line,
        type=TransactionType(payout.type.value),
        status=TransactionStatus.PAID,
        amount_paise=payout.amount_paise,
        currency=payout.currency,
        description=_ledger_description(payout.type),
        reference=_ledger_reference(payout),
        retained_ref=payout.retained_ref,
        delinked_at=payout.delinked_at,
    )
    db.add(txn)
    await db.flush()  # populate txn.id
    return txn.id


async def _settle_paid(db, payout: Payout) -> None:
    """Mock-path settle: emit the ledger row and mark the payout paid via ORM.

    Used only by the mock producer in initiate_payout, which has already claimed
    the payout with the APPROVED→INITIATED compare-and-swap, so it is the single
    writer and ORM mutation here is race-free. The webhook/reconcile settle path
    uses an atomic CAS instead (see settle_from_webhook). Caller commits.
    """
    payout.ledger_transaction_id = await _emit_ledger_row(db, payout)
    payout.status = PayoutStatus.PAID


async def _emit_clawback_row(db, payout: Payout) -> uuid.UUID:
    """Insert the compensating NEGATIVE ledger row for a reversed payout.

    Same recipient / type / provenance as the original credit, but with a
    negated amount so the client's balance nets to zero. Returns the new txn id;
    the caller links it via reversal_transaction_id under an atomic CAS, which is
    what makes emission idempotent. Caller commits (or rolls back on a lost CAS,
    which also discards this insert).

    retained_ref/delinked_at copied from the payout — same reasoning as
    _emit_ledger_row above: a reversal against an already de-linked payout
    (recipient's account deleted between settle and reversal) must not emit
    an orphan the retention purge can never find.
    """
    txn = Transaction(
        user_uuid=payout.recipient_user_uuid,
        business_line=payout.business_line,
        type=TransactionType(payout.type.value),
        status=TransactionStatus.PAID,
        amount_paise=-payout.amount_paise,  # negative: compensating clawback entry
        currency=payout.currency,
        description=_clawback_description(payout.type),
        reference=_ledger_reference(payout),
        retained_ref=payout.retained_ref,
        delinked_at=payout.delinked_at,
    )
    db.add(txn)
    await db.flush()  # populate txn.id
    return txn.id


async def _mark_failed(payout_id: uuid.UUID, reason: str) -> None:
    """Best-effort transition to failed on a fresh session (used from except blocks)."""
    try:
        async with AsyncSessionLocal() as db:
            payout = await db.get(Payout, payout_id)
            if payout is None or payout.status in (PayoutStatus.PAID, PayoutStatus.REVERSED):
                return
            payout.status = PayoutStatus.FAILED
            payout.failure_reason = reason
            await db.commit()
            await _payout_released_hook(payout)
    except Exception:
        logger.warning("payout.mark_failed_failed payout_id=%s", payout_id, exc_info=True)


async def _payout_paid_hook(payout: Payout, transaction_id: uuid.UUID) -> None:
    """REFERRAL_BONUS, COMMISSION, and CASHBACK are the only payout types with
    a source row that needs to hear about settlement; every other type is a
    no-op (payout_links.apply_paid_link no-ops on any other PayoutType).
    payout_links's dispatch is best-effort on its own side (never raises), so
    this is a plain call, no local try/except — same discipline as the
    record_conversion call sites in services/loan_applications.py and
    services/property_deals.py.

    A manually-created CASHBACK payout with no linked fee_cashbacks row
    (payout-form.ts's admin manual-payout picker already offers the type) is
    safe here: fee_cashbacks.mark_paid_from_payout's CAS updates zero rows.

    If this hook fails to fire at all (crash, or a bug upstream of this
    call), jobs/reconcile_payout_links.py's scheduled sweep re-drives it —
    see services/payout_links.py."""
    await payout_links.apply_paid_link(
        payout_type=payout.type, payout_id=payout.id, transaction_id=transaction_id
    )


async def _payout_released_hook(payout: Payout) -> None:
    """Symmetric release for a REFERRAL_BONUS, COMMISSION, or CASHBACK payout
    that lands on failed, rejected, or reversed — frees the source row to be
    paid again. Same reconciliation backstop as _payout_paid_hook above."""
    await payout_links.apply_release_link(payout_type=payout.type, payout_id=payout.id)


def _ledger_description(payout_type: PayoutType) -> str:
    return {
        PayoutType.CASHBACK: "Cashback payout",
        PayoutType.REFERRAL_BONUS: "Referral bonus payout",
        PayoutType.COMMISSION: "Commission payout",
    }[payout_type]


def _clawback_description(payout_type: PayoutType) -> str:
    return f"Reversal of {_ledger_description(payout_type).lower()}"


def _mask_destination(destination_type: PayoutDestination, destination: dict) -> str:
    if destination_type == PayoutDestination.VPA:
        return mask_vpa(destination.get("vpa"))
    if destination_type == PayoutDestination.BANK_ACCOUNT:
        return mask_bank_account(destination.get("ifsc"), destination.get("account_number"))
    return "Cheque — not issued"


def _ledger_reference(payout: Payout) -> str:
    if payout.provider == PayoutProvider.MANUAL:
        return f"manual:{payout.id}"
    return payout.gateway_payout_id or f"gateway:{payout.id}"


def _auth_users_table():
    # Imported lazily to avoid a circular import at module load.
    from app.models.user import User

    return User.__table__


# ---------------------------------------------------------------------------
# Provider boundary + RazorpayX HTTP adapter
# ---------------------------------------------------------------------------


class _ProviderAdapter(Protocol):
    async def provision_destination(
        self,
        *,
        recipient_user_uuid: uuid.UUID,
        destination_type: PayoutDestination,
        destination: dict,
    ) -> tuple[str | None, str | None]: ...

    async def initiate(self, payout: Payout) -> tuple[str, str]: ...

    async def fetch_state(self, payout: Payout) -> tuple[str, str] | None: ...


class _RazorpayXProviderAdapter:
    async def provision_destination(
        self,
        *,
        recipient_user_uuid: uuid.UUID,
        destination_type: PayoutDestination,
        destination: dict,
    ) -> tuple[str | None, str | None]:
        return await _razorpayx_provision_fund_account(
            recipient_user_uuid=recipient_user_uuid,
            destination_type=destination_type,
            destination=destination,
        )

    async def initiate(self, payout: Payout) -> tuple[str, str]:
        return await _razorpayx_create_gateway_payout(payout)

    async def fetch_state(self, payout: Payout) -> tuple[str, str] | None:
        return await _razorpayx_fetch_gateway_state(payout)


_PROVIDER_ADAPTERS: dict[PayoutProvider, _ProviderAdapter] = {
    PayoutProvider.RAZORPAYX: _RazorpayXProviderAdapter(),
}


def _provider_adapter(provider: PayoutProvider) -> _ProviderAdapter:
    try:
        return _PROVIDER_ADAPTERS[provider]
    except KeyError:
        raise PayoutStateError("Payout provider has no automated adapter.") from None


def _razorpayx_auth() -> tuple[str, str]:
    return (settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)


async def _provision_fund_account(
    *,
    recipient_user_uuid: uuid.UUID,
    destination_type: PayoutDestination,
    destination: dict,
    provider: PayoutProvider = PayoutProvider.RAZORPAYX,
) -> tuple[str | None, str | None]:
    return await _provider_adapter(provider).provision_destination(
        recipient_user_uuid=recipient_user_uuid,
        destination_type=destination_type,
        destination=destination,
    )


async def _razorpayx_provision_fund_account(
    *,
    recipient_user_uuid: uuid.UUID,
    destination_type: PayoutDestination,
    destination: dict,
) -> tuple[str | None, str | None]:
    """Create a RazorpayX contact + fund_account for the destination.

    Returns (contact_id, fund_account_id). Mock mode returns (None, None) without
    any network call. Raw VPA/bank details are used here and never persisted.
    """
    if not _is_live():
        return None, None

    async with httpx.AsyncClient(timeout=15.0, auth=_razorpayx_auth()) as client:
        contact_resp = await client.post(
            f"{_RAZORPAYX_BASE}/contacts",
            json={
                "name": f"user_{recipient_user_uuid}",
                "type": "customer",
                "reference_id": str(recipient_user_uuid),
            },
        )
        contact_resp.raise_for_status()
        contact_id = contact_resp.json()["id"]

        if destination_type == PayoutDestination.VPA:
            fa_body = {
                "contact_id": contact_id,
                "account_type": "vpa",
                "vpa": {"address": destination["vpa"]},
            }
        else:
            fa_body = {
                "contact_id": contact_id,
                "account_type": "bank_account",
                "bank_account": {
                    "name": destination.get("name", f"user_{recipient_user_uuid}"),
                    "ifsc": destination["ifsc"],
                    "account_number": destination["account_number"],
                },
            }
        fa_resp = await client.post(f"{_RAZORPAYX_BASE}/fund_accounts", json=fa_body)
        fa_resp.raise_for_status()
        return contact_id, fa_resp.json()["id"]


async def _create_gateway_payout(payout: Payout) -> tuple[str, str]:
    provider = payout.provider or PayoutProvider.RAZORPAYX
    return await _provider_adapter(PayoutProvider(provider)).initiate(payout)


async def _razorpayx_create_gateway_payout(payout: Payout) -> tuple[str, str]:
    """POST the payout to RazorpayX with an idempotency header. Returns
    (payout_id, gateway_status). Raises on HTTP error (caller marks failed)."""
    mode = "UPI" if payout.destination_type == PayoutDestination.VPA else "IMPS"
    async with httpx.AsyncClient(timeout=15.0, auth=_razorpayx_auth()) as client:
        resp = await client.post(
            f"{_RAZORPAYX_BASE}/payouts",
            headers={"X-Payout-Idempotency": payout.idempotency_key},
            json={
                "account_number": settings.RAZORPAYX_ACCOUNT_NUMBER,
                "fund_account_id": payout.gateway_fund_account_id,
                "amount": payout.amount_paise,
                "currency": payout.currency,
                "mode": mode,
                "purpose": "payout",
                "queue_if_low_balance": True,
                "reference_id": str(payout.id),
            },
        )
        resp.raise_for_status()
        body = resp.json()
        return body["id"], body.get("status", "queued")


async def _fetch_gateway_state(payout: Payout) -> tuple[str, str] | None:
    provider = payout.provider or PayoutProvider.RAZORPAYX
    return await _provider_adapter(PayoutProvider(provider)).fetch_state(payout)


async def _razorpayx_fetch_gateway_state(payout: Payout) -> tuple[str, str] | None:
    """Read the gateway's own record of a payout for reconciliation.

    Returns (gateway_payout_id, gateway_status), or None if RazorpayX has no
    record at all (the create POST never reached them — no money moved). Looks up
    by gateway id when we have one, else by ``reference_id=payout.id`` (the
    lost-response case). Raises on transport/HTTP error (caller logs + skips)."""
    async with httpx.AsyncClient(timeout=15.0, auth=_razorpayx_auth()) as client:
        if payout.gateway_payout_id:
            resp = await client.get(f"{_RAZORPAYX_BASE}/payouts/{payout.gateway_payout_id}")
            resp.raise_for_status()
            body = resp.json()
            return body["id"], body.get("status", "")

        resp = await client.get(
            f"{_RAZORPAYX_BASE}/payouts",
            params={"reference_id": str(payout.id), "count": 1},
        )
        resp.raise_for_status()
        items = resp.json().get("items", [])
        if not items:
            return None
        return items[0]["id"], items[0].get("status", "")
