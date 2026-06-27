# Engineering Rules

The short, always-true rules. Path-scoped detail lives in `.claude/rules/`.

1. **Smallest correct diff.** Root-cause over patch; preserve architecture unless justified in an ADR.
2. **Verify before "done".** `./scripts/verify.sh --changed`; report files changed, checks run,
   what passed, what wasn't verified, residual risk, next action.
3. **Contracts are generated.** FastAPI OpenAPI → typed TS client; never hand-duplicate types; CI gates drift.
4. **Migrations are reviewed.** Alembic for every schema change; expand/contract; rollback notes; no
   silent column/table drops.
5. **Segregation is enforced in the DB.** Immutable per-record `business_line`; RLS policies, not UI
   hiding. Client = own-records; staff/agent = line-scoped; Admin = bypass.
6. **Secrets never leave the boundary.** Not in code, docs, tests, logs, or memory. PII (mobile, KYC,
   income) is sensitive.
7. **Scheduler is one service.** APScheduler runs only in the scheduler service; jobs idempotent + logged.
8. **Cache has a contract.** Namespace, version, TTL, owner, invalidation; never the only durable store.
9. **Fresh review for non-trivial change.** Use a reviewer agent / fresh context — Claude must not be the only safety system.
10. **Promote decisions.** Durable choices become ADRs and specs, not chat history.
