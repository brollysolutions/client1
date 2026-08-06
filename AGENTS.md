# Dhanadhara engineering workflow

These instructions are the shared contract for Codex, Claude Code, and humans using either tool. Keep agent-specific files thin; change this file first when the common workflow changes.

## Non-negotiable delivery contract

1. Never make a repository change on `main`, `master`, or `prod`.
2. Before the first mutation, work on one fresh branch for one task. Use `feat/`, `fix/`, `security/`, `docs/`, `refactor/`, `test/`, `chore/`, `codex/`, or `claude/` plus a short kebab-case topic.
3. Preserve pre-existing user changes. If protected-branch changes or unrelated dirty files already exist, stop and explain instead of moving, staging, or discarding them.
4. Study the relevant code, tests, history, and reference documents before proposing an implementation. Do not infer architecture from filenames alone.
5. Implement the smallest complete change, add or update tests, run fresh verification, review the diff, commit, push to `origin`, and open or update a PR against `upstream/main` (fall back to `origin/main` when no upstream exists).
6. Never merge a PR, force-push, bypass hooks, weaken a security gate, or edit `prod` unless the user explicitly requests that exact action.
7. Do not claim completion while changes are uncommitted, unpushed, missing a PR, or supported only by stale test output.

The checked-in lifecycle hooks create a branch at the first prompt, block unsafe mutations, and continue an agent turn when changed work has not been shipped. Git hooks add a second local guard. These are guardrails, not permission to hide failures or override user approval controls.

## Repository orientation gate

Before feature, fix, refactor, migration, or security work:

- Run `git status --short --branch`, inspect `git remote -v`, and identify the base and contribution remotes.
- Read this file, the closest nested `AGENTS.md`, `SECURITY.md`, and `docs/agent-context/INDEX.md`.
- Trace the current behavior end to end: UI entry point, API client, generated contract, route, dependency/auth guard, service, model, migration/RLS policy, and relevant tests.
- Search for analogous implementations and inspect recent history for the affected area.
- State assumptions and material risks. Use `$brainstorm` or `$grillme` when requirements or tradeoffs are not settled.

For read-only questions, inspect only what is needed and do not manufacture a code change or PR.

## Architecture

- `apps/web`: Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, shadcn/Radix, Vitest, and Playwright.
- `apps/api`: Python 3.12+, FastAPI, Pydantic, async SQLAlchemy 2, Alembic, PostgreSQL RLS, Redis, and pytest.
- `packages/contracts`: committed OpenAPI output and generated TypeScript schema. The API is the source of truth.
- `infra` and Docker Compose: nginx, PostgreSQL/pgBouncer, Redis, object storage, API, scheduler, and web runtime topology.

This is a financial and real-estate system handling authentication, PII/KYC documents, payouts, role scopes, and two segregated business lines. Treat authorization and money-flow changes as security-sensitive by default.

## Implementation rules

- Follow existing boundaries and naming before introducing new abstractions or dependencies.
- Keep authorization server-side. Client-side role or JWT checks are routing hints, never access-control boundaries.
- Preserve business-line isolation and PostgreSQL RLS context. Every new table or access path must be reviewed for grants, policies, and cross-line leakage.
- Keep network and database work async in the API. Put business logic in services rather than route handlers.
- Use the generated contract types in the web app. Do not hand-edit generated contract files.
- Treat Alembic migrations as immutable after merge. New schema work needs an additive migration and exactly one head.
- Preserve Next.js server/client boundaries, accessibility, loading/error states, responsive behavior, and the established design system.
- Do not add dependencies, MCP servers, external actions, or telemetry without a concrete need and a supply-chain/security review.

## Verification

Run the narrowest relevant checks during iteration, then the full applicable gate before shipping.

- Full repository: `./scripts/verify.sh --ci`
- API: `cd apps/api && uv run ruff check . && uv run ruff format --check . && uv run pytest -q`
- One API test: `cd apps/api && uv run pytest -q app/tests/<test_file>.py`
- Web: `cd apps/web && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- Browser behavior: `cd apps/web && pnpm test:e2e`; use the pinned Playwright MCP for exploratory local verification when useful.
- Migration heads: `cd apps/api && uv run alembic heads` must report exactly one head.
- API contract changes: run `./scripts/generate-openapi.sh` and `./scripts/generate-client.sh`, then commit both generated outputs.

If a required tool or service is unavailable, run every safe check that is available and report the exact unverified command and reason in the PR. A skipped command is not a passing command.

## Security and data handling

- Read `SECURITY.md` for the threat model and review checklist.
- Never read, print, copy, edit, or commit real `.env` files, secrets, private keys, tokens, database dumps, KYC documents, or production data. Example env files are allowed.
- Never weaken RLS, auth dependencies, rate limits, audit logging, upload validation, payout idempotency, retention rules, CORS/proxy trust, or secret validation merely to make a test pass.
- Do not send private code, data, prompts, or credentials to an external MCP/tool unless that specific integration is approved and necessary.
- Review migrations, API surfaces, auth/role paths, uploads, webhooks, and money movement with `$security-review` before shipping.

## Skills and completion

- `$brainstorm`: explore and decide before implementation.
- `$grillme`: aggressively pressure-test requirements and assumptions.
- `$work-feature`: run the full study-to-PR feature workflow.
- `$systematic-debug`: reproduce, isolate, fix, and regression-test a root cause.
- `$security-review`: threat-model and audit code or a diff.
- `$review-pr`: review for actionable defects, regressions, and missing tests.
- `$ship`: verify, commit, push, and create/update the PR.
- `$ingest-context`: add user-supplied reference documents and reconcile them with current code.

Use the native invocation syntax exposed by the active agent. Skill contents under `.agents/skills` and `.claude/skills` must remain byte-for-byte identical.

Before the final response, inspect `git diff --check`, `git status`, the commit, tracking branch, and PR URL. Lead with the outcome, tests actually run, PR link, and any residual risk.
