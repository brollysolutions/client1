#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f apps/api/pyproject.toml ]]; then
  echo "==> API not initialized yet — cannot export OpenAPI."
  exit 0
fi

OUT="packages/contracts/openapi/openapi.json"
echo "==> Exporting OpenAPI to $OUT"

# Expects apps/api to expose a helper that dumps app.openapi() to stdout.
( cd apps/api && uv run python -m app.scripts.export_openapi ) > "$OUT"

echo "==> OpenAPI written to $OUT"
