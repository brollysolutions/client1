"""Schema-wide RLS coverage: no table ships without row-level security.

The per-feature `*_rls.py` suites prove that the policies which exist are
*correct*. They cannot prove that a policy exists at all for a table nobody
wrote a suite for — that gap is invisible until someone reads a lead from the
wrong business line in production.

This file inverts the direction: it enumerates `pg_class` and asserts every
table is accounted for, so a migration that adds a table without
`ENABLE ROW LEVEL SECURITY` fails the build instead of waiting for review
attention. Exemptions live in the two allowlists below and are reviewable diff
lines.

Requires the Docker stack with migrations applied (same contract as the other
integration suites); fails rather than skips under CI, matching conftest's
`live_app` policy after the incident where the RLS suites silently never ran.
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy import text

# Tables that legitimately carry no RLS. Keep this list near-empty and justified.
RLS_EXEMPT: dict[str, str] = {
    "alembic_version": (
        "Migration bookkeeping. No business data, written only by Alembic as the owner."
    ),
}

# Tables with RLS enabled and ZERO policies. In Postgres that is deny-all for any
# non-owner, non-BYPASSRLS role — a deliberate fail-closed choice, not an
# oversight. Declared explicitly so that a table which was *supposed* to get
# policies (and is therefore silently unreadable by the API) shows up as a failure
# rather than looking identical to an intentional lockout.
_CURSOR_REASON = (
    "Internal scheduler cursor. Written by the app role only; no api_user access intended."
)

DENY_ALL_TABLES: dict[str, str] = {
    "employee_assignment_cursors": _CURSOR_REASON,
    "lead_assignment_cursors": _CURSOR_REASON,
}

# Vacuous-pass guard: if the catalog query returns nothing (wrong database, empty
# schema, migrations not applied) every assertion below would trivially hold.
MIN_EXPECTED_TABLES = 40

_TABLE_QUERY = text(
    """
    SELECT c.relname AS table_name,
           c.relrowsecurity AS rls_enabled,
           count(p.polname) AS policy_count
    FROM pg_class c
    LEFT JOIN pg_policy p ON p.polrelid = c.oid
    WHERE c.relkind = 'r'
      AND c.relnamespace = 'public'::regnamespace
    GROUP BY c.relname, c.relrowsecurity
    """
)

_RUNTIME_ROLE_QUERY = text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'api_user'")


async def _fetch_tables() -> list[tuple[str, bool, int]]:
    """Return (name, rls_enabled, policy_count) for every public table."""
    import app.db.session as session_mod

    try:
        async with session_mod.AsyncSessionLocal() as db:
            rows = (await db.execute(_TABLE_QUERY)).fetchall()
    except Exception as exc:  # pragma: no cover - environment-dependent branch
        if os.environ.get("CI"):
            pytest.fail(
                f"Postgres unreachable under CI — RLS coverage must run, not skip: {exc}",
                pytrace=False,
            )
        pytest.skip(f"Postgres not reachable — start the Docker stack ({exc})")
    return [(row.table_name, row.rls_enabled, row.policy_count) for row in rows]


async def test_table_enumeration_is_not_vacuous() -> None:
    tables = await _fetch_tables()
    assert len(tables) >= MIN_EXPECTED_TABLES, (
        f"Only {len(tables)} public tables found (expected >= {MIN_EXPECTED_TABLES}). "
        "The suite is pointed at an empty or unmigrated database, so every RLS "
        "assertion here is passing vacuously."
    )


async def test_every_table_has_rls_enabled() -> None:
    tables = await _fetch_tables()
    missing = sorted(name for name, enabled, _ in tables if not enabled and name not in RLS_EXEMPT)
    assert not missing, (
        "These tables have no row-level security, so any role holding a table "
        "grant reads and writes every row across both business lines:\n  "
        + "\n  ".join(missing)
        + "\n\nAdd `ALTER TABLE <t> ENABLE ROW LEVEL SECURITY` plus policies in the "
        "migration, or record the table in RLS_EXEMPT with the reason it holds no "
        "business data."
    )


async def test_zero_policy_tables_are_declared_deny_all() -> None:
    tables = await _fetch_tables()
    undeclared = sorted(
        name
        for name, enabled, policies in tables
        if enabled and policies == 0 and name not in DENY_ALL_TABLES
    )
    assert not undeclared, (
        "These tables enable RLS but define no policy, which denies ALL access to "
        "api_user — if the API is meant to read them, the feature is broken:\n  "
        + "\n  ".join(undeclared)
        + "\n\nAdd the intended policies, or declare the lockout in DENY_ALL_TABLES."
    )


async def test_allowlists_have_no_stale_entries() -> None:
    tables = await _fetch_tables()
    existing = {name for name, _, _ in tables}
    zero_policy = {name for name, enabled, policies in tables if enabled and policies == 0}
    no_rls = {name for name, enabled, _ in tables if not enabled}

    stale_exempt = sorted(set(RLS_EXEMPT) - no_rls)
    stale_deny = sorted(set(DENY_ALL_TABLES) - zero_policy)
    dropped = sorted((set(RLS_EXEMPT) | set(DENY_ALL_TABLES)) - existing)

    assert not stale_exempt, (
        "RLS_EXEMPT lists tables that now have RLS enabled. Remove them so a future "
        f"regression on these tables is caught: {stale_exempt}"
    )
    assert not stale_deny, (
        "DENY_ALL_TABLES lists tables that now have policies. Remove them so the "
        f"deny-all claim stays meaningful: {stale_deny}"
    )
    assert not dropped, f"Allowlists reference tables that no longer exist: {dropped}"


async def test_runtime_role_cannot_bypass_rls() -> None:
    """The whole model rests on api_user being an ordinary role.

    Requests run as the `app` SUPERUSER until a route drops to api_user via
    SET LOCAL ROLE. If api_user ever gained SUPERUSER or BYPASSRLS, every policy
    in the database would become decorative and every *_rls.py suite would still
    pass, because they assert on results rather than on the role's privileges.
    """
    import app.db.session as session_mod

    try:
        async with session_mod.AsyncSessionLocal() as db:
            row = (await db.execute(_RUNTIME_ROLE_QUERY)).fetchone()
    except Exception as exc:  # pragma: no cover - environment-dependent branch
        if os.environ.get("CI"):
            pytest.fail(f"Postgres unreachable under CI: {exc}", pytrace=False)
        pytest.skip(f"Postgres not reachable — start the Docker stack ({exc})")

    assert row is not None, "Role 'api_user' is missing; RLS enforcement cannot work."
    assert not row.rolsuper, "api_user is SUPERUSER — it bypasses every RLS policy."
    assert not row.rolbypassrls, "api_user has BYPASSRLS — every RLS policy is inert."
