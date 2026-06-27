---
paths:
  - "apps/api/app/jobs/**"
  - "apps/api/app/scheduler/**"
  - "apps/api/app/main.py"
  - "docker-compose*.yml"
---

# APScheduler Rules

- In production, run APScheduler in a dedicated scheduler service.
- Do not start schedulers in every API replica.
- Jobs must be idempotent.
- Jobs must log start, success, failure, duration, and correlation id.
- Long jobs should enqueue work to a worker instead of blocking the scheduler.
- Use Redis locks carefully with TTL and failure behavior.
- Add tests for duplicate-trigger protection.

Known scheduled jobs for this product:
- Agent-lead expiry: unconverted agent leads flip to `expired` and return to the open pool (FR-4.6).
- Retention purge: permanently purge de-linked retained financial records after 7 years (SRS 5.1).
