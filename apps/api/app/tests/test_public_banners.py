"""/api/v1/public/banners — the unauthenticated hero-banner read.

There is no anonymous Postgres role in this system, so this endpoint runs as
the `app` superuser and RLS never engages (see services/public_catalog.py's
docstring). The `status == LIVE` predicate in that service is the ONLY access
control on this path -- test_non_live_statuses_hidden_from_anonymous and
test_approved_row_is_visible_to_a_raw_superuser_session together prove that
the filtering is coming from the app predicate, not from RLS.

Unlike test_public_properties.py's per-category window, PUBLIC_BANNERS_LIMIT
is a flat cap with no partition axis, so a leftover LIVE row from another test
file (or a prior run) can crowd a presence assertion out of the cap. Every
presence-test banner here is seeded with priority=100 (default banners.priority
is 0), guaranteeing it sorts ahead of ordinary seeds regardless of history.
Every test also deletes its own seeded rows in a finally block, both to avoid
polluting later runs and because a leaked LIVE row would itself become exactly
that kind of crowd-out hazard.

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select, text

from app.api.v1.public_catalog import _offer_badge
from app.models.banner import BannerPlacement
from app.services.public_catalog import PUBLIC_BANNERS_LIMIT, PUBLIC_BANNERS_LIMIT_BY_PLACEMENT
from conftest import full_registration, unique_mobile


def test_offer_badge_preserves_integer_trailing_zeroes() -> None:
    offer = SimpleNamespace(
        title="Fee waiver",
        discount_value=Decimal("100.00"),
        discount_type="fixed",
        code="SAVE100",
    )
    assert _offer_badge(offer) == "Fee waiver · ₹100 off · Code SAVE100"


async def _author_uuid(client: AsyncClient) -> str:
    """A real auth_users row is required (created_by_uuid FK) -- registers a
    throwaway account through the real endpoint, same as
    test_cms_activation.py's helper."""
    mobile = unique_mobile()
    await full_registration(client, mobile=mobile, lines=["loans"])
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None
        return str(row[0])


async def _seed_banner(
    *,
    author: str,
    status: str,
    title: str,
    banner_type: str = "default",
    priority: int = 100,
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
    subtitle: str | None = None,
    cta_label: str | None = None,
    deep_link: str | None = None,
    image_key: str | None = None,
    audience_rules: dict | None = None,
    placement: str = "homepage",
    category_key: str | None = None,
    template_id: str | None = None,
    offer_id: str | None = None,
    property_id: str | None = None,
) -> str:
    import app.db.session as _session_mod
    from app.models.banner import Banner

    async with _session_mod.AsyncSessionLocal() as db:
        banner = Banner(
            business_line="loans",
            placement=placement,
            category_key=category_key,
            template_id=uuid.UUID(template_id) if template_id else None,
            offer_id=uuid.UUID(offer_id) if offer_id else None,
            property_id=uuid.UUID(property_id) if property_id else None,
            banner_type=banner_type,
            title=title,
            subtitle=subtitle,
            cta_label=cta_label,
            deep_link=deep_link,
            image_key=image_key,
            audience_rules=audience_rules or {},
            status=status,
            priority=priority,
            created_by_uuid=uuid.UUID(author),
            starts_at=starts_at,
            ends_at=ends_at,
        )
        db.add(banner)
        await db.commit()
        return str(banner.id)


async def _seed_property(
    *, active: bool, category: str = "villas", with_media: bool = False
) -> str:
    import app.db.session as _session_mod
    from app.models.property import Property
    from app.models.property_media import PropertyMedia

    async with _session_mod.AsyncSessionLocal() as db:
        property_listing = Property(
            business_line="real_estate",
            active=active,
            title="RERA Villa",
            type="Villa",
            location="Kokapet, Hyderabad",
            price_display="₹2.4 Cr",
            category=category,
            city="Hyderabad",
            locality="Kokapet",
            pincode="500075",
            price_paise=24_000_000_00,
            furnishing="furnished",
            construction_status="ready",
            rera_number="RERA/TS/2026/0042",
            rera_applicability="applicable",
            rera_verification_status="verified",
            rera_verified_at=datetime.now(UTC),
        )
        db.add(property_listing)
        await db.flush()
        if with_media:
            db.add(
                PropertyMedia(
                    property_uuid=property_listing.id,
                    business_line="real_estate",
                    content_type="image/webp",
                    object_key=f"public/properties/{property_listing.id}/hero.webp",
                    size_bytes=1024,
                    position=0,
                )
            )
        await db.commit()
        return str(property_listing.id)


