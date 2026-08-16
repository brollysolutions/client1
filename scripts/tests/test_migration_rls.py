from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "check_migration_rls.py"
SPEC = importlib.util.spec_from_file_location("check_migration_rls", MODULE_PATH)
assert SPEC and SPEC.loader
RLS = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = RLS
SPEC.loader.exec_module(RLS)

CREATE_ONLY = '''
def upgrade() -> None:
    op.create_table(
        "payout_disputes",
        sa.Column("id", sa.UUID(), nullable=False),
    )
'''

CREATE_WITH_RLS = '''
def upgrade() -> None:
    op.create_table(
        "payout_disputes",
        sa.Column("id", sa.UUID(), nullable=False),
    )
    op.execute("GRANT SELECT ON payout_disputes TO api_user")
    op.execute("ALTER TABLE payout_disputes ENABLE ROW LEVEL SECURITY")
'''

CREATE_WITH_TEMPLATED_RLS = '''
def upgrade() -> None:
    op.create_table("banks", sa.Column("id", sa.UUID()))
    op.create_table("loan_types", sa.Column("id", sa.UUID()))
    for table in ("banks", "loan_types"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
'''

CREATE_WITH_EXEMPTION = '''
# rls-exempt: import_cursor — internal scheduler bookkeeping, owner-role writes only
def upgrade() -> None:
    op.create_table("import_cursor", sa.Column("id", sa.UUID()))
'''


class CreatedTableTests(unittest.TestCase):
    def test_extracts_created_table_names(self) -> None:
        self.assertEqual(RLS.created_tables(CREATE_ONLY), ["payout_disputes"])

    def test_migration_without_create_table_is_ignored(self) -> None:
        self.assertEqual(RLS.unprotected_tables("def upgrade():\n    pass\n"), [])


class UnprotectedTableTests(unittest.TestCase):
    def test_create_without_rls_is_reported(self) -> None:
        self.assertEqual(RLS.unprotected_tables(CREATE_ONLY), ["payout_disputes"])

    def test_literal_enable_statement_satisfies_the_check(self) -> None:
        self.assertEqual(RLS.unprotected_tables(CREATE_WITH_RLS), [])

    def test_templated_enable_statement_covers_every_table(self) -> None:
        self.assertEqual(RLS.unprotected_tables(CREATE_WITH_TEMPLATED_RLS), [])

    def test_explicit_exemption_marker_is_honoured(self) -> None:
        self.assertEqual(RLS.unprotected_tables(CREATE_WITH_EXEMPTION), [])

    def test_exemption_only_covers_the_named_table(self) -> None:
        source = CREATE_WITH_EXEMPTION + '\n    op.create_table("payouts", sa.Column("id", sa.UUID()))\n'
        self.assertEqual(RLS.unprotected_tables(source), ["payouts"])

    def test_enable_statement_for_a_different_table_does_not_count(self) -> None:
        source = '''
def upgrade() -> None:
    op.create_table("payout_disputes", sa.Column("id", sa.UUID()))
    op.execute("ALTER TABLE unrelated_table ENABLE ROW LEVEL SECURITY")
'''
        self.assertEqual(RLS.unprotected_tables(source), ["payout_disputes"])


class PathFilterTests(unittest.TestCase):
    def test_only_alembic_versions_are_checked(self) -> None:
        self.assertTrue(RLS.is_migration("apps/api/alembic/versions/abc_add_table.py"))
        self.assertTrue(RLS.is_migration(r"apps\api\alembic\versions\abc_add_table.py"))
        self.assertFalse(RLS.is_migration("apps/api/app/models/payout.py"))
        self.assertFalse(RLS.is_migration("apps/api/alembic/versions/README.md"))


class ScanTests(unittest.TestCase):
    def test_scan_reports_only_offending_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            versions = root / "apps" / "api" / "alembic" / "versions"
            versions.mkdir(parents=True)
            (versions / "bad.py").write_text(CREATE_ONLY, encoding="utf-8")
            (versions / "good.py").write_text(CREATE_WITH_RLS, encoding="utf-8")

            findings = RLS.scan(
                [
                    "apps/api/alembic/versions/bad.py",
                    "apps/api/alembic/versions/good.py",
                    "apps/api/app/models/payout.py",
                ],
                root,
            )

        self.assertEqual(findings, {"apps/api/alembic/versions/bad.py": ["payout_disputes"]})

    def test_missing_file_is_skipped(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            findings = RLS.scan(["apps/api/alembic/versions/deleted.py"], Path(tmp))
        self.assertEqual(findings, {})


if __name__ == "__main__":
    unittest.main()
