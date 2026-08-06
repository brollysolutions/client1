#!/usr/bin/env python3
"""Require living plan/status updates alongside product-code changes."""

from __future__ import annotations

import argparse
import subprocess
import sys
from collections.abc import Iterable, Sequence

TRACKING_FILES = frozenset(
    {
        "docs/agent-context/feature-status.md",
        "docs/agent-context/implementation-plan.md",
    }
)

PRODUCT_PREFIXES = (
    "apps/",
    "packages/contracts/",
    "infra/",
    "scripts/",
)

ROOT_PRODUCT_FILES = frozenset(
    {
        "docker-compose.yml",
        "docker-compose.dev.yml",
        "docker-compose.prod.example.yml",
    }
)


def normalize_paths(paths: Iterable[str]) -> set[str]:
    return {path.strip().replace("\\", "/") for path in paths if path.strip()}


def is_product_path(path: str) -> bool:
    return path in ROOT_PRODUCT_FILES or path.startswith(PRODUCT_PREFIXES)


def missing_tracking_files(paths: Iterable[str]) -> list[str]:
    """Return required living files absent from a product-changing diff."""

    changed = normalize_paths(paths)
    if not any(is_product_path(path) for path in changed):
        return []
    return sorted(TRACKING_FILES - changed)


def git_changed_files(diff_args: Sequence[str]) -> list[str]:
    result = subprocess.run(
        ("git", "diff", "--name-only", "--diff-filter=ACMRD", *diff_args),
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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument(
        "--staged",
        action="store_true",
        help="Check the staged diff (for pre-commit).",
    )
    source.add_argument(
        "--base-ref",
        help="Check BASE_REF...HEAD (for pull-request CI).",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        paths = (
            git_changed_files(("--cached",))
            if args.staged
            else git_changed_files((f"{args.base_ref}...HEAD",))
        )
    except RuntimeError as exc:
        print(f"feature-tracking: {exc}", file=sys.stderr)
        return 2

    missing = missing_tracking_files(paths)
    if missing:
        print(
            "Product-code changes must update the living implementation records.",
            file=sys.stderr,
        )
        for path in missing:
            print(f"  missing: {path}", file=sys.stderr)
        print(
            "Update both files with the plan state, evidence, and completion impact; "
            "then stage them with the feature.",
            file=sys.stderr,
        )
        return 1

    print("Feature tracking check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
