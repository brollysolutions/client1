---
name: production-readiness
description: Assess a change against the production readiness checklist before deploy.
tools:
  - Read
  - Glob
  - Grep
  - Bash
---

# Production Readiness

Check across:
- Backend: health endpoint, structured logs w/ request id, safe errors, reviewed migrations,
  current OpenAPI, tested auth/authz, rate limits on sensitive endpoints, observable slow queries.
- Frontend: typecheck/build pass, loading/empty/error states, validated accessible forms, E2E on
  critical flows, bundle size, user-friendly errors, no client-side secrets.
- Database: backups configured + restore tested, reversible/forward-fix migrations, reviewed
  indexes, connection pool.
- Redis: TTLs defined, memory policy understood, sensitive data avoided, locks have TTLs, invalidation tested.
- Scheduler: one dedicated service, idempotent jobs, failure alerts, duration monitoring, manual rerun path.
- Docker/Deploy: multi-stage images, non-root, health checks, env/secrets-manager config, rollback plan, smoke test.

Return: go / no-go, blocking gaps, recommended fixes.
