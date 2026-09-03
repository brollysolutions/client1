# Dhanadhara pre-deployment plan and go/no-go checklist

Owner: product and engineering leads

Last reviewed: 2 September 2026

Scope: public website, authenticated dashboards, API, data stores, scheduler,
object storage, payments, deployment edge, legal launch material, and operating
readiness.

This is an evidence checklist, not a claim that deployment is ready. A box is
checked only when its named owner links current evidence. Legal items require
qualified counsel for the launch jurisdictions; this document is not legal
advice.

Record accountable names, decisions, dates, evidence links, expiries, and the
final go/no-go in the
[`launch-signoff-register.md`](launch-signoff-register.md). The register starts
NO-GO; creating or linking it does not approve any gate.

Current technical rehearsal: exact merged PR #290 candidate `75e1031` remains
**NO-GO**; see
[`release-rehearsal-2026-08-30.md`](release-rehearsal-2026-08-30.md). No box
below is checked by that engineering exercise.

## Current launch foundation

The source code now establishes these baselines:

- the public product name is **Dhanadhara** and the production web image cannot
  build with missing or placeholder public origin/contact configuration;
- the privacy, Terms of Use, and Cookie Notice are discoverable from every
  public page and the sitemap;
- only the two existing essential authentication cookies are disclosed; no
  analytics, advertising, or cross-site tracking cookie is enabled;
- shared normal-text semantic colors meet WCAG 2.2 AA contrast on the primary
  white and cream surfaces, and public pages have a keyboard skip link;
- the web response baseline includes CSP, frame/object blocking, MIME sniffing
  protection, referrer and browser-permission policies, and production HSTS;
- the API's existing authentication, password/reset, rate-limit, upload,
  webhook, RLS, secret, and audit controls remain unchanged.

The source code does **not** prove that the real domain, TLS certificate,
company identity, trademark, backup restore, alert routing, or incident team is
ready. Those are explicit gates below.

## 1. Brand and product-system approval

### Brand platform

- [ ] **Product/legal owner:** approve the public name “Dhanadhara,” its exact
  capitalization, legal owner, permitted business lines, and relationship to
  any company or parent brand.
- [ ] **Trademark counsel:** search the relevant Indian and planned-market
  classes, domain names, app stores, and confusingly similar marks; record the
  decision and filing/registration owner. A code rename is not trademark
  clearance.
- [ ] **Product owner:** approve the brand promise: *a clear, secure bridge to
  relevant lenders and real-estate partners; never a bank, lender, or custodian
  of loan principal/property purchase money*.
- [ ] **Brand owner:** approve personality traits—calm, transparent, capable,
  respectful, and locally useful—and prohibited traits such as guaranteed,
  urgent, exclusive, or bank-like claims without evidence.
- [ ] **Content owner:** adopt one narrative sequence for acquisition and
  dashboards: user need → evidence/options → next action → what happens next.
  Put uncertainty, eligibility, partner responsibility, and fees beside the
  decision they qualify rather than in distant fine print.
- [ ] **Growth/legal owners:** create an approved-claims library for ads, social,
  sales scripts, partner material, notifications, and app-store copy. Market
  execution must not promise approval, rates, inventory, payouts, or response
  times the product does not guarantee.

### UI/UX consistency programme

- [ ] Inventory all public, auth, and role-dashboard routes and assign an owner
  for every screen; include empty, loading, error, permission-denied, expired,
  success, destructive-confirmation, and offline states.
- [ ] Use the checked-in design tokens and primitives for typography, colors,
  buttons, inputs, dialogs, tables, badges, cards, spacing, radius, elevation,
  focus, and responsive containers. Remove page-local lookalikes only after a
  visual-regression comparison.
- [ ] Apply Apple HIG principles as interaction criteria—clarity, deference to
  content, depth only when it explains hierarchy, direct manipulation,
  immediate feedback, generous targets, and predictable navigation. Do not
  copy Apple trade dress, assets, typography, or product chrome.
- [ ] Run the approved `apple-design` skill when it becomes available in the
  repository. Until then, record a manual HIG-based review; do not claim that a
  missing skill ran.
- [ ] Create a motion inventory. Add motion only when it explains entry, exit,
  progress, hierarchy, causality, or completion. Keep durations restrained,
  avoid layout-jank and decorative looping near financial decisions, and
  provide an equivalent state under `prefers-reduced-motion`.
