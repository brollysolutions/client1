"""Authenticated placement consent, privacy, and end-to-end matching."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select, text

from app.cache.redis_keys import personalization_location_capture_key
from app.core.security import create_access_token
from app.models.auth import AuthEvent
from app.models.banner import Banner, BannerStatus, BannerType
from app.models.offer import Offer, OfferStatus
from app.models.personalization import PersonalizationPreference
from app.models.profile import (
    AgentProfile,
    ProfileScope,
    ProfileStatus,
    StaffProfile,
    StaffRole,
)
from app.models.user import User
from app.services import personalization
from conftest import full_registration, unique_mobile


async def _user_uuid(mobile: str) -> uuid.UUID:
    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        value = await db.scalar(
            select(text("id"))
            .select_from(text("auth_users"))
            .where(text("mobile = :mobile"))
            .params(mobile=mobile)
        )
        assert value is not None
        return uuid.UUID(str(value))


async def _seed_content(author: uuid.UUID) -> list[uuid.UUID]:
    import app.db.session as session_module

    rows = [
        Banner(
            business_line="loans",
            banner_type=BannerType.DEFAULT,
            title="Generic dashboard banner",
            audience_rules={},
            priority=2_000_000,
            status=BannerStatus.LIVE,
            created_by_uuid=author,
        ),
        Banner(
            business_line="loans",
            banner_type=BannerType.PERSONALIZED,
            title="New client banner",
            audience_rules={
                "version": 1,
                "user_types": ["client"],
                "client_journey_stages": ["not_started"],
            },
            priority=2_000_001,
            status=BannerStatus.LIVE,
            created_by_uuid=author,
        ),
        Offer(
            business_line="loans",
            title="Generic client offer",
            discount_type="percentage",
            discount_value=Decimal("10"),
            code="SAVE10",
            partner_name="Example Partner",
            redemption_url="https://partner.example/checkout",
            terms_summary="Valid once per customer.",
            image_key="public/banners/11111111-1111-1111-1111-111111111111/generic.webp",
            audience_rules={"version": 1, "user_types": ["client"]},
            priority=2_000_000,
            status=OfferStatus.ACTIVE,
            created_by_uuid=author,
        ),
        Offer(
            business_line="loans",
            title="Hyderabad client offer",
            discount_type="flat",
            discount_value=Decimal("500"),
            code="HYD500",
            partner_name="Hyderabad Partner",
            redemption_url="https://partner.example/hyderabad",
            terms_summary="Valid in the selected service area.",
            image_key="public/banners/22222222-2222-2222-2222-222222222222/hyd.webp",
            audience_rules={
                "version": 1,
                "user_types": ["client"],
                "locations": [
                    {
                        "label": "Hyderabad",
                        "latitude": 17.39,
                        "longitude": 78.49,
                        "radius_km": 20,
                    }
                ],
            },
            priority=2_000_001,
            status=OfferStatus.ACTIVE,
            created_by_uuid=author,
        ),
    ]
    async with session_module.AsyncSessionLocal() as db:
        db.add_all(rows)
        await db.commit()
        return [row.id for row in rows]


async def _delete_content(ids: list[uuid.UUID]) -> None:
    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        await db.execute(delete(Banner).where(Banner.id.in_(ids)))
        await db.execute(delete(Offer).where(Offer.id.in_(ids)))
        await db.commit()


async def _seed_staff_offer(role: StaffRole) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        user = User(
            first_name="Placement",
            last_name=role.value.title(),
            mobile=unique_mobile(),
            email=f"placement-{role.value}-{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = StaffProfile(
            auth_user_uuid=user.id,
            role=role,
            scope=ProfileScope.LINE,
            business_line="loans",
            staff_code=f"PL-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        offer = Offer(
            business_line="loans",
            title=f"{role.value.title()} dashboard offer",
            discount_type="flat",
            discount_value=Decimal("100"),
            code="STAFF100",
            partner_name="Staff Partner",
            redemption_url="https://partner.example/staff",
            terms_summary="Available to the selected Dhanadhara staff role.",
            image_key=f"public/banners/{uuid.uuid4()}/staff.webp",
            audience_rules={"version": 1, "user_types": [role.value]},
            status=OfferStatus.ACTIVE,
            created_by_uuid=user.id,
        )
        db.add_all([profile, offer])
        await db.commit()
        return user.id, profile.id, offer.id


@pytest.mark.parametrize("role", [StaffRole.EMPLOYEE, StaffRole.TELECALLER])
@pytest.mark.asyncio
async def test_staff_role_receives_its_dashboard_offer(
    client: AsyncClient,
    role: StaffRole,
) -> None:
    user_id, profile_id, offer_id = await _seed_staff_offer(role)
    token = create_access_token(
        {
            "sub": str(user_id),
            "role": role.value,
            "business_line": "loans",
            "staff_profile_uuid": str(profile_id),
            "platform_scope": "false",
        }
    )
    try:
        response = await client.get(
            "/api/v1/personalization/placements?business_line=loans",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200, response.text
        offers = response.json()["offers"]
        assert [offer["id"] for offer in offers if offer["id"] == str(offer_id)] == [str(offer_id)]
    finally:
        await _delete_content([offer_id])


async def _seed_agent() -> tuple[uuid.UUID, uuid.UUID]:
    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        user = User(
            first_name="Placement",
            last_name="Agent",
            mobile=unique_mobile(),
            email=f"placement-agent-{uuid.uuid4().hex[:12]}@example.com",
            password_hash="unused",
        )
        db.add(user)
        await db.flush()
        profile = AgentProfile(
            auth_user_uuid=user.id,
            agent_code=f"AG-{uuid.uuid4().hex[:10]}",
            business_line="loans",
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return user.id, profile.id


@pytest.mark.asyncio
async def test_consent_location_and_private_placement_matching(client: AsyncClient) -> None:
    access_token, mobile = await full_registration(client, lines=["loans"])
    user_id = await _user_uuid(mobile)
    content_ids = await _seed_content(user_id)
    headers = {"Authorization": f"Bearer {access_token}"}

    try:
        initial = await client.get("/api/v1/personalization/preferences", headers=headers)
        assert initial.status_code == 200, initial.text
        assert initial.headers["cache-control"] == "private, no-store"
        assert initial.json() == {
            "personalization_enabled": False,
            "location_enabled": False,
            "location_captured_at": None,
        }

        without_consent = await client.put(
            "/api/v1/personalization/location",
            json={"latitude": 17.3851, "longitude": 78.4861},
            headers=headers,
        )
        assert without_consent.status_code == 409

        generic = await client.get(
            "/api/v1/personalization/placements?business_line=loans", headers=headers
        )
        assert generic.status_code == 200, generic.text
        generic_banner_titles = {row["title"] for row in generic.json()["banners"]}
        generic_offer_titles = {row["title"] for row in generic.json()["offers"]}
        assert "Generic dashboard banner" in generic_banner_titles
        assert "New client banner" not in generic_banner_titles
        assert "Generic client offer" in generic_offer_titles
        assert "Hyderabad client offer" not in generic_offer_titles

        enabled = await client.patch(
            "/api/v1/personalization/preferences",
            json={"personalization_enabled": True},
            headers=headers,
        )
        assert enabled.status_code == 200, enabled.text

        located = await client.put(
            "/api/v1/personalization/location",
            json={"latitude": 17.3851, "longitude": 78.4861},
            headers=headers,
        )
        assert located.status_code == 200, located.text
        assert located.json()["location_enabled"] is True

        import app.db.session as session_module

        async with session_module.AsyncSessionLocal() as db:
            stored = await db.get(PersonalizationPreference, user_id)
            assert stored is not None
            assert (stored.latitude_e2, stored.longitude_e2) == (1739, 7849)
            location_event = await db.scalar(
                select(AuthEvent)
                .where(
                    AuthEvent.auth_user_uuid == user_id,
                    AuthEvent.event_type == "location_personalization_consent_updated",
                )
                .order_by(AuthEvent.created_at.desc())
            )
            assert location_event is not None
            assert location_event.detail == {"enabled": True}

        personalized = await client.get(
            "/api/v1/personalization/placements?business_line=loans", headers=headers
        )
        assert personalized.status_code == 200, personalized.text
        personalized_banner_titles = {row["title"] for row in personalized.json()["banners"]}
        personalized_offer_titles = {row["title"] for row in personalized.json()["offers"]}
        assert {"Generic dashboard banner", "New client banner"} <= personalized_banner_titles
        assert {"Generic client offer", "Hyderabad client offer"} <= personalized_offer_titles

        public = await client.get("/api/v1/public/offers")
        assert public.status_code == 404

        disabled = await client.patch(
            "/api/v1/personalization/preferences",
            json={"personalization_enabled": False},
            headers=headers,
        )
        assert disabled.status_code == 200
        assert disabled.json()["location_enabled"] is False
        async with session_module.AsyncSessionLocal() as db:
            stored = await db.get(PersonalizationPreference, user_id)
            assert stored is not None
            assert stored.latitude_e2 is None
            assert stored.longitude_e2 is None
    finally:
        await _delete_content(content_ids)


@pytest.mark.asyncio
async def test_authenticated_ranking_and_legacy_rules_fail_closed(
    client: AsyncClient,
) -> None:
    access_token, mobile = await full_registration(client, lines=["loans"])
    user_id = await _user_uuid(mobile)
    headers = {"Authorization": f"Bearer {access_token}"}
    enabled = await client.patch(
        "/api/v1/personalization/preferences",
        json={"personalization_enabled": True},
        headers=headers,
    )
    assert enabled.status_code == 200, enabled.text

    rows = [
        Banner(
            business_line="both",
            banner_type=BannerType.DEFAULT,
            title="Both-line default",
            audience_rules={},
            priority=2_000_000_000,
            status=BannerStatus.LIVE,
            created_by_uuid=user_id,
        ),
        Banner(
            business_line="loans",
            banner_type=BannerType.DEFAULT,
            title="Exact-line default",
            audience_rules={},
            priority=2_000_000_000,
            status=BannerStatus.LIVE,
            created_by_uuid=user_id,
        ),
        Banner(
            business_line="loans",
            banner_type=BannerType.DEFAULT,
            title="Malformed legacy default",
            audience_rules={"user_types": ["client"]},
            priority=2_000_000_001,
            status=BannerStatus.LIVE,
            created_by_uuid=user_id,
        ),
        Banner(
            business_line="loans",
            banner_type=BannerType.PERSONALIZED,
            title="Wrong-role personalized",
            audience_rules={"version": 1, "user_types": ["agent"]},
            priority=2_000_000_001,
            status=BannerStatus.LIVE,
            created_by_uuid=user_id,
        ),
        Banner(
            business_line="loans",
            banner_type=BannerType.PERSONALIZED,
            title="Matching client personalized",
            audience_rules={
                "version": 1,
                "user_types": ["client"],
                "client_journey_stages": ["not_started"],
            },
            priority=2_000_000_000,
            status=BannerStatus.LIVE,
            created_by_uuid=user_id,
        ),
        Offer(
            business_line="loans",
            title="Invalid mixed-role offer",
            discount_type="flat",
            discount_value=Decimal("100"),
            code="INVALID100",
            partner_name="Invalid Partner",
            redemption_url="https://partner.example/invalid",
            terms_summary="Invalid legacy audience data.",
            image_key="public/banners/33333333-3333-3333-3333-333333333333/invalid.webp",
            audience_rules={"user_types": ["client"]},
            priority=2_000_000_001,
            status=OfferStatus.ACTIVE,
            created_by_uuid=user_id,
        ),
        Offer(
            business_line="loans",
            title="Valid client offer",
            discount_type="flat",
            discount_value=Decimal("50"),
            code="VALID50",
            partner_name="Valid Partner",
            redemption_url="https://partner.example/valid",
            terms_summary="Valid once per customer.",
            image_key="public/banners/44444444-4444-4444-4444-444444444444/valid.webp",
            audience_rules={"version": 1, "user_types": ["client"]},
            priority=2_000_000_000,
            status=OfferStatus.ACTIVE,
            created_by_uuid=user_id,
        ),
    ]
    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        db.add_all(rows)
        await db.commit()
        row_ids = [row.id for row in rows]

    try:
        response = await client.get(
            "/api/v1/personalization/placements?business_line=loans",
            headers=headers,
        )
        assert response.status_code == 200, response.text
        payload = response.json()
        by_type = {banner["banner_type"]: banner for banner in payload["banners"]}
        assert by_type["default"]["title"] == "Exact-line default"
        assert by_type["personalized"]["title"] == "Matching client personalized"
        offer_titles = {offer["title"] for offer in payload["offers"]}
        assert "Valid client offer" in offer_titles
        assert "Invalid mixed-role offer" not in offer_titles
    finally:
        await _delete_content(row_ids)


@pytest.mark.asyncio
async def test_stale_coarse_location_is_purged(client: AsyncClient) -> None:
    access_token, mobile = await full_registration(client)
    user_id = await _user_uuid(mobile)
    headers = {"Authorization": f"Bearer {access_token}"}
    enabled = await client.patch(
        "/api/v1/personalization/preferences",
        json={"personalization_enabled": True},
        headers=headers,
    )
    assert enabled.status_code == 200
    captured = await client.put(
        "/api/v1/personalization/location",
        json={"latitude": 17.39, "longitude": 78.49},
        headers=headers,
    )
    assert captured.status_code == 200

    import app.db.session as session_module

    now = datetime.now(UTC)
    async with session_module.AsyncSessionLocal() as db:
        stored = await db.get(PersonalizationPreference, user_id)
        assert stored is not None
        stored.location_captured_at = now - timedelta(days=31)
        await db.commit()

    cleared = await personalization.purge_stale_locations(now=now)
    assert cleared >= 1
    async with session_module.AsyncSessionLocal() as db:
        stored = await db.get(PersonalizationPreference, user_id)
        assert stored is not None
        assert stored.location_enabled is False
        assert stored.latitude_e2 is None
        assert stored.longitude_e2 is None
        assert stored.location_captured_at is None
        assert stored.location_consented_at is None


@pytest.mark.asyncio
async def test_invalid_client_line_and_non_viewer_are_rejected(client: AsyncClient) -> None:
    access_token, mobile = await full_registration(client, lines=["loans"])
    user_id = await _user_uuid(mobile)

    # Self-registration currently provisions both client lines; prove the
    # endpoint validates the requested line by removing one throwaway profile.
    import app.db.session as session_module

    async with session_module.AsyncSessionLocal() as db:
        await db.execute(
            text(
                "DELETE FROM client_profiles WHERE auth_user_uuid = :user_id "
                "AND business_line = 'real_estate'"
            ),
            {"user_id": user_id},
        )
        await db.commit()

    headers = {"Authorization": f"Bearer {access_token}"}
    missing = await client.get(
        "/api/v1/personalization/placements?business_line=real_estate", headers=headers
    )
    assert missing.status_code == 404

    admin_token = create_access_token(
        {
            "sub": str(user_id),
            "role": "admin",
            "business_line": "both",
            "platform_scope": "true",
        }
    )
    forbidden = await client.get(
        "/api/v1/personalization/preferences",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_agent_matches_agent_signals_and_is_forced_to_profile_line(
    client: AsyncClient,
) -> None:
    user_id, profile_id = await _seed_agent()
    import app.db.session as session_module

    targeted = Banner(
        business_line="loans",
        banner_type=BannerType.PERSONALIZED,
        title="First lead agent banner",
        audience_rules={
            "version": 1,
            "user_types": ["agent"],
            "agent_signals": ["no_leads"],
        },
        priority=2_000_000,
        status=BannerStatus.LIVE,
        created_by_uuid=user_id,
    )
    async with session_module.AsyncSessionLocal() as db:
        db.add(targeted)
        await db.commit()
        banner_id = targeted.id

    token = create_access_token(
        {
            "sub": str(user_id),
            "role": "agent",
            "business_line": "loans",
            "agent_profile_uuid": str(profile_id),
            "platform_scope": "false",
        }
    )
    headers = {"Authorization": f"Bearer {token}"}
    try:
        enabled = await client.patch(
            "/api/v1/personalization/preferences",
            json={"personalization_enabled": True},
            headers=headers,
        )
        assert enabled.status_code == 200, enabled.text

        placements = await client.get(
            "/api/v1/personalization/placements?business_line=loans", headers=headers
        )
        assert placements.status_code == 200, placements.text
        assert "First lead agent banner" in {row["title"] for row in placements.json()["banners"]}
        assert placements.json()["offers"] == []

        wrong_line = await client.get(
            "/api/v1/personalization/placements?business_line=real_estate", headers=headers
        )
        assert wrong_line.status_code == 404
    finally:
        await _delete_content([banner_id])


@pytest.mark.asyncio
async def test_location_refresh_is_rate_limited_per_account(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    access_token, mobile = await full_registration(client)
    user_id = await _user_uuid(mobile)
    headers = {"Authorization": f"Bearer {access_token}"}
    enabled = await client.patch(
        "/api/v1/personalization/preferences",
        json={"personalization_enabled": True},
        headers=headers,
    )
    assert enabled.status_code == 200

    from app.main import app

    key = personalization_location_capture_key(str(user_id))
    await app.state.redis.delete(key)
    monkeypatch.setattr(personalization, "LOCATION_CAPTURE_LIMIT_PER_HOUR", 1)
    payload = {"latitude": 17.39, "longitude": 78.49}

    first = await client.put("/api/v1/personalization/location", json=payload, headers=headers)
    second = await client.put("/api/v1/personalization/location", json=payload, headers=headers)

    assert first.status_code == 200
    assert second.status_code == 429
