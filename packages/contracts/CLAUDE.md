# Contracts Package Guide

Scope: the API handshake between FastAPI (`apps/api`) and Next.js (`apps/web`).

FastAPI is the **single source of truth** for API contracts. The frontend consumes a generated
TypeScript client — types are never hand-duplicated.

## Layout

- `openapi/` — the exported OpenAPI JSON (`./scripts/generate-openapi.sh`).
- `generated/` — the generated TypeScript client (`./scripts/generate-client.sh`).

## Rules

- Regenerate `openapi/` whenever a public FastAPI schema/route changes.
- Regenerate `generated/` from the OpenAPI JSON; commit both.
- CI fails if the generated contract diff is uncommitted (drift guard).
- Never edit `generated/` by hand.
