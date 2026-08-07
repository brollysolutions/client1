# Living implementation plan

Status: **Derived, actively maintained plan**

As of: **2026-08-07**

Evidence baseline: `ff7dec4` ([PR #146](https://github.com/brollysolutions/client1/pull/146))

## Outcome

Complete the approved Loans and Real Estate scope without weakening
authorization, business-line segregation, PII/KYC handling, payout controls,
or auditability. The current evidence-based implementation coverage is
approximately **83%**; see [`feature-status.md`](feature-status.md) for the
calculation and requirement-level gaps.

## Working rules

Before the first implementation edit for every feature, the agent must:

1. read this plan, `feature-status.md`, `current-implementation-state.md`, the
   approved SRS/feature list, `SECURITY.md`, and the relevant nested
   `AGENTS.md`;
2. trace the affected UI, client wrapper, generated contract, API route,
   dependency/authorization guard, service, model, migration/RLS policy, job,
   and tests as applicable;
3. tell the user the recommended Codex model and reasoning effort, with a
   one-sentence reason, before implementation begins;
4. mark exactly one plan item **In progress**, including its branch or PR; and
5. define acceptance criteria, non-goals, security invariants, and verification.

Before shipping, the same PR must update this plan and `feature-status.md` with
fresh evidence. Automation checks that both files accompany product-code
changes; human/agent review remains responsible for the truth of their content.

## Model and effort policy

Use the lowest effort that safely handles the feature. Current Codex guidance
describes GPT-5.6 Sol as the choice for complex, open-ended, high-value work and
Terra as the everyday full-stack workhorse. Higher effort is appropriate as
planning depth, sources, tradeoffs, or security impact increase.

| Work shape | Recommended model | Effort | Typical use here |
| --- | --- | --- | --- |
| Narrow, established pattern; low-risk UI/docs/test work | `gpt-5.6-terra` | Medium | Copy, bounded UI wiring, isolated test coverage |
| Bounded full-stack feature with settled behavior | `gpt-5.6-terra` | High | Reporting/export completion, notification link audit |
| Cross-stack or ambiguous feature | `gpt-5.6-sol` | High | New workflow/entity, scheduler behavior, multi-surface changes |
| Auth/RLS, PII/KYC, uploads, payouts, or complex migrations | `gpt-5.6-sol` | Extra High (`xhigh`) | Field visibility, mobile change, media, location personalization |
| Exceptional systemic redesign after smaller approaches fail | `gpt-5.6-sol` | Max | Identity/RLS redesign only; not a routine default |

Do not use Ultra by default. It introduces subagent execution and is useful
only when the user explicitly authorizes parallel agent work and the task
splits into genuinely independent streams.

The recommendation must be reassessed at feature start. The table below is a
default, not permission to skip the pre-implementation announcement.

## Prioritized backlog

Admin field visibility and contact controls are **Done** in
[PR #145](https://github.com/brollysolutions/client1/pull/145). Agent-lead expiry was delivered earlier
from the same branch in [PR #144](https://github.com/brollysolutions/client1/pull/144).
The next decision-gated priority is registration/profile requirement alignment.

| Priority | Feature / requirements | Status | Recommended model / effort | Decision gate and acceptance summary |
| ---: | --- | --- | --- | --- |
| 1 | Agent-lead expiry (FR-4.6, OI-001) | **Done** — [PR #144](https://github.com/brollysolutions/client1/pull/144) | `gpt-5.6-sol` / High | Delivered fixed 30-day first-attribution deadlines, converted/closed exclusions, indexed idempotent release, audit/notifications, RLS/deadline write denial, Agent countdown/history, seven-day legacy grace, and deferred constraint race protection. |
| 2 | Admin field visibility and contact controls (FR-2.9, FR-15.1, FR-15.4) | **Done** — [PR #145](https://github.com/brollysolutions/client1/pull/145) | `gpt-5.6-sol` / Extra High | Delivered a closed server-owned catalogue, server-side least-data projection, locked Agent/Telecaller mobile rules, Employee allow/deny/provider-neutral invitation modes, policy audit, RLS, and lifecycle/race denial tests. |
| 3 | Support-assisted mobile-number change (FR-3.4, FR-14.3) | **Done** — [PR #146](https://github.com/brollysolutions/client1/pull/146) | `gpt-5.6-sol` / Extra High | Delivered replacement-number OTP, structured identity-proof attestation, distinct active platform-Admin maker/checker approval, enumeration-safe intake, collision-safe linked-record updates, immediate race-safe session revocation, PII-minimized audit, and user notification. |
| 4 | Managed property/media submissions (FR-7.3, FR-13.1 through FR-13.4, OI-002) | **Done** — PR pending from `feat/managed-property-media` | `gpt-5.6-sol` / Extra High | Delivered Client/Lead, Agent, and Sub Admin submission; Admin-only approval; canonical private review uploads; approved public images; bounded image/PDF quotas; content verification; ownership/RLS; account-deletion cleanup; and scheduled lifecycle cleanup. |
| 5 | Registration/profile requirement alignment (FR-3.3, FR-17.2) | Decision needed | `gpt-5.6-sol` / High | Resolve optional-email conflict and when demographic/income/address PII is collected; minimize fields; define edits/retention; update contracts and accessible forms. |
| 6 | Vehicle arrangements (FR-7.1, OI-003) | Decision needed | `gpt-5.6-sol` / High | Decide separate entity versus Employee task type; attach to one property deal; define statuses/assignment/audit; preserve real-estate-only access. |
| 7 | Analytics completion (FR-16.1 through FR-16.3) | Planned | `gpt-5.6-terra` / High | Add Excel or amend it out; add Agent group/team filters and summaries; preserve bounded async queries, CSV formula safety, pagination, and line isolation. |
| 8 | Notification/email redirect completeness (FR-11.2) | Planned | `gpt-5.6-terra` / High | Inventory every producer; add valid role-aware destinations and approved email events; prevent open redirects and PII in messages; add link tests. |
| 9 | Authenticated banner personalization (FR-12.1 through FR-12.4, FR-18.1) | Decision needed | `gpt-5.6-sol` / Extra High | Define audience grammar, consented signals, location precision/retention, safe server evaluation, fallbacks, and negative targeting tests before serving personalized content. |
| 10 | Map/GMB integration seam (FR-18.2) | Deferred pending scope | `gpt-5.6-terra` / High | Confirm it remains in v1; define provider-neutral coordinates/address boundary and privacy constraints before adding a dependency. |

### Approved feature brief — Managed property/media submissions

- **Success:** authenticated Clients/Leads, real-estate Agents, and Sub Admins
  can submit an existing RERA-registered property with managed media; only a
  platform Admin can approve it; pending assets remain private and approved
  listing images become public without exposing reviewer-only documents.
- **Behavior:** require one to ten JPEG, PNG, or WebP images of at most 5 MiB
  each; allow up to two reviewer-only PDFs of at most 5 MiB each; support
  browser camera capture; preserve image order; show upload and review state to
  the owner; and keep existing catalogue image behavior for legacy rows.
- **Architecture:** store private submission assets separately from approved
  public property media, bind staging storage keys to the authenticated owner,
  copy verified uploads into opaque server-only canonical private snapshots,
  copy approved images to a public property prefix, and project public URLs
  server-side. Keep generated contracts owned by FastAPI.
- **Compatibility:** preserve existing property submissions, properties, and
  legacy catalogue images; retain immutable real-estate classification; do not
  change property inquiries, visits, deals, payments, or Agent attribution.
- **Security and failure invariants:** enforce signed storage-side size caps,
  server-side object existence/size and magic-byte checks, count and rate
  limits, owner/reviewer RLS, Admin-only approval, non-public pending keys,
  immutable canonical snapshots, retryable row-locked approval, PII-free audit
  details, account-deletion cleanup, and scheduled orphan, rejected-media, and
  promoted-source cleanup. Storage failure must fail closed without publishing
  the submission.
- **Retention:** purge unreferenced uploads after one hour, rejected private
  media after 30 days, and private originals after successful public
  promotion; retain public images only while their listing remains active.
- **Non-goals:** video upload/transcoding, platform-wide Loans/Real Estate media
  galleries, feedback attachments, content moderation providers, listing edit
  or resubmission, and changes to payment or vehicle-arrangement workflows.
- **Verification matrix:** Client/Agent/Sub Admin positive submission; role,
  owner, cross-user, and cross-line denial; Admin-only review; quota, MIME,
  magic-byte, missing-object, duplicate-key, and rate-limit failures; private
  before approval and public after approval; copy failure and concurrent review;
  rejection and cleanup; audit safety; migration upgrade/downgrade and one
  Alembic head; generated contracts; accessible responsive web flows; focused
  API/RLS/storage/scheduler/web/browser tests; full applicable gates; security
  review; PR review; and repository verification.

### Delivered feature evidence — Managed property/media submissions

- **Delivery:** implemented on `feat/managed-property-media`; the upstream PR
  link will replace this placeholder during shipping.
- **Behavior:** Clients/Leads, real-estate Agents, and Sub Admins submit one to
  ten ordered images and up to two reviewer-only PDFs through signed uploads.
  Owners can inspect their private media and review state; only a platform
  Admin can approve or reject. Approval publishes managed image URLs while
  preserving legacy property images and keeping PDFs private.
- **Storage and privacy:** opaque staging names are owner-bound, rate-limited,
  size-constrained, and checked by MIME and magic bytes. Submission copies each
  asset into a newly generated server-only canonical key and revalidates it,
  closing signed-upload replacement races. Promotion revalidates source and
  destination; failures remain pending and remove partial public copies.
- **Authorization and lifecycle:** private rows use owner/platform-Admin RLS;
  public media requires an active listing; Sub Admin review is denied. Scheduled
  cleanup removes old unreferenced staging objects, rejected private media,
  promoted image sources, and inactive public images. Account deletion rejects
  pending submissions and removes their private media while preserving approved
  public listing records.
- **Fresh local evidence:** Ruff check/format over 382 files, Python compilation,
  and all 24 database-independent schema/storage tests pass. Alembic reports one
  head, the feature revision's upgrade/downgrade offline SQL passes, generated
  OpenAPI/TypeScript hashes are deterministic, and the feature-tracking guard
  passes. Web lint/typecheck and all 265 tests pass; after the final hardening,
  typecheck and the 24 focused property tests pass again. The production build
  compiled, type-checked, and generated all 91 pages before Windows denied
  Next's final standalone symlink copy (`EPERM`). The database-backed property
  suite timed out after 60 seconds and `./scripts/verify.sh --ci` after 120
  seconds because the local Docker PostgreSQL/Redis control path is unresponsive;
  Linux PR CI remains authoritative for those gates.
- **Security review:** upload-replacement, canonical-key replay, filename
  disclosure, public-copy failure, audit free-text, and account-deletion gaps
  were found and remediated. Repeat review found no remaining actionable high-
  or medium-severity defect.
  Residual product risks are malware scanning/content moderation for PDFs,
  public-image metadata normalization, and an explicit retention period for
  approved reviewer-only PDFs; these remain part of the broader FR-13 work.

### Approved feature brief — Support-assisted mobile-number change

- **Success:** a user who no longer controls their registered number can prove
  possession of a replacement number, pass Admin-only identity review, and use
  the replacement for login and password recovery; the old number and every
  pre-change session stop working immediately after completion.
- **Behavior:** provide public locked-out and authenticated dashboard intake.
  Verify the replacement number with the existing hashed, expiring,
  attempt-limited OTP rails, create a structured request linked to a
  `lost_mobile` support ticket, require one platform Admin to attest an approved
  proof method and a different platform Admin to complete the change, then
  resolve the ticket. Platform-Admin target accounts remain out of scope.
- **Identity proof:** approved proof methods are verified-email confirmation,
  review of already-held KYC, staff HR/manager confirmation, or in-person
  verification. Store only the method and a bounded, PII-free attestation; do
  not add knowledge-question recovery or a new document-upload path.
- **Compatibility:** preserve the immutable account UUID, roles, profiles,
  business-line/RLS claims, lead provenance, Agent-expiry history, referrals,
  and generated-contract ownership. Update the canonical mobile plus only the
  linked operational contact copies required for current workflows; never
  merge accounts or transfer unrelated lead/referral attribution.
- **Security and failure invariants:** keep public responses enumeration-safe;
  rate-limit by trustworthy IP and both numbers; bind OTP proof to a signed,
  purpose-scoped challenge and burn the OTP on successful use; require
  target, maker, and checker to differ; lock the request and user and revalidate
  all collision checks at completion; commit the mobile,
  linked-record, ticket, refresh-token, access-session-generation, push-device,
  and audit changes atomically; keep phone values, OTPs, proof material, and
  ticket free text out of logs/audit details; scrub active request PII on
  terminal state and account deletion.
- **Non-goals:** self-service completion, platform-Admin account recovery,
  account merge/swap, reassignment of unrelated leads or referrals, new
  WhatsApp/SMS/email integrations, new KYC uploads, password/email change in
  the same workflow, and rewriting historical auth events or terminal contact
  snapshots.
- **Verification matrix:** public/authenticated initiation; known/unknown and
  conflict response parity; OTP expiry/attempt/rate/replay/purpose isolation;
  Admin/Sub Admin/client/RLS denial; maker-checker and target separation;
  state-machine and concurrent completion; auth/lead/referral/application
  collision rollback; linked live-contact updates; old access/refresh/reset
  denial and new login/reset success; account-deletion scrub; PII-free audit
  and notifications; generated contract and accessible responsive UI;
  migration upgrade/downgrade and one head; focused, full API/web/E2E, security,
  and repository gates.

### Delivered feature evidence — Support-assisted mobile-number change

- **Delivery:** [PR #146](https://github.com/brollysolutions/client1/pull/146).
- **Behavior:** public locked-out and authenticated users verify a replacement
  number with the purpose-scoped OTP rails. Eligible requests create a
  structured `lost_mobile` ticket; one active platform Admin records a bounded,
  PII-free proof attestation and a different active platform Admin completes
  the canonical identity change after password reauthentication.
- **Identity safety:** completion preserves the account UUID and updates only
  linked live contact copies. It locks the request and user, revalidates account,
  proof, and replacement conflicts, translates uniqueness races into an atomic
  409 rollback, increments the access-session generation, revokes refresh
  tokens and push subscriptions, and serializes concurrent refresh rotation on
  the same user row.
- **Authorization and privacy:** platform-Admin targets and Sub Admins are
  excluded; the bypass service re-checks the live Admin profile. PostgreSQL
  grants only `SELECT` to `api_user`, with owner/platform-Admin RLS. Audit and
  notification details contain no phone values, free text rejects contact-like
  PII, and raw old/new numbers are scrubbed on terminal state and account
  deletion.
- **Fresh local evidence:** Ruff check/format, Python compilation, 36-test
  collection, one Alembic head, migration-only offline SQL, deterministic
  OpenAPI/TypeScript regeneration, web lint/typecheck, and all 261 web tests
  pass. The web production build previously compiled, type-checked, and
  generated all 91 pages before Windows denied the final standalone symlink
  copy (`EPERM`). Database-backed API execution is delegated to Linux PR CI
  because the local Docker PostgreSQL/Redis control path is unresponsive.
- **Post-merge CI repair:** the three failures in main run
  [31129957083](https://github.com/brollysolutions/client1/actions/runs/31129957083)
  are repaired by freezing the employee-home date fixture and reconciling the
  platform-policy ledger with the split task-document and loan-document
  policies. That run otherwise reported 1,404 passing API tests.
- **Security review:** refresh-rotation and registration collision races plus
  stale-Admin token reachability were found and remediated. Remaining local
  uncertainty is limited to database-backed execution and the Windows-only
  build packaging restriction; PR CI is the authoritative gate.

### Approved feature brief — Admin field visibility and contact controls

- **Success:** a platform Admin can change supported field visibility for
  Agent, Telecaller, and Employee responses without a deploy; the API, not the
  browser, removes denied values; changes take effect on the next request and
  appear in the append-only audit log.
- **Behavior:** use a closed server-owned catalogue and role/entity/field
  overrides. Preserve existing visibility by default. Agent-owned and
  Telecaller-assigned mobile numbers are locked visible by FR-15.1/FR-15.2;
  Employee lead contact supports `allow`, `deny`, and `share_link`. A share link
  is an opaque, expiring, revocable platform invitation with no PII in its URL
  or public response.
- **Compatibility:** keep row ownership, business-line RLS, operational status
  fields, and write permissions unchanged. Optional projected fields remain
  generated-contract owned. Existing `tel:` and `wa.me` browser links may only
  render when the raw number is already allowed; no WhatsApp API, messaging
  provider, dependency, or telemetry is added.
- **Security and failure invariants:** fail closed for unknown catalogue keys,
  invalid modes, expired/revoked tokens, and policy-read failures; require a
  platform-scoped Admin for policy writes; expose only a caller's already
  authorized rows; store only invitation-token hashes; keep audit detail free
  of contact values; revoke outstanding links when Employee contact leaves
  `share_link` mode.
- **Non-goals:** field-level write authorization, record reassignment, number
  masking, cloud telephony, WhatsApp API integration, arbitrary Admin-defined
  JSON paths, and new email/SMS delivery.
- **Verification matrix:** catalogue validation and locked rows; Admin-only and
  platform-scope denial; default/allow/deny/share-link projection for each
  affected role; Agent/Telecaller mobile invariants; Employee ownership and
  cross-line denial; token hash/expiry/revocation/single-use behavior; no-PII
  audit detail; generated contract and accessible Admin UI; migration
  upgrade/downgrade and one head; full API, web, and repository gates.

### Delivered feature evidence — Admin field visibility and contact controls

- **Behavior:** platform Admins manage a closed role/entity/field catalogue from
  the dashboard. Agent and Telecaller lead-mobile access remains locked to the
  SRS ownership rules; supported lead and financial fields are projected out of
  API responses when denied. Employees can receive raw contact, no contact, or
  a provider-neutral invitation according to the active policy.
- **Contact privacy:** invitation URLs contain a 256-bit random token and no
  PII; only SHA-256 token hashes are stored. Links expire after 24 hours, are
  single-use and revocable, and fail closed when the policy changes, the task
  closes or is reassigned, or the issuing Employee is no longer active. The
  public validation response exposes only `valid`.
- **Security:** Admin writes require platform scope and are audit logged without
  contact values. PostgreSQL RLS restricts catalogue reads by target role and
  link rows by current Employee task ownership/business line; link inserts also
  require an active task and explicit `share_link` policy. A transaction lock
  serializes policy changes with link creation, and a partial unique index
  prevents multiple active links for one Employee/task.
- **Compatibility and non-goals:** existing null response fields remain stable;
  generated OpenAPI/TypeScript contracts own all optional shapes. There is no
  WhatsApp API, messaging provider, cloud telephony, arbitrary JSON-path policy,
  new dependency, or telemetry.
- **Fresh local evidence:** Ruff check/format and generated-contract refresh
  pass; the migration downgrade/upgrade and one-head check passed before the
  final RLS/index hardening; 5 new API integration tests passed, and 105 of 106
  related regression tests passed before one legacy-null compatibility defect
  was fixed and its focused 6-test rerun passed. Web lint/typecheck and all 257
  tests pass; Next compiled and generated all 90 pages, then Windows denied the
  standalone symlink-copy step (`EPERM`). Final database-backed lifecycle,
  concurrency, full API, and hardened-migration reruns are delegated to PR CI
  because the local Docker Redis/PostgreSQL processes stopped responding.

### Delivered feature evidence — Agent-lead expiry

- **Success:** every overdue agent-attributed lead that is not converted or
  closed returns to the open same-line Telecaller pool once, within one 15-minute
  scheduler interval; attribution and line remain unchanged.
- **Behavior:** stamp an immutable 30-day deadline when Agent attribution is
  first established; do not reset it on edits, calls, assignment, or
  reassignment. Expiry clears the Telecaller assignment, records the expiry,
  preserves Agent history, and prevents Agent edits or re-introduction. Existing
  eligible rows receive at least seven days of deployment grace.
- **Compatibility:** keep the existing operational lead statuses for Admin and
  Telecaller flows; project expired Agent ownership on Agent APIs/UI. Preserve
  current direct-lead behavior and generated-contract ownership.
- **Security and failure invariants:** enforce post-expiry write denial in both
  service logic and RLS; preserve business-line isolation; use one conditional,
  idempotent database transition so concurrent converted/closed updates are not
  overwritten; keep audit details free of PII; make notifications best-effort
  only after the business transition commits.
- **Non-goals:** automatic Telecaller assignment, Agent transfer, deadline
  extensions/pauses, reminder emails, and Admin-configurable duration UI.
- **Verification matrix:** creation and no-reset behavior; new/assigned/working/
  released expiry; converted/closed/direct/future exclusions; legacy grace;
  idempotency and terminal-race behavior; queue reassignment; API/RLS lockout;
  duplicate/re-introduction prevention; audit/notification delivery; generated
  contract; Agent countdown/history rendering; scheduler registration; one
  Alembic head; full API, web, and repository gates.

- **Fresh evidence:** 42 focused API/system tests pass, including real
  two-session scheduler/Agent and cross-Agent RLS invariant checks; Ruff,
  migration downgrade/upgrade, and one
  Alembic head pass; web lint/typecheck and all 254 unit tests pass; a seeded
  browser session verified expired counts, countdown/history copy, and
  read-only detail behavior. Security review found and remediated the
  attribution/expiry race and due-before-marker write window; no findings
  remain. The full API regression completed with 1,397 passing tests and three
  unrelated failures: the import-time payout grace fixture passes fresh, while
  two pre-existing platform-policy ledgers still expect the superseded
  `task_documents_rls` name and omit `loan_documents_select`. The isolated
  production-build limitation is recorded in the PR verification summary.

## Delivery sequence

The next priority is the decision gate for **managed property/media
submissions** (FR-7.3 and FR-13.1 through FR-13.4). Settle submitter scope,
asset types, quotas, visibility, storage lifecycle, and safe media processing
before implementation; do not add a provider or upload path until those
security and product choices are approved.

For each item:

1. **Decide**: resolve its decision gate with `brainstorm`/`grillme` when needed.
2. **Design**: record acceptance criteria, non-goals, threat considerations,
   compatibility, and test matrix.
3. **Implement**: make the smallest end-to-end change on a fresh task branch.
4. **Verify**: run targeted checks and the full applicable repository gate.
5. **Review and ship**: run security review where required, review the diff,
   update both living files, commit, push, and open/update the PR.

## Completed foundations

The backlog builds on these delivered foundations:

- six role-aware dashboards with server-side authorization and PostgreSQL RLS;
- OTP/password/refresh authentication and dual-line client profiles;
- lead capture, Agent introduction, Admin assignment, Telecaller follow-up,
  fixed Agent expiry, and Employee tasks/documents;
- loan applications, product/bank configuration, transactions, document
  verification, and processing-fee cashback;
- property catalog, submissions/review, inquiries, visits, bookmarks, and deal
  progression;
- Agent applications/KYC, commissions, referrals, maker-checker payouts,
  reconciliation, and retained/de-linked ledgers;
- CMS banners/offers/content, public serving, images, notifications/web push,
  Admin broadcast/audit, support triage, and analytics/CSV reporting; and
- self/Admin account deletion plus seven-year retention purge.

## Change log

| Date | Change | Evidence |
| --- | --- | --- |
| 2026-08-06 | Completed FR-2.9, FR-15.1, and FR-15.4 field visibility/contact privacy; promoted support-assisted mobile-number change as the next priority. | [PR #145](https://github.com/brollysolutions/client1/pull/145); migration/RLS/API/web/contract changes; focused and regression tests; security and PR review. |
| 2026-08-06 | Completed FR-4.6 Agent-lead expiry and promoted Admin field visibility/contact controls as the next priority. | [PR #144](https://github.com/brollysolutions/client1/pull/144); migration/job/API/RLS/web/contract changes; 42 focused API tests; 254 web tests; seeded browser verification; security review. |
| 2026-08-06 | Created living plan, model/effort policy, prioritized gaps, and co-change enforcement. | Static code/test/history assessment at `ecf6e2a`; `feature-status.md`; tracking checker tests. |
