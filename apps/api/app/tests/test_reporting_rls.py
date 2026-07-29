"""Admin analytics & reporting — proves the slice adds no new RLS bypass
(FR-16.1-16.3, feature-status.md §3 #2).

services/reporting.py runs its aggregate SELECTs on the request-scoped `db`
session -- the same session that already carries the caller's RLS context
(SET LOCAL ROLE api_user + the 7 GUCs, core/deps.py). It never imports
AsyncSessionLocal. This file proves that property directly against `leads`
only: the exact raw aggregate a non-admin session would issue is still
scoped by leads_rls, and only an admin (platform_scope='true' AND
role='admin') sees rows across both lines. `loan_applications_rls` and
`property_deals_rls` are structurally the same predicate shape (same
platform_scope/business_line branches) and are separately exercised by
test_loans_rls.py / test_property_deals_rls.py -- this file does not
re-prove them, only leads_rls.

Same harness as test_loan_config_rls.py: own NullPool engine, manual
SET LOCAL ROLE + set_config per connection, seeded via the app bypass
session. Requires the Docker stack with migrations applied.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from conftest import unique_mobile


def _engine():
    raw_url = settings.DATABASE_URL.replace("pgbouncer:5432", "postgres:5432")
    return create_async_engine(
        raw_url,
        poolclass=NullPool,
        connect_args={
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4()}__",
        },
    )


async def _set_ctx(conn, **ctx) -> None:
    await conn.execute(text("SET LOCAL ROLE api_user"))
    defaults = {
        "auth_user_uuid": str(uuid.uuid4()),
        "role": "client",
        "business_line": "",
        "client_profile_uuid": "",
        "agent_profile_uuid": "",
        "staff_profile_uuid": "",
        "platform_scope": "false",
    }
    defaults.update(ctx)
    await conn.execute(
        text(
            "SELECT "
            "set_config('app.auth_user_uuid', :auth_user_uuid, true),"
            "set_config('app.role', :role, true),"
            "set_config('app.business_line', :business_line, true),"
            "set_config('app.client_profile_uuid', :client_profile_uuid, true),"
            "set_config('app.agent_profile_uuid', :agent_profile_uuid, true),"
            "set_config('app.staff_profile_uuid', :staff_profile_uuid, true),"
            "set_config('app.platform_scope', :platform_scope, true)"
        ),
        defaults,
    )


_WINDOW_BASE = datetime(2035, 1, 1, tzinfo=UTC)


def _unique_window() -> tuple[datetime, datetime, datetime]:
    """A one-day window on a randomly-picked day within ~27 years of
    _WINDOW_BASE, unique per test invocation (not per test file). Fixed
    hardcoded dates accumulate rows across repeated pytest runs against this
    shared, never-truncated Postgres (the tests never clean up after
    themselves, matching every other test file's convention) -- a rerun
    would otherwise see 1 + however-many-times-this-file-has-run rows in the
    same window and an exact-count assertion would flake. Picking a fresh
    random day every run keeps each run's window empty before it seeds."""
    offset_days = uuid.uuid4().int % 10_000
    day_start = _WINDOW_BASE + timedelta(days=offset_days)
    return day_start, day_start - timedelta(hours=1), day_start + timedelta(hours=1)


async def _seed_two_line_leads(created_at: datetime) -> tuple[str, str]:
    """Insert one loans lead and one real_estate lead via the app superuser
    (bypasses RLS), both at the SAME timestamp so a line-blind aggregate
    would report total=2 and a correctly-scoped one total=1."""
    import app.db.session as _session_mod
    from app.models.lead import Lead, LeadOrigin

    async with _session_mod.AsyncSessionLocal() as db:
        loans_lead = Lead(
            name="RLS Loans Lead",
            mobile=unique_mobile(),
            business_line="loans",
            origin=LeadOrigin.DIRECT,
            created_at=created_at,
        )
        re_lead = Lead(
            name="RLS RE Lead",
            mobile=unique_mobile(),
            business_line="real_estate",
            origin=LeadOrigin.DIRECT,
            created_at=created_at,
        )
        db.add_all([loans_lead, re_lead])
        await db.commit()
        return str(loans_lead.id), str(re_lead.id)


_COUNT_SQL = text("SELECT count(*) FROM leads WHERE created_at >= :start AND created_at < :end")


@pytest.mark.asyncio
async def test_employee_session_sees_only_own_line(client: AsyncClient) -> None:
    """Employee, not telecaller: leads_rls narrows the telecaller branch to
    assigned-lead-only (e6c7b8f9a0d1), so an unassigned seeded lead would
    read as zero rows for a telecaller regardless of line and prove nothing
    about line-scoping. Employee keeps whole-line access, which is what this
    test is actually pinning down."""
    created_at, start, end = _unique_window()
    await _seed_two_line_leads(created_at)
    bounds = {"start": start, "end": end}

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_ctx(conn, role="employee", business_line="loans")
            count = (await conn.execute(_COUNT_SQL, bounds)).scalar_one()
            assert count == 1, "a line-scoped employee session saw the other line's lead"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_line_scoped_sub_admin_sees_only_own_line(client: AsyncClient) -> None:
    """Sub Admin is platform_scope='true' by default in most of this codebase,
    but a LINE sub_admin (business_line set, not platform) exists too --
    proves the same aggregate respects that narrower scope."""
    created_at, start, end = _unique_window()
    await _seed_two_line_leads(created_at)
    bounds = {"start": start, "end": end}

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_ctx(
                conn, role="sub_admin", business_line="real_estate", platform_scope="false"
            )
            count = (await conn.execute(_COUNT_SQL, bounds)).scalar_one()
            assert count == 1
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_platform_admin_session_sees_both_lines(client: AsyncClient) -> None:
    created_at, start, end = _unique_window()
    await _seed_two_line_leads(created_at)
    bounds = {"start": start, "end": end}

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_ctx(conn, role="admin", platform_scope="true")
            count = (await conn.execute(_COUNT_SQL, bounds)).scalar_one()
            assert count == 2, "platform admin bypass did not see both lines"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_line_scoped_admin_role_string_still_scoped_by_rls(client: AsyncClient) -> None:
    """Belt-and-suspenders below the app-layer guard: even if role='admin'
    somehow reached a raw query with platform_scope='false' (the app-layer
    _require_admin in api/v1/reporting.py is what actually prevents this),
    the RLS policy itself still would not grant a cross-line bypass -- the
    admin_all predicate requires platform_scope='true' too."""
    created_at, start, end = _unique_window()
    await _seed_two_line_leads(created_at)
    bounds = {"start": start, "end": end}

    engine = _engine()
    try:
        async with engine.begin() as conn:
            await _set_ctx(conn, role="admin", business_line="loans", platform_scope="false")
            count = (await conn.execute(_COUNT_SQL, bounds)).scalar_one()
            assert count == 0, (
                "a role='admin' session without platform_scope='true' saw rows via RLS -- "
                "the admin bypass predicate regressed to role-only"
            )
    finally:
        await engine.dispose()
