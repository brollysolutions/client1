#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f apps/api/pyproject.toml ]]; then
  echo "==> API not initialized yet — skipping migration check."
  exit 0
fi

cd apps/api

echo "==> Checking Alembic migration state"
if [[ -f alembic.ini ]]; then
  uv run alembic check || true
  echo "==> Current heads"
  uv run alembic heads
else
  echo "alembic.ini not found — skipping Alembic migration checks."
fi

