"""Reviewed offer lifecycle and approval-readiness checks."""

from __future__ import annotations

from datetime import UTC, datetime
from urllib.parse import urlsplit
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditAction
from app.models.offer import Offer, OfferStatus
from app.schemas.personalization import AudienceRules, audience_rules_valid_for_offer
from app.services import storage
from app.services.audit_log import record as record_audit

_SUB_ADMIN_TRANSITIONS: dict[OfferStatus, set[OfferStatus]] = {
    OfferStatus.DRAFT: {OfferStatus.PENDING_APPROVAL, OfferStatus.ARCHIVED},
    OfferStatus.REJECTED: {OfferStatus.PENDING_APPROVAL, OfferStatus.ARCHIVED},
    OfferStatus.APPROVED: {
        OfferStatus.SCHEDULED,
        OfferStatus.ACTIVE,
        OfferStatus.ARCHIVED,
    },
    OfferStatus.SCHEDULED: {OfferStatus.ACTIVE, OfferStatus.ARCHIVED},
    OfferStatus.ACTIVE: {OfferStatus.ARCHIVED},
    OfferStatus.PENDING_APPROVAL: set(),
    OfferStatus.EXPIRED: {OfferStatus.ARCHIVED},
    OfferStatus.ARCHIVED: set(),
}
_ADMIN_TRANSITIONS: dict[OfferStatus, set[OfferStatus]] = {
    OfferStatus.PENDING_APPROVAL: {OfferStatus.APPROVED, OfferStatus.REJECTED},
}
_AUDIT_ACTION = {
    OfferStatus.PENDING_APPROVAL: AuditAction.OFFER_SUBMITTED,
    OfferStatus.APPROVED: AuditAction.OFFER_APPROVED,
    OfferStatus.REJECTED: AuditAction.OFFER_REJECTED,
    OfferStatus.SCHEDULED: AuditAction.OFFER_SCHEDULED,
    OfferStatus.ACTIVE: AuditAction.OFFER_ACTIVATED,
    OfferStatus.ARCHIVED: AuditAction.OFFER_ARCHIVED,
}


class OfferIllegalTransition(Exception):
    """The requested lifecycle edge is not available to this actor."""


class OfferNotOwned(Exception):
    """A Sub Admin tried to mutate another author's shared-queue row."""


class OfferInvalidConfiguration(Exception):
    """A campaign is missing required approval or redemption evidence."""


def _is_safe_https_url(value: str | None) -> bool:
    if not value:
        return False
    parsed = urlsplit(value)
    return bool(
        parsed.scheme == "https"
        and parsed.hostname
        and parsed.username is None
        and parsed.password is None
    )


def validate_offer_for_review(offer: Offer) -> None:
    """Fail closed before submission, approval, scheduling, or activation."""
    try:
        rules = AudienceRules.model_validate(offer.audience_rules)
    except ValueError as exc:
        raise OfferInvalidConfiguration from exc
    if not audience_rules_valid_for_offer(rules):
        raise OfferInvalidConfiguration
    if not all(
        (
            offer.title and offer.title.strip(),
            offer.partner_name and offer.partner_name.strip(),
            offer.code and offer.code.strip(),
            offer.terms_summary and offer.terms_summary.strip(),
            offer.image_key and storage.public_asset_url(offer.image_key),
            _is_safe_https_url(offer.redemption_url),
        )
    ):
        raise OfferInvalidConfiguration
    if offer.terms_url and not _is_safe_https_url(offer.terms_url):
        raise OfferInvalidConfiguration
    if offer.starts_at and offer.ends_at and offer.ends_at <= offer.starts_at:
        raise OfferInvalidConfiguration


async def transition_offer(
    offer_id: UUID,
    actor_uuid: UUID,
    actor_role: str,
    target_status: OfferStatus,
    db: AsyncSession,
    *,
    review_note: str | None = None,
) -> Offer | None:
    offer = await db.scalar(select(Offer).where(Offer.id == offer_id))
    if offer is None:
        return None
    is_admin = actor_role == "admin"
    if not is_admin and offer.created_by_uuid != actor_uuid:
        raise OfferNotOwned

    offer = await db.scalar(select(Offer).where(Offer.id == offer_id).with_for_update())
    transitions = _ADMIN_TRANSITIONS if is_admin else _SUB_ADMIN_TRANSITIONS
    if target_status not in transitions.get(offer.status, set()):
        raise OfferIllegalTransition

    if target_status in {
        OfferStatus.PENDING_APPROVAL,
        OfferStatus.APPROVED,
        OfferStatus.SCHEDULED,
        OfferStatus.ACTIVE,
    }:
        validate_offer_for_review(offer)
    if target_status == OfferStatus.REJECTED and not (review_note and review_note.strip()):
        raise OfferInvalidConfiguration

    if target_status == OfferStatus.PENDING_APPROVAL:
        offer.review_note = None
        offer.reviewed_by_uuid = None
        offer.reviewed_at = None
    elif target_status in {OfferStatus.APPROVED, OfferStatus.REJECTED}:
        offer.review_note = review_note.strip() if review_note else None
        offer.reviewed_by_uuid = actor_uuid
        offer.reviewed_at = datetime.now(UTC)

    previous_status = offer.status
    offer.status = target_status
    await record_audit(
        db,
        action=_AUDIT_ACTION[target_status],
        entity_type="offer",
        entity_uuid=offer.id,
        actor_uuid=actor_uuid,
        actor_role=actor_role,
        business_line=offer.business_line,
        detail={
            "from_status": previous_status.value,
            "to_status": target_status.value,
            **({"review_note": offer.review_note} if offer.review_note else {}),
        },
    )
    await db.commit()
    await db.refresh(offer)
    return offer
