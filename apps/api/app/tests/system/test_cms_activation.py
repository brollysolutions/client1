"""cms_activation job tests (public-banner-serving PR B).

Covers the NULL-timestamp semantics table in app/jobs/cms_activation.py's module
docstring, the inclusive-start/exclusive-none-end boundary behavior, idempotency,
and that non-eligible statuses are left untouched. Requires the Docker stack;
auto-skips without Redis (via the `client` fixture, used here purely as a
gating dependency -- these tests never make an HTTP call).

Every seeded row is deleted in a `finally` block: the test DB is shared and
never truncated, and a leaked LIVE banner or ACTIVE offer would pollute
test_public_banners.py's cap/presence assertions in later runs.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select, text

from app.jobs.cms_activation import cms_activation
from app.models.banner import Banner, BannerStatus, BannerType
from app.models.offer import Offer, OfferStatus
from conftest import full_registration, unique_mobile

_PAST = datetime.now(UTC) - timedelta(hours=1)
_FUTURE = datetime.now(UTC) + timedelta(hours=1)


async def _author_uuid(client: AsyncClient) -> str:
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
    status: BannerStatus,
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
    banner_type: BannerType = BannerType.DEFAULT,
    category_key: str | None = None,
    replaces_banner_id: str | None = None,
    offer_id: str | None = None,
    property_id: str | None = None,
) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        banner = Banner(
            business_line="loans",
            banner_type=banner_type,
            category_key=category_key,
            replaces_banner_id=uuid.UUID(replaces_banner_id) if replaces_banner_id else None,
            offer_id=uuid.UUID(offer_id) if offer_id else None,
            property_id=uuid.UUID(property_id) if property_id else None,
            title=f"CMS activation test {uuid.uuid4()}",
            status=status,
            created_by_uuid=uuid.UUID(author),
            starts_at=starts_at,
            ends_at=ends_at,
        )
        db.add(banner)
        await db.commit()
        return str(banner.id)


async def _seed_property(*, active: bool) -> str:
    import app.db.session as _session_mod
    from app.models.property import Property

    async with _session_mod.AsyncSessionLocal() as db:
        property_listing = Property(
            business_line="real_estate",
            active=active,
            title="Activation property",
            type="Villa",
            location="Kokapet, Hyderabad",
            price_display="₹2 Cr",
            category="villas",
            city="Hyderabad",
            locality="Kokapet",
            pincode="500075",
            price_paise=20_000_000_00,
            furnishing="furnished",
            construction_status="ready",
            rera_number="RERA/TS/2026/0043",
        )
        db.add(property_listing)
        await db.commit()
        return str(property_listing.id)


async def _seed_offer(
    *,
    author: str,
    status: OfferStatus,
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
    audience_rules: dict | None = None,
) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        offer = Offer(
            business_line="loans",
            title=f"CMS activation test {uuid.uuid4()}",
            discount_type="flat",
            discount_value=100,
            status=status,
            audience_rules=audience_rules or {},
            created_by_uuid=uuid.UUID(author),
            starts_at=starts_at,
            ends_at=ends_at,
        )
        db.add(offer)
        await db.commit()
        return str(offer.id)


async def _banner_status(banner_id: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = await db.scalar(select(Banner).where(Banner.id == uuid.UUID(banner_id)))
        assert row is not None
        return row.status.value


async def _offer_status(offer_id: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = await db.scalar(select(Offer).where(Offer.id == uuid.UUID(offer_id)))
        assert row is not None
        return row.status.value


async def _delete_banners(*banner_ids: str) -> None:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(delete(Banner).where(Banner.id.in_([uuid.UUID(i) for i in banner_ids])))
        await db.commit()


async def _delete_offers(*offer_ids: str) -> None:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(delete(Offer).where(Offer.id.in_([uuid.UUID(i) for i in offer_ids])))
        await db.commit()


async def _delete_properties(*property_ids: str) -> None:
    import app.db.session as _session_mod
    from app.models.property import Property

    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(
            delete(Property).where(Property.id.in_([uuid.UUID(i) for i in property_ids]))
        )
        await db.commit()


@pytest.mark.asyncio
async def test_approved_banner_with_past_start_goes_live(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    banner_id = await _seed_banner(author=author, status=BannerStatus.APPROVED, starts_at=_PAST)
    try:
        await cms_activation()
        assert await _banner_status(banner_id) == "live"
    finally:
        await _delete_banners(banner_id)


@pytest.mark.asyncio
async def test_approved_banner_with_null_start_goes_live(client: AsyncClient) -> None:
    """The case every real UI-authored banner hits: banner-form.tsx has no
    starts_at input, so every banner an Admin approves has starts_at=NULL."""
    author = await _author_uuid(client)
    banner_id = await _seed_banner(author=author, status=BannerStatus.APPROVED, starts_at=None)
    try:
        await cms_activation()
        assert await _banner_status(banner_id) == "live"
    finally:
        await _delete_banners(banner_id)


@pytest.mark.asyncio
async def test_approved_banner_with_future_start_stays_approved(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    banner_id = await _seed_banner(author=author, status=BannerStatus.APPROVED, starts_at=_FUTURE)
    try:
        await cms_activation()
        assert await _banner_status(banner_id) == "approved"
    finally:
        await _delete_banners(banner_id)


@pytest.mark.asyncio
async def test_approved_banner_with_inactive_property_stays_approved(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    property_id = await _seed_property(active=False)
    banner_id = await _seed_banner(
        author=author,
        status=BannerStatus.APPROVED,
        property_id=property_id,
    )
    try:
        await cms_activation()
        assert await _banner_status(banner_id) == "approved"
    finally:
        await _delete_banners(banner_id)
        await _delete_properties(property_id)


@pytest.mark.asyncio
async def test_live_banner_with_past_end_is_archived(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    banner_id = await _seed_banner(author=author, status=BannerStatus.LIVE, ends_at=_PAST)
    try:
        await cms_activation()
        assert await _banner_status(banner_id) == "archived"
    finally:
        await _delete_banners(banner_id)


@pytest.mark.asyncio
async def test_live_banner_with_null_end_stays_live(client: AsyncClient) -> None:
    """Evergreen banners (no stated end) are never auto-archived."""
    author = await _author_uuid(client)
    banner_id = await _seed_banner(author=author, status=BannerStatus.LIVE, ends_at=None)
    try:
        await cms_activation()
        assert await _banner_status(banner_id) == "live"
    finally:
        await _delete_banners(banner_id)


@pytest.mark.asyncio
async def test_approved_banner_with_past_start_and_past_end_archives_in_one_run(
    client: AsyncClient,
) -> None:
    """Pins the job's activate-before-archive ordering claim: a banner with
    BOTH bounds already in the past (reachable via the API even though
    banner-form.tsx never sets these fields) must converge
    approved -> live -> archived in a SINGLE run, not sit live for one extra
    tick. A future refactor that reordered the four statements, or split them
    across transactions, would leave this at "live" instead of "archived"."""
    author = await _author_uuid(client)
    banner_id = await _seed_banner(
        author=author, status=BannerStatus.APPROVED, starts_at=_PAST, ends_at=_PAST
    )
    try:
        await cms_activation()
        assert await _banner_status(banner_id) == "archived"
    finally:
        await _delete_banners(banner_id)


@pytest.mark.asyncio
async def test_inclusive_start_boundary_activates(client: AsyncClient) -> None:
    """starts_at slightly in the past must activate (inclusive <=). An exactly
    equal boundary can't be constructed against a moving now(); this proves
    inclusivity on the near side, and ..._future_start_stays_approved proves
    exclusivity on the far side."""
    author = await _author_uuid(client)
    almost_now = datetime.now(UTC) - timedelta(milliseconds=1)
    banner_id = await _seed_banner(
        author=author, status=BannerStatus.APPROVED, starts_at=almost_now
    )
    try:
        await cms_activation()
        assert await _banner_status(banner_id) == "live"
    finally:
        await _delete_banners(banner_id)


@pytest.mark.asyncio
async def test_draft_pending_rejected_banners_untouched(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    draft_id = await _seed_banner(author=author, status=BannerStatus.DRAFT)
    pending_id = await _seed_banner(author=author, status=BannerStatus.PENDING_APPROVAL)
    rejected_id = await _seed_banner(author=author, status=BannerStatus.REJECTED)
    try:
        await cms_activation()
        assert await _banner_status(draft_id) == "draft"
        assert await _banner_status(pending_id) == "pending_approval"
        assert await _banner_status(rejected_id) == "rejected"
    finally:
        await _delete_banners(draft_id, pending_id, rejected_id)


@pytest.mark.asyncio
async def test_archived_banner_is_not_reactivated(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    banner_id = await _seed_banner(author=author, status=BannerStatus.ARCHIVED, starts_at=_PAST)
    try:
        await cms_activation()
        assert await _banner_status(banner_id) == "archived"
    finally:
        await _delete_banners(banner_id)


@pytest.mark.asyncio
async def test_scheduled_offer_activates(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    offer_id = await _seed_offer(author=author, status=OfferStatus.SCHEDULED, starts_at=_PAST)
    try:
        await cms_activation()
        assert await _offer_status(offer_id) == "active"
    finally:
        await _delete_offers(offer_id)


@pytest.mark.asyncio
async def test_scheduled_offer_with_null_start_activates(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    offer_id = await _seed_offer(author=author, status=OfferStatus.SCHEDULED, starts_at=None)
    try:
        await cms_activation()
        assert await _offer_status(offer_id) == "active"
    finally:
        await _delete_offers(offer_id)


@pytest.mark.asyncio
async def test_scheduled_offer_with_future_start_stays_scheduled(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    offer_id = await _seed_offer(author=author, status=OfferStatus.SCHEDULED, starts_at=_FUTURE)
    try:
        await cms_activation()
        assert await _offer_status(offer_id) == "scheduled"
    finally:
        await _delete_offers(offer_id)


@pytest.mark.asyncio
async def test_active_offer_with_past_end_expires(client: AsyncClient) -> None:
    """The first-ever writer of OfferStatus.EXPIRED."""
    author = await _author_uuid(client)
    offer_id = await _seed_offer(author=author, status=OfferStatus.ACTIVE, ends_at=_PAST)
    try:
        await cms_activation()
        assert await _offer_status(offer_id) == "expired"
    finally:
        await _delete_offers(offer_id)


@pytest.mark.asyncio
async def test_active_offer_with_null_end_stays_active(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    offer_id = await _seed_offer(author=author, status=OfferStatus.ACTIVE, ends_at=None)
    try:
        await cms_activation()
        assert await _offer_status(offer_id) == "active"
    finally:
        await _delete_offers(offer_id)


@pytest.mark.asyncio
async def test_scheduled_offer_with_past_start_and_past_end_expires_in_one_run(
    client: AsyncClient,
) -> None:
    """The offer analogue of the banner same-tick convergence test above:
    both bounds in the past must reach `expired` in a single run via
    scheduled -> active -> expired, not stop at `active`."""
    author = await _author_uuid(client)
    offer_id = await _seed_offer(
        author=author, status=OfferStatus.SCHEDULED, starts_at=_PAST, ends_at=_PAST
    )
    try:
        await cms_activation()
        assert await _offer_status(offer_id) == "expired"
    finally:
        await _delete_offers(offer_id)


@pytest.mark.asyncio
async def test_draft_expired_archived_offers_untouched(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    draft_id = await _seed_offer(author=author, status=OfferStatus.DRAFT)
    expired_id = await _seed_offer(author=author, status=OfferStatus.EXPIRED, ends_at=_PAST)
    archived_id = await _seed_offer(author=author, status=OfferStatus.ARCHIVED, starts_at=_PAST)
    try:
        await cms_activation()
        assert await _offer_status(draft_id) == "draft"
        assert await _offer_status(expired_id) == "expired"
        assert await _offer_status(archived_id) == "archived"
    finally:
        await _delete_offers(draft_id, expired_id, archived_id)


@pytest.mark.asyncio
async def test_category_replacement_archives_current_atomically(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    current_id = await _seed_banner(
        author=author,
        status=BannerStatus.LIVE,
        category_key="general",
    )
    unrelated_id = await _seed_banner(
        author=author,
        status=BannerStatus.APPROVED,
        starts_at=_PAST,
        category_key="general",
    )
    try:
        await cms_activation()
        assert await _banner_status(current_id) == "live"
        assert await _banner_status(unrelated_id) == "approved"

        replacement_id = await _seed_banner(
            author=author,
            status=BannerStatus.APPROVED,
            starts_at=_PAST,
            category_key="general",
            replaces_banner_id=current_id,
        )
        try:
            await cms_activation()
            assert await _banner_status(current_id) == "archived"
            assert await _banner_status(replacement_id) == "live"
        finally:
            await _delete_banners(replacement_id)
    finally:
        await _delete_banners(unrelated_id, current_id)


@pytest.mark.asyncio
async def test_offer_campaign_waits_for_linked_offer_to_be_active(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    offer_id = await _seed_offer(author=author, status=OfferStatus.DRAFT)
    banner_id = await _seed_banner(
        author=author,
        status=BannerStatus.APPROVED,
        starts_at=_PAST,
        category_key="offers",
        offer_id=offer_id,
    )
    try:
        await cms_activation()
        assert await _banner_status(banner_id) == "approved"

        import app.db.session as _session_mod

        async with _session_mod.AsyncSessionLocal() as db:
            offer = await db.get(Offer, uuid.UUID(offer_id))
            assert offer is not None
            offer.status = OfferStatus.ACTIVE
            await db.commit()
        await cms_activation()
        assert await _banner_status(banner_id) == "live"
    finally:
        await _delete_banners(banner_id)
        await _delete_offers(offer_id)


@pytest.mark.asyncio
async def test_offer_campaign_with_targeted_offer_stays_approved(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    offer_id = await _seed_offer(
        author=author,
        status=OfferStatus.ACTIVE,
        audience_rules={"version": 1, "user_types": ["client"]},
    )
    banner_id = await _seed_banner(
        author=author,
        status=BannerStatus.APPROVED,
        starts_at=_PAST,
        category_key="offers",
        offer_id=offer_id,
    )
    try:
        await cms_activation()
        assert await _banner_status(banner_id) == "approved"
    finally:
        await _delete_banners(banner_id)
        await _delete_offers(offer_id)


@pytest.mark.asyncio
async def test_job_is_idempotent(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    banner_id = await _seed_banner(author=author, status=BannerStatus.APPROVED, starts_at=_PAST)
    offer_id = await _seed_offer(author=author, status=OfferStatus.SCHEDULED, starts_at=_PAST)
    try:
        await cms_activation()
        await cms_activation()  # second run must not error and must not un-flip anything
        assert await _banner_status(banner_id) == "live"
        assert await _offer_status(offer_id) == "active"
    finally:
        await _delete_banners(banner_id)
        await _delete_offers(offer_id)


@pytest.mark.asyncio
async def test_summary_counts_rows_changed(client: AsyncClient) -> None:
    """>=, not ==: the DB is shared, so a concurrently-seeded row from another
    test could be swept into the same tick. Per-row assertions above carry the
    precision; this only proves the counters are wired to the right statement."""
    author = await _author_uuid(client)
    banner_id = await _seed_banner(author=author, status=BannerStatus.APPROVED, starts_at=_PAST)
    offer_id = await _seed_offer(author=author, status=OfferStatus.SCHEDULED, starts_at=_PAST)
    try:
        summary = await cms_activation()
        assert summary["banners_activated"] >= 1
        assert summary["offers_activated"] >= 1
        assert summary["banners_archived"] >= 0
        assert summary["offers_expired"] >= 0
    finally:
        await _delete_banners(banner_id)
        await _delete_offers(offer_id)
