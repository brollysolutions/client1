#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-full}"

echo "==> Verify mode: $MODE"

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
