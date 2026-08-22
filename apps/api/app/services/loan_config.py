"""Admin loan-config CRUD — loan types, banks, per-bank availability
(FR-6.3/FR-6.4, feature-status.md §3 #4, migration 678f7a77e812).

Runs entirely on the request-scoped `db` session — no AsyncSessionLocal import
here, so no conftest `_patch_db_null_pool` entry is needed (mirrors
services/loan_applications.py and services/offers.py).

Availability is an EXPLICIT OVERRIDE with a PERMISSIVE DEFAULT: a missing
(bank_id, loan_type_id) row in `bank_loan_type_availability` means available.
`is_bank_available` and every reader in this module treat absence that way —
see the migration docstring for the full reasoning against a seeded full
matrix. `set_bank_availability` UPSERTs every entry the admin submits
(`ON CONFLICT DO UPDATE` — the migration grants no DELETE on this table, on
purpose: it is pure config, and the admin console's checkbox grid always
submits the complete current loan-type vector for a bank, true and false
cells alike, so there is no sparse-omission case that needs a delete to
resolve). A loan type that no longer exists can't be un-submitted because
loan types are never hard-deleted either (§ no-DELETE, migration
678f7a77e812) — only deactivated, which this table doesn't need to react to.
"""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditAction
from app.models.loan import (
    Bank,
    BankLoanTypeAvailability,
    FinancialServiceEnquiry,
    LoanApplication,
    LoanType,
)
from app.schemas.financial_catalog import FinancialProductMarketingFields
from app.schemas.financial_products import ProductCategory, ensure_category_form
from app.schemas.loan_config import (
    BankAvailabilitySetEntry,
    BankCreate,
    BankUpdate,
    LoanTypeCreate,
    LoanTypeUpdate,
)
from app.services.audit_log import record as record_audit
from app.services.financial_catalog import ProviderLogoInvalid, validate_provider_logo_key
from app.services.financial_products import serialize_form, starter_form_for

_SLUG_INVALID = re.compile(r"[^a-z0-9]+")


class DuplicateLoanTypeName(Exception):
    """Raised when the derived slug collides with an existing loan_types.name."""


class DuplicateBankName(Exception):
    """Raised when a bank name collides case-insensitively with an existing one."""


class LoanTypeNotFound(Exception):
    """Raised when a loan_type id doesn't resolve — 404, never 403 (the caller
    is already require_admin-gated, so a miss here is a genuine absence)."""


class InvalidProductForm(Exception):
    """Raised when a form violates the selected product category's invariants."""


class BankNotFound(Exception):
    """Raised when a bank id doesn't resolve."""


def _slugify(label: str) -> str:
    slug = _SLUG_INVALID.sub("-", label.strip().lower()).strip("-")
    return slug or "loan-type"


# ---------------------------------------------------------------------------
# Loan types
# ---------------------------------------------------------------------------


async def list_loan_types(db: AsyncSession) -> list[LoanType]:
    """All rows, including inactive — this is the admin console's read, unlike
    GET /api/v1/loans/loan-types which filters active=True for every role."""
    result = await db.scalars(select(LoanType).order_by(LoanType.display_order, LoanType.label))
    return list(result.all())


async def loan_type_application_counts(db: AsyncSession) -> dict[UUID, int]:
    rows = (
        await db.execute(
            select(LoanApplication.loan_type_id, func.count()).group_by(
                LoanApplication.loan_type_id
            )
        )
    ).all()
    return {loan_type_id: count for loan_type_id, count in rows}


async def loan_type_enquiry_counts(db: AsyncSession) -> dict[UUID, int]:
    rows = (
        await db.execute(
            select(FinancialServiceEnquiry.product_id, func.count()).group_by(
                FinancialServiceEnquiry.product_id
            )
        )
    ).all()
    return {product_id: count for product_id, count in rows}


async def create_loan_type(
    db: AsyncSession,
    payload: LoanTypeCreate,
    *,
    actor_uuid: UUID | None,
    actor_role: str | None,
) -> LoanType:
    definition = payload.form_schema or starter_form_for(payload.category)
    loan_type = LoanType(
        id=uuid.uuid4(),
        name=_slugify(payload.label),
        label=payload.label,
        category=payload.category.value,
        display_order=payload.display_order,
        form_version=1,
        custom_fields=serialize_form(definition),
    )
    db.add(loan_type)
    try:
        await db.flush()  # get loan_type.id; also surfaces the name UNIQUE race
    except IntegrityError as exc:
        await db.rollback()
        raise DuplicateLoanTypeName from exc

    await record_audit(
        db,
        action=AuditAction.LOAN_TYPE_CREATED,
        entity_type="loan_type",
        entity_uuid=loan_type.id,
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        business_line="loans",
        detail={
            "name": loan_type.name,
            "label": loan_type.label,
            "category": loan_type.category,
            "display_order": loan_type.display_order,
            "form_version": loan_type.form_version,
            "field_keys": [field.key for field in definition.fields()],
        },
    )
    await db.commit()
    await db.refresh(loan_type)
    return loan_type