- [ ] Verify every interactive element at keyboard-only, 200% zoom, 320 CSS px,
  390 px, tablet, laptop, and wide desktop. Meet WCAG 2.2 AA for contrast,
  target size, focus visibility, names/roles/states, errors, headings, landmarks,
  tables, dialogs, and status announcements.
- [ ] Test representative flows with real users from each role. Measure task
  success and error recovery, not just visual preference; use progressive
  disclosure and honest defaults to reduce cognitive load.

## 2. Legal, privacy, cookies, and data collection

- [ ] **Counsel:** replace generic policy references with the exact legal entity,
  registered/operating address, contact/grievance channel, effective date,
  governing venue, age rule, and jurisdiction-specific notices.
- [ ] **Counsel/product:** approve Terms of Use for consumers, agents, staff,
  partner applications, referral/cashback/commission programmes, third-party
  property links, intellectual property, suspension, disputes, and liability.
- [ ] **Counsel/engineering:** decide where explicit terms acceptance is legally
  required. If required, implement an unchecked affirmative control and store
  policy type, immutable version/hash, timestamp, account, locale, and evidence;
  re-consent only when counsel classifies a change as material.
- [ ] **Privacy owner:** create the data inventory/record of processing before
  collecting launch data: field, purpose, lawful basis/notice, source,
  recipients/processors, storage region, role access, retention, deletion,
  export/correction path, and incident sensitivity.
- [ ] Confirm every registration, enquiry, KYC, listing, support, referral,
  payout, notification, and staff field is necessary. Remove “collect now,
  decide later” fields and document optional fields and consequences.
- [ ] List all processors/sub-processors (SMS/voice, email, object storage,
  payment payout, malware scanning, hosting, monitoring, support) and complete
  contracts, transfer/region review, breach terms, and deletion obligations.
- [ ] Exercise access, correction, deletion, retention purge, legal hold, and
  account closure on synthetic data; verify KYC blobs and derived/search/cache
  copies follow the documented result.
- [ ] Confirm privacy copy against actual runtime/network/storage inspection on
  production-like builds. Do not infer the cookie inventory from vendor claims.

### Cookie decision

The current application uses only essential first-party authentication cookies
(`refresh_token` and the non-authoritative `session_hint`) plus disclosed local
and session storage. Therefore it deliberately has no misleading accept-only
banner. Counsel must confirm this treatment for each launch jurisdiction.

- [ ] Before enabling analytics, advertising, attribution, A/B testing,
  fingerprinting, replay, chat, embedded media, or other non-essential storage,
  complete a privacy/security review and data-processing approval.
- [ ] Where consent is required, block non-essential code before consent; offer
  equally clear Accept and Reject choices, granular purposes, later withdrawal,
  expiry/re-consent rules, and auditable consent version/time without storing
  unnecessary identity data.
- [ ] Re-scan after tag-manager and marketing releases. A banner is not evidence
  that scripts wait for consent.

## 3. Production identity, secrets, and supply chain

Use the provider-neutral
[`production environment validation`](../../infra/production-environment/README.md)
and its fail-closed assessor for the runtime-configuration, DNS/TLS, monitoring,
and alert-delivery rows below. The checked-in example is intentionally `NO-GO`;
tooling or a merged PR does not check any box without exact-environment evidence
and the required named approvals.

- [ ] Set and independently verify `NEXT_PUBLIC_SITE_URL` (canonical HTTPS
  origin), `NEXT_PUBLIC_CONTACT_PHONE`, `NEXT_PUBLIC_CONTACT_EMAIL`,
  `NEXT_PUBLIC_CONTACT_HOURS`, and `NEXT_PUBLIC_CONTACT_ADDRESS`. Values are
  public and are baked into the web image; never put secrets in `NEXT_PUBLIC_*`.
- [ ] Set the same-origin or HTTPS `NEXT_PUBLIC_API_BASE_URL`, HTTPS
  `NEXT_PUBLIC_ASSET_HOST`, and internal server API URL. Run the production
  image build; its strict public-identity gate must pass without overrides.
- [ ] Generate unique high-entropy production secrets in an approved secret
  manager. Restrict read/rotate/audit rights by service and environment; never
  copy production secrets into CI logs, issue text, chat, browser bundles, or
  `.env` files committed to Git.
- [ ] Run Gitleaks across history and the release diff. If a real secret is
  found, revoke/rotate it first, assess access logs, then coordinate any history
  rewrite; deleting the visible line alone does not neutralize it.
