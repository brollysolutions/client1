---
paths:
  - "packages/contracts/**"
  - "apps/api/app/schemas/**"
  - "apps/api/app/api/**"
---

# API Contract Rules

FastAPI is the source of truth. Next.js consumes a generated TypeScript client.

Flow: FastAPI schemas/routes → OpenAPI JSON → generated TypeScript client → frontend usage → contract tests.

- When a public schema/route changes, run `./scripts/generate-openapi.sh` then `./scripts/generate-client.sh`.
- Commit both `packages/contracts/openapi/` and `packages/contracts/generated/`.
- Never hand-edit generated files.
- CI fails on uncommitted generated-contract drift.
- Identify backward-compatibility risk before changing an existing contract; prefer additive changes.