async def update_loan_type(
    db: AsyncSession,
    loan_type_id: UUID,
    payload: LoanTypeUpdate,
    *,
    actor_uuid: UUID | None,
    actor_role: str | None,
) -> LoanType:
    # Unlocked existence check first, then a locked re-read — a locked SELECT
    # is gated by the UPDATE policy, not the (more permissive) SELECT policy,
    # so locking before confirming existence would report a genuine 404 as
    # something less clear. populate_existing refreshes any already-loaded
    # scalar attributes; with_for_update alone does not.
    exists = await db.scalar(select(LoanType.id).where(LoanType.id == loan_type_id))
    if exists is None:
        raise LoanTypeNotFound
    loan_type = await db.get(LoanType, loan_type_id, with_for_update=True, populate_existing=True)
    if loan_type is None:
        raise LoanTypeNotFound

    changed: dict[str, object] = {}
    if payload.label is not None and payload.label != loan_type.label:
        loan_type.label = payload.label
        changed["label"] = payload.label
    if payload.active is not None and payload.active != loan_type.active:
        loan_type.active = payload.active
        changed["active"] = payload.active
    if payload.display_order is not None and payload.display_order != loan_type.display_order:
        loan_type.display_order = payload.display_order
        changed["display_order"] = payload.display_order
    if payload.form_schema is not None:
        try:
            ensure_category_form(ProductCategory(loan_type.category), payload.form_schema)
        except ValueError as exc:
            raise InvalidProductForm(str(exc)) from exc
        serialized = serialize_form(payload.form_schema)
        if serialized != loan_type.custom_fields:
            loan_type.custom_fields = serialized
            loan_type.form_version += 1
            changed["form_version"] = loan_type.form_version
            changed["field_keys"] = [field.key for field in payload.form_schema.fields()]

    marketing_fields = {
        "public_visible",
        "public_summary",
        "public_description",
        "public_highlights",
        "public_eligibility",
        "public_documents",
        "public_faq",
        "homepage_featured",
        "homepage_feature_order",
    }
    if payload.model_fields_set & marketing_fields:
        merged = {
            "public_visible": loan_type.public_visible,
            "public_summary": loan_type.public_summary,
            "public_description": loan_type.public_description,
            "public_highlights": loan_type.public_highlights,
            "public_eligibility": loan_type.public_eligibility,
            "public_documents": loan_type.public_documents,
            "public_faq": loan_type.public_faq,
            "homepage_featured": loan_type.homepage_featured,
            "homepage_feature_order": loan_type.homepage_feature_order,
        }
        merged.update(payload.model_dump(include=marketing_fields, exclude_unset=True))
        try:
            marketing = FinancialProductMarketingFields.model_validate(merged)
        except ValueError as exc:
            raise InvalidProductForm(str(exc)) from exc
        for field in marketing_fields:
            value = getattr(marketing, field)
            if field == "public_faq":
                value = [item.model_dump() for item in value]
            if getattr(loan_type, field) != value:
                setattr(loan_type, field, value)
                changed[field] = value

    if changed:
        await record_audit(
            db,
            action=AuditAction.LOAN_TYPE_UPDATED,
            entity_type="loan_type",
            entity_uuid=loan_type.id,
            actor_uuid=actor_uuid,
            actor_role=actor_role,
            business_line="loans",
            detail={"changed": sorted(changed), **changed},
        )
    await db.commit()
    await db.refresh(loan_type)
    return loan_type


# ---------------------------------------------------------------------------
# Banks
# ---------------------------------------------------------------------------


async def list_banks(db: AsyncSession) -> list[Bank]:
    result = await db.scalars(select(Bank).order_by(Bank.name))
    return list(result.all())


async def bank_application_counts(db: AsyncSession) -> dict[UUID, int]:
    rows = (
        await db.execute(
            select(LoanApplication.bank_id, func.count())
            .where(LoanApplication.bank_id.is_not(None))
            .group_by(LoanApplication.bank_id)
        )
    ).all()
    return {bank_id: count for bank_id, count in rows}


async def create_bank(
    db: AsyncSession,
    payload: BankCreate,
    *,
    actor_uuid: UUID | None,
    actor_role: str | None,
) -> Bank:
    validate_provider_logo_key(payload.logo_key)
    bank = Bank(
        id=uuid.uuid4(),
        name=payload.name.strip(),
        legal_name=payload.legal_name.strip() if payload.legal_name else None,
        provider_type=payload.provider_type.value,
        logo_key=payload.logo_key,
        logo_source=payload.logo_source.strip() if payload.logo_source else None,
        logo_verified_at=datetime.now(UTC) if payload.logo_key else None,
    )
    db.add(bank)
    try:
        await db.flush()  # get bank.id; also surfaces the lower(name) UNIQUE race
    except IntegrityError as exc:
        await db.rollback()
        raise DuplicateBankName from exc

    await record_audit(
        db,
        action=AuditAction.BANK_CREATED,
        entity_type="bank",
        entity_uuid=bank.id,
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        business_line="loans",
        detail={"name": bank.name},
    )
    await db.commit()
    await db.refresh(bank)
    return bank


