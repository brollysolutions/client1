---
paths:
  - "apps/api/**/*.py"
---

# FastAPI Backend Rules

- Keep routes thin.
- Put business logic in services.
- Use Pydantic schemas for API boundaries.
- Use dependency injection for DB sessions, settings, and auth.
- Never expose internal ORM models as public contracts.
- For errors, return stable error codes and user-safe messages.
- For new endpoints, add tests for success, validation failure, auth failure, and edge cases.
- If public API changes, regenerate OpenAPI and frontend client.
- Set the Postgres RLS session context (`app.user_uuid`, `app.role`, `app.business_line`) from
  JWT claims in a request dependency before any business query runs.
