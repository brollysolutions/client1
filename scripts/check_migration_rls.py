#!/usr/bin/env python3
"""Require row-level security on tables created by NEW migrations.

`app/tests/system/test_rls_coverage.py` catches an unprotected table once the
migration has been applied to a database. This check catches it earlier and
without a database, at the point the migration is staged, which is where the
fix is cheapest.

Scope is deliberately limited to migrations added or modified in the diff under
review. Root `AGENTS.md` treats merged migrations as immutable, and the baseline
revision predates the project's RLS rollout, so retro-scanning history would
report failures nobody is allowed to fix.

Escape hatch: a table that genuinely needs no policies (internal bookkeeping,
lookup data written only by the owner role) is declared in the migration itself:

    # rls-exempt: <table_name> — <reason>

That marker is a reviewable line in the diff, which is the point: forgetting RLS
should be loud, and choosing to skip it should be visible.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections.abc import Iterable, Sequence
from pathlib import Path

MIGRATION_DIR = "apps/api/alembic/versions/"

_CREATE_TABLE = re.compile(r"""op\.create_table\(\s*["']([A-Za-z0-9_]+)["']""")
_ENABLE_RLS_LINE = re.compile(r"ENABLE\s+ROW\s+LEVEL\s+SECURITY", re.IGNORECASE)
_EXEMPT_MARKER = re.compile(r"#\s*rls-exempt:\s*([A-Za-z0-9_]+)", re.IGNORECASE)


def created_tables(source: str) -> list[str]:
    """Table names passed to op.create_table() in this migration."""
    return _CREATE_TABLE.findall(source)


def exempt_tables(source: str) -> set[str]:
    """Tables the migration explicitly declares as needing no RLS."""
    return {match.lower() for match in _EXEMPT_MARKER.findall(source)}


def _enable_rls_lines(source: str) -> list[str]:
    return [line for line in source.splitlines() if _ENABLE_RLS_LINE.search(line)]


def unprotected_tables(source: str) -> list[str]:
    """Created tables with neither an RLS enable statement nor an exemption.

    Two accepted shapes, matching how migrations in this repository are written:
      * a literal statement naming the table, and
      * a templated statement inside a loop over several tables, e.g.
        f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY", which cannot be
        attributed to one table by text alone and so satisfies every table in
        that migration.
    """
    tables = created_tables(source)
    if not tables:
        return []

    exempt = exempt_tables(source)
    rls_lines = _enable_rls_lines(source)
    templated = any("{" in line for line in rls_lines)

    missing = []
    for table in tables:
        if table.lower() in exempt:
            continue
        if templated:
            continue
        if any(table in line for line in rls_lines):
            continue
        missing.append(table)
    return missing


def is_migration(path: str) -> bool:
    normalized = path.replace("\\", "/")
    return normalized.startswith(MIGRATION_DIR) and normalized.endswith(".py")


def git_changed_files(diff_args: Sequence[str]) -> list[str]:
    result = subprocess.run(
        ("git", "diff", "--name-only", "--diff-filter=ACMR", *diff_args),
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"git diff failed: {detail}")
    return result.stdout.splitlines()


def scan(paths: Iterable[str], repo_root: Path) -> dict[str, list[str]]:
    """Map migration path -> unprotected table names."""
    findings: dict[str, list[str]] = {}
    for path in paths:
        if not is_migration(path):
            continue
        full = repo_root / path
        if not full.is_file():
            continue
        missing = unprotected_tables(full.read_text(encoding="utf-8", errors="replace"))
        if missing:
            findings[path] = missing
    return findings


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--staged", action="store_true", help="Check the staged diff.")
    source.add_argument("--base-ref", help="Check BASE_REF...HEAD (for pull-request CI).")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    repo_root = Path(__file__).resolve().parents[1]
    try:
        paths = (
            git_changed_files(("--cached",))
            if args.staged
            else git_changed_files((f"{args.base_ref}...HEAD",))
        )
    except RuntimeError as exc:
        print(f"migration-rls: {exc}", file=sys.stderr)
        return 2

    findings = scan(paths, repo_root)
    if findings:
        print(
            "New migrations create tables without row-level security.",
            file=sys.stderr,
        )
        for path, tables in sorted(findings.items()):
            print(f"  {path}: {', '.join(sorted(tables))}", file=sys.stderr)
        print(
            "Add `ALTER TABLE <t> ENABLE ROW LEVEL SECURITY` plus policies and the "
            "api_user GRANT, or declare `# rls-exempt: <table> - <reason>` in the "
            "migration when the table holds no business data.",
            file=sys.stderr,
        )
        return 1

    print("Migration RLS check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
