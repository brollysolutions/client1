"""Property deal lifecycle — creation + status/deal-terms progression.

Real-estate analogue of services/loan_applications.py. Creation is
telecaller-only (staff-driven, unlike loans' client self-service Apply):
apply_progress_update is shared by the Telecaller (own assigned-lead deals)
and Admin (any deal, platform bypass) progress endpoints. Runs entirely on
the request-scoped `db` session for the progression path — no AsyncSessionLocal
import here, so no conftest _patch_db_null_pool entry is needed
(emit_notification and resolve_realestate_client_profile each own their own
bypass session internally).

State machine: forward-only along _ORDER (multi-step jumps allowed), with
on_hold/rejected reachable as a side-branch from any non-terminal status and
on_hold resumable to any _ORDER status or rejected — identical shape to
loan_applications. No one-active-deal-per-client constraint (deliberate
deviation from loans): a client can reasonably pursue several properties
concurrently.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.lead import Lead
from app.models.notification import NotificationType
from app.models.profile import ClientProfile
from app.models.property import Property
from app.models.property_deal import PropertyDeal, PropertyDealStatus
from app.models.site_visit import SiteVisit
from app.schemas.property_deals import PropertyDealProgressUpdate
from app.services.leads import resolve_realestate_client_profile
from app.services.notifications import emit_notification

_ORDER = [
    PropertyDealStatus.NEW,
    PropertyDealStatus.CONTACTED,
    PropertyDealStatus.SITE_VISIT_DONE,
    PropertyDealStatus.NEGOTIATION,
    PropertyDealStatus.BOOKED,
    PropertyDealStatus.AGREEMENT_SIGNED,
    PropertyDealStatus.CLOSED,
]
_ORDER_INDEX = {status: i for i, status in enumerate(_ORDER)}
_TERMINAL = {PropertyDealStatus.CLOSED, PropertyDealStatus.REJECTED}
_SIDE_BRANCH = {PropertyDealStatus.ON_HOLD, PropertyDealStatus.REJECTED}
_BOOKED_INDEX = _ORDER_INDEX[PropertyDealStatus.BOOKED]

_STATUS_LABEL = {
    PropertyDealStatus.NEW: "new",
    PropertyDealStatus.CONTACTED: "contacted",
    PropertyDealStatus.SITE_VISIT_DONE: "site visit done",
    PropertyDealStatus.NEGOTIATION: "in negotiation",
    PropertyDealStatus.BOOKED: "booked",
    PropertyDealStatus.AGREEMENT_SIGNED: "agreement signed",
    PropertyDealStatus.CLOSED: "closed",
    PropertyDealStatus.REJECTED: "rejected",
    PropertyDealStatus.ON_HOLD: "on hold",
}


class TerminalDeal(Exception):
    """Raised when the deal is already closed/rejected (frozen)."""


class InvalidStatusTransition(Exception):
    """Raised on a backward move or any move out of a terminal status."""


class StatusReasonRequired(Exception):
    """Raised when moving to rejected/on_hold without a status_reason."""


class TermsNotAllowedAtStage(Exception):
    """Raised when a deal-terms field is set before its stage gate opens."""


class UnknownSiteVisit(Exception):
    """Raised when site_visit_uuid doesn't reference an existing visit owned
    by this deal's client."""


class ClientNotRegistered(Exception):
    """Raised when the lead's mobile has no registered active real-estate client."""


class PropertyNotFound(Exception):
    """Raised when property_id doesn't reference an existing active property."""


class LeadNotRealEstateLine(Exception):
    """Raised when a deal is opened against a non-real-estate lead."""


def _effective_index(status: PropertyDealStatus) -> int:
    """_ORDER index for gating purposes; on_hold/rejected have no position of
    their own, so the terms gate falls back to NEW (most restrictive)."""
    return _ORDER_INDEX.get(status, _ORDER_INDEX[PropertyDealStatus.NEW])


def validate_transition(current: PropertyDealStatus, target: PropertyDealStatus) -> None:
    if current in _TERMINAL:
        raise TerminalDeal
    if target in _SIDE_BRANCH:
        return
    if current == PropertyDealStatus.ON_HOLD:
        return  # resume to any _ORDER status
    if target not in _ORDER_INDEX:
        raise InvalidStatusTransition
    if _ORDER_INDEX[target] <= _ORDER_INDEX.get(current, -1):
        raise InvalidStatusTransition


