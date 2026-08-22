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
from decimal import Decimal
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
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
    # This legacy-named table is now the authenticated Financial Products
    # catalogue. Category prevents card/insurance enquiries from entering the
    # loan sanction and disbursal lifecycle.
    category: Mapped[str] = mapped_column(String(20), nullable=False, default="loan")
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1000)
    form_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # Validated ProductFormDefinition serialized as JSONB. Never accept or use
    # this value without parsing it through schemas.financial_products.
    custom_fields: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    # Public marketing is an explicit publication boundary. ``active`` alone
    # only means the authenticated Client form is available; an Admin must also
    # opt a product into the anonymous catalogue.
    public_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    public_summary: Mapped[str | None] = mapped_column(String(280), nullable=True)
    public_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    public_highlights: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    public_eligibility: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    public_documents: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    public_faq: Mapped[list[dict[str, str]]] = mapped_column(JSONB, nullable=False, default=list)
    homepage_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    homepage_feature_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1000)
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
    legal_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Legacy table name retained for contract compatibility. Public copy calls
    # these financial providers because the catalogue also contains NBFCs,
    # HFCs, small-finance banks, and fintech brands.
    provider_type: Mapped[str] = mapped_column(String(32), nullable=False, default="bank")
    logo_key: Mapped[str | None] = mapped_column(String, nullable=True)
    logo_source: Mapped[str | None] = mapped_column(String(500), nullable=True)
    logo_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
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


class FinancialProductProviderOffer(Base):
    """Explicit public product/provider relationship and informational terms.

    This is intentionally separate from ``BankLoanTypeAvailability``. The
    operational matrix uses a permissive missing-row default for staff
    assignment, while anonymous publication must always fail closed.
    """

    __tablename__ = "financial_product_provider_offers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    loan_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("loan_types.id", ondelete="RESTRICT"), nullable=False
    )
    bank_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("banks.id", ondelete="RESTRICT"), nullable=False
    )
    offer_name: Mapped[str] = mapped_column(String(160), nullable=False)
    summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1000)
    min_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    max_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    min_interest_rate: Mapped[Decimal | None] = mapped_column(Numeric(6, 3), nullable=True)
    max_interest_rate: Mapped[Decimal | None] = mapped_column(Numeric(6, 3), nullable=True)
    min_tenure_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_tenure_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    processing_fee_text: Mapped[str | None] = mapped_column(String(240), nullable=True)
    eligibility_summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    last_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by_uuid: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth_users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    product: Mapped["LoanType"] = relationship("LoanType")
    provider: Mapped["Bank"] = relationship("Bank")


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
    preferred_provider_offer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("financial_product_provider_offers.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Immutable informational snapshot of the option selected by the Client.
    # It never assigns ``bank_id`` or implies provider approval.
    provider_offer_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
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
    form_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    form_schema_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    form_answers: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Set once, at the moment `status` first reaches DISBURSED
    # (services/loan_applications.py::apply_progress_update) — an EVENT
    # marker, not a live-status mirror. DISBURSED is not itself terminal
    # (only CLOSED/REJECTED are, see TERMINAL_STATUSES); the forward-only
    # status machine still allows a disbursed loan to later move to CLOSED
    # (its normal next step) or, via the REJECTED side-branch, to REJECTED.
    # services/commissions.py's eligibility check reads THIS column, not
    # `status == DISBURSED`, specifically so a loan that disburses and is
    # later closed doesn't silently and permanently lose commission
    # eligibility (found in review, 2026-07-29 — see docs/specs/agent-commission.md).
    disbursed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    loan_type: Mapped["LoanType"] = relationship("LoanType")
    bank: Mapped[Optional["Bank"]] = relationship("Bank")
    client_profile: Mapped["ClientProfile"] = relationship("ClientProfile")


class FinancialServiceEnquiry(Base):
    """A submitted credit-card or insurance request outside LoanStatus."""

    __tablename__ = "financial_service_enquiries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lead_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leads.id"), nullable=False
    )
    client_profile_uuid: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("client_profiles.id"), nullable=False
    )
    business_line: Mapped[str] = mapped_column(business_line_enum, nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("loan_types.id"), nullable=False, index=True
    )
    preferred_provider_offer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("financial_product_provider_offers.id", ondelete="SET NULL"),
        nullable=True,
    )
    provider_offer_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    product_category: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="submitted")
    form_version: Mapped[int] = mapped_column(Integer, nullable=False)
    form_schema_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    form_answers: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )

    product: Mapped["LoanType"] = relationship("LoanType")
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
