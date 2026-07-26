"""rls: scope the platform_scope bypass to admin across the remaining 22 policies

Revision ID: a0b1c2d3e4f5
Revises: f9a0b1c2d3e4
Create Date: 2026-07-25 00:00:00.000000

NOTE: Run directly against postgres:5432, NOT through pgBouncer (RLS policy
change requires a direct connection — ADR-0004).

`services.admin.create_staff` gives every sub_admin `ProfileScope.PLATFORM`
(scope = ProfileScope.PLATFORM if role == StaffRole.SUB_ADMIN else LINE), which
`services.auth_service._build_access_claims` turns into the JWT claim
`app.platform_scope = "true"`. Every policy that still treats bare
`platform_scope = 'true'` as a full bypass therefore grants a Sub Admin the
same blanket access as Admin — undocumented and unintended on every one of
these 22 tables (some already reachable over HTTP today via `get_active_user`,
which performs no role check, plus an unfiltered `select()`).

`e8f9a0b1c2d3` fixed exactly one table this way (`transactions`) and deferred
"roughly 14 other tables … tracked separately" to a follow-up audit. This
migration is that audit, covering every remaining bare-bypass policy.

Transform: replace the bare `current_setting('app.platform_scope', true) =
'true'` disjunct with `(platform_scope = 'true' AND role = 'admin')`,
leaving every other character of each predicate byte-identical. Three
policies additionally gain a narrow `(platform_scope = 'true' AND role =
'sub_admin')` disjunct, restoring exactly the access Sub Admin needs for
shipped flows that would otherwise break:

  - `property_submissions_select` — the Sub Admin property-review queue
    (`/dashboard/property-review`). The table's pre-existing sub_admin branch
    (`role = 'sub_admin' AND business_line = app.business_line`) never
    matches for a platform sub_admin, whose `business_line` claim is `""`
    (`services/admin.py` sets `business_line=None` for PLATFORM scope) — kept
    verbatim below, this is a pure addition. Not a real widening: every row
    in this table is real_estate by construction
    (`api/v1/property_submissions.py` hardcodes it; the INSERT policy's
    WITH CHECK enforces it), so there is no other business_line to leak.
  - `payouts_rls` — Sub Admin is the maker in the payouts maker-checker flow
    (`api/v1/payments.py::_require_platform_admin` already admits
    admin+sub_admin for list/create/reject; only approve is admin-only).
    Behaviourally a no-op today (only admin/sub_admin can ever hold platform
    scope — `ck_staff_profiles_platform_scope_admin_only`), but removes the
    last bare bypass and pins the maker-checker intent into the policy
    itself instead of only the app-layer guard.
  - `properties_rls` — Sub Admin keeps visibility of inactive listings,
    matching Admin's existing reach into the catalog.

Seven pre-existing line-scoped `role IN (..., 'sub_admin')` sub-branches
(`leads_rls`, `loan_applications_rls`, `property_deals_rls`,
`client_profiles_rls`, `agent_profiles_rls`, `site_visits_rls`,
`enquiries_rls`) are left UNCHANGED. They are dead for a platform sub_admin
today (same business_line="" reason as above) but are exercised by existing
tests under `platform_scope="false"`, and a line-scoped sub_admin is a
DB-legal state the app already models elsewhere (`payments.py`,
`core/deps.py::require_re_reviewer`) even though `create_staff` never
produces one today. Deleting them is a separate, deliberate change — not
folded into this security fix.

A post-upgrade guard asserts no policy is left with a bare
`platform_scope` disjunct lacking an `app.role` check, so a missed table
fails the migration instead of shipping a silent hole.

Rollback: restores every predicate listed in `_POLICIES` to its
`using_old`/`check_old` text, exactly as currently live.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "a0b1c2d3e4f5"
down_revision: str | Sequence[str] | None = "f9a0b1c2d3e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SCOPE_OLD = "current_setting('app.platform_scope', true) = 'true'"
_SCOPE_ADMIN = (
    "(current_setting('app.platform_scope', true) = 'true'\n"
    "     AND current_setting('app.role', true) = 'admin')"
)
_SCOPE_SUB_ADMIN = (
    "(current_setting('app.platform_scope', true) = 'true'\n"
    "     AND current_setting('app.role', true) = 'sub_admin')"
)

# (table, policy, cmd, using_tmpl, check_tmpl)
# Each *_tmpl contains the OLD bare bypass string ({_SCOPE_OLD}) exactly once
# (or, for the three Group-3 exceptions, an already-widened placeholder — see
# _GROUP3_EXTRA below); check_tmpl is None for SELECT-only policies.
_POLICIES: list[tuple[str, str, str, str, str | None]] = [
    # --- Group 1: FOR ALL, USING == WITH CHECK, admin-only tail unchanged ---
    (
        "auth_users",
        "auth_users_rls",
        "ALL",
        """
    {scope}
    OR id::text = current_setting('app.auth_user_uuid', true)
