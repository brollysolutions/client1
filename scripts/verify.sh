#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-full}"

echo "==> Verify mode: $MODE"

if [[ -f scripts/tests/test_feature_tracking.py ]]; then
  echo "==> Feature tracking tests"
  uv run --no-project python scripts/tests/test_feature_tracking.py
fi

if [[ -f scripts/tests/test_migration_rls.py ]]; then
  echo "==> Migration RLS tests"
  uv run --no-project python scripts/tests/test_migration_rls.py
fi

if [[ -f scripts/tests/test_production_runtime.py ]]; then
  echo "==> Production runtime contract tests"
  uv run --no-project python scripts/tests/test_production_runtime.py
fi

if [[ -f scripts/tests/test_media_runtime.py ]]; then
  echo "==> Isolated media runtime tests"
  uv run --no-project python scripts/tests/test_media_runtime.py
fi

if [[ -x ./scripts/verify-api.sh ]]; then
  ./scripts/verify-api.sh "$MODE"
fi

if [[ -x ./scripts/verify-web.sh ]]; then
  ./scripts/verify-web.sh "$MODE"
fi

if [[ -x ./scripts/check-migrations.sh ]]; then
  ./scripts/check-migrations.sh "$MODE"
fi

echo "==> Verification complete"
