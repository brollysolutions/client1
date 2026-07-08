#!/usr/bin/env bash
set -euo pipefail

SPEC="packages/contracts/openapi/openapi.json"
OUT="packages/contracts/generated"

if [[ ! -f "$SPEC" ]]; then
  echo "==> No OpenAPI spec at $SPEC — run ./scripts/generate-openapi.sh first."
  exit 0
fi

echo "==> Generating typed TypeScript client from $SPEC -> $OUT"

# Default generator: openapi-typescript. Pin the version so regeneration is
# deterministic — the CI contract-drift gate diffs this output against the
# committed client, so an unpinned "latest" would produce spurious drift.
pnpm dlx openapi-typescript@7.13.0 "$SPEC" -o "$OUT/schema.d.ts"

echo "==> Client generated. Commit $OUT alongside $SPEC."