""",
        """
    {scope}
    OR id::text = current_setting('app.auth_user_uuid', true)
""",
    ),
    (
        "agent_applications",
        "agent_applications_rls",
        "ALL",
        """
    {scope}
    OR (
        applicant_auth_user_uuid IS NOT NULL
        AND applicant_auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
    )
""",
        """
    {scope}
    OR (
        applicant_auth_user_uuid IS NOT NULL
        AND applicant_auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
    )
""",
    ),
    (
        "auth_events",
        "auth_events_rls",
        "ALL",
        """
    {scope}
    OR (
        auth_user_uuid IS NOT NULL
        AND auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
    )
""",
        """
    {scope}
    OR (
        auth_user_uuid IS NOT NULL
        AND auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
    )
""",
    ),
    (
        "refresh_tokens",
        "refresh_tokens_rls",
        "ALL",
        """
    {scope}
    OR auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
""",
        """
    {scope}
    OR auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
""",
    ),
    (
        "bookmarks",
        "bookmarks_rls",
        "ALL",
        """
    {scope}
    OR user_uuid::text = current_setting('app.auth_user_uuid', true)
""",
        """
    {scope}
    OR user_uuid::text = current_setting('app.auth_user_uuid', true)
""",
    ),
    (
        "notifications",
        "notifications_rls",
        "ALL",
        """
    {scope}
    OR user_uuid::text = current_setting('app.auth_user_uuid', true)
""",
        """
    {scope}
    OR user_uuid::text = current_setting('app.auth_user_uuid', true)
""",
    ),
    (
        "support_tickets",
        "support_tickets_rls",
        "ALL",
        """
    {scope}
    OR auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
""",
        """
    {scope}
    OR auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
""",
    ),
    (
        "enquiries",
        "enquiries_rls",
        "ALL",
        """
    {scope}
    OR user_uuid::text = current_setting('app.auth_user_uuid', true)
    OR (
        business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) IN ('telecaller', 'employee', 'sub_admin', 'agent')
    )
""",
        """
    {scope}
    OR user_uuid::text = current_setting('app.auth_user_uuid', true)
    OR (
        business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) IN ('telecaller', 'employee', 'sub_admin', 'agent')
    )
""",
    ),
    (
        "site_visits",
        "site_visits_rls",
        "ALL",
        """
    {scope}
    OR user_uuid::text = current_setting('app.auth_user_uuid', true)
    OR (
        business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) IN ('telecaller', 'employee', 'sub_admin', 'agent')
    )
""",
        """
    {scope}
    OR user_uuid::text = current_setting('app.auth_user_uuid', true)
    OR (
        business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) IN ('telecaller', 'employee', 'sub_admin', 'agent')
    )
""",
    ),
    (
        "lead_activities",
        "lead_activities_rls",
        "ALL",
        """
    {scope}
    OR (
        current_setting('app.staff_profile_uuid', true) <> ''
        AND telecaller_staff_profile_uuid::text = current_setting('app.staff_profile_uuid', true)
    )
""",
        """
    {scope}
    OR (
        current_setting('app.staff_profile_uuid', true) <> ''
        AND telecaller_staff_profile_uuid::text = current_setting('app.staff_profile_uuid', true)
    )
""",
    ),
    (
        "tasks",
        "tasks_rls",
        "ALL",
        """
    {scope}
    OR (
        current_setting('app.staff_profile_uuid', true) <> ''
        AND current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND (
            raised_by_staff_profile_uuid::text = current_setting('app.staff_profile_uuid', true)
            OR (
                assigned_employee_profile_uuid IS NOT NULL
                AND assigned_employee_profile_uuid::text
                    = current_setting('app.staff_profile_uuid', true)
            )
        )
    )
