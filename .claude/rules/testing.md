---
paths:
  - "apps/api/**/tests/**"
  - "apps/web/**/tests/**"
  - "apps/web/**/*.test.{ts,tsx}"
---

# Testing Rules

Pyramid plus contract tests.

Backend:
- unit tests for services
- integration tests for API + DB (including RLS: a role cannot read another line's / another user's rows)
- migration tests for data-affecting changes
- cache behavior tests (hit, miss, stale, invalidation)
- scheduler idempotency / duplicate-trigger tests

Frontend:
- component tests for complex components
- Playwright E2E for critical flows (register+OTP, login, role dashboards, loan/property journeys)
- visual/manual Playwright MCP inspection during development

Contracts:
- generate OpenAPI from FastAPI; generate the typed Next.js client
- fail CI if the generated contract diff is uncommitted

Add a regression test at the lowest layer that would have caught any production bug.
