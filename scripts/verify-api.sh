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
uv run pytest -q

echo "==> Alembic heads"
uv run alembic heads
