# Dhanadhara launch sign-off register

Status: **NO-GO — no human approval is recorded yet**

Register owner: release decision maker (unassigned)

Release candidate: `fb692260c4793562b49915e740fbac09dd893b6d`

Current technical record:
[`release-rehearsal-2026-08-30.md`](release-rehearsal-2026-08-30.md) —
exact-candidate result is NO-GO. This link does not complete the final decision
block or approve any gate.

Target launch window: unassigned

Last reviewed: 31 August 2026

This is the canonical decision register for the human- and environment-owned
launch gates named by the
[`pre-deployment-checklist.md`](pre-deployment-checklist.md). It does not replace
that checklist, constitute legal advice, or turn source inspection into
production evidence.

## Recording rules

1. A gate is approved only when the summary row names a real accountable
   person, records `Approved`, includes an ISO 8601 decision time, and links the
   evidence required by that gate. A team name, issue assignee, unchecked box,
   verbal statement, or planned test is not approval.
2. Evidence may remain in an access-controlled legal, security, or operations
   system. Link the durable record here; never copy secrets, keys, private
   contracts, production exports, customer data, or privileged legal advice
   into Git.
3. Allowed decisions are `Open`, `Approved`, `Rejected`, and
   `Risk accepted until <timestamp>`. A risk acceptance also requires the
   release decision maker, the accountable domain owner, a remediation link,
   compensating controls, and a hard expiry before which the gate returns to
   `Open`. Counsel or the security owner must join when their domain is
   affected.
4. The approver cannot approve evidence they produced alone when the gate calls
   for independent verification. The release decision maker checks completeness
   but does not substitute for trademark counsel, legal/privacy, security, or
   operations ownership.
5. Update the candidate SHA whenever application, configuration, dependency, or
   image changes invalidate evidence. Candidate-bound evidence must name the
   exact SHA, image digests, environment, and observation time.
6. The cookie decision is not an open consent-banner task: the current runtime
   uses only essential authentication cookies. Reopen privacy/security review
   before enabling analytics, advertising, replay, attribution, chat, embedded
   media, or any other non-essential storage; where consent is required, block
   it before consent and offer equally clear Accept and Reject controls.
7. The summary is the latest snapshot, not the audit history. Append every
   decision or superseding decision to the history below in the same reviewed
   change. Do not erase an earlier approval, rejection, or risk acceptance;
   correct it with a new dated entry that identifies what it supersedes.

## Decision summary

All rows start open. Replace placeholders only from evidence supplied or
verified by the named human owner.

| Gate ID | Accountable role | Decision | Named approver | Decision time | Evidence record | Expiry / remediation |
| --- | --- | --- | --- | --- | --- | --- |
| `HUM-TRM-01` | Product/legal owner and trademark counsel | Open | — | — | — | — |
| `HUM-ENT-01` | Company officer and counsel | Open | — | — | — | — |
| `HUM-TER-01` | Counsel and product owner | Open | — | — | — | — |
| `HUM-PRI-01` | Privacy owner and counsel | Open | — | — | — | — |
| `HUM-PRO-01` | Privacy/security owners and procurement/counsel | Open | — | — | — | — |
| `ENV-DNS-01` | Operations owner with independent verifier | Open | — | — | — | — |
| `ENV-SEC-01` | Security/operations secret owner | Open | — | — | — | — |
| `ENV-MON-01` | Operations/SRE owner | Open | — | — | — | — |
| `HUM-INC-01` | Incident commander / executive owner | Open | — | — | — | — |

The release stays **NO-GO** while any row is `Open` or `Rejected`, or after any
risk acceptance expires.

## Gate evidence requirements

### `HUM-TRM-01` — Dhanadhara name and trademark

- Search scope names the launch countries, relevant classes, company/domain
  names, app stores, and confusingly similar marks.
- Trademark counsel records conflicts, launch conditions, and the clearance,
  filing, rename, or other disposition.
- The product/legal owner confirms exact capitalization, permitted business
  lines, mark owner, domains, and relationship to any parent company.
- Evidence identifies the search/decision date and the owner of follow-up
  filings or oppositions.

### `HUM-ENT-01` — legal entity and public identity

- Counsel verifies the exact contracting entity, registration details,
  registered and operating addresses, grievance/contact channel, governing
  jurisdiction and venue, minimum-age rule, and required notices.
- Public site identity, invoices/communications, support details, and processor
  contracts use the approved entity consistently.
- Evidence identifies the effective date and owner responsible for future
  changes.

### `HUM-TER-01` — Terms of Use

- Counsel and product approve coverage for consumers, agents, staff, partner
  applications, referrals, cashback, commissions, third-party property links,
  intellectual property, suspension, disputes, and liability.
- The evidence records the immutable version/hash, effective date, locale and
  launch jurisdictions.
