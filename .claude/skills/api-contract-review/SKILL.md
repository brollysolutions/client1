---
name: api-contract-review
description: Review an API contract change for backward compatibility and frontend/backend drift.
tools:
  - Read
  - Glob
  - Grep
  - Bash
---

# API Contract Review

1. Inspect the FastAPI route, schema, service, and tests.
2. Inspect generated-client usage in Next.js (`packages/contracts/generated`, `apps/web`).
3. Identify backward-compatibility risk; prefer additive changes.
4. Confirm OpenAPI was regenerated and the typed client is current and committed.
5. Confirm contract tests cover success, validation failure, auth/authz failure, and edge cases.
6. Flag any uncommitted generated-contract drift (CI gate).

Return: approved / not approved, risks (high/medium/low), required changes.
