"""Public Financial Services catalogue and Admin provider-offer configuration."""

from __future__ import annotations

import asyncio
import re
import uuid
from contextlib import suppress
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditAction
from app.models.loan import Bank, FinancialProductProviderOffer, LoanType
from app.schemas.financial_catalog import (
    ProviderOfferCreate,
    ProviderOfferSort,
    ProviderOfferUpdate,
)
from app.services import storage
from app.services.audit_log import record as record_audit
from app.services.media_processing import (
    MalwareDetected,
    MediaProcessingError,
    ScannerUnavailable,
    canonicalize_object,
)

PROVIDER_LOGO_MAX_BYTES = 1024 * 1024
_LOGO_STAGING_PREFIX = "private/provider-logos/staging/"
_LOGO_PUBLIC_PREFIX = "public/provider-logos/"
_LOGO_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
_SAFE_FILENAME = re.compile(r"[^A-Za-z0-9._-]")
# Repository SVGs must be reviewed and added here in the same code change as
# the asset. The manifest remains empty until the supplied names have approved
# canonical identities plus trademark/source provenance.
_REVIEWED_BUILT_IN_LOGO_KEYS: frozenset[str] = frozenset()
_MANAGED_LOGO_KEY = re.compile(
    r"^public/provider-logos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-"
    r"[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-"
    r"[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$"
)


class FinancialCatalogError(Exception):
    pass


class ProductOrProviderNotFound(FinancialCatalogError):
    pass


class ProviderOfferNotFound(FinancialCatalogError):
    pass


class ProviderOfferInvalid(FinancialCatalogError):
    pass


class ProviderOfferTermsInvalid(ProviderOfferInvalid):
    pass


class ProviderLogoInvalid(FinancialCatalogError):
    pass


class ProviderLogoStorageUnavailable(FinancialCatalogError):
    pass


def provider_logo_url(logo_key: str | None) -> str | None:
    """Return only reviewed local SVGs or canonical public raster uploads."""
    if logo_key is None:
        return None
    if logo_key in _REVIEWED_BUILT_IN_LOGO_KEYS:
        return logo_key
    if _MANAGED_LOGO_KEY.fullmatch(logo_key):
        return storage.public_asset_url(logo_key)
    return None


def validate_provider_logo_key(logo_key: str | None) -> None:
    if logo_key is None:
        return
    if not (logo_key in _REVIEWED_BUILT_IN_LOGO_KEYS or _MANAGED_LOGO_KEY.fullmatch(logo_key)):
        raise ProviderLogoInvalid


async def delete_managed_provider_logo(logo_key: str | None) -> None:
    """Best-effort cleanup for a provider row that was safely deleted.

    Reviewed repository assets are shared code, not owned objects. Only a
    canonical managed raster key belongs to the provider lifecycle.
    """
    if logo_key is None or not _MANAGED_LOGO_KEY.fullmatch(logo_key):
        return
    with suppress(Exception):
        await asyncio.to_thread(storage.delete_object, logo_key)