""",
        """
    {scope}
    OR (
        current_setting('app.staff_profile_uuid', true) <> ''
        AND current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND (
            raised_by_staff_profile_uuid::text = current_setting('app.staff_profile_uuid', true)
            OR (
                assigned_employee_profile_uuid IS NOT NULL
                AND assigned_employee_profile_uuid::text
                    = current_setting('app.staff_profile_uuid', true)
            )
        )
    )
""",
    ),
    (
        "task_documents",
        "task_documents_rls",
        "ALL",
        """
    {scope}
    OR EXISTS (
        SELECT 1 FROM tasks t
        WHERE t.id = task_documents.task_uuid
        AND current_setting('app.staff_profile_uuid', true) <> ''
        AND t.business_line::text = current_setting('app.business_line', true)
        AND t.assigned_employee_profile_uuid IS NOT NULL
        AND t.assigned_employee_profile_uuid::text
            = current_setting('app.staff_profile_uuid', true)
    )
""",
        """
    {scope}
    OR EXISTS (
        SELECT 1 FROM tasks t
        WHERE t.id = task_documents.task_uuid
        AND current_setting('app.staff_profile_uuid', true) <> ''
        AND t.business_line::text = current_setting('app.business_line', true)
        AND t.assigned_employee_profile_uuid IS NOT NULL
        AND t.assigned_employee_profile_uuid::text
            = current_setting('app.staff_profile_uuid', true)
    )
""",
    ),
    (
        "loan_applications",
        "loan_applications_rls",
        "ALL",
        """
    {scope}
    OR client_profile_uuid::text = current_setting('app.client_profile_uuid', true)
    OR (
        business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) IN ('employee', 'sub_admin')
    )
    OR (
        current_setting('app.staff_profile_uuid', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) = 'telecaller'
        AND EXISTS (
            SELECT 1 FROM leads l
            WHERE l.id = loan_applications.lead_uuid
              AND l.assigned_telecaller_profile_uuid IS NOT NULL
              AND l.assigned_telecaller_profile_uuid::text
                  = current_setting('app.staff_profile_uuid', true)
        )
    )
""",
        """
    {scope}
    OR client_profile_uuid::text = current_setting('app.client_profile_uuid', true)
    OR (
        business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) IN ('employee', 'sub_admin')
    )
    OR (
        current_setting('app.staff_profile_uuid', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) = 'telecaller'
        AND EXISTS (
            SELECT 1 FROM leads l
            WHERE l.id = loan_applications.lead_uuid
              AND l.assigned_telecaller_profile_uuid IS NOT NULL
              AND l.assigned_telecaller_profile_uuid::text
                  = current_setting('app.staff_profile_uuid', true)
        )
    )
""",
    ),
    (
        "loan_txn_history",
        "loan_txn_history_rls",
        "ALL",
        """
    {scope}
    OR (
        current_setting('app.staff_profile_uuid', true) <> ''
        AND current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND EXISTS (
            SELECT 1 FROM loan_applications la
            JOIN leads l ON l.id = la.lead_uuid
            WHERE la.id = loan_txn_history.loan_application_uuid
              AND l.assigned_telecaller_profile_uuid IS NOT NULL
              AND l.assigned_telecaller_profile_uuid::text
                  = current_setting('app.staff_profile_uuid', true)
        )
    )
    OR (
        current_setting('app.client_profile_uuid', true) <> ''
        AND EXISTS (
            SELECT 1 FROM loan_applications la
            WHERE la.id = loan_txn_history.loan_application_uuid
              AND la.client_profile_uuid::text = current_setting('app.client_profile_uuid', true)
        )
    )
""",
        """
    {scope}
    OR (
        current_setting('app.staff_profile_uuid', true) <> ''
        AND current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND EXISTS (
            SELECT 1 FROM loan_applications la
            JOIN leads l ON l.id = la.lead_uuid
            WHERE la.id = loan_txn_history.loan_application_uuid
              AND l.assigned_telecaller_profile_uuid IS NOT NULL
              AND l.assigned_telecaller_profile_uuid::text
                  = current_setting('app.staff_profile_uuid', true)
        )
    )
    OR (
        current_setting('app.client_profile_uuid', true) <> ''
        AND EXISTS (
            SELECT 1 FROM loan_applications la
            WHERE la.id = loan_txn_history.loan_application_uuid
              AND la.client_profile_uuid::text = current_setting('app.client_profile_uuid', true)
        )
    )
