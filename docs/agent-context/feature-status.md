# Feature implementation status

Status: **Derived living implementation ledger**

As of: **2026-08-07**

Evidence baseline: `ce3baa3` ([PR #147](https://github.com/brollysolutions/client1/pull/147))

## Purpose and authority

This file answers what is implemented and what remains against the 80
functional requirements in the approved SRS v1.2. It is derived from current
code, migrations, tests, recent history, and
[`current-implementation-state.md`](current-implementation-state.md). It does
not rewrite or replace the approved SRS or feature list.

Status meanings:

- **Complete**: the current repository has end-to-end implementation and
  relevant automated evidence for the requirement, subject to normal release
  verification.
- **Partial**: a usable slice exists, but at least one material part of the
  requirement is absent.
- **Not started**: no implementation satisfying the requirement was found.

This is code-coverage status, not a production-readiness or deployment claim.
Manual acceptance testing, infrastructure readiness, operational runbooks, and
live-provider configuration are assessed separately.

## Completion snapshot

| Measure | Result |
| --- | ---: |
| Complete requirements | 57 / 80 (71.25%) |
| Partial requirements | 18 / 80 (22.5%) |
| Not-started requirements | 5 / 80 (6.25%) |
| Weighted implementation coverage | **82.5% (approximately 83%)** |

Weighted coverage gives each Complete item 1 point and each Partial item 0.5
points: `(57 + 18 x 0.5) / 80 = 82.5%`. The weighting is a planning aid, not
an estimate of calendar time: a single security-sensitive gap can require more
work than several completed UI requirements.

## Delivered implementation

- **Managed property/media submissions** (FR-7.3, FR-13.1 through FR-13.4,
  OI-002) is delivered in [PR #147](https://github.com/brollysolutions/client1/pull/147).
  The approved slice
  adds Client/Lead submission, Admin-only approval, private managed images and
  reviewer PDFs, approved public property images, quotas, content verification,
  owner/business-line RLS, and storage lifecycle cleanup. Videos, general media
  galleries, and feedback attachments remain explicit non-goals for this PR.

## Status by feature area

| Feature area | Complete | Partial | Not started | Coverage notes |
| --- | ---: | ---: | ---: | --- |
| Platform and segregation (FR-1.x) | 4 | 1 | 0 | Core line tagging, routing, RLS, dashboards, APIs, and real-estate media paths exist; universal coverage still needs review for future media purposes. |
| Roles and access (FR-2.x) | 7 | 2 | 0 | Six role surfaces, server/RLS guards, and Admin-managed closed-catalogue field visibility exist; Admin coverage and edit ownership are not exhaustive. |
| Authentication (FR-3.x) | 4 | 0 | 1 | OTP/password/session flows, dual-line client identity, and support-assisted mobile change exist; optional email does not match the baseline. |
| Leads (FR-4.x) | 4 | 2 | 0 | Capture, assignment, ownership, fixed Agent expiry, and Agent/Telecaller workflows exist; automatic direct/Agent assignment remains incomplete. |
| Agent registration (FR-5.x) | 4 | 0 | 0 | OTP-verified application, KYC, Admin review, Agent ID, and owned-lead contact access exist. |
| Loans (FR-6.x) | 6 | 0 | 0 | Public pages/calculators, applications, configurable products/banks, progression, transactions, and fee cashback exist. |
| Real estate (FR-7.x) | 4 | 1 | 0 | Catalog, managed property submissions/media, inquiries, visits, deals, review, and employee work exist; vehicles remain incomplete. |
| Commissions (FR-8.x) | 3 | 0 | 0 | Manual Admin entry, Agent earnings, approval, RazorpayX, and cheque/manual paths exist. |
| Referrals (FR-9.x) | 5 | 0 | 0 | Client codes, attribution, conversion accrual, Admin payout, ledger, and Sub Admin rules exist. |
| Payments (FR-10.x) | 3 | 1 | 0 | Money-purpose boundaries and payout controls exist; gateway/method breadth is narrower than specified. |
| Notifications (FR-11.x) | 2 | 1 | 0 | In-app and web push plus Admin major-action notifications exist; email/event redirect coverage is incomplete. |
| Banners/personalization (FR-12.x) | 0 | 3 | 1 | Banner lifecycle, targeting fields, approval, images, and deep links exist; authenticated targeting and context-driven placement do not. |
| Media/uploads (FR-13.x) | 0 | 4 | 0 | Secure purpose-specific image/PDF flows and property camera capture exist; unified per-line galleries, feedback attachments, video, and broader retention remain incomplete. |
| Support (FR-14.x) | 4 | 0 | 0 | Central tickets, WhatsApp route, Admin triage/resolution, and structured mobile-change fulfilment exist. |
| Contact privacy (FR-15.x) | 4 | 0 | 0 | Agent-owned and Telecaller-assigned mobile access is locked; Employee raw/deny/provider-neutral invitation modes and least-data projection are enforced server-side. |
| Analytics (FR-16.x) | 0 | 3 | 0 | Weekly/monthly reporting, filters, sorting, summaries, and CSV exist; Excel and group/team slices remain. |
| Profile/account (FR-17.x) | 3 | 0 | 1 | Profile/settings, transactions/support, deletion, retention, and Admin removal exist; required demographic/income fields do not. |
| Location (FR-18.x) | 0 | 0 | 2 | No consented login-location personalization or map/GMB integration seam was found. |
| **Total** | **57** | **18** | **5** | **80 requirements** |

## Done

The following requirements are complete on the evidence baseline:

- Platform and access: FR-1.2 through FR-1.5; FR-2.1; FR-2.3 through
  FR-2.7; and FR-2.9. Evidence includes `app/core/deps.py`, profile models, RLS
  migrations, role dashboards, Admin field-visibility APIs/UI, server-side
  response projection, policy audit, and cross-role/cross-line tests.
- Authentication: FR-3.1, FR-3.2, FR-3.4, and FR-3.5 as amended by CS-001.
  Evidence includes OTP/password/session flows, dual profiles, replacement-number
  OTP intake, platform-Admin maker/checker review, session-generation revocation,
  linked-contact updates, collision rollback, and API/RLS/concurrency tests.
- Lead operations: FR-4.1, FR-4.4 through FR-4.6. Evidence includes the lead
  spine, Admin assignment/release, Agent-owned lead APIs, Telecaller follow-up,
  fixed first-attribution deadlines, the idempotent expiry scheduler, audit and
  notifications, Agent history/countdown UI, and API/RLS/concurrency tests;
  delivery is recorded in [PR #144](https://github.com/brollysolutions/client1/pull/144).
- Agent lifecycle: FR-5.1 through FR-5.4. Evidence includes public agent
  application intake, restricted uploads, Admin approval/rejection, Agent
  codes, Agent dashboards, and owned-lead visibility tests.
- Loans: FR-6.1 through FR-6.6. Evidence includes public loan/calculator
  routes, application progression, configurable loan types/banks, Telecaller
  transaction entry, documents, and processing-fee cashback.
- Real-estate core: FR-7.2 through FR-7.5. Evidence includes managed
  Client/Agent/Sub Admin property submission, Admin-only review, private/public
  media lifecycle, property deals, site visits, employee tasks/documents,
  client progress surfaces, and the absence of any property-payment collection
  path.
- Money programs: FR-8.1 through FR-8.3; FR-9.1 through FR-9.5; FR-10.1,
  FR-10.2, and FR-10.4. Evidence includes manual commission agreements,
  client-only referral attribution, controlled payout creation/approval,
  idempotent settlement, ledger linking, and audit/reconciliation tests.
- Notifications: FR-11.1 and FR-11.3. Evidence includes in-app feeds,
  browser push subscriptions/delivery, Admin major-action notifications, and
  Admin broadcast.
- Support and communication: FR-14.1 through FR-14.4 and FR-15.1 through
  FR-15.4. Evidence includes central support tickets, structured mobile-change
  fulfilment, Admin triage, existing browser WhatsApp links, locked
  Agent/Telecaller mobile rules, Admin-controlled least-data projection, and
  expiring/revocable provider-neutral Employee invitations. No WhatsApp API
  integration is present or planned by this slice.
- Account lifecycle: FR-17.1, FR-17.3, and FR-17.4. Evidence includes
  role-aware settings/navigation, transaction and support surfaces,
  password-confirmed self-deletion, Admin deletion, de-linking, and seven-year
  retention purge behavior.

## Remaining

| Requirement | Status | Implemented slice | Remaining work |
| --- | --- | --- | --- |
| FR-1.1 | Partial | Most domain records are server-stamped with one line. | Cover the not-yet-built media/gallery paths and audit any nullable legacy classification. |
| FR-2.2 | Partial | Admin dashboards cover users, leads, tasks, agents, loans, deals, payouts, content, audit, and reports. | Complete the requirement's exhaustive view/update coverage and verify every surface in Admin UI. |
| FR-2.8 | Partial | Agent pre-assignment editing, client profile editing, and Admin operational edits exist. | Define and enforce provenance-based edit ownership consistently across all submitted detail types. |
| FR-3.3 | Not started | Registration supports name, mobile, and email. | Reconcile the approved optional-email requirement with the current mandatory unique email/security flow before changing code. |
| FR-4.2 | Partial | Agents create attributed leads; Admin can assign a Telecaller. | Decide and implement automatic assignment behavior and client-account/invite binding where required. |
| FR-4.3 | Partial | Direct registration captures a lead and creates both client profiles. | Capture explicit requirement intent and implement deterministic per-line Telecaller assignment without cross-line leakage. |
| FR-7.1 | Partial | Listing, inquiry, visit, and property-deal workflows exist. | Add the unresolved vehicle-arrangement workflow. |
| FR-10.3 | Partial | RazorpayX VPA/bank payouts and manual cheque records exist. | Decide whether RuPay and multi-gateway routing are still required, then implement provider-neutral method support. |
| FR-11.2 | Partial | Notifications and banners support `href`/deep links. | Audit every event, add missing links, and decide which non-auth email notifications are required. |
| FR-12.1 | Partial | Default, personalized, and action banner types and lifecycle fields exist. | Add an authenticated serving path that safely evaluates personalized audiences. |
| FR-12.2 | Partial | Banners carry line/type/audience metadata and approved public banners render. | Serve correct client-line and Agent incentive banners after authentication. |
| FR-12.3 | Partial | Sub Admin creates banners; Admin approval gates public serving. | Serve personalized content only to eligible logged-in users and test negative targeting cases. |
| FR-12.4 | Not started | Offers are line-scoped and schedulable. | Define consented activity/location/business signals and implement auditable placement rules. |
| FR-13.1 | Partial | Real-estate property submissions now have an owned private review gallery and approved public image gallery. | Add the separate Loans gallery and any other approved per-line gallery surfaces. |
| FR-13.2 | Partial | Agent KYC, loan/task documents, banners, and property submissions have managed upload flows; property submission supports browser camera capture. | Add approved feedback/media attachments and camera capture to other applicable journeys. |
| FR-13.3 | Partial | Managed property media constrains images/PDFs and verifies content signatures; other current flows also constrain types. | Define safe video types, size/duration limits, transcoding/serving policy, malware scanning, content checks, and image metadata normalization. |
| FR-13.4 | Partial | Property media enforces quotas, upload rate limits, canonical snapshots, orphan/rejection/promotion cleanup, inactive-public cleanup, and account-deletion cleanup. | Apply consistent controls to every media purpose and define approved reviewer-document retention. |
| FR-16.1 | Partial | Weekly/monthly buckets, date filters, and CSV export exist. | Add Excel export or explicitly amend it out of scope. |
| FR-16.2 | Partial | Reports filter by one Agent and business line. | Add saved/explicit Agent-group and team filters. |
| FR-16.3 | Partial | Lead/loan/deal counts and per-Agent performance with sorting exist. | Add agreed per-team summaries and selective group views. |
| FR-17.2 | Not started | Registration captures name, mobile, and mandatory email. | Decide when and how to capture gender, income, occupation, and address with PII minimization and edit rules. |
| FR-18.1 | Not started | No login-location capture is present. | Define opt-in, purpose, precision, retention, fallback, and deletion behavior before implementation. |
| FR-18.2 | Not started | Address-based properties and visits exist, but no map seam is defined. | Decide whether maps/GMB remain in v1 and design a provider boundary without exposing unnecessary location data. |

## Evidence map

Use these areas when re-validating a status change:

- Auth and profiles: `apps/api/app/api/v1/auth.py`,
  `apps/api/app/services/auth_service.py`, profile/user models, auth tests.
- Authorization and segregation: `apps/api/app/core/deps.py`,
  `apps/api/app/db/session.py`, Alembic RLS migrations, `test_*_rls.py`.
- Operational modules: API routes/services/models plus their matching web
  feature, generated contract, and API/web tests.
- Money and retention: payout/referral/commission/cashback/account-deletion
  services, scheduler jobs, migrations, audit tests, and `SECURITY.md`.
- Public/CMS: public catalog service, banner/offer/content/property APIs,
  CMS scheduler jobs, and public rendering tests.

## Mandatory maintenance

Every product-code change under `apps/`, `packages/contracts/`, `infra/`,
`scripts/`, or a root Docker Compose file must update both this file and
[`implementation-plan.md`](implementation-plan.md) in the same commit or PR.

At feature start:

1. Re-check the affected requirement against current code/tests and mark the
   plan item **In progress**.
2. Record the feature branch/PR placeholder, assumptions, and intended
   verification.
3. Tell the user the recommended Codex model and reasoning effort before the
   first implementation edit.

Before shipping:

1. Change only statuses supported by fresh code/test evidence.
2. Recalculate the totals and weighted coverage when a status changes.
3. Link the implemented evidence and PR, move the plan item to **Done** or
   return it to **Planned**, and select the next priority.
4. Never mark a requirement Complete from scaffolding, filenames, or a passing
   unrelated test.
