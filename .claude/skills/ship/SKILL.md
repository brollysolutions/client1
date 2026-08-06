---
name: ship
description: Finish a completed change by verifying it, reviewing the diff, committing, pushing to the contributor fork, and creating or updating the upstream pull request. Use whenever changed work is ready, the user asks to commit/push/open a PR, or a stop hook says delivery is incomplete.
---

# Ship

Convert verified work into a reviewable PR. Never merge it.

1. Confirm the current branch is a non-protected task branch and that unrelated user changes are absent. Inspect `git status`, `git diff`, and `git diff --cached`.
2. Run the full applicable checks from `AGENTS.md` with fresh output. Include contract generation, migration-head checks, browser verification, and security review when triggered by the change.
3. Run `git diff --check`. Search the changed file list for env files, secrets, keys, dumps, generated caches, debug artifacts, or unrelated files.
4. Choose a conventional title and commit message such as `feat(scope): summary`, `fix(scope): summary`, or `security(scope): summary`.
5. Summarize user-visible/technical changes, exact verification commands, security impact, migration/contract implications, and known limitations.
6. Run the deterministic helper from the repository root:

   ```text
   uv --cache-dir .uv-cache run --no-project python scripts/agent_workflow.py finish --title "<type(scope): summary>" --commit-message "<type(scope): summary>" --verification "<commands and results>" --security "<review result or not applicable>"
   ```

   Add `--body-file <path>` only when a richer prepared PR body is needed.
7. If the helper fails, preserve its completed steps, diagnose the exact failure, and retry safely. Never use force push, bypass verification, or create a second PR for the same head branch.
8. Confirm the final worktree is clean, the branch tracks `origin`, no commits are ahead locally, and `branch.<name>.aiPrUrl` contains the PR URL.
9. Return the PR URL, commit, base/head branches, checks run, and any residual risk.
