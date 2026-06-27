#!/usr/bin/env bash
set -euo pipefail

echo "==> Initializing local dev environment"

# Wire local git hooks (no-op if not a git repo).
if [[ -d .git ]]; then
  git config core.hooksPath .githooks
  echo "==> git hooksPath set to .githooks"
fi

# Bring up datastores for local development.
if command -v docker >/dev/null 2>&1; then
  echo "==> Starting postgres + redis (docker compose)"
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis || \
    echo "   (compose not ready yet — start services manually once apps exist)"
fi

# API deps (once apps/api is initialized).
if [[ -f apps/api/pyproject.toml ]]; then
  ( cd apps/api && uv sync )
fi

# Web deps (once apps/web is initialized).
if [[ -f apps/web/package.json ]]; then
  ( cd apps/web && pnpm install )
fi

echo "==> init-dev complete"
