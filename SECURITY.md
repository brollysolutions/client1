# Security policy and review context

This private loans and real-estate platform handles credentials, sessions, PII, KYC documents, role-scoped operational data, referrals, commissions, fee cashbacks, and payouts. Security findings should be reported privately to the repository owners through a GitHub private vulnerability report or direct maintainer channel, not a public issue. Never include live secrets, production data, or customer documents in a report.

## Threat model

Primary attackers include unauthenticated internet clients, authenticated clients crossing business-line or ownership boundaries, compromised low-privilege staff accounts, malicious uploads/webhooks, credential-stuffing and OTP-abuse actors, and supply-chain or CI compromise.

Critical assets include JWT/refresh sessions, password and OTP material, customer/staff identity data, KYC documents, payout credentials and ledgers, audit history, PostgreSQL RLS boundaries, object-storage keys, and production configuration.

Trust boundaries include browser to nginx/API, API to Redis/PostgreSQL/object storage/payment and delivery providers, background scheduler to shared data, GitHub Actions to repository secrets, and any MCP/plugin to external services.

## Security invariants

- Authorization is enforced in API dependencies, service queries, grants, constraints, and PostgreSQL RLS—not in the browser.
- The `loans` and `real_estate` business lines remain segregated for scoped roles and data.
- Production never boots with development signing secrets or unsafe proxy assumptions. CORS origins remain explicit when credentials are enabled.
- OTPs are hashed, single-use, expiring, attempt-limited, and rate-limited by purpose, identity, and trustworthy client IP.
- Refresh tokens are rotated with reuse detection; logout/account deletion revokes usable sessions.
- Uploads enforce purpose, ownership, count, size, extension and content type/content sniffing; private objects are not made public or executable.
- Payouts are integer-minor-unit, capped, idempotent, deduplicated, auditable, and reconciled. No test or fallback path may move real money.
- Webhooks fail closed without valid signatures and remain replay/idempotency safe.
- Sensitive values and full PII never enter logs, errors, analytics, prompts, fixtures, screenshots, or committed files.
- Account deletion, delinking, and retention preserve legally required financial records while purging data no longer required.
- Migrations enable RLS and correct grants before exposing new data paths; policy coverage includes cross-role and cross-line denial tests.

## Required review areas

For each change, identify attacker-controlled inputs, authorization decisions, sensitive reads/writes, external calls, background concurrency, and failure behavior. Review at minimum:

- authentication, session fixation/reuse, password reset, OTP enumeration and rate limiting;
- object-level, function-level, role, business-line, and RLS authorization;
- injection, SSRF, open redirects, unsafe deserialization, path traversal, and template/XSS sinks;
- CSRF/CORS/cookie flags and Next.js server/client data exposure;
- upload validation, presigned URL scope, storage visibility, and orphan cleanup;
- payout/webhook idempotency, race conditions, caps, ledger/audit consistency, and mock/live separation;
- PII minimization, masking, retention, account deletion, logs, exports, and backups;
- dependency, action, plugin, MCP, and generated-artifact supply-chain risk.

## Finding quality

A reportable finding needs a reachable path, affected asset or invariant, concrete impact, and code evidence. Rank severity by realistic impact and exploitability: critical for systemic auth bypass/secret or money compromise, high for material cross-user access or account takeover, medium for bounded security failures, and low for defense-in-depth gaps.

Do not report style preferences, generic hardening without a reachable risk, or test-only development defaults that are provably rejected outside development as vulnerabilities. Do report a supposedly unreachable dependency vulnerability if current code or configuration makes the vulnerable path reachable.
