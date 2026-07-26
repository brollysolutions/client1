"""property_deals RLS — identity-safe client visibility + real-estate line-staff
+ telecaller-assigned-only branches.

Verifies migration d6e7f8a9b0c1's hybrid policy. The highest-value case here is
test_both_line_client_sees_own_deal: property_deals.client_profile_uuid is a
real FK (unlike enquiries/site_visits' identity-level user_uuid), but the RLS
predicate must NOT do a direct equality against the JWT's single
client_profile_uuid claim (which _build_access_claims picks alphabetically —
"loans", never "real_estate" — for a both-line client). This test is exactly
the regression that predicate shape would cause.

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
from conftest import full_registration, unique_mobile


async def _auth_user_uuid(mobile: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(text("SELECT id FROM auth_users WHERE mobile = :m"), {"m": mobile})
        ).fetchone()
        assert row is not None, f"no auth_user for {mobile}"
        return str(row[0])


async def _client_profile_uuid(mobile: str, business_line: str) -> str:
    import app.db.session as _session_mod

    async with _session_mod.AsyncSessionLocal() as db:
        row = (
            await db.execute(
                text(
                    "SELECT cp.id FROM client_profiles cp "
                    "JOIN auth_users u ON u.id = cp.auth_user_uuid "
                    "WHERE u.mobile = :m AND cp.business_line = :bl"
                ),
                {"m": mobile, "bl": business_line},
            )
        ).fetchone()
        assert row is not None, f"no client_profile for {mobile}/{business_line}"
        return str(row[0])


async def _seed_property(mobile: str) -> str:
    import app.db.session as _session_mod
    from app.models.property import Property

    async with _session_mod.AsyncSessionLocal() as db:
        prop = Property(
            business_line="real_estate",
            active=True,
            title="RLS Test Property",
            type="Apartment",
            location="Test Locality, Test City",
            price_display="₹80 L",
            category="apartments",
            city="Test City",
            locality="Test Locality",
            pincode="560001",
            price_paise=8_000_000_0,
            bhk=2,
            area_sqft=1100,
            furnishing="furnished",
            construction_status="ready",
            amenities=[],
            age_years=1,
            rera_number=f"RERA/RLS/{uuid.uuid4().hex[:8]}",
            details={},
        )
        db.add(prop)
        await db.flush()
        return str(prop.id)


async def _seed_deal(mobile: str, business_line: str = "real_estate") -> str:
    """Insert a property_deal via the app superuser (bypasses RLS): a fresh
    real_estate lead + property for this mobile's client_profile.

    capture_lead always anchors the registration-time lead to loans
    (business_line is immutable), and Lead.mobile has a partial-unique index
    on non-terminal leads — so that auto-captured lead is closed out first to
    free the mobile before inserting a fresh real_estate lead here.
    """
    from sqlalchemy import update

    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin, LeadStatus
    from app.models.property import Property
    from app.models.property_deal import PropertyDeal

    client_profile_id = await _client_profile_uuid(mobile, business_line)
    async with _session_mod.AsyncSessionLocal() as db:
        await db.execute(update(Lead).where(Lead.mobile == mobile).values(status="closed"))
        prop = Property(
            business_line="real_estate",
            active=True,
            title="RLS Deal Property",
            type="Apartment",
            location="Test Locality, Test City",
            price_display="₹80 L",
            category="apartments",
            city="Test City",
            locality="Test Locality",
            pincode="560001",
            price_paise=8_000_000_0,
            bhk=2,
            area_sqft=1100,
            furnishing="furnished",
            construction_status="ready",
            amenities=[],
            age_years=1,
            rera_number=f"RERA/RLS/{uuid.uuid4().hex[:8]}",
            details={},
        )
        lead = Lead(
            mobile=mobile,
            business_line="real_estate",
            status=LeadStatus.ASSIGNED,
            origin=LeadOrigin.DIRECT,
            client_profile_uuid=uuid.UUID(client_profile_id),
        )
        db.add_all([prop, lead])
        await db.flush()
        deal = PropertyDeal(
            lead_uuid=lead.id,
            client_profile_uuid=uuid.UUID(client_profile_id),
            property_id=prop.id,
            business_line="real_estate",
        )
        db.add(deal)
        await db.commit()
        return str(deal.id)


async def _select_as(
    *,
    auth_user_uuid: str = "",
    role: str = "client",
    business_line: str = "",
    staff_profile_uuid: str = "",
    platform_scope: str = "false",
) -> list[dict]:
    """Open a fresh connection, drop to api_user, set the RLS context, list rows."""
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
                    "set_config('app.staff_profile_uuid', :staff, true),"
                    "set_config('app.platform_scope', :ps, true)"
                ),
                {
                    "uuid": auth_user_uuid or str(uuid.uuid4()),
                    "role": role,
                    "bl": business_line,
                    "staff": staff_profile_uuid,
                    "ps": platform_scope,
                },
            )
            result = await conn.execute(text("SELECT id FROM property_deals"))
            keys = list(result.keys())
            rows = [dict(zip(keys, row, strict=True)) for row in result.fetchall()]
        return rows
    finally:
        await engine.dispose()


async def _seed_telecaller_staff_profile(business_line: str = "real_estate") -> str:
    import app.db.session as _session_mod
    from app.models.profile import ProfileScope, ProfileStatus, StaffProfile, StaffRole
    from app.models.user import User

    async with _session_mod.AsyncSessionLocal() as db:
        user = User(
            first_name="Test",
            last_name="Telecaller",
            mobile=unique_mobile(),
            email=f"tc_{uuid.uuid4().hex[:12]}@example.com",
            password_hash="x",
        )
        db.add(user)
        await db.flush()
        profile = StaffProfile(
            auth_user_uuid=user.id,
            role=StaffRole.TELECALLER,
            scope=ProfileScope.LINE,
            business_line=business_line,
            staff_code=f"TC-{uuid.uuid4().hex[:8]}",
            status=ProfileStatus.ACTIVE,
        )
        db.add(profile)
        await db.commit()
        return str(profile.id)


async def _assign_lead_for_deal(deal_id: str, staff_profile_uuid: str) -> None:
    import app.db.session as _session_mod
    from app.models.lead import Lead
    from app.models.property_deal import PropertyDeal

    async with _session_mod.AsyncSessionLocal() as db:
        deal = await db.get(PropertyDeal, uuid.UUID(deal_id))
        assert deal is not None
        lead = await db.get(Lead, deal.lead_uuid)
        assert lead is not None
        lead.assigned_telecaller_profile_uuid = uuid.UUID(staff_profile_uuid)
        await db.commit()


@pytest.mark.asyncio
async def test_both_line_client_sees_own_deal(client: AsyncClient) -> None:
    """The regression this predicate design avoids: a direct equality against
    the JWT's single client_profile_uuid claim would silently hide this,
    since _build_access_claims picks the loans profile for a both-line client."""
    _, mobile = await full_registration(client, lines=["loans", "real_estate"])
    uid = await _auth_user_uuid(mobile)
    deal_id = await _seed_deal(mobile)

    rows = await _select_as(auth_user_uuid=uid)
    assert [str(r["id"]) for r in rows] == [deal_id]


@pytest.mark.asyncio
async def test_other_client_cannot_see_it(client: AsyncClient) -> None:
    _, owner_mobile = await full_registration(client, lines=["real_estate"])
    await _seed_deal(owner_mobile)

    _, other_mobile = await full_registration(client, lines=["real_estate"])
    other_uid = await _auth_user_uuid(other_mobile)

    rows = await _select_as(auth_user_uuid=other_uid)
    assert rows == []


@pytest.mark.asyncio
async def test_real_estate_employee_can_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    deal_id = await _seed_deal(mobile)

    rows = await _select_as(role="employee", business_line="real_estate")
    assert deal_id in [str(r["id"]) for r in rows]


@pytest.mark.asyncio
async def test_real_estate_sub_admin_can_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    deal_id = await _seed_deal(mobile)

    rows = await _select_as(role="sub_admin", business_line="real_estate")
    assert deal_id in [str(r["id"]) for r in rows]


@pytest.mark.asyncio
async def test_assigned_telecaller_can_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    deal_id = await _seed_deal(mobile)
    staff_uuid = await _seed_telecaller_staff_profile("real_estate")
    await _assign_lead_for_deal(deal_id, staff_uuid)

    rows = await _select_as(
        role="telecaller", business_line="real_estate", staff_profile_uuid=staff_uuid
    )
    assert deal_id in [str(r["id"]) for r in rows]


@pytest.mark.asyncio
async def test_unassigned_telecaller_cannot_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    deal_id = await _seed_deal(mobile)
    other_staff_uuid = await _seed_telecaller_staff_profile("real_estate")

    rows = await _select_as(
        role="telecaller", business_line="real_estate", staff_profile_uuid=other_staff_uuid
    )
    assert deal_id not in [str(r["id"]) for r in rows]


@pytest.mark.asyncio
async def test_loans_only_staff_cannot_see_it(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    await _seed_deal(mobile)

    rows = await _select_as(role="telecaller", business_line="loans")
    assert rows == []


@pytest.mark.asyncio
async def test_admin_platform_scope_sees_all(client: AsyncClient) -> None:
    _, mobile = await full_registration(client, lines=["real_estate"])
    deal_id = await _seed_deal(mobile)

    rows = await _select_as(role="admin", platform_scope="true")
    assert deal_id in [str(r["id"]) for r in rows]


@pytest.mark.asyncio
async def test_sub_admin_platform_scope_cross_line_cannot_see_it(client: AsyncClient) -> None:
    """a0b1c2d3e4f5: the platform_scope bypass is admin-only now. Uses a
    cross-line business_line so the pre-existing line-scoped sub_admin branch
    cannot mask a bypass regression."""
    _, mobile = await full_registration(client, lines=["real_estate"])
    deal_id = await _seed_deal(mobile)

    rows = await _select_as(role="sub_admin", business_line="loans", platform_scope="true")
    assert deal_id not in [str(r["id"]) for r in rows]
