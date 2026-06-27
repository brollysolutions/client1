# ADR-0001: Single Postgres DB with `business_line` discriminator + Row-Level Security

- **Status:** Accepted
- **Date:** 2026-06-26
- **Deciders:** Project Lead, Development Team
- **Source:** master ERD + Auth/Admin/Client system designs

## Context

The platform runs two strictly segregated business lines (Loans, Real Estate) with six roles.
The SRS requires that loan and real-estate data never cross-contaminate (FR-1.x), enforced at the
application level (NFR-2.1). We need segregation without the operational cost of two databases.

## Decision

Use one PostgreSQL database. Every business-scoped table carries an immutable `business_line`
(`loans` | `real_estate`) set at record creation. Access is enforced by Postgres Row-Level
Security, driven by per-request session settings (`app.user_uuid`, `app.role`, `app.business_line`)
populated from JWT claims:

- **Client** policies filter own-records (`user_uuid`) and **drop** the line predicate — a client
  may be `both` and no record is ever tagged `both`.
- **Staff / Agent** policies keep the `business_line` predicate (single-line).
- **Admin** policies bypass the line filter.

`business_line` enum is `{loans, real_estate, both}`, NOT NULL on `users` with a role CHECK:
`both` allowed for admin/sub_admin/client; single line required for agent/telecaller/employee.

## Consequences

- Segregation is enforced in the database, not just the UI. App-layer checks remain as defense-in-depth.
- Every new business-scoped table must `ENABLE ROW LEVEL SECURITY`, carry `business_line`, and ship policies.
- Admin's two non-RLS constraints (no agent-lead reassignment FR-4.6; owner-edit limits FR-2.8) stay app-level.

## Alternatives considered

- **Two databases / schemas per line** — stronger physical isolation but doubles ops, complicates
  cross-line Admin/Sub Admin and shared auth. Rejected for v1.
- **App-layer filtering only** — single point of failure; one missed `WHERE` leaks data. Rejected.