- [ ] The browser must receive no database credential. This stack uses direct
  PostgreSQL behind the API, so a “public DB key” is not applicable. If a
  browser database service is introduced later, use only its intended public
  identifier and keep authorization in server policy/RLS.
- [ ] Pin/review production images and dependencies, produce an SBOM, run
  dependency/container scans, triage reachable critical/high findings, and
  record exceptions with owner and expiry. No new telemetry/vendor/dependency
  enters production without supply-chain and data-flow review.

## 4. DNS, TLS, edge, and browser boundary

- [ ] Provision production DNS, HTTPS certificates, renewal monitoring, and an
  HTTP→HTTPS redirect at the real edge. Test apex, `www`, API, assets, and every
  intended subdomain from outside the network.
- [ ] Only after HTTPS works on the launch origin, verify the application HSTS
  response: `curl -sSI https://<host>`. The current one-year policy deliberately
  does not include subdomains. Add `includeSubDomains` only after every required
  subdomain is inventoried and permanently HTTPS; do not request HSTS preload
  until ownership and permanence are proven.
- [ ] Verify CSP in real browser flows and review violation reports before
  tightening it. The compatible baseline still permits inline scripts/styles
  required by the current Next.js runtime; moving to nonces/hashes is a separate
  hardening change, not something to fake in a checklist.
- [ ] Confirm `nosniff`, `DENY`/`frame-ancestors`, referrer policy,
  permissions policy, COOP, and HSTS on HTML, auth pages, dashboards, errors,
  redirects, and cached responses. Confirm proxy/CDN layers neither strip nor
  duplicate incompatible values.
- [ ] Lock CORS to the exact production origins, methods, and headers. Verify an
  allowed preflight and rejected arbitrary/null/suffix-confusion origins with
  credentials. Configure trusted proxy hops so client-IP rate limiting cannot
  be spoofed.
- [ ] Keep directory listing disabled at nginx/object storage. Public object
  policy may read only the intended `public/` keys and may not list the bucket;
  private/KYC keys require authorized time-bounded access.
- [ ] Set edge/body/time limits for JSON, forms, and uploads; return bounded
  errors and ensure nginx, ASGI, and storage limits agree. Test slow and
  oversized requests without exhausting workers or memory.

## 5. Application and authentication security

For each row, link a current automated test or production-like probe. “Present
in code” is not the same as “verified at this release.”

- [ ] Enforce server-side authentication/role/business-line authorization on
  every route and service. Client role checks remain navigation hints only.
- [ ] Verify PostgreSQL RLS and least-privilege grants with owner, same-line,
  cross-line, low-privilege staff, deleted/disabled user, and platform-admin
  cases. Keep exactly one Alembic head and test upgrade plus downgrade policy.
- [ ] Verify password hashing parameters, password/reset/change flows, reset
  expiry and single use, neutral forgot/login responses, refresh rotation and
  reuse detection, global session revocation after password/mobile/account
  changes, and Secure/HttpOnly/SameSite/path-scoped cookies.
- [ ] Threat-model CSRF for every cookie-authenticated mutation. The current
  application uses bearer access tokens for normal API mutations and a
  SameSite=Strict cookie scoped to the refresh endpoint; confirm Origin/Sec-Fetch
  behavior and add an explicit anti-CSRF token if any cross-site-reachable
  cookie mutation or browser compatibility requirement makes that necessary.
- [ ] Exercise login, OTP, registration, forgot/reset, setup-link, mobile-change,
  contact, and public-enquiry limits by IP and account/mobile identifiers.
  Verify distributed counters fail safely and logs contain no OTP/token.
- [ ] Make an explicit bot-protection decision using abuse evidence. Prefer
  server limits, progressive friction, and privacy-preserving challenges; a
  third-party CAPTCHA requires supply-chain, accessibility, and privacy review.
- [ ] Validate all input server-side with allowlists, bounds, Unicode/normalizing
  rules, and business invariants. Parameterize queries through SQLAlchemy; never
  compose user values into SQL. Prevent mass assignment/field tampering by
  mapping accepted schemas to service-owned writes.
- [ ] Escape user content in every HTML/notification/export surface and sanitize
  on the correct boundary. Do not rely on “sanitize before storing” alone: keep
  canonical data when needed and encode for each output context.
- [ ] Trim API responses to the generated contract and role need. Verify errors,
  logs, notifications, exports, caches, OpenAPI examples, and serialization do
  not expose credentials, reset/setup tokens, KYC locations, internal notes,
  cross-line data, or unused fields.
