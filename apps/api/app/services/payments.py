"""Payments / payouts service — RazorpayX disbursement with a mock producer.

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

Money is integer minor units (amount_paise), never a float.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.masking import mask_bank_account, mask_vpa
from app.db.session import AsyncSessionLocal
from app.models.payout import Payout, PayoutDestination, PayoutStatus, PayoutType
from app.models.transaction import Transaction, TransactionStatus, TransactionType

logger = logging.getLogger(__name__)

_RAZORPAYX_BASE = "https://api.razorpay.com/v1"

# Terminal states in which the idempotency key is considered freed for a retry —
# must stay in sync with the partial-unique index predicate in the migration.
_DEDUPE_DEAD_STATES = (PayoutStatus.REJECTED, PayoutStatus.FAILED, PayoutStatus.REVERSED)

# RazorpayX payout webhook events → our status.
_WEBHOOK_STATUS_MAP = {
    "payout.processed": PayoutStatus.PAID,
    "payout.failed": PayoutStatus.FAILED,
    "payout.reversed": PayoutStatus.REVERSED,
}


# ---------------------------------------------------------------------------
# Typed domain errors (router maps these to HTTP status codes)
# ---------------------------------------------------------------------------


class PayoutError(Exception):
    """Base for create/transition validation failures."""


class RecipientNotFound(PayoutError):
    """recipient_user_uuid does not resolve to a platform account (guard d)."""


class RecipientInactive(PayoutError):
    """recipient account exists but is not ACTIVE (suspended / de-linked)."""


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


# ---------------------------------------------------------------------------
# Live/mock switch
# ---------------------------------------------------------------------------


def _is_live() -> bool:
    """Real RazorpayX disbursement only when both credentials are present.

    Empty keys ⇒ mock producer. Mirrors otp_delivery's ``VOICE_OTP_ENABLED and
    TWOFACTOR_API_KEY`` gate; there is no separate PAYMENTS_LIVE flag by design.
    """
    return bool(settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET)


# ---------------------------------------------------------------------------
# Create (maker) — guards + provision + persist
# ---------------------------------------------------------------------------


async def create_payout(
    *,
    recipient_user_uuid: uuid.UUID,
    payout_type: PayoutType,
    business_line: str | None,
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

        # Insider-fraud guard: the maker cannot pay themselves. (approve adds the
        # symmetric checker!=recipient guard, so no single admin can self-disburse.)
        if recipient_user_uuid == maker_user_uuid:
            raise SelfPayoutForbidden("A payout cannot be created to your own account.")

        # Guard (a): per-payout cap. 0 ⇒ unset: fail-closed when live, no cap in mock.
        max_cap = settings.PAYOUT_MAX_AMOUNT_PAISE
        if max_cap <= 0 and _is_live():
            raise PayoutCapNotConfigured("Per-payout cap is not configured.")
        if max_cap > 0 and amount_paise > max_cap:
            raise PayoutAmountExceeded("Amount exceeds the per-payout cap.")

        # Guard (c): daily aggregate cap over today's non-dead payouts (under the lock).
        daily_cap = settings.PAYOUT_DAILY_CAP_PAISE
        if daily_cap <= 0 and _is_live():
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

        # Provision the gateway fund account now (no money moves) so approve
        # carries no PII. Mock mode returns (None, None). Raw destination is used
        # here and then discarded — only the masked hint is persisted. A gateway
        # rejection here surfaces as a typed error (clean 4xx), never a raw 500.
        hint = _mask_destination(destination_type, destination)
        try:
            contact_id, fund_account_id = await _provision_fund_account(
                recipient_user_uuid=recipient_user_uuid,
                destination_type=destination_type,
                destination=destination,
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


async def approve_payout(*, payout_id: uuid.UUID, checker_user_uuid: uuid.UUID) -> None:
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
        await db.commit()

    # Separate step: initiate on its own session, best-effort.
    await initiate_payout(payout_id)


async def reject_payout(
    *, payout_id: uuid.UUID, rejector_user_uuid: uuid.UUID, reason: str
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
        await db.commit()


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
                .where(Payout.id == payout_id, Payout.status == PayoutStatus.APPROVED)
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


async def settle_from_webhook(*, event: str, gateway_payout_id: str) -> None:
    """Apply a verified RazorpayX webhook event to the matching payout.

    Idempotent: a redelivered ``payout.processed`` never emits a second ledger
    row (guarded by ledger_transaction_id). Unknown events are ignored.
    """
    target = _WEBHOOK_STATUS_MAP.get(event)
    if target is None:
        return
    async with AsyncSessionLocal() as db:
        payout = await db.scalar(
            select(Payout).where(Payout.gateway_payout_id == gateway_payout_id)
        )
        if payout is None:
            logger.warning("payout.webhook_unmatched gateway_payout_id=%s", gateway_payout_id)
            return

        if target == PayoutStatus.PAID:
            if payout.ledger_transaction_id is not None:
                return  # already settled — redelivery, no second ledger row
            payout.gateway_status = event.split(".", 1)[-1]
            await _settle_paid(db, payout)
            await db.commit()
            return

        # FAILED / REVERSED. A settled (PAID) payout must never regress to FAILED
        # on a stale or duplicate event — that would desync the admin view from
        # the client-facing ledger row (which stays PAID). A genuine post-payment
        # REVERSED (funds returned by the gateway) is a real signal: record it,
        # but the compensating clawback ledger entry is a deferred follow-up, so
        # the original ledger row is left intact here.
        if payout.status == PayoutStatus.PAID:
            if target == PayoutStatus.REVERSED:
                payout.gateway_status = "reversed"
                payout.status = PayoutStatus.REVERSED
                await db.commit()
            else:
                logger.warning("payout.stale_failed_ignored payout_id=%s", payout.id)
            return

        payout.gateway_status = event.split(".", 1)[-1]
        payout.status = target
        if target == PayoutStatus.FAILED:
            payout.failure_reason = "Gateway reported payout failed."
        await db.commit()


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _settle_paid(db, payout: Payout) -> None:
    """Mark a payout paid and emit its single client-facing ledger row.

    Caller commits. Idempotency (no double ledger row) is enforced by callers
    checking ledger_transaction_id before invoking this.
    """
    txn = Transaction(
        user_uuid=payout.recipient_user_uuid,
        business_line=payout.business_line,
        type=TransactionType(payout.type.value),
        status=TransactionStatus.PAID,
        amount_paise=payout.amount_paise,
        currency=payout.currency,
        description=_ledger_description(payout.type),
        reference=payout.gateway_payout_id,
    )
    db.add(txn)
    await db.flush()  # populate txn.id
    payout.status = PayoutStatus.PAID
    payout.ledger_transaction_id = txn.id


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
    except Exception:
        logger.warning("payout.mark_failed_failed payout_id=%s", payout_id, exc_info=True)


def _ledger_description(payout_type: PayoutType) -> str:
    return {
        PayoutType.CASHBACK: "Cashback payout",
        PayoutType.REFERRAL_BONUS: "Referral bonus payout",
        PayoutType.COMMISSION: "Commission payout",
    }[payout_type]


def _mask_destination(destination_type: PayoutDestination, destination: dict) -> str:
    if destination_type == PayoutDestination.VPA:
        return mask_vpa(destination.get("vpa"))
    return mask_bank_account(destination.get("ifsc"), destination.get("account_number"))


def _auth_users_table():
    # Imported lazily to avoid a circular import at module load.
    from app.models.user import User

    return User.__table__


# ---------------------------------------------------------------------------
# RazorpayX HTTP adapter (only reached when _is_live())
# ---------------------------------------------------------------------------


def _razorpayx_auth() -> tuple[str, str]:
    return (settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)


async def _provision_fund_account(
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
