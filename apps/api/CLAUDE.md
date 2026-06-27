# API App Guide

Scope: FastAPI backend in `apps/api`.

## Architecture

- Routers define HTTP boundaries only.
- Services contain business logic.
- Schemas define request/response contracts.
- Models define persistence.
- Repositories/db helpers handle database access.
- Jobs must be idempotent.
- Cache helpers must define key namespace, TTL, and invalidation.

## API Rules

- Use Pydantic schemas for all public request/response bodies.
- Use dependency injection for auth, DB sessions, settings, and services.
- Do not leak SQLAlchemy models directly as public API contracts.
- Keep OpenAPI accurate.
- If API contract changes, regenerate frontend client.

## Auth & RLS Rules (this product)

- After token validation, a request dependency sets the Postgres session context from JWT
  claims: `app.user_uuid`, `app.role`, `app.business_line`. RLS reads these — never trust
  app-layer filtering alone.
- Client-owned policies filter on `user_uuid` (own records, no line predicate — a `both`
  client owns records across both lines). Staff/Agent policies keep the `business_line`
  predicate. Admin policies bypass the line filter.
- OTP lives only in Redis (hashed), never in Postgres. SMS spend is bounded to client
  registration, client/agent password reset, and agent-application verification.
- `mobile` is UNIQUE (one account per number). Public `user_id` is display-only; FKs use UUID.

## Database Rules

- Every schema change requires an Alembic migration.
- Use expand/contract migration strategy for production.
- Review generated SQL.
- Add tests for migrations that affect existing data.

## Scheduler Rules

- APScheduler must run in the scheduler service, not every API replica.
- Jobs must be idempotent.
- Long jobs should hand work to a worker/queue.
- Use Redis locks only with TTL and explicit failure behavior.
- Example jobs for this product: agent-lead expiry → open pool (FR-4.6); 7-year PII purge of
  de-linked retained records (SRS 5.1).
