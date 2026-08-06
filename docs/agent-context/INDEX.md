# Agent reference document index

Use this catalogue before relying on a supplied document. The SRS and aligned
feature list are the approved product baseline; system-design documents and the
master ERD remain advisory where they contain proposals or open items. Current
code, migrations, tests, `SECURITY.md`, and later explicit user decisions still
govern implementation details.

| Document | Source/provenance | As-of date | Authority | Applies to | Known conflicts or superseded sections |
| --- | --- | --- | --- | --- | --- |
| [`loans-real-estate-srs-v1.2.md`](loans-real-estate-srs-v1.2.md) | User-provided original: `Loans_RealEstate_SRS_v1_2.md` | 2026-06-25 | authoritative | Platform-wide product and non-functional requirements | Approved baseline, but implementation/security details must be reconciled with `SECURITY.md`; see notes below. |
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

Rules:

- Preserve the source faithfully; do not silently rewrite a supplied document to match the code.
- Mark transcriptions or summaries as derived, and retain a link/name for the original.
- Reconcile claims against current code, tests, migrations, and explicit user instructions before implementation.
- Surface material conflicts. Do not guess which conflicting requirement wins.
- Never place credentials, production exports, customer PII, KYC files, or confidential data not intended for repository access here.
