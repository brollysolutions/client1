# Runbook: Scheduler Jobs

**Ownership:** APScheduler runs in exactly one `scheduler` service — never inside API replicas.

## Jobs
- **Lead expiry (FR-4.6):** unconverted agent leads past `expiry_at` flip to `expired` and return
  to the open pool. Idempotent; safe to rerun.
- **Retention purge (SRS 5.1):** de-linked retained financial records older than 7 years are
  permanently purged. Idempotent; logs counts.

## Checklist (per job)
- Idempotent (can run twice without corrupting data)?
- Has a timeout? Logs start/success/failure/duration/correlation id? Emits metrics?
- Can be manually rerun? Avoids running in every API replica?

## Manual rerun
- Trigger the job function directly in the scheduler service container (document the exact command
  once `app/scheduler` exists). Confirm the idempotency guard before rerun.

## Duplicate-run handling
- If multiple scheduler instances ever run, jobs must be lock-protected (Redis lock with TTL).
  Production keeps `replicas: 1` for the scheduler service.
