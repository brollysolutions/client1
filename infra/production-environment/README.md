# Production environment validation

Status: **operator execution required; this runbook does not approve launch**

This provider-neutral runbook covers the production DNS/TLS edge, value-free
runtime-configuration review, monitoring coverage, and alert delivery required
by launch rows `ENV-DNS-01`, `ENV-SEC-01`, and `ENV-MON-01`. It produces a
privacy-minimized, fail-closed result through
[`scripts/check_production_environment_evidence.py`](../../scripts/check_production_environment_evidence.py).
The unchanged example must return `NO-GO`.

The repository supplies the evidence contract and review procedure. Named
operators and independent gate owners must still configure and test the real
production environment. Never put a credential, configuration value, customer
record, public contact destination, alert-recipient address, raw log or trace,
private infrastructure identifier, or provider export in Git, an issue, a PR,
or chat.

## Gate definition

The gate passes only when one bounded run proves all of the following:

- its release candidate and independently retained environment manifest match
  the two hashes supplied separately to the assessor;
- every intended apex, `www`, API, asset, and other production hostname has
  correct DNS, HTTPS redirect, certificate, renewal, header, CORS, proxy-IP,
  object-privacy, and request-limit evidence;
- every runtime service is included in a value-free configuration inventory,
  with one owner and purpose per managed value plus uniqueness, entropy,
  least-privilege, audit, rotation, rollback, and expiry-alert evidence;
- all required operational signals have dashboards, targets, alerts, runbooks,
  and successfully delivered synthetic primary and escalation routes;
- sampled logs and traces contain no authentication material, one-time codes,
  full customer PII, KYC locators, payout destinations, private configuration,
  or unbounded-cardinality labels; and
- three named, role-qualified gate owners approve the completed run and none is
  the operator.

`PASS` is engineering evidence, not a final launch decision. Any missing,
unknown, duplicate, placeholder, sensitive, stale, mismatched, partially
delivered, or self-approved evidence returns `NO-GO` or `INPUT-ERROR`. Rejected
records never receive a passing evidence digest.

## 1. Freeze the candidate and environment manifest

Freeze the exact candidate commit before testing. In the restricted operations
evidence store, create an immutable environment manifest that binds at least:

1. the candidate commit and immutable image digests;
2. the rendered production topology and approved public configuration;
3. every intended public hostname and endpoint class;
4. every runtime service and value-free managed-configuration record;
5. monitoring rules, dashboards, runbooks, delivery routes, and ownership; and
6. the evidence-store location and retention policy for this run.

Hash the complete manifest with SHA-256. Supply that hash and the release
candidate to the assessor independently of the JSON record. Changing an image,
rendered configuration, edge rule, certificate, managed value, signal, route,
or owner invalidates the run and requires a fresh manifest and test.

Use opaque operator, approver, evidence, route, and synthetic-event IDs in the
JSON record. Keep their real identities and mappings in the access-controlled
evidence store.

## 2. Verify DNS, TLS, and the edge

Probe from an independent resolver and a network outside the production host.
Cover the apex, `www`, API, assets, and every other intended production
hostname. Retain full command output outside Git and record only reviewed
counts, booleans, and manifest digests in the gate input.

- Verify authoritative DNS and the intended origin/edge for every hostname.
- Verify HTTP redirects to the canonical HTTPS origin without an open redirect.
- Verify the complete trusted certificate chain, all required names, a minimum
  TLS version of 1.2, at least 30 days remaining, automated renewal, and a
  working certificate-expiry alert.
- Probe security headers on HTML, auth, dashboard redirects, API success, API
  error, and cached-asset responses. Require HSTS for one year, without
  `includeSubDomains` or preload until those wider commitments are separately
  approved.
- From an approved browser origin, verify CORS success. Also verify rejection
  of an unrelated origin, `null`, and look-alike suffix origins.
- Send spoofed forwarding headers through the public edge and prove that the
  application observes the trusted proxy-derived client IP.
