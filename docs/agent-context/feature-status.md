# Feature implementation status

Status: **Derived living implementation ledger**

As of: **2026-08-16**

Evidence baseline: `abcc1fd`
([PR #175](https://github.com/brollysolutions/client1/pull/175)), plus the
verified Admin operational-visibility work in
[PR #173](https://github.com/brollysolutions/client1/pull/173).

**Done — [PR #184](https://github.com/brollysolutions/client1/pull/184) — Sub Admin CMS workspace redesign:** the Sub Admin home now presents a 310px matched "Waiting on Admin"/referral-payout row and a filtered full-screen approval workspace. Referral rules, banners, offers, and website content now provide summary metrics, bounded local filters and paging over already-authorized records, full-screen create/edit lifecycle workspaces, and discard confirmation. Banners and offers preview their public and authenticated-dashboard presentations; website content has an escaped plain-text public preview plus a placement/lifecycle guide. Existing API/RLS authorization, business-line isolation, audience grammar, banner approval, offer/content lifecycle, safe-link rules, and Admin-only payout execution remain unchanged, so requirement completion stays at 99.4%. Fresh evidence: lint, strict typecheck, all 337 web unit tests, the existing five-route Sub Admin authoring browser test, and a new live-stack four-workspace/guide Playwright journey pass. The production build compiles, validates types, and generates all 93 pages before the known Windows standalone `EPERM` symlink failure; host-side public fetches cannot resolve the Docker-only `api` hostname. Security and maintainer review found no actionable defect.

## Purpose and authority

This file answers what is implemented and what remains against the 79 active
functional requirements. The supplied SRS v1.2 contains 80 historical
requirements, but CS-010 removes FR-18.2 Map/GMB integration from the product
scope. This ledger is derived from current
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
| Complete requirements | 78 / 79 (98.7%) |
| Partial requirements | 1 / 79 (1.3%) |
| Not-started requirements | 0 / 79 (0%) |
| Weighted implementation coverage | **99.4%** |

Weighted coverage gives each Complete item 1 point and each Partial item 0.5
points: `(78 + 1 x 0.5) / 79 = 99.37%`, rounded to **99.4%**. The weighting is a planning aid, not
an estimate of calendar time: a single security-sensitive gap can require more
work than several completed UI requirements.

## Current work

**Done; PR pending — security-audit remediation:** password recovery now treats suspended/deleted identities like unknown accounts for delivery and refuses a reset-token mutation while holding the user-row lock; password reset and authenticated password change increment `session_version` and revoke refresh tokens atomically. Browser push subscriptions accept only configured HTTPS provider hosts, unsafe legacy rows are pruned without a request, redirects are disabled, and delivery is bounded to ten seconds. Employee task documents now use storage-signed 5 MiB multipart policies, an hourly per-account budget, a single-use owner/task/type-bound confirmation claim, bounded canonical bytes that cannot be replaced through the staging signature, row-locked 12-document quotas, and private no-store responses. Generated contracts and the web multipart client are current; authorization, own-task RLS, private downloads, forced-reset activation, and requirement completion remain unchanged. Fresh evidence: 128 focused API tests and final 39-, 18-, and 1-test security reruns pass; Ruff and formatting pass across 447 API files; Alembic has one head; web lint, strict typecheck, and all 338 tests pass. The production build compiles, typechecks, and generates all 93 pages before the known Windows standalone `EPERM`; host-side public fetches cannot resolve Docker-only `api`. The monolithic API suite reached its 30-minute bound without a final report and is inconclusive. Security review additionally closed confirmation-budget bypass and post-confirm object replacement; no reachable finding remains in this remediation slice.

**Done — [PR #186](https://github.com/brollysolutions/client1/pull/186) — replace Admin home Audit log frequent action:** this UI-only maintenance slice replaces the stale Audit log home action with the existing Lead assignments workspace, matching the prior Admin navigation removal. Routes, APIs, contracts, data, server-side authorization, RLS, and audit history are unchanged. The focused regression, web lint, strict typecheck, and all 338 web unit tests pass. The production build compiled, typechecked, and generated all 93 pages before the known Windows standalone `EPERM` symlink failure. Requirement completion remains 99.4%; next priority is the FR-2.2 controlled-correction/audit follow-up.

**Done — [PR #185](https://github.com/brollysolutions/client1/pull/185) — hide Admin Website content and Audit log navigation:** this UI-only maintenance slice removes those two links from the platform Admin sidebar while preserving their existing Admin-guarded dashboard routes, API clients, contracts, server-side authorization, RLS, audit data, and CMS behavior. Sub Admin retains the Website content link. The focused navigation regression, web lint, strict typecheck, and all 337 web unit tests pass. After rebuilding the local dev services, the live Admin browser scenario passed the two navigation assertions but later encountered an unrelated Operational Records search-control expectation; the production build compiled, typechecked, and generated all 93 pages before the known Windows standalone `EPERM` symlink failure. Requirement completion remains 99.4%; next priority is the FR-2.2 controlled-correction/audit follow-up.

**Done in [PR #183](https://github.com/brollysolutions/client1/pull/183) — remove Admin unassigned-lead queue UI:** the Admin Lead assignments route now retains assigned-lead oversight only; its unassigned-capacity tab and browser data fetch are removed. The Admin-home capacity metric points to Users & staff with explicit add/activate-a-matching-Telecaller guidance. This does not change the internal unassigned-list API, automatic same-line round-robin and bounded retry workflow, Admin route/API/RLS guard, assignment authority, contract, or customer data model. Fresh evidence: focused routing and navigation regressions, lint, strict typecheck, and all 330 web unit tests pass. Production compilation/typecheck/static generation of all 93 routes pass, but Windows standalone packaging cannot create required symlinks (`EPERM`) and the Docker-only `api` hostname is unavailable; an authenticated browser check could not run without a local stack.

**Done in [PR #182](https://github.com/brollysolutions/client1/pull/182) — Admin home review-queue ergonomics:** the Admin-home "Waiting on you" and Operational load panels now retain the same 270px height, with the review preview scrolling inside its panel rather than stretching the dashboard. A keyboard-accessible full-screen dialog filters the already Admin-authorized loaded preview by text, queue kind, business line, and inclusive submitted-date range; it clears filters and has a light-blue-hover close affordance. This is a UI-only read change: the `pending_review` summary contract, Admin-only route/API/RLS guard, and minimized display fields remain unchanged. The unassigned-lead metric continues to mean no active same-line Telecaller capacity; creation and the bounded retry job already assign eligible leads automatically, so no manual Agent/Telecaller assignment button is in scope. Fresh evidence: the focused 2-test regression, web lint, strict typecheck, and full 329-test unit suite pass. Production compilation/typecheck/static generation of all 93 routes pass, but Windows standalone packaging cannot create required symlinks (`EPERM`) and the Docker-only `api` hostname is unavailable; an authenticated browser check could not run without a local stack.

**Delivered in [PR #180](https://github.com/brollysolutions/client1/pull/180) — Admin operations filters and table experience:** Audit now has server-authorized action, line, record-type, and date filtering with generated contracts and explicit page navigation; Operational Records also uses bounded pages rather than append-only loading. Lead assignments, field tasks, loan applications, property deals, vehicle arrangements, listing approvals, agent applications, content pages, and payouts use date-range and contextual filters with bounded UI pages over their existing authorized queue results. The broadcast composer is visually refreshed without changing its server-validated recipient preview, rate limit, same-origin link, or irreversible-send controls. Users & staff now uses equally tall provisioning/access cards, a thin inner Staff Access scrollbar, and a compact paginated operational-account table; account suspension/reactivation requires a reasoned confirmation dialog and still calls the existing audited server mutation. No client-side authorization, scheduling, recipient authority, generic CRUD, RLS, or PII-projection boundary was added. Fresh evidence: API Ruff/format and generated contracts; web lint, strict typecheck, and 327 Vitest tests passed. The local API database suite is blocked by the unavailable native `greenlet` DLL; the Windows production build exceeded the three-minute cap.

**Done in [PR #177](https://github.com/brollysolutions/client1/pull/177) â€” UI-only Settings, Operational Records, filters, and form
navigation:** on `fix/ui-settings-records-navigation`, Client Settings will
retain personal-profile fields while Agent/staff Settings limits the form to
account contact details and relevant existing controls. Operational Records
will remain protected by the existing Admin-only route/API/RLS path but be
removed from the visible sidebar; its existing authorized result set gains only
local search/status filtering. Dashboard form return links will use the
established accessible link behavior with a consistent back affordance. This
slice adds no endpoint, generated contract, data, RLS, or authorization
behavior; it must preserve minimized operational-record projections and safe
route guards. Fresh evidence: 327 web unit tests, lint, strict typecheck, focused
Admin/Employee/Sub Admin Playwright coverage, and `git diff --check`; the local
production build exceeded the five-minute execution cap without a result.

**Delivered in [PR #176](https://github.com/brollysolutions/client1/pull/176)
â€” notification unread-state synchronization (FR-17.1):** on
`security/operational-identity-auto-assignment`, one
dashboard-scoped client source now synchronizes the shared bell, preview, and
notification page. Single-read and mark-all mutations optimistically update the
same snapshot, then refetch the server-authoritative count; an out-of-order
count response cannot overwrite a newer request. Mutation failures restore the
prior snapshot and refetch. The existing owner-only API/RLS boundary and safe
local notification links are unchanged; no producer, endpoint, contract, or
authorization behavior was added. Fresh evidence: three focused state
regressions, 324 web unit tests, lint, strict TypeScript, and all nine live
role/navigation Playwright scenarios. The Windows production build compiled,
typechecked, and generated all 93 pages, but cannot finish standalone output in
this environment because Windows denies the required symlink (`EPERM`).

**Delivered in [PR #175](https://github.com/brollysolutions/client1/pull/175)
— fail-closed operational identity and automatic Employee assignment:** the
`security/operational-identity-auto-assignment` branch now
prevents profile-less identities from receiving Client claims, terminates
deleted/orphaned sessions at the landing page, excludes active staff and Agents
from customer-lead queues, and preserves the normal OTP registration/login path
for Agent-introduced customers. Lead and field-work assignment are service-owned
per-line round robin workflows with durable no-capacity retry, inactive-assignee
repair, system audit events, and dual-line eligibility. Admin assignment routes
and controls are removed in favor of read-only lead/Telecaller/Employee
relationships; Admin still supplies vehicle logistics while Employees complete
their own assigned pickups. The new Employee cursor is RLS-forced, unavailable
to `api_user`, and constrained to active same-line or dual-line Employees. Fresh
focused evidence currently includes 75 auth/session/deletion/lead tests, 20
Admin lead/task tests, 27 lead/Employee/vehicle assignment tests, 12 operational
coverage tests, the Agent-introduced Client login regression, repeated migration
downgrade/upgrade with one head, API Ruff/format across 446 files, web lint,
strict TypeScript, and all 321 Vitest tests. The Windows production build
compiled, typechecked, and generated all 93 pages before the known standalone
symlink `EPERM`; Docker Desktop became unavailable during the Linux packaging
retry, so that command is unverified. The repository verifier spent 50 minutes
in its monolithic API pytest phase without emitting a report and is therefore
inconclusive, not passing. Security and diff review found no remaining reachable
authorization, cross-line, RLS, PII, concurrency, or audit defect. The
79-requirement completion score is unchanged because this work corrects and
hardens already-counted requirements rather than adding scope. The next
recommended UI defect is notification unread-state synchronization using
`gpt-5.6-terra` at High effort.

**Done in [PR #174](https://github.com/brollysolutions/client1/pull/174) — dev-seed Indian mobile-number correctness (maintenance):** one shared helper generates synthetic `+91` mobile numbers
with a ten-digit local number beginning 6–9. The Agent-application and
Telecaller dev seeds plus every affected test generator use it, and a focused
regression test locks the format. Fresh container evidence covers 52 focused
API/RLS tests; public E.164 validation, production intake, authorization, and
RLS are unchanged. The monolithic API suite exceeded the execution-host window
without a report and is therefore inconclusive, not passing.

**Done in [PR #181](https://github.com/brollysolutions/client1/pull/181) — Admin user-list legacy-email resilience (maintenance):** the
platform-Admin list must retain its `private, no-store` response and email
contract when direct local seeding has inserted a reserved-domain address that
the current strict email validator rejects. The targeted fix redacts only
malformed legacy values, rejects them in the development Admin seeder, and is
covered by 16 focused container tests plus full API Ruff/format and one Alembic
head; the monolithic API suite reached the 30-minute local bound without a
final report and is inconclusive. No role, RLS, account-deletion, or production
registration behavior changes.

The remaining **FR-2.2 Admin operational coverage audit** has an exhaustive,
test-enforced baseline across 47 mapped tables and all 68 current
platform-scope RLS policies. The visibility-remediation slice closes all eight
confirmed read gaps: soft-deleted accounts serialize with tombstone contact
values redacted, Users & staff includes per-line Client profile context, and a
dedicated paginated Admin workspace exposes minimized authentication events,
enquiries, lead activities, loan transaction history, site visits, and
transactions. Eight confirmed gaps remain: one typed approved-listing
correction and seven append-only audit-event families. Payout controls,
private-document access, secret/location minimization, immutable ledgers, and
business-line segregation remain non-negotiable compatibility constraints.

## Delivered implementation

- **Admin operational visibility remediation** (FR-2.2) is delivered in
  [PR #173](https://github.com/brollysolutions/client1/pull/173). Six dedicated,
  read-only, paginated routes require both the Admin role and platform scope
  before querying through the request's RLS-bound async session. Their explicit
  projections omit authentication IP/user-agent/detail, enquiry and visit
  contacts/messages, pickup locations, call notes, and transaction references.
  Sensitive responses are `private, no-store`. The Admin Operational records
  workspace adds lazy tabs, pagination, refresh/retry, and accessible
  loading/error/empty states; Users & staff now renders Loans/Real Estate
  profile identifiers and every valid profile lifecycle state. Deleted account
  mobile/email tombstones are returned as null while retained profiles remain
  visible as inactive history. Generated OpenAPI/TypeScript contracts are
  current. Fresh evidence passes Ruff and formatting across 440 API files, 29
  focused API/authorization/RLS tests, web ESLint, strict TypeScript, all 321
  Vitest tests, and a Linux production image build packaging all 93 routes.
  Security/self-review added the missing `pending` profile state and no-store
  headers; no reachable finding remains. The Windows host build exceeded its
  command bound without a report, while the canonical Linux build passed. The
  repository-wide verifier likewise reached its 30-minute command bound without
  emitting a report, so that aggregate run is inconclusive.
  FR-2.2 remains Partial because one controlled listing-correction gap and seven
  append-only audit gaps remain.

- **Admin operational coverage contract** (FR-2.2) is partially delivered in
  [PR #172](https://github.com/brollysolutions/client1/pull/172). An explicit
  registry maps all 47 SQLAlchemy tables to FR-2.2 domains and records
  sensitivity, least-data
  Admin view authority, supported workflow/status/configuration commands,
  API/UI paths, RLS and audit expectations, and covered/gap/protected status.
  Structural tests fail on unclassified future tables, unsafe full views of
  secrets/location/storage keys, unbounded mutation claims, or incomplete
  FR-2.2 noun mappings. Sixteen tables are confirmed gaps: eight view gaps, one
  approved-listing correction gap, and seven missing append-only audit-event
  families. Fresh Docker-network PostgreSQL/Redis evidence passes 20 tests for
  the registry, platform-scope policy structure, account suspend/reactivate,
  notification audit, listing publish/hide, safe audit details, session
  invalidation, and Client/line-scoped Admin denial. The audit also found that
  `/admin/users` cannot serialize a page containing a soft-deleted account's
  `deleted.invalid` tombstone email; the contract now marks that view as a gap.
  The platform-scope ledger was repaired to exhaustively match all 68 current
  policies without changing any policy or grant. FR-2.2 remains Partial: this
  evidence slice changes no route, contract, RLS behavior, migration, or UI.
  Full Ruff and formatting checks pass across 436 API files, Alembic reports
  one current head, and security review found no remaining reachable issue
  after requiring session/push-secret tables to have no Admin projection. The
  monolithic API regression reached its 30-minute command bound without a
  pytest report and is inconclusive rather than passing.

- **Admin operational coverage audit — user, notification, and listing slice**
  (FR-2.2) is partially delivered on
  `codex/20260810-161623-ps-d-dhanadhara-client1-docker-compose-f`. Platform
  Admin can now list operational identities and suspend/reactivate eligible
  accounts with a reason, atomic session/profile invalidation, and a safe audit
  record; no caller can change itself or the immutable Main Admin. A separate
  read-only notification-audit projection preserves recipient read state and
  excludes mobile/email. Admin can also publish or hide an approved property
  listing through a reasoned, status-only RLS action without rewriting reviewed
  facts or media. Generated contracts, API focused tests, Web TypeScript, and
  API Ruff pass; the Docker-backed focused suite exceeded its two-minute bound
  before returning a report. FR-2.2 remains Partial until the exhaustive
  user/media/listing/notification/record inventory and database evidence finish.

- **Provenance-based edit ownership** (FR-2.8) is complete in
  [PR #169](https://github.com/brollysolutions/client1/pull/169). Lead names and journey notes now retain immutable
  Agent/Client creator descriptors across capture and OTP binding. Agent edits
  remain available through assignment until Telecaller work starts; Client
  edits remain available until a terminal state; platform Admin corrections
  require an audited reason without transferring ownership. Telecaller notes
  stay in append-only activities. A row-locked shared service, command-specific
  RLS, and a database trigger enforce lifecycle, allowed columns, same-line and
  creator authority and reject ownership-descriptor planting. The new Client
  Settings card and Admin correction dialog use generated types and minimized
  `private, no-store` responses. Fresh evidence includes repeated migration
  downgrade/upgrade with one head, direct SQL denial tests, all 85 affected
  ownership/public-capture/Agent/Telecaller/lead-RLS tests, API Ruff, full web ESLint, strict
  TypeScript, all 320 Vitest tests, and a Linux production image packaging all
  92 pages. The host build also compiled/generated every page before the known
  Windows standalone-symlink `EPERM`. Security review found and remediated
  descriptor planting, stale-row, superuser capture/claim overwrite,
  direct-insert spoofing, response-minimization/cache, and silent-extra risks;
  no finding remains. The
  repository-wide verifier reached its 30-minute bound without a report and is
  inconclusive rather than passing. The sole remaining partial requirement is
  FR-2.2 Admin operational coverage.

- **Admin operational CMS coverage** (FR-2.2) is partially delivered in
  [PR #168](https://github.com/brollysolutions/client1/pull/168). The verified
  coverage inventory found that platform Admin could
  view, but not create or update, shared banners, offers, content blocks, and
  referral-bonus rules. Platform Admin can now author and correct those records
  through the existing typed routes and accessible dashboard forms; regular Sub
  Admin users remain creator-scoped. A new additive RLS migration requires both
  `role=admin` and `platform_scope=true` for the override, while preserving
  immutable business-line triggers, no-delete lifecycle behavior, and existing
  transition validation. Focused API and RLS suites were attempted but skipped
  because the PostgreSQL fixture is unavailable; full API Ruff, migration-head,
  web lint, strict typecheck, and 319 web unit tests pass. The full CI script
  reached its 30-minute cap without a report. The host web build compiled,
  typechecked, and generated all 92 routes but standalone trace export failed
  on Windows symlink `EPERM`; the browser suite's API-dependent tests reset at
  `localhost:8000` (one independent case passed). FR-2.2 remains Partial: the
  next audit must inventory the remaining user, media, listing, notification,
  and record-level Admin update surfaces and add executable database evidence.

- **AWS-inspired multi-role dashboard experience** (FR-2.1 through FR-2.7 and
  FR-17.1) is implemented in
  [PR #167](https://github.com/brollysolutions/client1/pull/167).
  Admin, Sub Admin, Telecaller, Employee, and Agent now receive a permanently
  expanded labeled desktop sidebar without a panel-toggle icon, while Clients
  retain their remembered expand/collapse preference and every role retains the
  mobile drawer. One semantic icon registry drives navigation and home
  shortcuts. Shared page-header, metric, queue, panel, status, and quick-action
  patterns give all six role homes a denser operational hierarchy without
  changing routes, permissions, API schemas, or RLS. The Employee home exposes
  Vehicle arrangements only for the active Real Estate line. Fresh evidence:
  15 focused sidebar/navigation tests, all 319 web unit tests, full lint, strict
  typecheck, a passing Linux production image with all 92 routes, and an
  eight-case live-stack Playwright role/mobile matrix. The native Windows build
  also compiled, typechecked, and generated all routes before the known
  standalone symlink `EPERM`. Coverage remains **98.7%** because this improves
  already-complete role dashboard requirements without closing FR-2.2 or
  FR-2.8. A follow-up on the same PR brings Admin Users & staff plus every Sub
  Admin banner, offer, content-block, property-submission, and referral-rule
  form into the same operational hierarchy. It preserves identity authority,
  one-time credentials, Main Admin limits and session invalidation, managed
  upload/approval boundaries, and payout separation. Fresh follow-up evidence:
  full lint and strict typecheck, all 319 unit tests, all eight live-stack
  Playwright cases with expanded Admin/Sub Admin route assertions, and a Linux
  production image packaging all 92 routes. A second follow-up completes the
  same presentation system across Client loan detail, Explore, application,
  private loan media, bank comparison, loan-officer, transaction, referral,
  notification, enquiry, site-visit, property comparison, assigned-agent,
  bookmark, and listing-submission surfaces. Referral copy feedback now appears
  inside the code tile with a check confirmation and the share action uses a
  WhatsApp glyph. Property search adds an explicit action and structured
  map-pin location picker over existing locality/city/PIN facets, without GPS
  or Map/GMB. The shared shell provides a lazy, safe-link notification preview
  on hover, focus, or click for every dashboard role. Fresh evidence: full
  ESLint, strict TypeScript, all 319 unit tests, and nine live-stack Playwright
  cases covering all six roles and the complete Client route/interaction
  matrix. The exact final-tree native build compiled, passed its internal
  lint/type phase, and generated all 92 routes before the known Windows
  standalone symlink `EPERM`; the Linux image attempt reached 15 minutes
  without a final report after Docker Desktop became unresponsive, so artifact
  export is inconclusive. API ownership, RLS, uploads, payouts, and contracts
  remain unchanged.

- **Delegated payout operations and Admin hierarchy** (FR-2.2, FR-2.3, and
  FR-10.3) are complete in
  [PR #165](https://github.com/brollysolutions/client1/pull/165). One
  migration-backed Main Admin may create at most three additional active Admin
  accounts and grant or revoke the closed `payout_requests` feature for active
  Sub Admins. Grant changes invalidate the target's access and refresh sessions;
  the next normal login receives the persisted feature in a signed claim that
  is enforced by the API and payout RLS. A granted Sub Admin may search
  recipients and create/list payout requests, but approval, rejection,
  reconciliation, and every manual-cheque action remain Admin-only. Main
  Admin-created payouts are the sole approval-free exception and retain caps,
  self-payout denial, idempotency, audit, provider, and ledger controls; payouts
  raised by a Sub Admin or additional Admin still require a different Admin.
  Evidence: migration downgrade/upgrade with one head; 4 hierarchy/grant tests,
  61 payout/API-RLS tests, 94 linked-payout/admin/auth tests, and 35 account-
  deletion tests; generated contracts; and web lint, typecheck, and all 315
  unit tests. The host production build
  compiled, typechecked, and generated all 92 pages before Windows standalone
  symlink creation failed with `EPERM`; the mounted-workspace Linux build timed
  out during output tracing, so artifact packaging remains inconclusive. The
  monolithic 1,620-test API run reached its 30-minute bound at 57% with
  order-sensitive auth/rate-limit failures; the exact affected login/IP-rate
  modules pass independently (23 tests), so the broad run is recorded as
  inconclusive rather than passing.

- **Staff line access and payout workflow corrections** (FR-1.4, FR-2.5,
  FR-2.6, FR-10.3, and FR-11.x) are complete on
  [PR #164](https://github.com/brollysolutions/client1/pull/164). Admin provisioning now offers
  Loans, Real Estate, or Both for Telecallers and Employees. Dual-line staff
  select one concrete line per request; the API validates the selector before
  installing RLS context, while assignment and ownership policies continue to
  isolate records. The Admin sidebar keeps wheel/touch/keyboard scrolling but
  hides the visual track. Pending payouts now expose viewer-specific approval
  eligibility so the maker sees a clear wait-for-another-Admin handoff while a
  different Admin retains the approval action; the server-side maker/checker,
  recipient, cap, idempotency, audit, and ledger controls are unchanged.
  Notification behavior was verification-only and needed no product change.
  Evidence: 50 notification API/RLS/link/push tests, 12 focused dual-line and
  payout integration tests, a clean migration upgrade/downgrade/upgrade cycle,
  Ruff, one Alembic head, generated contracts, web lint/typecheck, and all 313
  web unit tests. The Windows build compiled, typechecked, and generated all 92
  pages before standalone symlink creation failed with host `EPERM`; a separate
  Linux Docker build exceeded its ten-minute reporting window, so artifact
  packaging is inconclusive rather than passing.

- **Role-aware dashboard navigation** (FR-2.1 through FR-2.7 and FR-17.1) is
  complete in [PR #162](https://github.com/brollysolutions/client1/pull/162). A typed
  role/business-line capability catalogue now drives grouped sidebar navigation
  and a shared direct-route UX guard for all 52 checked-in dashboard pages.
  Client Loans/Real Estate features remain line-specific; Agent, Telecaller,
  Employee, Sub Admin, and Admin see only their existing authorized workspaces;
  and unknown or role-ineligible dashboard URLs return to the role home. API
  dependencies, platform scope, service checks, and PostgreSQL RLS remain the
  unchanged security boundary. Evidence: 9 focused navigation/route tests, all
  310 web unit tests, lint, typecheck, a passing canonical Linux production
  build, and 8 live-stack Playwright cases across all six roles plus mobile and
  Sub Admin authoring. Security and diff reviews found no remaining actionable
  issue. Coverage stays **98.7%** because this hardens existing completed role
  requirements without claiming the remaining FR-2.2 or FR-2.8 gaps.

- **Business-line classification hardening** (FR-1.1) is complete in
  [PR #160](https://github.com/brollysolutions/client1/pull/160). An exhaustive
  contract classifies every mapped table and managed-media purpose; operational
  rows now require exactly Loans or Real Estate, while staged referrals,
  platform staff, global content, audit, identity, derived, and configuration
  exceptions are explicit. Database checks, immutable tags, and parent/source
  triggers reject missing, `both`, cross-line, and bypass-session mismatches.
  Login and password recovery no longer manufacture sales leads; public intent,
  payout creation, bonus rules, reports, and web controls require a concrete
  line. Fresh evidence covers all 1,602 current API tests across isolated
  groups with corrected files rerun, ten classification tests, four clean
  installs and a migration round-trip, one Alembic head, Ruff, generated
  contracts, 301 web tests, and a Linux 92-page production build. Count-only
  preflight intentionally blocks the accumulated dev database's 424 ambiguous
  legacy leads; production rollout requires authoritative remediation. The next
  priority is provenance-based edit ownership (FR-2.8).

- **Media controls finalization** (FR-13.1 through FR-13.4) is complete in
  [PR #159](https://github.com/brollysolutions/client1/pull/159). Property and Loans workflows
  now accept bounded MP4 assets with private pending/processing states and
  purpose-specific publication rules; assigned Real Estate Employees can attach
  private sanitized images/PDFs to property-visit feedback for Admin review.
  ClamAV, Pillow, and FFmpeg provide fail-closed scanning, metadata removal,
  and H.264/AAC transcoding. RLS, ready-video database constraints, signed-link
  cache controls, quotas/rate limits, row-locked recovery, 7/90-day retention,
  orphan cleanup, and account-deletion cleanup preserve the lifecycle. Fresh
  evidence includes 117 affected API/RLS/media tests after a 1,589-test full
  API regression, 301 web tests, generated contracts, a migration round-trip
  with one head, a Linux 92-route production build, and four Playwright
  journeys. Security and correctness review findings were remediated. The
  mandated repository wrapper was attempted separately; its monolithic API
  phase reached 30 minutes without a final report, so that wrapper is
  inconclusive rather than passing.

- **Workflow-bound Loans media gallery** (FR-13.1 through FR-13.4) is
  implemented in [PR #157](https://github.com/brollysolutions/client1/pull/157). Clients see
  private image/PDF media grouped by loan application, with image preview,
  forced PDF download, camera capture, and review state. Per-owner presign
  throttling, 5 MiB/12-file caps, owner/application-bound staging keys,
  magic-byte checks, row-locked quota/replay handling, immutable canonical
  copies, no-store signed-link responses, opaque logging, legacy-key
  compatibility, deletion, and dual-namespace orphan cleanup preserve the
  security boundary. Generated contracts, 39 Loans/storage API tests, 23
  RLS/Admin-verification tests, 298 web tests, a seeded browser journey, web
  lint/typecheck, a Linux production build, tracking checks, and the one-head
  migration assertion pass. This bounded slice was subsequently completed by
  the purpose-specific video, visit-feedback, scanner, sanitizer, and retention
  work above; public Loans media, a universal asset library, and new reviewer
  roles remain non-goals.
- **Payment-method completion** (FR-10.3) is implemented in
  [PR #154](https://github.com/brollysolutions/client1/pull/154). UPI VPA and bank
  transfer remain on the provider-scoped RazorpayX path, while cashback,
  referral bonuses, and commissions can use an audited manual-cheque lifecycle.
  Approval, issuance, clearance-only ledger credit, pre-clearance failure, and
  post-clearance compensating reversal are serialized and idempotent. Raw
  destinations and cheque references are not persisted or returned; the
  additive provider/method migration, unchanged Admin-only RLS, generated
  contracts, API/web UI, security review, and database concurrency tests cover
  the completed scope. RuPay/card handling, customer/principal collection, a
  second live provider, and automatic failover remain explicit non-goals.
- **Lead assignment completion** (FR-4.2 and FR-4.3) was established in
  [PR #153](https://github.com/brollysolutions/client1/pull/153) and its automatic
  selection policy is updated in
  [PR #163](https://github.com/brollysolutions/client1/pull/163). Explicit
  Loans/Real Estate registration intent and Agent introductions create
  independent same-line journeys; active Telecallers now receive them through
  separate durable per-line round-robin cursors in stable creation order, with
  a bounded 15-minute retry when capacity is absent. OTP-proven
  registration binds same-mobile Agent leads without putting a lead ID or
  mobile in the shared link. Database uniqueness, fixed-search-path validation,
  row-locked selection, cursor zero-grant/RLS isolation, cross-line database
  validation, account-deletion closure, PII-safe audit/notifications, and
  concurrency coverage protect the workflow. Fresh evidence includes 188
  affected tests, a 25-test focused assignment/classification pass, Ruff across
  423 API files, and a migration round-trip with one Alembic head. The
  monolithic API suite exceeded 30 minutes without a final report and is
  inconclusive rather than passing; no API contract or web change was required.
- **Authenticated banner personalization** (FR-12.1 through FR-12.4 and
  FR-18.1) is implemented in
  [PR #152](https://github.com/brollysolutions/client1/pull/152). A closed
  versioned grammar evaluates consented Client journey,
  Agent activity, and optional coarse-location signals only after server-side
  identity/line validation. Private no-store dashboard placements expose
  display-only banners and Client offers; anonymous responses exclude all
  targeted content. Owner-only RLS, two-decimal latest-location storage,
  30-day purge, immediate revocation/deletion, fail-closed legacy handling,
  deterministic ranking, safe fallbacks, generated contracts, CMS controls,
  and Client/Agent browser journeys are covered by automated evidence.
- **Vehicle arrangements** (FR-7.1, OI-003) are implemented in
  [PR #149](https://github.com/brollysolutions/client1/pull/149). Clients optionally request one
  pickup during site-visit creation; platform Admin arranges transport and
  directly assigns an active real-estate Employee; the assignee completes or
  cancels it; and the owning Client follows a read-only status and safe
  post-assignment driver/vehicle projection. A dedicated row-locked state
  machine, database constraints/trigger, audit, notification, generated
  contracts, role-specific web surfaces, and API/direct-RLS tests preserve
  ownership, assignment, and business-line boundaries.
- **Registration/profile requirement alignment** (FR-3.3, FR-17.2) is
  implemented in [PR #148](https://github.com/brollysolutions/client1/pull/148). Ordinary
  Clients now register with name and an OTP-verified mobile, then may skip or
  save optional email, gender, income, occupation, and postal address. The same
  fields are editable and clearable in Profile settings, remain owner/Admin RLS
  protected, and are scrubbed during account deletion. Verified-email recovery
  remains explicit and enumeration-safe, while staff/Agent onboarding still
  attaches its mandatory email to a mobile-only identity.
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
| Platform and segregation (FR-1.x) | 5 | 0 | 0 | Every mapped table and managed-media purpose has an explicit classification mode; database checks and provenance triggers enforce concrete operational lines while preserving reviewed global/identity exceptions. |
| Roles and access (FR-2.x) | 8 | 1 | 0 | Six role surfaces, server/RLS guards, Admin-managed field visibility, and provenance-based lead-detail ownership exist; only the exhaustive Admin operational coverage audit remains partial. |
| Authentication (FR-3.x) | 5 | 0 | 0 | OTP/password/session flows, dual-line client identity, support-assisted mobile change, and mobile-first registration with optional verified email recovery exist. |
| Leads (FR-4.x) | 6 | 0 | 0 | Explicit per-line intent, deterministic per-line round-robin assignment/retry, OTP account binding, Admin fallback, ownership, fixed Agent expiry, and Agent/Telecaller workflows are implemented. |
| Agent registration (FR-5.x) | 4 | 0 | 0 | OTP-verified application, KYC, Admin review, Agent ID, and owned-lead contact access exist. |
| Loans (FR-6.x) | 6 | 0 | 0 | Public pages/calculators, applications, configurable products/banks, progression, transactions, and fee cashback exist. |
| Real estate (FR-7.x) | 5 | 0 | 0 | Catalog, managed property submissions/media, inquiries, visits, deals, review, Employee work, and dedicated vehicle arrangements are implemented. |
| Commissions (FR-8.x) | 3 | 0 | 0 | Manual Admin entry, Agent earnings, approval, and provider-scoped RazorpayX or audited cheque payouts exist. |
| Referrals (FR-9.x) | 5 | 0 | 0 | Client codes, attribution, conversion accrual, Admin payout, ledger, and Sub Admin rules exist. |
| Payments (FR-10.x) | 4 | 0 | 0 | Property/principal collection remains prohibited; controlled outbound payouts support UPI VPA, bank transfer, and manual cheque with RazorpayX as the sole automated provider. |
| Notifications (FR-11.x) | 3 | 0 | 0 | In-app, web push, Admin major-action, and verified-email transactional notifications now use audited same-origin workflow destinations. |
| Banners/personalization (FR-12.x) | 4 | 0 | 0 | Approved content lifecycle now feeds authenticated, consented, line-validated Client/Agent placements through a closed fail-closed audience grammar; anonymous responses exclude targeted rows. |
| Media/uploads (FR-13.x) | 4 | 0 | 0 | Purpose-bound property/Loans image, PDF, and MP4 flows plus assigned-Employee visit feedback enforce scanning, sanitization/transcoding, private/public state, quotas, immutable snapshots, RLS, retention, deletion, and orphan cleanup. |
| Support (FR-14.x) | 4 | 0 | 0 | Central tickets, WhatsApp route, Admin triage/resolution, and structured mobile-change fulfilment exist. |
| Contact privacy (FR-15.x) | 4 | 0 | 0 | Agent-owned and Telecaller-assigned mobile access is locked; Employee raw/deny/provider-neutral invitation modes and least-data projection are enforced server-side. |
| Analytics (FR-16.x) | 3 | 0 | 0 | **Complete** in [PR #156](https://github.com/brollysolutions/client1/pull/156): Linux PostgreSQL/Redis verification passed 30 reporting service/API/RLS tests with one Alembic head; web lint, strict typecheck, 294 unit tests, and the 92-page production build passed. |
| Profile/account (FR-17.x) | 4 | 0 | 0 | Profile/settings, optional demographic/income/address details, transactions/support, deletion, retention, and Admin removal exist. |
| Location (FR-18.x) | 1 | 0 | 0 | Explicit nested opt-in stores only the latest two-decimal point for 30 days and erases it on revocation, personalization disable, or account deletion; CS-010 removes FR-18.2 Map/GMB integration from scope. |
| **Total** | **78** | **1** | **0** | **79 active requirements** |

## Done

The following requirements are complete on the evidence baseline:

- Platform and access: FR-1.1 through FR-1.5; FR-2.1; FR-2.3 through
  FR-2.9. Evidence includes `app/core/deps.py`, profile models, RLS
  migrations, role dashboards, Admin field-visibility APIs/UI, server-side
  response projection, policy audit, and cross-role/cross-line tests.
- Authentication: FR-3.1 through FR-3.5 as amended by CS-001 and CS-005.
  Evidence includes mobile-first OTP/password/session flows, skippable optional
  email capture, verified-email-only recovery, dual profiles, replacement-number
  OTP intake, platform-Admin maker/checker review, session-generation revocation,
  linked-contact updates, collision rollback, and API/RLS/concurrency tests.
- Lead operations: FR-4.1 through FR-4.6. Evidence includes independent
  per-line journeys, explicit registration intent, deterministic round-robin
  same-line automatic assignment, bounded retry, OTP-proven Agent-lead binding,
  Admin assignment/release fallback, Telecaller follow-up, fixed
  first-attribution deadlines, audit/notifications, Agent history/countdown UI,
  and API/RLS/concurrency tests. Agent expiry was delivered in
  [PR #144](https://github.com/brollysolutions/client1/pull/144); assignment
  completion is in [PR #153](https://github.com/brollysolutions/client1/pull/153).
- Agent lifecycle: FR-5.1 through FR-5.4. Evidence includes public agent
  application intake, restricted uploads, Admin approval/rejection, Agent
  codes, Agent dashboards, and owned-lead visibility tests.
- Loans: FR-6.1 through FR-6.6. Evidence includes public loan/calculator
  routes, application progression, configurable loan types/banks, Telecaller
  transaction entry, documents, and processing-fee cashback.
- Real-estate core: FR-7.1 through FR-7.5. Evidence includes dedicated
  site-visit vehicle arrangements with Client request/read, Admin fulfilment,
  direct Employee assignment, audit/notifications, and owner/assignee RLS;
  managed Client/Agent/Sub Admin property submission, Admin-only review,
  private/public
  media lifecycle, property deals, site visits, employee tasks/documents,
  client progress surfaces, and the absence of any property-payment collection
  path.
- Money programs: FR-8.1 through FR-8.3; FR-9.1 through FR-9.5; FR-10.1,
  FR-10.2, and FR-10.4. Evidence includes manual commission agreements,
  client-only referral attribution, controlled payout creation/approval,
  idempotent settlement, ledger linking, and audit/reconciliation tests.
- Notifications: FR-11.1 through FR-11.3. Evidence includes in-app feeds,
  browser push subscriptions/delivery, Admin major-action notifications and
  broadcasts, same-origin validation at the API, email, web-rendering, and
  service-worker boundaries, plus transactional email copies only to verified
  active addresses when explicitly enabled.
- Support and communication: FR-14.1 through FR-14.4 and FR-15.1 through
  FR-15.4. Evidence includes central support tickets, structured mobile-change
  fulfilment, Admin triage, existing browser WhatsApp links, locked
  Agent/Telecaller mobile rules, Admin-controlled least-data projection, and
  expiring/revocable provider-neutral Employee invitations. No WhatsApp API
  integration is present or planned by this slice.
- Account lifecycle: FR-17.1 through FR-17.4. Evidence includes role-aware
  settings/navigation; optional, editable, and clearable gender/income/
  occupation/address details; transaction and support surfaces;
  password-confirmed self-deletion; Admin deletion; immediate profile-PII scrub;
  de-linking; and seven-year retention purge behavior.
- Media controls: FR-13.1 through FR-13.4. Evidence includes separate managed
  Real Estate and workflow-bound Loans image/PDF/MP4 galleries; assigned-
  Employee property-visit feedback attachments; private preview/download and
  approved property publication; camera capture; bounded signed uploads;
  fail-closed ClamAV scanning; Pillow/FFmpeg sanitization and transcoding;
  immutable canonical copies; owner/application/assignment binding; database
  ready-video constraints; RLS, replay, concurrency, rate-limit, retention,
  deletion/account cleanup, and orphan-cleanup tests.
- Personalization: FR-12.1 through FR-12.4 and FR-18.1. Evidence includes the
  versioned audience schema, server-side Client/Agent line proof, consented
  workflow/location matching, private display-only placements, public
  non-leakage, deterministic ranking, owner-only preference RLS, immediate
  revocation/deletion, scheduled retention, API/contract/web tests, and seeded
  Client/Agent Playwright journeys.

## Remaining

| Requirement | Status | Implemented slice | Remaining work |
| --- | --- | --- | --- |
| FR-1.1 | Complete | Every mapped table and managed-media purpose is inventoried; operational rows require one immutable Loans/Real Estate tag, parent/source copies must match, and only reviewed staged/global/identity exceptions remain nullable or allow `both`. | Preserve the exhaustive ledger and migration/negative tests for every future table, relation, content audience, and media purpose. |
| FR-2.2 | Partial | Admin dashboards cover users, leads, tasks, agents, loans, deals, payouts, content, audit, reports, and a new paginated Operational records workspace. The test-enforced contract classifies all 47 mapped tables and all 68 current platform-scope policies. All eight view gaps are closed with minimized generated contracts, soft-deleted contact redaction, per-line Client profile context, `private, no-store`, accessible UI, and fresh platform-Admin/negative-role PostgreSQL evidence. | Remediate the eight remaining tables: one typed approved-listing correction gap (`properties`) and seven append-only audit gaps (`banners`, `content_blocks`, `loan_applications`, `offers`, `property_deals`, `referral_bonus_config`, `tasks`). Preserve protected secrets/location/media, immutable ledgers, command-bound updates, RLS, and safe audit details. |
| FR-2.8 | Complete | Lead name and journey notes carry immutable creator descriptors; Agent and Client edits follow explicit lifecycle cutoffs, Admin corrections preserve ownership and require an audited reason, and Telecaller notes remain append-only activities. Service checks, row locks, command-specific RLS, and a database trigger deny cross-owner, cross-role, cross-line, lifecycle, allowed-column, and descriptor-planting bypasses. | Preserve the ownership initializer/backfill, least-data no-store response, audit-value minimization, and direct SQL denial tests when adding future editable lead-detail paths. |
| FR-4.2 | Complete | Agent-introduced leads are atomically attributed and assigned through a durable, active-only same-line round-robin cursor, queued for bounded retry without capacity, and bound to a same-mobile Client only after OTP-proven registration. | Preserve global Agent ownership, expiry deadlines, generic-link authority boundaries, stable Telecaller order, cursor isolation, and concurrency tests as the workflow evolves. |
| FR-4.3 | Complete | Registration captures explicit one/both-line intent while retaining both Client profiles; each requested journey is independently bound and assigned through its line's separate round-robin cursor without cross-line leakage. | Preserve explicit intent, per-line uniqueness, deterministic assignment ordering, and account-deletion closure. |
| FR-10.3 | Complete | Cashback, referral bonuses, and commissions support UPI VPA and bank transfer through an explicit RazorpayX provider adapter plus an audited manual-cheque lifecycle. Cheque approval does not credit the ledger; issue, clearance, failure, duplicate/concurrent settlement, and compensating reversal are server-controlled, masked, and covered by migrated database tests. | Preserve provider scoping, Admin authorization, caps, raw-destination minimization, row-lock/CAS idempotency, account-deletion retention, and the no-card/no-failover boundary when adding future providers. |
| FR-11.2 | Complete | Every notification producer, Admin broadcast, web push, public banner CTA, and transactional email action uses a same-origin relevant route; verified active email addresses can receive best-effort transactional copies when enabled. | Maintain the producer inventory as future events are added; no marketing or unverified-email delivery is implied. |
| FR-12.1 | Complete | Authenticated Client/Agent dashboards receive one eligible banner per default, personalized, and action layer through a closed, versioned, fail-closed audience grammar. | Maintain schema/version and negative-rule tests when new dimensions are proposed. |
| FR-12.2 | Complete | The server proves Client line ownership, forces Agents to their active profile line, ranks exact-line/`both` content deterministically, and keeps Agents off customer offers. | Preserve server-side line proof and role separation for future placements. |
| FR-12.3 | Complete | Sub Admin authoring and Admin banner approval validate the closed grammar; only eligible consented users receive personalized rows, with public and cross-role negatives. | Keep approval and anonymous allowlist tests alongside future CMS changes. |
| FR-12.4 | Complete | Existing workflow facts and optional coarse location drive auditable, consented banner/offer placement without clickstream or inferred demographics. | Treat any new signal source as a separately approved privacy/security change. |
| FR-13.1 | Complete | Real Estate has private review/approved public image and MP4 galleries; Loans has a private per-application image/PDF/MP4 gallery with processing and review state. | Preserve purpose-specific publication and keep Loans media private when future gallery work is proposed. |
| FR-13.2 | Complete | Agent KYC, loan/task documents, banners, property submissions, and assigned-Employee property-visit feedback have managed upload flows with applicable browser capture. | Require a separately approved purpose, audience, and retention policy for any new attachment surface. |
| FR-13.3 | Complete | Managed property, Loans, and feedback media enforce size/type/signature limits, fail-closed malware scanning, image metadata normalization, and bounded H.264/AAC transcoding before access/publication. | Preserve fail-closed production scanning and re-review codec/limit policy before accepting new formats. |
| FR-13.4 | Complete | All completed media purposes enforce quotas/rates, canonical snapshots, processing recovery, 7/90-day retention where applicable, account deletion, and scheduled orphan/lifecycle cleanup. | Add lifecycle, deletion, and orphan evidence alongside every future media purpose. |
| FR-16.1 | Complete | [PR #150](https://github.com/brollysolutions/client1/pull/150) adds formula-safe Excel export alongside the existing CSV export, with the same capped result set and truncation signal. Linux PostgreSQL/Redis verification passed the reporting service/API/RLS suite; the web production build completed. | Maintain bounded exports, formula-safe cell writing, and current verification coverage. |
| FR-16.2 | Complete | Reports filter by business line and a selected multi-Agent list; the list is the ad hoc group filter, with no persistent group/team model added. PostgreSQL-backed service/API/RLS tests passed. | Preserve the server-side platform-Admin guard and the business-line predicates when filters evolve. |
| FR-16.3 | Complete | The Agents report returns and renders Loans/Real Estate business-line team performance summaries, retaining per-Agent sorting and selective views. PostgreSQL-backed aggregate tests passed. | Preserve line-scoped team totals and anti-fan-out aggregate coverage. |
| FR-18.1 | Complete | An explicit nested opt-in stores only the latest server-rounded two-decimal point, omits stale/unavailable matches, purges after 30 days, and erases on revoke/disable/deletion without logging coordinates. | Maintain the retention job and location-free audit contract. |

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
