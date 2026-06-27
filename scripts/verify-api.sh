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
uv run pytest -q || [ $? -eq 5 ]


echo "==> Alembic heads"
if [[ -f alembic.ini ]]; then
  uv run alembic heads
else
  echo "alembic.ini not found — skipping Alembic check."
fi

