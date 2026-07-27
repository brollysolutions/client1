"""Loan application lifecycle progression — status + deal-terms writes.

Shared by the Telecaller (own assigned-lead applications) and Admin (any
application, platform bypass) progress endpoints. Runs entirely on the
request-scoped `db` session — no AsyncSessionLocal import here, so no
conftest _patch_db_null_pool entry is needed (emit_notification owns its
own bypass session internally).

State machine: forward-only along _ORDER (multi-step jumps allowed), with
on_hold/rejected reachable as a side-branch from any non-terminal status and
on_hold resumable to any _ORDER status or rejected. Admin obeys the exact
same machine as Telecaller in this slice (platform override means "acts on
any application", not "may skip the rules") — moving a terminal application
backward would collide with the one-active-application-per-client partial
unique index (2b3c4d5e6f7a), so that's deferred rather than solved here.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.loan import Bank, LoanApplication, LoanStatus
from app.models.notification import NotificationType
from app.models.profile import ClientProfile
from app.schemas.loans import LoanApplicationProgressUpdate
from app.services import referrals
from app.services.notifications import emit_notification

_ORDER = [
    LoanStatus.NEW,
    LoanStatus.ASSIGNED,
    LoanStatus.CONTACTED,
    LoanStatus.DOCS_COLLECTED,
    LoanStatus.SUBMITTED_TO_BANK,
    LoanStatus.SANCTIONED,
    LoanStatus.DISBURSED,
    LoanStatus.CLOSED,
]
_ORDER_INDEX = {status: i for i, status in enumerate(_ORDER)}
TERMINAL_STATUSES = {LoanStatus.CLOSED, LoanStatus.REJECTED}
_SIDE_BRANCH = {LoanStatus.ON_HOLD, LoanStatus.REJECTED}
_SUBMITTED_INDEX = _ORDER_INDEX[LoanStatus.SUBMITTED_TO_BANK]
_SANCTIONED_INDEX = _ORDER_INDEX[LoanStatus.SANCTIONED]

_STATUS_LABEL = {
    LoanStatus.NEW: "new",
    LoanStatus.ASSIGNED: "assigned",
    LoanStatus.CONTACTED: "contacted",
    LoanStatus.DOCS_COLLECTED: "in document collection",
    LoanStatus.SUBMITTED_TO_BANK: "submitted to the bank",
    LoanStatus.SANCTIONED: "sanctioned",
    LoanStatus.DISBURSED: "disbursed",
    LoanStatus.CLOSED: "closed",
    LoanStatus.REJECTED: "rejected",
    LoanStatus.ON_HOLD: "on hold",
}


class TerminalApplication(Exception):
    """Raised when the application is already closed/rejected (frozen)."""


class InvalidStatusTransition(Exception):
    """Raised on a backward move or any move out of a terminal status."""


class StatusReasonRequired(Exception):
    """Raised when moving to rejected/on_hold without a status_reason."""


class TermsNotAllowedAtStage(Exception):
    """Raised when a deal-terms field is set before its stage gate opens."""


class UnknownBank(Exception):
    """Raised when bank_id doesn't reference an existing active bank."""


def _effective_index(status: LoanStatus) -> int:
    """_ORDER index for gating purposes; on_hold/rejected have no position of
    their own, so terms gates fall back to NEW (most restrictive) for them."""
    return _ORDER_INDEX.get(status, _ORDER_INDEX[LoanStatus.NEW])


def validate_transition(current: LoanStatus, target: LoanStatus) -> None:
    if current in TERMINAL_STATUSES:
        raise TerminalApplication
    if target in _SIDE_BRANCH:
        return
    if current == LoanStatus.ON_HOLD:
        return  # resume to any _ORDER status
    if target not in _ORDER_INDEX:
        raise InvalidStatusTransition
    if _ORDER_INDEX[target] <= _ORDER_INDEX.get(current, -1):
        raise InvalidStatusTransition


