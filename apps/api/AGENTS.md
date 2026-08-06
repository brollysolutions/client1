# API instructions

Apply the root `AGENTS.md` plus these API-specific rules.

## Study path

Trace an API change through the router in `app/api/v1`, auth/dependencies in `app/core/deps.py`, service logic in `app/services`, schemas in `app/schemas`, models in `app/models`, database context in `app/db/session.py`, Alembic history, and the closest API/RLS tests. Inspect the web client and committed contract when the endpoint is consumed by the frontend.

## Boundaries and invariants

- Keep route handlers thin and async; business rules and transactional behavior belong in services.
- Use the existing request-scoped database/RLS context. Never substitute client-provided roles, business lines, or IDs for server-derived authorization context.
- Test both positive access and forbidden/cross-tenant access for authorization or RLS changes.
- Use Pydantic request/response schemas and explicit response shapes. Avoid leaking exception text, secrets, storage keys, or sensitive fields.
- New or changed tables require grants, RLS enablement/policies, indexes/constraints where appropriate, and rollback-aware Alembic logic.
- Preserve exactly one Alembic head. Never rewrite a migration already merged to a shared branch.
- Auth, OTP, uploads, payouts, webhooks, account deletion, retention, and audit logs require a security review.

## Verification

Run targeted pytest while iterating, then `uv run ruff check .`, `uv run ruff format --check .`, and `uv run pytest -q`. For schema changes, regenerate and diff `packages/contracts` from the repository root.
