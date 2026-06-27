---
paths:
  - "apps/api/alembic/**"
  - "apps/api/app/db/**"
  - "apps/api/app/models/**"
---

# PostgreSQL and Migration Rules

- Every schema change needs an Alembic migration.
- Prefer expand/contract migrations for production compatibility.
- Do not drop columns/tables in the same release that stops writing them.
- Backfills must be idempotent and batchable.
- Index creation on large tables must be planned for lock behavior.
- Include rollback notes for every risky migration.
- Review generated SQL before applying.
- Add tests or migration validation for data-affecting changes.

This product:
- Every business-scoped table carries an immutable `business_line` and an `ENABLE ROW LEVEL
  SECURITY` block. Client policies filter `user_uuid` (no line predicate); staff/agent policies
  keep `business_line`; an `admin_all` bypass policy is OR'd in on every business table.
- `mobile` UNIQUE on `users`; partial-UNIQUE on `leads.mobile` WHERE status NOT IN
  ('expired','closed'); partial-UNIQUE on `loan_applications.user_uuid` for non-terminal status.
- See `docs/architecture/master_erd.mermaid` for the authoritative schema.