async def list_public_products(
    db: AsyncSession,
    *,
    query: str | None,
    category: str | None,
    featured: bool | None,
    page: int,
    page_size: int,
) -> tuple[list[tuple[LoanType, int]], int]:
    provider_count = (
        select(
            FinancialProductProviderOffer.loan_type_id.label("product_id"),
            func.count(func.distinct(FinancialProductProviderOffer.bank_id)).label(
                "provider_count"
            ),
        )
        .join(Bank, Bank.id == FinancialProductProviderOffer.bank_id)
        .where(
            FinancialProductProviderOffer.published.is_(True),
            FinancialProductProviderOffer.last_verified_at.is_not(None),
            Bank.active.is_(True),
        )
        .group_by(FinancialProductProviderOffer.loan_type_id)
        .subquery()
    )
    predicates = [
        LoanType.active.is_(True),
        LoanType.public_visible.is_(True),
        LoanType.public_summary.is_not(None),
        LoanType.public_description.is_not(None),
    ]
    if query:
        pattern = f"%{query.strip()}%"
        predicates.append(
            or_(
                LoanType.label.ilike(pattern),
                LoanType.public_summary.ilike(pattern),
                LoanType.public_description.ilike(pattern),
            )
        )
    if category:
        predicates.append(LoanType.category == category)
    if featured is not None:
        predicates.append(LoanType.homepage_featured.is_(featured))

    total = await db.scalar(select(func.count()).select_from(LoanType).where(*predicates))
    statement = (
        select(LoanType, func.coalesce(provider_count.c.provider_count, 0))
        .outerjoin(provider_count, provider_count.c.product_id == LoanType.id)
        .where(*predicates)
        .order_by(
            LoanType.homepage_featured.desc(),
            LoanType.homepage_feature_order,
            LoanType.display_order,
            LoanType.label,
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return list((await db.execute(statement)).all()), int(total or 0)


async def get_public_product(db: AsyncSession, slug: str) -> tuple[LoanType, int] | None:
    provider_count = (
        select(func.count(func.distinct(FinancialProductProviderOffer.bank_id)))
        .join(Bank, Bank.id == FinancialProductProviderOffer.bank_id)
        .where(
            FinancialProductProviderOffer.loan_type_id == LoanType.id,
            FinancialProductProviderOffer.published.is_(True),
            FinancialProductProviderOffer.last_verified_at.is_not(None),
            Bank.active.is_(True),
        )
        .correlate(LoanType)
        .scalar_subquery()
    )
    row = (
        await db.execute(
            select(LoanType, provider_count)
            .where(
                LoanType.name == slug,
                LoanType.active.is_(True),
                LoanType.public_visible.is_(True),
                LoanType.public_summary.is_not(None),
                LoanType.public_description.is_not(None),
            )
            .limit(1)
        )
    ).one_or_none()
    return (row[0], int(row[1] or 0)) if row is not None else None


async def list_public_provider_offers(
    db: AsyncSession,
    *,
    product: LoanType,
    query: str | None,
    provider_type: str | None,
    amount: Decimal | None,
    interest_rate_max: Decimal | None,
    tenure_months: int | None,
    sort: ProviderOfferSort,
    page: int,
    page_size: int,
) -> tuple[list[tuple[FinancialProductProviderOffer, Bank]], int]:
    predicates = [
        FinancialProductProviderOffer.loan_type_id == product.id,
        FinancialProductProviderOffer.published.is_(True),
        FinancialProductProviderOffer.last_verified_at.is_not(None),
        Bank.active.is_(True),
    ]
    if query:
        pattern = f"%{query.strip()}%"
        predicates.append(
            or_(
                Bank.name.ilike(pattern),
                Bank.legal_name.ilike(pattern),
                FinancialProductProviderOffer.offer_name.ilike(pattern),
            )
        )
    if provider_type:
        predicates.append(Bank.provider_type == provider_type)
    if amount is not None:
        predicates.extend(
            (
                or_(
                    FinancialProductProviderOffer.min_amount.is_(None),
                    FinancialProductProviderOffer.min_amount <= amount,
                ),
                or_(
                    FinancialProductProviderOffer.max_amount.is_(None),
                    FinancialProductProviderOffer.max_amount >= amount,
                ),
            )
        )
    if interest_rate_max is not None:
        predicates.append(
            or_(
                FinancialProductProviderOffer.min_interest_rate.is_(None),
                FinancialProductProviderOffer.min_interest_rate <= interest_rate_max,
            )
        )
    if tenure_months is not None:
        predicates.extend(
            (
                or_(
                    FinancialProductProviderOffer.min_tenure_months.is_(None),
                    FinancialProductProviderOffer.min_tenure_months <= tenure_months,
                ),
                or_(
                    FinancialProductProviderOffer.max_tenure_months.is_(None),
                    FinancialProductProviderOffer.max_tenure_months >= tenure_months,
                ),
            )
        )

    total = await db.scalar(
        select(func.count())
        .select_from(FinancialProductProviderOffer)
        .join(Bank, Bank.id == FinancialProductProviderOffer.bank_id)
        .where(*predicates)
    )
    ordering = {
        "recommended": (
            FinancialProductProviderOffer.display_order,
            FinancialProductProviderOffer.offer_name,
        ),
        "interest_rate": (
            FinancialProductProviderOffer.min_interest_rate.asc().nulls_last(),
            FinancialProductProviderOffer.display_order,
        ),
        "amount": (
            FinancialProductProviderOffer.max_amount.desc().nulls_last(),
            FinancialProductProviderOffer.display_order,
        ),
        "updated": (
            FinancialProductProviderOffer.last_verified_at.desc().nulls_last(),
            FinancialProductProviderOffer.updated_at.desc(),
        ),
    }[sort]
    statement = (
        select(FinancialProductProviderOffer, Bank)
        .join(Bank, Bank.id == FinancialProductProviderOffer.bank_id)
        .where(*predicates)
        .order_by(*ordering, FinancialProductProviderOffer.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return list((await db.execute(statement)).all()), int(total or 0)


async def list_admin_provider_offers(
    db: AsyncSession,
) -> list[tuple[FinancialProductProviderOffer, LoanType, Bank]]:
    result = await db.execute(
        select(FinancialProductProviderOffer, LoanType, Bank)
        .join(LoanType, LoanType.id == FinancialProductProviderOffer.loan_type_id)
        .join(Bank, Bank.id == FinancialProductProviderOffer.bank_id)
        .order_by(LoanType.display_order, FinancialProductProviderOffer.display_order, Bank.name)
    )
    return list(result.all())


async def _validate_offer_parents(
    db: AsyncSession, payload: ProviderOfferCreate
) -> tuple[LoanType, Bank]:
    product = await db.get(LoanType, payload.loan_type_id)
    provider = await db.get(Bank, payload.bank_id)
    if product is None or provider is None:
        raise ProductOrProviderNotFound
    if payload.published and (
        not product.active
        or not product.public_visible
        or not provider.active
        or payload.last_verified_at is None
    ):
        raise ProviderOfferInvalid
    return product, provider


async def create_provider_offer(
    db: AsyncSession,
    payload: ProviderOfferCreate,
    *,
    actor_uuid: UUID,
    actor_role: str,
) -> FinancialProductProviderOffer:
    await _validate_offer_parents(db, payload)
    offer = FinancialProductProviderOffer(
        id=uuid.uuid4(), created_by_uuid=actor_uuid, **payload.model_dump()
    )
    db.add(offer)
    await db.flush()
    await record_audit(
        db,
        action=AuditAction.FINANCIAL_PRODUCT_OFFER_CREATED,
        entity_type="financial_product_provider_offer",
        entity_uuid=offer.id,
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        business_line="loans",
        detail={
            "loan_type_id": str(offer.loan_type_id),
            "bank_id": str(offer.bank_id),
            "published": offer.published,
        },
    )
    await db.commit()
    await db.refresh(offer)
    return offer


async def update_provider_offer(
    db: AsyncSession,
    offer_id: UUID,
    payload: ProviderOfferUpdate,
    *,
    actor_uuid: UUID,
    actor_role: str,
) -> FinancialProductProviderOffer:
    offer = await db.scalar(
        select(FinancialProductProviderOffer)
        .where(FinancialProductProviderOffer.id == offer_id)
        .with_for_update()
    )
    if offer is None:
        raise ProviderOfferNotFound
    merged = {
        field: getattr(offer, field)
        for field in ProviderOfferCreate.model_fields
        if field not in {"loan_type_id", "bank_id"}
    }
    merged.update(payload.model_dump(exclude_unset=True))
    try:
        validated = ProviderOfferCreate(
            loan_type_id=offer.loan_type_id,
            bank_id=offer.bank_id,
            **merged,
        )
    except ValueError as exc:
        raise ProviderOfferTermsInvalid(str(exc)) from exc
    await _validate_offer_parents(db, validated)
    changed: list[str] = []
    for field in payload.model_fields_set:
        value = getattr(validated, field)
        if getattr(offer, field) != value:
            setattr(offer, field, value)
            changed.append(field)
    if changed:
        await record_audit(
            db,
            action=AuditAction.FINANCIAL_PRODUCT_OFFER_UPDATED,
            entity_type="financial_product_provider_offer",
            entity_uuid=offer.id,
            actor_uuid=actor_uuid,
            actor_role=actor_role,
            business_line="loans",
            detail={"changed": sorted(changed)},
        )
    await db.commit()
    await db.refresh(offer)
    return offer


def presign_provider_logo(filename: str, content_type: str) -> tuple[str, dict[str, str], str]:
    extension = _LOGO_EXTENSIONS.get(content_type)
    if extension is None:
        raise ProviderLogoInvalid
    safe_name = _SAFE_FILENAME.sub("_", filename).lstrip(".")[-80:] or f"logo{extension}"
    object_key = f"{_LOGO_STAGING_PREFIX}{uuid.uuid4()}/{safe_name}"
    upload_url, fields = storage.presign_upload_post(
        object_key,
        content_type,
        max_bytes=PROVIDER_LOGO_MAX_BYTES,
    )
    return upload_url, fields, object_key


async def confirm_provider_logo(
    db: AsyncSession,
    bank_id: UUID,
    *,
    object_key: str,
    content_type: str,
    source_reference: str,
    actor_uuid: UUID,
    actor_role: str,
) -> Bank:
    if not object_key.startswith(_LOGO_STAGING_PREFIX) or content_type not in _LOGO_EXTENSIONS:
        raise ProviderLogoInvalid
    provider = await db.scalar(select(Bank).where(Bank.id == bank_id).with_for_update())
    if provider is None:
        raise ProductOrProviderNotFound
    canonical_key = (
        f"{_LOGO_PUBLIC_PREFIX}{provider.id}/{uuid.uuid4()}{_LOGO_EXTENSIONS[content_type]}"
    )
    try:
        size = await asyncio.to_thread(storage.head_object, object_key)
        if size is None or not 1 <= size <= PROVIDER_LOGO_MAX_BYTES:
            raise ProviderLogoInvalid
        if not await asyncio.to_thread(
            storage.content_matches_declared_type, object_key, content_type
        ):
            raise ProviderLogoInvalid
        await asyncio.to_thread(
            canonicalize_object,
            object_key,
            canonical_key,
            content_type,
            max_bytes=PROVIDER_LOGO_MAX_BYTES,
        )
    except ScannerUnavailable as exc:
        with suppress(Exception):
            await asyncio.to_thread(storage.delete_object, canonical_key)
        raise ProviderLogoStorageUnavailable from exc
    except (MalwareDetected, MediaProcessingError, ProviderLogoInvalid) as exc:
        with suppress(Exception):
            await asyncio.to_thread(storage.delete_object, object_key)
        with suppress(Exception):
            await asyncio.to_thread(storage.delete_object, canonical_key)
        raise ProviderLogoInvalid from exc
    except Exception as exc:
        with suppress(Exception):
            await asyncio.to_thread(storage.delete_object, canonical_key)
        raise ProviderLogoStorageUnavailable from exc

    previous_key = provider.logo_key
    provider.logo_key = canonical_key
    provider.logo_source = source_reference.strip()
    provider.logo_verified_at = datetime.now(UTC)
    await record_audit(
        db,
        action=AuditAction.BANK_UPDATED,
        entity_type="bank",
        entity_uuid=provider.id,
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        business_line="loans",
        detail={"changed": ["logo_key", "logo_source", "logo_verified_at"]},
    )
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        with suppress(Exception):
            await asyncio.to_thread(storage.delete_object, canonical_key)
        raise
    await db.refresh(provider)
    with suppress(Exception):
        await asyncio.to_thread(storage.delete_object, object_key)
    if previous_key and previous_key.startswith(_LOGO_PUBLIC_PREFIX):
        with suppress(Exception):
            await asyncio.to_thread(storage.delete_object, previous_key)
    return provider