""",
    ),
    (
        "property_deals",
        "property_deals_rls",
        "ALL",
        """
    {scope}
    OR EXISTS (
        SELECT 1 FROM client_profiles cp
        WHERE cp.id = property_deals.client_profile_uuid
          AND cp.auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
    )
    OR (
        current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) IN ('employee', 'sub_admin')
    )
    OR (
        current_setting('app.staff_profile_uuid', true) <> ''
        AND current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) = 'telecaller'
        AND EXISTS (
            SELECT 1 FROM leads l
            WHERE l.id = property_deals.lead_uuid
              AND l.assigned_telecaller_profile_uuid IS NOT NULL
              AND l.assigned_telecaller_profile_uuid::text
                  = current_setting('app.staff_profile_uuid', true)
        )
    )
""",
        """
    {scope}
    OR EXISTS (
        SELECT 1 FROM client_profiles cp
        WHERE cp.id = property_deals.client_profile_uuid
          AND cp.auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
    )
    OR (
        current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) IN ('employee', 'sub_admin')
    )
    OR (
        current_setting('app.staff_profile_uuid', true) <> ''
        AND current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) = 'telecaller'
        AND EXISTS (
            SELECT 1 FROM leads l
            WHERE l.id = property_deals.lead_uuid
              AND l.assigned_telecaller_profile_uuid IS NOT NULL
              AND l.assigned_telecaller_profile_uuid::text
                  = current_setting('app.staff_profile_uuid', true)
        )
    )
""",
    ),
    # --- Group 2: USING != WITH CHECK ---
    (
        "client_profiles",
        "client_profiles_rls",
        "ALL",
        """
    {scope}
    OR auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
    OR (
        current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) IN ('telecaller', 'employee', 'sub_admin')
    )
""",
        """
    {scope}
    OR auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
""",
    ),
    (
        "agent_profiles",
        "agent_profiles_rls",
        "ALL",
        """
    {scope}
    OR auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
    OR (
        current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) IN ('telecaller', 'employee', 'sub_admin')
    )
""",
        """
    {scope}
    OR auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
""",
    ),
    (
        "staff_profiles",
        "staff_profiles_rls",
        "ALL",
        """
    {scope}
    OR auth_user_uuid::text = current_setting('app.auth_user_uuid', true)
""",
        """
    {scope}
""",
    ),
    (
        "leads",
        "leads_rls",
        "ALL",
        """
    {scope}
    OR (
        client_profile_uuid IS NOT NULL
        AND client_profile_uuid::text = current_setting('app.client_profile_uuid', true)
    )
    OR (
        current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) IN ('employee', 'sub_admin')
    )
    OR (
        current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) = 'telecaller'
        AND assigned_telecaller_profile_uuid IS NOT NULL
        AND assigned_telecaller_profile_uuid::text = current_setting('app.staff_profile_uuid', true)
    )
    OR (
        current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) = 'agent'
        AND origin_agent_profile_uuid IS NOT NULL
        AND origin_agent_profile_uuid::text = current_setting('app.agent_profile_uuid', true)
    )
""",
        """
    {scope}
    OR (
        client_profile_uuid IS NOT NULL
        AND client_profile_uuid::text = current_setting('app.client_profile_uuid', true)
    )
    OR (
        current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) IN ('employee', 'sub_admin')
    )
    OR (
        current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) = 'telecaller'
        AND assigned_telecaller_profile_uuid IS NOT NULL
        AND assigned_telecaller_profile_uuid::text = current_setting('app.staff_profile_uuid', true)
    )
    OR (
        current_setting('app.business_line', true) <> ''
        AND business_line::text = current_setting('app.business_line', true)
        AND current_setting('app.role', true) = 'agent'
        AND origin_agent_profile_uuid IS NOT NULL
        AND origin_agent_profile_uuid::text = current_setting('app.agent_profile_uuid', true)
        AND assigned_telecaller_profile_uuid IS NULL
    )
