"""Consent, coarse-location retention, and authenticated placement matching."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy import case, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

import app.db.session as db_session
from app.core.deps import CurrentUser
from app.models.auth import AuthEvent
from app.models.banner import Banner, BannerPlacement, BannerStatus, BannerType
from app.models.commission import Commission, CommissionStatus
from app.models.enquiry import Enquiry, EnquiryStatus
from app.models.lead import Lead, LeadStatus
from app.models.loan import LoanApplication, LoanStatus
from app.models.offer import Offer, OfferStatus
from app.models.personalization import PersonalizationPreference
from app.models.profile import AgentProfile, ClientProfile, ProfileStatus, StaffProfile
from app.models.property_deal import PropertyDeal, PropertyDealStatus
from app.schemas.personalization import (
    AgentSignal,
    AudienceRules,
    ClientJourneyStage,
    audience_rules_valid_for_banner,
    audience_rules_valid_for_offer,
)
from app.services import storage

LOCATION_RETENTION = timedelta(days=30)
LOCATION_CAPTURE_LIMIT_PER_HOUR = 12
AUTHENTICATED_OFFERS_LIMIT = 3


class PlacementLineNotFound(Exception):
    """The caller does not own the requested line context."""


class PersonalizationConsentRequired(Exception):
    """Location cannot be enabled without the parent personalization consent."""


@dataclass(frozen=True)
class AudienceContext:
    role: str
    business_line: str
    personalization_enabled: bool
    client_journey_stages: frozenset[str] = field(default_factory=frozenset)
    agent_signals: frozenset[str] = field(default_factory=frozenset)
    location: tuple[float, float] | None = None


def preference_read_values(
    preference: PersonalizationPreference | None,
) -> dict[str, bool | datetime | None]:
    if preference is None:
        return {
            "personalization_enabled": False,
            "location_enabled": False,
            "location_captured_at": None,
        }
    return {
        "personalization_enabled": preference.personalization_enabled,
        "location_enabled": preference.location_enabled,
        "location_captured_at": preference.location_captured_at,
    }


async def get_preference(
    db: AsyncSession, auth_user_uuid: UUID
) -> PersonalizationPreference | None:
    return await db.get(PersonalizationPreference, auth_user_uuid)


def _consent_event(
    *, auth_user_uuid: UUID, event_type: str, enabled: bool, ip: str | None, user_agent: str | None
) -> AuthEvent:
    # Consent evidence deliberately carries only the boolean decision. Location,
    # audience, and matched workflow signals never enter audit/auth-event data.
    return AuthEvent(
        auth_user_uuid=auth_user_uuid,
        event_type=event_type,
        mobile=None,
        ip=ip,
        user_agent=user_agent,
        success=True,
        detail={"enabled": enabled},
    )


async def set_personalization_consent(
    db: AsyncSession,
    *,
    auth_user_uuid: UUID,
    enabled: bool,
    ip: str | None,
    user_agent: str | None,
) -> PersonalizationPreference:
    preference = await db.get(PersonalizationPreference, auth_user_uuid, with_for_update=True)
    now = datetime.now(UTC)
    if preference is None:
        preference = PersonalizationPreference(auth_user_uuid=auth_user_uuid)
        db.add(preference)
    preference.personalization_enabled = enabled
    if enabled:
        preference.personalization_consented_at = now
    else:
        preference.personalization_consented_at = None
        preference.location_enabled = False
        preference.latitude_e2 = None
        preference.longitude_e2 = None
        preference.location_captured_at = None
        preference.location_consented_at = None
    preference.updated_at = now
    db.add(
        _consent_event(
            auth_user_uuid=auth_user_uuid,
            event_type="personalization_consent_updated",
            enabled=enabled,
            ip=ip,
            user_agent=user_agent,
        )
    )
    await db.commit()
    await db.refresh(preference)
    return preference


def _coordinate_e2(value: float) -> int:
    return int((Decimal(str(value)) * Decimal(100)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


async def capture_location(
    db: AsyncSession,
    *,
    auth_user_uuid: UUID,
    latitude: float,
    longitude: float,
    ip: str | None,
    user_agent: str | None,
) -> PersonalizationPreference:
    preference = await db.get(PersonalizationPreference, auth_user_uuid, with_for_update=True)
    if preference is None or not preference.personalization_enabled:
        raise PersonalizationConsentRequired
    now = datetime.now(UTC)
    newly_consented = not preference.location_enabled or preference.location_consented_at is None
    preference.location_enabled = True
    preference.latitude_e2 = _coordinate_e2(latitude)
    preference.longitude_e2 = _coordinate_e2(longitude)
    preference.location_captured_at = now
    if newly_consented:
        preference.location_consented_at = now
    preference.updated_at = now
    if newly_consented:
        db.add(
            _consent_event(
                auth_user_uuid=auth_user_uuid,
                event_type="location_personalization_consent_updated",
                enabled=True,
                ip=ip,
                user_agent=user_agent,
            )
        )
    await db.commit()
    await db.refresh(preference)
    return preference


async def revoke_location(
    db: AsyncSession,
    *,
    auth_user_uuid: UUID,
    ip: str | None,
    user_agent: str | None,
) -> PersonalizationPreference:
    preference = await db.get(PersonalizationPreference, auth_user_uuid, with_for_update=True)
    if preference is None:
        preference = PersonalizationPreference(auth_user_uuid=auth_user_uuid)
        db.add(preference)
    preference.location_enabled = False
    preference.latitude_e2 = None
    preference.longitude_e2 = None
    preference.location_captured_at = None
    preference.location_consented_at = None
    preference.updated_at = datetime.now(UTC)
    db.add(
        _consent_event(
            auth_user_uuid=auth_user_uuid,
            event_type="location_personalization_consent_updated",
            enabled=False,
            ip=ip,
            user_agent=user_agent,
        )
    )
    await db.commit()
    await db.refresh(preference)
    return preference


def _loan_stage(status: LoanStatus) -> ClientJourneyStage:
    if status == LoanStatus.ON_HOLD:
        return "on_hold"
    if status == LoanStatus.REJECTED:
        return "rejected"
    if status == LoanStatus.CLOSED:
        return "completed"
    return "in_progress"


def _property_deal_stage(status: PropertyDealStatus) -> ClientJourneyStage:
    if status == PropertyDealStatus.ON_HOLD:
        return "on_hold"
    if status == PropertyDealStatus.REJECTED:
        return "rejected"
    if status == PropertyDealStatus.CLOSED:
        return "completed"
    return "in_progress"


async def _client_stages(
    db: AsyncSession, profile: ClientProfile, business_line: str, auth_user_uuid: UUID
) -> frozenset[str]:
    stages: set[str] = set()
    if business_line == "loans":
        statuses = (
            await db.scalars(
                select(LoanApplication.status).where(
                    LoanApplication.client_profile_uuid == profile.id,
                    LoanApplication.business_line == "loans",
                )
            )
        ).all()
        stages.update(_loan_stage(status) for status in statuses)
    else:
        deal_statuses = (
            await db.scalars(
                select(PropertyDeal.status).where(
                    PropertyDeal.client_profile_uuid == profile.id,
                    PropertyDeal.business_line == "real_estate",
                )
            )
        ).all()
        stages.update(_property_deal_stage(status) for status in deal_statuses)
        enquiry_statuses = (
            await db.scalars(
                select(Enquiry.status).where(
                    Enquiry.user_uuid == auth_user_uuid,
                    Enquiry.business_line == "real_estate",
                )
            )
        ).all()
        if any(
            status in (EnquiryStatus.NEW, EnquiryStatus.CONTACTED) for status in enquiry_statuses
        ):
            stages.add("in_progress")
        if any(status == EnquiryStatus.CLOSED for status in enquiry_statuses):
            stages.add("closed")
    if not stages:
        stages.add("not_started")
    return frozenset(stages)


async def _agent_activity_signals(
    db: AsyncSession, profile: AgentProfile, auth_user_uuid: UUID
) -> frozenset[str]:
    signals: set[AgentSignal] = set()
    lead_statuses = (
        await db.scalars(select(Lead.status).where(Lead.origin_agent_profile_uuid == profile.id))
    ).all()
    if not lead_statuses:
        signals.add("no_leads")
    if any(
        status in (LeadStatus.NEW, LeadStatus.ASSIGNED, LeadStatus.WORKING)
        for status in lead_statuses
    ):
        signals.add("has_active_leads")
    if any(status == LeadStatus.CONVERTED for status in lead_statuses):
        signals.add("has_converted_leads")

    commission_statuses = (
        await db.scalars(
            select(Commission.status).where(
                Commission.agent_auth_user_uuid == auth_user_uuid,
                Commission.business_line == profile.business_line,
            )
        )
    ).all()
    if any(status == CommissionStatus.PENDING for status in commission_statuses):
        signals.add("has_pending_commission")
    if any(status == CommissionStatus.PAID for status in commission_statuses):
        signals.add("has_paid_commission")
    return frozenset(signals)


async def build_audience_context(
    db: AsyncSession, current_user: CurrentUser, business_line: str
) -> AudienceContext:
    if current_user.role == "client":
        profile = await db.scalar(
            select(ClientProfile).where(
                ClientProfile.auth_user_uuid == current_user.id,
                ClientProfile.business_line == business_line,
                ClientProfile.status == ProfileStatus.ACTIVE,
            )
        )
        if profile is None:
            raise PlacementLineNotFound
    elif current_user.role == "agent":
        if current_user.business_line != business_line or current_user.agent_profile_uuid is None:
            raise PlacementLineNotFound
        profile = await db.scalar(
            select(AgentProfile).where(
                AgentProfile.id == current_user.agent_profile_uuid,
                AgentProfile.auth_user_uuid == current_user.id,
                AgentProfile.business_line == business_line,
                AgentProfile.status == ProfileStatus.ACTIVE,
            )
        )
        if profile is None:
            raise PlacementLineNotFound
    elif current_user.role in ("employee", "telecaller"):
        if current_user.business_line != business_line or current_user.staff_profile_uuid is None:
            raise PlacementLineNotFound
        profile = await db.scalar(
            select(StaffProfile).where(
                StaffProfile.id == current_user.staff_profile_uuid,
                StaffProfile.auth_user_uuid == current_user.id,
                StaffProfile.role == current_user.role,
                StaffProfile.status == ProfileStatus.ACTIVE,
            )
        )
        if profile is None:
            raise PlacementLineNotFound
    else:
        raise PlacementLineNotFound

    preference = await get_preference(db, current_user.id)
    personalization_enabled = bool(preference and preference.personalization_enabled)
    stages: frozenset[str] = frozenset()
    signals: frozenset[str] = frozenset()
    location: tuple[float, float] | None = None
    if personalization_enabled:
        if current_user.role == "client":
            stages = await _client_stages(db, profile, business_line, current_user.id)
        elif current_user.role == "agent":
            signals = await _agent_activity_signals(db, profile, current_user.id)
        cutoff = datetime.now(UTC) - LOCATION_RETENTION
        if (
            preference is not None
            and preference.location_enabled
            and preference.location_captured_at is not None
            and preference.location_captured_at >= cutoff
            and preference.latitude_e2 is not None
            and preference.longitude_e2 is not None
        ):
            location = (preference.latitude_e2 / 100, preference.longitude_e2 / 100)

    return AudienceContext(
        role=current_user.role,
        business_line=business_line,
        personalization_enabled=personalization_enabled,
        client_journey_stages=stages,
        agent_signals=signals,
        location=location,
    )


def _distance_km(first: tuple[float, float], second: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, first)
    lat2, lon2 = map(math.radians, second)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371.0088 * 2 * math.asin(min(1, math.sqrt(value)))


def matches_audience(rules: AudienceRules, context: AudienceContext) -> bool:
    if rules.is_empty:
        return False
    if context.role not in rules.user_types:
        return False
    uses_personal_data = bool(rules.client_journey_stages or rules.agent_signals or rules.locations)
    if uses_personal_data and not context.personalization_enabled:
        return False
    if rules.client_journey_stages and not (
        context.client_journey_stages & set(rules.client_journey_stages)
    ):
        return False
    if rules.agent_signals and not (context.agent_signals & set(rules.agent_signals)):
        return False
    if rules.locations:
        if context.location is None:
            return False
        if not any(
            _distance_km(context.location, (circle.latitude, circle.longitude)) <= circle.radius_km
            for circle in rules.locations
        ):
            return False
    return True


def _parse_rules(raw: dict) -> AudienceRules | None:
    try:
        return AudienceRules.model_validate(raw)
    except ValueError:
        return None


async def list_authenticated_placements(
    db: AsyncSession, current_user: CurrentUser, business_line: str
) -> tuple[list[Banner], list[Offer]]:
    context = await build_audience_context(db, current_user, business_line)
    async with db_session.AsyncSessionLocal() as content_db:
        banner_exact_line = case((Banner.business_line == business_line, 1), else_=0)
        banner_candidates = (
            await content_db.scalars(
                select(Banner)
                .where(
                    Banner.status == BannerStatus.LIVE,
                    # Legacy default/action rows predate placements and were
                    # backfilled as homepage; keep them on dashboards until
                    # retired, while new public campaigns stay page-specific.
                    or_(
                        Banner.placement == BannerPlacement.DASHBOARD,
                        Banner.template_id.is_(None),
                    ),
                    Banner.business_line.in_((business_line, "both")),
                    or_(Banner.starts_at.is_(None), Banner.starts_at <= func.now()),
                    or_(Banner.ends_at.is_(None), Banner.ends_at > func.now()),
                )
                .order_by(
                    Banner.priority.desc(),
                    banner_exact_line.desc(),
                    Banner.created_at.asc(),
                    Banner.id.asc(),
                )
            )
        ).all()

        selected: dict[BannerType, Banner] = {}
        for banner in banner_candidates:
            if banner.banner_type in selected:
                continue
            rules = _parse_rules(banner.audience_rules)
            if rules is None or not audience_rules_valid_for_banner(banner.banner_type, rules):
                continue
            if banner.banner_type == BannerType.PERSONALIZED and not matches_audience(
                rules, context
            ):
                continue
            selected[banner.banner_type] = banner

        banners = [
            selected[layer]
            for layer in (BannerType.DEFAULT, BannerType.PERSONALIZED, BannerType.ACTION)
            if layer in selected
        ]

        offers: list[Offer] = []
        offer_exact_line = case((Offer.business_line == business_line, 1), else_=0)
        offer_candidates = (
            await content_db.scalars(
                select(Offer)
                .where(
                    Offer.status == OfferStatus.ACTIVE,
                    Offer.business_line.in_((business_line, "both")),
                    or_(Offer.starts_at.is_(None), Offer.starts_at <= func.now()),
                    or_(Offer.ends_at.is_(None), Offer.ends_at > func.now()),
                )
                .order_by(
                    Offer.priority.desc(),
                    offer_exact_line.desc(),
                    Offer.created_at.desc(),
                    Offer.id.desc(),
                )
            )
        ).all()
        for offer in offer_candidates:
            rules = _parse_rules(offer.audience_rules)
            image_url = storage.public_asset_url(offer.image_key) if offer.image_key else None
            if (
                rules is None
                or not audience_rules_valid_for_offer(rules)
                or not matches_audience(rules, context)
                or not image_url
                or not offer.partner_name
                or not offer.redemption_url
                or not offer.terms_summary
                or not offer.code
            ):
                continue
            offers.append(offer)
            if len(offers) == AUTHENTICATED_OFFERS_LIMIT:
                break
    return banners, offers


async def purge_stale_locations(*, now: datetime | None = None) -> int:
    cutoff = (now or datetime.now(UTC)) - LOCATION_RETENTION
    async with db_session.AsyncSessionLocal() as session:
        result = await session.execute(
            update(PersonalizationPreference)
            .where(
                PersonalizationPreference.location_enabled.is_(True),
                PersonalizationPreference.location_captured_at < cutoff,
            )
            .values(
                location_enabled=False,
                latitude_e2=None,
                longitude_e2=None,
                location_captured_at=None,
                location_consented_at=None,
                updated_at=func.now(),
            )
        )
        await session.commit()
        return int(result.rowcount or 0)
