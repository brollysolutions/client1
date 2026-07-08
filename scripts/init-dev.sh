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
  # docker-compose.yml's env_file: requires this to exist; safe to be empty,
  # every setting has a dev-safe default (see .env.local.example).
  if [[ ! -f apps/api/.env.local ]]; then
    cp apps/api/.env.local.example apps/api/.env.local
    echo "==> created apps/api/.env.local from .env.local.example"
  fi
  ( cd apps/api && uv sync )
  # Fresh Postgres volumes have no tables. Without this, the first API write
  # (e.g. register) throws an unhandled 500 that Starlette returns without
  # CORS headers, which the browser reports as a CORS error instead of the
  # real "relation does not exist" cause.
  ( cd apps/api && uv run alembic upgrade head )
fi

# Web deps (once apps/web is initialized).
if [[ -f apps/web/package.json ]]; then
  ( cd apps/web && pnpm install )
fi

echo "==> init-dev complete"
