---
name: work-feature
description: Deliver a repository feature or behavior change from codebase study through tests and an automatic pull request. Use when the user asks to build, add, change, refactor, or implement functionality in this full-stack codebase.
---

# Work Feature

Own the change through a reviewable PR.

1. Run the root `AGENTS.md` orientation gate. Confirm the branch is not protected, inspect status/remotes/history, and preserve unrelated work.
2. Read the closest nested instructions, `SECURITY.md`, indexed reference documents, and the full current path affected by the feature. Trace frontend, generated contract, backend, database/RLS, jobs, and tests as applicable.
3. If user behavior, scope, or a material tradeoff is unresolved, invoke `$brainstorm`/`/brainstorm`. If assumptions need aggressive challenge, invoke `$grillme`/`/grillme`. Do not use clarification as a substitute for discoverable repository facts.
4. Define acceptance criteria, non-goals, compatibility requirements, security invariants, and a verification matrix. Create a concise plan for multi-step work.
5. Add or update a test that characterizes the behavior before or alongside the implementation whenever practical. Confirm a regression test fails for the intended reason before fixing a bug.
6. Implement the smallest cohesive change using existing boundaries and patterns. Keep generated artifacts generated and migrations additive.
7. Review the implementation for authorization, RLS/business-line isolation, PII, uploads, money movement, concurrency, failure modes, accessibility, and server/client exposure as relevant.
8. Run targeted checks during iteration and the full applicable verification from `AGENTS.md` before completion. Regenerate contracts and check the single Alembic head when applicable.
9. Inspect `git diff`, `git diff --check`, and `git status`. Remove accidental debug output, secrets, unrelated files, and needless complexity.
10. Invoke `$review-pr`/`/review-pr`, address valid findings, then invoke `$ship`/`/ship` without waiting for a separate user request.

Do not stop with changed work only in the worktree. Finish with the PR URL and exact verification evidence, or report a concrete blocker that requires user/external action.
