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
if [[ -f alembic.ini ]]; then
  uv run alembic heads
else
  echo "alembic.ini not found — skipping Alembic check."
fi