""",
    ),
]

# --- Group 3: the three Sub Admin exceptions. `{scope}` expands to the
# ADMIN-only branch; `{sub_admin}` expands to the extra narrow branch each of
# these needs (interpolated separately since these three don't fit the plain
# _POLICIES tuple shape — property_submissions_select and properties_rls are
# SELECT-only, and all three need BOTH {scope} and {sub_admin}).
_GROUP3: list[tuple[str, str, str, str, str | None]] = [
    (
        "properties",
        "properties_rls",
        "SELECT",
        "active = true OR {scope} OR {sub_admin}",
        None,
    ),
    (
        "property_submissions",
        "property_submissions_select",
        "SELECT",
        """
    {scope}
    OR submitter_uuid::text = current_setting('app.auth_user_uuid', true)
    OR (
        current_setting('app.role', true) = 'sub_admin'
        AND business_line::text = current_setting('app.business_line', true)
    )
    OR {sub_admin}
""",
        None,
    ),
    (
        "payouts",
        "payouts_rls",
        "ALL",
        "{scope} OR {sub_admin}",
        "{scope} OR {sub_admin}",
    ),
]

# Pre-existing bare predicates, restored verbatim on downgrade.
_GROUP3_OLD: dict[str, str] = {
    "properties_rls": "active = true OR current_setting('app.platform_scope', true) = 'true'",
    "property_submissions_select": """
    current_setting('app.platform_scope', true) = 'true'
    OR submitter_uuid::text = current_setting('app.auth_user_uuid', true)
    OR (
        current_setting('app.role', true) = 'sub_admin'
        AND business_line::text = current_setting('app.business_line', true)
    )
""",
    "payouts_rls": "current_setting('app.platform_scope', true) = 'true'",
}


def _create(table: str, policy: str, cmd: str, using: str, check: str | None) -> None:
    op.execute(f"DROP POLICY IF EXISTS {policy} ON {table}")
    clauses = f"USING ({using})"
    if check is not None:
        clauses += f"\nWITH CHECK ({check})"
    op.execute(f"CREATE POLICY {policy} ON {table} FOR {cmd}\n{clauses};")


def upgrade() -> None:
    for table, policy, cmd, using_tmpl, check_tmpl in _POLICIES:
        using = using_tmpl.format(scope=_SCOPE_ADMIN)
        check = check_tmpl.format(scope=_SCOPE_ADMIN) if check_tmpl is not None else None
        _create(table, policy, cmd, using, check)

    for table, policy, cmd, using_tmpl, check_tmpl in _GROUP3:
        using = using_tmpl.format(scope=_SCOPE_ADMIN, sub_admin=_SCOPE_SUB_ADMIN)
        check = (
            check_tmpl.format(scope=_SCOPE_ADMIN, sub_admin=_SCOPE_SUB_ADMIN)
            if check_tmpl is not None
            else None
        )
        _create(table, policy, cmd, using, check)

    # Guard: no policy may be left with a bare platform_scope bypass lacking
    # an app.role check — a missed table fails the migration, not silently.
    # Substring co-occurrence, not causal coupling: this cannot tell a real
    # `(platform_scope AND role=...)` disjunct from platform_scope and an
    # unrelated app.role mention elsewhere in the same predicate. True for
    # all 22 policies here (verified) — a future predicate shaped like
    # `platform_scope='true' OR (app.role='x' AND ...)` would slip past it.
    conn = op.get_bind()
    leftover = conn.exec_driver_sql(
        "SELECT count(*) FROM pg_policies WHERE schemaname = 'public' "
        "AND ("
        "  (qual LIKE '%platform_scope%' AND qual NOT LIKE '%app.role%') "
        "  OR (with_check LIKE '%platform_scope%' AND with_check NOT LIKE '%app.role%')"
        ")"
    ).scalar_one()
    if leftover:
        raise RuntimeError(
            f"{leftover} RLS polic(y/ies) still carry a bare platform_scope bypass "
            "with no app.role check — migration a0b1c2d3e4f5 missed a table."
        )


def downgrade() -> None:
    for table, policy, cmd, using_tmpl, check_tmpl in _POLICIES:
        using = using_tmpl.format(scope=_SCOPE_OLD)
        check = check_tmpl.format(scope=_SCOPE_OLD) if check_tmpl is not None else None
        _create(table, policy, cmd, using, check)

    for table, policy, cmd, _using_tmpl, check_tmpl in _GROUP3:
        old = _GROUP3_OLD[policy]
        _create(table, policy, cmd, old, old if check_tmpl is not None else None)
