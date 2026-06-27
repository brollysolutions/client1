# Runbook: Database Migration (expand/contract)

**Trigger:** a schema change is ready to deploy.

## Preconditions
- Alembic migration reviewed (db-migration-reviewer agent) with rollback notes.
- Backup taken; restore tested in staging.
- CI green; OpenAPI/client regenerated if contracts changed.

## Steps (expand/contract)
1. Release 1: add nullable column / new table (no reads yet).
2. Release 2: write both old and new fields.
3. Release 3: backfill existing data (idempotent, batched).
4. Release 4: read from the new field.
5. Release 5: stop writing the old field.
6. Release 6: drop the old field — only after verification.

## Verify
- `./scripts/check-migrations.sh` (heads match), validation queries, app health checks.

## Rollback / forward-fix
- Prefer forward-fix. Downgrade only with explicit approval (`alembic downgrade` is deny-listed by default).

## RLS note
- New business-scoped tables must `ENABLE ROW LEVEL SECURITY`, carry immutable `business_line`, and ship policies.

## pgBouncer & Enum DDL note (ADR-0004)
- **Bypass pgBouncer:** Always run database migrations (Alembic) directly against Postgres (port `5432`), not pgBouncer (port `5433`).
- **Autocommit:** Perform enum value additions inside an autocommit block (`with_op.get_context().autocommit_block()`).
- **Rolling Restart:** Trigger a rolling restart of connection-holding services (`api`, `scheduler`) immediately after modifying enums to clear and rebuild `asyncpg` cached type mappings and OID mappings.