- Counsel decides whether explicit acceptance is required for each audience.
  If required, implementation and evidence capture must be complete before this
  gate can be approved.

### `HUM-PRI-01` — privacy and data inventory

- The record of processing inventories each launch field and derived value by
  purpose, lawful basis/notice, source, recipients, storage region, role access,
  retention, deletion, export/correction path, and incident sensitivity.
- Registration, enquiries, KYC, listings, support, referrals, payouts,
  notifications, staff data, logs, caches, backups, and object storage are in
  scope.
- Synthetic exercises cover access, correction, deletion, retention purge,
  legal hold, closure, and KYC/object/cache behavior.
- Privacy/cookie copy is reconciled to production-like runtime and network
  inspection. Essential-only cookie treatment is explicitly approved for each
  launch jurisdiction.

### `HUM-PRO-01` — processors and sub-processors

- The inventory names every launch provider for SMS/voice, email, object
  storage, payout, malware scanning, hosting, monitoring, support, and other
  data handling.
- Each record covers purpose, data categories, region, sub-processors,
  controller/processor role, contract/DPA, transfer mechanism where applicable,
  security review, breach terms, retention/deletion and exit handling.
- No undecided vendor or unreviewed data flow is enabled in the candidate.

### `ENV-DNS-01` — DNS and TLS

- External evidence covers apex, `www`, API, assets, and every intended
  subdomain: DNS answers, HTTP-to-HTTPS redirects, certificate chain/name,
  protocol configuration, expiry, and renewal monitoring.
- Header probes cover HTML, auth, dashboard redirect, API/error and cached
  responses through the real proxy/CDN path.
- The HSTS decision matches the complete HTTPS subdomain inventory; preload and
  `includeSubDomains` are not claimed without their separate permanence review.
- Evidence names the candidate environment and observation time.

### `ENV-SEC-01` — production secrets

- An inventory maps each service/environment to a secret owner and approved
  secret-manager reference without recording secret values here.
- Values are unique, high entropy, least-privilege, access-audited, excluded
  from client bundles/logs/issues/chat, and unavailable to unrelated services.
- Rotation and expiry alerts are exercised; evidence records a synthetic or
  controlled rotation result, rollback behavior, and the next rotation date.
- Old/default/development values and unowned credentials are absent from the
  production candidate.

### `ENV-MON-01` — monitoring and alert delivery

- Dashboards and SLOs cover availability, latency, 5xx, scheduler/queue
  liveness, database/Redis saturation, storage and malware scanning,
  certificate/secret expiry, auth abuse, webhook lag, and payout failures.
- A synthetic failure reaches every intended primary and escalation route; the
  evidence records receipt, acknowledgement and recovery time.
- Logs/traces are checked for credentials, tokens, OTPs, full PII, KYC paths,
  payout destinations and excessive cardinality.
- Alert ownership, quiet-hour behavior and runbook links are current.

### `HUM-INC-01` — incident ownership

- Named primary/backup on-call owners, escalation contacts, severity levels,
  decision authority, and communications roles cover the launch window.
- Security/privacy breach, customer/partner/regulator communications,
  evidence preservation, and post-incident review procedures are approved.
- Runbooks include tested rollback or disable paths for login, uploads,
  campaigns, notifications, webhooks and payouts.
- A tabletop or synthetic exercise records participants, scenario, gaps,
  owners and deadlines.

## Decision history

No decision is recorded yet. Append one row for every summary transition and
retain earlier rows.

| Gate ID | Decision | Named approver and role | Decision time | Evidence record | Notes / expiry / supersedes |
| --- | --- | --- | --- | --- | --- |
| — | No decisions recorded | — | — | — | — |

## Risk-acceptance record

Copy this block beneath the affected gate only when the checklist and
accountable owners permit a temporary acceptance:

```text
Gate ID:
Candidate SHA / image digests / environment:
Risk and affected asset:
Reason launch cannot wait:
Compensating controls and verification:
Accountable domain owner (name, role):
Release decision maker (name, role):
Counsel/security co-approver when applicable:
Decision time (ISO 8601):
Hard expiry (ISO 8601):
Remediation issue and owner:
Rollback / disable trigger:
```

An acceptance with a missing approver, evidence link, remediation owner, or
future expiry is invalid. Renewal is a new decision, not an edit that erases the
expired record.

## Final release decision

Complete this only after the technical rehearsal report links the exact frozen
candidate and every summary row above is valid.

| Field | Value |
| --- | --- |
| Exact candidate SHA | — |
| Reviewed image digests | — |
| Technical rehearsal evidence | — |
| Release decision | NO-GO |
| Decision maker | — |
| Decision time | — |
| Launch/rollback window | — |
| Open accepted risks | None recorded |
