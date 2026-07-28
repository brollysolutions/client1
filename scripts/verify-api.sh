#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-full}"

if [[ ! -f apps/api/pyproject.toml ]]; then
  echo "==> API not initialized yet (no apps/api/pyproject.toml) — skipping API verify."
  exit 0
fi

cd apps/api

echo "==> API lint"
uv run ruff check .

echo "==> API format check"
uv run ruff format --check .

echo "==> API tests"
# No exit-5 tolerance: the app is initialized and has tests, so "no tests
# collected" (exit 5) is a real failure (bad testpaths / broken collection), not
# an acceptable no-op. Skips (unreachable services locally) still exit 0.
uv run pytest -q


echo "==> Alembic heads"
# Must be exactly one head. Two PRs branched off the same main commit that each
# add a migration produce a second head on merge, and from that point
# `alembic upgrade head` aborts with "Multiple head revisions are present" —
# no migration can be applied at all, including unrelated new ones. This step
# used to only *print* the heads, so that state shipped to main once already
# (PRs #120 + #123, fixed by merge revision 5b8d2432ac31). Assert, don't print.
if [[ -f alembic.ini ]]; then
  HEADS="$(uv run alembic heads)"
  echo "$HEADS"
  HEAD_COUNT="$(printf '%s\n' "$HEADS" | grep -c '(head)' || true)"
  if [[ "$HEAD_COUNT" -ne 1 ]]; then
    echo "ERROR: expected exactly 1 Alembic head, found ${HEAD_COUNT}." >&2
    echo "Resolve with: cd apps/api && uv run alembic merge -m \"<why>\" <head1> <head2>" >&2
    exit 1
  fi
else
  echo "alembic.ini not found — skipping Alembic check."
fi

