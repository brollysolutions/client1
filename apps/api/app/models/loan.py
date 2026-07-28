"""Loans line — loan_types/banks reference data + the loan_applications journey
(master_erd.mermaid §LOANS LINE, docs/architecture/Client_Dashboard_System_Design.md §5.2-5.3).

loan_applications.status is the client-visible journey axis (§4.1), distinct from
leads.status (internal lead-ownership axis, never shown to the client). The
partner bank owns the EMI/amortization ledger; this table carries deal terms
only (requested/sanctioned amount, rate, fee), never a repayment schedule.
"""

import enum
import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import business_line_enum

if TYPE_CHECKING:
    from app.models.profile import ClientProfile


class LoanStatus(enum.StrEnum):
    NEW = "new"
    ASSIGNED = "assigned"
    CONTACTED = "contacted"
    DOCS_COLLECTED = "docs_collected"
    SUBMITTED_TO_BANK = "submitted_to_bank"
    SANCTIONED = "sanctioned"
    DISBURSED = "disbursed"
    CLOSED = "closed"
    REJECTED = "rejected"
    ON_HOLD = "on_hold"


class FeeOutcome(enum.StrEnum):
    WAIVED = "waived"
    CASHBACK = "cashback"
    NONE_ = "none"


_ev = lambda x: [e.value for e in x]  # noqa: E731
loan_status_enum = ENUM(LoanStatus, name="loan_status", create_type=False, values_callable=_ev)
fee_outcome_enum = ENUM(FeeOutcome, name="fee_outcome", create_type=False, values_callable=_ev)


class LoanType(Base):
    __tablename__ = "loan_types"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Open Item A (Admin_Dashboard_System_Design.md §5.2): null = shared field
    # set, populated = per-type field builder. The builder itself is out of
    # scope (feature-status.md §4) — read-only everywhere this column is exposed.
    custom_fields: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Bank(Base):
    __tablename__ = "banks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    logo_key: Mapped[str | None] = mapped_column(String, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class BankLoanTypeAvailability(Base):
    """Per-bank loan-type availability (FR-6.3, master_erd.mermaid
    §bank_loan_type_availability). Explicit override, permissive default: a
    missing (bank_id, loan_type_id) row means available — only an explicit
    `available=false` row excludes a bank. See migration 678f7a77e812's
    docstring for why this direction was chosen over a seeded full matrix.

    No `id`/`active` — the composite PK IS the identity, and there is no soft-
    disable state distinct from deleting the row (CASCADE on both FKs is safe
    here specifically because this table is pure config, not a financial or
    audit record).
    """

    __tablename__ = "bank_loan_type_availability"

    bank_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("banks.id", ondelete="CASCADE"), primary_key=True
    )
    loan_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("loan_types.id", ondelete="CASCADE"), primary_key=True
    )
    available: Mapped[bool] = mapped_column(Boolean, nullable=False)
    updated_by_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class LoanApplication(Base):
    __tablename__ = "loan_applications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lead_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id"), nullable=False
    )
    client_profile_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_profiles.id"), nullable=False
    )
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    loan_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("loan_types.id"), nullable=False
    )
    bank_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("banks.id", ondelete="SET NULL"), nullable=True
    )
    # Explicit precision/scale (not bare Numeric): an unconstrained NUMERIC round-trips
    # through asyncpg as a Decimal in scientific notation for whole-rupee values
    # (e.g. "5E+5" instead of "500000.00"), which is wrong to hand a client verbatim.
    amount_requested: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    amount_sanctioned: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    interest_rate: Mapped[float | None] = mapped_column(Numeric(6, 3), nullable=True)
    processing_fee: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    fee_outcome: Mapped[FeeOutcome | None] = mapped_column(fee_outcome_enum, nullable=True)
    status: Mapped[LoanStatus] = mapped_column(
        loan_status_enum, nullable=False, default=LoanStatus.NEW
    )
    status_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    loan_type: Mapped["LoanType"] = relationship("LoanType")
    bank: Mapped[Optional["Bank"]] = relationship("Bank")
    client_profile: Mapped["ClientProfile"] = relationship("ClientProfile")


class LoanTxnHistory(Base):
    """Telecaller's manual entry of bank/rate/date terms on a progressing loan
    (FR-6.5). Immutable — no UPDATE/DELETE grant; a correction is a new row."""

    __tablename__ = "loan_txn_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    loan_application_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("loan_applications.id"), nullable=False
    )
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    bank_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    interest_rate: Mapped[float | None] = mapped_column(Numeric(6, 3), nullable=True)
    txn_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    entered_by_staff_profile_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_profiles.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