async def _delete_properties(*property_ids: str) -> None:
    import app.db.session as _session_mod
    from app.models.property import Property

    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(
            delete(Property).where(Property.id.in_([uuid.UUID(item) for item in property_ids]))
        )
        await db.commit()


async def _delete_banners(*banner_ids: str) -> None:
    import app.db.session as _session_mod
    from app.models.banner import Banner

    ids = [uuid.UUID(bid) for bid in banner_ids]
    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(delete(Banner).where(Banner.id.in_(ids)))
        await db.commit()


async def _seed_offer(*, author: str, audience_rules: dict) -> str:
    import app.db.session as _session_mod
    from app.models.offer import Offer, OfferStatus

    async with _session_mod.AsyncSessionLocal() as db:
        offer = Offer(
            business_line="loans",
            title="Private client incentive",
            discount_type="percentage",
            discount_value=10,
            audience_rules=audience_rules,
            status=OfferStatus.ACTIVE,
            created_by_uuid=uuid.UUID(author),
        )
        db.add(offer)
        await db.commit()
        return str(offer.id)


async def _delete_offers(*offer_ids: str) -> None:
    import app.db.session as _session_mod
    from app.models.offer import Offer

    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(delete(Offer).where(Offer.id.in_([uuid.UUID(item) for item in offer_ids])))
        await db.commit()


