"""Offer lifecycle advance — request-session only, no bypass.

Unlike banners, offers has no Admin-approval step, so every write — including the
lifecycle-advance actions — runs on the request session under RLS (narrow
sub_admin-only allowlist, migration b5c6d7e8f9a0). advance_offer enforces the
forward-only status machine in the app layer; RLS only gates ownership + role.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.offer import Offer, OfferStatus
from app.schemas.personalization import AudienceRules, audience_rules_valid_for_offer

# Forward-only edges for what a sub_admin HTTP request may do. `expired` has
# no manual writer here by design -- it is scheduler-owned
# (app/jobs/cms_activation.py flips active -> expired on ends_at, bypassing
# this map entirely since the job runs on a superuser session, not a request).
# Adding ACTIVE -> EXPIRED here would let a human expire an offer early, which
# is exactly what ends_at exists to prevent. `archived` is reachable from
# either scheduled or active (cancel-in-place) through this map.
_TRANSITIONS: dict[OfferStatus, set[OfferStatus]] = {
    OfferStatus.DRAFT: {OfferStatus.SCHEDULED},
    OfferStatus.SCHEDULED: {OfferStatus.ACTIVE, OfferStatus.ARCHIVED},
    OfferStatus.ACTIVE: {OfferStatus.ARCHIVED},
    OfferStatus.EXPIRED: set(),
    OfferStatus.ARCHIVED: set(),
}


class OfferIllegalTransition(Exception):
    """Raised when an advance targets a status not reachable from the current one."""


class OfferNotOwned(Exception):
    """Raised when an advance targets an offer created by a different sub_admin.

    Distinct from "not found" — shared-visibility SELECT means the caller can
    already see this row in their queue, so a 404 here would be confusing."""


class OfferInvalidAudience(Exception):
    """Raised when a legacy or malformed rule set reaches activation."""


async def advance_offer(
    offer_id: UUID,
    owner_uuid: UUID,
    target_status: OfferStatus,
    db: AsyncSession,
    *,
    can_manage_any: bool = False,
) -> Offer | None:
    # Unlocked existence/ownership check first: Postgres RLS applies a table's
    # UPDATE policy (not just SELECT) to a `SELECT ... FOR UPDATE`, so locking
    # up front would make a non-owner's row disappear (404) instead of the
    # intended 403 — the caller must already satisfy offers_update's ownership
    # predicate before a locked re-select is safe to issue.
    offer = await db.scalar(select(Offer).where(Offer.id == offer_id))
    if offer is None:
        return None
    if not can_manage_any and offer.created_by_uuid != owner_uuid:
        raise OfferNotOwned
    # Now that ownership is confirmed, re-select FOR UPDATE to serialize
    # concurrent advances from the same owner (e.g. a double-clicked action),
    # mirroring banners' approve_banner/reject_banner locking.
    offer = await db.scalar(select(Offer).where(Offer.id == offer_id).with_for_update())
    if target_status not in _TRANSITIONS.get(offer.status, set()):
        raise OfferIllegalTransition
    if target_status in (OfferStatus.SCHEDULED, OfferStatus.ACTIVE):
        try:
            rules = AudienceRules.model_validate(offer.audience_rules)
        except ValueError as exc:
            raise OfferInvalidAudience from exc
        if not audience_rules_valid_for_offer(rules):
            raise OfferInvalidAudience
    offer.status = target_status
    await db.commit()
    await db.refresh(offer)
    return offer
