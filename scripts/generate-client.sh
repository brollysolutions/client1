#!/usr/bin/env bash
set -euo pipefail

SPEC="packages/contracts/openapi/openapi.json"
OUT="packages/contracts/generated"

if [[ ! -f "$SPEC" ]]; then
  echo "==> No OpenAPI spec at $SPEC — run ./scripts/generate-openapi.sh first."
  exit 0
fi

echo "==> Generating typed TypeScript client from $SPEC -> $OUT"

# Default generator: openapi-typescript (swap for your chosen tool).
pnpm dlx openapi-typescript "$SPEC" -o "$OUT/schema.d.ts"

echo "==> Client generated. Commit $OUT alongside $SPEC."
