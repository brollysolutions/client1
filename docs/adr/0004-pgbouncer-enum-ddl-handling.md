# ADR-0004: Handling PostgreSQL Enum DDL under pgBouncer Transaction Pooling

- **Status:** Accepted
- **Date:** 2026-06-27
- **Deciders:** Project Lead, Development Team
- **Source:** master ERD, Auth/Admin/Client system designs, pgBouncer configuration

## Context

The platform uses pgBouncer in transaction pooling mode (`POOL_MODE: transaction`) for both development and production environments. While this mode is highly efficient for sharing connection handles, it creates unique challenges when executing Data Definition Language (DDL) commands for PostgreSQL enum types (such as `role_enum`, `business_line_enum`, `status_enum`, `txn_type_enum`, etc.):

1. **System Catalog Caching:** PostgreSQL backend sessions cache system catalogs like `pg_enum` and `pg_type`. When DDL commands modify enums (e.g., `ALTER TYPE ... ADD VALUE`), existing long-lived backend sessions inside pgBouncer's server pool do not instantly invalidate their cache. Consecutive transaction requests routed to different backend sessions can hit stale type mappings, leading to flaky query behavior.
2. **Client-Side Driver Codec Cache:** Database drivers (specifically `asyncpg`, which the FastAPI backend uses) query catalog tables on startup to resolve custom enum OIDs and compile python-side codecs. In transaction pooling, these client sessions are persistent. A change in the database enums will not propagate to the `asyncpg` type maps on active web workers, causing deserialization errors on newly introduced enum values.
3. **Transactional DDL Restrictions:** PostgreSQL does not permit certain enum DDL commands (like `ALTER TYPE ... ADD VALUE`) to be run inside multi-statement transaction blocks if the new value is referenced/queried in the same transaction block. This clashes with standard migration managers if transaction blocks are not managed carefully.

## Decision

To guarantee database stability, catalog correctness, and client-side compatibility during enum schema changes, the following policies are adopted:

1. **Direct Migration Connections (Bypassing pgBouncer):**
   - Database migrations (Alembic) must bypass pgBouncer and connect directly to the main PostgreSQL port (`5432`), never through the pgBouncer port (`5433`). 
   - This ensures migrations run in an isolated administrative session with full transaction control.

2. **Mandatory Container/Pool Recycling:**
   - Any deployment that applies an enum modification migration must perform a **rolling restart** of all services that hold database connection pools (`api` and `scheduler` services).
   - This forces `asyncpg` to drop existing connections and re-query the PostgreSQL system catalogs, rebuilding the OID mappings and type codecs with the new enum values.
   - The application-side `DB_POOL_RECYCLE` setting (configured to 1800s in `session.py`) serves as a secondary defense-in-depth cache invalidation mechanism.

3. **Autocommit Mode for Enum Modifications:**
   - Migration scripts that alter enums must configure Alembic to run in non-transactional/autocommit mode (`with_op.get_context().autocommit_block()`), ensuring the `ALTER TYPE ... ADD VALUE` statement runs independently outside multi-statement blocks.

## Consequences

- **Positive:** Guarantees catalog cache coherence, prevents intermittent type errors on API servers under transaction pooling, and maintains migration stability.
- **Negative/Effort:** Requires a strict operational step (rolling container restarts) during enum changes, which must be documented in runbooks and CI/CD pipelines.
- **Risks & Mitigation:** If a rolling restart is missed, clients will experience errors when resolving new enum values. This is mitigated by configuring container orchestration (e.g., Kubernetes, Docker Compose restarts) to recycle the API and Scheduler services automatically during deployment pipelines.

## Alternatives considered

- **Switching to Session Pooling:** Session pooling resolves catalog caching naturally but is rejected. It requires a dedicated PostgreSQL connection per active client connection, significantly degrading application scalability under traffic spikes and worker pool increases.
- **Relying solely on `DB_POOL_RECYCLE`:** If we only rely on the recycle timer (1800 seconds), there will be a 30-minute window where requests can randomly fail. This was rejected in favor of deterministic rolling restarts.