async def update_bank(
    db: AsyncSession,
    bank_id: UUID,
    payload: BankUpdate,
    *,
    actor_uuid: UUID | None,
    actor_role: str | None,
) -> Bank:
    exists = await db.scalar(select(Bank.id).where(Bank.id == bank_id))
    if exists is None:
        raise BankNotFound
    bank = await db.get(Bank, bank_id, with_for_update=True, populate_existing=True)
    if bank is None:
        raise BankNotFound

    changed: dict[str, object] = {}
    if payload.name is not None and payload.name != bank.name:
        changed["name"] = payload.name.strip()
    if "legal_name" in payload.model_fields_set:
        legal_name = payload.legal_name.strip() if payload.legal_name else None
        if legal_name != bank.legal_name:
            changed["legal_name"] = legal_name
    if payload.provider_type is not None and payload.provider_type.value != bank.provider_type:
        changed["provider_type"] = payload.provider_type.value
    if "logo_key" in payload.model_fields_set:
        validate_provider_logo_key(payload.logo_key)
        if payload.logo_key != bank.logo_key:
            changed["logo_key"] = payload.logo_key
            changed["logo_verified_at"] = datetime.now(UTC) if payload.logo_key else None
            if payload.logo_key is None and "logo_source" not in payload.model_fields_set:
                changed["logo_source"] = None
    if "logo_source" in payload.model_fields_set:
        logo_source = payload.logo_source.strip() if payload.logo_source else None
        effective_logo_key = (
            payload.logo_key if "logo_key" in payload.model_fields_set else bank.logo_key
        )
        if effective_logo_key is not None and logo_source is None:
            raise ProviderLogoInvalid
        if logo_source != bank.logo_source:
            changed["logo_source"] = logo_source
    if payload.active is not None and payload.active != bank.active:
        changed["active"] = payload.active

    if changed:
        if "name" in changed:
            bank.name = changed["name"]
        for field in (
            "legal_name",
            "provider_type",
            "logo_key",
            "logo_source",
            "logo_verified_at",
        ):
            if field in changed:
                setattr(bank, field, changed[field])
        if "active" in changed:
            bank.active = payload.active
        try:
            await record_audit(
                db,
                action=AuditAction.BANK_UPDATED,
                entity_type="bank",
                entity_uuid=bank.id,
                actor_uuid=actor_uuid,
                actor_role=actor_role,
                business_line="loans",
                detail={"changed": sorted(changed), **changed},
            )
        except IntegrityError as exc:
            await db.rollback()
            raise DuplicateBankName from exc

    await db.commit()
    await db.refresh(bank)
    return bank


# ---------------------------------------------------------------------------
# Availability
# ---------------------------------------------------------------------------


async def list_availability_entries(db: AsyncSession) -> list[BankLoanTypeAvailability]:
    result = await db.scalars(select(BankLoanTypeAvailability))
    return list(result.all())


async def is_bank_available(db: AsyncSession, bank_id: UUID, loan_type_id: UUID) -> bool:
    """Absence = available. Only an explicit `available=false` row excludes."""
    excluded = await db.scalar(
        select(BankLoanTypeAvailability.bank_id).where(
            BankLoanTypeAvailability.bank_id == bank_id,
            BankLoanTypeAvailability.loan_type_id == loan_type_id,
            BankLoanTypeAvailability.available.is_(False),
        )
    )
    return excluded is None


async def set_bank_availability(
    db: AsyncSession,
    bank_id: UUID,
    entries: list[BankAvailabilitySetEntry],
    *,
    actor_uuid: UUID | None,
    actor_role: str | None,
) -> list[BankLoanTypeAvailability]:
    bank = await db.get(Bank, bank_id, with_for_update=True)
    if bank is None:
        raise BankNotFound

    if entries:
        stmt = pg_insert(BankLoanTypeAvailability).values(
            [
                {
                    "bank_id": bank_id,
                    "loan_type_id": entry.loan_type_id,
                    "available": entry.available,
                    "updated_by_uuid": actor_uuid,
                }
                for entry in entries
            ]
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["bank_id", "loan_type_id"],
            set_={
                "available": stmt.excluded.available,
                "updated_by_uuid": stmt.excluded.updated_by_uuid,
                "updated_at": func.now(),
            },
            where=BankLoanTypeAvailability.available.is_distinct_from(stmt.excluded.available),
        )
        try:
            await db.execute(stmt)
        except IntegrityError as exc:
            await db.rollback()
            raise LoanTypeNotFound from exc

    await record_audit(
        db,
        action=AuditAction.BANK_AVAILABILITY_UPDATED,
        entity_type="bank_loan_type_availability",
        entity_uuid=bank_id,
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        business_line="loans",
        detail={
            "excluded_loan_type_ids": sorted(
                str(e.loan_type_id) for e in entries if not e.available
            ),
        },
    )
    await db.commit()
    return await list_availability_entries(db)
