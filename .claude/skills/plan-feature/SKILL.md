---
name: plan-feature
description: Create a concise implementation plan for a feature before editing files.
tools:
  - Read
  - Glob
  - Grep
  - Bash
  - ExitPlanMode
---

# Plan Feature

1. Inspect relevant code and docs (`docs/specs/`, `docs/architecture/`).
2. Restate the user goal.
3. Identify affected frontend, backend, database, cache, scheduler, and Docker layers.
4. Identify API contract changes.
5. Identify tests to add/update — include RLS/segregation tests where roles or lines are touched.
6. Identify migration and rollback risks.
7. Produce a plan with small implementation steps.
8. Do not edit files until implementation is approved or requested.
