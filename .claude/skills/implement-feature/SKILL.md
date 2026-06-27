---
name: implement-feature
description: Implement an approved feature as the smallest correct diff across the stack, then verify.
tools:
  - Read
  - Glob
  - Grep
  - Edit
  - Write
  - Bash
---

# Implement Feature

Order of work (vertical slice): spec → DB model + migration → service → route → schemas → tests →
OpenAPI → typed client → frontend page (loading/empty/error/success states) → E2E → verify.

Rules:
- Smallest useful diff; preserve existing architecture and API contracts unless justified.
- Keep routes thin; business logic in services; Pydantic schemas at boundaries.
- Honour the line-segregation + RLS invariants (set session context; line-tag every record).
- Regenerate OpenAPI + client if the contract changed.
- Run `./scripts/verify.sh --changed` and report evidence.

Finish with: files changed, checks run, what passed, what was not verified, remaining risks, next action.
