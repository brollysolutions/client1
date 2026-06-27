# Project Operating Guide — Loans & Real Estate Platform

You are working in a production full-stack monorepo for a **web-only Loans & Real Estate
platform**: two segregated business lines (Loans, Real Estate) in one ecosystem, six roles
(Admin, Sub Admin, Agent, Telecaller, Employee, Client), built on a single Postgres DB with a
`business_line` discriminator + Row-Level Security.

Stack:
- Backend: Python, FastAPI, Pydantic, SQLAlchemy 2, Alembic
- Frontend: Next.js App Router, TypeScript, shadcn/ui, Tailwind CSS
- Data: PostgreSQL (RLS), Redis (OTP rate-limit + JWT blacklist + selective cache)
- Runtime: Docker, Docker Compose
- Scheduling: APScheduler in a dedicated scheduler service
- SMS/OTP: 2Factor.in (Fast2SMS failover); Payments: Razorpay/UPI/RuPay + cheque

## Mission

Deliver the smallest correct production-ready change that satisfies the request.
Prefer root-cause fixes over patches.
Preserve existing architecture unless a change is explicitly justified.

## Non-negotiable invariants (this product)

- **Line segregation.** Every business record carries one immutable `business_line`
  (`loans` | `real_estate`). Staff and Agents are single-line; only Admin, Sub Admin, and
  Client may be `both`. Loan and real-estate records are never combined in one query, view, or report.
- **RLS is the wall, not the UI.** Access control is enforced at the database layer (RLS
  policies) plus the app layer — never UI hiding alone. Client policies filter own-records
  (`user_uuid`); staff/agent policies keep the `business_line` predicate; Admin bypasses the line filter.
- **Identity.** `mobile` is UNIQUE = one number, one account. Public `user_id` (`CL7K9F…`) is
  display-only and never a foreign key; all FKs use the UUID `id`.
- **No telephony.** Cloud telephony, masking, call logging/recording are out of scope.
  Telecallers dial directly; call outcomes are logged manually.
- **Money.** Payment gateway is for cashback/referral/commission payouts only — never loan
  principal or property purchase.

See `docs/specs/` (SRS, feature list) and `docs/architecture/` (ERD + per-role designs) for the full source of truth.

## Default Workflow

1. Explore before editing.
2. State assumptions if requirements are unclear.
3. Use plan mode for risky or cross-cutting changes.
4. For features, update or create a spec in `docs/specs/`.
5. For architecture decisions, update `docs/adr/`.
6. Implement the smallest useful diff.
7. Run `./scripts/verify.sh --changed` before claiming success.
8. Use a fresh reviewer agent for non-trivial changes.
9. Summarize changed files, verification evidence, and remaining risk.

## Verification Commands

- Setup: `./scripts/init-dev.sh`
- Changed-scope verify: `./scripts/verify.sh --changed`
- Full verify: `./scripts/verify.sh`
- API verify: `./scripts/verify-api.sh`
- Web verify: `./scripts/verify-web.sh`
- Generate OpenAPI: `./scripts/generate-openapi.sh`
- Generate client: `./scripts/generate-client.sh`

## Safety Rules

- Never read `.env`, `.env.*`, secrets, private keys, or production dumps unless the user explicitly asks.
- Never run destructive commands without explicit user approval.
- Never perform irreversible database operations without a migration plan and rollback notes.
- Never place secrets in code, docs, tests, logs, or memory.
- Treat production data and customer data (PII, KYC, mobile numbers) as sensitive.

## Design Rules

- Use shadcn/ui primitives before custom components.
- Use Tailwind tokens and existing CSS variables. Loans surface = **green**, Real Estate = **amber**; never mix accents on one working screen.
- Use Context7 for current framework/library docs.
- Use shadcn MCP for component lookup and installation.
- Use Playwright MCP for UI inspection when a page changes.
- Every page needs loading, empty, error, and responsive states.

## Important Context

@docs/ai/repo-map.md
@docs/ai/engineering-rules.md
@docs/design/ui-principles.md
