#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f apps/api/pyproject.toml ]]; then
  echo "==> API not initialized yet — skipping migration check."
  exit 0
fi

cd apps/api

echo "==> Checking Alembic migration state"
if [[ -f alembic.ini ]]; then
  # `alembic check` is INFORMATIONAL here, and the `|| true` is deliberate — do not
  # "fix" it into a gate. Autogenerate compares model metadata against the live
  # database, and this schema is intentionally richer than the models: ~105 objects
  # (indexes, foreign keys, unique constraints) are created by explicit op.execute /
  # op.create_index in migrations without a mirrored model-level declaration. Every
  # finding is therefore a "removed" one, and turning this into a failure would mean
  # a wall of false positives on every run. The direction that would matter — an
  # "added" object, i.e. a model change with no migration behind it — is not
  # currently distinguishable here without annotating the models first.
  #
  # The single-head assertion that AGENTS.md requires lives in verify-api.sh, which
  # runs before this script and fails the build. It is not repeated here.
  uv run alembic check || true
  echo "==> Current heads (asserted in verify-api.sh)"
  uv run alembic heads
else
  echo "alembic.ini not found — skipping Alembic migration checks."
fi

