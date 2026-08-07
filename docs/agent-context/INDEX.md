# Agent reference document index

Use this catalogue before relying on a supplied document. The SRS and aligned
feature list are the original approved product baseline; the derived current-state
register records later explicit decisions that preserve implemented behavior.
System-design documents and the master ERD remain advisory where they contain
proposals or open items. Current code, migrations, tests, `SECURITY.md`, and
later explicit user decisions still govern implementation details.

| Document | Source/provenance | As-of date | Authority | Applies to | Known conflicts or superseded sections |
| --- | --- | --- | --- | --- | --- |
| [`implementation-plan.md`](implementation-plan.md) | Derived living plan from approved requirements, current implementation evidence, and the 2026-08-06 planning request | 2026-08-06 | operational planning record; not product authority | Prioritized remaining work, model/effort recommendations, delivery and maintenance rules | Must defer to the SRS, feature list, current implementation amendments, security policy, and later explicit decisions. |
| [`feature-status.md`](feature-status.md) | Derived requirement-by-requirement assessment of current code, migrations, tests, and history | 2026-08-06 | operational status record; not product authority | Completion coverage, done list, remaining gaps, and implementation evidence | Percentage is weighted requirement coverage, not time, release readiness, or production deployment status. |
| [`current-implementation-state.md`](current-implementation-state.md) | Derived from current code/tests/history, supplied sources, and explicit user approval to preserve completed behavior | 2026-08-07 | authoritative for the listed amendments | Platform-wide implementation decisions, resolved design items, and open gaps | Supersedes only the conflicts explicitly identified as CS-001 through CS-006; it does not replace the source SRS. |
| [`loans-real-estate-srs-v1.2.md`](loans-real-estate-srs-v1.2.md) | User-provided original: `Loans_RealEstate_SRS_v1_2.md` | 2026-06-25 | authoritative | Platform-wide product and non-functional requirements | Original baseline. CS-001 supersedes registration-time line selection; CS-002 supersedes green/amber UI accents. Security details remain governed by `SECURITY.md`. |
| [`loans-real-estate-feature-list-v1.2.md`](loans-real-estate-feature-list-v1.2.md) | User-provided original: `Loans_RealEstate_Feature_List_v1_2.md` | 2026-06-25 | authoritative | Platform-wide feature scope | Declares itself aligned with SRS v1.2; SRS wins if wording differs. |
| [`auth-system-design.md`](auth-system-design.md) | User-provided original: `Auth_System_Design.md` | 2026-08-06 (supplied file timestamp; no document date) | advisory | Authentication, onboarding, sessions, roles, Redis and RLS handoff | Contains open items and pending sign-off; schema/session details differ from current implementation in places. |
| [`client-dashboard-system-design.md`](client-dashboard-system-design.md) | User-provided original: `Client_Dashboard_System_Design.md` | 2026-08-06 (supplied file timestamp; no document date) | advisory | Client dashboard and client-owned journeys | Contains open product items and earlier table/status names; see notes below. |
| [`agent-dashboard-system-design.md`](agent-dashboard-system-design.md) | User-provided original: `Agent_Dashboard_System_Design.md` | 2026-08-06 (supplied file timestamp; no document date) | advisory | Agent dashboard, leads, submissions and earnings | Contains open product items; current routes/models/tests govern implemented behavior. |
| [`employee-dashboard-system-design.md`](employee-dashboard-system-design.md) | User-provided original: `Employee_Dashboard_System_Design.md` | 2026-08-06 (supplied file timestamp; no document date) | advisory | Employee dashboard, tasks, visits and document work | Its task-assignment reconciliation is substantially implemented, but remaining open items are not approved decisions. |
| [`telecaller-dashboard-system-design.md`](telecaller-dashboard-system-design.md) | User-provided original: `Telecaller_Dashboard_System_Design.md` | 2026-08-06 (supplied file timestamp; no document date) | advisory | Telecaller dashboard and assigned-lead workflows | Current API, RLS migrations and tests govern implemented behavior. |
| [`sub-admin-dashboard-system-design.md`](sub-admin-dashboard-system-design.md) | User-provided original: `SubAdmin_Dashboard_System_Design.md` | 2026-08-06 (supplied file timestamp; no document date) | advisory | Sub Admin content, offers, banners and property submissions | Current implementation models Sub Admin as platform-scoped rather than by the document's unified `users.business_line = both` proposal. |
| [`admin-dashboard-system-design.md`](admin-dashboard-system-design.md) | User-provided original: `Admin_Dashboard_System_Design.md` | 2026-08-06 (supplied file timestamp; no document date) | advisory | Admin dashboard, approvals, configuration, audit and reporting | Section 2.1 is explicitly proposed/pending sign-off; current platform-scope model differs. |
| [`master-erd.mermaid`](master-erd.mermaid) | User-provided original: `master_erd.mermaid` | 2026-08-06 (supplied file timestamp; no document date) | advisory | Consolidated logical data model | Conceptual ERD does not exactly match the implemented profile-based schema and additive migrations. |

## Reconciliation notes

- The supplied designs often describe role and line fields directly on a unified
  `users` model. The current implementation separates role-specific data into
  profiles and represents cross-line staff access with `platform_scope`; inspect
  `apps/api/app/models/user.py`, `apps/api/app/core/deps.py`, and the Alembic
  history before changing identity or RLS behavior.
- The current browser session design stores the refresh token in a scoped
  HttpOnly cookie and returns the access token to the client; see
  `apps/api/app/api/v1/auth.py` and `apps/web/lib/auth.ts`. Treat differing design
  prose as advisory rather than silently changing the implemented security model.
- Client real-estate journeys are implemented around property deals and related
  APIs rather than every conceptual name in the supplied client design. Compare
  `apps/api/app/models/property_deal.py`, `apps/api/app/api/v1/property_deals.py`,
  and their tests before implementing against the document's table names.
- The employee task spine described by the design is represented by
  `tasks.assigned_employee_profile_uuid`; see `apps/api/app/models/task.py` and
  `apps/api/alembic/versions/b2c3d4e5f6a7_add_tasks.py`.
- Several code comments cite local-only `docs/specs/*` or `docs/ai/*` files that
  are absent from the repository. Use the legacy-reference mapping in
  `current-implementation-state.md`; do not infer or recreate unseen content.

Rules:

- Before implementing a feature, read `implementation-plan.md` and
  `feature-status.md`, tell the user the recommended model and effort level,
  and mark the selected plan item in progress.
- Every product-code PR must update both living files with fresh evidence;
  repository checks enforce their co-change but cannot validate the product
  judgment inside them.
- Preserve the source faithfully; do not silently rewrite a supplied document to match the code.
- Mark transcriptions or summaries as derived, and retain a link/name for the original.
- Reconcile claims against current code, tests, migrations, and explicit user instructions before implementation.
- Surface material conflicts. Do not guess which conflicting requirement wins.
- Apply an explicit later decision only to the conflict it names; do not treat a
  narrow amendment as replacing the rest of an authoritative source.
- Never place credentials, production exports, customer PII, KYC files, or confidential data not intended for repository access here.
