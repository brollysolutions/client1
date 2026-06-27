---
name: db-migration-review
description: Review a PostgreSQL schema change / Alembic migration for safety and production sequencing.
tools:
  - Read
  - Glob
  - Grep
  - Bash
---

# DB Migration Review

Review:
- backward compatibility (expand/contract)
- locks and long-running operations
- data-loss risk
- rollback notes
- index strategy
- backfill safety and idempotency
- production deploy sequencing
- tests and validation queries
- RLS: new business-scoped tables enable RLS and carry an immutable `business_line`

Return: approved / not approved, high/medium/low risks, required changes, rollback/forward-fix plan.
