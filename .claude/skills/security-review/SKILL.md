---
name: security-review
description: Threat-model and audit repository code, a working diff, or a proposed feature for reachable security vulnerabilities. Use for auth, RLS, PII/KYC, uploads, payouts, webhooks, migrations, external integrations, or any explicit security review request.
---

# Security Review

Produce evidence-backed findings against this repository's actual threat model.

1. Read `SECURITY.md`, root and nested `AGENTS.md`, relevant indexed requirements, and the target diff plus adjacent enforcement code and tests.
2. Define scope, attacker capabilities, protected assets, trust boundaries, and the security invariants affected.
3. Trace attacker-controlled input to sensitive actions. Review authorization at every object/function/role/business-line boundary, not only route-level authentication.
4. Examine the applicable areas from `SECURITY.md`, emphasizing:
   - JWT/refresh/OTP lifecycle and enumeration/rate limiting;
   - PostgreSQL grants, RLS context, policies, ownership, and denial tests;
   - PII/KYC handling, masking, logs, retention, deletion, exports, and object storage;
   - uploads, content sniffing, path/key construction, presigned scope, and orphan cleanup;
   - payout/webhook caps, integer units, signatures, idempotency, races, reconciliation, and mock/live separation;
   - CORS, proxy trust, cookies, CSRF, XSS, SSRF, redirects, and Next.js data exposure;
   - dependencies, Actions, plugins, MCP servers, secrets, and generated artifacts.
5. Validate reachability and existing mitigations. Do not report hypothetical patterns that the current code makes unreachable.
6. For each finding, provide severity, confidence, location, attack path, impact, evidence, and a minimally disruptive remediation plus a regression test.
7. List residual risks or unverified areas separately from findings. If no findings remain, say so and name what was reviewed.

Lead with findings ordered by severity. Do not modify code during a review-only request. If the user asks for remediation, fix each accepted issue on the task branch, verify it, run `$review-pr`/`/review-pr`, and ship a PR.
