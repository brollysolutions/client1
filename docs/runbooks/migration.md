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
