# AGENTS.md

This repository follows the Claude Code "Gold Standard Full-Stack Workflow". The authoritative
operating guide for any AI/automation agent (and humans) is **`CLAUDE.md`** at the repo root,
plus the path-scoped guides:

- `CLAUDE.md` — project operating guide, invariants, verification, safety.
- `apps/api/CLAUDE.md` — FastAPI backend guidance.
- `apps/web/CLAUDE.md` — Next.js frontend guidance.
- `packages/contracts/CLAUDE.md` — API contract handshake.
- `.claude/rules/` — path-scoped engineering rules (auto-applied by glob).
- `.claude/skills/` — reusable procedures (plan, implement, reviews, production readiness).
- `.claude/agents/` — specialist fresh-context reviewers.

## The core loop

Explore → Spec → Plan → Implement smallest diff → Verify (`./scripts/verify.sh`) → Fresh review
→ Commit → PR → CI → Deploy → Observe → Learn.

## Operating rule

Do not claim a task is done until you show: (1) files changed, (2) checks run, (3) what passed,
(4) what was not verified, (5) remaining risks, (6) next recommended action.

Product source of truth: `docs/specs/` (SRS + feature list) and `docs/architecture/` (master
ERD + per-role system designs).