- Prove object-store listing and private-object anonymous access are denied.
- Exercise slow-client, oversized-body, and request-rate bounds without using
  production customer traffic.

## 3. Review runtime configuration without values

The inventory must cover `postgres`, `redis`, `clamav`, `pgbouncer`,
`media-runtime`, `api`, `scheduler`, `web`, and `nginx`, even when a service has
no managed value of its own. Keep actual values in the approved secret or
configuration manager. The gate input contains only totals, control results,
and a digest of the restricted inventory.

For every managed value, record one owner, purpose, environment, consuming
service, and opaque manager-record ID. Then prove:

- the manager is approved and access is audited;
- values are unique by purpose and environment, meet the approved entropy
  policy, and contain no default or development material;
- each service can read only its required values and an unrelated identity is
  denied;
- server-only values do not appear in browser bundles, logs, traces, shell
  history, Compose output, or retained gate evidence;
- rotation and rollback have been exercised with a controlled non-payment
  value, and an expiry alert exists before the earliest due date; and
- no binding is unowned, stale, browser-exposed, duplicated across unrelated
  purposes, or left on a default value.

The payment provider remains disabled and deferred until separately approved.
Do not create payment credentials or execute a real payout for this gate.

## 4. Verify monitoring and every alert route

Create a dashboard, measurable target, alert rule, and actionable runbook for
each required signal:

- availability, latency, and HTTP 5xx;
- scheduler/queue liveness, database and Redis saturation/failures, storage,
  and malware-scanner health;
- certificate and managed-value expiry;
- authentication abuse, webhook lag, and payout failures.

Webhook and payout signals may use explicitly labelled synthetic events while
the payment provider is disabled. They must not trigger external money movement
or disclose customer information.

Define separate primary and escalation delivery targets in the restricted
manifest. Send a labelled synthetic event through every configured route. For
both the primary and escalation targets, record delivery, acknowledgement, and
recovery times and prove they are ordered and within the approved bounds. A
dashboard screenshot or a rule that was never delivered is not sufficient.

Inspect a representative sample of generated logs and traces. Retain the
detailed review outside Git and put only sample and finding counts plus its
SHA-256 digest in the JSON record. Verify monitoring access is restricted,
quiet-hours behavior is defined, every route has a current owner, and every
alert links to a tested runbook.

## 5. Obtain independent approvals

After all probes finish, obtain one approval for each exact gate:

- `ENV-DNS-01` from an `operations_independent_reviewer`;
- `ENV-SEC-01` from a `security_or_operations_config_owner`; and
- `ENV-MON-01` from an `operations_or_sre_owner`.

Each approver must be named in the restricted release record, use a distinct
opaque ID in the JSON, review the retained evidence, and approve after the
record's completion time. The operator cannot approve any of the three gates.

## 6. Assess and retain the record

Copy
[`environment-evidence.example.json`](environment-evidence.example.json) to a
location outside the repository and replace every placeholder from reviewed
evidence. Run:

```bash
python scripts/check_production_environment_evidence.py \
  --expected-candidate-sha "$RELEASE_CANDIDATE_SHA" \
  --expected-environment-manifest-sha256 "$ENVIRONMENT_MANIFEST_SHA256" \
  /outside-repository/environment-evidence.json
```

Exit `0` and `"status": "PASS"` are both required. Exit `1` means a safely
parsed record did not satisfy the gate. Exit `2` means the input could not be
safely parsed. The assessor emits only the validated run/candidate identity,
stable failure codes, and—on success—the SHA-256 of the complete record. It
does not echo unknown fields, provider IDs, route destinations, or evidence
references.

Retain the manifest, raw probes, value-free binding inventory, access/rotation
audits, monitoring configuration, synthetic delivery receipts, log-review
report, approvals, JSON record, and passing digest in the restricted evidence
system. Update the canonical launch register only after the named owners verify
that retained evidence. Keep release status `NO-GO` until these and every other
launch gate close. Coordinate any rerun with the capacity and recovery drills so
the final release decision refers to one exact candidate.
