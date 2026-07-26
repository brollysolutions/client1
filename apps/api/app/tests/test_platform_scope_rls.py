"""Structural invariant — the platform_scope RLS bypass must require admin.

Migration a0b1c2d3e4f5 closed the audit e8f9a0b1c2d3 deferred: every policy
that treats `platform_scope='true'` as a bypass must also check `app.role`,
except for the four documented Sub Admin exceptions. This introspects
pg_policies directly (no seeding, no api_user context) so it fails the moment
any future migration reintroduces the bare copy-paste bypass on a new table.

Requires the Docker stack with migrations applied; auto-skips without Redis
(via the shared `client` fixture import).
"""

from __future__ import annotations

from sqlalchemy import text

import app.db.session as _session_mod

# Policies whose predicate mentions BOTH app.platform_scope and 'sub_admin'
# somewhere in the same USING/WITH CHECK string — a coarse substring check, so
# it also catches the seven line-scoped `role IN (..., 'sub_admin')'
# sub-branches that share a predicate with an (unrelated) platform_scope
# disjunct. Any new entry here must be a deliberate, reviewed widening.
_DOCUMENTED_SUB_ADMIN_EXCEPTIONS = {
    # Live: sub_admin actually reads through the platform_scope branch itself.
    ("transactions", "transactions_rls"),
    ("payouts", "payouts_rls"),
    ("properties", "properties_rls"),
    ("property_submissions", "property_submissions_select"),
    # Dead-but-retained (a0b1c2d3e4f5 §Risks): pre-existing line-scoped
    # `role IN (..., 'sub_admin')` branches that never match a platform
    # sub_admin (business_line claim is always ""), kept because a
    # line-scoped sub_admin is DB-legal and covered by existing tests.
    ("client_profiles", "client_profiles_rls"),
    ("agent_profiles", "agent_profiles_rls"),
    ("leads", "leads_rls"),
    ("loan_applications", "loan_applications_rls"),
    ("property_deals", "property_deals_rls"),
    ("site_visits", "site_visits_rls"),
    ("enquiries", "enquiries_rls"),
}

# All 23 policies that ever carried (or still carry) a platform_scope branch —
# the 22 narrowed by a0b1c2d3e4f5 plus transactions_rls (narrowed by e8f9a0b1c2d3).
_ALL_PLATFORM_SCOPE_POLICIES = {
    ("auth_users", "auth_users_rls"),
    ("agent_applications", "agent_applications_rls"),
    ("auth_events", "auth_events_rls"),
    ("refresh_tokens", "refresh_tokens_rls"),
    ("bookmarks", "bookmarks_rls"),
    ("notifications", "notifications_rls"),
    ("support_tickets", "support_tickets_rls"),
    ("enquiries", "enquiries_rls"),
    ("site_visits", "site_visits_rls"),
    ("lead_activities", "lead_activities_rls"),
    ("tasks", "tasks_rls"),
    ("task_documents", "task_documents_rls"),
    ("loan_applications", "loan_applications_rls"),
    ("loan_txn_history", "loan_txn_history_rls"),
    ("property_deals", "property_deals_rls"),
    ("client_profiles", "client_profiles_rls"),
    ("agent_profiles", "agent_profiles_rls"),
    ("staff_profiles", "staff_profiles_rls"),
    ("leads", "leads_rls"),
    ("properties", "properties_rls"),
    ("property_submissions", "property_submissions_select"),
    ("payouts", "payouts_rls"),
    ("transactions", "transactions_rls"),
}


async def _fetch_policies() -> list[dict]:
    async with _session_mod.AsyncSessionLocal() as db:
        result = await db.execute(
            text(
                "SELECT tablename, policyname, qual, with_check "
                "FROM pg_policies WHERE schemaname = 'public'"
            )
        )
        keys = list(result.keys())
        return [dict(zip(keys, row, strict=True)) for row in result.fetchall()]


def _mentions_platform_scope(predicate: str | None) -> bool:
    return predicate is not None and "app.platform_scope" in predicate


def _mentions_role_check(predicate: str | None) -> bool:
    return predicate is not None and "app.role" in predicate


def _mentions_sub_admin(predicate: str | None) -> bool:
    return predicate is not None and "sub_admin" in predicate


async def test_no_policy_grants_bare_platform_scope_bypass() -> None:
    """Every predicate mentioning app.platform_scope must also check app.role —
    a bare `platform_scope = 'true'` disjunct with no role check is a full
    bypass for every platform-scoped role, not just admin.

    Substring co-occurrence, not causal coupling: this cannot distinguish a
    real `(platform_scope AND role=...)` disjunct from platform_scope and an
    unrelated app.role mention elsewhere in the same predicate — true for
    every policy in this DB today, but a future predicate shaped like
    `platform_scope='true' OR (app.role='x' AND ...)` would slip past it."""
    policies = await _fetch_policies()
    offenders = [
        f"{p['tablename']}.{p['policyname']}"
        for p in policies
        if (_mentions_platform_scope(p["qual"]) and not _mentions_role_check(p["qual"]))
        or (_mentions_platform_scope(p["with_check"]) and not _mentions_role_check(p["with_check"]))
    ]
    assert offenders == [], f"bare platform_scope bypass on: {offenders}"


async def test_sub_admin_platform_exceptions_are_the_documented_allowlist() -> None:
    """The set of policies granting sub_admin a platform_scope branch must be
    exactly the four documented exceptions — any new one is a deliberate,
    reviewed widening, not an accident."""
    policies = await _fetch_policies()
    actual = {
        (p["tablename"], p["policyname"])
        for p in policies
        if (_mentions_platform_scope(p["qual"]) and _mentions_sub_admin(p["qual"]))
        or (_mentions_platform_scope(p["with_check"]) and _mentions_sub_admin(p["with_check"]))
    }
    assert actual == _DOCUMENTED_SUB_ADMIN_EXCEPTIONS


async def test_all_platform_scope_policies_still_exist() -> None:
    """Guards a DROP POLICY that never got its matching CREATE."""
    policies = await _fetch_policies()
    existing = {(p["tablename"], p["policyname"]) for p in policies}
    missing = _ALL_PLATFORM_SCOPE_POLICIES - existing
    assert missing == set(), f"expected platform_scope policies missing: {missing}"
