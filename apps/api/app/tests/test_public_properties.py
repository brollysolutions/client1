"""/api/v1/public/properties — the unauthenticated catalog read.

There is no anonymous Postgres role in this system, so this endpoint runs as
the `app` superuser and RLS never engages (see
services/public_catalog.py's docstring). The `active` predicate in that
service is the ONLY access control on this path — test_inactive_hidden_from_anonymous
and test_inactive_row_is_visible_to_a_raw_superuser_session together prove
that the filtering is coming from the app predicate, not from RLS (which
would also hide the row from a superuser reading it back directly if it were
somehow doing the work, but a superuser session bypasses RLS entirely — so
seeing the row there and NOT seeing it over HTTP is exactly the signature of
an app-layer filter).

Every test seeds into "plots"/"commercial"/"houses", never "apartments"/
"villas": those two are seeded by several other property test files, and the
test DB is shared and never truncated, so an exact-count assertion (this
endpoint's per-category cap makes several of ours exact-count) would be
flaky depending on run order and history. Every test also deletes its own
seeded rows in a finally block: this file's assertions rely on knowing a
category's exact row count, so leftover rows from a prior run would
eventually push a category over PUBLIC_CATALOG_PER_CATEGORY and reintroduce
the same flakiness for later sessions.

Requires: running Postgres + Redis (docker compose up -d).
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select

from app.services.public_catalog import PUBLIC_CATALOG_PER_CATEGORY


async def _seed_property(*, active: bool, title: str, category: str = "plots") -> str:
    """Insert a property via the app superuser (bypasses RLS). Returns its id."""
    import app.db.session as _session_mod
    from app.models.property import Property

    async with _session_mod.AsyncSessionLocal() as db:
        prop = Property(
            business_line="real_estate",
            active=active,
            title=title,
            type="Plot",
            location="Public Locality, Public City",
            price_display="₹80 L",
            meta="2 bed · 1,100 sqft",
            image="/illustrations/properties/apartment-1.svg",
            category=category,
            city="Public City",
            locality="Public Locality",
            pincode="560001",
            price_paise=8_000_000_0,
            bhk=2,
            area_sqft=1100,
            furnishing="furnished",
            construction_status="ready",
            amenities=["lift", "gym"],
            age_years=3,
            rera_number="RERA/KA/2024/1234",
            details={},
        )
        db.add(prop)
        await db.commit()
        return str(prop.id)


async def _delete_properties(*property_ids: str) -> None:
    """Teardown: remove rows this file seeded, so category counts never drift
    across runs (see module docstring)."""
    import app.db.session as _session_mod
    from app.models.property import Property

    ids = [uuid.UUID(pid) for pid in property_ids]
    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(delete(Property).where(Property.id.in_(ids)))
        await db.commit()


async def _superuser_sees(property_id: str) -> bool:
    """Direct superuser-session read, bypassing any application-layer filter."""
    import app.db.session as _session_mod
    from app.models.property import Property

    async with _session_mod.AsyncSessionLocal() as db:
        result = await db.execute(select(Property).where(Property.id == uuid.UUID(property_id)))
        return result.scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_no_auth_required(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/public/properties")
    assert resp.status_code == 200

    # Contrast with the authenticated twin, to pin the distinction this
    # endpoint exists to make.
    auth_resp = await client.get("/api/v1/properties")
    assert auth_resp.status_code == 401


@pytest.mark.asyncio
async def test_active_listing_is_returned(client: AsyncClient) -> None:
    active_id = await _seed_property(active=True, title="Public Active Listing")
    try:
        resp = await client.get("/api/v1/public/properties")
        assert resp.status_code == 200
        by_id = {p["id"]: p for p in resp.json()["properties"]}
        assert active_id in by_id
        row = by_id[active_id]
        assert row["title"] == "Public Active Listing"
        assert row["category"] == "plots"
        assert row["rera_number"] == "RERA/KA/2024/1234"
        assert row["price_display"] == "₹80 L"
    finally:
        await _delete_properties(active_id)


@pytest.mark.asyncio
async def test_inactive_hidden_from_anonymous(client: AsyncClient) -> None:
    """The security test: an inactive row must never reach a public response."""
    inactive_id = await _seed_property(active=False, title="Public Hidden Listing")
    try:
        resp = await client.get("/api/v1/public/properties")
        assert resp.status_code == 200
        ids = {p["id"] for p in resp.json()["properties"]}
        assert inactive_id not in ids
    finally:
        await _delete_properties(inactive_id)


@pytest.mark.asyncio
async def test_inactive_row_is_visible_to_a_raw_superuser_session(client: AsyncClient) -> None:
    """Proves the previous test's exclusion came from the app predicate, not RLS.

    A superuser session bypasses RLS entirely, so if this row is present here
    but absent over HTTP, the HTTP exclusion can only be the explicit
    `active == True` filter in services.public_catalog. Delete this test and
    the reason for that WHERE clause is lost.
    """
    inactive_id = await _seed_property(active=False, title="Public Superuser-Visible Listing")
    try:
        assert await _superuser_sees(inactive_id) is True

        resp = await client.get("/api/v1/public/properties")
        ids = {p["id"] for p in resp.json()["properties"]}
        assert inactive_id not in ids
    finally:
        await _delete_properties(inactive_id)


@pytest.mark.asyncio
async def test_response_omits_internal_fields(client: AsyncClient) -> None:
    """The leak-regression test: catches PublicPropertyRead being swapped for PropertyRead."""
    active_id = await _seed_property(active=True, title="Public Field-Shape Listing")
    try:
        resp = await client.get("/api/v1/public/properties")
        by_id = {p["id"]: p for p in resp.json()["properties"]}
        row = by_id[active_id]

        exposed = set(row.keys())
        assert exposed == {
            "id",
            "title",
            "type",
            "location",
            "price_display",
            "meta",
            "image",
            "category",
            "rera_number",
        }
        for internal_field in (
            "active",
            "created_at",
            "updated_at",
            "business_line",
            "price_paise",
            "bhk",
            "area_sqft",
            "furnishing",
            "construction_status",
            "amenities",
            "age_years",
            "pincode",
            "city",
            "locality",
            "details",
        ):
            assert internal_field not in row
    finally:
        await _delete_properties(active_id)


@pytest.mark.asyncio
async def test_per_category_cap(client: AsyncClient) -> None:
    """A flat LIMIT would let one category's volume crowd out another's.

    Seeds MORE than the cap into "commercial" — enough that total commercial
    rows exceed the cap regardless of any pre-existing dev-seed rows already
    in that category — and asserts the returned count is capped at exactly
    PUBLIC_CATALOG_PER_CATEGORY. Deliberately does NOT assert which specific
    ids survive: dev-seed data (app.scripts.seed_properties) legitimately
    seeds a handful of rows into every category, so this file cannot assume
    any category starts empty.
    """
    commercial_ids = [
        await _seed_property(active=True, title=f"Cap Commercial {i}", category="commercial")
        for i in range(PUBLIC_CATALOG_PER_CATEGORY + 5)
    ]
    house_id = await _seed_property(active=True, title="Cap House", category="houses")
    try:
        resp = await client.get("/api/v1/public/properties")
        properties = resp.json()["properties"]

        returned_commercial_count = sum(1 for p in properties if p["category"] == "commercial")
        assert returned_commercial_count == PUBLIC_CATALOG_PER_CATEGORY

        returned_ids = {p["id"] for p in properties}
        assert house_id in returned_ids
    finally:
        await _delete_properties(*commercial_ids, house_id)


@pytest.mark.asyncio
async def test_ordering_is_created_at_then_id(client: AsyncClient) -> None:
    first_id = await _seed_property(active=True, title="Order First")
    second_id = await _seed_property(active=True, title="Order Second")
    try:
        resp = await client.get("/api/v1/public/properties")
        ids_in_order = [
            p["id"] for p in resp.json()["properties"] if p["id"] in (first_id, second_id)
        ]
        assert ids_in_order == [first_id, second_id]
    finally:
        await _delete_properties(first_id, second_id)