- [ ] Verify upload extension, MIME, signature, size, geometry where relevant,
  randomized key, private/public prefix, malware fail-closed behavior, safe
  download disposition, authorization, orphan cleanup, retention, and no SVG/
  HTML active-content path unless explicitly sanitized and isolated.
- [ ] Verify payout/webhook authentication, exact payload signature, replay/
  idempotency, amount/currency/account matching, state machine, maker-checker
  separation, transaction locking, failure recovery, and immutable audit trail.
- [ ] Review security logs for authentication failures, reuse attempts, rate
  limits, role/RLS denial, admin mutations, KYC access, malware, payout/webhook,
  configuration failure, and account deletion. Redact PII/secrets and test alert
  thresholds plus ownership.

## 6. Database, storage, recovery, and operations

Use the provider-neutral
[`production recovery drill`](../../infra/recovery/README.md) and its
fail-closed evidence checker for the database/object drill below. The checked-in
example is intentionally NO-GO; tooling, configuration, a backup job, or a PR
merge does not check either recovery box without named production evidence.

- [ ] Create separate service identities for API, migrations, scheduler,
  backup, and humans. Grant only required database/schema/table/sequence rights;
  application roles must not own tables, bypass RLS, or create extensions.
- [ ] Encrypt traffic between public edge/services and use provider/storage
  encryption at rest. Classify fields that require application-level encryption
  or tokenization; document key rotation, backup coverage, and failure behavior.
- [ ] Configure encrypted automated database and object backups, retention,
  deletion protection, and off-account/off-region recovery appropriate to the
  business. Restrict and audit restore access.
- [ ] Perform a timed restore drill into an isolated environment, reconcile row
  counts and object references, run integrity/security checks, and record
  achieved RPO/RTO. A successful backup job without a restore is not evidence.
- [ ] Define SLOs and alerts for availability, latency, 5xx, queue/scheduler
  liveness, database saturation, Redis failures, storage/malware scanner,
  certificate/secret expiry, auth abuse, webhook lag, and payout failures.
- [ ] Create on-call ownership, escalation contacts, severity levels, incident
  templates, security/privacy breach procedure, customer communication, and a
  tested rollback/disable path for login, uploads, campaigns, and payouts.
- [ ] Load-test representative anonymous/authenticated reads and bounded writes;
  validate connection pools, workers, memory, storage, rate limits, CDN/cache,
  and graceful degradation without using production PII.

## 7. Release verification and go/no-go

- [ ] Freeze the release commit and review every diff, migration, generated
  contract, dependency, image, config change, feature flag, and known failure.
- [ ] Run `./scripts/verify.sh --ci`; run API Ruff/format/pytest, one Alembic
  head, web lint/typecheck/unit/build, and Playwright according to `AGENTS.md`.
  Record exact commands, commit, environment, totals, skips, and failures.
- [ ] Run security review, dependency/secret/container scans, browser CSP and
  header checks, responsive design review, keyboard/screen-reader smoke tests,
  and performance checks on the production artifact—not only a dev server.
- [ ] Smoke-test every role and critical journey with synthetic accounts:
  register/login/reset/logout, enquiry/apply, KYC/upload/review, listing and
  campaign approval, notifications, support, referral/cashback/commission,
  payout maker/checker/webhook/retry, data rights, and account deletion.
- [ ] Verify observability dashboards and alerts receive a synthetic failure;
  verify logs and traces do not contain credentials or excessive PII.
- [ ] Write deployment order, migration compatibility window, traffic switch,
  health criteria, rollback trigger, code rollback, and forward-only data
  recovery. Assign one decision maker for the release window.
- [ ] Obtain named sign-off from product/brand, legal/privacy, security,
  engineering, operations, support, and finance/payout owners. Any unchecked
  critical gate is a no-go or a written, time-bounded risk acceptance by the
  accountable owner.

## After launch

- [ ] Monitor the first release window continuously and compare errors, latency,
  abuse, conversion drop-offs, accessibility feedback, and support volume with
  the agreed baseline.
- [ ] Run a 24-hour and 7-day review; assign every incident/near miss and every
  temporary risk acceptance an owner and deadline.
- [ ] Re-run privacy, cookie, security, performance, accessibility, and brand
  checks whenever a new vendor, tracker, data field, role, upload type, payment
  path, public claim, or deployment origin is introduced.