async def _superuser_sees(banner_id: str) -> bool:
    import app.db.session as _session_mod
    from app.models.banner import Banner

    async with _session_mod.AsyncSessionLocal() as db:
        result = await db.execute(select(Banner).where(Banner.id == uuid.UUID(banner_id)))
        return result.scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_no_auth_required(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/public/banners")
    assert resp.status_code == 200

    # Contrast with the authenticated twin, to pin the distinction this
    # endpoint exists to make.
    auth_resp = await client.get("/api/v1/banners")
    assert auth_resp.status_code == 401


@pytest.mark.asyncio
async def test_live_banner_is_returned(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    banner_id = await _seed_banner(
        author=author,
        status="live",
        title="Public Live Banner",
        subtitle="A short subtitle",
        cta_label="Apply now",
        deep_link="/loans",
    )
    try:
        resp = await client.get("/api/v1/public/banners")
        assert resp.status_code == 200
        rows = {b["id"]: b for b in resp.json()["banners"]}
        assert banner_id in rows
        row = rows[banner_id]
        assert row["title"] == "Public Live Banner"
        assert row["subtitle"] == "A short subtitle"
        assert row["cta_label"] == "Apply now"
        assert row["deep_link"] == "/loans"
        assert row["image_url"] is None
    finally:
        await _delete_banners(banner_id)


@pytest.mark.asyncio
async def test_public_banner_placement_is_filtered_server_side(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    financial_id = await _seed_banner(
        author=author,
        status="live",
        title="Financial campaign",
        placement="financial_services",
    )
    try:
        homepage = await client.get("/api/v1/public/banners")
        financial = await client.get(
            "/api/v1/public/banners", params={"placement": "financial_services"}
        )
        assert financial_id not in {item["id"] for item in homepage.json()["banners"]}
        assert financial_id in {item["id"] for item in financial.json()["banners"]}
    finally:
        await _delete_banners(financial_id)


@pytest.mark.asyncio
async def test_templated_banner_serves_reviewed_bundled_artwork(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    import app.db.session as _session_mod
    from app.models.banner import BannerPlacement, BannerTemplate

    async with _session_mod.AsyncSessionLocal() as db:
        template = await db.scalar(
            select(BannerTemplate).where(
                BannerTemplate.placement == BannerPlacement.FINANCIAL_SERVICES,
                BannerTemplate.category_key == "home-loan",
                BannerTemplate.active.is_(True),
            )
        )
        assert template is not None
        template_id = str(template.id)

    banner_id = await _seed_banner(
        author=author,
        status="live",
        title="Home loan campaign",
        placement="financial_services",
        category_key=f"test-home-loan-{uuid.uuid4().hex}",
        template_id=template_id,
    )
    try:
        response = await client.get(
            "/api/v1/public/banners", params={"placement": "financial_services"}
        )
        row = next(item for item in response.json()["banners"] if item["id"] == banner_id)
        assert row["image_url"] == "/banner-templates/financial_services/home-loan.webp?v=1"
    finally:
        await _delete_banners(banner_id)


@pytest.mark.asyncio
async def test_property_banner_uses_template_artwork_enquiry_and_rera_badge(
    client: AsyncClient,
) -> None:
    author = await _author_uuid(client)
    property_id = await _seed_property(active=True, with_media=True)
    import app.db.session as _session_mod
    from app.models.banner import BannerPlacement, BannerTemplate

    async with _session_mod.AsyncSessionLocal() as db:
        template = await db.scalar(
            select(BannerTemplate).where(
                BannerTemplate.placement == BannerPlacement.PROPERTIES,
                BannerTemplate.category_key == "villas",
                BannerTemplate.active.is_(True),
            )
        )
        assert template is not None
        template_id = str(template.id)
    banner_id = await _seed_banner(
        author=author,
        status="live",
        title="Tour this approved villa",
        placement="properties",
        category_key=f"test-villas-{uuid.uuid4().hex}",
        template_id=template_id,
        property_id=property_id,
        deep_link="https://evil.example/property",
    )
    try:
        response = await client.get("/api/v1/public/banners", params={"placement": "properties"})
        row = next(item for item in response.json()["banners"] if item["id"] == banner_id)
        assert row["image_url"] == "/banner-templates/properties/villas.webp?v=1"
        assert row["cta_label"] == "Enquire now"
        assert row["deep_link"].startswith("/contact?line=real_estate&product=RERA+Villa")
        assert "evil.example" not in row["deep_link"]
        assert row["rera_verified"] is True
    finally:
        await _delete_banners(banner_id)
        await _delete_properties(property_id)


@pytest.mark.asyncio
async def test_inactive_linked_property_hides_live_banner(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    property_id = await _seed_property(active=False)
    banner_id = await _seed_banner(
        author=author,
        status="live",
        title="Unavailable property",
        property_id=property_id,
    )
    try:
        response = await client.get("/api/v1/public/banners")
        assert banner_id not in {item["id"] for item in response.json()["banners"]}
    finally:
        await _delete_banners(banner_id)
        await _delete_properties(property_id)


@pytest.mark.asyncio
async def test_live_banner_with_public_image_key_gets_a_url(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    banner_id = await _seed_banner(
        author=author,
        status="live",
        title="Image Banner",
        image_key="public/banners/22222222-2222-2222-2222-222222222222/hero.jpg",
    )
    try:
        resp = await client.get("/api/v1/public/banners")
        row = next(b for b in resp.json()["banners"] if b["id"] == banner_id)
        assert row["image_url"] is not None
        assert row["image_url"].endswith(
            "public/banners/22222222-2222-2222-2222-222222222222/hero.jpg"
        )
    finally:
        await _delete_banners(banner_id)


@pytest.mark.asyncio
async def test_live_banner_with_non_public_image_key_gets_no_url(client: AsyncClient) -> None:
    """Defence in depth against a pre-validator row (see the backfill
    migration a5b6c7d8e9f0): even if a non-conforming image_key somehow
    exists, the public endpoint must never turn it into a URL."""
    author = await _author_uuid(client)
    banner_id = await _seed_banner(
        author=author,
        status="live",
        title="Bad Key Banner",
        image_key="agent-applications/abc-123/deadbeef-photo",
    )
    try:
        resp = await client.get("/api/v1/public/banners")
        row = next(b for b in resp.json()["banners"] if b["id"] == banner_id)
        assert row["image_url"] is None
    finally:
        await _delete_banners(banner_id)


@pytest.mark.asyncio
async def test_non_live_statuses_hidden_from_anonymous(client: AsyncClient) -> None:
    """The access-control guard: nothing but `live` may ever reach a visitor."""
    author = await _author_uuid(client)
    ids = {
        status: await _seed_banner(author=author, status=status, title=f"Hidden {status}")
        for status in ("draft", "pending_approval", "approved", "rejected", "archived")
    }
    try:
        resp = await client.get("/api/v1/public/banners")
        assert resp.status_code == 200
        returned_ids = {b["id"] for b in resp.json()["banners"]}
        for status, banner_id in ids.items():
            assert banner_id not in returned_ids, f"{status} banner leaked to public response"
    finally:
        await _delete_banners(*ids.values())


@pytest.mark.asyncio
async def test_targeted_linked_offer_is_hidden_from_anonymous(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    offer_id = await _seed_offer(
        author=author,
        audience_rules={"version": 1, "user_types": ["client"]},
    )
    banner_id = await _seed_banner(
        author=author,
        status="live",
        title="Must remain private",
        offer_id=offer_id,
    )
    try:
        resp = await client.get("/api/v1/public/banners")
        assert banner_id not in {item["id"] for item in resp.json()["banners"]}
    finally:
        await _delete_banners(banner_id)
        await _delete_offers(offer_id)


@pytest.mark.asyncio
async def test_approved_row_is_visible_to_a_raw_superuser_session(client: AsyncClient) -> None:
    """Proves the previous test's exclusion came from the app predicate, not
    RLS. A superuser session bypasses RLS entirely, so if this row is present
    here but absent over HTTP, the HTTP exclusion can only be the explicit
    `status == LIVE` filter in services.public_catalog. Delete this test and
    the reason for that WHERE clause is lost."""
    author = await _author_uuid(client)
    banner_id = await _seed_banner(author=author, status="approved", title="Superuser-Visible")
    try:
        assert await _superuser_sees(banner_id) is True

        resp = await client.get("/api/v1/public/banners")
        returned_ids = {b["id"] for b in resp.json()["banners"]}
        assert banner_id not in returned_ids
    finally:
        await _delete_banners(banner_id)


@pytest.mark.asyncio
async def test_response_omits_internal_fields(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    banner_id = await _seed_banner(author=author, status="live", title="Field Leak Check")
    try:
        resp = await client.get("/api/v1/public/banners")
        row = next(b for b in resp.json()["banners"] if b["id"] == banner_id)
        assert set(row.keys()) == {
            "id",
            "title",
            "subtitle",
            "cta_label",
            "deep_link",
            "image_url",
            "offer_badge",
            "rera_verified",
        }
        internal_fields = {
            "image_key",
            "audience_rules",
            "priority",
            "status",
            "banner_type",
            "business_line",
            "created_by_uuid",
            "approved_by_uuid",
            "review_note",
            "starts_at",
            "ends_at",
            "created_at",
            "updated_at",
        }
        for field in internal_fields:
            assert field not in row, f"internal field {field!r} leaked to public response"
    finally:
        await _delete_banners(banner_id)


@pytest.mark.asyncio
async def test_personalized_banner_is_excluded(client: AsyncClient) -> None:
    """audience_rules can't be evaluated for an anonymous visitor, so a
    personalized banner must never reach this endpoint even when live. Seeds a
    LIVE `action` banner in the same run to prove the filter is an allowlist
    (personalized excluded, action included), not just "not default"."""
    author = await _author_uuid(client)
    personalized_id = await _seed_banner(
        author=author, status="live", banner_type="personalized", title="Personalized Hidden"
    )
    action_id = await _seed_banner(
        author=author, status="live", banner_type="action", title="Action Visible"
    )
    try:
        resp = await client.get("/api/v1/public/banners")
        returned_ids = {b["id"] for b in resp.json()["banners"]}
        assert personalized_id not in returned_ids
        assert action_id in returned_ids
    finally:
        await _delete_banners(personalized_id, action_id)


@pytest.mark.asyncio
async def test_targeted_rules_never_leak_from_a_legacy_generic_banner(
    client: AsyncClient,
) -> None:
    """A malformed pre-validator row stays private even if its type is on the
    anonymous allowlist. Type and canonical empty targeting are both required.
    """
    author = await _author_uuid(client)
    targeted_default_id = await _seed_banner(
        author=author,
        status="live",
        banner_type="default",
        title="Legacy targeted default",
        audience_rules={"version": 1, "user_types": ["client"]},
    )
    generic_action_id = await _seed_banner(
        author=author,
        status="live",
        banner_type="action",
        title="Generic action",
    )
    try:
        response = await client.get("/api/v1/public/banners")
        returned_ids = {banner["id"] for banner in response.json()["banners"]}
        assert targeted_default_id not in returned_ids
        assert generic_action_id in returned_ids
    finally:
        await _delete_banners(targeted_default_id, generic_action_id)


@pytest.mark.asyncio
async def test_future_starts_at_is_hidden(client: AsyncClient) -> None:
    """The stalled-scheduler defence: even if status were somehow live ahead
    of its start (it shouldn't be, cms_activation guards this), the endpoint's
    own re-check must still hide it."""
    author = await _author_uuid(client)
    future = datetime.now(UTC) + timedelta(hours=1)
    banner_id = await _seed_banner(
        author=author, status="live", title="Future Start Hidden", starts_at=future
    )
    try:
        resp = await client.get("/api/v1/public/banners")
        returned_ids = {b["id"] for b in resp.json()["banners"]}
        assert banner_id not in returned_ids
    finally:
        await _delete_banners(banner_id)


@pytest.mark.asyncio
async def test_past_ends_at_is_hidden(client: AsyncClient) -> None:
    """Same defence on the far side. A LIVE row with both bounds NULL is
    seeded in the same run to prove evergreen banners still serve fine."""
    author = await _author_uuid(client)
    past = datetime.now(UTC) - timedelta(hours=1)
    expired_id = await _seed_banner(
        author=author, status="live", title="Past End Hidden", ends_at=past
    )
    evergreen_id = await _seed_banner(author=author, status="live", title="Evergreen Visible")
    try:
        resp = await client.get("/api/v1/public/banners")
        returned_ids = {b["id"] for b in resp.json()["banners"]}
        assert expired_id not in returned_ids
        assert evergreen_id in returned_ids
    finally:
        await _delete_banners(expired_id, evergreen_id)


@pytest.mark.asyncio
async def test_ordering_is_priority_then_created_at(client: AsyncClient) -> None:
    """Relative order of the seeded ids only -- never absolute positions, the
    DB is shared. Higher priority must sort first regardless of insert order."""
    author = await _author_uuid(client)
    low_id = await _seed_banner(author=author, status="live", title="Low Priority", priority=100)
    high_id = await _seed_banner(author=author, status="live", title="High Priority", priority=101)
    try:
        resp = await client.get("/api/v1/public/banners")
        ids_in_order = [b["id"] for b in resp.json()["banners"]]
        assert ids_in_order.index(high_id) < ids_in_order.index(low_id)
    finally:
        await _delete_banners(low_id, high_id)


@pytest.mark.asyncio
async def test_response_cap(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    ids = [
        await _seed_banner(author=author, status="live", title=f"Cap Test {i}")
        for i in range(PUBLIC_BANNERS_LIMIT + 3)
    ]
    try:
        resp = await client.get("/api/v1/public/banners")
        assert len(resp.json()["banners"]) == PUBLIC_BANNERS_LIMIT
    finally:
        await _delete_banners(*ids)


@pytest.mark.asyncio
async def test_homepage_ad_strip_is_isolated_from_the_homepage_hero(
    client: AsyncClient,
) -> None:
    """The sponsor strip and the hero carousel must never borrow each other's slides.

    They share a page but not a placement, which is the whole reason the strip
    got its own enum value instead of reusing "homepage": a sponsor must not be
    able to consume one of the hero's seven slots, or vice versa.
    """
    author = await _author_uuid(client)
    ad_id = await _seed_banner(
        author=author,
        status="live",
        title="Sponsor strip campaign",
        placement="homepage_ad",
    )
    hero_id = await _seed_banner(
        author=author,
        status="live",
        title="Homepage hero campaign",
        placement="homepage",
    )
    try:
        hero = await client.get("/api/v1/public/banners")
        ads = await client.get("/api/v1/public/banners", params={"placement": "homepage_ad"})
        hero_ids = {item["id"] for item in hero.json()["banners"]}
        ad_ids = {item["id"] for item in ads.json()["banners"]}
        assert ad_id in ad_ids and ad_id not in hero_ids
        assert hero_id in hero_ids and hero_id not in ad_ids
    finally:
        await _delete_banners(ad_id, hero_id)


@pytest.mark.asyncio
async def test_only_one_sponsor_can_be_live_and_the_next_waits_behind_it(
    client: AsyncClient,
) -> None:
    """One sponsor at a time, with the successor queued rather than rotated.

    Two guarantees are asserted together because either alone would be
    misleading: the database refuses a second concurrent LIVE sponsor even
    when it uses a different governed theme, and an
    approved successor sitting in the queue is not served to visitors until
    the activation job promotes it.
    """
    from sqlalchemy.exc import IntegrityError

    import app.db.session as _session_mod
    from app.models.banner import BannerPlacement as _Placement
    from app.models.banner import BannerTemplate

    async with _session_mod.AsyncSessionLocal() as db:
        templates = (
            await db.scalars(
                select(BannerTemplate)
                .where(
                    BannerTemplate.placement == _Placement.HOMEPAGE_AD,
                    BannerTemplate.active.is_(True),
                )
                .order_by(BannerTemplate.category_key)
            )
        ).all()
    assert len(templates) >= 2
    first_template, second_template = templates[:2]

    # This dev database is long-lived and the strip is single-occupancy, so a
    # leftover LIVE sponsor would make the first seed below fail instead of the
    # third. Park any incumbent for the duration and restore it afterwards.
    async with _session_mod.AsyncSessionLocal() as db:
        parked = list(
            (
                await db.execute(
                    text(
                        "UPDATE banners SET status = 'archived' "
                        "WHERE placement = 'homepage_ad' AND status = 'live' RETURNING id"
                    )
                )
            ).scalars()
        )
        await db.commit()

    author = await _author_uuid(client)
    live_id = await _seed_banner(
        author=author,
        status="live",
        title="Current sponsor",
        placement="homepage_ad",
        category_key=first_template.category_key,
        template_id=str(first_template.id),
    )
    queued_id = await _seed_banner(
        author=author,
        status="approved",
        title="Queued sponsor",
        placement="homepage_ad",
        category_key=first_template.category_key,
        template_id=str(first_template.id),
    )
    try:
        with pytest.raises(IntegrityError):
            await _seed_banner(
                author=author,
                status="live",
                title="Second concurrent sponsor",
                placement="homepage_ad",
                category_key=second_template.category_key,
                template_id=str(second_template.id),
            )

        resp = await client.get("/api/v1/public/banners", params={"placement": "homepage_ad"})
        served = resp.json()["banners"]
        assert [item["id"] for item in served] == [live_id]
        assert queued_id not in {item["id"] for item in served}
    finally:
        await _delete_banners(live_id, queued_id)
        if parked:
            async with _session_mod.AsyncSessionLocal() as db:
                await db.execute(
                    text("UPDATE banners SET status = 'live' WHERE id = ANY(:ids)"),
                    {"ids": parked},
                )
                await db.commit()


@pytest.mark.asyncio
async def test_dashboard_placement_stays_unreachable_anonymously(client: AsyncClient) -> None:
    """Adding a fourth public placement must not widen the literal to the enum.

    "dashboard" carries authenticated, audience-targeted content; the router's
    narrow Literal is what keeps it off the anonymous route.
    """
    resp = await client.get("/api/v1/public/banners", params={"placement": "dashboard"})
    assert resp.status_code == 422
    unknown = await client.get("/api/v1/public/banners", params={"placement": "bogus"})
    assert unknown.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "placement",
    [
        BannerPlacement.FINANCIAL_SERVICES,
        BannerPlacement.PROPERTIES,
        BannerPlacement.HOMEPAGE_AD,
    ],
)
async def test_section_placements_use_the_same_seven_banner_cap(
    client: AsyncClient,
    placement: BannerPlacement,
) -> None:
    author = await _author_uuid(client)
    limit = PUBLIC_BANNERS_LIMIT_BY_PLACEMENT[placement]
    ids = [
        await _seed_banner(
            author=author,
            status="live",
            title=f"{placement.value} Cap Test {i}",
            placement=placement.value,
        )
        for i in range(limit + 3)
    ]
    try:
        resp = await client.get("/api/v1/public/banners", params={"placement": placement.value})
        assert len(resp.json()["banners"]) == limit
    finally:
        await _delete_banners(*ids)