async def apply_progress_update(
    db: AsyncSession,
    application: LoanApplication,
    payload: LoanApplicationProgressUpdate,
) -> LoanApplication:
    # Race guard: lock the row before evaluating/mutating (assign_lead_to_telecaller
    # in services/leads.py is the precedent). `application` was fetched without a
    # lock by the caller's role-scoped accessor; db.get() on the same identity
    # returns the same mapped object, now row-locked.
    locked = await db.get(LoanApplication, application.id, with_for_update=True)
    assert locked is not None  # the caller's own accessor just loaded this row
    application = locked

    if application.status in TERMINAL_STATUSES:
        raise TerminalApplication

    status_changed = False
    current_status = application.status

    if payload.status is not None and payload.status != current_status:
        validate_transition(current_status, payload.status)
        if payload.status in _SIDE_BRANCH and not payload.status_reason:
            raise StatusReasonRequired
        application.status = payload.status
        application.status_reason = payload.status_reason
        if payload.status in TERMINAL_STATUSES:
            application.closed_at = datetime.now(UTC)
        status_changed = True
    elif payload.status_reason is not None:
        application.status_reason = payload.status_reason

    effective_index = _effective_index(application.status)

    if (
        any(
            v is not None
            for v in (
                payload.amount_sanctioned,
                payload.bank_id,
                payload.interest_rate,
                payload.processing_fee,
            )
        )
        and effective_index < _SUBMITTED_INDEX
    ):
        raise TermsNotAllowedAtStage

    if payload.fee_outcome is not None and effective_index < _SANCTIONED_INDEX:
        raise TermsNotAllowedAtStage

    if payload.bank_id is not None:
        bank = await db.get(Bank, payload.bank_id)
        if bank is None or not bank.active:
            raise UnknownBank
        # Assign the relationship (not just bank_id): keeps application.bank in
        # sync in memory without a relationship reload below, which async
        # SQLAlchemy can't do via an implicit lazy access.
        application.bank = bank

    if payload.amount_sanctioned is not None:
        application.amount_sanctioned = payload.amount_sanctioned
    if payload.interest_rate is not None:
        application.interest_rate = payload.interest_rate
    if payload.processing_fee is not None:
        application.processing_fee = payload.processing_fee
    if payload.fee_outcome is not None:
        application.fee_outcome = payload.fee_outcome

    await db.commit()
    # Named attribute_names refreshes ONLY these scalar columns (re-reading
    # DB-normalized NUMERIC values, same reason as api/v1/loans.py's create
    # path) without touching loan_type/bank — a bare refresh() would expire
    # those relationships, and a later synchronous attribute access would
    # trigger an implicit lazy load, which async SQLAlchemy cannot do.
    await db.refresh(
        application,
        attribute_names=[
            "status",
            "status_reason",
            "closed_at",
            "bank_id",
            "amount_sanctioned",
            "interest_rate",
            "processing_fee",
            "fee_outcome",
        ],
    )

    if status_changed:
        client_auth_user_uuid = await db.scalar(
            select(ClientProfile.auth_user_uuid).where(
                ClientProfile.id == application.client_profile_uuid
            )
        )
        if client_auth_user_uuid is not None:
            label = _STATUS_LABEL.get(application.status, application.status.value)
            await emit_notification(
                user_uuid=client_auth_user_uuid,
                notification_type=NotificationType.LOAN_STATUS_UPDATED,
                title="Loan application update",
                body=f"Your loan application is now {label}.",
                href=f"/dashboard/loans/{application.id}",
            )
            # Referral conversion trigger (docs/specs/referral-program.md):
            # disbursed is the terminal-success event for loans. Best-effort —
            # record_conversion never raises, so a referral bug can never
            # fail a disbursal.
            if application.status == LoanStatus.DISBURSED:
                await referrals.record_conversion(
                    referred_auth_user_uuid=client_auth_user_uuid,
                    business_line="loans",
                    ref_type="loan_application",
                    ref_uuid=application.id,
                )

    return application


async def list_applications_for_admin(
    db: AsyncSession, status_filter: str | None = None
) -> list[LoanApplication]:
    stmt = (
        select(LoanApplication)
        .options(
            joinedload(LoanApplication.loan_type),
            joinedload(LoanApplication.bank),
            joinedload(LoanApplication.client_profile),
        )
        .order_by(LoanApplication.opened_at.desc())
    )
    if status_filter is not None:
        stmt = stmt.where(LoanApplication.status == LoanStatus(status_filter))
    result = await db.scalars(stmt)
    return list(result.unique().all())


async def get_application_for_admin(
    db: AsyncSession, application_id: UUID
) -> LoanApplication | None:
    return await db.scalar(
        select(LoanApplication)
        .options(
            joinedload(LoanApplication.loan_type),
            joinedload(LoanApplication.bank),
            joinedload(LoanApplication.client_profile),
        )
        .where(LoanApplication.id == application_id)
    )
