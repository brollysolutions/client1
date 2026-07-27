"""/api/v1/public/offers — the unauthenticated active-offer read.

There is no anonymous Postgres role in this system, so this endpoint runs as
the `app` superuser and RLS never engages (see services/public_catalog.py's
docstring). The `status == ACTIVE` predicate in that service is the ONLY
access control on this path -- test_non_active_statuses_hidden_from_anonymous
and test_active_row_is_visible_to_a_raw_superuser_session together prove that
the filtering is coming from the app predicate, not from RLS.

Offers have no priority column (unlike banners), so list_public_offers orders
newest-first (created_at DESC) instead of oldest-first: this is what keeps a
freshly seeded test offer from being crowded out of the flat
PUBLIC_OFFERS_LIMIT cap by older rows. Every test still deletes its own seeded
rows in a finally block, both to avoid polluting later runs and because a
leaked ACTIVE row would itself become a crowd-out hazard for other tests.

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select, text

from app.services.public_catalog import PUBLIC_OFFERS_PER_LINE
from conftest import full_registration, unique_mobile


async def _author_uuid(client: AsyncClient) -> str:
    """A real auth_users row is required (created_by_uuid FK) -- registers a
    throwaway account through the real endpoint, same as
    test_public_banners.py's helper."""
    mobile = unique_mobile()
    await full_registration(client, mobile=mobile, lines=["loans"])
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None
        return str(row[0])


async def _seed_offer(
    *,
    author: str,
    status: str,
    title: str,
    business_line: str = "loans",
    discount_type: str = "percentage",
    discount_value: Decimal = Decimal("10"),
    code: str | None = None,
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
    description: str | None = None,
) -> str:
    import app.db.session as _session_mod
    from app.models.offer import Offer

    async with _session_mod.AsyncSessionLocal() as db:
        offer = Offer(
            business_line=business_line,
            title=title,
            description=description,
            discount_type=discount_type,
            discount_value=discount_value,
            code=code,
            status=status,
            created_by_uuid=uuid.UUID(author),
            starts_at=starts_at,
            ends_at=ends_at,
        )
        db.add(offer)
        await db.commit()
        return str(offer.id)


async def _delete_offers(*offer_ids: str) -> None:
    import app.db.session as _session_mod
    from app.models.offer import Offer

    ids = [uuid.UUID(oid) for oid in offer_ids]
    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(delete(Offer).where(Offer.id.in_(ids)))
        await db.commit()