async def create_deal_for_lead(db: AsyncSession, lead: Lead, property_id: UUID) -> PropertyDeal:
    if lead.business_line != "real_estate":
        raise LeadNotRealEstateLine

    prop = await db.get(Property, property_id)
    if prop is None or not prop.active:
        raise PropertyNotFound

    client_profile_uuid = await resolve_realestate_client_profile(lead.mobile)
    if client_profile_uuid is None:
        raise ClientNotRegistered

    deal = PropertyDeal(
        lead_uuid=lead.id,
        client_profile_uuid=client_profile_uuid,
        property_id=prop.id,
        business_line="real_estate",
    )
    # Assign the relationship (not just property_id): keeps deal.property in
    # sync in memory without a relationship reload, which async SQLAlchemy
    # can't do via an implicit lazy access (same trick as bank_id/bank in
    # loan_applications.apply_progress_update).
    deal.property = prop
    db.add(deal)
    await db.commit()
    return deal


async def apply_progress_update(
    db: AsyncSession, deal: PropertyDeal, payload: PropertyDealProgressUpdate
) -> PropertyDeal:
    # Race guard: lock the row before evaluating/mutating (assign_lead_to_telecaller
    # in services/leads.py is the precedent). `deal` was fetched without a lock by
    # the caller's role-scoped accessor; db.get() on the same identity returns the
    # same mapped object, now row-locked.
    locked = await db.get(PropertyDeal, deal.id, with_for_update=True)
    assert locked is not None  # the caller's own accessor just loaded this row
    deal = locked

    if deal.status in _TERMINAL:
        raise TerminalDeal

    client_auth_user_uuid = await db.scalar(
        select(ClientProfile.auth_user_uuid).where(ClientProfile.id == deal.client_profile_uuid)
    )

    status_changed = False
    current_status = deal.status

    if payload.status is not None and payload.status != current_status:
        validate_transition(current_status, payload.status)
        if payload.status in _SIDE_BRANCH and not payload.status_reason:
            raise StatusReasonRequired
        deal.status = payload.status
        deal.status_reason = payload.status_reason
        if payload.status in _TERMINAL:
            deal.closed_at = datetime.now(UTC)
        status_changed = True
    elif payload.status_reason is not None:
        deal.status_reason = payload.status_reason

    effective_index = _effective_index(deal.status)

    if (
        payload.price_quoted is not None or payload.booking_amount is not None
    ) and effective_index < _BOOKED_INDEX:
        raise TermsNotAllowedAtStage

    if payload.site_visit_uuid is not None:
        # No direct FK path from lead to site_visit to check against cheaply
        # (site_visits is identity-keyed, not lead-keyed) — the correctness
        # check is that the visit belongs to the SAME client this deal is for.
        visit = await db.get(SiteVisit, payload.site_visit_uuid)
        visit_owner_matches = (
            visit is not None
            and client_auth_user_uuid is not None
            and visit.user_uuid == client_auth_user_uuid
        )
        if not visit_owner_matches:
            raise UnknownSiteVisit
        deal.site_visit_uuid = visit.id

    if payload.price_quoted is not None:
        deal.price_quoted = payload.price_quoted
    if payload.booking_amount is not None:
        deal.booking_amount = payload.booking_amount

    await db.commit()
    # Named attribute_names refreshes ONLY these scalar columns (re-reading
    # DB-normalized NUMERIC values, same reason as loan_applications) without
    # touching property/client_profile/site_visit — a bare refresh() would
    # expire those relationships, and a later synchronous attribute access
    # would trigger an implicit lazy load, which async SQLAlchemy cannot do.
    await db.refresh(
        deal,
        attribute_names=[
            "status",
            "status_reason",
            "closed_at",
            "site_visit_uuid",
            "price_quoted",
            "booking_amount",
        ],
    )

    if status_changed and client_auth_user_uuid is not None:
        label = _STATUS_LABEL.get(deal.status, deal.status.value)
        await emit_notification(
            user_uuid=client_auth_user_uuid,
            notification_type=NotificationType.PROPERTY_DEAL_STATUS_UPDATED,
            title="Property deal update",
            body=f"Your property deal is now {label}.",
            href=f"/dashboard/property-deals/{deal.id}",
        )

    return deal


async def list_deals_for_admin(
    db: AsyncSession, status_filter: str | None = None
) -> list[PropertyDeal]:
    stmt = (
        select(PropertyDeal)
        .options(
            joinedload(PropertyDeal.property),
            joinedload(PropertyDeal.client_profile),
        )
        .order_by(PropertyDeal.opened_at.desc())
    )
    if status_filter is not None:
        stmt = stmt.where(PropertyDeal.status == PropertyDealStatus(status_filter))
    result = await db.scalars(stmt)
    return list(result.unique().all())


async def get_deal_for_admin(db: AsyncSession, deal_id: UUID) -> PropertyDeal | None:
    return await db.scalar(
        select(PropertyDeal)
        .options(
            joinedload(PropertyDeal.property),
            joinedload(PropertyDeal.client_profile),
        )
        .where(PropertyDeal.id == deal_id)
    )
