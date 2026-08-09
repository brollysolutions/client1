# ruff: noqa: E501
"""harden business-line classification across operational records

Revision ID: a3b4c5d6e7f8
Revises: f0e9d8c7b6a5
Create Date: 2026-08-09 00:00:00.000000

FR-1.1 requires one immutable operational line at record creation.  The shared
enum also contains ``both`` for identity claims, while a handful of legacy
tables admitted NULL.  This migration separates those concepts, deterministically
backfills source-linked rows, fails closed with count-only diagnostics when a
legacy row cannot be classified, and validates parent/child copies even for
Admin and bypass-session writes.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a3b4c5d6e7f8"
down_revision: str | Sequence[str] | None = "f0e9d8c7b6a5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OPERATIONAL_TABLES = (
    "agent_applications",
    "agent_profiles",
    "bookmarks",
    "client_profiles",
    "commissions",
    "enquiries",
    "fee_cashbacks",
    "lead_activities",
    "leads",
    "loan_applications",
    "loan_documents",
    "loan_txn_history",
    "payouts",
    "properties",
    "property_deals",
    "property_media",
    "property_submission_media",
    "property_submissions",
    "referral_bonus_config",
    "site_visits",
    "task_feedback_media",
    "tasks",
    "transactions",
    "vehicle_arrangements",
)

_FIXED_LINES = {
    "bookmarks": "real_estate",
    "enquiries": "real_estate",
    "fee_cashbacks": "loans",
    "loan_applications": "loans",
    "loan_documents": "loans",
    "loan_txn_history": "loans",
    "properties": "real_estate",
    "property_deals": "real_estate",
    "property_media": "real_estate",
    "property_submission_media": "real_estate",
    "property_submissions": "real_estate",
    "site_visits": "real_estate",
    "vehicle_arrangements": "real_estate",
}

_PARENT_TRIGGER = "trg_validate_business_line_parent"
_PARENT_FUNCTION = "validate_business_line_parent"
_PARENT_TABLE_COLUMNS = {
    "lead_activities": "business_line, lead_uuid, telecaller_staff_profile_uuid",
    "loan_applications": "business_line, lead_uuid, client_profile_uuid",
    "loan_documents": "business_line, loan_application_uuid, client_profile_uuid",
    "loan_txn_history": "business_line, loan_application_uuid, entered_by_staff_profile_uuid",
    "fee_cashbacks": (
        "business_line, loan_application_uuid, client_profile_uuid, payout_uuid, payout_txn_uuid"
    ),
    "commissions": (
        "business_line, lead_uuid, agent_profile_uuid, loan_application_uuid, "
        "property_deal_uuid, payout_uuid, payout_txn_uuid"
    ),
    "property_deals": (
        "business_line, lead_uuid, client_profile_uuid, property_id, site_visit_uuid"
    ),
    "property_submission_media": "business_line, submission_uuid",
    "property_media": "business_line, property_uuid",
    "tasks": (
        "business_line, lead_uuid, raised_by_staff_profile_uuid, assigned_employee_profile_uuid"
    ),
    "payouts": "business_line, ledger_transaction_id, reversal_transaction_id",
    "referrals": (
        "business_line, conversion_status, bonus_config_uuid, reward_payout_uuid, reward_txn_uuid"
    ),
    "task_feedback_media": "business_line, task_uuid",
    "vehicle_arrangements": (
        "business_line, site_visit_uuid, assigned_employee_profile_uuid, "
        "arranged_by_staff_profile_uuid"
    ),
}


def _require_zero(bind, label: str, query: str) -> None:
    count = int(bind.execute(sa.text(f"SELECT count(*) FROM {query}")).scalar_one())
    if count:
        raise RuntimeError(f"business-line preflight failed: {label} has {count} ambiguous rows")


def _add_check(table: str, name: str, expression: str) -> None:
    op.execute(f"ALTER TABLE {table} ADD CONSTRAINT {name} CHECK ({expression}) NOT VALID")
    op.execute(f"ALTER TABLE {table} VALIDATE CONSTRAINT {name}")


def upgrade() -> None:
    bind = op.get_bind()

    # Deterministic legacy backfills.  The shared immutability trigger permits
    # NULL -> value and rejects every later change.
    op.execute(
        """
        UPDATE leads AS target
        SET business_line = profile.business_line
        FROM client_profiles AS profile
        WHERE target.business_line IS NULL
          AND target.client_profile_uuid = profile.id
        """
    )
    op.execute(
        """
        UPDATE leads AS target
        SET business_line = profile.business_line
        FROM agent_profiles AS profile
        WHERE target.business_line IS NULL
          AND target.origin_agent_profile_uuid = profile.id
        """
    )
    op.execute(
        """
        UPDATE leads
        SET business_line = (requirement ->> 'topic')::business_line_enum
        WHERE business_line IS NULL
          AND requirement ->> 'topic' IN ('loans', 'real_estate')
        """
    )

    # Older auth entry points captured login and password-recovery attempts as
    # line-less sales leads.  A row with no authoritative profile, assignment,
    # or downstream workflow cannot be classified without inventing customer
    # intent.  Remove only those FK-orphaned capture rows; any linked or
    # otherwise ambiguous row remains for the count-only preflight below to
    # reject explicitly.
    op.execute(
        """
        DELETE FROM leads AS target
        WHERE target.business_line IS NULL
          AND target.client_profile_uuid IS NULL
          AND target.origin_agent_profile_uuid IS NULL
          AND target.assigned_telecaller_profile_uuid IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM lead_activities child WHERE child.lead_uuid = target.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM loan_applications child WHERE child.lead_uuid = target.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM commissions child WHERE child.lead_uuid = target.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM property_deals child WHERE child.lead_uuid = target.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM tasks child WHERE child.lead_uuid = target.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM referrals child WHERE child.referred_lead_uuid = target.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM contact_share_links child WHERE child.lead_uuid = target.id
          )
        """
    )

    for source_table, payout_column in (
        ("commissions", "payout_uuid"),
        ("fee_cashbacks", "payout_uuid"),
        ("referrals", "reward_payout_uuid"),
    ):
        op.execute(
            f"""
            UPDATE payouts AS target
            SET business_line = source.business_line
            FROM {source_table} AS source
            WHERE target.business_line IS NULL
              AND source.{payout_column} = target.id
              AND source.business_line IS NOT NULL
              AND source.business_line::text IN ('loans', 'real_estate')
            """
        )
    op.execute(
        """
        UPDATE transactions AS target
        SET business_line = source.business_line
        FROM payouts AS source
        WHERE target.business_line IS NULL
          AND (source.ledger_transaction_id = target.id OR source.reversal_transaction_id = target.id)
          AND source.business_line IS NOT NULL
        """
    )
    for source_table, transaction_column in (
        ("commissions", "payout_txn_uuid"),
        ("fee_cashbacks", "payout_txn_uuid"),
        ("referrals", "reward_txn_uuid"),
    ):
        op.execute(
            f"""
            UPDATE transactions AS target
            SET business_line = source.business_line
            FROM {source_table} AS source
            WHERE target.business_line IS NULL
              AND source.{transaction_column} = target.id
              AND source.business_line IS NOT NULL
              AND source.business_line::text IN ('loans', 'real_estate')
            """
        )

    # ``both`` on content_blocks represented the same global audience as NULL.
    op.execute(
        "DROP TRIGGER IF EXISTS trg_content_blocks_business_line_immutable ON content_blocks"
    )
    op.execute("UPDATE content_blocks SET business_line = NULL WHERE business_line::text = 'both'")
    op.execute(
        """
        CREATE TRIGGER trg_content_blocks_business_line_immutable
        BEFORE UPDATE ON content_blocks
        FOR EACH ROW EXECUTE FUNCTION enforce_business_line_immutable()
        """
    )

    for table in _OPERATIONAL_TABLES:
        _require_zero(
            bind,
            table,
            f"{table} WHERE business_line IS NULL "
            "OR business_line::text NOT IN ('loans', 'real_estate')",
        )
    for table, line in _FIXED_LINES.items():
        _require_zero(
            bind,
            f"fixed-line {table}",
            f"{table} WHERE business_line::text <> '{line}'",
        )
    _require_zero(
        bind,
        "referral lifecycle",
        "referrals WHERE business_line::text = 'both' OR "
        "(business_line IS NULL AND conversion_status::text NOT IN ('pending', 'void'))",
    )
    _require_zero(
        bind,
        "staff profile scope",
        "staff_profiles WHERE (((scope::text = 'platform' AND business_line IS NULL) OR "
        "(scope::text = 'line' AND business_line::text IN ('loans', 'real_estate'))) "
        "IS NOT TRUE)",
    )
    _require_zero(bind, "audit log", "audit_log WHERE business_line::text = 'both'")

    op.drop_index("uq_leads_mobile_unresolved_live", table_name="leads")
    op.execute(
        "ALTER TABLE leads DROP CONSTRAINT IF EXISTS ck_leads_lead_business_line_is_operational"
    )
    for table in ("leads", "payouts", "transactions"):
        op.alter_column(table, "business_line", existing_type=sa.Enum(), nullable=False)

    for table in _OPERATIONAL_TABLES:
        _add_check(
            table,
            f"ck_{table}_business_line_operational",
            "business_line::text IN ('loans', 'real_estate')",
        )
    for table, line in _FIXED_LINES.items():
        _add_check(
            table,
            f"ck_{table}_business_line_fixed",
            f"business_line::text = '{line}'",
        )

    _add_check(
        "staff_profiles",
        "ck_staff_profiles_scope_matches_business_line",
        "(scope::text = 'platform' AND business_line IS NULL) OR "
        "(scope::text = 'line' AND business_line::text IN ('loans', 'real_estate'))",
    )
    _add_check(
        "referrals",
        "ck_referrals_business_line_lifecycle",
        "(business_line IS NULL AND conversion_status::text IN ('pending', 'void')) OR "
        "(business_line IS NOT NULL AND business_line::text IN ('loans', 'real_estate'))",
    )
    _add_check(
        "audit_log",
        "ck_audit_log_business_line_optional_operational",
        "business_line IS NULL OR business_line::text IN ('loans', 'real_estate')",
    )
    _add_check(
        "content_blocks",
        "ck_content_blocks_business_line_global_or_operational",
        "business_line IS NULL OR business_line::text IN ('loans', 'real_estate')",
    )
    for table in ("banners", "offers"):
        _add_check(
            table,
            f"ck_{table}_business_line_content_audience",
            "business_line::text IN ('loans', 'real_estate', 'both')",
        )

    # These direct line copies lacked the shared superuser-proof immutability
    # trigger even though normal api_user grants did not expose the column.
    for table in ("loan_applications", "payouts", "transactions"):
        op.execute(
            f"CREATE TRIGGER trg_{table}_business_line_immutable "
            f"BEFORE UPDATE ON {table} FOR EACH ROW "
            "EXECUTE FUNCTION enforce_business_line_immutable()"
        )

    consistency_queries = {
        "lead_activities": (
            "lead_activities child JOIN leads parent ON parent.id = child.lead_uuid "
            "JOIN staff_profiles staff ON staff.id = child.telecaller_staff_profile_uuid "
            "WHERE child.business_line IS DISTINCT FROM parent.business_line "
            "OR child.business_line IS DISTINCT FROM staff.business_line"
        ),
        "loan_applications": (
            "loan_applications child JOIN leads lead ON lead.id = child.lead_uuid "
            "JOIN client_profiles client ON client.id = child.client_profile_uuid "
            "WHERE child.business_line IS DISTINCT FROM lead.business_line "
            "OR child.business_line IS DISTINCT FROM client.business_line"
        ),
        "loan_documents": (
            "loan_documents child JOIN loan_applications parent "
            "ON parent.id = child.loan_application_uuid "
            "JOIN client_profiles client ON client.id = child.client_profile_uuid "
            "WHERE child.business_line IS DISTINCT FROM parent.business_line "
            "OR child.business_line IS DISTINCT FROM client.business_line"
        ),
        "loan_txn_history": (
            "loan_txn_history child JOIN loan_applications parent "
            "ON parent.id = child.loan_application_uuid "
            "LEFT JOIN staff_profiles staff ON staff.id = child.entered_by_staff_profile_uuid "
            "WHERE child.business_line IS DISTINCT FROM parent.business_line "
            "OR (staff.id IS NOT NULL AND child.business_line IS DISTINCT FROM staff.business_line)"
        ),
        "fee_cashbacks": (
            "fee_cashbacks child JOIN loan_applications parent "
            "ON parent.id = child.loan_application_uuid "
            "JOIN client_profiles client ON client.id = child.client_profile_uuid "
            "LEFT JOIN payouts payout ON payout.id = child.payout_uuid "
            "LEFT JOIN transactions txn ON txn.id = child.payout_txn_uuid "
            "WHERE child.business_line IS DISTINCT FROM parent.business_line "
            "OR child.business_line IS DISTINCT FROM client.business_line "
            "OR (child.payout_uuid IS NOT NULL AND payout.business_line IS DISTINCT FROM child.business_line) "
            "OR (child.payout_txn_uuid IS NOT NULL AND txn.business_line IS DISTINCT FROM child.business_line)"
        ),
        "commissions": (
            "commissions child JOIN agent_profiles agent ON agent.id = child.agent_profile_uuid "
            "JOIN leads lead ON lead.id = child.lead_uuid "
            "LEFT JOIN loan_applications loan ON loan.id = child.loan_application_uuid "
            "LEFT JOIN property_deals deal ON deal.id = child.property_deal_uuid "
            "LEFT JOIN payouts payout ON payout.id = child.payout_uuid "
            "LEFT JOIN transactions txn ON txn.id = child.payout_txn_uuid "
            "WHERE child.business_line IS DISTINCT FROM agent.business_line "
            "OR child.agent_auth_user_uuid IS DISTINCT FROM agent.auth_user_uuid "
            "OR child.business_line IS DISTINCT FROM lead.business_line "
            "OR (child.loan_application_uuid IS NOT NULL AND loan.business_line IS DISTINCT FROM child.business_line) "
            "OR (child.property_deal_uuid IS NOT NULL AND deal.business_line IS DISTINCT FROM child.business_line) "
            "OR (child.payout_uuid IS NOT NULL AND payout.business_line IS DISTINCT FROM child.business_line) "
            "OR (child.payout_txn_uuid IS NOT NULL AND txn.business_line IS DISTINCT FROM child.business_line)"
        ),
        "property_deals": (
            "property_deals child JOIN leads lead ON lead.id = child.lead_uuid "
            "JOIN client_profiles client ON client.id = child.client_profile_uuid "
            "JOIN properties property ON property.id = child.property_id "
            "LEFT JOIN site_visits visit ON visit.id = child.site_visit_uuid "
            "WHERE child.business_line IS DISTINCT FROM lead.business_line "
            "OR child.business_line IS DISTINCT FROM client.business_line "
            "OR child.business_line IS DISTINCT FROM property.business_line "
            "OR (child.site_visit_uuid IS NOT NULL AND visit.business_line IS DISTINCT FROM child.business_line)"
        ),
        "tasks": (
            "tasks child JOIN leads lead ON lead.id = child.lead_uuid "
            "JOIN staff_profiles raiser ON raiser.id = child.raised_by_staff_profile_uuid "
            "LEFT JOIN staff_profiles assignee ON assignee.id = child.assigned_employee_profile_uuid "
            "WHERE child.business_line IS DISTINCT FROM lead.business_line "
            "OR (raiser.business_line IS NOT NULL AND raiser.business_line IS DISTINCT FROM child.business_line) "
            "OR (assignee.id IS NOT NULL AND assignee.business_line IS DISTINCT FROM child.business_line)"
        ),
        "property_submission_media": (
            "property_submission_media child JOIN property_submissions parent "
            "ON parent.id = child.submission_uuid "
            "WHERE child.business_line IS DISTINCT FROM parent.business_line"
        ),
        "property_media": (
            "property_media child JOIN properties parent ON parent.id = child.property_uuid "
            "WHERE child.business_line IS DISTINCT FROM parent.business_line"
        ),
        "task_feedback_media": (
            "task_feedback_media child JOIN tasks parent ON parent.id = child.task_uuid "
            "WHERE child.business_line IS DISTINCT FROM parent.business_line"
        ),
        "vehicle_arrangements": (
            "vehicle_arrangements child JOIN site_visits parent "
            "ON parent.id = child.site_visit_uuid "
            "LEFT JOIN staff_profiles assignee ON assignee.id = child.assigned_employee_profile_uuid "
            "LEFT JOIN staff_profiles arranger ON arranger.id = child.arranged_by_staff_profile_uuid "
            "WHERE child.business_line IS DISTINCT FROM parent.business_line "
            "OR (assignee.id IS NOT NULL AND assignee.business_line IS DISTINCT FROM child.business_line) "
            "OR (arranger.id IS NOT NULL AND arranger.business_line IS NOT NULL "
            "AND arranger.business_line IS DISTINCT FROM child.business_line)"
        ),
        "payouts": (
            "payouts child LEFT JOIN transactions ledger ON ledger.id = child.ledger_transaction_id "
            "LEFT JOIN transactions reversal ON reversal.id = child.reversal_transaction_id "
            "WHERE (child.ledger_transaction_id IS NOT NULL "
            "AND ledger.business_line IS DISTINCT FROM child.business_line) "
            "OR (child.reversal_transaction_id IS NOT NULL "
            "AND reversal.business_line IS DISTINCT FROM child.business_line)"
        ),
        "referrals": (
            "referrals child LEFT JOIN referral_bonus_config config "
            "ON config.id = child.bonus_config_uuid "
            "LEFT JOIN payouts payout ON payout.id = child.reward_payout_uuid "
            "LEFT JOIN transactions txn ON txn.id = child.reward_txn_uuid "
            "WHERE (child.bonus_config_uuid IS NOT NULL "
            "AND config.business_line IS DISTINCT FROM child.business_line) "
            "OR (child.reward_payout_uuid IS NOT NULL "
            "AND payout.business_line IS DISTINCT FROM child.business_line) "
            "OR (child.reward_txn_uuid IS NOT NULL "
            "AND txn.business_line IS DISTINCT FROM child.business_line)"
        ),
    }
    for label, query in consistency_queries.items():
        _require_zero(bind, label, query)

    op.execute(
        f"""
        CREATE FUNCTION {_PARENT_FUNCTION}() RETURNS trigger AS $$
        BEGIN
            IF TG_TABLE_NAME = 'lead_activities' THEN
              IF NOT EXISTS (
                SELECT 1 FROM public.leads lead
                JOIN public.staff_profiles staff
                  ON staff.id = NEW.telecaller_staff_profile_uuid
                WHERE lead.id = NEW.lead_uuid
                  AND lead.business_line = NEW.business_line
                  AND staff.business_line = NEW.business_line
            ) THEN RAISE EXCEPTION 'business_line does not match lead activity parents'
                USING ERRCODE = 'check_violation';
              END IF;
            ELSIF TG_TABLE_NAME = 'loan_applications' THEN
              IF NOT EXISTS (
                SELECT 1 FROM public.leads lead
                JOIN public.client_profiles client ON client.id = NEW.client_profile_uuid
                WHERE lead.id = NEW.lead_uuid
                  AND lead.business_line = NEW.business_line
                  AND client.business_line = NEW.business_line
            ) THEN RAISE EXCEPTION 'business_line does not match loan application parents'
                USING ERRCODE = 'check_violation';
              END IF;
            ELSIF TG_TABLE_NAME = 'loan_documents' THEN
              IF NOT EXISTS (
                SELECT 1 FROM public.loan_applications application
                JOIN public.client_profiles client ON client.id = NEW.client_profile_uuid
                WHERE application.id = NEW.loan_application_uuid
                  AND application.business_line = NEW.business_line
                  AND client.business_line = NEW.business_line
            ) THEN RAISE EXCEPTION 'business_line does not match loan document parents'
                USING ERRCODE = 'check_violation';
              END IF;
            ELSIF TG_TABLE_NAME = 'loan_txn_history' THEN
              IF NOT EXISTS (
                SELECT 1 FROM public.loan_applications application
                LEFT JOIN public.staff_profiles staff
                  ON staff.id = NEW.entered_by_staff_profile_uuid
                WHERE application.id = NEW.loan_application_uuid
                  AND application.business_line = NEW.business_line
                  AND (staff.id IS NULL OR staff.business_line = NEW.business_line)
            ) THEN RAISE EXCEPTION 'business_line does not match loan history parents'
                USING ERRCODE = 'check_violation';
              END IF;
            ELSIF TG_TABLE_NAME = 'fee_cashbacks' THEN
              IF NOT EXISTS (
                SELECT 1 FROM public.loan_applications application
                JOIN public.client_profiles client ON client.id = NEW.client_profile_uuid
                WHERE application.id = NEW.loan_application_uuid
                  AND application.business_line = NEW.business_line
                  AND client.business_line = NEW.business_line
                  AND (NEW.payout_uuid IS NULL OR EXISTS (
                      SELECT 1 FROM public.payouts payout
                      WHERE payout.id = NEW.payout_uuid
                        AND payout.business_line = NEW.business_line
                  ))
                  AND (NEW.payout_txn_uuid IS NULL OR EXISTS (
                      SELECT 1 FROM public.transactions txn
                      WHERE txn.id = NEW.payout_txn_uuid
                        AND txn.business_line = NEW.business_line
                  ))
            ) THEN RAISE EXCEPTION 'business_line does not match cashback parents'
                USING ERRCODE = 'check_violation';
              END IF;
            ELSIF TG_TABLE_NAME = 'commissions' THEN
              IF NOT EXISTS (
                SELECT 1 FROM public.agent_profiles agent
                JOIN public.leads lead ON lead.id = NEW.lead_uuid
                WHERE agent.id = NEW.agent_profile_uuid
                  AND agent.auth_user_uuid = NEW.agent_auth_user_uuid
                  AND agent.business_line = NEW.business_line
                  AND lead.business_line = NEW.business_line
                  AND (NEW.loan_application_uuid IS NULL OR EXISTS (
                      SELECT 1 FROM public.loan_applications loan
                      WHERE loan.id = NEW.loan_application_uuid
                        AND loan.business_line = NEW.business_line
                  ))
                  AND (NEW.property_deal_uuid IS NULL OR EXISTS (
                      SELECT 1 FROM public.property_deals deal
                      WHERE deal.id = NEW.property_deal_uuid
                        AND deal.business_line = NEW.business_line
                  ))
                  AND (NEW.payout_uuid IS NULL OR EXISTS (
                      SELECT 1 FROM public.payouts payout
                      WHERE payout.id = NEW.payout_uuid
                        AND payout.business_line = NEW.business_line
                  ))
                  AND (NEW.payout_txn_uuid IS NULL OR EXISTS (
                      SELECT 1 FROM public.transactions txn
                      WHERE txn.id = NEW.payout_txn_uuid
                        AND txn.business_line = NEW.business_line
                  ))
            ) THEN RAISE EXCEPTION 'business_line does not match commission parents'
                USING ERRCODE = 'check_violation';
              END IF;
            ELSIF TG_TABLE_NAME = 'property_deals' THEN
              IF NOT EXISTS (
                SELECT 1 FROM public.leads lead
                JOIN public.client_profiles client ON client.id = NEW.client_profile_uuid
                JOIN public.properties property ON property.id = NEW.property_id
                WHERE lead.id = NEW.lead_uuid
                  AND lead.business_line = NEW.business_line
                  AND client.business_line = NEW.business_line
                  AND property.business_line = NEW.business_line
                  AND (NEW.site_visit_uuid IS NULL OR EXISTS (
                      SELECT 1 FROM public.site_visits visit
                      WHERE visit.id = NEW.site_visit_uuid
                        AND visit.business_line = NEW.business_line
                  ))
            ) THEN RAISE EXCEPTION 'business_line does not match property deal parents'
                USING ERRCODE = 'check_violation';
              END IF;
            ELSIF TG_TABLE_NAME = 'tasks' THEN
              IF NOT EXISTS (
                SELECT 1 FROM public.leads lead
                JOIN public.staff_profiles raiser ON raiser.id = NEW.raised_by_staff_profile_uuid
                WHERE lead.id = NEW.lead_uuid
                  AND lead.business_line = NEW.business_line
                  AND (raiser.business_line IS NULL OR raiser.business_line = NEW.business_line)
                  AND (NEW.assigned_employee_profile_uuid IS NULL OR EXISTS (
                      SELECT 1 FROM public.staff_profiles assignee
                      WHERE assignee.id = NEW.assigned_employee_profile_uuid
                        AND assignee.business_line = NEW.business_line
                  ))
            ) THEN RAISE EXCEPTION 'business_line does not match task parents'
                USING ERRCODE = 'check_violation';
              END IF;
            ELSIF TG_TABLE_NAME = 'property_submission_media' THEN
              IF NOT EXISTS (
                SELECT 1 FROM public.property_submissions submission
                WHERE submission.id = NEW.submission_uuid
                  AND submission.business_line = NEW.business_line
            ) THEN RAISE EXCEPTION 'business_line does not match property submission'
                USING ERRCODE = 'check_violation';
              END IF;
            ELSIF TG_TABLE_NAME = 'property_media' THEN
              IF NOT EXISTS (
                SELECT 1 FROM public.properties property
                WHERE property.id = NEW.property_uuid
                  AND property.business_line = NEW.business_line
            ) THEN RAISE EXCEPTION 'business_line does not match property'
                USING ERRCODE = 'check_violation';
              END IF;
            ELSIF TG_TABLE_NAME = 'task_feedback_media' THEN
              IF NOT EXISTS (
                SELECT 1 FROM public.tasks task
                WHERE task.id = NEW.task_uuid AND task.business_line = NEW.business_line
            ) THEN RAISE EXCEPTION 'business_line does not match task'
                USING ERRCODE = 'check_violation';
              END IF;
            ELSIF TG_TABLE_NAME = 'vehicle_arrangements' THEN
              IF NOT EXISTS (
                SELECT 1 FROM public.site_visits visit
                WHERE visit.id = NEW.site_visit_uuid
                  AND visit.business_line = NEW.business_line
                  AND (NEW.assigned_employee_profile_uuid IS NULL OR EXISTS (
                      SELECT 1 FROM public.staff_profiles assignee
                      WHERE assignee.id = NEW.assigned_employee_profile_uuid
                        AND assignee.business_line = NEW.business_line
                  ))
                  AND (NEW.arranged_by_staff_profile_uuid IS NULL OR EXISTS (
                      SELECT 1 FROM public.staff_profiles arranger
                      WHERE arranger.id = NEW.arranged_by_staff_profile_uuid
                        AND (arranger.business_line IS NULL
                             OR arranger.business_line = NEW.business_line)
                  ))
            ) THEN RAISE EXCEPTION 'business_line does not match site visit'
                USING ERRCODE = 'check_violation';
              END IF;
            ELSIF TG_TABLE_NAME = 'payouts' THEN
              IF (
                (NEW.ledger_transaction_id IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM public.transactions txn
                    WHERE txn.id = NEW.ledger_transaction_id
                      AND txn.business_line = NEW.business_line
                ))
                OR (NEW.reversal_transaction_id IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM public.transactions txn
                    WHERE txn.id = NEW.reversal_transaction_id
                      AND txn.business_line = NEW.business_line
                ))
            ) THEN RAISE EXCEPTION 'business_line does not match payout transactions'
                USING ERRCODE = 'check_violation';
              END IF;
            ELSIF TG_TABLE_NAME = 'referrals' THEN
              IF (
                (NEW.bonus_config_uuid IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM public.referral_bonus_config config
                    WHERE config.id = NEW.bonus_config_uuid
                      AND config.business_line = NEW.business_line
                ))
                OR (NEW.reward_payout_uuid IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM public.payouts payout
                    WHERE payout.id = NEW.reward_payout_uuid
                      AND payout.business_line = NEW.business_line
                ))
                OR (NEW.reward_txn_uuid IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM public.transactions txn
                    WHERE txn.id = NEW.reward_txn_uuid
                      AND txn.business_line = NEW.business_line
                ))
            ) THEN RAISE EXCEPTION 'business_line does not match referral rewards'
                USING ERRCODE = 'check_violation';
              END IF;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;
        """
    )
    op.execute(f"REVOKE ALL ON FUNCTION {_PARENT_FUNCTION}() FROM PUBLIC")
    for table, columns in _PARENT_TABLE_COLUMNS.items():
        op.execute(
            f"CREATE TRIGGER {_PARENT_TRIGGER} BEFORE INSERT OR UPDATE OF {columns} "
            f"ON {table} FOR EACH ROW EXECUTE FUNCTION {_PARENT_FUNCTION}()"
        )


def downgrade() -> None:
    for table in _PARENT_TABLE_COLUMNS:
        op.execute(f"DROP TRIGGER IF EXISTS {_PARENT_TRIGGER} ON {table}")
    op.execute(f"DROP FUNCTION IF EXISTS {_PARENT_FUNCTION}()")

    for table in ("loan_applications", "payouts", "transactions"):
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_business_line_immutable ON {table}")

    for table in ("banners", "offers"):
        op.execute(
            f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS "
            f"ck_{table}_business_line_content_audience"
        )
    for table, name in (
        ("content_blocks", "ck_content_blocks_business_line_global_or_operational"),
        ("audit_log", "ck_audit_log_business_line_optional_operational"),
        ("referrals", "ck_referrals_business_line_lifecycle"),
        ("staff_profiles", "ck_staff_profiles_scope_matches_business_line"),
    ):
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {name}")
    for table in _FIXED_LINES:
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS ck_{table}_business_line_fixed")
    for table in _OPERATIONAL_TABLES:
        op.execute(
            f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS ck_{table}_business_line_operational"
        )

    for table in ("transactions", "payouts", "leads"):
        op.alter_column(table, "business_line", existing_type=sa.Enum(), nullable=True)
    op.execute(
        "ALTER TABLE leads ADD CONSTRAINT ck_leads_lead_business_line_is_operational "
        "CHECK (business_line IS NULL OR business_line::text IN ('loans', 'real_estate'))"
    )
    op.create_index(
        "uq_leads_mobile_unresolved_live",
        "leads",
        ["mobile"],
        unique=True,
        postgresql_where=sa.text("business_line IS NULL AND status <> 'closed'"),
    )
