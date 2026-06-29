#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-full}"

if [[ ! -f apps/web/package.json ]]; then
  echo "==> Web not initialized yet (no apps/web/package.json) — skipping web verify."
  exit 0
fi

if ! command -v pnpm &>/dev/null; then
  echo "==> pnpm not in PATH — skipping web verify (CI runs this via corepack)."
  exit 0
fi

cd apps/web

echo "==> Web install check"
pnpm install --frozen-lockfile

echo "==> Web lint"
pnpm lint

echo "==> Web typecheck"
pnpm typecheck

echo "==> Web tests"
pnpm test



echo "==> Web build"
pnpm build
