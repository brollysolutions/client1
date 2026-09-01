"""Structural invariant — the platform_scope RLS bypass must require admin.

Migration a0b1c2d3e4f5 closed the audit e8f9a0b1c2d3 deferred: every policy
that treats `platform_scope='true'` as a bypass must also check `app.role`,
except for the documented Sub Admin exceptions. This introspects
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
# it also catches owner/line-scoped Sub Admin branches that share a policy
# with an independent platform-Admin disjunct. Any new entry here must be a
# deliberate, reviewed policy change.
_DOCUMENTED_SUB_ADMIN_EXCEPTIONS = {
    # Live: sub_admin actually reads through the platform_scope branch itself.
    ("transactions", "transactions_rls"),
    ("payouts", "payouts_rls"),
    ("properties", "properties_rls"),
    # Dead-but-retained (a0b1c2d3e4f5 §Risks): pre-existing line-scoped
    # Owner/line-scoped branches never match a platform Sub Admin
    # (business_line claim is always "") but are DB-legal and tested.
    ("client_profiles", "client_profiles_rls"),
    ("agent_profiles", "agent_profiles_rls"),
    ("leads", "leads_select"),
    ("leads", "leads_update"),
    ("financial_service_enquiries", "financial_service_enquiries_rls"),
    ("loan_applications", "loan_applications_rls"),
    ("loan_documents", "loan_documents_select"),
    ("property_submissions", "property_submissions_select"),
    ("property_submissions", "property_submissions_insert"),
    ("property_submission_media", "property_submission_media_select"),
    ("property_submission_media", "property_submission_media_insert"),
    ("property_deals", "property_deals_rls"),
    ("site_visits", "site_visits_rls"),
    ("enquiries", "enquiries_rls"),
    ("offers", "offers_update"),
    ("content_blocks", "content_blocks_insert"),
    ("content_blocks", "content_blocks_update"),
    ("referral_bonus_config", "referral_bonus_config_insert"),
    ("referral_bonus_config", "referral_bonus_config_update"),
    ("referral_bonus_config", "referral_bonus_config_delete"),
}

# Every current policy carrying a platform_scope branch. The original
# task_documents_rls was split per command by c8d9e0f1a2b3, and
# f5a6b7c8d9e0 added the loan-document policies later; keep this ledger aligned
# with those additive migrations rather than the earlier policy names.
_ALL_PLATFORM_SCOPE_POLICIES = {
    ("auth_users", "auth_users_rls"),
    ("audit_log", "audit_log_select"),
    ("agent_applications", "agent_applications_rls"),
    ("auth_events", "auth_events_rls"),
    ("refresh_tokens", "refresh_tokens_rls"),
    ("bookmarks", "bookmarks_rls"),
    ("notifications", "notifications_rls"),
    ("support_tickets", "support_tickets_rls"),
    ("mobile_change_requests", "mobile_change_requests_select"),
    ("enquiries", "enquiries_rls"),
    ("site_visits", "site_visits_rls"),
    ("lead_activities", "lead_activities_rls"),
    ("tasks", "tasks_rls"),
    ("task_documents", "task_documents_select"),
    ("task_documents", "task_documents_insert"),
    ("task_documents", "task_documents_delete"),
    ("task_documents", "task_documents_update"),
    ("task_feedback_media", "task_feedback_media_select"),
    ("loan_documents", "loan_documents_select"),
    ("loan_documents", "loan_documents_update"),
    ("financial_service_enquiries", "financial_service_enquiries_rls"),
    ("loan_applications", "loan_applications_rls"),
    ("loan_txn_history", "loan_txn_history_rls"),
    ("property_deals", "property_deals_rls"),
    ("client_profiles", "client_profiles_rls"),
    ("agent_profiles", "agent_profiles_rls"),
    ("staff_profiles", "staff_profiles_rls"),
    ("leads", "leads_select"),
    ("leads", "leads_update"),
    ("leads", "leads_insert"),
    ("leads", "leads_delete"),
    ("properties", "properties_rls"),
    ("properties", "properties_admin_update"),
    ("property_submissions", "property_submissions_select"),
    ("property_submissions", "property_submissions_insert"),
    ("property_submission_media", "property_submission_media_select"),
    ("property_submission_media", "property_submission_media_insert"),
    ("property_media", "property_media_select"),
    ("payouts", "payouts_rls"),
    ("transactions", "transactions_rls"),
    # 9f8e7d6c5b4a — admin-only bypass, no sub_admin branch (FR-9.5), so these
    # are NOT in _DOCUMENTED_SUB_ADMIN_EXCEPTIONS above.
    ("referral_codes", "referral_codes_rls"),
    ("referrals", "referrals_rls"),
    ("banks", "banks_insert"),
    ("banks", "banks_update"),
    ("banks", "banks_delete"),
    ("loan_types", "loan_types_insert"),
    ("loan_types", "loan_types_update"),
    ("bank_loan_type_availability", "bank_loan_type_availability_insert"),
    ("bank_loan_type_availability", "bank_loan_type_availability_update"),
    ("financial_product_provider_offers", "provider_offers_select"),
    ("financial_product_provider_offers", "provider_offers_insert"),
    ("financial_product_provider_offers", "provider_offers_update"),
    ("staff_invite_links", "staff_invite_links_select"),
    ("staff_invite_links", "staff_invite_links_insert"),
    ("staff_invite_links", "staff_invite_links_update"),
    ("agent_invite_links", "agent_invite_links_select"),
    ("agent_invite_links", "agent_invite_links_insert"),
    ("agent_invite_links", "agent_invite_links_update"),
    ("commissions", "commissions_select"),
    ("commissions", "commissions_insert"),
    ("commissions", "commissions_update"),
    ("fee_cashbacks", "fee_cashbacks_select"),
    ("fee_cashbacks", "fee_cashbacks_insert"),
    ("fee_cashbacks", "fee_cashbacks_update"),
    ("field_visibility_config", "field_visibility_config_select"),
    ("field_visibility_config", "field_visibility_config_insert"),
    ("field_visibility_config", "field_visibility_config_update"),
    ("contact_share_links", "contact_share_links_select"),
    ("contact_share_links", "contact_share_links_update"),
    ("vehicle_arrangements", "vehicle_arrangements_select"),
    ("vehicle_arrangements", "vehicle_arrangements_insert"),
    ("vehicle_arrangements", "vehicle_arrangements_update"),
    ("offers", "offers_update"),
    ("content_blocks", "content_blocks_insert"),
    ("content_blocks", "content_blocks_update"),
    ("referral_bonus_config", "referral_bonus_config_insert"),
    ("referral_bonus_config", "referral_bonus_config_update"),
    ("referral_bonus_config", "referral_bonus_config_delete"),
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
    exactly the documented exceptions — any new one is a deliberate,
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
    """Keep the platform-scope policy ledger exhaustive in both directions."""
    policies = await _fetch_policies()
    actual = {
        (p["tablename"], p["policyname"])
        for p in policies
        if _mentions_platform_scope(p["qual"]) or _mentions_platform_scope(p["with_check"])
    }
    assert actual == _ALL_PLATFORM_SCOPE_POLICIES


async def test_provider_offer_select_policy_keeps_drafts_admin_only() -> None:
    policies = await _fetch_policies()
    policy = next(
        item
        for item in policies
        if item["tablename"] == "financial_product_provider_offers"
        and item["policyname"] == "provider_offers_select"
    )
    predicate = policy["qual"] or ""
    assert "published" in predicate
    assert "app.platform_scope" in predicate
    assert "app.role" in predicate
