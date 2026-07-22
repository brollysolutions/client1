"""properties RLS — shared catalog visibility + business_line immutability.

Verifies migration bf2c3d4e5a6b's catalog policy: an `active` listing is
visible to ANY authenticated user (client, real-estate line-staff, and even a
loans-only client — the catalog is public-equivalent, deliberately with no
owner or line predicate), an `inactive` listing is hidden from everyone except
platform Admin/Sub Admin (platform_scope='true'), and business_line is
immutable once set. Mirrors test_enquiries_rls.py's harness.

Requires the Docker stack with migrations applied; auto-skips without Redis.
"""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings


async def _seed_property(*, active: bool) -> str:
    """Insert a property via the app superuser (bypasses RLS). Returns its id."""
    import app.db.session as _session_mod
    from app.models.property import Property

    async with _session_mod.AsyncSessionLocal() as db:
        prop = Property(
            business_line="real_estate",
            active=active,
            title="RLS Probe Listing",
            type="Apartment",
            location="Probe Locality, Probe City",
            price_display="₹75 L",
            meta="2 bed · 1,000 sqft",
            image=None,
            category="apartments",
            city="Probe City",
            locality="Probe Locality",
            pincode="500001",
            price_paise=7_500_000_0,
            bhk=2,
            area_sqft=1000,
            furnishing="semi",
            construction_status="ready",
            amenities=["lift"],
            age_years=2,
            rera_number="RERA/TS/2024/9999",
            details={},
        )
        db.add(prop)
        await db.commit()
        return str(prop.id)


async def _visible_ids(
    *,
    role: str = "client",
    business_line: str = "",
    platform_scope: str = "false",
) -> set[uuid.UUID]:
    """Open a fresh connection, drop to api_user, set the RLS context, list ids."""
    raw_url = settings.DATABASE_URL.replace("pgbouncer:5432", "postgres:5432")
    engine = create_async_engine(
        raw_url,
        poolclass=NullPool,
        connect_args={
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4()}__",
        },
    )
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SET LOCAL ROLE api_user"))
            await conn.execute(
                text(
                    "SELECT "
                    "set_config('app.auth_user_uuid', :uuid, true),"
                    "set_config('app.role', :role, true),"
                    "set_config('app.business_line', :bl, true),"
                    "set_config('app.client_profile_uuid', '', true),"
                    "set_config('app.agent_profile_uuid', '', true),"
                    "set_config('app.staff_profile_uuid', '', true),"
                    "set_config('app.platform_scope', :ps, true)"
                ),
                {
                    "uuid": str(uuid.uuid4()),
                    "role": role,
                    "bl": business_line,
                    "ps": platform_scope,
                },
            )
            result = await conn.execute(text("SELECT id FROM properties"))
            return {row[0] for row in result.fetchall()}
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_active_visible_to_client(client: AsyncClient) -> None:
    pid = await _seed_property(active=True)
    assert uuid.UUID(pid) in await _visible_ids(role="client", business_line="real_estate")


@pytest.mark.asyncio
async def test_active_visible_to_loans_only_client(client: AsyncClient) -> None:
    """Shared, public-equivalent catalog: no line predicate — a loans client sees it too."""
    pid = await _seed_property(active=True)
    assert uuid.UUID(pid) in await _visible_ids(role="client", business_line="loans")


@pytest.mark.asyncio
async def test_inactive_hidden_from_client(client: AsyncClient) -> None:
    pid = await _seed_property(active=False)
    assert uuid.UUID(pid) not in await _visible_ids(role="client", business_line="real_estate")


@pytest.mark.asyncio
async def test_inactive_hidden_from_line_staff(client: AsyncClient) -> None:
    """No staff/owner branch — line staff see only active listings, not inactive."""
    pid = await _seed_property(active=False)
    assert uuid.UUID(pid) not in await _visible_ids(role="telecaller", business_line="real_estate")


@pytest.mark.asyncio
async def test_admin_platform_scope_sees_inactive(client: AsyncClient) -> None:
    pid = await _seed_property(active=False)
    assert uuid.UUID(pid) in await _visible_ids(role="admin", platform_scope="true")


@pytest.mark.asyncio
async def test_property_business_line_immutable(client: AsyncClient) -> None:
    """An already-set business_line cannot be flipped (shared trigger)."""
    import app.db.session as _session_mod

    pid = await _seed_property(active=True)
    with pytest.raises(Exception) as exc:  # noqa: B017 — plpgsql check_violation
        async with _session_mod.AsyncSessionLocal() as db:
            await db.execute(
                text("UPDATE properties SET business_line = 'loans' WHERE id = :id"), {"id": pid}
            )
            await db.commit()
    assert "immutable" in str(exc.value).lower()
