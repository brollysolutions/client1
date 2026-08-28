"""Reviewed offer lifecycle and approval-readiness checks."""

from __future__ import annotations

from datetime import UTC, datetime
from urllib.parse import urlsplit
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditAction
from app.models.notification import NotificationType
from app.models.offer import Offer, OfferStatus
from app.schemas.personalization import AudienceRules, audience_rules_valid_for_offer
from app.services import storage
from app.services.audit_log import record as record_audit
from app.services.notifications import emit_notification

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
    is_admin = actor_role == "admin"
    offer = await db.scalar(
        select(Offer).where(Offer.id == offer_id, Offer.removed_at.is_(None)).with_for_update()
    )
    if offer is None:
        return None
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
    offer.version += 1
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
    if target_status == OfferStatus.APPROVED:
        await emit_notification(
            user_uuid=offer.created_by_uuid,
            notification_type=NotificationType.CAMPAIGN_APPROVED,
            title="Offer approved",
            body=f"“{offer.title}” is ready to schedule.",
            href="/dashboard/campaigns?type=offers",
        )
    elif target_status == OfferStatus.REJECTED:
        await emit_notification(
            user_uuid=offer.created_by_uuid,
            notification_type=NotificationType.CAMPAIGN_CHANGES_REQUESTED,
            title="Changes requested for offer",
            body=f"Admin left feedback on “{offer.title}”.",
            href="/dashboard/campaigns?type=offers",
        )
    return offer


async def remove_offer(
    offer_id: UUID,
    reviewer_uuid: UUID,
    note: str,
    db: AsyncSession,
) -> Offer | None:
    offer = await db.scalar(
        select(Offer).where(Offer.id == offer_id, Offer.removed_at.is_(None)).with_for_update()
    )
    if offer is None:
        return None
    previous_status = offer.status
    offer.status = OfferStatus.ARCHIVED
    offer.removed_at = datetime.now(UTC)
    offer.removed_by_uuid = reviewer_uuid
    offer.removal_reason = note.strip()
    offer.version += 1
    await record_audit(
        db,
        action=AuditAction.OFFER_DELETED,
        entity_type="offer",
        entity_uuid=offer.id,
        actor_uuid=reviewer_uuid,
        actor_role="admin",
        business_line=offer.business_line,
        detail={
            "mode": "soft_remove",
            "from_status": previous_status.value,
            "reason": offer.removal_reason,
        },
    )
    await db.commit()
    await db.refresh(offer)
    await emit_notification(
        user_uuid=offer.created_by_uuid,
        notification_type=NotificationType.CAMPAIGN_REMOVED,
        title="Offer removed",
        body=f"Admin removed “{offer.title}” from campaign serving.",
        href="/dashboard/campaigns?type=offers",
    )
    return offer