async def _superuser_sees(offer_id: str) -> bool:
    import app.db.session as _session_mod
    from app.models.offer import Offer

    async with _session_mod.AsyncSessionLocal() as db:
        result = await db.execute(select(Offer).where(Offer.id == uuid.UUID(offer_id)))
        return result.scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_no_auth_required(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/public/offers")
    assert resp.status_code == 200

    # Contrast with the authenticated twin, to pin the distinction this
    # endpoint exists to make.
    auth_resp = await client.get("/api/v1/offers")
    assert auth_resp.status_code == 401


@pytest.mark.asyncio
async def test_active_offer_is_returned(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    offer_id = await _seed_offer(
        author=author,
        status="active",
        title="Public Active Offer",
        business_line="loans",
        discount_type="percentage",
        discount_value=Decimal("15"),
        code="SAVE15",
        description="15% off processing fees",
    )
    try:
        resp = await client.get("/api/v1/public/offers")
        assert resp.status_code == 200
        rows = {o["id"]: o for o in resp.json()["offers"]}
        assert offer_id in rows
        row = rows[offer_id]
        assert row["title"] == "Public Active Offer"
        assert row["business_line"] == "loans"
        assert row["discount_type"] == "percentage"
        assert Decimal(row["discount_value"]) == Decimal("15")
        assert row["code"] == "SAVE15"
        assert row["description"] == "15% off processing fees"
    finally:
        await _delete_offers(offer_id)


@pytest.mark.asyncio
async def test_non_active_statuses_hidden_from_anonymous(client: AsyncClient) -> None:
    """The access-control guard: nothing but `active` may ever reach a visitor."""
    author = await _author_uuid(client)
    ids = {
        status: await _seed_offer(author=author, status=status, title=f"Hidden {status}")
        for status in ("draft", "scheduled", "expired", "archived")
    }
    try:
        resp = await client.get("/api/v1/public/offers")
        assert resp.status_code == 200
        returned_ids = {o["id"] for o in resp.json()["offers"]}
        for status, offer_id in ids.items():
            assert offer_id not in returned_ids, f"{status} offer leaked to public response"
    finally:
        await _delete_offers(*ids.values())


@pytest.mark.asyncio
async def test_active_row_is_visible_to_a_raw_superuser_session(client: AsyncClient) -> None:
    """Proves the previous test's exclusion came from the app predicate, not
    RLS. A superuser session bypasses RLS entirely, so if this row is present
    here but absent over HTTP, the HTTP exclusion can only be the explicit
    `status == ACTIVE` filter in services.public_catalog. Delete this test and
    the reason for that WHERE clause is lost."""
    author = await _author_uuid(client)
    offer_id = await _seed_offer(author=author, status="scheduled", title="Superuser-Visible")
    try:
        assert await _superuser_sees(offer_id) is True

        resp = await client.get("/api/v1/public/offers")
        returned_ids = {o["id"] for o in resp.json()["offers"]}
        assert offer_id not in returned_ids
    finally:
        await _delete_offers(offer_id)


@pytest.mark.asyncio
async def test_response_omits_internal_fields(client: AsyncClient) -> None:
    author = await _author_uuid(client)
    offer_id = await _seed_offer(author=author, status="active", title="Field Leak Check")
    try:
        resp = await client.get("/api/v1/public/offers")
        row = next(o for o in resp.json()["offers"] if o["id"] == offer_id)
        assert set(row.keys()) == {
            "id",
            "business_line",
            "title",
            "description",
            "discount_type",
            "discount_value",
            "code",
        }
        internal_fields = {
            "status",
            "created_by_uuid",
            "starts_at",
            "ends_at",
            "created_at",
        }
        for field in internal_fields:
            assert field not in row, f"internal field {field!r} leaked to public response"
    finally:
        await _delete_offers(offer_id)


@pytest.mark.asyncio
async def test_future_starts_at_is_hidden(client: AsyncClient) -> None:
    """The stalled-scheduler defence: even if status were somehow active ahead
    of its start (it shouldn't be, cms_activation guards this), the endpoint's
    own re-check must still hide it."""
    author = await _author_uuid(client)
    future = datetime.now(UTC) + timedelta(hours=1)
    offer_id = await _seed_offer(
        author=author, status="active", title="Future Start Hidden", starts_at=future
    )
    try:
        resp = await client.get("/api/v1/public/offers")
        returned_ids = {o["id"] for o in resp.json()["offers"]}
        assert offer_id not in returned_ids
    finally:
        await _delete_offers(offer_id)


@pytest.mark.asyncio
async def test_past_ends_at_is_hidden(client: AsyncClient) -> None:
    """Same defence on the far side. An ACTIVE row with both bounds NULL is
    seeded in the same run to prove evergreen offers still serve fine."""
    author = await _author_uuid(client)
    past = datetime.now(UTC) - timedelta(hours=1)
    expired_id = await _seed_offer(
        author=author, status="active", title="Past End Hidden", ends_at=past
    )
    evergreen_id = await _seed_offer(author=author, status="active", title="Evergreen Visible")
    try:
        resp = await client.get("/api/v1/public/offers")
        returned_ids = {o["id"] for o in resp.json()["offers"]}
        assert expired_id not in returned_ids
        assert evergreen_id in returned_ids
    finally:
        await _delete_offers(expired_id, evergreen_id)


@pytest.mark.asyncio
async def test_ordering_is_newest_first(client: AsyncClient) -> None:
    """Relative order of the seeded ids only -- never absolute positions, the
    DB is shared. Newest (highest created_at) must sort first: offers have no
    priority column, so newest-first is what protects a just-activated offer
    from the flat cap (see list_public_offers's docstring)."""
    author = await _author_uuid(client)
    older_id = await _seed_offer(author=author, status="active", title="Older Offer")
    newer_id = await _seed_offer(author=author, status="active", title="Newer Offer")
    try:
        resp = await client.get("/api/v1/public/offers")
        ids_in_order = [o["id"] for o in resp.json()["offers"]]
        assert ids_in_order.index(newer_id) < ids_in_order.index(older_id)
    finally:
        await _delete_offers(older_id, newer_id)


@pytest.mark.asyncio
async def test_per_line_cap(client: AsyncClient) -> None:
    """The regression test for the flat-cap starvation bug: a line with heavy
    publishing volume must never crowd another line's offer out of the
    response. Seeds more loans offers than the per-line cap allows, plus one
    real_estate offer, and asserts the real_estate offer always survives --
    proving the cap partitions by business_line rather than applying globally."""
    author = await _author_uuid(client)
    loans_ids = [
        await _seed_offer(author=author, status="active", title=f"Cap Test {i}")
        for i in range(PUBLIC_OFFERS_PER_LINE + 3)
    ]
    re_id = await _seed_offer(
        author=author, status="active", title="RE Survivor", business_line="real_estate"
    )
    try:
        resp = await client.get("/api/v1/public/offers")
        offers = resp.json()["offers"]
        returned_loans_ids = {o["id"] for o in offers if o["business_line"] == "loans"}
        assert len(returned_loans_ids & set(loans_ids)) == PUBLIC_OFFERS_PER_LINE
        assert re_id in {o["id"] for o in offers}
    finally:
        await _delete_offers(*loans_ids, re_id)


@pytest.mark.asyncio
async def test_business_line_is_exposed(client: AsyncClient) -> None:
    """No banner analogue -- banners deliberately hide business_line (the
    hero is cross-line by design, ADR-0007), but offers are genuinely
    line-scoped and the frontend strips filter on this field client-side, so
    it must round-trip correctly for all three values."""
    author = await _author_uuid(client)
    loans_id = await _seed_offer(
        author=author, status="active", title="Loans Offer", business_line="loans"
    )
    re_id = await _seed_offer(
        author=author, status="active", title="RE Offer", business_line="real_estate"
    )
    both_id = await _seed_offer(
        author=author, status="active", title="Both Offer", business_line="both"
    )
    try:
        resp = await client.get("/api/v1/public/offers")
        rows = {o["id"]: o for o in resp.json()["offers"]}
        assert rows[loans_id]["business_line"] == "loans"
        assert rows[re_id]["business_line"] == "real_estate"
        assert rows[both_id]["business_line"] == "both"
    finally:
        await _delete_offers(loans_id, re_id, both_id)
