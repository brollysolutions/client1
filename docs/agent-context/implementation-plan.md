# Living implementation plan

Status: **Derived, actively maintained plan**

As of: **2026-08-06**

Evidence baseline: `ecf6e2a` (`upstream/main`)

## Outcome

Complete the approved Loans and Real Estate scope without weakening
authorization, business-line segregation, PII/KYC handling, payout controls,
or auditability. The current evidence-based implementation coverage is
approximately **77%**; see [`feature-status.md`](feature-status.md) for the
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

No product feature is currently in progress. Agent-lead expiry is implemented
on `feat/agent-lead-expiry` (PR pending); the next priority requires a fresh
decision/design pass before implementation begins.

| Priority | Feature / requirements | Status | Recommended model / effort | Decision gate and acceptance summary |
| ---: | --- | --- | --- | --- |
| 1 | Agent-lead expiry (FR-4.6, OI-001) | **Done** — `feat/agent-lead-expiry` (PR pending) | `gpt-5.6-sol` / High | Delivered fixed 30-day first-attribution deadlines, converted/closed exclusions, indexed idempotent release, audit/notifications, RLS/deadline write denial, Agent countdown/history, seven-day legacy grace, and deferred constraint race protection. |
| 2 | Admin field visibility and contact controls (FR-2.9, FR-15.1, FR-15.4) | Planned | `gpt-5.6-sol` / Extra High | Define field catalogue and precedence; enforce projection server-side; preserve line/ownership RLS; audit changes; add cross-role/PII denial tests. |
| 3 | Support-assisted mobile-number change (FR-3.4, FR-14.3) | Decision needed | `gpt-5.6-sol` / Extra High | Choose proof/approval policy; prevent takeover and enumeration; enforce uniqueness; rotate/revoke sessions; update lead/referral links safely; audit and notify. |
| 4 | Managed property/media submissions (FR-7.3, FR-13.1 through FR-13.4, OI-002) | Decision needed | `gpt-5.6-sol` / Extra High | Decide asset types/counts/limits/visibility; support Client/Lead submissions if approved; use private/public prefixes correctly; sniff content; clean orphans; test ownership and cross-line denial. |
| 5 | Registration/profile requirement alignment (FR-3.3, FR-17.2) | Decision needed | `gpt-5.6-sol` / High | Resolve optional-email conflict and when demographic/income/address PII is collected; minimize fields; define edits/retention; update contracts and accessible forms. |
| 6 | Vehicle arrangements (FR-7.1, OI-003) | Decision needed | `gpt-5.6-sol` / High | Decide separate entity versus Employee task type; attach to one property deal; define statuses/assignment/audit; preserve real-estate-only access. |
| 7 | Analytics completion (FR-16.1 through FR-16.3) | Planned | `gpt-5.6-terra` / High | Add Excel or amend it out; add Agent group/team filters and summaries; preserve bounded async queries, CSV formula safety, pagination, and line isolation. |
| 8 | Notification/email redirect completeness (FR-11.2) | Planned | `gpt-5.6-terra` / High | Inventory every producer; add valid role-aware destinations and approved email events; prevent open redirects and PII in messages; add link tests. |
| 9 | Authenticated banner personalization (FR-12.1 through FR-12.4, FR-18.1) | Decision needed | `gpt-5.6-sol` / Extra High | Define audience grammar, consented signals, location precision/retention, safe server evaluation, fallbacks, and negative targeting tests before serving personalized content. |
| 10 | Map/GMB integration seam (FR-18.2) | Deferred pending scope | `gpt-5.6-terra` / High | Confirm it remains in v1; define provider-neutral coordinates/address boundary and privacy constraints before adding a dependency. |

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

The default next feature is **Admin field visibility and contact controls**.
Begin with a decision/design pass for the field catalogue, precedence, response
projection, and audit model; do not guess a security- or product-sensitive rule.

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
| 2026-08-06 | Completed FR-4.6 Agent-lead expiry and promoted Admin field visibility/contact controls as the next priority. | `feat/agent-lead-expiry`; migration/job/API/RLS/web/contract changes; 42 focused API tests; 254 web tests; seeded browser verification; security review. PR pending. |
| 2026-08-06 | Created living plan, model/effort policy, prioritized gaps, and co-change enforcement. | Static code/test/history assessment at `ecf6e2a`; `feature-status.md`; tracking checker tests. |
