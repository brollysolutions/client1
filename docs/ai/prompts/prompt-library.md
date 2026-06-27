# Prompt Library

Reusable prompts from the Gold Standard workflow. Paste and adapt.

## Architecture Review
Review this architecture proposal for our FastAPI + Next.js + PostgreSQL + Redis + Docker +
APScheduler stack. Check: correctness, scaling limits, deployment risk, DB migration risk,
scheduler duplication risk, caching invalidation risk, frontend/backend contract risk,
line-segregation / RLS correctness, security and observability. Return: approved / not approved,
high-risk issues, recommended changes, ADR text if approved.

## Refactor
Refactor this area without changing behavior. Rules: characterize current behavior; identify
protecting tests; create/update tests if missing; keep public API contracts unchanged; smallest
safe refactor; run verification; summarize behavior-preservation evidence.

## Debugging
Debug this issue systematically. 1) Reproduce or explain why not. 2) Read logs/tests/code paths.
3) Form 2-3 hypotheses. 4) Test cheapest first. 5) Root cause. 6) Smallest fix. 7) Regression
test. 8) Run verification.

## Security Review
Run a security review. Check: authn, authz (RLS not UI-only), input validation, SQLi, XSS, CSRF,
SSRF, secrets exposure, unsafe logs (no PII/tokens/mobile), file upload risk, dependency risk,
rate limiting, production config. Return high/medium/low findings with exact files and fixes.

## Performance
Review for performance. Check: DB query count, indexes, N+1, cache opportunities, Redis hot keys,
API payload size, frontend bundle size, React render hotspots, scheduler runtime, Docker resource
assumptions. Suggest measurable improvements and tests.

## Build a New Page
Build the [page] for our Next.js app. Before coding: read docs/design/brand.md +
ui-principles.md; inspect existing components; use shadcn MCP; use Context7 for current APIs;
propose 2 layouts and recommend one. Requirements: App Router, shadcn/ui, Tailwind tokens only,
typed API client, responsive, loading/empty/error/success states, accessible, correct line accent,
run lint/typecheck, inspect with Playwright MCP.

## Vertical Slice
Build the first vertical slice using the gold standard workflow. Start with a spec. Then DB model
+ migration, API endpoint, tests, OpenAPI generation, typed client, frontend page,
loading/empty/error states, and verification. Keep the diff small and explain each step.

## Final Operating Rule
Do not tell me this is done until you show: 1) files changed, 2) tests/checks run, 3) what passed,
4) what was not verified, 5) remaining risks, 6) next recommended action.
