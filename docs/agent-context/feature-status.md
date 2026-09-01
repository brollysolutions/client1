# Feature implementation status

Status: **Derived living implementation ledger**

As of: **2026-09-02**

Evidence baseline: `921858e` (`upstream/main`), plus the read-only Admin
field-visibility oversight delivery in
[PR TBD](https://github.com/brollysolutions/client1/pulls).

**Admin field-visibility oversight is complete locally — [PR TBD](https://github.com/brollysolutions/client1/pulls):**
platform Admin can inspect persisted `field_visibility_config` overrides in a
read-only Field visibility tab within Operational records. The paginated API
projection exposes only role, entity, field, visibility mode, and update time;
it omits updater identity and returns `private, no-store`. The existing
platform-Admin dependency and request-scoped PostgreSQL RLS remain authoritative,
with unauthenticated, Client, Sub Admin, and line-scoped Admin denials covered.
The withdrawn configuration editor and PUT route are not restored, and runtime
defaults plus Agent, Telecaller, and Employee field projections are unchanged.

Fresh evidence passes 21 focused PostgreSQL authorization/registry tests, API
Ruff/format, one Alembic head, deterministic OpenAPI/TypeScript generation, web
lint/typecheck and all 95 files / 609 unit tests, a focused authenticated Admin
Playwright journey, and a strict Linux production image that builds and exports
all 94 routes. The native Windows build reaches 94/94 routes before the known
standalone-symlink `EPERM`. The aggregate API run completes with three failures
outside the changed surfaces; a last-failed rerun leaves the existing
media-isolation environment expectation and shared-database catalogue-count
failure while the notification case passes. Security, design/accessibility,
and final diff review find no change-owned issue. `financial_service_enquiries`
is now the sole registry read gap, so FR-2.2 remains Partial and the completion
snapshot stays 78 Complete / 1 Partial / 99.4%.

**1 September exact-candidate rehearsal complete — NO-GO — [PR #285](https://github.com/brollysolutions/client1/pull/285):**
merged PR #284 is frozen exactly at
`9b9e763fa0255114ab2c1d33a66e252dd8c0f8fd`; the terminal record is
[`release-rehearsal-2026-08-30.md`](release-rehearsal-2026-08-30.md). Exact-SHA
[CI 33501907655](https://github.com/brollysolutions/client1/actions/runs/33501907655)
passes 1,948 API tests, 94 files / 608 web tests, the 94-route Linux standalone
build, four zero-retry production-browser journeys, and contract drift.
[Security 33501907605](https://github.com/brollysolutions/client1/actions/runs/33501907605)
passes frozen dependency audits; its Gitleaks merge range logged zero scanned
commits, so a separate Gitleaks 8.30.1 run scanned 527 full-history commits with
zero findings. [Sync 33501907627](https://github.com/brollysolutions/client1/actions/runs/33501907627)
passed main-to-`prod` branch synchronization, not a deployment.

Fresh local evidence passes 44 script tests with one expected Windows skip, API
Ruff/format, one Alembic head, web lint/typecheck and 608 tests, both frozen
dependency audits, and zero-finding API-image secret scanning. Eight distinct
exact application/service images build and current Trivy 0.74.0 reports 0 High
/ 0 Critical for all of them; CycloneDX inventories and machine reports remain
outside Git at `D:\release-evidence-9b9e763`. Exact web headers, API
health/CORS/auth denials, and a constrained real media transcode pass. A
451,037-byte database archive and 334-byte cold object archive restore with
matching synthetic source/target evidence. Docker Desktop returned HTTP 500
during concurrent final image/probe work, recovered after one restart, and the
completed exact images/reports/archives survived; invalid setup attempts are
identified and not counted.

Launch remains NO-GO. Local OCI identities are not approved published/re-pulled
registry manifests; no external-provider transfer, live payout, production
recovery/DNS/TLS/secrets/monitoring proof, risk acceptance, or deployment was
authorized. All nine qualified human/environment rows remain `Open`. No
application behavior, endpoint, schema/migration, generated contract,
authorization/RLS/business-line boundary, PII/KYC, cookie decision, dependency,
or formal feature-coverage count changed.

**Hosted catalogue-filter navigation recovery is complete locally - [PR #284](https://github.com/brollysolutions/client1/pull/284) - launch remains NO-GO:**
branch `fix/catalogue-filter-navigation-recovery` starts from merged PR #283
commit `1e4181ee1f7983a4404eb59c712cc08ce25efec9`. Exact-candidate CI run
`33493090662` passed the full repository gate and registration journey, but the
catalogue journey again failed after trusted input: its same-route filtered RSC
request received HTTP 200 headers in 6ms and remained uncommitted until the
test closed. The retained 3.75MB artifact expires 8 September; every preceding
card prefetch completed before the failed request, no marked element was
replaced, and no console/page error occurred. Four consecutive hosted runs
reproduced the navigation defect while repeated local `next start` runs passed.
The repair keeps App Router replacement as the normal in-place path, then after
eight seconds without URL commit performs a same-origin full-document replace
and restores a one-time, 60-second scroll coordinate. Browser storage contains
no query text or other user data. A deterministic browser regression stalls the
filtered RSC request, proves fallback URL/results/scroll recovery, and then
proves clear-filter navigation. Delayed and normal release journeys pass 4/4;
web lint, typecheck, 94 files / 608 tests, and 44 tracking tests with one
expected Windows skip pass. The controlled build compiles and generates 94/94
routes before the known Windows standalone-symlink `EPERM`. API, auth/RLS,
schema/contracts, business-line, PII/data, money, dependencies, deployment,
registry, approval, and release NO-GO boundaries remain unchanged. Merge-result
Linux standalone CI subsequently proved this repair in run `33501907655`; the
new exact-candidate rehearsal above supersedes this row's pending-evidence note.

**Hosted production-browser root-cause repair is complete locally - [PR #283](https://github.com/brollysolutions/client1/pull/283) - launch remains NO-GO:**
merge-result CI run `33486705171` passed full repository verification and then
failed the same two release journeys, this time preserving the complete
diagnostic bundle. Registration's trusted input, click, and submit events all
reached the connected initialized form; the production bundle then attempted
`http://localhost:8000/api/v1/auth/register/initiate`, which its own
`connect-src 'self'` policy correctly blocked. Catalogue search delivered its
trusted input event and began an HTTP 200 RSC request for the filtered URL, but
that request was immediately aborted before history or results committed. The
single `fix/release-gate-root-causes` task now defaults an unconfigured
production browser API base to the documented same-origin nginx path, retaining
explicit CSP-validated API origins and the non-production localhost fallback.
Persistent public-header links keep their semantic click and keyboard behavior
but no longer create a speculative RSC/chunk burst. Focused red/green coverage
and adjacent API/CSP checks pass 15 tests; full web lint, strict typecheck, 93
files / 606 tests, normal and delayed zero-retry release journeys at 4/4 each,
and all 45 script tests with one expected Windows skip pass. The controlled
source build compiles, type-validates, and generates 94/94 routes before the
known Windows standalone symlink `EPERM`; merge-result hosted CI must prove the
exact Linux standalone gate. Filter debounce/transition, server filtering,
failure evidence, API/auth responses, authorization/RLS, schema/contracts,
business-line, data, money, deployment, registry, approvals, and release NO-GO
remain unchanged. Once hosted CI is green, the next engineering priority is a
new exact-candidate frozen-release rehearsal while external and human sign-offs
remain open.

**Hosted release-interaction diagnostics are complete locally - [PR #282](https://github.com/brollysolutions/client1/pull/282) - launch remains NO-GO:**
merge-result CI run `33478724802` passed full repository verification, then
reproduced the same catalogue navigation and registration initiation failures
after PR #281's controls reached their explicit enabled/`aria-busy` boundary.
The runner generated a trace, screenshot, and error context but the workflow
discarded them. Branch `test/release-gate-hosted-diagnostics` now retains that
failure-only bundle for seven days through signature-verified, exact-pinned
`actions/upload-artifact` v7.0.1. Test-only diagnostics distinguish browser
input/click/submit delivery, marked-element replacement, console/page errors,
and sanitized request outcomes while excluding entered values, bodies, headers,
tokens, and response bodies. Fresh evidence passes the red/green upload
contract, full web lint, strict typecheck, 91 files / 602 tests, exact four-test
enumeration, a deliberate complete failure bundle, a delayed fresh-build
registration journey, and all 45 script tests with one expected Windows skip.
The native build compiles, type-validates, and generates 94/94 routes before the
known Windows standalone symlink `EPERM`; Docker remains unavailable for the
isolated catalogue fixture, so merge-result CI must provide the decisive bundle.
Retries, chunk delay, original behavior assertions, and all application,
API/auth, contract, schema/migration, RLS/business-line, PII/KYC, upload,
payout/webhook, cookie, runtime, deployment, registry, and approval boundaries
remain unchanged. This evidence PR does not claim the root fix.

**Residual production-browser interaction readiness is repaired locally - [PR #281](https://github.com/brollysolutions/client1/pull/281) - launch remains NO-GO:**
merge-result CI run `33464102303` passed the repository-wide verification and
browser install, then reproducibly failed the same two of four no-retry
production-artifact journeys. The prior network, focus, and pressed-state probes
proved only partial client ownership: the catalogue's controlled input and the
registration first step could be actionable before their passive initialization
commit completed. The catalogue search and clear controls now stay disabled and
the search form stays `aria-busy` until its client effect runs. Registration
does the same for first-step fields, service-line toggles, referral input, and
submit until saved/new wizard initialization finishes. Delayed release journeys
start at response commit, wait for that explicit enabled boundary, and retain
zero retries and all original behavior assertions.

Fresh final-source evidence passes changed-file ESLint, strict typecheck, all 91
web test files / 602 tests, all 44 repository script tests with one expected
Windows POSIX-resource skip, and `git diff --check`. Strict Linux image
`085d12ec2b28...` compiles, type-validates, generates all 94 routes, and exports.
The immediately preceding exact image passes delayed and normal browser gates at
4/4 each; the final image's post-export browser execution is explicitly not
claimed because Docker's API crashed after C: reached zero free bytes. Design
review removed an attempted component-level no-JavaScript fallback after direct
browser evidence showed the enclosing streamed Suspense payload is itself
hidden without JavaScript; that scope reduction is the sole change after the
passing browser artifact. No API/auth mock response, endpoint, schema,
migration, generated contract, auth/RLS, business-line, PII/KYC, upload,
payout/webhook, cookie, dependency, runtime, deployment, registry, or approval
boundary changes. Fork PRs still expose no hosted checks, so merge-result `main`
CI remains the required final engineering evidence and the exact-candidate
rehearsal remains blocked.

**Production runtime least privilege complete locally — [PR #279](https://github.com/brollysolutions/client1/pull/279) — launch remains NO-GO:**
`security/api-web-runtime-hardening` closes both engineering follow-ups from
the merged PR #278 rehearsal in one change. The Security workflow no longer
suppresses or documents `PYSEC-2026-1325`; `pip-audit==2.10.1` now checks the
frozen production lock without any vulnerability allowlist and reports no
known vulnerabilities. Production API, scheduler, and web services now use an
init, read-only roots, all-capability drops, no-new-privileges, explicit PID
limits, and bounded `noexec,nosuid,nodev` tmpfs mounts. API and scheduler expose
only `/tmp`; fixed UID 100/GID 101 ownership keeps that contract stable across
base-image changes, and the scheduler heartbeat stays there. Web likewise exposes only
`/tmp`, while ISR revalidation and image optimization use the explicit bounded
50 MiB memory cache with disk flushing disabled.

Fresh fail-closed evidence passes 11 production-runtime contracts and all 44
script tests (one expected Windows POSIX-resource skip), both production Compose
renders, API/scheduler import and write-boundary probes, API Ruff/format over
504 files, one Alembic head, production web dependency audit, web lint and
strict typecheck, 91 files / 602 tests, a strict 94-route Linux production
image, and 4/4 production-artifact Playwright journeys with retries disabled.
Repeated stale homepage revalidation under the exact hardened web settings
returns HTTP 200 with no filesystem, prerender-cache, or network errors; root
writes fail while only the declared `/tmp` tmpfs accepts writes. Trivy 0.74.0
reports 0 High/Critical rows for the final API and web images. Apart from the
explicit non-root identity, the API/scheduler application image content is
unchanged from the exact PR #278 candidate; application behavior, endpoint,
schema, migration, generated contract, auth/RLS/business-line boundaries,
PII/KYC, uploads, payouts/webhooks, cookies, dependencies, and release approval
do not change. Registry publication/re-pull, deployment, provider transfer,
production recovery/edge/secrets/monitoring evidence, and all nine human gates
remain open, so this engineering completion does not change the release NO-GO.

**Post-CVE exact-candidate rehearsal complete — NO-GO — [PR #278](https://github.com/brollysolutions/client1/pull/278):** merged
PR #277 is frozen exactly at
`eefc61d06708635f79055fe0187ede4fed3185cf`; the terminal record is
[`release-rehearsal-2026-08-30.md`](release-rehearsal-2026-08-30.md). Fresh
Trivy 0.74.0 scans report 0 High / 0 Critical rows across the exact API, web,
direct media worker, PostgreSQL, Redis, ClamAV, PgBouncer, nginx, and Compose
media outputs. Their CycloneDX inventories contain 123, 46, 132, 54, 23, 42,
26, 72, and 132 components respectively. Gitleaks scans all 786 commits with
zero findings, the API image secret scan is empty, production `pnpm audit` is
clean, and the frozen Python lock is clean under `pip-audit==2.10.1` without
the obsolete workflow exception.

The authoritative isolated Linux API run passes 1,948/1,948 tests without
skips or retries; all 504 files pass Ruff/format, Alembic has one
`d9f1a3b5c7e0` head, and generated contracts match. Web lint, strict typecheck,
91 files / 602 tests, the 94-route exact production build, and 4/4 exact-image
Playwright journeys pass. The production API image is healthy against fresh
PostgreSQL/Redis and passes exact-origin CORS plus negative auth probes. The
isolated media worker passes both 640x360 and maximum 1920x1080 H.264/AAC
round-trips under its production constraints. A 1,712,926-byte database backup
restores to the same head, 55-table count, and synthetic digest in 8.872
seconds; a cold object archive restores after source destruction with an
identical six-file manifest in 1.279 seconds. Docker Desktop stalled during the
first object extraction, was restarted, and the already-created backup then
restored successfully; that operational event is retained in the record.

Launch remains NO-GO. The exact GitHub CI, Security, and production-sync runs
executed zero steps because paid capacity is unavailable. No approved registry
publication/re-pull, approved external object transfer, live payout, production
recovery/DNS/TLS/secrets/monitoring evidence, risk acceptance, or qualified
human approval exists. The Security workflow's stale `PYSEC-2026-1325` ignore
must be removed even though the stricter current audit is clean. Production
Compose also does not enforce read-only roots for API/web; a stricter web probe
showed Next cache/ISR requires an explicit writable-path design before that
hardening can be claimed. No formal feature-coverage count, application
behavior, schema, contract, migration, authorization/RLS rule, cookie decision,
or production state changed.

**API and isolated media-runtime High/Critical remediation complete locally — [PR #277](https://github.com/brollysolutions/client1/pull/277) — launch remains NO-GO:**
`security/container-cve-remediation` replaces both vulnerable Debian runtime
footprints with supported digest-pinned Alpine bases and exact fixed OpenSSL,
SQLite, Python, and FFmpeg packages. The API production stage copies only its
frozen virtual environment from a build-only, digest-pinned `uv` stage; it runs
as `app` and contains neither `uv` nor FFmpeg. The unused `python-jose` ECDSA/RSA
chain is replaced with PyJWT while preserving HS256 token claims and exception
behavior through focused valid, expired, wrong-signature, and malformed-token
tests. The isolated worker still has no application dependencies, credentials,
persistent volume, or public port and retains non-root, read-only, capability-
dropped, no-new-privileges, CPU, memory, PID, timeout, address-space, and output-
size controls.

The final local API image is
`sha256:6a95bef6bc2451f1d0376dbde1bc5f779f15cbd6702a4e7cd8c610facce4a25d`
(87,395,581 bytes); current Trivy reports 0 High/Critical rows, its secret scan
reports 0 findings, and the CycloneDX inventory contains 123 components. The
final media image is
`sha256:4aee6affa6fe0a384218f36761e63a9ae3d1fadde83a038213d84e7c3182d064`
(71,072,923 bytes); current Trivy reports 0 High/Critical rows and its inventory
contains 132 components. The machine-readable reports are retained outside the
repository at `D:\release-evidence-cve-d9edc53`; their API vulnerability, API
secret, API SBOM, media vulnerability, and media SBOM SHA-256 values are
`2EBDD9690A6A9EF606008C53FDAC3FEA3AB30E317A150995C51572D0A108DC1F`,
`023692729B5DFD0BE9A27D2BD0580ACAC1E039249FB0F26A71152CA83592683B`,
`C706180047B92572CA6004BC4566EBA6E5A0D7851D2D9A6C0AC8D46A78663D6B`,
`1680FDA3BAECAA8C7463B7634E9237D2E6359622CB9AE5BEA684A7254A94CEB1`,
and `9028D24F51C73514042C63D7E015C3C8C474995A78B7B4A7EECB2F3BC87B35A1`.

Fresh verification passes a dedicated-network, freshly migrated Linux API
aggregate at 1,948/1,948 tests in 1:15:55 without skips or retries; all 504 API
files pass Ruff and format checks; the four direct JWT cases pass; Alembic has
the single `d9f1a3b5c7e0` head; 34 structural/tracking/runtime tests pass with
one expected Windows POSIX-resource skip; both Compose models render; and the
final API runtime completes an HS256 round-trip without Jose/ECDSA, `uv`, or a
native media parser. The final media image becomes healthy and completes real
three-second 640x360 and policy-maximum 1920x1080 H.264/AAC transcodes under the
documented production constraints. The frozen API dependency audit reports no
known vulnerabilities after the existing documented `PYSEC-2026-1325`
exception; the production web audit is clean, and web lint, strict typecheck,
and all 91 files / 602 tests pass. The native Windows web build compiles,
typechecks, and generates 94/94 routes before the known standalone symlink
`EPERM`, so that host command is not claimed as a pass. A broad host auth attempt
was superseded by the clean authoritative Linux aggregate after the host lacked
the Compose-only `redis` DNS name.

No endpoint, schema, migration, generated contract, authorization/RLS rule,
cookie behavior, upload or payout, registry publication, deployment, production
access, advisory acceptance, or human approval changed. Launch remains NO-GO:
merge this remediation, freeze and rehearse that exact commit, publish/re-pull
and scan final registry manifests, obtain external-provider and production
recovery/DNS/TLS/secrets/monitoring evidence, and close all nine qualified human
sign-off rows. Paid GitHub Actions remain unavailable and are recorded as
unverified, not waived. Essential authentication cookies still require no
consent banner; privacy/security review and clear Accept/Reject controls are
required before enabling analytics, advertising, replay, attribution, chat, or
other non-essential storage where consent applies.

**Final exact-candidate rehearsal complete — NO-GO — [PR #276](https://github.com/brollysolutions/client1/pull/276):**
merged PR #275 is frozen exactly at
`fb692260c4793562b49915e740fbac09dd893b6d`; the terminal record is
[`release-rehearsal-2026-08-30.md`](release-rehearsal-2026-08-30.md). The
authoritative dedicated-network Linux aggregate passes 1,944/1,944 API tests in
1:12:07 with no skips or retries. The exact frozen web image passes all four
production-artifact Financial Services and registration journeys in 22.5
seconds with one worker and no retries. Web lint, strict typecheck, 91 files /
602 tests, the 94-route Linux production build, API style/format and one-head
migration checks, current secret/dependency/container scans, exact local
headers/CORS/auth/role/upload/webhook/media probes, and matching timed synthetic
database/object restores all have terminal evidence.

Launch remains NO-GO. GitHub CI, Security, and production-sync runs executed
zero steps because no paid capacity is available. The API image retains 14 high
/ 3 critical Trivy rows and the isolated media image retains 137 high / 7
critical rows, all without a reported fix or acceptance. Final published
registry references, an approved external-provider upload, and production
recovery/DNS/TLS/secrets/monitoring evidence are absent. Every one of the nine
qualified human sign-off rows remains Open. No application behavior, contract,
schema, migration, dependency, authorization/RLS, or formal feature-coverage
count changed. Essential authentication cookies still require no consent
banner; privacy/security review and clear Accept/Reject controls are required
before any non-essential storage is enabled where consent applies.

**Production-artifact Playwright gate repaired - [PR #275](https://github.com/brollysolutions/client1/pull/275):**
CI now installs pinned Chromium and runs four Financial Services/registration
journeys against the standalone Next production server with retries disabled. A
loopback-only fixture serves generated-contract-shaped financial products and a
provider offer through `API_INTERNAL_URL`; the gate fails if the standalone
artifact is absent. This makes the previously missing runtime API explicit
instead of accepting a production page with no catalogue data.

The two stale browser assertions are corrected without changing UI behavior:
the homepage test identifies the Loans, Properties, and calculator bands by
their semantic section ids despite legitimate duplicate campaign copy, and the
provider check accepts any root-relative internal action, including the existing
`/contact` enquiry path, while rejecting absolute and protocol-relative links.
The mocked registration journey now supplies the refresh response used when the
authenticated route-group provider mounts, eliminating its intermittent redirect
to Home.

Fresh evidence: web lint and strict typecheck pass; all 91 files / 602 unit tests
pass; the fixture-backed production server passes 4/4 before the launcher is
tightened; the final fail-closed launcher passes Node syntax checks and enumerates
exactly four tests; and three repeated runs against the exact production image
and 12 live catalogue cards pass 12/12.
The pre-fix image reproduced both financial assertions, while five repeated
registration runs reproduced one 60-second Home redirect and four passes. The
strict pre-change image builds all 94 routes. The post-change image reinstall
passed the frozen 645-entry supply-chain check, then Docker stopped responding
during compilation; it was interrupted, so no post-change image export or final
standalone-gate execution is claimed. Hosted CI remains blocked by billing, so
the new gate has not yet run on GitHub. No application component, API, contract, authorization/RLS, cookie,
upload, payment, schema, migration, dependency, or formal feature-coverage count
changed. Launch remains NO-GO pending a complete exact-candidate rehearsal and
the existing image, registry, recovery, edge, secrets, monitoring, upload, and
human-approval gates.

**API frozen-release baseline repaired - [PR #274](https://github.com/brollysolutions/client1/pull/274):**
the 11 reproducible stale policy, invalid property-UUID fixture, and validation-
order failures identified in PR #273 are corrected, together with the payout
grace-window and automatic Employee-assignment cases that depended on aggregate
order and shared state. Test journeys now create canonical active property UUIDs,
validate request bodies before asserting non-enumerating ownership failures, and
isolate Employee capacity when the intended outcome is the retry pool. The
content-block RLS oracle now matches the merged platform-Admin override while
retaining Sub Admin creator ownership and the typed application lifecycle.

A fresh, directly addressed PostgreSQL database migrated to the single
`d9f1a3b5c7e0` head; all 503 API files pass Ruff and format checks; the complete
Linux aggregate passes 1,944/1,944 tests in 58:09. Maintainer and security review
found no change-owned issue. No endpoint, schema, generated contract, application
authorization, grant, RLS policy, migration, product workflow, dependency, or
formal feature-coverage count changed. Launch remains NO-GO because this removes
only the API baseline blocker: Playwright, hosted billing, image findings and
registry evidence, external recovery/edge/secrets/monitoring evidence, positive
provider upload, and all qualified human approvals remain open. Next priority is
the production-artifact Playwright release gate with reachable catalogue data.

**Exact-candidate rehearsal complete — NO-GO — [PR #273](https://github.com/brollysolutions/client1/pull/273):**
merged PR #272 is frozen at `c37b9d5fb68ea30daa5f4f55dd15f97cf27ce547`;
the current evidence is in
[`release-rehearsal-2026-08-30.md`](release-rehearsal-2026-08-30.md). Exact
Linux API/web/media artifacts, fresh Trivy/SBOM evidence, production-mode
headers/CORS/auth/role/upload-presign/webhook probes, and timed isolated
database/object restores now have terminal local results. The security-focused
API set passes 93/93; web lint/typecheck and 91 files / 602 tests pass; the
strict Linux build produces all 94 routes. The full API aggregate remains red
at 1,931 passes / 13 failures; a fresh-database rerun passes two order-sensitive
cases and reproduces 11 known stale-policy/UUID-fixture/validation-order tests.
Playwright has one pass, one flaky retry, and three failures requiring a current
locator plus reachable production-like catalogue data.

Launch remains blocked. Hosted CI/Security/sync jobs executed zero steps because
of the account billing/spending-limit condition. The exact API image retains 14
high / 3 critical finding rows, and the exact isolated media image retains 137
high / 7 critical rows; no fix is reported and no acceptance exists. The six
service outputs lack final published registry-manifest hashes. The local restore
does not prove production backup controls or RPO, a positive external upload was
not exercised, and real DNS/TLS, secrets, monitoring, incident ownership, and
all nine human/environment register rows remain open. No application behavior
or formal feature-coverage count changes. Essential authentication storage still
needs no consent banner; privacy/security review and clear Accept/Reject controls
are required before enabling non-essential storage where consent applies.

**Runtime-image contract complete locally — [PR #272](https://github.com/brollysolutions/client1/pull/272) — release remains NO-GO:**
`security/runtime-image-pinning` now covers all six production service images
present after merged PR #271. PostgreSQL 18.6, Redis 8.10.1, ClamAV 1.4.6 LTS,
PgBouncer 1.25.2, and nginx 1.30.4 use versioned, upstream-manifest-pinned bases
and exact patched Alpine packages. The media worker uses its existing digest-
pinned Python 3.12 slim base and checked-in Dockerfile. Production Compose no
longer builds or accepts a mutable tag for any of the six: each human-readable
release tag requires a supplied 64-character final registry manifest hash,
including `MEDIA_RUNTIME_IMAGE_SHA256`.

Trivy 0.74.0 reports zero high and zero critical findings in each of the five
existing local service outputs; their CycloneDX inventories contain 54, 23, 42,
26, and 72 components respectively. The exact media-worker output reviewed in
merged PR #271 is
`sha256:2646e443e722b471149ee63359dbad253f36c0f1e06d1fca1c60110907e2d403`;
its 294-component SBOM and scan report 137 high rows, 7 critical rows, 45 unique
advisories across 24 packages, and no reported fix. Isolation contains those
findings but does not remediate, waive, or make them release-acceptable.

A fresh no-cache media rebuild completed as local OCI index `c18d048c4111…`
after Debian supplied newer OpenSSL packages, demonstrating why only the final
published manifest is deployable. Its fresh Trivy run did not complete: the C:
drive reached zero free space while downloading the scanner database and Docker
Desktop stopped responding. The failed invocation produced no evidence file,
and `c18d048c4111…` is explicitly unreviewed and must not be published. The
operator must publish an exact reviewed artifact, record all six registry
hashes, pull and rescan those references, and resolve or specifically accept the
worker findings before the exact-candidate rehearsal.

The prior five-image branch evidence remains: cold-start/health/config/runtime-
user checks; a Linux API aggregate with 1,885 passes, the same 13 unrelated
baseline failures, and zero errors; web lint/typecheck/602 tests and 94-route
Linux production build; one Alembic head; and exact cleanup. The PR #271 worker
evidence remains: 7/7 unit tests, real 1920x1080 H.264/AAC round-trip, five
sequential transcodes with concurrent health probes, and the secretless,
internal, non-root, read-only resource limits. This integration adds negative
contracts for the sixth release build/final reference and preserves the merged
CORS, media, and human-sign-off records. Formal feature coverage is unchanged,
and all other rehearsal and human gates remain open.

Fresh integration evidence runs 34 script/runtime/tracking tests: 33 pass and
one has the expected Windows POSIX-resource skip. Another 54 focused
media/config API tests pass with one Linux-only skip; Ruff and format pass
across all 503 API files, with one Alembic head,
web lint and strict typecheck, and all 91 files / 602 web tests. Both Compose
models render with synthetic configuration; the production render includes all
six final registry references and fails closed when the media digest is absent.
The native web build compiles, typechecks, and generates 94/94 routes before the
established Windows standalone-symlink `EPERM`. The fresh worker scan/SBOM,
runtime smoke, Linux production build, and aggregate repository gate remain
unverified after Docker became unavailable; a skipped gate is not a pass.

**Done - [PR #270](https://github.com/brollysolutions/client1/pull/270) - credentialed browser CORS method/header hardening:**
`security/cors-policy` removes the API's wildcard method and request-header
grants. The explicit browser surface is now `GET`, `POST`, `PUT`, `PATCH`, and
`DELETE`, with `Authorization`, `Content-Type`, and `X-Business-Line` as the
only non-safelisted request headers. `X-Report-Truncated` is explicitly exposed
for the existing report download client. Configured origin matching and
credential support are unchanged, while configuration now fails closed for
wildcard, opaque `null`, userinfo, malformed-port, path/query/fragment, and
non-HTTP(S) entries. An empty origin list remains valid and denies all
cross-origin grants.

The inventory covers the central browser wrapper, refresh-cookie and Bearer
paths, business-line requests, report downloads, and both direct browser
uploads. Those uploads POST multipart form data to object storage rather than
the API and therefore retain their separate provider CORS policy. The secure,
host-only, path-scoped, SameSite-Strict refresh cookie is unchanged. There is no
API route, schema, generated contract, auth/RLS, business-line, upload policy,
dependency, CSRF, or proxy-trust change.

Fresh evidence: all 48 focused CORS/config tests pass on the host, and the
pre-final 42-test set passes inside the Linux API image. Positive cases cover a
production-style HTTPS origin across refresh, Bearer, business-line, JSON
upload-presign, report-download, and every approved method; negative cases
cover arbitrary, opaque `null`, suffix-confusion origins, HEAD/TRACE, and an
invented header. Simple requests and requests without `Origin` retain their
normal application responses. All 503 API files pass Ruff and format checks;
exactly one Alembic head, 11 migration/RLS tracking tests, and 4 production-
runtime tests pass. Web lint, strict typecheck, and all 91 files / 602 tests
pass. The native build compiles, typechecks, and generates 94/94 routes before
the established Windows standalone-symlink `EPERM`; the strict Linux
production image completes the same build, standalone copy, and image export.

The fresh Linux API aggregate completes with 1,911 passes and 13 failures. An
exact rerun of those failures on a newly migrated database makes the payout
grace-window and task-assignment cases pass, confirming order/shared-state
sensitivity; the remaining 11 reproduce stale content-block policy, UUID
property fixture, and validation-order expectations. No CORS/config test fails,
and the changed 48-test set is green after the aggregate. The repository's Bash
wrapper could not execute because this Windows host has no installed WSL
distribution; every available constituent gate above was run directly.
Security and maintainer review found no change-owned issue. Residual evidence
is the real deployed browser, reverse-proxy, and object-storage edge probe
against the exact release candidate. Next priority is the remaining frozen-
release blocker remediation and exact-candidate rerun.

**Rehearsed — NO-GO — [PR #268](https://github.com/brollysolutions/client1/pull/268) — frozen release candidate and launch evidence:**
`chore/frozen-release-rehearsal` freezes merged PR #267 at `3cc6bc0` and records
the full result in
[`release-rehearsal-2026-08-30.md`](release-rehearsal-2026-08-30.md). The work
corrects frozen-lock dependency auditing, five Python dependency findings, a
production API startup failure under its no-home user, and all 13 high/critical
findings in the web runtime. It also adds narrow historical Gitleaks false-
positive handling and production-runtime contract coverage.

The candidate is not launch-ready. Hosted GitHub jobs did not start because of
the account payment/spending-limit condition. The rebuilt API and directly
referenced service images retain unaccepted high/critical findings; pgBouncer's
base is EOL and production tags are not digest-pinned. Docker Desktop then
failed with engine HTTP 500 during the fresh aggregate API run and isolated
production/recovery exercise, leaving the aggregate, runtime CORS/auth/upload/
webhook journeys, and timed restore inconclusive. Real DNS/TLS, secrets,
backups, monitoring, incident ownership, and the named legal/privacy/trademark/
processor decisions remain external human gates. The essential-authentication-
cookie decision remains unchanged: no banner until non-essential storage is
introduced, then equally clear Accept/Reject controls where consent is required.

Fresh completed evidence: all 502 API files pass Ruff/format; exactly one
Alembic head plus 7 feature-tracking, 11 migration/RLS, and 4 production-runtime
tests pass; frozen Python and production Node dependency audits have no
unaccepted finding; a 492-commit Gitleaks run reports no leak and detects its
synthetic canary. Web lint, typecheck, 91 files / 602 tests, strict 94-route
Linux production build, non-root runtime, headers/redirects, and a zero-high/
zero-critical image scan pass. The fresh API aggregate reached 64% before the
engine failure and has no final total, so prior PR evidence is not presented as
a rehearsal pass.

**Done — [PR #271](https://github.com/brollysolutions/client1/pull/271) — `security/media-runtime-isolation` — frozen-release native-media blocker:**
Attacker-controlled MP4 parsing no longer executes in the credentialed API or
scheduler image. A digest-pinned, secretless worker performs FFprobe/FFmpeg
processing as UID/GID 10001 with a read-only root, an owned bounded noexec tmpfs,
all capabilities dropped, no-new-privileges, no volumes or public port, and no
route to the database, Redis, object storage, or other application networks.
Only the scheduler joins the internal `media-control` network. The API shares
and validates the exact production worker origin because its Settings model is
common, but it has neither a worker call path nor membership in that network.

The scheduler still owns the database row lock, object transfer, fail-closed
ClamAV scan, canonical replacement, retryable/private processing state, cleanup,
and retention. Existing authentication, ownership/RLS, private storage,
signature/type/size validation, quotas, idempotency, deletion, and upload API
contracts are unchanged. Missing or unsafe production worker configuration
refuses application startup; worker or scanner unavailability leaves work
private and retryable and removes partial output.

Runtime contracts assert the reviewed base pin and explicit one-CPU, 768 MiB
real-memory, 64-PID, 32-child-process, 185-second child-CPU, 180-second wall,
1.25 GiB child address-space, 20 MiB input/output/file, 128 MiB allocation,
single-thread codec/filter, and 64-descriptor bounds. The higher virtual-address
limit is intentionally distinct from the lower hard container memory cap: real
1080p H.264 encoding failed at 1 GiB virtual space, passed at 1.125 GiB, and
uses 1.25 GiB for bounded headroom while the 768 MiB cgroup cap remains intact.
The final 10-second health budget stayed healthy during intended transcode load.

Fresh evidence: focused API config/transport/storage/retry/scheduler tests pass
61; the hardened Linux worker passes 7/7 unit tests and a real 1920x1080
H.264/AAC round-trip; five sequential transcodes and four concurrent health
probes all return HTTP 200 with 21 ms maximum probe latency. Production-runtime
contracts pass 7, feature tracking 7, migration/RLS tracking 11, Ruff and format
all 503 API files, exactly one Alembic head, regenerated contracts with no diff,
production Compose rendering, web lint/typecheck, and 91 files / 602 tests.
The Linux API aggregate completes 1,899 passes and the same 13 unrelated
baseline failures; the native web build compiles, typechecks, and generates
94/94 pages before the established Windows standalone-symlink `EPERM`.

The exact worker image is
`sha256:2646e443e722b471149ee63359dbad253f36c0f1e06d1fca1c60110907e2d403`
with a 294-component CycloneDX 1.7 SBOM. Its Trivy 0.74.0 scan reports 137 high
rows, 7 critical rows, 45 unique advisory IDs, and 24 affected packages; no row
reported a fixed version. These native/transitive findings are contained by the
boundary, not removed, waived, or asserted unreachable. Container/kernel escape
and worker availability remain residual risks. The API image separately proves
FFmpeg/FFprobe absent but retains 14 high / 3 critical scan rows. Image/PDF
native parsing, ClamAV/service isolation, remaining API/service image findings,
hosted-CI recovery, immutable replacement of other production images,
exact-candidate rehearsal, recovery evidence, and all human/
environment sign-offs remain release blockers and the next priority. This slice
does not change SRS completion counts or the release NO-GO decision. Security
and maintainer review found no remaining change-owned actionable defect. After
integrating merged PRs #269 and #270, the combined config/CORS/media set passes
74 tests with one expected Windows POSIX skip; both seven-test runtime suites,
the tracking/RLS guards, and full 503-file Ruff/format checks pass.

**Human launch sign-off register prepared — approvals remain open — [PR
#269](https://github.com/brollysolutions/client1/pull/269):**
[`launch-signoff-register.md`](launch-signoff-register.md) adds a canonical,
evidence-linked decision register for trademark, legal entity, Terms,
privacy/data inventory, processors, DNS/TLS, secrets, monitoring, and incident
ownership. It defines valid
approver/date/evidence fields and bounded risk-acceptance rules without placing
secrets, private contracts, production exports, customer data, or privileged
legal material in Git. Every gate deliberately remains `Open`; this
documentation is not legal advice, environment proof, or launch approval. The
essential-authentication-cookie decision is unchanged, and non-essential
storage still requires prior privacy/security review and clear Accept/Reject
controls where consent applies. Fresh verification: every changed relative
Markdown link resolves, all 7 feature-tracking tests pass, `git diff --check`
passes, and security/maintainer review found no actionable issue.

**Done - [PR #267](https://github.com/brollysolutions/client1/pull/267) - FR-2.2 Admin controlled-correction and operational audit remediation:**
`codex/20260829-163717-implement` closes the original typed approved-listing
correction gap and all seven named audit families. The correction is a platform-
Admin-only, reason-required staged edit of an approved submission: the current
public catalogue row and approved media remain unchanged until RERA re-review
and approval update that same row. Content authoring/lifecycle, loan progression,
and property-deal progression now append same-transaction business audits;
later merged banner, offer, referral-rule, and automatic-task assignment writers
have explicit registry and regression coverage. Audit detail records operation,
status transitions, changed field names, identifiers, and the required correction
reason without copying customer, financial, or protected field values.

The exhaustive registry identified two newer read-only visibility gaps. The
current read-only Operational records delivery closes `field_visibility_config`;
`financial_service_enquiries` remains, so FR-2.2 stays Partial rather than being
overstated as globally complete. Protected
secrets, locations, private media/documents, immutable ledgers, payouts,
ownership, RLS, and business-line boundaries are unchanged. The frozen-release
rehearsal and human launch sign-offs remain separate next phases.

Fresh evidence: all 502 API files pass Ruff and formatting; the final affected
registry/schema/property/content/loan/deal set passes 174 tests. The Docker
aggregate completes 1,881 passes, 15 failures, and 2 skips in 63m35s; all 15
failures match the unrelated stale/shared-state baseline documented by PR #259,
while the changed families are green in the final focused run. The audit
migration round-trip and exactly one Alembic head pass; generated OpenAPI and
TypeScript contracts are current. Feature tracking (7), migration/RLS tracking
(11), the base-ref co-change guard, and `git diff --check` pass. Web lint,
strict typecheck, and all 91 files / 602 tests pass. The native build compiles,
typechecks, and generates 94/94 routes before the established Windows
standalone-symlink `EPERM`; the strict Linux production image completes through
standalone export and includes the correction route. An authenticated Admin
browser pass covers Published -> Edit -> Open correction plus the 390x844 form,
required reason, retained-media copy, return navigation, no horizontal overflow,
and no changed-page console error. Security, design/accessibility, and final
maintainer review found no remaining change-owned issue.

**Done - [PR #266](https://github.com/brollysolutions/client1/pull/266) - pre-deployment authentication and session assurance:**
`codex/20260829-163717-implement` closes two bounded gaps found while tracing
the password and session lifecycle for the direct pre-deployment request.
Unknown-mobile login now performs one verification against a valid non-secret
Argon2id placeholder and follows the same identifier/IP failure budgets,
nullable-subject security-event persistence, and generic rejection as a known
account with a bad password. Password-reset capabilities now carry a dedicated
ten-minute expiry instead of inheriting the general access-token lifetime.

Signed reset purpose/mobile claims, atomic token single use, neutral account-
state failures, refresh rotation/reuse detection, and password-triggered
access/refresh revocation are preserved. The cookie regression asserts
`HttpOnly`, `Secure`, `SameSite=Strict`, the exact refresh path, and host-only
scope. The adjacent mobile-change test now correctly proves generation 1 -> 2
for mobile replacement and 2 -> 3 for the password reset already in that
scenario. There is no MFA/SSO, identity, role, RLS, migration, dependency, API-
shape, or auth-screen change.

Fresh evidence: both focused regressions failed before implementation and the
final direct service tests pass; the Docker-backed auth directory passed all
267 tests before the final audit/rate-symmetry follow-up, and the adjacent
mobile-change regression passes afterward. All 501 API files pass Ruff and
format checks. The aggregate API run completed with 1,877 passes and 16
failures in 74 minutes; correcting and rerunning the one adjacent stale
assertion leaves the same 15 unrelated stale/shared-state baselines documented
by PR #259. Web lint, strict typecheck, and all 91 files / 601 tests pass. The
native production build compiles, typechecks, and generates all 94 pages before
the established Windows standalone-symlink `EPERM`; the Linux retry became
infrastructure-inconclusive when Docker Desktop's engine stopped responding.
Feature tracking (7), migration/RLS tracking (11), the base-ref co-change gate,
and exactly one Alembic head pass. Security and maintainer review found no
remaining actionable issue.

**Done - shared dashboard interaction foundation:**
`codex/20260829-163717-implement` ([PR #265](https://github.com/brollysolutions/client1/pull/265)) continues the direct pre-deployment request
with a bounded shared-shell and primitive change. It adds dashboard bypass
navigation and makes navigation resizing, press/hover feedback, dialogs,
drawers, menus, and popovers use consistent restrained timing with equivalent
reduced-motion states. It does not redesign individual workflows, add
decorative looping motion, or alter API, authorization, RLS, business-line,
session, payment, upload, dependency, or data behavior.

The dashboard skip link is the first application-owned focus target and moves
focus to the shared main landmark. Shared direct feedback completes in 150ms;
structural shell/dialog/drawer changes complete in 200ms or less. Every changed
spatial animation has a reduced-motion fallback, `transition-all` remains
prohibited, and menu/select/tooltip/accordion/tab state remains perceivable
without animation.

Fresh evidence: the focused interaction contract failed four assertions before
implementation and passes all four afterward; web lint and strict typecheck
pass; all 91 web test files / 601 tests pass. A focused Playwright Client
journey verifies visible skip focus and main-content transfer, computed
`transition-property: none` under reduced motion, the 390px Workspace drawer,
close behavior, and no horizontal overflow. The native build compiles,
typechecks, and generates 94/94 pages before the established Windows
standalone-symlink `EPERM`; the strict Linux production image completes the
same build plus standalone copy and image export. Design/accessibility review
found no actionable issue. The development Compose stack was restored after a
base-only invocation briefly omitted its source-mount override; no tracked
runtime configuration changed.

**Done - pre-deployment launch foundation:**
`codex/20260829-163717-implement` ([PR #264](https://github.com/brollysolutions/client1/pull/264); direct user instruction; no formal
requirement or completion-percentage change) is the first cohesive slice of the
broader pre-launch request. The public shell and campaign preview now use the
single Dhanadhara identity, with the wordmark restored to desktop public chrome.
Strict production-image configuration rejects missing, sample, malformed, or
insecure public origin/contact/API/asset values while local previews retain
explicit sample fallbacks. Privacy, Terms of Use, and the new responsive Cookie
Notice are linked from every public footer and the sitemap. The notice records
the two actual essential authentication cookies plus separate browser storage
and explains why an accept-only banner would not provide meaningful consent.

All web routes receive a centralized CSP, frame/object blocking, MIME-sniffing,
referrer, permissions, opener, origin-agent, and production-only one-year HSTS
baseline. HSTS deliberately excludes subdomains until the operator inventory
proves they are permanently HTTPS. Normal-text brand/action/status tokens meet
WCAG AA on white and cream; broad `transition-all` animations were replaced by
the properties they actually animate, reduced-motion behavior was added to the
affected shared controls, and public pages gained a first-focus skip link. The
tracked pre-deployment checklist covers visual identity, brand promise,
consumer psychology, narrative/claims, market execution, legal/trademark/data,
cookies/consent, application/database/upload/payment security, TLS/secrets,
restore/monitoring/incidents, release sign-off, and post-launch review.

This slice deliberately does not introduce analytics, advertising cookies, a
consent-management vendor, external telemetry, dependencies, auth/RLS/payment
changes, or a page-by-page redesign. Those would widen the privacy, security,
and regression surface beyond a reviewable launch-foundation change. Existing
server-side authorization, secure refresh cookies, reset/session revocation,
rate limits, upload controls, payment-webhook verification, RLS, secret guards,
and audit logging remain unchanged and must continue to pass their existing
gates.

Fresh evidence: web lint and strict typecheck pass; all 90 test files / 597
tests pass, including new identity, strict Docker/Compose wiring, cookie
inventory, header/CSP/HSTS, legal-link, logo, and ten-token contrast gates. A
fresh Next production build compiles, typechecks, and generates 94/94 pages,
then reaches the repository's established Windows standalone-copy symlink
`EPERM`. Desktop and 390px Playwright review returns 200 with no console error
or horizontal overflow, exposes Dhanadhara in the shared header, puts the skip
link first in keyboard focus, shows every cookie field as a mobile card, and
turns off the announcement marquee under reduced motion. Security/design review
fixed the absent public wordmark, hidden mobile table fields, overly broad
transitions, client-side placeholder-bundle path, strict loopback allowance,
sample-value acceptance, and premature HSTS subdomain scope. No actionable
change-owned security or design finding remains. After an initial Docker Desktop
engine HTTP 500/RPC EOF, the controlled retry passed: the strict Linux
production image compiled, typechecked, generated 94/94 pages, completed
standalone tracing/copy, and exported successfully. The pre-existing dev web
container was restored and returned to its healthy startup path afterward.

**Done - [PR #263](https://github.com/brollysolutions/client1/pull/263) - rent/lease listings and external listing links:**
`claude/20260829-133027-rent-for-properties-link-option-while-list` ([PR #263](https://github.com/brollysolutions/client1/pull/263); direct user instruction; no formal requirement or completion-percentage
change) adds a sale-vs-rent axis to the real-estate catalogue and a structured,
host-allowlisted place for author-supplied links out to the property elsewhere.

Before this change the catalogue was sale-only. `properties` and
`property_submissions` had no listing-intent column, `format_inr_display` in
`app/services/property_submissions.py` always produced lakh/crore strings, and
`features/real-estate/property-filter-body.tsx` offered no transaction facet.
Migration `c8d0e2f4a6b9` (off the single head `b7c9d1e3f5a8`) adds the
`re_listing_intent` enum plus `listing_intent`, `security_deposit_paise`,
`minimum_lease_months`, `available_from`, and `listing_links` to both tables, and
a partial index on active rows. It is expand-only: `listing_intent` is NOT NULL
with server default `sale`, which is an exact backfill because every pre-existing
row was a sale listing. No RLS policy or grant changed -- `properties_rls` is a
row-level `FOR SELECT` predicate with no column dimension, and the existing
grants on both tables are table-wide.

`price_paise` is reused as the headline amount (sale price, or monthly rent)
rather than adding a parallel `monthly_rent_paise`, so every existing sort,
filter, and index keeps working; `format_inr_display` branches on intent.
Rent-only fields are rejected on a sale listing in both directions, which is what
stops a draft switched back from Rent to Sale from shipping a stale deposit.
`sale_type` is now optional on the project/commercial/plot detail models and is
required for sale and forbidden for rent.

The link field is a deliberate, narrow carve-out from the property no-links
policy. `_normalize_public_text` in `app/schemas/property_details.py` still
rejects every URL, email, and markdown link in free text, and that test still
passes. `app/schemas/listing_links.py` derives the platform from an exact-match
host allowlist instead of trusting an author-supplied value, so a link cannot
wear a badge for somewhere it does not go, and `lib/listing-links.ts`
re-resolves every stored link at render time so a row saved before an allowlist
change cannot render as trusted. Links reach the public catalogue only through
the existing Admin approval gate, and render with
`target="_blank" rel="noopener noreferrer"`.

Fresh evidence: API Ruff check and format pass; `alembic heads` reports exactly
one head (`c8d0e2f4a6b9`); 61 property schema, submission, and price-display
tests pass, including new coverage for the intent rules, host-allowlist
rejection (non-HTTPS, embedded credentials, suffix-confusion `youtube.com.evil.example`,
shorteners, `javascript:`, protocol-relative), platform-spoofing, the four-link
cap, and the unchanged narrative link ban. Contracts regenerated and committed.
Web lint passes, strict typecheck passes, and all 84 files / 567 unit tests pass,
including the form-surface registry gate for the new
`features/real-estate/listing-links-field.tsx`. `pnpm build` compiles, typechecks,
and generates all 93 pages; the standalone symlink copy step fails with EPERM on
this Windows host, which is an environment limitation of `output: "standalone"`
and unrelated to this change.

**Done - [PR #262](https://github.com/brollysolutions/client1/pull/262) - campaign phone preview withdrawn:**
`claude/20260829-131005-remove-phone-preview-as-of-now` (direct user
instruction; no formal requirement or completion-percentage change) removes the
phone preview added in PR #261. With a single width remaining, the size control
is removed rather than left rendering one option.

`ViewportFrame` now renders at `DESKTOP_VIEWPORT_WIDTH` and takes no viewport
prop; `VIEWPORT_WIDTHS`, `ViewportName`, `viewportLabel` and the `PreviewDevice`
type are removed, as is the device state in the banner wizard, offer form,
banner queue and offer queue. `CampaignPreviewPanel` and `WorkspacePreviewFrame`
state the previewed width as static text. The scaling, centring, `inert`
treatment and production-component parity are unchanged, and the file documents
what restoring a phone preview would take.

Fresh evidence: web lint, strict typecheck, and all 82 files / 523 unit tests
pass; the viewport-contract test now asserts a single width and the absence of a
size switcher. Live browser review on the Docker stack confirms no `Preview
size` group and no phone or desktop control on the banner wizard, the offer
form, or the banner edit workspace, a static `Desktop · 1440px` caption on all
three, and the preview still laying out at 1440 CSS pixels while rendering
scaled to 1258, with no console errors. No API, contract, migration,
authorization, or RLS behaviour changed.

**Done - [PR #261](https://github.com/brollysolutions/client1/pull/261) - campaign authoring follow-up:**
`claude/20260829-122607-the-current-ui-is-good-for-banner` (direct user
instruction; no formal requirement or completion-percentage change) closes six
defects reported against PR #260.

The banner workspace used `DashboardFormPage` without an aside, which caps at
`max-w-5xl`; inside the full-screen dialog that left an empty band down the
right-hand side. A `wide` mode now lets a form that carries its own full-width
content fill the workspace, and both the banner wizard and the offer form use
it -- the offer form's preview moves out of a 20rem aside and above the fields,
where a signed-in dashboard can actually be read.

The preview offered three viewports; the middle one sat between two sizes that
already bracket every breakpoint. It is now desktop and phone only. The phone
preview also rendered unscaled and left-aligned in a panel far wider than the
device: `ViewportFrame` now hugs the scaled content, centres it, and frames the
phone as a device.

Every destructive confirmation used `window.confirm`, which Chrome renders as
browser chrome pinned to the top of the window rather than over the workspace
that asked -- reported as "popping from top of the chrome browser". `useConfirm`
replaces all twelve call sites across the banner, offer, media library, artwork
upload, referral and broadcast views with an in-app dialog carrying real titles,
consequences and destructive styling. Handlers that must stay synchronous
(`onOpenChange`) keep their dialog open and let the confirmation above it
decide. The broadcast gate keeps its exact semantics, recipient count included.

Preview chrome carried the `Logo` component's "Loans & Real Estate" wordmark; it
now carries DhanaDhara. The offer preview rendered a lone `max-w-md` card in an
invented content area, and now renders inside the same `Dashboard highlights`
band and three-column grid `personalized-placements.tsx` uses in production.

The approvals desk opened on every campaign ever created, with nothing marking
the few that needed a decision, under a heading that repeated its own page
title. It now opens filtered to `pending_approval`, carries per-tab outstanding
counts and a workload chip, drops the duplicate heading, and gives reviewers a
preview-led layout where the composition leads and the read-only fields support
it.

Fresh evidence: web lint, strict typecheck, and all 82 files / 524 unit tests
pass, including a new source-scanning guard that fails if `window.confirm`
returns to application code and a viewport-contract test that fails if a third
preview size is reintroduced. Live browser review on the Docker stack confirms
the workspace right-hand gap is now only the dialog's own 46px padding (was
~380px), exactly two device controls labelled Desktop and Phone, the phone
preview centred at 390px inside a device frame, DhanaDhara present and the old
wordmark gone, the offer preview inside the real highlights band, in-app
confirmations on both the wizard and the media library with **zero** native
dialogs captured across the whole run, and the approvals desk reporting
"125 campaigns waiting" with per-tab badges (95 / 30) and a Pending approval
filter. No API, contract, migration, authorization, or RLS behaviour changed.

**Done - [PR #260](https://github.com/brollysolutions/client1/pull/260) - Sub Admin banner and offer authoring redesign:**
`claude/20260829-091848-lets-plan-subadmin-banners-and-offers-righ` (direct user
instruction; no formal requirement or completion-percentage change) rebuilds the
authoring experience PR #259 shipped around a sound data model.

Four defects drove it. The preview clamped `max-width` instead of using the
1440/768/390 viewports its own specification requires, so inside the ~480px
authoring column "Desktop" laid the production carousel out at roughly 480 CSS
pixels and fired mobile breakpoints under a panel labelled "Exact banner
preview". That preview sat inside hand-drawn furniture: an invented nav bar, a
fake Login pill, three grey skeleton blocks and a hardcoded cream that is not the
page background. Public artwork was a text dropdown of "label - version" strings,
and the API returned 422 for any `media_asset_id` outside the dashboard, so
uploading an image for the homepage, sponsor or section carousels was impossible
by design. Dashboard banners and dashboard offers had no bundled artwork at all
while every library thumbnail was force-cropped to 2:1, leaving a 9:5 hero and a
16:9 sponsor visually identical.

A campaign now takes artwork from exactly one source: a governed category
template, or a Media Library asset chosen or uploaded for that campaign alone.
Property promotion still requires a template, because the category decides which
listings a campaign may advertise. `campaign_media_assets.usage_type` splits per
rendered surface (`homepage_banner`, `section_banner`, `sponsor`,
`dashboard_banner`, `dashboard_offer`, `campaign`), upload validates the ratio
against that surface's target within +/-0.08 rather than one 1.45-2.75 band, and
the Media Library and in-form picker group by surface with thumbnails at each
surface's real shape. Fourteen bundled dashboard/offer assets are generated
deterministically from already-licensed campaign WebPs and registered by migration
`b7c9d1e3f5a8`. Banner authoring is a three-step wizard (Where, Artwork, Message)
with a persistent preview; `/dashboard/banners` and `/dashboard/offers` are
separate pages that both reach the Media Library as a destination and as an
in-form picker, and `/dashboard/campaigns` redirects so pre-split notification
links keep resolving.

Two latent defects were found and fixed on the way. Six call sites resolved a
banner/offer `image_key` through `storage.public_asset_url`, which returns None
for the bundled `/banner-templates/...` references the Media Library already
stored -- such campaigns rendered imageless and `validate_offer_for_review`
rejected the offer outright, so bundled artwork could never be submitted. And the
`allow_legacy` escape hatch matched every media-backed public banner, so a PATCH
clearing `media_asset_id` would have left a public banner with no artwork.

Fresh evidence: API Ruff check and format pass; the migration applies cleanly and
Alembic reports the single `b7c9d1e3f5a8` head; OpenAPI and generated TypeScript
contracts were regenerated and contain only the expected `usage_type` enum delta.
Thirteen new API tests cover media-backed public banners at all four public
placements, both artwork sources rejected together, cross-surface artwork
rejected, artwork-less public banners rejected on create and on patch, bundled
`image_url` resolution, and offer submission on bundled artwork. The full
changed-and-adjacent set -- campaign media, banners, offers, public banners,
personalization, banner catalogue, platform-scope RLS, media processing and CMS
activation -- passes 185 tests against the final tree. The aggregate run reached
1,819 passes / 17 failures / 10 skips in 1h39m on the shared stateful database;
none is change-owned. The only campaign-adjacent one,
`test_cms_activation.py::test_legacy_offer_link_does_not_gate_banner_activation`,
passes 23/23 in isolation, and the remaining sixteen are the documented
payout, content-block, catalogue, mobile-change, notification, telecaller,
vehicle-arrangement and employee-assignment baselines that predate this branch. Web lint, strict
typecheck and all 81 files / 521 unit tests pass, including new surface-geometry
and preview-chrome tests and an extended asset-contract test pinning the seeded
artwork by geometry and hash. Live browser verification on the Docker stack
confirms the preview lays out at 1440 CSS pixels and renders scaled to 946, the
mobile toggle switches the real layout width to 390, the library segregates into
six surface sections whose thumbnails measure 1.80/1.78/2.50, the picker swaps
artwork sets with the placement, both authoring pages reach the Media Library,
the legacy `/dashboard/campaigns` links redirect, heading order is h1 then h2, and
390px has no page-level horizontal overflow with no console errors. The Windows
`pnpm build` reaches "Compiled successfully", type validation and 93/93 pages
before the established standalone-symlink `EPERM`, which reproduces identically on
a clean baseline tree. Security review found no reachable issue: client-settable
`image_key` remains pattern-locked to `public/(banners|campaign-media)/<uuid>/`,
`image_ref` is database-constrained and `..`-free, per-placement usage types and
the business-line check gate every attach, and the listing now returns fewer
fields than before. Design review moved the library heading level under the page
h1, moved `aria-invalid` off a wrapper div onto the radiogroup widgets, gave
images explicit intrinsic dimensions, and named the wizard's form controls.

**Done - [PR #259](https://github.com/brollysolutions/client1/pull/259) - Sub
Admin Campaign Studio, campaign Media Library, and Admin approval desk:**
`codex/20260828-222513-banners-and-offers-are-managed-by-subadmin`
(direct user instruction; no formal requirement or completion-percentage
change) moves banner and authenticated-offer authoring
entirely to the shared Sub Admin team. Admin now has a read-only approval desk
with production-matched desktop/tablet/mobile previews, approve, reasoned
change request, and audited soft removal; removed campaigns are excluded from
staff lists, public/personalized serving, activation jobs, and dashboard
counts. Optimistic versions protect team edits, creator identity remains
immutable provenance, reviewed campaigns retain history, and lifecycle
decisions notify the original maker.

The Sub Admin-only Media Library provides scanned/canonicalized JPEG, PNG, and
WebP upload, business-line and placement metadata, alt text, tags, provenance,
archive/restore, live where-used evidence, and permanent deletion only when no
template/banner/offer reference exists. PostgreSQL RLS independently denies
Admin and Client catalogue access. The existing 44 governed template images
are registered without URL changes, historical uploaded references are
backfilled, and three generated wide/text-free WebP starter images are added.
Provider logos, public interface illustrations, listing fallbacks, notification
icons, and private/customer uploads retain their existing purpose-specific
ownership and storage boundaries. Legacy routes redirect into one uncluttered
Campaign Studio or the approval desk, and navigation exposes Media Library only
to Sub Admin.

Fresh evidence: API Ruff and format checks pass; the additive migration
downgrades/upgrades cleanly and Alembic reports the single
`a6b8c0d2e4f7` head; OpenAPI and generated TypeScript contracts were regenerated.
The broad changed/adjacent campaign, serving, scheduler, authorization, and RLS
set passes 171 tests, and the final campaign media/banner/offer rerun passes 59
tests. The aggregate API run produced 1,815 passes and 18 failures; three new
exhaustive classification/policy-ledger failures were fixed and included in the
171-test pass, leaving 15 unrelated stateful/stale payout, content-block,
catalogue, mobile-change, notification, telecaller, and vehicle baselines.
Web lint, strict typecheck, and all 80 files / 511 unit tests pass. Three focused
live-stack Playwright role journeys pass for Sub Admin authoring/library/legacy
redirects and Admin approval/media denial. The Linux production image compiles,
typechecks, generates all 93 pages, and completes standalone tracing. Security
review fixed public-object cleanup on failed media transactions and blank-note
normalization; design review removed redundant campaign chips, associated new
controls, preserved unsaved-upload confirmation, and added picker error/archive
states. Final security, responsive/accessibility, and maintainer review found no
remaining actionable issue. Delivery is linked in PR #259.

**Done — [PR #258](https://github.com/brollysolutions/client1/pull/258) —
invitation, staff access, finance, banner, offer, and responsive-dashboard
overhaul:**
`codex/20260828-165138-1-agent-invite-modify-agent-invite-ui` (
direct user instruction; no formal requirement or completion-percentage change)
moves Agent and staff invitation password creation into the existing auth shell
without changing their public token URLs. Admin staff creation is now a floating
workspace rather than an always-visible card; a one-use setup link is attempted
immediately after creation and remains retryable beside the legacy one-time
password fallback. Staff access and Operational accounts have full-view floating
directories with advanced filters, while the page keeps compact previews.

Sub Admin finance now has a dedicated overview, maker-only payout requests, and
future-rule/referral activity separated from Admin review and settlement.
Referral rules use live/retired language and can be permanently deleted only by
their owner (or platform Admin) after retirement and only when no referral
history references them; the foreign key and race translation preserve used
rules. Admin owns immutable banner-media versioning, and Sub Admin lists/authors
campaigns from approved media. Coupon offers are now image-led partner campaigns
with draft, approval, scheduling, activation, expiry, and archive audit evidence;
they require an HTTPS partner destination, code, artwork, visible terms, and an
explicit Client/Agent/Employee/Telecaller audience. Anonymous offer serving and
public banner coupon badges are removed. Dashboard users copy the code, open the
partner checkout, and enter it before payment; Dhanadhara neither applies nor
tracks redemption without a partner integration.

Shared filter controls use responsive auto-fit layout, shared tables render as
mobile cards below desktop widths, nested controls no longer trigger row opens,
and global horizontal scrollbar chrome is removed without requiring page-level
horizontal scrolling. Duplicate `/dashboard/banners/new` and
`/dashboard/offers/new` pages are gone. The offer artwork orphan sweep now keeps
both banner and offer references, line changes clear stale placement state, and
malformed nullable PATCH fields fail at validation instead of reaching database
constraints.

Fresh evidence: API Ruff and format pass; the two migrations downgrade and
upgrade cleanly and Alembic reports one head; OpenAPI and generated TypeScript
contracts are current; 144 changed/adjacent API, RLS, scheduler, public-serving,
orphan-cleanup, and authorization tests pass. Web lint, strict typecheck, and all
80 unit-test files / 510 tests pass. The isolated Linux Docker production build
compiles, typechecks, generates 90/90 pages, and completes standalone tracing.
Eight focused Playwright scenarios pass for every role's navigation, Admin staff
creation, removed authoring pages, and all three Sub Admin floating workspaces;
manual review covered the changed Admin/Sub Admin pages and invalid invite links
at desktop and 390px mobile widths. The aggregate API run stops on an unrelated
stale content-block RLS assertion whose expected policy predates checked-in
migration `aa12bb34cc56`; the full Playwright command also exhausts its existing
per-IP OTP test budget and contains one unrelated provider-link expectation.
Security, responsive design/accessibility, and maintainer review found no
remaining change-owned defect.

**Done on branch - Admin operational refinements for loan, filters, providers,
staff layout, and Agent setup handoff:**
`codex/20260828-123646-1-problem-with-the-floating-window-of`
([PR #257](https://github.com/brollysolutions/client1/pull/257);
direct user instruction; no requirement or completion-percentage change) makes
the Admin loan-application window a bounded, content-sized wide panel; keeps
Clear filters in the shared control grid instead of allocating a second action
row; and gives Create staff account and Staff access equal desktop columns and
matched panel height.

Financial Providers now completes CRUD with guarded permanent deletion. Admin
may delete only a provider with zero loan-application and zero configured-offer
references; referenced providers remain disable-only. Application and offer
counts are returned in the generated contract and shown in the provider table.
The service locks the provider, rechecks both reference families, maps a final
foreign-key race to `409`, appends `bank_deleted`, and cleans up only canonical
managed logo objects after commit. An additive migration replaces the historical
loan-application `SET NULL` foreign key with `RESTRICT`, grants Admin-only delete
through RLS, and keeps availability rows as disposable cascading configuration.

Agent approval now has the same safer link handoff as staff provisioning. A
new Setup links tab lists approved active Agents still awaiting their first
password, is refreshed whenever opened, and is paginated at ten rows; Admin can
create/copy/share/revoke or replace a seven-day link immediately after approval
or later. The public noindex `/agent-invite/{token}` page reuses the established
password form. Link rows store only SHA-256 token hashes and lifecycle/identity
foreign keys; a partial unique index permits one outstanding link per identity;
Admin-only, column-scoped RLS protects issuance/revocation; anonymous preview
and acceptance have separate IP budgets, rederive approved/profile/account
eligibility, and consume the link atomically with password activation. Unknown,
expired, used, and revoked tokens share one response, and audit details contain
neither token nor applicant PII.

Fresh evidence: API Ruff check/format and the exhaustive operational-coverage,
route-authorization, business-line-classification, and platform-scope contracts
pass. Eighty Docker-backed provider/invite/API/RLS and exhaustive-contract tests pass, covering
unused deletion, application/offer refusal, role denial, link issue/reissue,
revoke/expiry, password-policy non-consumption, acceptance/login, and delayed
candidate removal. Web lint, strict typecheck, and all 80 files / 512 tests pass.
The production build compiled, typechecked, and generated 90/90 pages before
the established Windows standalone-symlink `EPERM`. Live Playwright at 1440px
measured equal 554px staff panels, Clear filters on the same row, and the loan
dialog at 1024x415 instead of 1408x968; the Agent Setup links tab loaded without
console errors and the 390px body had no horizontal page overflow. The aggregate API run completed 1,799 passes / 22 failures in a
stateful shared database; three new exhaustive-contract failures were fixed and
pass in isolation, while the remaining failures are unrelated seeded-count,
suite-order/RLS-state, payout/mobile, notification, telecaller, and vehicle
tests outside this diff. Security, responsive design/accessibility, and
maintainer review found no remaining change-owned issue.

**Done on branch - restore one Alembic head after independent migrations:**
`fix/merge-alembic-heads` addresses the Docker startup failure introduced when
the Lead Details validation migration (`84a5b6c7d8e9`) and staff first-login
invite migration (`b1f7c93ad204`) both landed as children of
`73f4c2a91d6e`. Alembic correctly refuses the ambiguous singular `head`, so the
API exits before binding its port and scheduler/web dependencies cannot start.
The fix is an empty merge revision with both revisions as parents. It does not
change schema, data, grants, RLS, either parent's upgrade/downgrade logic, API
contracts, or requirement completion.

Fresh evidence: host and container `alembic heads` report only
`c2d8e4f6a901`; the live database records that mergepoint. Startup applied the
outstanding staff-invite branch and then the merge revision, while the already
applied loan-transaction branch remained intact. Database inspection confirms
both `staff_invite_links` and the non-empty transaction-history check. The
migration/RLS and Ruff checks pass, and API, scheduler, and web all reach
healthy. Downgrading the merge revision intentionally changes no object and
only re-exposes the two parent heads.

**Done - concise server-fetch timeout diagnostics** on
`codex/20260827-065108-the-lead-details-page-ui-its-kinda` ([PR
#245](https://github.com/brollysolutions/client1/pull/245); direct user-reported
Docker log noise; no requirement or completion-percentage change): the
five-second anonymous server-fetch guard, typed failure result, and fail-soft
homepage behavior are unchanged. Network exceptions are now logged as a
bounded name/message string instead of a raw Node `DOMException`,
so Next.js no longer prints `INDEX_SIZE_ERR` through `DATA_CLONE_ERR` around an
otherwise actionable timeout. The regression failed first against the raw
object and passes with the concise `TimeoutError` diagnostic. ESLint, strict
typecheck, and all 80 web test files / 511 tests pass. The production build
compiled, typechecked, and generated 93/93 pages; its unavailable build-time
API reproduced concise timeout/fetch diagnostics before the unchanged Windows
standalone-symlink `EPERM`. No API, contract, authorization/RLS, data,
dependency, timeout policy, parse-error diagnostics, or rendered UI changed.
**Done - Admin/Sub Admin dashboard overhaul, Phases 1-9:** the work was rebased
and merged one phase at a time through [PR #246](https://github.com/brollysolutions/client1/pull/246),
[#247](https://github.com/brollysolutions/client1/pull/247),
[#248](https://github.com/brollysolutions/client1/pull/248),
[#249](https://github.com/brollysolutions/client1/pull/249),
[#250](https://github.com/brollysolutions/client1/pull/250),
[#251](https://github.com/brollysolutions/client1/pull/251),
[#252](https://github.com/brollysolutions/client1/pull/252),
[#253](https://github.com/brollysolutions/client1/pull/253), and
[#254](https://github.com/brollysolutions/client1/pull/254). Conflict resolution
preserved the newer shared 25-row pagination and Lead Details validation work
that landed after the original overhaul branch diverged. Final cumulative
evidence is strict typecheck plus all 81 web test files / 515 tests; the commit
gates also pass feature tracking, migration/RLS checks, API lint/format, and web
lint. The detailed phase sections below retain their contemporaneous evidence.

**Done - optional public content-block 404 log classification** on
`codex/20260827-065108-the-lead-details-page-ui-its-kinda` ([PR
#244](https://github.com/brollysolutions/client1/pull/244); direct user-reported
operational noise; no requirement or completion-percentage change): PostgreSQL
checkpoint completion and PgBouncer login-attempt entries are normal. The
public API intentionally retains `404` for a missing or
unpublished optional block, while the server-only fetch wrapper now lets this
specific caller declare that status expected without changing its typed failure
result. Unexpected `404`/`500`, network, and parse failures remain logged.
Fresh evidence: the focused 11-test regression and neighboring 44-test public
fetch set pass; ESLint and strict typecheck pass; all 80 web test files / 511
tests pass. Live Docker verification records the API's intentional
`homepage-closing` `404` as INFO, the homepage as `200`, and no matching web
`serverFetchJson.http_error`. The production build compiled, typechecked, and
generated 93/93 pages before the unchanged Windows standalone-symlink `EPERM`;
host-side Docker-only `api` DNS failures continued to fall back and log.

**Done - explicit pagination for growing dashboard lists** on
`codex/20260827-065108-the-lead-details-page-ui-its-kinda` ([PR
#243](https://github.com/brollysolutions/client1/pull/243); direct user instruction;
no requirement or completion-percentage change): the audit confirmed that the
application had no infinite-scroll implementation. A shared accessible 25-row
Previous/Next control now bounds every identified primary growing dashboard
history or work queue that previously rendered its full fetched collection:
Client loan applications, transactions, support tickets, referrals, property
submissions, and loan-media application groups; Agent leads and commission
history; Telecaller leads; Employee tasks and vehicle arrangements; and Admin
commission/cashback/referral/support queues, financial products, document
verification groups, and all report tables. Existing Admin/Sub Admin paginated
surfaces reuse the compatible shared control. Pages clamp safely after a
collection shrinks, and filter/sort changes reset affected views to page one.

No API, generated contract, authorization, RLS, business-line scope, query
ordering, filter semantics, totals, or money-transition behavior changed.
Finite child lists tied to one lead/application, intentionally capped dashboard
previews, fixed configuration matrices, and already server-paginated catalogue
or audit views remain unchanged. Fresh evidence: web lint and typecheck pass;
all 80 Vitest files / 510 tests pass, including four focused helper tests. The
production build compiled, typechecked, and generated 93/93 pages before the
established Windows standalone-symlink `EPERM`; unrelated public API fetches
timed out during static generation and used their existing fallbacks. A
source-level design/accessibility review found no actionable issue. Live
Playwright could reach the local web app but the prior authenticated session had
expired (`/api/v1/auth/refresh` returned 401), and the environment had no
synthetic 26-row role dataset, so interactive Next-page verification remains the
documented residual gap rather than mutating seed data solely for proof.

**Done - Telecaller Lead Details validation and workflow hierarchy** on
`codex/20260827-065108-the-lead-details-page-ui-its-kinda` ([PR
#242](https://github.com/brollysolutions/client1/pull/242);
direct user-reported defect and UI follow-up; no requirement or completion-
percentage change): loan transaction creation now requires a trimmed bank,
positive amount, 0-100% interest rate, and date at both web and FastAPI
boundaries. Numeric precision matches the PostgreSQL columns, extra request
fields are rejected, and an additive migration removes only wholly blank
legacy rows before adding a narrow non-empty check; partial historical rows,
append-only behavior, grants, RLS, assigned-lead authorization, and business-
line isolation are preserved. Field tasks now require trimmed instructions and
future optional due times; call follow-ups, loan progress terms, and property
deal terms have matching inline validation, API issue mapping, and first-invalid
focus. The generated OpenAPI and TypeScript contracts are updated.

The page now puts application/deal work first, collapses submitted application
answers, presents immutable transaction history as a labelled table, groups
status and call logging in a compact desktop rail, and orders those call controls
immediately after the business workflow on mobile. The header exposes visible
Phone and WhatsApp buttons. Fresh evidence: API Ruff/format; 22 schema tests;
three Docker-backed API/database-RLS tests; migration downgrade/upgrade/upgrade
and one Alembic head; web lint/typecheck and 79 files / 506 tests (including seven
new focused validators); production compilation, type validation, and 93/93 page
generation before the established Windows standalone-symlink `EPERM`; and live
desktop/mobile Playwright review. An empty browser submission showed all four
field errors, focused Bank, and emitted no transaction request; the migrated
page retained its meaningful row without the two blank rows. The aggregate API
run reached 19% before the unchanged Admin coverage-contract failure for
`financial_product_provider_offers`, reproduced with `--lf -x`. Security,
design/accessibility, and maintainer review found no change-owned issue.
**In progress - Admin/Sub Admin dashboard overhaul Phase 9: remaining CMS
queues, property submissions, and staff Website content removal** on
`claude/20260827-admin-subadmin-ui-foundation` (direct user instruction;
completion coverage remains 99.4% pending a formal SRS revision): Banners and
offers now use the full-width dashboard shell and the shared `FilterBar`,
`DataTable`, status badge, loading/empty/error states, pagination, and row-open
workspace interaction. Admin can still approve, reject, archive, and inspect
banner records but cannot edit draft/rejected fields; the Admin offers view is
read-only. Sub Admin retains the existing banner/offer authoring actions,
replacement rules, schedules, audience grammar, raster-media validation,
approval lifecycle, and dirty-close protections. Referral and banner authoring
now use the shared form-section hierarchy, as do audience targeting fields.

My property submissions moves from a card list to the shared data table and
opens a centred record dialog containing its state, listing details, reviewer
note, and the existing Edit and irreversible Withdraw actions. Property
submission and subtype-detail forms now use shared form sections without
changing taxonomy, validation, RERA, media, edit, or withdrawal behavior.

The final direct product instruction removes Website content management from
both staff roles. The Admin/Sub Admin navigation and route grants, Sub Admin
home metric/quick action, `/dashboard/content` pages, staff content queue/form,
guide, preview, filter, API client, form-registry entries, and browser/unit
expectations have been removed. Direct navigation now returns 404 for both
roles. This does not delete existing content records or public-site copy:
public content-block rendering and tests remain, and backend content endpoints,
authorization, data, and lifecycle rules are unchanged. Earlier ledger entries
describing the former Sub Admin content workspace remain historical evidence
and are superseded only as to current staff UI availability.

Fresh evidence: `pnpm lint`, `pnpm typecheck`, and all 81 web test files / 515
tests pass. Browser verification covered Admin and Sub Admin at desktop and 390
x 844, including the banner, offer, referral-rule, property-submission, and new
property workspaces; it confirmed Admin read-only fields, the new form-section
hierarchy, both-role content-route 404s, and no submitted mutation. Root/body
overflow is clipped horizontally, and wide nested tables preserve scrolling
while reporting hidden horizontal scrollbar chrome. The normal Docker web
service was restored healthy. The requested `design-review` skill was not
installed, so the responsive review used the repository design primitives
directly and found no remaining change-owned issue. No API contract, migration,
auth, RLS, approval, payout, media, or public-rendering behavior changed.

**In progress - Admin/Sub Admin dashboard overhaul Phase 8: Analytics,
Broadcast, and immutable Audit log** on
`claude/20260827-admin-subadmin-ui-foundation` (direct user instruction; no
requirement or completion-percentage change): all three views now use the
full-width dashboard shell. Analytics replaces its one-off stat tiles with
shared `MetricGrid`/`MetricCard` and composes report dates, line, presets,
weekly/monthly grouping, and multi-Agent selection through the shared filter
container. The generic sortable `ReportTable`, server-side pagination, CSV and
Excel export, Agent team summaries, and `useReport` request-id race guard are
unchanged. No chart was added, so the plan's conditional `dataviz` skill did
not apply.

Broadcast is now a shared dashboard panel without weakening its irreversible
action boundary. Send stays disabled until Preview audience succeeds; changing
audience or business line invalidates that preview; field and same-origin link
validation still runs; and `window.confirm` still names the exact recipient
count and says the action cannot be undone. Browser verification resolved 612
matching Clients, opened the exact-count confirmation, dismissed it, and
confirmed from network history that only the preview endpoint ran—no broadcast
was sent.

Audit log moves from a bespoke card feed onto shared `FilterBar`, `DataTable`,
loading/empty/error states, and pagination. Rows remain keyboard/click
operable and open the existing structured-detail dialog, including nested JSON.
The generated-contract-backed `ACTION_META` map remains exhaustive, retaining
the compile-time failure when a backend action is added without a label/icon.
Actor automation versus deleted-account wording, role labels, record ids,
business line, and timestamps remain visible. The form-surface registry now
correctly classifies the shared filter rather than the Audit wrapper.

Fresh evidence: `pnpm lint`, `pnpm typecheck`, and all 79 web test files / 505
tests pass. Playwright covered Analytics, Broadcast, and Audit log at 1440 px
and 390 x 844; the document and body matched each viewport, mobile Audit's wide
table retained non-zero `scrollLeft` with hidden scrollbar chrome, an Audit
detail payload rendered, and Broadcast Send was disabled before preview. The
only console error was the repository's pre-existing missing favicon; no
changed-route request or runtime error occurred. No API contract, migration,
auth, RLS, report query/export, audit immutability, or notification-delivery
behavior changed.

**In progress - Admin/Sub Admin dashboard overhaul Phase 7: finance ledgers,
payout controls, and referral rules** on
`claude/20260827-admin-subadmin-ui-foundation` (direct user instruction; no
requirement or completion-percentage change): the Payouts, Agent commissions,
Processing-fee cashback, Referral payouts, and Referral bonus rules surfaces
now use the full-width dashboard shell and the shared filter bar, data table,
status badge, loading/empty states, and pagination. Search, status,
business-line, date, and applicable payout-type filters are available without
discarding cancellation reasons, referral ineligibility reasons, checker
identity, or rejection context. The Phase 6 global treatment hides their
nested horizontal scrollbar chrome without making wide finance tables expand
the document.

Commission and cashback were near-line-for-line copies. Their eligible and
ledger tabs now share `MoneyLedgerView`, while the commission, cashback, and
referral destination dialogs are thin domain wrappers over one
`MoneyPayoutDialog`. Domain payload builders, API methods, entry dialogs,
cancellation flows, and server validation remain separate. A pure
`getMoneyPayoutRequestState` helper and three regression cases lock the exact
tri-state rule behind the prior double-click defect: only an unlinked payable
row offers Pay; a payable row with a payout id says Payout raised; terminal
rows stay settled. The main Payouts table still permits Admin review, reports
when the viewer is the maker, and renders Approve only when
`viewer_can_approve`; manual cheque issue, clearance, failure, and reversal are
unchanged.

Referral rules retains the role boundary: Admin sees the configuration and
payout history read-only, while Sub Admin can create and activate/deactivate
rules. The authoring form remains in a full-screen workspace and retains the
dirty-close confirmation. No API contract, migration, auth, RLS, ledger,
payout, settlement, or business-line behavior changed.

Fresh evidence: `pnpm lint` and `pnpm typecheck` pass; all 79 web test files /
505 tests pass, including the new payout-state tests and the exhaustive form
surface registry. Playwright checked all five Admin routes at 1440 px and 390 x
844, opened a maker-checker review dialog without mutating it, and checked the
Sub Admin referral-rule authoring workspace at 390 x 844. On every route,
document and body widths matched the viewport; all horizontal utility
scrollers reported hidden bars, and mobile wide-table scrollers retained
programmatic scroll. The only browser errors were the pre-existing missing favicon and the expected refresh
401 created while deliberately clearing the Admin session before the Sub
Admin login; no changed-route request or runtime error occurred.

**In progress - Admin/Sub Admin dashboard overhaul Phase 6: financial-product
catalogue and provider configuration** on
`claude/20260827-admin-subadmin-ui-foundation` (direct user instruction; no
requirement or completion-percentage change): Financial products is now a
filterable, sortable, paginated table rather than a stack of edit cards. Each
row opens one full-screen product workspace with separate Details, Application
form, and Providers tabs. Form edits keep the existing versioned schema
contract. The Details tab carries the editable name/active/visibility/feature/
order controls; the read-only public summary, description, highlights,
eligibility, documents, and FAQs were removed from the workspace, so the
frozen-copy boundary is now expressed by their absence rather than by a
read-only rendering. The catalogue table carries explicit Edit and
Activate/Deactivate row actions; there is still no hard delete, because
historical applications keep the exact form version they were submitted
against.
The top-level surface now has only Product catalogue and Providers & logos;
provider availability and public offers live together inside the selected
product instead of competing as global tabs.

The provider workspace keeps operational assignment and public publication as
separate controls and derives one explicit presentation state: Live on landing
page, Draft offer, Operational only, or Unavailable. Live requires an existing
published offer, a verification date, an active/public product, and an active
provider. Missing availability still defaults to operationally available for
staff, but can never infer public display. A shared pure state helper now powers
both the provider table and catalogue live-count column, with tests that turn
off every publication gate independently. Provider creation/editing and the
raster-only logo/provenance workflow remain intact on the redesigned provider
library table. No API contract, migration, auth, RLS, or public-copy mutation
surface changed.

Per the direct follow-up to remove horizontal scrollbar chrome everywhere,
`globals.css` now suppresses visible horizontal bars for every
`overflow-x-auto`/`overflow-x-scroll` surface while retaining touch, trackpad,
keyboard, and programmatic scrolling. Root overflow is clipped horizontally so
a wide nested table cannot create a document-level bar. Mixed-axis scrollers
retain their vertical bar. Browser evidence at 390 px confirms document and
body widths equal the viewport, the table still accepts `scrollLeft`, and its
horizontal scrollbar is hidden.

Fresh evidence: `pnpm lint` and `pnpm typecheck` pass; all 78 web test files /
502 tests pass, including 8 catalogue-state tests and the provider-draft
validation suite. Desktop and 390 x 844 browser passes covered the catalogue,
workspace tabs, provider picker/editor, frozen public copy, independent save
actions, and scrollbar behavior. The requested `apple-design` and
`design-review` skills were not installed in this session, so the responsive
review was performed manually against the repository design primitives and
found no remaining change-owned issue.

**Implemented on branch - Admin/Sub Admin dashboard overhaul Phase 5: secure staff
first-login invite links** on
`claude/20260827-admin-subadmin-ui-foundation` (direct user instruction; no
requirement or completion-percentage change): provisioning retains its existing
one-time temporary-password fallback but now gives Admin the safer primary
handoff: create a seven-day first-login link, Copy link, Share (with clipboard
fallback), and Revoke. Reissuing revokes the outstanding link. The anonymous
`/staff-invite/[token]` page displays only first name and role, reuses the
shared password form and policy, then activates the identity and burns the link
in one transaction; used, revoked, expired, malformed, and unknown tokens all
produce the same public invalid state.

The new `staff_invite_links` table contains no raw token or PII: only a SHA-256
token hash, identity/profile/issuer foreign keys, expiry, and lifecycle
timestamps. Its partial unique index permits one live link per invitee;
Admin-only RLS plus column-scoped `UPDATE (used_at, revoked_at)` prevents a row
from being repointed. Public validation and consumption run on the internal
service session but rederive active-profile and `pending_password_reset`
eligibility from the database, with `SELECT ... FOR UPDATE` serialising
consumption. Preview and accept use separate IP rate-limit counters, and audit
events contain link/profile ids but never the raw token, mobile, email, or
password. An Admin-issued invite is refused once the owner has chosen a
password, so the feature cannot become an account-reset primitive.

Fresh evidence: `pnpm lint`, `pnpm typecheck`, and all 499 web unit tests pass;
API `ruff check` and `ruff format --check` pass. The branch migration was
applied to an isolated `app_test` database and all 8 focused integration tests
pass, covering successful set-password/login, single use, replacement,
revoke/expiry, staff/password-reset eligibility, password-policy rejection
without burning the link, Admin-only issue/revoke, and indistinguishable invalid
tokens. The requested `security-review` skill was not available in this
session; a manual review of token persistence, anonymous exposure, RLS/grants,
rate limiting, audit data, locking, and eligibility rechecks found one UX
acceptance gap (no reusable Share action after creation), fixed it, and found no
remaining change-owned security issue. Final private-window browser verification
remains part of the end-of-track interactive pass.

**Done - Real-estate browse-card redesign** on
`claude/20260825-211218-remove-browse-by-type-section-in-explore` ([PR
#236](https://github.com/brollysolutions/client1/pull/236)): the
user-approved compact card now uses a 16:9 media band, available-only comparison
facts, price, compact bookmark/compare controls, a verified-only RERA corner,
and View details as its sole primary action. Failed approved media falls back to
local subtype artwork. Enquiry, site-visit booking, media, full specifications,
and the RERA number remain on the existing details page. Playwright verified the
desktop/mobile composition and navigation; 72 Vitest files / 454 tests, lint,
and typecheck pass. The build completed compilation, type validation, and 93/93
page generation before the documented Windows standalone-symlink `EPERM`.

**Done - Agent dashboard UI overhaul: demo banner removal, dashboard-primitive
migration, copy-link UX, notification-bell dropdown unread filter, +91 phone
default across application forms** on `claude/20260826-agent-dashboard-ui-overhaul`
([PR #235](https://github.com/brollysolutions/client1/pull/235); branched
fresh from `upstream/main` via a sibling worktree, since the prior task
branch had unrelated uncommitted property-card/docs changes the user asked
to leave untouched; direct user-reported UI/bug-fix batch, no requirement or
completion-percentage change): seven changes across the agent dashboard, no
auth/RLS/payout/migration/contract surface touched.

(1) `apps/api/app/scripts/seed_demo.py`: the "Demo Loans workspace" and "Demo
Real Estate workspace" `LIVE`-status seed banners are deleted outright (the
`banner:pending` `PENDING_APPROVAL` row stays — it feeds the Sub Admin
approval-queue UI, not the agent dashboard). `PersonalizedPlacements`
(`apps/web/features/dashboard/personalized-placements.tsx`) already falls
back to real, role-aware, non-synthetic copy (`fallbackBanner()`) when no live
banner exists, so the agent dashboard now shows that fallback instead of the
two demo cards, with no component change needed.

(2) Leads (`agent-leads-view.tsx`), Earnings (`agent-earnings-view.tsx`), and
Introduce-a-lead (`agent-introduce-lead-form.tsx`) — none of which previously
used the shared `dashboard-ui.tsx` layout primitives Transactions/Agent Home
already use — are migrated onto `DashboardPage`/`DashboardHeader`/
`DashboardPanel`/`DashboardFormPage`/`DashboardFormSection`. Leads' table is
re-homed inside a `DashboardPanel`, reusing Transactions' proven table-shell
classes verbatim rather than extracting a new shared `DataTable` component
(only two structurally-different table call sites exist; not enough to
justify a generic abstraction yet). Earnings drops its local `StatTile`
helper (which duplicated `MetricCard`) for a bespoke 3-column grid reusing
`MetricCard` directly — `MetricGrid` itself is a fixed `sm:2/xl:4` layout and
a 3-card row would leave an uneven cell, so Earnings keeps its own
`grid gap-3 sm:grid-cols-3` wrapper around three `MetricCard`s instead,
documented inline. Its empty state now matches the icon-in-circle
convention Leads/Transactions already use, via `DASHBOARD_ICONS.earnings`
instead of a direct `lucide-react` import. Introduce-a-lead moves onto
`DashboardFormPage`/`DashboardFormSection` (the pattern already established
in `features/sub-admin/offer-form.tsx`). Agent Home's and Leads' duplicated
hand-rolled "Introduce a lead" CTA `<Link>` (raw `bg-brand-cta` classes) is
normalized to `Button asChild` wrapping the same `Link`, preserving the exact
brand-cta color via `className` (not the `Button` `cta` variant, which is a
different token/color) so no visual regression.

(3) `agent-lead-detail-view.tsx`'s `copyRegistrationLink` gains a temporary
in-button "Copied" state: a `copied` boolean flips true on a successful
`navigator.clipboard.writeText`, the button's icon/label swap (`Copy`/`Check`
from `lucide-react`, label text) for ~2s via a cleanup-safe `setTimeout` (ref
cleared on unmount), and the label is wrapped in `aria-live="polite"` so
screen readers get the state change even if they miss the toast. The existing
`sonner` toast is kept alongside it, not replaced. The copied URL itself
(`${window.location.origin}/register`, generic, unpersonalized) is unchanged
— no referral/ref-code work was in scope. Both of this view's hand-rolled
`rounded-2xl border ... p-5` cards are wrapped in `DashboardPanel` in the same
pass (the status pill moves into `DashboardPanel`'s `action` slot).

(4) Notification bell dropdown preview: previously `notification-bell.tsx`
rendered `items.slice(0, PREVIEW_LIMIT)` directly, so after "mark all as
read" the preview kept showing the same (now-read) rows — a real, separate
gap from the one the notification redesign entry below already fixed for the
*full* `/dashboard/notifications` page (that page's Unread/All tab). A new
pure helper `selectUnreadPreview(items, limit)` in `lib/notification-state.ts`
filters to `readAt === null` *before* slicing (not after — a slice-then-filter
would under-fill the preview if a read row occupied one of the first `limit`
slots; a dedicated test locks this down). `notification-bell.tsx` now renders
`selectUnreadPreview(items, PREVIEW_LIMIT)`; since every previewed row is
unread by construction, the per-row `!notification.readAt` conditionals
(unread dot, `bg-muted/40` highlight) simplify to unconditional. A new "You
are all caught up" empty state (reusing the header subtitle's exact existing
copy) is distinct from the true "No notifications yet" state. The shared
`NotificationSnapshot`/`markAllNotificationsReadInSnapshot` mutation model in
`notifications-provider.tsx`/`notification-state.ts` is untouched — it still
flips `readAt` in place rather than removing items, since the full history
page depends on that. `NotificationBell`/`NotificationsProvider` are each
mounted exactly once in `app-shell.tsx`, so this is a single global fix
already applied to every page, per direct user confirmation that only the
dropdown preview (not the full history page) needed to empty out.

(5)-(7) Every remaining user/agent-facing form missing the shared `+91`
`MobileInput` UI (`components/auth/mobile-input.tsx`, already used by
login/register/change-mobile/contact-form/agent-application-form) is
converted: the public "Get a callback" dialog (`lead-dialog.tsx`), the
real-estate Enquire/Book-a-site-visit dialog (`property-action-dialog.tsx`),
the agent "Introduce a lead" form, and the dynamic loan-application `phone`
field type (`financial-product-form.tsx`). The first two already had correct
bare-digits state and `isValidMobile`/`normalizeMobile`/`toE164` usage under
the hood — only the input UI needed swapping. `agent-introduce-lead-form.tsx`
previously kept full E.164 state validated by a local
`MOBILE_PATTERN = /^\+[1-9]\d{6,14}$/` with no digit-normalization at all
(a second, independent paste-with-spaces exposure beyond the one below); it
now holds bare digits and converts with `toE164()` at submit, matching every
other converted form's pattern, since the backend `AgentLeadCreate.mobile`
schema genuinely requires E.164. `financial-product-form.tsx`'s dynamic phone
field is where the actual reported bug lived: it was validated with a raw
regex (`/^[6-9][0-9]{9}$/`) against the *unnormalized* string and capped input
at `maxLength={10}` **characters**, not digits — so pasting `"98765 43210"`
(with a space) truncated to 10 chars including the space and then failed the
anchored regex, a genuine false-negative. `validateProductAnswers` now calls
`isValidMobile()` (which normalizes first), and the field gets its own
`MobileInput`-backed branch ahead of the generic `<Input>` catch-all (which
no longer handles `"phone"` in its `type`/`inputMode`/`maxLength` ternaries).
No `toE164()` conversion was added here — this field is a generic
`answers: Record<string, string>` blob forwarded as-is, not a dedicated
contract field, so bare digits remain correct. Admin-only ops forms
(`user-provisioning-view.tsx`, `vehicle-arrangements-view.tsx`) are
explicitly out of scope per direct user decision — they're internal
free-form E.164 entry tools, not self-service application forms.

New/extended tests: `apps/web/lib/phone.test.ts` (new — `lib/phone.ts` had no
dedicated test file before this change) covers `normalizeMobile`/
`isValidMobile`/`toE164`/`formatMobile` against space-containing and
`+91`-prefixed pasted inputs, the actual crux of the reported bug.
`financial-product-form.test.ts` gains a `productWithPhone` fixture (kept
separate from the existing `product` fixture to avoid coupling unrelated
assertions) and two new cases: a pasted-with-spaces phone value validates,
and a too-short one still correctly errors after normalization.
`notification-state.test.ts` gains a `selectUnreadPreview` describe block:
filters read items, returns `[]` once everything is read, and — the
regression case that actually matters — caps at `limit` *after* filtering
with 6 unread + 1 read item ahead of them, not before.

Fresh evidence: `pnpm lint` (0 errors, 0 warnings — one interim `MetricGrid`
unused-import warning surfaced and was fixed before the final run), `pnpm
typecheck` (clean), and `pnpm test` (72 files, 468 tests, all passing,
including the three new/extended files above) all pass. `pnpm build`
generated all 93 pages successfully, then hit the same pre-existing
Windows-host `output: "standalone"` symlink `EPERM` failure recorded
repeatedly elsewhere in this document (reproduced identically, confirmed
unrelated to this change — the failure is in the post-generation
"Collecting build traces" copy step, after every page had already compiled
and generated). Live interactive browser verification was not performed in
this session (no running dev container); the `apple-design` skill's targeted
review pass and a Playwright/manual click-through of the six changed agent
surfaces plus the bell dropdown's empty/all-caught-up states is the
recommended residual verification step before merge. `apps/api`'s pytest
suite was not re-run for the seed-only change — no test asserts on
`seed_demo.py`'s banner rows directly (confirmed: no reference to the two
removed banner ids exists outside that file), so this is a documentation-only
confirmation rather than a gap. Security and maintainer review were not
separately requested for this direct user-reported UI/bug-fix batch; no API,
contract, migration, or RLS surface changed.

**Apple-design skill review pass** (per direct user request to apply it
across the touched agent dashboard surfaces): reviewed
`agent-home.tsx`/`agent-leads-view.tsx`/`agent-lead-detail-view.tsx`/
`agent-earnings-view.tsx`/`agent-introduce-lead-form.tsx`/`notification-bell.tsx`
against the accessibility, layout, feedback, and entering-data guideline
references. Found and fixed three concrete issues: (1)
`agent-introduce-lead-form.tsx`'s Mobile field had no visual required-field
indicator and no inline per-field error state — unlike its sibling forms
converted in this same PR (`lead-dialog.tsx`/`property-action-dialog.tsx`),
which already show `aria-invalid`/`aria-describedby`-wired inline errors —
now added (asterisk + `sr-only` "(required)" label, a `mobileError` state
wired to `aria-invalid`/`aria-describedby`, cleared on next keystroke). (2)
The notification bell header's "Mark all as read" icon button was `h-8 w-8`
(32px) while the adjacent bell-icon badge span is `h-9 w-9` (36px) — a
same-row sizing inconsistency, also below the desktop-comfortable target
size next to a larger neighbor; both are now `h-9 w-9`. (3) The
copy-registration-link button's "Copy registration link" → "Copied" label
swap had no fixed width, causing a visible layout shift as the button
shrank; added `min-w-[13rem] justify-center` to hold its footprint steady.
Other findings were judged pre-existing, consistent-with-the-rest-of-the-app
patterns not worth a one-off deviation in this PR: status pills across
Leads/Earnings/Transactions convey state by color+text only (no icon/shape
differentiator), matching the badge convention already established and
reviewed elsewhere in the app; the unread dot in the bell dropdown is now
technically redundant (every previewed row is unread by construction) but
harmless and left as reinforcing, not misleading, feedback. Fresh evidence
after these three fixes: `pnpm lint`, `pnpm typecheck`, and `pnpm test` (72
files, 468 tests) all pass unchanged.

**Done - Telecaller leads table and lead detail redesign: `DashboardPanel`
migration, advanced filters, sortable columns, call-history timeline** on
`claude/20260826-155030-switch-to-main-and-pull-changes`
([PR #237](https://github.com/brollysolutions/client1/pull/237); direct user-reported UI
overhaul request — "make it clean and state of the art, add animations, add
advanced filters" for the leads table, "change the entire UI" for the lead
form — no requirement or completion-percentage change): the telecaller leads
table and lead detail page were the two screens the Agent Dashboard Overhaul
(PR #235) deliberately left on the pre-migration hand-rolled layout; this
closes that gap and adds real filtering/sorting on top.

(1) `telecaller-leads-view.tsx` migrates onto `DashboardPage`/
`DashboardHeader`/`DashboardPanel` (the same primitives `agent-leads-view.tsx`
uses) and gains an always-visible filter bar (search by name/mobile, status,
follow-up date-from/to — same `Input`/`Select` grid convention as
`features/admin/assigned-leads-view.tsx`) plus sortable column headers
(Lead/Status/Last disposition/Next follow-up) via new pure
`filterTelecallerLeads`/`sortTelecallerLeads` helpers in
`telecaller-lead-filters.ts` (unit-tested, mirrors
`features/admin/operational-records-filter.ts`'s shape). Default sort is
soonest-follow-up-first with never-called leads sinking to the bottom
regardless of direction (confirmed with the user as the desired default over
leaving the API's implicit order). No `MetricGrid` was added to this page —
`telecaller-home.tsx` already shows the identical assigned/working/converted/
follow-ups-due counts and links here, so a second copy would be pure
duplication. No business-line filter `Select` either: `useLine()`'s
`activeLine` already scopes `GET /api/v1/telecaller/leads` server-side via the
`X-Business-Line` header/RLS for dual-line telecallers, so every row already
shares one line — a redundant in-page filter would be a no-op. Fixed a real
latent bug while touching this: `use-telecaller-leads.ts` didn't refetch when
a dual-line telecaller flipped their active line via the global switcher
while sitting on this page (unlike `telecaller-home.tsx`, which already
re-fetches on `activeLine` change) — now it does. Motion is one restrained
`animate-in fade-in-0 duration-200 motion-reduce:animate-none` on the table
wrapper plus the existing row hover transition; no per-row stagger, since
rows reorder on every filter keystroke and a stagger would re-fire
disruptively.

(2) `telecaller-lead-detail-view.tsx` is rebuilt on `DashboardPage`/
`DashboardBackLink`/`DashboardPanel`/`DashboardFormSection` — one step
further than its sibling `agent-lead-detail-view.tsx`, which still wraps its
`DashboardPanel`s in a raw `max-w-3xl` div with no back-link; this file adds
`DashboardBackLink` since the primitive already exists for exactly this. Two
real bugs fixed in the same pass: the phone number was shown raw
(`{lead.mobile}`) with a hand-rolled `toWaHref()` that only worked because
`lead.mobile` happens to already be bare-digit — now uses `formatMobile()`/
`toE164()` from `lib/phone.ts`, matching `agent-lead-detail-view.tsx`'s
already-correct usage, and the WhatsApp helper moved into `lib/phone.ts`
itself as a shared `toWaHref()` built on `normalizeMobile()`. The "Log a
call" form rendered `follow_up_at` on two different DOM nodes
(`follow_up_at`/`follow_up_at_connected`) depending on the disposition
branch, both bound to the same state — only one was ever mounted, but the
duplication was fragile; now renders once, unconditionally. Call history is
now a CSS-only vertical timeline (`border-l` line + disposition-colored dot
per activity) replacing the flat bordered-card list.
`telecaller-loan-apps-section.tsx`/`telecaller-property-deals-section.tsx`/
`telecaller-tasks-section.tsx` get an outer-wrapper-only swap onto
`DashboardPanel` (no functional change — reviewed, no bugs found worth
bundling in). Shared status/disposition maps that were duplicated verbatim
between the table and detail view are extracted to `telecaller-lead-status.ts`.

New/extended tests: `telecaller-lead-filters.test.ts` (new) covers
search/status/date-range filtering and the follow-up sort's null-handling and
direction behavior. `phone.test.ts` gains `toWaHref` cases (bare and
`+91`-prefixed/spaced input). `isInDateRange` moved from
`features/admin/admin-list-tools.tsx` to a new shared `lib/date-range.ts`
(re-exported from its old location so all existing admin call sites are
unaffected) rather than duplicating the same logic a second time for the
telecaller filter file.

Fresh evidence: `npm run typecheck` (clean), `npm run lint` (clean — caught
and fixed an `aria-sort`-on-`<button>` placement issue, moved to the `<th>`
per ARIA semantics), and `npm run test` (73 files, 477 tests, all passing,
including the two new/extended files above). `npm run build` compiled,
typechecked, and generated all 93 pages successfully, then hit the same
pre-existing Windows-host `output: "standalone"` symlink `EPERM` failure
recorded repeatedly elsewhere in this document (reproduced identically,
confirmed unrelated — the failure is in the post-generation trace-copy step,
after every page had already compiled). Live interactive browser
verification was not possible in this sandbox: Playwright has no network
access at all here (confirmed against `example.com`, not just localhost) — a
standalone dev server was started in this worktree against the already-
running API container as a fallback, and the dev-only idempotent
`seed_demo.py` was re-run once to refresh stale demo credentials while
attempting this, but the browser tool itself could not reach any URL.

**Apple-design skill review pass** (per direct user request to verify with
the skill at the end): reviewed `telecaller-leads-view.tsx`/
`telecaller-lead-detail-view.tsx`/`telecaller-lead-status.ts`/
`telecaller-lead-filters.ts`/the three sub-sections against the
accessibility, color, layout, typography, motion, and entering-data
guideline references, computing contrast ratios from `globals.css`'s actual
token values since no live render was available. Found and fixed three
concrete issues: (1) the sort-header's inactive-state icon used
`text-text-secondary/50` (~2.24:1 against the card background, below the
3:1 non-text-contrast minimum) — bumped to `/70` (~3.3:1). (2) The
sort-header `<button>` had no padding, giving it a ~16px-tall click target
well under the 20pt desktop-minimum control size — the button now fills the
full `<th>` cell (`w-full px-5 py-3`), also making the header click target
consistent with normal sortable-table UX. (3) The lead detail page had no
page-level `<h1>` at all (every `DashboardPanel` title renders as `<h2>`,
and this page — unlike the table — doesn't use `DashboardHeader`), a real
screen-reader heading-navigation gap; added a visually-hidden
`<h1>{lead.name}</h1>`. Other findings were judged systemic/pre-existing,
shared with already-shipped agent screens, and out of this task's scope to
fix unilaterally: `text-warning`/`text-success` on their `/10` tint pill
backgrounds and `text-brand-cta` on white all sit under the 4.5:1
text-contrast minimum (~3.3-4.1:1), but this is inherited design-system
coloring used identically across Leads/Earnings/status pills app-wide — a
candidate for a dedicated design-system-wide contrast pass, not a one-off
deviation here. Security and maintainer review were not separately
requested for this direct user-reported UI redesign; no auth, RLS, payout,
migration, or contract surface changed.

**Done - Clickable-row affordance and Employee task screens brought onto
`DashboardPanel`** on `claude/20260826-155030-switch-to-main-and-pull-changes`
([PR #238](https://github.com/brollysolutions/client1/pull/238); direct
user-reported follow-up to PR #237 — "there is no way a telecaller can know
to click on leads" plus "even same for employees"; no requirement or
completion-percentage change): PR #237 shipped the telecaller leads
table/detail redesign but left rows with only a subtle `hover:bg-muted/50`
tint and a `cursor-pointer` as the sole clickability signal — genuinely too
weak, confirmed by re-inspecting the live app via Playwright MCP (which
regained sandbox network access mid-session, so this pass could
browser-verify where PR #237 could not). Added a trailing chevron
(`ChevronRight`) to every row that slides right on hover
(`group-hover:translate-x-0.5`) and tints `text-brand-cta`, reusing the exact
micro-interaction already established by `DashboardQuickAction` in
`dashboard-ui.tsx` — not a new pattern. Applied to both
`telecaller-leads-view.tsx` and, per the "even same for employees" follow-up,
`employee-tasks-view.tsx` (previously untouched by PR #237, still on the
pre-migration hand-rolled `max-w-5xl` layout). `employee-tasks-view.tsx` and
`employee-task-detail-view.tsx` are migrated onto `DashboardPage`/
`DashboardHeader`/`DashboardBackLink`/`DashboardPanel`, mirroring the
telecaller pattern: a visually-hidden page `<h1>`, the same raw-phone-display
bug fixed (`formatMobile`/`toE164` from `lib/phone.ts`, replacing
`{task.lead_mobile}`/`tel:${task.lead_mobile}`), and the task-type/status/
outcome badges moved into the header panel's `action` slot. The two
sub-panels `employee-task-document-panel.tsx` and
`employee-task-feedback-panel.tsx` get the same outer-wrapper-only
`DashboardPanel` swap already applied to telecaller's three sub-sections in
PR #237 (no functional change); the feedback panel's header — title +
description + upload/photo buttons — maps directly onto `DashboardPanel`'s
`title`/`description`/`action` props. All functional logic (task status
transitions, `ALLOWED_TRANSITIONS`, contact-share-link creation, document
upload/delete) is untouched. A live Playwright pass over the redesigned
telecaller lead-detail page (login as the seeded demo Telecaller, "Charan
Client" lead) found no actual rendering defect — computed styles, a cropped
element screenshot, and checks at 1440px/390px widths all matched the
intended design; an earlier read of a heavily-downscaled full-page screenshot
had been misleading (a nested `bg-muted/25` box briefly looked dark in the
compressed thumbnail but rendered correctly at native resolution, confirmed
via `getComputedStyle`), noted here so a future pass doesn't re-chase the
same non-issue (that live pass was against the code already merged in PR
#237, checked out in the primary repo's running container — not this
session's own worktree). Fresh evidence: `npm run typecheck` (clean), `npm
run lint` (clean), `npm run test` (73 files, 477 tests, unchanged — no new
test surface, this pass is UI-structure/affordance only) all pass. The
chevron/hover affordance and the Employee screen migration themselves were
**not** live-verified in a browser this pass: this worktree's running
`client1-web-1` container bind-mounts the primary checkout
(`D:\dhanadhara\client1\apps\web`), not this worktree, so edits made here
only become visible in that container after this branch merges to `main` and
someone pulls + restarts it there — confirmed by `docker exec client1-web-1
grep ChevronRight ...` returning no match immediately after writing this
change. Verified instead via `getComputedStyle`-level review against the
already-live PR #237 code for the underlying patterns being reused
(`DashboardPanel`, the `DashboardQuickAction` hover-chevron micro-interaction
copied verbatim) plus typecheck/lint/tests. Live browser verification of
this specific change is the recommended follow-up once merged and pulled.
No auth, RLS, payout, migration, or contract surface changed; scope is
`apps/web` only.

**Done - Chevron affordance live-confirmed; Call/WhatsApp actions converted
to icon-only buttons** on `claude/20260826-155030-switch-to-main-and-pull-changes`
([PR #239](https://github.com/brollysolutions/client1/pull/239); direct
user-reported follow-up — "the UI didn't change for the leads, still same"
turned out to be the user's browser tab holding a stale bundle from before
the PR #238 merge/restart (confirmed live via a fresh Playwright navigation
against the running local stack immediately after their report: the chevron
column and per-row `>` were present in the DOM and screenshot, so no code
change was needed there — a hard refresh was the fix); then "Remove call
from web, let it stay on phone, add whatsapp icon and phone icon"; no
requirement or completion-percentage change): `telecaller-lead-detail-view.tsx`'s
Call/WhatsApp actions were full text-labeled `Button`s
(`variant="outline" size="sm"`, icon + "Call"/"WhatsApp" label) — a `tel:`
link only does anything on a device that can actually dial, so presenting it
as a primary labeled web action was the wrong affordance. Both are now
icon-only (`size="icon"`, the same `h-9 w-9` variant already used in eight
other files across the app — `notification-bell.tsx` among them — so this
isn't a new pattern), each with `aria-label`/`title` since there's no longer
visible text for screen readers or a mouse-hover hint. Applied the same
icon-only treatment to `employee-task-detail-view.tsx`'s lone Call button for
consistency (no WhatsApp exists on that screen, so no icon was added there —
out of scope, not requested). Fresh evidence: `npm run typecheck` (clean),
`npm run lint` (clean); `npm run test` unaffected (no logic changed, pure
button markup). Not live-browser-verified this pass, for the same structural
reason as the previous entry — this worktree's running container doesn't yet
have this source change; the `size="icon"` variant being reused verbatim
across eight already-live files is the basis for confidence here. No auth,
RLS, payout, migration, or contract surface changed; scope is `apps/web`
only.

**Done - Telecaller lead-detail header given a hero treatment: avatar,
status-accent border, entrance animation** on
`claude/20260826-155030-switch-to-main-and-pull-changes`
([PR #239](https://github.com/brollysolutions/client1/pull/239); direct user-reported
follow-up — "I was talking UI changes for the lead detail page", clarifying
that the "still same"/"looks broken" reports from a few turns back were about
this page specifically, not the leads table (which PR #238's chevron already
addressed and was confirmed live); no requirement or completion-percentage
change): the structural `DashboardPanel` migration in PR #237 was correct and
matched the design system, but read as too incremental against the original
"change the Entire UI" ask — this pass adds genuine visual distinctiveness
rather than more structure. The header card is no longer a `<DashboardPanel>`
call: it's hand-composed with DashboardPanel's exact classes copied verbatim
(so it stays pixel-consistent with every other panel on the page) because
DashboardPanel's `title` prop is a plain string everywhere else in the app,
and this is the one place that needed more than text there — a `UserAvatar`
(`components/user-avatar.tsx`, the same deterministic letter-tile already
used for the staff sidebar identity, size `lg`) now sits beside the lead's
name. The header card also gains a `border-l-4` status-accent border (new
`statusAccentBorderClass()` in `telecaller-lead-status.ts`: warning/success/
brand-cta/border, mirroring `STATUS_STYLE`'s existing color vocabulary) and,
along with the "Log a call" and "Call history" panels, a restrained
`animate-in fade-in-0 duration-200 motion-reduce:animate-none` entrance
(the same pattern already proven live on the leads table in PR #237/#238).
No functional change — call logging, status transitions, and the business-
line sub-sections are untouched. Fresh evidence: `npm run typecheck`
(clean), `npm run lint` (clean), `npm run test` (73 files, 477 tests,
unchanged) all pass. Not live-browser-verified this pass, for the same
structural reason as the prior two entries — this worktree's running
container doesn't yet have this source change; confidence rests on
`UserAvatar` being an already-proven, already-live component and
`border-l-4`-over-`border` being a standard, widely-documented Tailwind
compositing pattern. No auth, RLS, payout, migration, or contract surface
changed; scope is `apps/web` only.

**Done - Telecaller lead-detail page rebuilt as a two-column layout, dropping
the `max-w-3xl` single-column cap** on
`claude/20260826-155030-switch-to-main-and-pull-changes`
([PR #240](https://github.com/brollysolutions/client1/pull/240); direct user-reported
follow-up after live-verifying the previous hero-treatment entry — "Still
same its not full width"; no requirement or completion-percentage change):
the previous entry's avatar/accent/animation polish landed inside a page
still capped at `max-w-3xl`, so at desktop width most of the page was empty
gray background — a real, valid complaint distinct from "add more visual
flourish." Rather than just widen that single column edge-to-edge (which
would have stretched the "Log a call" form fields uncomfortably wide),
the page now splits into `grid items-start gap-4
xl:grid-cols-[22rem_minmax(0,1fr)]` at the `xl` breakpoint — the exact
grid-template-columns value `DashboardFormPage` already uses for its own
main+aside layout, reused rather than invented. The 22rem sidebar holds the
lead-identity hero card (avatar, contact actions, status toggle); the
flexible main column holds "Log a call" and "Call history" stacked. Below
that grid, the business-line section (`TelecallerLoanAppsSection`/
`TelecallerPropertyDealsSection`) and `TelecallerTasksSection` stay full
width, unchanged — those have their own internal `sm:grid-cols-2`/
`sm:grid-cols-4` layouts that need the full page width to breathe, not a
narrow sidebar. `DashboardPage`'s loading and error branches, previously
their own hand-rolled `max-w-3xl` divs, are now plain `<DashboardPage>` calls
too, so there's no width jump when the real content replaces the skeleton.
Below `xl`, the grid collapses to the original single-column stack (sidebar
first, then Log a call / Call history) since Tailwind's `xl:` prefix only
takes effect at that breakpoint. Fresh evidence: `npm run typecheck`
(clean), `npm run lint` (clean), `npm run test` (73 files, 477 tests,
unchanged) all pass. Not live-browser-verified this pass — same structural
limitation as the three entries before it (this worktree's running container
still doesn't have this specific source change); confidence rests on the
`xl:grid-cols-[22rem_minmax(0,1fr)]` value being copied verbatim from an
already-live layout rather than invented fresh. No auth, RLS, payout,
migration, or contract surface changed; scope is `apps/web` only.

**Done - Real-estate Client dashboard property presentation** on
`claude/20260825-211218-remove-browse-by-type-section-in-explore` (PR #233
update; direct user-reported UI change, no requirement or
completion-percentage change): nine generated local property-subtype artwork
assets now cover every generated-contract subtype. A typed display resolver
keeps approved uploaded imagery first, falls back to subtype art, then uses a
category representative for legacy no-subtype rows; fallback art stays outside
managed media and photo counts. Home’s Browse cards reuse the same visual
family. Explore now suppresses zero-listing category rows; Home preserves
category discovery. Dashboard full/mini cards use a consistent media/content/
footer template, and an accessible folded corner appears only for the existing
server-proven `verified` RERA status, while the registration number remains in
the card content. `pnpm lint`, `pnpm typecheck`, focused property regressions,
and the full `pnpm test` suite pass. `pnpm build` compiled, typechecked, and
generated all 93 pages before the known Windows standalone-symlink `EPERM`
tail; its host static fetches also cannot resolve Docker-only `api`. Focused
Playwright was attempted twice after restarting the local web container, but
local login/API connectivity failed before either run reached the changed
dashboard surfaces. Design, security, and maintainer diff review found no
actionable issue. API, contract, RLS, data, upload authority, and migrations
are unchanged.

**Done - Notification dropdown and page redesign: click-to-open, neutral
icons, unread/type/date/search filters, pagination
([PR TBD](https://github.com/brollysolutions/client1/pulls), on
`claude/20260824-123331-lets-design-notification-panel-and-dropdow`; direct
user-reported UI change, no requirement or completion-percentage change):**
the notification bell dropdown and `/dashboard/notifications` page had four
reported problems, fixed across four files with no backend/API/contract
change. (1) The dropdown was hover-triggered with a custom 180ms close-timer
bridging the `PopoverTrigger` button and `PopoverContent` (a `sideOffset={10}`
gap between them had no hover handler, so a fast mouse movement through that
dead zone re-armed the open timer and the dropdown appeared stuck open).
`notification-bell.tsx` drops `closeTimer`/`showPreview`/`scheduleClose` and
every `onMouseEnter`/`onMouseLeave`/`onFocus` handler entirely; the
already-correct `Popover open={open} onOpenChange={...}` wiring (which already
calls `loadPreview()` on every transition to open) is all that remains, so
Radix's own built-in outside-click/Escape dismissal — never modified — now
governs closing with no custom logic in front of it. (2) Every blue
`brand-cta`/`loans-accent` token (`bg-brand-cta-tint`, `text-brand-cta`,
`bg-loans-soft`, `text-loans-accent`) is replaced with neutral `bg-muted`
circular icon badges and plain `text-text-primary` (near-black) icons/dots,
in both the dropdown and the page's notification rows, per the app's own
`globals.css` ADR-0007 comment that dashboards should stay neutral/navy, not
CTA blue. (3) A compact "Mark all as read" icon button (`CheckCheck`,
`aria-label="Mark all as read"`) was added to the dropdown header itself —
previously only the full page had this control. (4) The page's redundant
stats block ("All updates / Unread / Action links / Read" `MetricGrid`) and
its supporting `listedUnreadCount`/`linkedCount`/`DASHBOARD_ICONS` dead code
are deleted. In its place, a new filter toolbar (Unread/All `Tabs`, a
notification-type `Select` fed by a new `NOTIFICATION_TYPE_LABEL` map added
to `notification-presenter.ts`, a `created_at` date range, and a title/body
search `Input`) filters client-side over the existing ≤100-row capped feed —
reusing `isInDateRange`/`AdminPagination`/`ADMIN_PAGE_SIZE` from
`features/admin/admin-list-tools.tsx` unmodified, per direct user decision to
keep this client-side rather than add backend query-param support (the API's
`GET /api/v1/notifications` has none today, only a hardcoded 100-row cap).
Switching the new Unread tab makes read items disappear from view, which is
what actually resolves the "mark all as read still shows notifications"
report — the mutation itself (`markAllNotificationsReadInSnapshot` in
`lib/notification-state.ts`, optimistic + shared across dropdown and page via
`NotificationsProvider`) was already correct; the gap was purely the absence
of a way to hide already-read items. `e2e/dashboard-navigation.spec.ts`'s one
assertion touching this UI (`.hover()` on the bell button) is updated to
`.click()` to match the new interaction model.

Fresh evidence: `pnpm lint` and `pnpm typecheck` pass; all 419 web unit tests
across 66 files pass unchanged (no unit test covers `notification-bell.tsx`
or the notifications page directly; `lib/notification-state.test.ts`, which
covers the untouched mutation helpers, stays green). `pnpm build` compiled,
typechecked, and generated all 93 pages before the same pre-existing
Windows-host `EPERM` standalone-symlink failure recorded elsewhere in this
document. Live interactive browser verification was **not** performed in
this session: the app requires OTP-based registration with no static dev
login credentials available, and standing up a fresh account/session for a
manual click-through was judged out of proportion to this change; the
`client1-web-1` dev container was restarted (to clear stale JSX per this
repo's known caching behavior) but not driven through a browser. This is the
one residual verification gap — a manual or Playwright pass against a logged-in
session confirming the click-to-open/outside-click/Escape behavior and the
neutral color redesign is recommended before merge. `pnpm test:e2e` was not
run this session. Security, design, and maintainer review were not separately
requested for this direct user-reported UI change; no backend, API, RLS,
contract, or migration surface was touched.

**Done - Apply-page product picker removed; "Change product" and
productless entry points now redirect to Explore by category
([PR #226](https://github.com/brollysolutions/client1/pull/226), on
`claude/20260824-113343-so-how-this-thing-works-is-when`; direct
user-reported UI change, no requirement or completion-percentage change):**
follow-up to the picker-hiding work below, once it was live in the browser
and the user asked for the picker to be removed entirely rather than just
hidden, and for "Change product" to leave `/dashboard/apply` for the right
Explore surface instead of resetting local state back onto the same page.
Four files. (1) `apply/page.tsx` deletes the entire "Choose a product"
`DashboardPanel` block (category `fieldset`s, product tiles, empty-state
message, "active loan in progress" note) along with the now-unused
`chooseProduct()` handler and `CATEGORY_LABEL` map — there is no longer any
path in this file that renders a product picker. `changeProduct()` is
rewritten from a local-state reset into a redirect: it looks up
`selectedProduct.category` against `EXPLORE_CATEGORIES`
(`features/dashboard/explore-categories.ts`) and `router.push`es to
`/dashboard/explore/${match.slug}` (`loans`, `insurance`, or `cards` — the
last self-redirects to the sole flagship card product via the existing
`shouldSkipCardsCategoryList`, unchanged from PR #225). A new effect
`router.replace`s to `/dashboard/explore` once product-loading finishes
(`status === "ready"`) with `selectedProduct` still null — covering a
missing `?product=`, a stale/invalid id, and any future caller that forgets
the query param — with the existing loading `Skeleton` shell rendered in the
interim so nothing empty/broken flashes before the redirect lands. `products`,
`getLoanTypes()`, the preselection effect, and `activeApplication`'s
duplicate-loan submit guard are all unchanged; the form panel (including the
"provider option selected" banner) is now the only content the page ever
renders once a product resolves. (2) The two remaining callers that used to
link to `/dashboard/apply` with no product — relying on the now-deleted
picker to let the user choose one there — are repointed straight to
`/dashboard/explore/loans`: Compare Loan Offers' "Apply for a loan" header
button and "Next step" `MetricCard` (`features/loans/loan-offers-view.tsx`),
and "Your loan journey"'s `ApplyCta` link (`features/dashboard/loans-applications.tsx`).
Every other caller of `/dashboard/apply` already passes `?product=<id>` via
`applyHref()` (`features/loans/provider-offer-list.tsx`) and is unaffected.
(3) `e2e/dashboard-navigation.spec.ts`: the loans-workspace smoke loop's bare
`/dashboard/apply` row now visits `/dashboard/apply?product=<id>` (a new
`getLoanTypeId()` helper looks up the seeded "personal-loan" product's id via
the loan-types API, since the picker's display `label` and the query
param's `name` match are different fields and the bare path would otherwise
redirect to Explore before the heading renders); the "Client submits a
product-specific loan form" test no longer clicks a picker tile — it now
navigates `/dashboard/explore/loans` → clicks the "Personal Loan"
`ExploreArtCard` link → clicks the product page's "Apply" link, landing on
the pre-selected form the way a real user now does, then continues its
existing field-filling and submission assertions unchanged.
`features/dashboard/nav-items.test.ts`'s `/dashboard/apply` assertions only
exercise capability/route-rule access logic, not page content, and are
unaffected.

Fresh evidence: `pnpm lint` and `pnpm typecheck` pass; all 419 web unit tests
across 66 files pass unchanged (no unit test covers `apply/page.tsx`
directly — its only prior test-file reference besides the e2e spec above is
an unrelated admin toast string in `provider-offers-view.tsx`). `pnpm build`
compiled, typechecked, and generated all 93 pages (including
`/dashboard/apply` and the `/dashboard/explore/*` tree) before the same
pre-existing Windows-host `EPERM` standalone-symlink failure recorded
elsewhere in this table — confirmed unrelated to this change; `output:
"standalone"` in `next.config.ts` triggers a `node_modules` symlink copy this
Windows host's account lacks privilege for, well after all 93 pages had
already generated successfully. `pnpm test:e2e` was not run in this session
(no live dev container/API stack was started); the updated
`dashboard-navigation.spec.ts` assertions above were written and reasoned
through against the actual component/route code but not exercised live in a
browser, which is this change's one residual verification gap.

**Done - Cards category always skips its list, apply-page product picker
hides once selected, full-width application form
([PR #225](https://github.com/brollysolutions/client1/pull/225), on
`claude/20260824-104244-1-cards-and-credit-cards-showing-same`; direct
user-reported UI change, no requirement or completion-percentage change):**
follow-up to the Explore trim below, once the sole-product redirect was live
in the browser and the user asked for it to go further. Three changes. (1)
`explore-categories.ts`'s `shouldRedirectToSoleProduct(categorySlug,
itemCount)` (true only for `("cards", 1)`) is generalized to
`shouldSkipCardsCategoryList(categorySlug, itemCount)` (true for any
`("cards", itemCount > 0)`), per direct user decision that the Credit Cards
line is a single flagship product by design and should never show a list,
not just while the count happens to be exactly one; `explore/[slug]/page.tsx`
calls the renamed predicate the same way. `explore/page.tsx` (the Explore
hub, a server component) additionally fetches
`getPublicFinancialProducts({ category: "credit_card", pageSize: 1 })`
directly alongside its existing `getCatalogueFacets()` call — Next dedupes
the identical in-flight request, so this recovers the sole product's `slug`
(which facets discards, keeping only `.total`) at no extra network cost — and
the "Credit Cards" hub tile links straight to
`/dashboard/explore/cards/${slug}` instead of the category page whenever the
predicate is true. The sidebar's Explore accordion (`app-sidebar.tsx`) is
deliberately left linking to `/dashboard/explore/${slug}`: it is a client
component rendered on every authenticated page, and adding a catalogue fetch
there just to skip an already-invisible server `redirect()` (resolved before
first paint, no list UI ever flashes) was judged not worth an extra request
on every page load — noted as a scoped tradeoff rather than a silent
deviation. (2) On `/dashboard/apply`, the "Choose a product" panel — previously
always rendered above the form, even once a product was already selected via
a `?product=` deep link — now only renders while `!selectedProduct`; a new
`changeProduct()` handler (mirrors the existing `chooseProduct`, resetting
`productId`/`providerOfferId`/`answers`/`answerErrors`/
`submittedEnquiryLabel`) is wired to a "Change product" text button passed
through `DashboardPanel`'s existing `action` prop on the form panel, so a
user who arrived pre-selected (or picked wrong) can still back out. The
"provider option selected" banner, previously dead-rendered inside the
now-conditionally-hidden picker (it required `providerOfferId && selectedProduct`,
which could never both hold once the picker only shows for `!selectedProduct`),
was moved into the form panel where `selectedProduct` is guaranteed. Entry
points with no product in the URL (Compare Loan Offers' "Apply for a loan",
the dashboard loan-summary card) are unaffected — they still land on the
picker until one is chosen, per direct user decision to avoid stranding
those flows. (3) `apply/page.tsx` drops its `max-w-5xl` override on all three
`DashboardPage` returns (loading/error/content), falling back to the shared
`max-w-[1440px]` container every other dashboard page uses;
`financial-product-form.tsx`'s dynamic per-product field grid widens from
`sm:grid-cols-2` to `sm:grid-cols-2 xl:grid-cols-3` (matching the
`xl:grid-cols-3` convention already used for the Explore hub/category card
grids), with the textarea/multi-select full-width override changed from
`sm:col-span-2` to `sm:col-span-2 xl:col-span-3` to still span the full row;
the static 2-field "Registered applicant" grid is left at `sm:grid-cols-2`
since a third column would just leave a permanent gap.

Fresh evidence: `pnpm lint` and `pnpm typecheck` pass; all 419 web unit tests
across 66 files pass, including the renamed/regeneralized
`explore-categories.test.ts` predicate cases
(`("cards", 1)`/`("cards", 2)` → true, `("cards", 0)`/`("loans", 1)` →
false) and the pre-existing `financial-product-form.test.ts` (validation
logic untouched). `pnpm build` compiled, typechecked, and generated all 93
pages before the same pre-existing Windows-host `EPERM` standalone-symlink
failure recorded elsewhere in this ledger. `client1-web-1` was restarted to
clear stale JSX before verification. `pnpm exec playwright test
e2e/dashboard-navigation.spec.ts e2e/financial-services.spec.ts` ran against
the restarted container: 11/15 pass, including the cards-catalogue coverage
in `financial-services.spec.ts`. The 4 failures are all pre-existing and
unrelated to this diff: the Admin nav-visibility assertion and the
real-estate "Baner"/"Baner Heights" location-search ambiguity touch files
this change never modified (`nav-items.ts`/scenario config,
`CategoryBrowser`'s location autocomplete); the other two — one of which is
"Client submits a product-specific loan form without inline KYC uploads",
the spec that actually exercises the changed apply-page flow — failed inside
the shared `registerClient` test helper itself with "Too many OTP requests
from this network" (the per-IP hourly OTP cap, `OTP_RATE_LIMIT_PER_IP` in
`apps/api/app/services/otp.py`, already exhausted by this session's earlier
registrations), before ever reaching the modified page; this is an
environmental rate limit, not a regression, but it means that spec's actual
coverage of the apply-page change is a residual, undischarged verification
gap rather than a passing result — a retry was not attempted given the
hourly window was very unlikely to have reset. Security, design, and
maintainer review were not separately requested for this direct
user-reported UI change.

**Done - Explore product-journey trim: cards collapse, copy cleanup, sticky
filters ([PR #224](https://github.com/brollysolutions/client1/pull/224), on
`claude/20260824-092753-1-remove-explore-page-as-we-only`; direct
user-reported UI change, no requirement or completion-percentage change):**
follow-up to the Explore redesign below, once it was live in the browser.
Six changes to `app/(app)/dashboard/explore/[slug]/page.tsx` and
`app/(app)/dashboard/explore/[slug]/[productSlug]/page.tsx`: (1) the "cards"
category page now redirects straight to its one published product instead of
showing a one-item list — `explore-categories.ts` gains a small exported
`shouldRedirectToSoleProduct(categorySlug, itemCount)` pure predicate (true
only for `("cards", 1)`), called from `LoansCategoryProducts` via
`next/navigation`'s `redirect()` right after the catalogue fetch; 0 or >1
items still render the existing empty-state/grid unchanged, so the redirect
self-disables the moment a second card product is published. (2) the product
page's one-line tagline under the `<h1>` (`product.summary`, passed as
`DashboardHeader`'s `description`) is dropped — `DashboardHeader`'s
`description` prop became optional (`dashboard-ui.tsx`, conditionally
rendered like the existing `eyebrow`) rather than touching its shared
paragraph markup, since 31 other call sites across the app still pass and
rely on it. (3) the "Why consider it / General eligibility / Documents to
prepare" 3-card `ProductFacts` grid was deleted outright (function and call
site), per direct user confirmation that only the facts grid goes and the
longer `product.description` paragraph above it stays. (4) the "Questions
about {product}" FAQ `<details>` section was deleted. (5) the standalone
`{product.description}` paragraph between the header and "Compare lenders"
was also deleted — initially kept per the user's first answer describing it
as the "longer description paragraph," but live verification against the
seeded dev database showed it reads "Understand the journey, review
configured providers, and apply or enquire inside Dhanadhara. Provider terms
are informational and subject to review." for every checked demo product,
i.e. exactly the sentence the user had quoted for removal (seed data from
the immutable Alembic migration `73f4c2a91d6e_public_financial_catalogue.py`
under `apps/api/alembic/versions/`, not application code); flagged back to
the user, who confirmed removing it too. (6) the lender-offer search/filter
bar (`features/loans/provider-offer-filters.tsx`) gained `sticky top-14
z-10` on its `<form>`, seated just under the dashboard shell's own `sticky
top-0 z-20 h-14` top bar (`app-shell.tsx`) — mirrors the public site's
`financial-services-filters.tsx` sticky-rail pattern, minus the glass/blur
treatment (`bg-card` is already opaque, so no bleed-through to mask).

Fresh evidence: `pnpm lint` and `pnpm typecheck` pass; all 419 web unit tests
across 66 files pass (up from 418 — `explore-categories.test.ts` gained 4
cases for the new predicate). `pnpm build` compiled, typechecked, and
generated all 93 pages before the same pre-existing Windows-host `EPERM`
standalone-symlink failure recorded elsewhere in this ledger (reproduced
identically on the prior Explore-redesign entry; unrelated to this change).
Live browser verification via Playwright MCP against the restarted
`client1-web-1` container, logged in as the existing seeded Client account
("Diya Client"): `/dashboard/explore/cards` redirects to
`/dashboard/explore/cards/credit-cards` (its sole product) with a 200,
confirming the sole-product collapse; both `/dashboard/explore/cards/credit-
cards` and `/dashboard/explore/loans/personal-loan` render with no tagline
under the `<h1>`, no description paragraph, no facts grid, no FAQ section,
and the filter bar present with the sticky classes applied (re-verified
after a container restart and cold Turbopack recompile, following the
description-paragraph removal requested mid-review). The sticky-while-scrolling behavior itself
was not visually exercised — both checked products have 0 published lender
offers in the seeded dev data, so neither page is tall enough to scroll;
this is a residual manual-verification gap, not a code concern (the CSS
class matches an established, already-shipped sticky pattern in the
codebase). `pnpm test:e2e` was not run — no existing spec visits any Explore
category or product page (confirmed by inspection of
`e2e/dashboard-navigation.spec.ts` before this change), so there was no
existing coverage to protect and none was added given the OTP-registration
rate-limit exhaustion recorded on the entry below. Security, design, and
maintainer review were not separately requested for this direct
user-reported UI change.

**Done - Loans-Client Explore redesign: category catalogue, product detail,
lender offers ([PR #223](https://github.com/brollysolutions/client1/pull/223)
on `claude/20260824-075055-lets-design-explore-page-in-client-dashboa`; direct
user-reported UI change, no requirement or completion-percentage change):**
`/dashboard/explore` on the loans line now works like the public `/loans`
financial-services catalogue, but built for the dashboard: a hub of Loans,
Insurance, and Credit Cards illustration cards
(`features/dashboard/explore-cards.tsx`, `explore-categories.ts`) leads to a
category page listing that category's Admin-published products
(`app/(app)/dashboard/explore/[slug]/page.tsx`), and a new product page
(`app/(app)/dashboard/explore/[slug]/[productSlug]/page.tsx`) shows product
facts (highlights/eligibility/documents/FAQ) plus a searchable, provider-type-
filterable, sortable list of published lender offers
(`features/loans/provider-offer-filters.tsx`,
`features/loans/provider-offer-list.tsx`), each with an Apply action that
deep-links into `/dashboard/apply?product=<id>&offer=<offerId>` (the existing
preselection contract). No lender destination URL or redirect exists, matching
the catalogue's established no-off-platform-redirect invariant. All three
pages read the same anonymous, ISR-cached public financial-products endpoints
the marketing site already uses (`lib/financial-catalog.ts`,
`/api/v1/public/financial-products*`, from PR #215/#211) — **no API, contract,
migration, or RLS change**. `explore/page.tsx` and `explore/[slug]/page.tsx`
became server components for this (that module throws if imported into a
Client Component); the pre-existing client-side real-estate Explore hub was
moved unchanged into a new `ExploreLineSwitch` client component that receives
the server-rendered loans hub as a prop, since a client component cannot
render an async server child directly.

Per direct user decision, every `DashboardHeader` eyebrow across the
Client-visible dashboard surfaces was removed — both lines, plus the two
routes shared with staff (`transactions`, `notifications`) — and the
now-redundant "Financial products" sidebar entry
(`/dashboard/apply`) was dropped from `nav-items.ts` (the route itself stays
reachable as the Apply deep-link target, used by every public and dashboard
Apply/Request-a-quote button). The Explore sidebar accordion's active-state
check changed from an exact match to a prefix match so a loans category stays
highlighted while browsing its product pages. The now-unreferenced
`features/dashboard/coming-soon.tsx` was deleted.

Fresh evidence: `pnpm lint` and `pnpm typecheck` pass; all 418 web unit tests
across 66 files pass, including a new `explore-categories.test.ts` (5 tests:
hub order, slug shape, category-to-`ProductCategory` mapping, every
illustration file exists on disk, slug resolution). `pnpm build` compiled,
typechecked, and generated all 93 pages against a live Docker API backend —
so the new loans-line Explore route tree (hub, category, and the new product
page) was exercised with real published-product data during static
generation, not mocked — before hitting the same pre-existing Windows-host
`EPERM` standalone-symlink failure recorded elsewhere in this ledger,
reproduced with the sandbox disabled to confirm it is an OS/environment
limitation rather than a defect in this change.

`pnpm test:e2e -- dashboard-navigation.spec.ts` ran against the restarted
`client1-web-1` container: the Client-role and Client-mobile-drawer scenarios
pass, including this change's updated assertions ("Financial products" no
longer offered; "Explore" present instead). The Admin scenario fails on a
pre-existing, unrelated bug that predates this branch — the Admin
"Financial products" exclusion assertion was never updated when
`admin-loan-config`'s nav label changed to "Financial products" in `a92eec4`,
confirmed by `git log -p` on that line; this test was already broken before
this change and is unrelated to it. The full-workspace Client scenario and two
further Client-registration scenarios could not complete because the shared
dev stack's per-network OTP-initiation rate limit (`OTP_RATE_LIMIT_PER_IP`, a
security control) was exhausted by this and the prior verification run's
repeated test-account registrations; per `SECURITY.md`/`AGENTS.md` this was
not reset or bypassed to force a pass. The one page-content assertion that
failed mid-run (`/dashboard/loan-offers`'s "Compare Loan Offers" heading, on a
cold Turbopack compile) was confirmed by direct source inspection to be
unaffected by this diff — `loan-offers-view.tsx`'s `title="Compare Loan
Offers"` is unchanged; only its `eyebrow` prop was removed. Separately, `curl`
against the running API confirmed real Admin-published loan products flow
through `GET /api/v1/public/financial-products` with the expected shape, and
the dev container's request log shows the new and changed routes compiling
and returning 200. Security, design, and maintainer review were not
separately requested for this direct user-reported UI change.

**Done - Loans client dashboard shell and home decluttering
([PR #222](https://github.com/brollysolutions/client1/pull/222) on
`claude/20260823-211421-loans-client-page-dashbaord-1-side-navbar`;
direct user-reported UI change, no requirement or completion-percentage
change):** the authenticated desktop icon rail (`features/dashboard/app-shell.tsx`)
no longer persists its expanded state to `localStorage` across reloads — it
always starts collapsed, and the in-session expand/collapse toggle is
unchanged. On the loans-Client dashboard home
(`app/(app)/dashboard/page.tsx`'s loans-Client fallthrough branch), the
`<PersonalizedPlacements>` "Dashboard highlights" banner/offers block is
dropped so the page renders `<LoansApplications />` alone; the real-estate
Client and Agent homes keep their `<PersonalizedPlacements>` call unchanged.
`features/dashboard/loans-applications.tsx` also drops the `DashboardHeader`
`eyebrow="Loans workspace"` prop, the four zero-count `MetricGrid` cards (and
their now-orphaned `activeCount`/`attentionCount`/`completedCount`
computations), and the empty-state decorative icon.

`shell-state.ts` is untouched: `isDesktopSidebarExpanded`'s
`role === "client" && clientPreference` check is still correct now that
`clientPreference` (`railOpen`) is simply session-only rather than restored
from storage. Three Playwright specs that asserted the old, persisted-rail /
highlights-present behavior are updated to match: `dashboard-navigation.spec.ts`
inverts its post-reload assertion from `"Collapse sidebar"` to
`"Expand sidebar"` and adds home-page regressions asserting the
`"Dashboard highlights"` region has zero count and that no "Loans workspace" or
"Needs attention" text renders; `personalization.spec.ts` and the shared
`logIn` helper in `loan-media.spec.ts` swap their `"Dashboard highlights"`
visibility gate for the `"Your loan journey"` heading, which renders whether or
not the account has applications yet. `loan-media.spec.ts`'s unrelated "Needs
attention" assertion (the document-verification badge in `documents-view.tsx`)
is untouched.

No route, API, contract, migration, RLS, or operational-role (admin, sub_admin,
telecaller, employee) behavior changed. Because rail persistence was keyed on
`role === "client"` rather than business line, this affects Client accounts on
both lines — there is no line-scoped hook available without introducing a new
inner component, and this was accepted directly by the user.

Fresh evidence: `pnpm lint`, `pnpm typecheck`, and all 413 web unit tests
across 65 files pass, unchanged including `shell-state.test.ts`. `pnpm build`
compiled, typechecked, and generated all 93 pages before the same
pre-existing Windows-host `EPERM` standalone-symlink failure recorded
elsewhere in this document. The `check_feature_tracking.py` co-change guard
passes.

Live browser verification on the restarted `client1-web-1` dev container at
1440px against two demo Client accounts (`client.demo@example.com` and the
referred-journey account) confirmed: the loans line home shows no highlights
banner, no "Loans workspace" eyebrow, no zero-count metric row, and a
populated applications table, with no console errors attributable to this
change; the desktop rail starts collapsed ("Expand sidebar" visible),
expands within the session, and returns to collapsed after a hard reload;
switching the same account to the Real Estate line still renders its
"Dashboard highlights" banner (`Demo Real Estate workspace`) unaffected. The
empty-state icon removal was verified by code inspection only — both seeded
demo Client accounts already have loan applications, so the true empty state
was not directly observed live.

`pnpm test:e2e` ran the three touched specs (plus their sibling tests in the
same files) against the live Docker stack. The Client scenario in
`dashboard-navigation.spec.ts` — carrying the new post-reload rail assertion
and the new highlights/eyebrow/attention-text regressions — passes, as do
the Agent, Telecaller, Employee, and Sub Admin scenarios, the "Sub Admin
retains every authoring route" test, and the "Sub Admin CMS pages open
accessible floating authoring workspaces" test. Both `personalization.spec.ts`
tests pass, including the one asserting the new "Your loan journey"
heading/highlights-absent gate. Two failures are recorded as pre-existing and
unrelated: the Admin scenario in `dashboard-navigation.spec.ts` fails on a
`Financial products` nav-link visibility assertion that shares no code path
with this change (confirmed by rerunning it in isolation), and one
`loan-media.spec.ts` test fails in its own `registerLoansClient` helper on
"Password must not contain your mobile number" — that helper derives both
`password` and `mobile` from `Date.now()` and can coincidentally collide,
unrelated to the one-line `logIn` heading-gate edited here.

No route, API, contract, migration, RLS, or operational-role behavior
changed. Security, design, and maintainer review were not separately
requested for this direct user-reported UI change.

**Done - Property detail page decluttering, contain-fit gallery, and Similar
Properties ([PR #221](https://github.com/brollysolutions/client1/pull/221);
direct user-reported public/dashboard UI change, no requirement or
completion-percentage change):** the shared `PropertyDetailView`
(`apps/web/components/property-detail-view.tsx`), used by both the public
`/real-estate/properties/[propertyId]` page and the authenticated
`/dashboard/properties/[propertyId]` page, gained six page-level changes and a
new recommendation panel.

`PropertyDetailGallery` switches its hero photo from `object-cover` to
`object-contain` with a blurred, scaled, and dimmed backdrop copy of the same
image filling the letterbox bars, so a portrait or odd-aspect upload is never
cropped; round prev/next chevron buttons (rendered only when there is more
than one photo, wrap-around, real `aria-label`s, `min-h-11`/`min-w-11` touch
targets) and `ArrowLeft`/`ArrowRight` keyboard handling were added, reusing
the visual treatment already established in `property-row.tsx`.

The property-type badge pill, the "Admin-approved facts for this listing."
sub-line, and the entire "Listing checks" section are removed from
`property-detail-view.tsx`. The RERA verified/exemption statutory disclosure
that previously lived only inside the deleted "Listing checks" box was moved
into the header pill row (`RERA verified · {number}` matching the phrasing
already used on `property-card.tsx`) so it is not lost. "Property at a
glance" is renamed "Overview".

A new `PropertyDescription` client island
(`apps/web/components/property-description.tsx`) renders the
`about_project`/`about_property` narrative with a word-boundary split into an
always-visible head and an animated tail, using the same
`grid-template-rows` `0fr`/`1fr` + `overflow-hidden` + `inert`/`aria-hidden`
CSS toggle already established at
`agent-application-form.tsx:598-624`; the full text stays in the DOM at all
times (collapsed via CSS, not truncated), so it remains SEO-visible and
screen-reader reachable when expanded. The narrative was extracted from
`PropertyDetailsSummary`'s grid via a new `omitDescription` prop so it is not
printed twice.

A new dependency-free `apps/web/lib/similar-properties.ts` exports
`rankSimilarProperties<T extends SimilarityFacets>()`, scoring candidates on
subtype (50), category (30), locality (25), city (15), price proximity
(0-20), area proximity (0-10), and matching BHK (5), with a category-only
floor (`MIN_SIMILARITY_SCORE = 30`) that guarantees a plot can never appear as
"similar" under an apartment. Every field on `SimilarityFacets` is optional,
so the same generic call runs against both the public `PropertyListing` and
the dashboard `REListing` shapes with zero adapters and zero casts (verified
by a dedicated test asserting this in both directions). `price_display` is
parsed back to lakhs via a regex tied by comment to the exact server format
(`format_inr_display()` in `apps/api/app/services/property_submissions.py`);
`meta` (agent-authored free text) is never parsed for area or BHK. Ranking is
deterministic: ties break on price-gap then original array index, never
`Math.random()`/`Date`, so SSR and client renders agree.

`SimilarPropertiesPanel`/`SimilarPropertyCard`
(`apps/web/components/similar-propert{ies-panel,y-card}.tsx`) render the
ranked results as a single accessible `<ul>` of link-wrapped cards with a
locality/city proximity chip and a Price/Area stat row that collapses to a
single Price column when `area` is absent (the public list shape carries no
`area_sqft`) rather than showing an empty cell. `PropertyDetailView` takes two
new flat props, `similar?: SimilarPropertyCardData[]` and `similarCta?`,
instead of a `ReactNode` slot, so it can omit the section entirely on an empty
array and stay a plain Server Component testable with
`renderToStaticMarkup`. The right rail was restructured into one
`display: contents` (below `lg`) / `sticky` (at `lg`) wrapper holding both the
existing contact card and the new panel, so on mobile the panel lands in
normal document flow after the article instead of being trapped in the
`fixed` mobile action bar, and at `lg` it scrolls with the contact card as one
sticky unit (the `sticky` positioning was moved from the inner `<aside>` onto
the wrapper to avoid a nested-sticky bug). Per direct user follow-up during
review, the contact card's "Connect with Dhanadhara for verified next steps
and a guided visit." blurb is now conditional on the existing `dashboard`
prop and renders only on the public surface; the dashboard's authenticated
action rail (Enquire/Book a visit/Save/Compare) already conveys next steps,
so the line was redundant there. A new `it` block asserts the blurb is
present on a public render and absent on a `dashboard` render.

The public page (`app/(public)/real-estate/properties/[propertyId]/page.tsx`)
parallel-fetches the catalogue via the existing `getPublicListings()`, which
never throws and collapses every failure to `[]`, so a catalogue outage cannot
break or delay the detail render; its CTA links to
`propertySubtypeHref()`/`/real-estate#{category}` (the only query parameter
the public catalogue page actually reads). The dashboard wrapper
(`features/real-estate/dashboard-property-detail.tsx`) reuses the existing
`useProperties()` hook in parallel with, not folded into, the detail-loading
effect, and deliberately ignores its own loading/error state so a slow or
failing catalogue fetch cannot gate or break the primary detail render; its
CTA links to `/dashboard/explore/{category}?city=...` (locality-exact-match
would too often yield a one-result page). A defect found during browser
verification — `propertyDescription()` lived in a `"use client"` file and was
being invoked directly (not rendered as JSX) from the server
`PropertyDetailView`, which React correctly rejects — was fixed by extracting
the pure structured-details logic (`rows`, `label`, `money`,
`propertyDescription`) into a new boundary-neutral `apps/web/lib/property-details.ts`
that both the client dialog and the server detail view import from.

Fresh evidence: three new test files
(`lib/similar-properties.test.ts`, 13 tests, including exclusion-by-id,
subtype-over-category and locality-over-city ranking, the category floor
gate, `options.limit`/default, a comma-less-location false-positive guard,
`parseDisplayPriceLakhs` cases, determinism, no em/en dash in `reason`
strings, and the dual-shape generic-call test;
`components/similar-properties-panel.test.tsx`, 6 tests;
`components/property-description.test.tsx`, 2 tests) plus an expanded
`components/property-detail-view.test.tsx` (1 → 4 `it` blocks, appended
rather than rewritten so it merges cleanly with sibling work, covering the
renamed heading, the relocated RERA copy, the absence of the removed badge
and Listing-checks box, and the Similar Properties section's presence/absence
and single-instance-heading-id guarantee). All 412 web unit tests across 65
files pass; `pnpm lint` and `pnpm typecheck` pass; `pnpm build` compiled,
typechecked, and generated all 93 pages before hitting the same pre-existing
Windows-host `EPERM` standalone-symlink failure recorded elsewhere in this
document.

Live browser verification on the restarted `client1-web-1` dev container at
1440px and 390px confirmed, on the public surface: the gallery's contain-fit
plus blurred backdrop on a non-16:10 illustration, working prev/next
chevrons; the type badge, "Admin-approved facts", and "Listing checks" box
all absent while the RERA number still renders in the header; the "Overview"
heading; the Similar Properties panel rendering with correct locality/city
proximity chips and a working "See more {subtype}"/catalogue CTA when the
subject's category has other members, and correctly rendering nothing when it
does not (the single-listing Plots category); and a live click-through of the
Description See more/See less toggle (verified against a temporarily
lengthened `about_project` value on one existing dev-only seed row, reverted
immediately after). On the authenticated dashboard surface, the same
page-level changes and the panel's silent no-render-on-fetch-failure behavior
were confirmed live via a demo Client account; the panel's populated
dashboard rendering could not be directly observed because the dashboard
catalogue-list fetch (`GET /api/v1/properties`) failed under a local
dev-environment condition that was confirmed, via direct `curl` GET and CORS
preflight checks returning correct `Access-Control-Allow-Origin` headers, to
be a browser/environment-side issue rather than a server misconfiguration,
and that reproduces identically on the pre-existing, unmodified
`/dashboard/explore` page — an environment limitation, not a defect
introduced by this change. `pnpm test:e2e` was not run: no property-detail
Playwright spec exists, and this is a copy/layout/recommendation-panel change
without a new user journey, so none was added.

No backend endpoint, database schema, migration, OpenAPI contract, or RLS
policy changed. Security, design, and diff review were not separately
requested for this direct user-reported UI change; the reviewer should
confirm the RERA-disclosure relocation still satisfies the statutory-display
requirement from the property-detail feature this touches
([PR #216](https://github.com/brollysolutions/client1/pull/216)).

**Done - Financial Services card and detail-page decluttering
([PR TBD](https://github.com/brollysolutions/client1/pulls); direct
user-reported public UI polish, no requirement or completion-percentage
change):** on `/loans`, catalogue cards no longer carry a category tag badge
on the artwork or a "N provider(s) configured" line, and the card body
background changed from opaque white (`bg-surface`) to the section's own
cream background (`var(--nav-bg)`) so cards read as bordered tiles rather than
white panels sitting on the page. The sticky filter bar's aggregate "N
services"/"N matches" total next to the search box is removed — the
per-category pill counts already carry that signal — but the text stays in an
`aria-live` region so assistive tech still hears result changes when filtering.

On the per-service detail page (`/loans/[slug]`), the "N configured providers"
badge above the `<h1>` and both small uppercase eyebrows ("One guided route",
"Provider explorer") are removed. The "Apply inside Dhanadhara"/"Enquire now"
button pair — previously mismatched because Enquire stretched to fill the flex
row while Apply hugged its own text — now sits in an equal-width two-column
grid (`sm:max-w-md`) with both buttons at the same `size="lg"` dimensions.
`LeadDialog` gained an optional `size` prop forwarded to its underlying
`Button` (undefined by default), so only this call site's sizing changed; every
other `LeadDialog` consumer is unaffected. Real Estate's own `TrustStrip`
eyebrow ("Why people trust us") and `ProductPage`'s hero eyebrow support are
untouched — only the Loans page's `TrustStrip` call dropped its `eyebrow` prop.

Fresh evidence: all 388 web unit tests pass, including updated
`financial-services-catalogue.test.tsx` coverage asserting the removed tag
badge, provider-count text, and visible aggregate count; `pnpm lint` and
`pnpm typecheck` pass; all three `e2e/financial-services.spec.ts` Playwright
tests pass. Desktop (1520x900) browser verification on the dev container
(restarted to pick up the change) covered `/loans` (card artwork, sticky bar)
and `/loans/personal-loan` (hero badge/eyebrows removed, button dimensions now
equal) before and after the change, with before/after screenshots. `pnpm
build` compiled, passed lint/type validity, and generated all 93 static pages,
then failed in `Collecting build traces` with the same pre-existing
`EPERM: operation not permitted, symlink` failure documented below for the
prior Financial Services entry — a Windows-host `output: "standalone"`
packaging limitation unrelated to this change, not a regression it introduced.
No API, migration, contract, authorization, or RLS surface changed.

**Done - Financial Services discovery redesign
([PR TBD](https://github.com/brollysolutions/client1/pulls); FR-12.x public
presentation follow-up; completion coverage unchanged):** the public
`/loans` catalogue is now a live discovery surface rather than a submit-gated
form. Results filter as the reader types (300 ms debounce) and when a category
pill is chosen; the "Show results" button and the section eyebrow are removed.
The filter rail is sticky at `top-16` beneath the 64 px site header at `z-30`,
below the header's `z-40` mega-menu, and uses a tinted translucent glass rail
instead of an opaque white panel.

Filtering stays server-authoritative. The client island owns only the input's
local text and the debounce, then rewrites the URL with `router.replace(...,
{ scroll: false })`; `/loans` re-reads `searchParams` and re-fetches the
catalogue API, so deep links, pagination, SEO, and ISR are unchanged. The rail
is a real GET form and the category pills are real links, so filtering still
works with JavaScript disabled. Category pills carry exact per-category counts
from single-row `total` reads, which stay correct past the endpoint's 100-row
page cap; a pill that would return nothing is dimmed and inert rather than a
route into a dead empty state.

Card artwork no longer breaks. `equipment-financing` is Admin-published but is
not a marketing product, so it previously fell through to a bare icon beside
fully illustrated neighbours; it now has a reviewed 4:3 repository SVG in the
existing illustration family, resolved through a catalogue-only map that leaves
`LOAN_PRODUCTS`, the navbar mega-menu, and the locked 11/4/1 band split
untouched. Any still-unmapped slug renders a designed category plate matching
the family's backdrop disc and ground shadow. Illustrations fill the 4:3 plate
edge to edge instead of being letterboxed inside it, and a zero provider count
is no longer rendered as a "0 providers" badge.

Fresh evidence: 388 web unit tests pass, including new coverage for the
button-free sticky rail, the removed eyebrow, no-JS category links, the
`equipment-financing` illustration resolution, and the unmapped-slug plate.
`pnpm lint` and `pnpm typecheck` pass, and all three
`e2e/financial-services.spec.ts` Playwright tests pass, including a new one
asserting the rail pins at the header offset, that typing alone rewrites the
URL and narrows the grid, and that clearing restores it. Desktop (1440x900)
and mobile (390x844) browser verification covered the sticky rail, live
typing, category filtering, live pill counts, the empty state, and the clear
paths. No API, migration, contract, authorization, or RLS surface changed.

Unverified command: `pnpm build` did not complete on this Windows host. It
compiled, passed lint/type validity, collected page data, and generated all
93 static pages, then failed in `Collecting build traces` with repeated
`EPERM: operation not permitted, symlink` while writing
`.next/standalone/node_modules`. Creating symlinks needs Developer Mode or an
elevated shell on Windows, so this is a host limitation in the
`output: "standalone"` packaging step and is independent of this change. The
dev container cannot substitute: it mounts only `apps/web`, so the
`@contracts/*` path alias is unresolvable there and its type stage is invalid.
A Linux or elevated-Windows `pnpm build` should be re-run before merge.

**Done - public property detail and authentication intent handoff
([PR #216](https://github.com/brollysolutions/client1/pull/216); FR-7.1, FR-7.2,
and FR-17.1 follow-up; completion coverage unchanged):** approved property discovery stays
public and curated rather than becoming a registration wall or placing the full
inventory on Home. Public cards now open a full-size, shareable property route
with a managed image gallery, approved panorama, structured subtype facts,
amenities, RERA disclosure, trust copy, responsive action rail, Dhanadhara
contact, and an internal-open action.

The anonymous API uses an explicit active predicate and a separate safe detail
schema. It excludes exact minor-unit price, publication state, timestamps, and
reviewer identity; invalid legacy detail JSON is contained per row. Exact public
detail requests are dynamic/no-store so a deactivated property is not retained
by the five-minute curated-catalogue cache. Inactive and unknown UUIDs remain
indistinguishable 404s. Dynamic JSON-LD escapes stored text, managed asset URLs
retain the existing allowlist, and no owner data, private review evidence, map,
or external redirect is exposed.

Login and registration preserve only a safe local dashboard destination and
return to the exact property. Property-origin registration preselects and locks
Real Estate while still allowing Loans to be added. Existing Loans-only Clients
can view the public-equivalent detail and contact the team, but this slice does
not mutate their service enrollment. Real Estate enquiry and site-visit writes
accept only the property UUID from the browser, resolve current active facts on
the server, and ensure the Real Estate Client line before persisting. Public
contact leads carry the same UUID, retain rate limiting and generic inactive-row
responses, and ignore browser-supplied property facts.

Fresh evidence: generated OpenAPI and TypeScript contracts are current; API
Ruff check/format pass; 49 focused PostgreSQL-backed public-property,
enquiry, site-visit, and lead tests pass; Alembic reports the single head
`73f4c2a91d6e`. Web lint and strict typecheck pass; all 384 tests across 62
files pass, followed by a 25-test post-hardening property/auth/contact rerun.
Desktop and 390 px browser review covers public detail, exact contact identity,
mobile actions, login return, and Real Estate registration intent. The canonical
Docker builder compiles, typechecks, generates all 93 pages, and includes both
dynamic property routes. The full repository wrapper remained in its host-side
API pytest phase until the 30-minute command limit, so it is inconclusive rather
than passing. Security, design, and maintainer reviews found no remaining
actionable defect. Next priority returns to FR-2.2 controlled correction/audit.

**Done - Admin-published Financial Services catalogue, provider offers, and
reusable logo library ([PR #215](https://github.com/brollysolutions/client1/pull/215);
CS-014 public follow-up and FR-6.1-FR-6.4; completion coverage unchanged):**
active explicitly published
Financial Products now drive the public catalogue and service-detail pages;
Admin can curate up to six Home services, manage bounded marketing content,
publish searchable/filterable/sortable/paginated provider offers, and reuse
verified provider identities and managed logos. Whole cards and Explore open
the internal detail page, while Apply and Enquire retain product and optional
offer context entirely inside Dhanadhara. The Home page also exposes the four
fixed calculators and a View all route without claiming that calculators are
Admin-configured.

Publication fails closed across service, provider, offer, verification, and
RLS state. Raster logos use the existing managed-media verification pipeline;
raw SVG upload is rejected and the reviewed repository-SVG manifest remains
empty until exact asset provenance is approved. The supplied lender-name corpus
is retained only as unapproved context and is not seeded, deduplicated into
legal identities, or paired with logos. There is no provider destination URL,
external lender redirect, approval claim, live-rate synchronization, inline
KYC upload, or change to operational lender assignment semantics.

Fresh evidence: migration `73f4c2a91d6e` passes downgrade and re-upgrade and
Alembic reports exactly one head; generated OpenAPI and TypeScript contracts are
current; API Ruff check/format pass; 60 focused catalogue/forms/RLS tests pass,
and the final provider/logo review rerun passes 43 tests. Web lint, strict
non-incremental typecheck, and all 369 tests across 57 files pass. The two-case
responsive Financial Services Playwright journey passes after warming the
development Home route, and visual review covers mobile Home and desktop
service detail. The production-equivalent Docker builder compiles and generates
all 93 pages. The monolithic API suite remained CPU-active without a report at
the 40-minute execution bound and is recorded as inconclusive, not passing.
Security, design, and maintainer reviews found no remaining actionable defect.
Next priority returns to the FR-2.2 controlled-correction/audit follow-up.

**Done — property-specific listing forms, RERA review, and catalogue freshness
([PR #212](https://github.com/brollysolutions/client1/pull/212); FR-7.3 and
FR-6.2-FR-6.4 follow-up; completion coverage unchanged):**
new property intake now uses versioned, subtype-specific schemas while
preserving existing authoring roles, Admin-only approval, last-approved
publication, managed media, and historical rows. Project Residence amenities
require 150–500 words. RERA Registration Number is optional at intake;
applicant applicability claims and Admin verification are distinct, only
reviewed applicable/exempt listings may publish, and a post-publication mismatch
deactivates the catalogue row. Public narratives are bounded plain text with
server-side digit/contact/link rejection. Financial Product and lender
freshness derives from Admin-managed records and availability changes and is
shown on both Admin and Client dashboards. No lender data is seeded, hardcoded,
scraped, or synchronized externally, and no KYC field was added.

Fresh evidence: the additive migration passes fresh-database upgrade,
downgrade, and re-upgrade and Alembic reports one head `a7b8c9d0e1f2`; 183
focused PostgreSQL tests pass with four unrelated sponsor-cap cases explicitly
deselected. The full API suite completed 1,741 passes and 13 failures; three
feature-owned home-queue failures caused by two stale fixtures were fixed and
rerun green, leaving 10 unrelated baseline/shared-state failures. API
Ruff/format, seven feature-
tracking tests, eleven migration/RLS tests, the tracking co-change guard, web
lint/typecheck, all 366 web tests, regenerated contracts, and a Linux production
image containing all 93 pages pass. Connected Playwright author, Admin review,
public disclosure, mobile layout, and freshness journeys pass. The broad browser
suite is 8/17: six failures exhaust the suite's own network OTP limit and three
are stale/cold-route expectations. Security, design, and maintainer review found
no remaining actionable feature defect. Completion remains **99.4%**; next
priority returns to FR-2.2 controlled correction/audit.

**Done — property listing authority, owner CRUD, and managed 360 panorama
([PR #210](https://github.com/brollysolutions/client1/pull/210);
FR-7.3 and FR-13.1 through FR-13.4; completion coverage unchanged):** Clients
can no longer create, read, edit, or withdraw authored property submissions.
Real-estate Agents and Sub Admins manage only their own listings; platform Admins
may author and manage any listing while approval/rejection stays Admin-only.
Edits to approved facts return the submission to review without changing the
last approved public row, reapproval updates that row in place, and withdrawal
soft-deletes the authored listing while deactivating its public catalogue row.

Property MP4 intake and playback are replaced by one optional first-party
equirectangular JPEG/WebP panorama per listing. It uses owner-bound opaque
staging keys, the existing fail-closed scanner and image metadata normalization,
2:1/minimum-dimension/pixel/size validation, private Admin review, immutable
public promotion, signed re-review access, retention cleanup, database quotas,
and an on-demand keyboard/pointer panorama viewer. Existing Loans video is
unchanged; external embeds, 360 video, multi-room tours, review bypasses, and
media replacement during fact edits remain out of scope.

Fresh evidence: the additive migration passes fresh-database
upgrade→downgrade→upgrade and reports one head `e5c6d7e8f9a0`; the accumulated
development database's five legacy property-video test rows are preserved and
correctly trigger the migration's explicit archival precondition. The focused
migrated API/schema/media/RLS suite passes 69 tests, including Client and
cross-line denial, owner/cross-owner CRUD, Sub Admin ownership, Admin authoring
and cross-author management, reapproval, withdrawal, public-copy re-review,
and panorama publication. API Ruff check/format pass; generated OpenAPI and
TypeScript contracts are current. Web lint, strict typecheck, all 357 unit
tests, the focused Client-denial and Sub Admin-authoring browser journeys, and
the Linux production build of all 93 pages pass. The monolithic API command
produced no final report within its 15-minute ceiling and is recorded as
inconclusive. Security, design, and maintainer reviews found no remaining
actionable defect. Completion remains **99.4%**; the next priority remains the
FR-2.2 controlled-correction/audit follow-up.

**Done — manual location search replaces browser current location
([PR #209](https://github.com/brollysolutions/client1/pull/209), following
[PR #208](https://github.com/brollysolutions/client1/pull/208); FR-17.2-adjacent UX; completion coverage unchanged):**
Registration and Profile settings expose one labelled, editable, search-style
Location field for a city or locality. The shared property omnibox and filter
sheet used by dashboard home, Explore, category, and Bookmarks surfaces retain
manual API-backed property-name, locality, city, and PIN search. Browser
geolocation, reverse-geocoding requests and configuration, provider disclosure,
and every current-location capture/refresh control are removed from the web app.
Previously saved personalization coordinates remain removable and continue to
expire through the existing server safeguards, but the current web UI cannot
capture or refresh them.

The authenticated property API remains the sole production source for property
cards, search suggestions, and city/locality/PIN filter choices; the legacy
frontend sample catalogue and its hardcoded locations remain removed. The
redundant catalogue-location selector and the Available properties, Saved
properties, Cities, and Property categories dashboard metrics remain removed.
Operational pickup/address fields, property authoring, audience coordinates,
generic Admin searches, APIs/contracts, schema, auth/RLS, deletion, audit/log
behavior, and dependencies are unchanged.

Fresh evidence: three regression journeys failed first against the old controls.
Web lint, strict typecheck, and all 356 unit tests pass. The authenticated 390px
dashboard property-search/filter-sheet journey and 390px registration journey
pass; the personalization journey also passed before a later verification rerun
hit only the development OTP rate limit. Fresh desktop (1280px) and phone renders
were visually reviewed. The production build compiled, typechecked, and generated
all 93 pages before the known Windows standalone-symlink `EPERM` tail; unrelated
host-side public-data fetches also timed out or could not resolve the Docker-only
`api` name. Security, design, and maintainer review found no remaining actionable
defect. Next priority remains the FR-2.2 controlled-correction/audit follow-up.

**Done — registration/profile Location and Salaried terminology
([PR #207](https://github.com/brollysolutions/client1/pull/207); FR-17.2 and FR-18.1-adjacent profile UX; completion
coverage unchanged):** Postal address is removed from registration, Profile
settings, the API, and generated contracts. The preserved database column is
renamed to `location`; existing `net_salary` rows are migrated to `salaried`.
Users enter a locality or city in the labelled manual search field; the value is
not sent until the form is saved. No browser geolocation or reverse-geocoding
request is made. This profile value is separate from the
consented 30-day personalization signal, creates no location history, is absent
from logs/audit details/tokens/Redis, remains owner/platform-Admin RLS scoped,
and is cleared with account deletion.

Fresh evidence: 53 focused API auth/profile/deletion tests pass; Ruff check and
format pass; migration upgrade→downgrade→upgrade and the single applied head
`e4b5c6d7e8f9` pass; regenerated OpenAPI/TypeScript contracts are byte-stable;
web lint, strict typecheck, and all 375 unit tests pass. The production build
compiled, typechecked, and generated all 93 pages before the known Windows
standalone symlink `EPERM` tail; a Linux builder workaround was inconclusive.
The focused registration browser journey passes at desktop and 390px widths,
and broad Playwright is 11/15 with four unrelated stale-flow failures. The
monolithic API suite produced no report within 13 minutes and is inconclusive.
Next priority remains the FR-2.2 controlled-correction/audit follow-up.

**Done - DhanaDhara DD logo exploration board
([PR #206](https://github.com/brollysolutions/client1/pull/206); brand design
document; completion coverage unchanged):** added one self-contained SVG board
with 12 original DD constructions across three visual families, six wordmark/font
directions, the current palette, a 16-96 px reduction lab, and a client-shortlist
area. The SVG parses with a `0 0 1800 2600` view box, exposes 12 labeled concept
groups and 12 reusable mark symbols, includes title/description metadata, and has
no scripts, inline event handlers, or remote asset references. Playwright renders
at 900 x 1300 and 450 x 650 were visually reviewed; the feature-tracking check
passes. Per the client's revised direction, application pages and runtime branding
remain unchanged, as do routes, APIs, contracts, authorization/RLS, data,
workflows, dependencies, and business-line behavior. Selection, trademark
clearance, and application integration remain follow-up work; the next product
priority remains the FR-2.2 controlled-correction/audit follow-up.

**Done — Starlette HTTP 422 deprecation cleanup
([PR #205](https://github.com/brollysolutions/client1/pull/205); maintenance;
completion coverage unchanged):** all 68 production references across 19 API
route/service modules now use Starlette's current
`HTTP_422_UNPROCESSABLE_CONTENT` name. Both names resolve to numeric 422, so
response codes, payloads, routes, OpenAPI, authorization/RLS, service behavior,
models, migrations, dependencies, and the web app are unchanged. A source-wide
AST regression guard prevents the deprecated identifier from returning.

Fresh evidence: the new guard failed first with all 68 offenders and now
passes; `app.main` imports with `StarletteDeprecationWarning` promoted to an
error; five focused system tests pass; Ruff check and format pass across 457
files; and Alembic reports the single head `d3a9b72c5e41`. The full API suite
was attempted for about 13 minutes but returned no report before clean
termination, so it is recorded as inconclusive rather than passed. Completion
coverage remains 99.4%, and the next priority remains the FR-2.2
controlled-correction/audit follow-up.

**Done — refreshed bundled artwork delivery for governed banners
([PR #204](https://github.com/brollysolutions/client1/pull/204);
FR-12.1-FR-12.3; completion coverage unchanged):** bundled template artwork
now carries its immutable database template version in the served URL, for
example `/banner-templates/financial_services/personal-loan.webp?v=1`. This
forces browsers, CDNs, and Next's image optimizer to request the refreshed
pixels instead of retaining an older response at the stable public path. The
same version-aware URL is returned by the Admin/Sub Admin template library and
the anonymous public-banner API, so existing approved campaigns and newly
authored banners use one delivery rule. Canonical uploaded template objects
remain unchanged because their object keys are already unique.

No artwork, category mapping, banner copy/status, approval workflow, upload
authority, API schema, generated contract, migration, RLS policy, dependency,
or business-line behavior changed. All 32 refreshed Financial Services and
Properties images remain the governed files delivered by the banners.

Fresh evidence: the regression test failed first against the unversioned URL;
the six-test banner catalogue suite and three focused PostgreSQL-backed Docker
API tests pass, as do Ruff check/format over all 456 API files, one Alembic head,
web lint, strict typecheck, the focused 23-test web set, and all 373 web tests.
Live browser checks on `/loans` and `/real-estate` observed versioned section
artwork requests returning HTTP 200. The production build compiled,
typechecked, and generated all 93 pages before the known Windows standalone
symlink `EPERM` tail; host-side builds also cannot resolve the Docker-only
`api` hostname. The broad Docker API suite was attempted but remained active
without a report for about 30 minutes and was terminated cleanly, so it is
recorded as incomplete rather than passed. Design, security, and diff review
found no actionable issue. The work is committed and published in PR #204.
Next priority: return to the highest-ranked incomplete feature.

**Done — Financial Services and Properties campaign-art composition refresh
([PR #203](https://github.com/brollysolutions/client1/pull/203); FR-12.1-FR-12.3;
completion coverage unchanged):** all 32 governed
section-banner templates (16 per placement) have been replaced with distinct,
text-free 1440x576 editorial WEBPs following the supplied composition system:
calm copy space on the left, environmental detail entering the middle, and the
category’s focal subject primarily on the right. Financial scenes now separate
personal, business, vehicle, education, funding, insurance, and card narratives;
property scenes distinguish individual subtypes, occupancy states, single and
plural category campaigns, land uses, offers, commercial property, and general
guidance. Homepage hero and 960x540 sponsor artwork are intentionally unchanged.

CMS artwork guidance now records the middle-flow requirement. The asset contract
also rejects ungoverned files and exact duplicate hashes, protecting both the
closed category catalogue and the no-unused/duplicate-media requirement. The
public visual ledger remains 127 files (81 SVG, 44 WEBP, 2 PNG), with zero exact
duplicate groups; all generated sources were normalized without carried source
metadata and the largest final banner is about 193 KB against the 2 MB limit.
No category, template row, upload authority, API, contract, migration, RLS rule,
or public rendering component changed.

Fresh evidence: dual visual contact-sheet review and final-WEBP inspection pass;
the focused two-test asset contract, web lint, strict typecheck, and all 373 web
tests pass. Branch-specific `/loans` SSR returned 200 from the isolated dev
server; the browser connector rejects non-default port 3001, so responsive
browser screenshots are recorded as unavailable rather than passed. Production
build compiled in 56 seconds, typechecked, and generated all 93 pages before the
known Windows standalone-symlink `EPERM` tail; host-side public fetches also
cannot resolve the Docker-only `api` hostname. Design review found no actionable
issue, and security and final diff reviews found no actionable defect. The work
is committed and published in PR #203. Next priority: return to the
highest-ranked incomplete feature.

**Done — sponsor spotlight, section scroll cue, and Loans category declutter
([PR #202](https://github.com/brollysolutions/client1/pull/202); FR-2.3,
FR-6.1; completion coverage unchanged):** The public
sponsor remains a single, clearly disclosed and non-autoplaying campaign, but
now uses a bordered inset spotlight stage, restrained transform/opacity accent,
and source-faithful sponsor-art composition. The governed 960x540 creative is
contained on phones and occupies exact 16:9 rails at tablet/desktop widths,
rather than being forced into a wider cover crop. No artwork, template,
Sub-Admin authority, API, RLS, migration, or generated contract changed.

Financial Services and Properties section banners now present one functional,
focusable two-chevron cue in their existing gap. It is a real `#page-overview`
anchor with scroll margin and a visible focus ring; the previous permanent-hero
cue is suppressed only when a section banner provides the new cue. All new
motion is transform/opacity-only and static under `prefers-reduced-motion`.
On Loans, only the descriptions below “Loans” and “Cards and insurance”, plus
their 11/5-product pills, were removed; product content and the section-level
supporting copy remain intact.

Fresh evidence: focused sponsor/carousel/product rendering tests and the full
web suite pass (52 files, 372 tests); web lint and strict typecheck pass. The
production build compiled, typechecked, and generated all 93 pages, then
failed in its known Windows standalone-symlink `EPERM` tail; host-side public
fetches also cannot resolve the Docker-only `api` hostname. Design, security,
and final diff review found no actionable issue. The branch is published as
`codex/20260819-113333-701-b-out-418-b-xact-25145`; next priority is the
highest-ranked incomplete feature in the implementation plan.

**Done — governed homepage sponsor themes and public banner presentation
refinement ([PR #201](https://github.com/brollysolutions/client1/pull/201);
FR-2.3, FR-12.1-FR-12.3; completion coverage unchanged):**
`codex/20260819-060544-reconnect-mcps` refines the existing sponsor
slot into the user-selected compact split composition: text-free artwork fills
the left panel and authored campaign copy/CTA occupies the right. The card is
152px on phones, 176px at tablet width, and 208px on desktop, retains the
explicit Sponsored disclosure and session-only dismiss, and is reused exactly
in the CMS preview. Six unique 960x540 WEBPs now cover generic sponsorship,
personal finance, business finance, cards/rewards, insurance/protection, and
verified property. The previous wide variants were replaced in place; the
public media ledger contains 44 governed banner WEBPs and 127 visual files in
total (81 SVG, 44 WEBP, 2 PNG), with zero exact duplicate groups.

Sub Admin authority is deliberately unchanged: authors can select an active
governed theme and write campaign copy, while platform Admins continue to
upload/version artwork and approve campaigns. Migration `d3a9b72c5e41` seeds
the five additional template rows and adds a placement-wide partial unique
index so all six categories still share exactly one LIVE sponsor slot. The
activation job locks that shared live scope and still requires a due
cross-theme replacement to name its incumbent. No endpoint, generated
contract, RLS policy, grant, dependency, personalization rule, or upload
validation changed.

The Financial Services and Properties carousels now use a responsive 224-520px
height with a 16-24px gap before the permanent hero. The newly introduced
section-banner scroll cue was removed after direct user feedback; pre-existing
page behavior outside that cue remains untouched. Production and preview
aspect guidance stays 1440x576 for those banners, while sponsor guidance is
960x540 for its left media panel.

Fresh evidence: migration upgrade, downgrade, and re-upgrade succeeded against
the already-migrated Docker dev database; Alembic reports the single head
`d3a9b72c5e41`. Seven focused Docker API catalog/public/scheduler tests pass,
including cross-theme uniqueness and named replacement. The 18 repository
tracking/migration tests pass; Ruff check/format pass across 456 API files; web
lint, strict typecheck, and all 370 unit tests pass. The production build
compiled, typechecked, and generated all 93 pages before the known Windows
standalone symlink `EPERM` tail; local API-hostname timeouts were handled by the
existing public fallbacks. Browser checks at desktop and phone widths covered
`/`, `/loans`, and `/real-estate`. `./scripts/verify.sh --ci` was attempted
twice, but its broad API phase did not return within the first one-hour command
window and the longer run became detached when user input arrived; neither run
is claimed as passed. Design, security, and final diff review found no
actionable issue. Residual operational note: artwork dimensions remain an Admin
CMS guidance/preview contract rather than a new server-side pixel-dimension
rejection rule.

**Done — cross-line banner and offer authoring no longer 500s (defect fix, no
requirement change):** creating any banner or offer with `business_line: "both"`
returned a 500. `ck_banners_business_line_content_audience` (and its offers
twin) deliberately allow cross-line content rows, but the services forward the
entity's own line into `services/audit_log.py::record`, and
`ck_audit_log_business_line_optional_operational` allows only a concrete line or
NULL — migration `a3b4c5d6e7f8` even asserted zero pre-existing `both` audit
rows. Every existing banner/offer test used a concrete line, so the path was
unexercised until the sponsor-ad work hit it.

Fixed in `record()` rather than at the ~40 call sites: an audit entry's line is
a SCOPE, so a cross-line action is recorded as line-neutral (NULL), which is the
honest value when neither line is true. The alternative is the same ternary
repeated at every caller with a 500 waiting behind whichever one is forgotten.
Operational tables are constrained to a concrete line in the database, so the
normalization cannot mask a mis-scoped operational row, and the Admin read
filter was already typed `Literal["loans", "real_estate"] | None`, so no
read-side change was needed. No schema, contract, RLS or endpoint change.

Fresh evidence: both new tests were confirmed RED against the unfixed code and
green after (a unit test asserting `both` is stored as NULL and a concrete line
is untouched, plus an end-to-end test authoring a cross-line banner through the
real API). Ruff check and format pass across 455 files; 137 audit / banner /
offer / classification-contract tests and a further 36 admin-suite tests that
write audit rows all pass.

**Done — homepage sponsor ad slot (FR-2.3, FR-12.1; extends already-Complete
requirements, so completion coverage is unchanged):** `feat/homepage-ad-strip`
adds a sponsored ad above the Home page hero as a full-bleed leaderboard band:
creative flush to the leading edge, the sponsor's copy beside it, the CTA at the
trailing edge, a "Sponsored" disclosure and a session-only dismiss. The same
pass makes the homepage hero carousel itself full-bleed and full-screen — the
`hero` variant, whose only caller is the homepage, now fills the viewport below
the sticky header instead of rendering a centred peek-coverflow card, with the
peek blur removed, arrows pinned to the container edges (hidden at phone width,
where they sat on the headline) and dots overlaid on the slide rather than
adding a strip beneath it. `/loans` and `/real-estate` are unaffected: they use the
`section` variant. It is a fourth value on
the existing `banner_placement` enum (`homepage_ad`), so Sub Admin authoring,
the Admin approval gate, the activation scheduler, RLS, audit and the governed
artwork catalogue are all inherited: no new table, endpoint, policy, grant or
dependency.

**One sponsor at a time, with the next queued behind it.** The placement seeds
exactly one category key (`sponsor`), which turns
`uq_banners_live_placement_category` into a database guarantee of single
occupancy rather than a convention; the successor uses the existing replacement
flow (`replaces_banner_id`, promoted by `cms_activation` at its `starts_at`,
which refuses to displace a banner the newcomer does not name). The public cap
for this placement is 1 rather than 7, and because nothing rotates the renderer
is a plain component with no carousel, autoplay or arrows.

Privacy posture is unchanged and deliberate: no third-party ad script, no
impression or click beacon, and the dismissal lives in React state only —
`app/(public)/privacy/page.tsx` publishes "We do not use advertising or
tracking cookies", and the announcement bar is the precedent for session-only
dismissal. Ad CTAs stay same-origin; the `isSafeLocalHref` guard was not
touched. Sponsors cannot be linked to a property listing, because
`property_category_matches_campaign` falls through to `False` for this
placement — pinned by a test so it cannot open silently.

The migration adds the enum label inside `op.get_context().autocommit_block()`
before seeding the template row that references it. Without that block it would
pass on a fresh database and fail on every existing one (PostgreSQL forbids
using a label added by the same transaction, except for a type created there,
which is exactly the path CI takes) — so **a green CI run is not evidence for
this migration**. Fresh evidence: applied to the already-migrated dev database,
the label and seed verified, downgrade removed exactly the seeded row,
re-upgrade clean, single head `c2f8a91b4d73`. Ruff check and format pass across
455 files; 69 focused banner API/RLS/catalog tests and 33
route-authorization/RLS-coverage/scheduler tests pass, including new coverage
that a second concurrent live sponsor raises an integrity error while an
approved successor is withheld from visitors, that `?placement=dashboard` still
422s, and that the placement forces no business line. Regenerated contracts
contain only the two expected additions. Web lint, strict typecheck and all 367
unit tests pass. Browser verification at 1440px and 390px covered the image-left/content-right
layout, the disclosure, the dismiss and the hero returning flush beneath it.

Four latent traps were closed while passing through: `CATEGORIES_BY_PLACEMENT`
now fails at import if a placement is missing (it was indexed with `[]`),
`PUBLIC_BANNERS_LIMIT_BY_PLACEMENT` is derived over the enum (a missing entry
was a 500 on an anonymous route), the CMS placement list is a
`Record<Placement, …>` so tsc catches an omission instead of silently hiding a
placement from authors, and the artwork-size test uses an explicit
per-placement map rather than a ternary that dropped new placements into the
wrong size band.

**Done — public offers strip removal and navbar/section polish (public UI, no
requirement change):** on
`claude/20260818-195255-1-remove-liveoffers-entire-section-as-if`, per direct
user instruction the "Live offers / Offers running right now" strip is removed
from `/loans` and `/real-estate`: public promotional offers will be carried by
Sub Admin banner campaigns, so the strip and its supporting modules
(`components/offer-strip.tsx`, `lib/offers.ts`, `lib/public-offers.ts`, plus
their three test files) are deleted with no remaining consumers. The anonymous
`GET /api/v1/public/offers` endpoint and all authenticated Client offer
surfaces are unchanged. The desktop navbar's "Financial Services" and
"Properties" triggers now navigate to their pages on pointer click while the
mega-panel keeps opening on hover; keyboard activation (`event.detail === 0`)
still opens the panel so dropdown items remain keyboard-reachable. The /loans
products heading reads "Explore our financial services" with the eyebrow
removed (the `productsEyebrow` prop is deleted as dead code), and the Credit
Cards feature card drops its "In the spotlight" chip. Fresh evidence: web
ESLint, strict typecheck, and all 361 unit tests pass; the production build
compiles, typechecks, and generates all 93 pages before the known Windows
standalone `EPERM` symlink failure. Live browser checks verified all four
changes on the dev stack; the only console errors are pre-existing local
dev-data artifacts (homepage-closing content-block timeout and three MinIO
test-listing image-proxy 500s).

**Done — /loans "Explore our services" redesign (public UI, no requirement
change):** on `feat/loans-services-redesign`, all 16 product-card
illustrations were redrawn as one cohesive real-color family (shared
halo/shadow/sparkle scaffold; leather browns, note greens, terracotta roofs,
and gold rupee accents), replacing a first all-blue duotone pass the user
rejected mid-review. The section now carries an eyebrow/subheading header,
per-band intro copy with an accent bar and product-count chip, and refined
card hover states. The "Cards and insurance" band shows its four insurance
products in one row with Credit Cards as a full-width spotlight card at sm+
that collapses to a standard stacked product card on phones, per user
feedback; the "Why people trust us" content moved from inside that band to
the section-level `TrustStrip` below the whole grid (`ProductBand.trust`
retired; `ProductPage.productsTrust` and `ProductBand.featureProductId`
added). A real alignment defect was fixed: the Home Loan card's empty legacy
`property-loan` anchor span was a child of the Card's `gap-6` flex column and
pushed that card's illustration 24px below its siblings; anchor spans are now
absolutely positioned. The offers strip already returned `null` with no
matching live offers — behavior confirmed and locked by a new
`components/offer-strip.test.tsx` (the explicit namespace React imports added
to `offer-strip.tsx`/`lead-dialog.tsx` only serve the vitest classic-JSX
setup, matching `hero-carousel.tsx`). No route, API, contract, migration, or
RLS change. A same-PR follow-up brings the same visual language into both
desktop mega-menus: Financial Services dropdown items reuse their product's
spot illustration as a 48x36 tint-tile thumbnail (one art source for menu and
page), and the Properties dropdown gets nine purpose-drawn 96x72 subtype
miniatures under `public/illustrations/menu/properties/` because the catalog
landscape scenes are unreadable at thumbnail size. The `NavChild`/
`FinancialServiceLink` types gain an optional `illustration`; the mega-menu
renderer falls back to the Lucide icon when it is absent, and the mobile
drawer deliberately keeps Lucide icons (illustrations stay lg+ only). Menu
tests now assert every dropdown item's thumbnail exists on disk. Fresh
evidence: web ESLint, strict typecheck, and all 392 unit tests pass; the
production build compiles, typechecks, and generates all 93 pages before the
known Windows standalone `EPERM` symlink failure. Live browser checks at
1440px and 390px against the running dev stack verified band layout,
illustration fidelity and alignment, spotlight/stacked credit-card behavior,
anchors, trust strip placement, the live offers strip, and both mega-menus
rendering all 25 thumbnails; the only console error is the pre-existing
missing `homepage-closing` content block 404 in the local dev database.

**Done — property-backed public banners, property taxonomy, and full-bleed
carousel polish:** `feat/starter-banner-ctas`
([PR #195](https://github.com/brollysolutions/client1/pull/195)) preserves the
completed FR-12 authoring/Admin-approval lifecycle while adding a validated
active-property relationship for public Homepage/Properties campaigns. Public
projection now derives the same-origin enquiry destination, managed media, and
gold RERA VERIFIED badge from the approved listing and suppresses inactive
linked properties. Property intake, public filtering, and the desktop/mobile
navigation share the nine-value taxonomy; the desktop menu presents
Residential, Plots, and Commercial in one three-column row. Properties
campaigns use nine distinct, visually reviewed 1440×576 WebP assets with no
people; legacy listings and broad-category campaign edits remain compatible.
The shared carousel now rotates after five idle seconds without a visible
pause/resume control, keeps reduced-motion and hover/focus safeguards, removes
the Homepage dark scrim, and renders Financial Services/Properties full-bleed,
flush to the header and following hero, with edge chevrons and no dots.

Fresh evidence: the 113-test affected API integration set and 11-test banner
RLS suite are green, followed by a green two-test subtype-cap rerun; Ruff check
and format pass across 454 API files; Alembic is applied at the single head
`a178bb90cc12`; regenerated OpenAPI and TypeScript contracts are byte-identical.
Web lint, strict typecheck, all 386 unit tests, and the Linux production build
(all 93 pages) pass. Live desktop and 390px browser checks verified header/hero
adjacency, full-width sizing, five-second autoplay, controls, the three equal
dropdown columns, and responsive layout; all nine raster assets were inspected
for subtype fidelity and absence of people. The broad Playwright suite passed
9/14; its five failures are pre-existing flows outside this change (login
fixture, unrelated Admin search, referral-rules form assumption, loan-offers
heading, and a loan-media registration password rejected for containing the
mobile number). Security, design, and complete-diff review found and fixed the
only authoring defect (an optional property selection could not be cleared) and
found no remaining actionable issue. Requirement completion is unchanged; the
next priority returns to the FR-2.2 controlled-correction/audit backlog.

**Done — dev-stack `web` cold-start SSR fetch timeouts against `api` (dev
tooling, no requirement change):** `docker-compose.yml`'s `web` service
depended on `api` with the plain list form (`depends_on: - api`), which only
waits for the `api` container process to start, not for its healthcheck to
pass. `api`'s own healthcheck carries a 90s `start_period` specifically
because cold start runs `alembic upgrade head` (90 migrations) before
`uvicorn` binds the port (see the healthcheck `start_period` entry below) —
so on a full cold `docker compose up`, `web`'s Server Components began
firing SSR fetches at `http://api:8000` (`lib/api/server.ts`'s
`serverFetchJson`, 5s `AbortSignal.timeout`) before `api` was reachable at
all. Some raced through while others — e.g. the homepage's
`content-blocks/homepage-closing` lookup — hit the client-side timeout and
logged `serverFetchJson.network_error`, reproduced live in this session's
container logs. `scheduler` already avoided this with a hard `api:
condition: service_healthy` dependency; `web` was the one service still
using the start-only form. Fixed by moving `web`'s `api` dependency to
`condition: service_healthy`, matching `scheduler`. No application code,
route, contract, migration, or RLS change — `docker-compose.yml` only.
Fresh evidence: `docker compose config` validates; a full cold `down` + `up
-d` of the whole stack (`docker-compose.yml` + `docker-compose.dev.yml`, the
documented dev-overlay invocation in `scripts/init-dev.sh`) shows `api`
reach `Healthy` before `web`/`scheduler` begin `Starting` in the compose
event log, and `web`'s logs contain zero `serverFetchJson` timeout/network
errors across the cold boot (`grep -i "timeout\|error\|abort"` on the fresh
container log: no matches). One separate, pre-existing, dev-only artifact is
out of scope for a code fix: `next dev --turbopack`'s on-demand first
compile of a route (observed 65.7s for `/`) can still push a single
first-ever SSR fetch past the 5s timeout while the event loop is busy
compiling; the page still returns `200`, the affected section simply
doesn't render (the module's documented "never throw" contract), the very
next request succeeds in well under a second, and `next build`'s production
output has no on-demand compile step, so this cannot occur outside `next
dev`.

**Done — web `nanoid` audit patch (dependency security, no requirement
change):** CI's `pnpm audit --prod --audit-level high` (`.github/workflows/security.yml`)
failed on a high-severity `nanoid` advisory (GHSA-2v37-7h3g-55p8: custom
generators can loop indefinitely when size is zero; patched `>=3.3.18`),
reached transitively via `next > postcss > nanoid` and
`nuqs > next > postcss > nanoid`. The repo already pins `postcss` directly to
`>=8.5.10` in `apps/web/package.json`, and `postcss@8.5.23`'s own
`nanoid ^3.3.16` range already permitted the patched `3.3.18` — the lockfile
simply hadn't picked it up. `pnpm update nanoid` in `apps/web` bumped the
single deduped `nanoid` resolution `3.3.16` → `3.3.18` in
`apps/web/pnpm-lock.yaml`; pnpm's re-resolution incidentally also picked up
in-range `postcss` `8.5.23` → `8.5.26` and `rollup` `4.62.2` → `4.62.4` (both
transitive, both satisfy their dependents' existing semver ranges — no
`package.json` range changed). No application code, route, or contract
changed. Fresh evidence: `pnpm audit --prod --audit-level high` now reports
no known vulnerabilities; web lint and strict typecheck pass; all 347 unit
tests pass; the production build generates all 93 pages before the known
Windows standalone `EPERM` symlink trace-copy failure (pre-existing, present
before this change, Docker/Linux CI-only path unaffected).

**Done — [PR #190](https://github.com/brollysolutions/client1/pull/190) —
dev-stack api healthcheck start_period widened (dev tooling, no
requirement change):** local `docker compose up` intermittently aborted
`scheduler` mid-startup with `dependency failed to start: container
client1-api-1 is unhealthy`, leaving it stuck in `Created` even though `api`
recovered seconds later. Root cause: `api`'s healthcheck window (20s
`start_period` + 5 retries × 15s `interval` = 95s total grace) was tighter
than the cold-start path — `uv run alembic upgrade head` against 90
migrations, then FastAPI boot — regularly takes; `api` got marked unhealthy
once during that window, and `scheduler` (which has a hard `api: condition:
service_healthy` dependency) evaluates that condition only once during
`docker compose up` and does not retry after the dependency later recovers.
Only `docker-compose.yml`'s `api.healthcheck.start_period` changed, 20s →
90s; `interval`/`timeout`/`retries` (steady-state failure detection) are
unchanged. No application code, route, contract, migration, or RLS change.
Fresh evidence: `docker compose config` validates; a full cold
`down` + `up -d` of the whole stack (`postgres`, `pgbouncer`, `redis`,
`minio`, `clamav`, `api`, `scheduler`, `web`) completed in ~4m41s with every
service, including `scheduler`, reaching `healthy`/`Started` — the prior
failure mode did not reproduce.

**Done — public navbar label broadened (copy change, no requirement change):**
the public header's `Loans` entry is now `Financial Services`. The `/loans` page
already carries the whole consumer-finance line — the five loan products plus
the `credit-cards` and `insurance` cards in `apps/web/lib/products.ts`, both
live anchor targets — so the old label under-described the destination. Only
`apps/web/components/navbars/nav-items.ts` changed; the desktop header and
mobile drawer both read that single config, and active-state matching keys off
`href`, which is unchanged. The route, sitemap entry, canonical URL, breadcrumb
JSON-LD, page metadata, and footer `Loans` column were deliberately left alone:
renaming an indexed public path costs SEO for no user-facing gain. Requirement
completion stays at 99.4%. Fresh evidence: a new
`components/navbars/nav-items.test.ts` (3 assertions, including that the
broadened label still resolves to the live `/loans` route — the drift a later
"consistency" edit would introduce), plus web lint, strict typecheck, and all
347 web unit tests pass after merging the PR #188 coverage gates from `main`.
The production build compiles and generates all 93 pages before the known
Windows standalone `EPERM` symlink failure. No Playwright run: the public header
has no e2e coverage today and this change adds no user journey to cover.

**Done — [PR #188](https://github.com/brollysolutions/client1/pull/188) — executable
coverage gates (engineering hygiene, no requirement change):**
four security invariants that previously depended on someone remembering to
write a per-feature test are now enumerated and enforced. New route
authorization coverage asserts that each of the 232 routes either reaches
`get_current_user` — the only thing that runs `SET LOCAL ROLE api_user` and
turns RLS on — or appears in a 28-entry reviewed public allowlist. New schema
coverage asserts RLS is enabled on all 49 tables, declares the two zero-policy
deny-all cursor tables, and asserts `api_user` holds neither SUPERUSER nor
BYPASSRLS. On the web side, middleware-matcher coverage checks all 53 `(app)`
pages against the real `config.matcher`, and a client-env test rejects
secret-shaped `NEXT_PUBLIC_*` names and server-only env reads inside
`"use client"` modules. `scripts/check_migration_rls.py` fails a staged or
pull-request migration that creates a table without RLS. No route, contract,
migration, policy, or user-visible behavior changed, so requirement completion
stays at 99.4%. Fresh evidence: 8 new API tests pass in the API container
against the live schema, 6 new web tests and all 338 existing web unit tests
pass, 11 new plus 6 existing script unit tests pass, and every new assertion was
mutation-tested red before acceptance. The API integration suite cannot run on
this Windows host at all (the `greenlet` DLL fails to load and the database
hostname is Docker-internal), so API tests were executed inside
`client1-api-1`. The full API suite completed there at **13 failed, 1665
passed** in 38 minutes. Six of those failures pass when their file is run alone
(cross-test ordering and the shared Redis that `conftest.py` documents as never
flushed). The other seven also reproduce alone — a run in which pytest collects
only that one file and never imports the two test files added here, which is
what rules this change out as the cause; they trace to accumulated rows in this
long-lived dev container's database, such as
`test_loan_types_returns_seeded_labels` expecting the seeded `Personal Loan`
label that test-created loan types have displaced. CI provisions a fresh
database, so these are not expected to reproduce there, but that is a
prediction rather than evidence and needs confirming on the pull request.

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

**In progress - Admin and Sub Admin dashboard UI overhaul, phase 4 of 9** on
`claude/20260827-admin-subadmin-ui-foundation` (direct user instruction; no
requirement or completion-percentage change): agent applications and the
operational account directory.

Agent applications moves onto the shared table and the workspace dialog. Its
four KYC documents were a list of download links; they now render as inline
previews, because a photo and an Aadhaar scan are what the decision is actually
made on. The lazy per-open detail fetch is unchanged - presigned URLs expire in
about five minutes, so they cannot be baked into the list. The queue also gains
a status filter: `GET /api/v1/admin/agents` hardcoded `status = pending`, making
the queue a one-way door with no way to look back at what had been decided. The
parameter defaults to `pending`, so omitting it preserves the old behavior, and
takes an explicit `all` member rather than an empty string, which FastAPI
validates against the Literal and rejects.

The operational account directory had exactly one filter: a "Search this page"
box that narrowed only the 25 already-fetched rows, so an account on page three
was unreachable from page one. `GET /api/v1/admin/users` now accepts `search`,
`status`, `role`, `business_line`, `created_from`, `created_to` and
`never_logged_in`, all applied in the query so `total` stays correct for paging.
`role` and `business_line` are EXISTS subqueries against the profile tables, not
joins, so a user holding several profiles is still counted once. Search covers
name, mobile and email only - the columns an Admin has in hand when someone
contacts support - and runs against the stored values, so a soft-deleted account
cannot be found by a mobile that has already been tombstoned. The panel is
rebuilt on the shared table with a sign-in-history filter and real pagination;
its rows stay non-clickable because suspend/reactivate is the only thing to do
with an account here, and a whole-row target would be a lie.

The generated OpenAPI spec and typed client are regenerated for the new query
parameters. No response model, migration, auth, RLS, or business-line behavior
changed.

Evidence: all 499 web unit tests, web lint, and web typecheck pass. 20 agent and
30 admin-user API tests pass against Postgres, including new coverage for the
agent status filter and for server-side user filtering, `total` correctness, and
422 on an invalid status. API Ruff check and format pass.

**In progress - Admin and Sub Admin dashboard UI overhaul, phase 3 of 9** on
`claude/20260827-admin-subadmin-ui-foundation` (direct user instruction; no
requirement or completion-percentage change): listing approvals, support tickets,
and document verification.

Listing approvals moves from `features/real-estate/review-queue-view.tsx` to
`features/admin/listing-approvals-view.tsx`. It was already an Admin console
reaching across for `admin-list-tools` through a relative `../admin/` import; the
submitting half of the same lifecycle stays under `features/real-estate/`. Its
review is the richest in the codebase — a presigned media grid, the 360 panorama
viewer, reviewer documents, the RERA registry sub-review and subtype detail — and
now renders in the full-screen workspace dialog with the media on one side and
the decision controls on the other instead of stacked in a `max-w-3xl` column.
The approve gate is unchanged (RERA settled and every media asset `ready`) but
the reason it is blocked is now stated beside the button rather than hidden in a
`title` attribute. The 5-second media poll and per-asset URL minting are
unchanged.

Support tickets was the only admin queue with no search, no date range and no
pagination. It gains all three plus a category filter — a field the record always
carried and nothing exposed — and now passes `status` to the API. The client
wrapper and the route have always accepted that parameter; the hook simply never
sent it, so the console fetched every ticket ever raised and filtered them in the
browser. The embedded mobile-change queue keeps its own tinted panel: it is a
distinct queue with its own statuses, not a section of the ticket list.

Document verification keeps its boolean model and its mandatory note on
un-verify. The two-level lead-then-subject card nesting becomes one sortable
table with search, review-state, source, business-line and upload-date filters,
and real pagination — `business_line` and `offset` were already supported by the
route, and the client wrapper was discarding the `total` needed to page. The
review itself moves into the workspace dialog, where each document renders inline
(image or PDF, with a download fallback) beside its own note and decision, so the
reviewer decides from the artefact rather than the filename. A verify-all action
covers the common case; there is deliberately no bulk counterpart for
un-verifying, because each one requires its own note.

No API contract, migration, auth, RLS, or business-line behavior changed.

Evidence: all 499 web unit tests, web lint, and web typecheck pass.

**In progress - Admin and Sub Admin dashboard UI overhaul, phase 2 of 9** on
`claude/20260827-admin-subadmin-ui-foundation` (direct user instruction; no
requirement or completion-percentage change): loan applications, property deals,
and vehicle arrangements rebuilt on the phase-1 primitives.

Three row-interaction models used to coexist across the admin queues, so whether
a row could be clicked was unanswerable by looking. Loan applications and
property deals expanded inline; vehicle arrangements had dead rows with side
buttons. All three now open a floating window, matching the queues that already
did. Loan applications and property deals use the full-screen workspace dialog
because their detail is a progress form plus submitted answers; vehicle
arrangements uses a centred panel that shows the arrangement read-only and
carries the transport form and cancel action, so the row is worth clicking even
when there is nothing to enter.

Each view moves from its own `max-w-5xl` wrapper and bare `<h1>` onto
`DashboardPage`/`DashboardHeader`/`DashboardPanel`, and from a `<ul>` of cards
onto `DataTable` with sortable columns. Filters move into the shared `FilterBar`,
which adds a business-line filter the records always carried but nothing exposed,
and vehicle arrangements gains sortable pickup ordering. Vehicle arrangements
was the one admin queue fetching inline in its component; the extracted
`use-admin-vehicle-arrangements` hook matches every sibling queue. Status pills
move onto `StatusBadge`, and the surfaced-but-unused `driver_mobile`,
`completed_at`, `cancelled_at` and `cancellation_reason` now appear in the detail
panel.

No API contract, migration, auth, RLS, or business-line behavior changed.

Evidence: all 499 web unit tests, web lint, and web typecheck pass. Loan
applications and property deals leave the form-surface registry because their
controls are now the shared filter bar; vehicle arrangements stays as a mutation
surface.

**In progress - Admin and Sub Admin dashboard UI overhaul, phase 1 of 9** on
`claude/20260827-admin-subadmin-ui-foundation` (direct user instruction; no
requirement or completion-percentage change). This phase is the shared
foundation the remaining eight are built on, plus the two app-wide affordance
corrections the user asked for.

Both staff home pages showed their approval queue two or three rows at a time.
That was never a data limit: each panel was pinned to a fixed height inside an
xl-only two-column row. Admin's "Waiting on you" and Sub Admin's "Waiting on
Admin" are the same queue seen from the two ends of one approval, so they now
share one full-width `PendingReviewTable` whose rows are clickable and carry how
long each item has waited, with Operational load promoted above it as a
four-across strip. `admin_home._PENDING_QUEUE_LIMIT` rises 12 to 30 and
`sub_admin._PENDING_APPROVAL_LIMIT` 10 to 30 to match the space now available;
the counts rendered beside the queue were always uncapped and are unchanged.

Eyebrows are removed application-wide. `DashboardHeader` and `DashboardFormPage`
(where the prop was required) no longer accept one, and all 17 call sites plus
the public `ProductPage` hero and `TrustStrip` drop it. The 404 status code and
the broadcast composer's Step 1/Step 2 labels are kept: they share the visual
shape but carry information rather than decorate.

Close (X) controls had drifted into five treatments — an opacity fade, a tinted
fill, an off-token `bg-blue-50`, a bordered pill, and one bare `<button>` with no
styling. `components/ui/close-button.ts` now owns the single treatment: pointer
cursor, no border, no background in any state, and the icon turning
`--color-brand-cta` on hover. Applying it in `dialog.tsx` and `sheet.tsx` covers
roughly 135 call sites; the remaining one-offs were converted individually.

New `features/dashboard` primitives: `DataTable` (the clickable-row table proven
on the telecaller leads list, with controlled sorting and an automatic trailing
chevron), `FilterBar` (promoted from the CMS's `CmsFilterBar`, the most complete
of five near-identical copies), `StatusBadge`, `ListEmptyState`/
`ListLoadingState`/`ListPagination`, `useFilteredPage`, and the workspace dialog
moved out of `features/sub-admin` now that Admin uses it too. A shim keeps the
ten Sub Admin call sites compiling until those surfaces are rebuilt in phase 9.
`lib/format.ts` gains the `formatDate` that six views each kept a private copy
of, plus `formatAge`.

No API contract, migration, auth, RLS, or business-line behavior changed.

Evidence: all 499 web unit tests, web lint, and web typecheck pass; the 18 admin
and sub-admin home API tests pass against a migrated Postgres and cover the
raised queue cap; API Ruff check and format pass. Browser verification is
deferred to the end of the sequence because the running compose stack serves the
main checkout rather than this worktree.

**Done - application-wide form validation consistency** on
`codex/20260826-231901-add-validation-for-all-form-fields-anywher`
([PR #241](https://github.com/brollysolutions/client1/pull/241); direct user
instruction; no requirement or completion-percentage change): all
113 non-primitive input-bearing web surfaces are now explicitly registered as
mutation, filter, calculator, or composite surfaces. The structural Vitest scan
covers standard/native fields plus command-search, searchable-select, slider,
switch, and toggle controls and fails when a future surface lacks a decision.

The implementation adds dependency-free typed text/email/E.164/numeric/date/
PII-free validators, one accessible `FieldError`/required indicator, bounded
filter normalization, first-invalid focus, and allowlisted FastAPI 422 field
issues. The API client caps and sanitizes locations/messages and deliberately
never carries Pydantic's rejected `input`; callers may map only named server
locations to local fields. Profile/registration, support, Admin provisioning,
banks, broadcasts, approvals/rejections, payout creation and manual cheque
actions, provider offers, mobile-change review, vehicle arrangements, employee/
telecaller outcomes, loan/property progress, Sub Admin CMS create/edit forms,
and public/dash filters now expose bounded input and accessible inline errors
instead of silent disabled-submit or toast-only failure. Existing strong auth,
agent application, property submission, uploads, and role workflows were
audited and retained rather than duplicated.

The dynamic Financial Product renderer mirrors the authoritative Pydantic
schema for form topology, canonical `requested_amount`, choice membership,
conditional order, text/array cardinality, PIN/mobile/currency/integer/date/DOB
rules, and travel date ordering. Shared payout-destination validation is reused
by generic, commission, referral, and cashback payout dialogs without changing
the strict rupee-to-paise conversion or idempotency-key lifecycle. Filters and
calculators cap text/numeric ranges and reject NaN without turning optional
exploration controls into required fields. Upload MIME/size/count checks remain
fail-closed on both existing client hooks and the server.

Fresh evidence: `pnpm lint` and `pnpm typecheck` pass; all 499 Vitest tests in
78 files pass, including 42 focused validation/API/payout/dynamic/coverage
tests. `pnpm build` compiled, typechecked, and generated 93/93 pages before the
repository's established Windows standalone packaging failure (`EPERM` while
creating `.next/standalone` symlinks). Against a local web server, two mocked
registration/profile/lead Playwright scenarios pass. Three public Financial
Services scenarios could not obtain catalogue data because the Docker-only
`api` hostname was unavailable; the first also encounters the pre-existing
strict-locator duplicate of the page heading. Those failures are environment/
baseline evidence, not changed-path validation regressions.

The repository wrapper passed seven feature-tracking tests, eleven migration/
RLS tests, API Ruff and format checks; `uv run alembic heads` reports the sole
`73f4c2a91d6e` head. The aggregate API suite reached 24% after a long stream of
service-dependent skips, then one existing coverage failure and cascading
fixture errors made it inconclusive. `uv run pytest -q --lf -x` isolates the
unchanged failure: `test_every_mapped_table_has_an_admin_coverage_decision`
reports `financial_product_provider_offers` missing from
`ADMIN_OPERATIONAL_COVERAGE`. No API file changed in this slice.

Security review found no new authorization or data boundary: no API, contract,
migration, auth, RLS, business-line, or dependency change; rejected values and
PII/KYC are not echoed; payout server gates/idempotency and upload validation
remain authoritative. Design/accessibility review fixed scoped error focus,
combobox required semantics, inline CMS edit errors, and invalid multiselect
ARIA; maintainer diff review found no remaining change-owned issue. The next
priority returns to the queued FR-2.2 approved-listing correction and seven
append-only audit-event families.

**Done - [PR #233](https://github.com/brollysolutions/client1/pull/233) - Real-estate
dashboard search-bar redesign: shared animated omnibox, Explore's "Browse by
property type" strip removed, Home's category pills become illustrated cards
(direct user-reported UI change; no requirement or completion-percentage
change):** follow-up to PR #232, filed once it was live in the browser. Three
requests, plus a fourth found mid-review: (1) remove Explore's "Browse by
property type" grid; (2) give Home's quick-search field a nicer, animated
design, reused identically everywhere the property search bar appears; (3)
replace Home's category pill buttons with illustrated cards; (4) the user
noticed Home's search showed no location/property suggestions while Explore's
did, and asked for that gap closed too as part of the same consistency ask.

A new `features/real-estate/search-field-chrome.tsx` is now the single visual/
animation source for every property search field: `SEARCH_FIELD_SHELL_CLASS`
(hover lift, a focus-triggered glow, and a `.search-field-shell` CSS class in
`globals.css` that sweeps a soft diagonal sheen across the field's own
`background-position` while it holds focus -- plain CSS because Tailwind has
no utility for animating that property), `SearchFieldIcon` (a tinted badge
that fills solid and pops on focus-within), and shared clear-button/Search-
button motion classes. Both `PropertySearchBar`'s omnibox (Explore, category
pages, Bookmarks) and Home's quick search now render through this one module
instead of each carrying its own container styling.

A new `features/real-estate/property-suggestions.tsx` extracts the
"what matches this query" derivation (`useSuggestionMatches`) and the grouped
Localities/Cities/PIN codes/Property types/Properties popover
(`SuggestionsList`) that previously lived only inside `PropertySearchBar`, so
`PropertySearchBar` itself is refactored to consume the shared module (no
behavior change there -- same matching, same limits, same groups) and Home's
quick search gains the identical popover for the first time. Home has no
filter state or results grid of its own, so picking a suggestion there hands
off straight to `/dashboard/explore?<facet>=<value>` (`locality=`, `city=`,
`pincode=`, `subtypes=`, or `q=`, matching the exact nuqs keys
`use-property-filters.ts` reads) instead of setting a local filter. This means
Home now calls `useProperties()` again -- solely to build the suggestion
index; `loading`/`error` are deliberately left unread, the same tradeoff
already established for `dashboard-property-detail.tsx`'s parallel catalog
fetch, so a slow or failing fetch only leaves suggestions empty and can never
gate or break Home's own personal-status content. Home still renders no
results grid, filters, or live category counts -- that richness stays on
Explore.

`RE_CATEGORIES` (`lib/real-estate.ts`) gained an `illustration` field, reusing
the existing purpose-drawn per-subtype mega-menu SVGs
(`public/illustrations/menu/properties/*.svg`, already used by
`components/navbars/properties-menu.ts`) rather than commissioning new art --
one representative subtype standing in for a category with more than one
(`gated_community_apartment` for Apartments, `unlocked_space` for Commercial).
Home's category section now renders `ExploreArtCard` (the illustration-led
card already established on the loans-line Explore hub) instead of pill
`<Link>`s, still with no live counts and no active/selected state (pure
navigation, matching the design PR #232 already set for this section).

`CategoryStrip` (Explore's "Browse by property type" grid, plus its test) is
deleted outright rather than left in place unused. Removing it with no
replacement would have silently reintroduced the exact defect PR #231 fixed:
`property-row.tsx` returned `null` for a category with zero listings, so
`houses`/`commercial` (0 active rows each against apartments' hundreds)
vanished from Explore with no trace -- `CategoryStrip` was the workaround that
kept them reachable from outside. Instead, `PropertyRow` itself now renders a
"No listings yet." state with a "Browse {category}" link for a zero-count
category, so every category stays reachable directly from Explore's own
per-category rows with no separate grid above them.
`features/dashboard/explore-line-switch.tsx`'s `RealEstateHub` passes each
category's `/dashboard/explore/{key}` href through for this.

`components/ui/input.tsx`'s `Input` gained explicit `ref` forwarding (React
19's ref-as-prop -- no `forwardRef` wrapper needed, this repo runs React
19.2.7) so Home's new clear button can refocus the field after clearing,
mirroring `PropertySearchBar`'s pre-existing `inputRef` pattern; no other
`Input` consumer passes a ref today, so this is purely additive.

Fresh evidence: `pnpm lint` and `pnpm typecheck` pass; all 447 web unit tests
across 70 files pass (up from 446/69 -- net of deleting `category-strip.tsx`'s
3-test file and adding `lib/real-estate.test.ts`, 2 tests guarding every
`RE_CATEGORIES` illustration file exists on disk, and
`features/real-estate/property-row.test.tsx`, 2 tests locking in the
zero-listing empty-state/reachability behavior). `pnpm build` compiled,
typechecked, and generated all 93 pages before the same pre-existing
Windows-host `EPERM` standalone-symlink failure recorded elsewhere in this
document.

Live browser verification via Playwright MCP against the restarted
`client1-web-1` container, logged in as the seeded demo Client account
("Charan Client"): Home's search field renders the new animated shell and
icon; typing a real seeded locality opens the same grouped suggestion popover
Explore's omnibox shows, and clicking the "Baner" locality suggestion
navigates straight to `/dashboard/explore?locality=Baner` with the "Baner"
filter chip and 5 matching properties already applied -- confirming the
hand-off, not just the visuals. Home's "Browse by property type" section
renders as illustrated `ExploreArtCard`s (Residential Houses, Apartments,
Villas, Plots and Land, Commercial), each linking into its category page.
`/dashboard/explore`'s idle state shows no "Browse by property type" heading
anywhere on the page; its two zero-count categories in the seeded data
(Residential Houses, Commercial) each render their own "No listings yet."
message with a working "Browse {category}" link, confirming reachability
survived the strip's removal. No console errors beyond the pre-existing,
unrelated `next/image` LCP-priority hint and MinIO image-proxy noise already
present before this change.

`pnpm exec playwright test e2e/dashboard-navigation.spec.ts -g "Client can
search locations manually across dashboard property surfaces"` passes (48.7s)
on a warm run. A first attempt, run immediately after a container restart,
failed on the default 5-second `toHaveURL` assertion timeout after clicking
Home's Search button; the saved failure screenshot showed `/dashboard/explore`
already fully rendered with "Wakad Gardens" and "1 property found" -- the
navigation had in fact completed, just slower than the assertion's default
timeout during a cold Turbopack compile of the newly-touched route tree, the
same class of flake already documented elsewhere in this ledger for this exact
spec. The warm re-run confirms this was a timing artifact, not a functional
regression. That spec's locator for Home's field is updated from
`getByRole("textbox", ...)` to `getByRole("combobox", ...)`, since cmdk's
`CommandInput` (now used by Home too, not only Explore) exposes combobox
semantics rather than a plain textbox role -- a locator fix, not a behavior
change. The broader role-scenario suite in the same file was not re-run in
full, to conserve the shared dev stack's per-IP OTP registration quota
(`OTP_RATE_LIMIT_PER_IP`) for future work; none of its other scenarios touch
real-estate Home or Explore. `design-review` was not separately invoked this
pass; the specific design intent behind this change (one consistent animated
search chrome, illustrated category cards, preserved zero-count reachability)
was instead verified directly against the live app as described above. No
API, contract, migration, or RLS surface changed.

**Done - [PR #232](https://github.com/brollysolutions/client1/pull/232) - Real-estate Home/Explore differentiation (direct
user-reported UI change; no requirement or completion-percentage change):**
Home and Explore rendered as near-identical UI for a real-estate client --
same catalog fetch, same search bar, same category-browsing idle state --
because neither page had ever been given a distinct job. PR #223 moved the
real-estate Explore hub "unchanged" when loans Explore was redesigned, and PR
#231 (below) redesigned Home in isolation; neither pass asked what each page
should uniquely do.

Fixed by mirroring the loans line, which already solves this correctly (Home =
personal application-status table, Explore = catalog discovery hub). Rebuilt
`RealEstateHome` (`apps/web/features/real-estate/real-estate-home.tsx`) as a
personal "my property journey" status view: `MetricCard` summaries for
bookmarks/enquiries/site-visits (real, already-RLS-scoped APIs that already
back their own full dashboard pages), a compact quick-search `<form>` that
hands off to `/dashboard/explore?q=...` (same nuqs `q` key Explore already
reads) rather than re-implementing its omnibox/filter engine, and lightweight
category quick-link pills with no live counts. Home no longer fetches the
property catalog at all. Home's former catalog-browsing content
(`CategoryStrip` + one `PropertyRow` carousel per category) moved onto
Explore's idle state (`RealEstateHub` in
`apps/web/features/dashboard/explore-line-switch.tsx`), replacing its
lower-fidelity local `CategoryTile` grid and single arbitrary "Featured
properties" row. Extracted `useEnquiries`/`useSiteVisits` hooks (mirroring
`use-properties.ts`'s shape) out of `enquiries-view.tsx`/`site-visits-view.tsx`
so Home and their existing full-page views share one fetch implementation,
with `useSiteVisits` exposing `setSiteVisits` so the existing cancel-visit
optimistic update keeps working with zero behavior change (JSX in both view
files is otherwise untouched).

Found and fixed a real bug during browser verification, not just a test gap:
`MetricCard` renders `value` inside a `<p>` (`dashboard-ui.tsx`), and the
shared `Skeleton` component renders a `<div>` -- nesting a block element
inside a paragraph is invalid HTML. It broke hydration and, less obviously,
silently broke the quick-search form's click handler entirely (confirmed via
Playwright MCP: React DOM-nesting console errors appeared, then the Search
button stopped triggering navigation on every attempt until fixed). Fixed
with an inline `<span>`-based skeleton local to `real-estate-home.tsx`
instead of reusing the shared block-level one.

Fresh evidence: `pnpm lint`, `pnpm typecheck`, and `pnpm test` (69 files, 446
tests, including new `use-site-visits.test.ts` covering the extracted
`nextUpcomingVisit` pure helper) all pass. Browser-verified end to end via
Playwright MCP against the live local stack after a `docker restart
client1-web-1`: `/dashboard` shows the personal status view with zero
bookmark/enquiry/site-visit counts and correct empty-state hints for a
freshly registered account, with no hydration errors; typing a locality into
the quick search and submitting lands on `/dashboard/explore?q=<value>` with
results already filtered by that query; `/dashboard/explore` independently
shows "Explore properties" with the category strip (live counts from real
seeded data) and per-category carousels, no console errors beyond
pre-existing, unrelated MinIO image-proxy 500s already present before this
change. The extended Playwright spec ("Client can search locations manually
across dashboard property surfaces", `e2e/dashboard-navigation.spec.ts`)
passes in isolation with a fresh OTP quota, covering this flow plus the PR
#231 subtype-facet filtering. The full spec's other failures in that same run
are the pre-existing `OTP_RATE_LIMIT_PER_IP=10` dev-environment exhaustion
already documented against PR #231 (registration itself fails before reaching
any page under test); one blocked test ("Client retains the redesigned Loans
and Real Estate workspaces") was inspected by hand and asserts nothing this
change touches. `pnpm build` was not re-run this pass -- no build-relevant
surface (routing, server components, config) was touched, and the pre-existing
Windows `output: "standalone"` symlink limitation is already documented
against PR #231 with no bearing on this diff. Untested at the unit level:
`use-enquiries.ts` (mechanical extraction, no new logic, same untested
precedent as `use-properties.ts`) and `RealEstateHome` itself (stateful,
context-dependent -- no `jsdom` dependency is installed in this repo to
support hook/DOM rendering tests, and adding one was judged out of scope for
a UI-focused change); both are covered by the e2e flow above instead. Ran
`design-review`: no blocking findings; two minor, deliberately-unfixed notes
(a CTA touch target that intentionally mirrors the existing `ApplyCta`
convention, and a section lacking a landmark `aria-label` while still having
a visible heading) recorded in the PR body.

**Done - [PR #231](https://github.com/brollysolutions/client1/pull/231) - Real-estate
client dashboard home rework (direct user-reported UI change; no requirement or
completion-percentage change):** the real-estate Client home now leads with
search instead of a promotional slot, filters follow the property taxonomy the
platform actually publishes, and every category stays discoverable.

Four defects were reported and confirmed against the running local stack before
any edit. First, the "Demo Real Estate workspace / Synthetic campaign for
checking property journeys / Explore properties" banner is not code: it is a
`seed_demo.py` row surfaced through the generic `PersonalizedPlacements` slot
that the loans Client home already dropped. Second, dashboard search and filters
knew only the five coarse `PropertyCategory` values, while the API, generated
contract, public nav, and per-category submit forms all carry nine
`PropertySubtype` values, and `mapProperty` already wrote `propertySubtype` onto
every `REListing` for the UI to ignore; per-category filtering was a single
`RESIDENTIAL_CATEGORIES` boolean. Third, `property-row.tsx` returns `null` for a
category with no listings, so `houses` and `commercial` (0 active rows each,
against apartments 288, villas 7, plots 1 in the local database) vanished from
the page with no trace. Fourth, `RECategory` was hand-declared in
`lib/real-estate.ts` and re-listed again in `use-property-filters.ts`, so a
backend category addition raised a compile error in `lib/properties.ts` but was
silent in both dashboard copies.

Implemented slice: the placement slot is removed from the real-estate Client
branch of `app/(app)/dashboard/page.tsx` (Agents keep theirs); `RECategory`,
`RESubtype`, `Furnishing`, and `ListingStatus` are now aliases of the generated
contract, and the nuqs parser tuples are built through an inference-based
`exhaustive<U>()` helper in `lib/property-facets.ts` that fails compilation and
names any contract value missing from a tuple; a `subtypes` facet runs through
`PropertyFilters`, `FACET_KEYS`, `filterListings`, the URL query state, the chip
row, and the omnibox; new `lib/property-facet-map.ts` replaces the residential
boolean with a per-category applicability map (plots drop bedrooms, furnishing,
and construction status; commercial drops only bedrooms; multi-select takes the
union) and withholds subtypes that are the sole subtype of their category, so no
two controls in one panel read "Villas" and return different counts; the filter
sheet is regrouped into an accordion whose collapsed triggers still summarise
what they constrain; the search field and its primary action are now one control
with a clear affordance, one-tap category pills, and accessible names on the
search input and sort trigger; and a new `category-strip.tsx` keeps all five
categories linked to Explore, marking empty ones "No listings yet".

Fresh evidence: `pnpm lint`, `pnpm typecheck`, and `pnpm test` (68 files, 442
tests) pass. The exhaustiveness guard was verified by deliberately deleting
`"commercial"` from `RE_CATEGORY_VALUES` and confirming
`tsc` reports the missing member by name, then restoring it. `pnpm build`
compiles and generates all 93 static pages; it then fails only in
`output: "standalone"` trace copying with Windows `EPERM` on `node_modules`
symlinks, an unchanged host limitation with no source involvement. Browser
behaviour was confirmed by the extended Playwright spec at a 390px viewport:
the demo banner is absent from `/dashboard`, the category strip renders the
zero-count categories, and selecting the "Gated community apartments" subtype
writes `subtypes=gated_community_apartment` to the URL and narrows two stubbed
apartments to one. No API, contract, or migration change, so `pytest`, `ruff`,
and `alembic heads` do not apply to this slice.

**Done - [PR #220](https://github.com/brollysolutions/client1/pull/220) -
Comprehensive local demo accounts and workflow data (developer experience; no
requirement or completion-percentage change):** one development-only,
idempotent command now provisions deterministic synthetic accounts for Admin,
Sub Admin, Client, Agent, Telecaller, and Employee workspaces, with both Loans
and Real Estate represented where the role is line-scoped. The dataset covers
lead assignment and history, loan applications, property authoring/review and
transactions, staff tasks, referral/commission/payout/cashback ledgers,
personalization content, support, notifications, audit examples, and three
managed-media paths. It preserves unrelated local rows and an established Main
Admin, refuses non-development environments, stops on identity collisions, and
does not call payment, email, voice, push, or other live providers.

Fresh evidence: `python -m app.scripts.seed_demo` against the live local
Postgres database, rerun for idempotency, and a third run with the new
`--verify` flag that logs into all 11 demo accounts over real HTTP, confirms
each JWT's role/business-line claims, and asserts each role's primary
dashboard API returns non-empty, RLS-scoped data — all 11 passed. All 14
focused `test_seed_helpers.py` cases pass; API Ruff and format pass across 471
files; Alembic reports the single head `73f4c2a91d6e`. Interactive Chromium
sessions (not just headless API calls) confirmed two representative roles end
to end against the local Next dev container: Admin reaches `/dashboard` and
renders "Admin overview" with the seeded pending-approvals queue and banner;
Client reaches `/dashboard` and renders the seeded Personal/Home loan rows,
the seeded offer, and the Loans/Real Estate workspace switcher. The remaining
9 roles were not opened in a browser in this pass — their login, role/line
claims, and RLS-scoped data are covered by the `--verify` run instead. The
full `cd apps/api && uv run pytest -q` regression gate was started and ran to
past 30 minutes without a final report on this Windows host's Docker
container, consistent with the full-suite host timeouts already recorded
elsewhere in this table; it is inconclusive rather than passing or failing,
and no other change in this PR touches an existing production code path — it
adds two new development-only scripts and one new test file. No API contract,
migration, authorization, RLS policy, dependency, or production bootstrap
behavior changed. Completion coverage remains **99.4%**; next priority returns
to FR-2.2 controlled correction/audit.

**Done — [PR #217](https://github.com/brollysolutions/client1/pull/217) —
Homepage information-flow refinement (public UI; no requirement or
completion-percentage change):** the Home page again presents
the established Loans band, followed by the Properties band and then the four
fixed calculators. The calculator band no longer has the planning-tools
eyebrow and now uses the shared cream `bg-background` outer surface; its white
calculator cards and all calculator links remain unchanged. The removed
homepage featured-services grid does not alter the Admin-published `/loans`
catalogue, service detail pages, provider offers, internal application/enquiry
paths, API, contracts, authorization, RLS, or business-line behavior.

Fresh evidence: the focused characterization test failed before the change and
then passed; web lint, strict typecheck, and all 383 web unit tests pass. The
focused 390px Playwright homepage journey passes after refreshing the local web
container, and 390px/1440px Chromium screenshots plus design review found no
actionable accessibility, responsive-layout, interaction, motion, or visual
system issue. `pnpm build` exceeded its 180-second host limit without a final
report, so it is inconclusive rather than passing. Completion coverage remains
**99.4%**; next priority returns to FR-2.2 controlled correction/audit.

**Done — [PR #211](https://github.com/brollysolutions/client1/pull/211) —
CS-014 configurable Financial Products and product-specific
Client forms:** the Admin catalogue is now the authenticated Client catalogue
source. Admin can create, rename, order, activate/deactivate, and publish typed,
allowlisted product forms; each form edit increments its version. Clients see
the published order without a deployment, registered name/mobile remain
server-sourced, submissions are validated against the exact version, and the
record retains an immutable schema snapshot. Loans/funding preserve the loan
lifecycle and one-active-loan invariant, while Credit Cards and Insurance use
separate immutable enquiries with no sanction/disbursal fields. Dynamic answer
PII is RLS-protected, served with no-store headers, and scrubbed on account
deletion. Intake has no inline KYC/document uploads. Lender records and
product availability remain exclusively Admin-managed; this feature seeds no
lender or availability row.

Fresh evidence: migration upgrade→downgrade→upgrade passes with one head
`f6a7b8c9d0e1`, while lender/availability row counts remain unchanged. API
Ruff and format pass across 463 files. Final focused database evidence is 47
financial-product/Admin-config tests plus 15 exhaustive Admin-coverage,
business-line-classification, and platform-RLS contracts. Web lint, strict
typecheck, and all 359 unit tests pass. The authenticated Playwright journey
submits a product-specific loan and reaches its saved answer summary without
an Aadhaar/PAN upload step. The production build compiles, typechecks, and
generates all 93 pages before the known Windows standalone-symlink `EPERM`.
The full isolated API suite completed 1,741 tests in 62m51s: 1,724 passed and
17 failed. Four feature-owned exhaustive-ledger failures were corrected and
rerun green; the remaining 13 are unrelated baseline/shared-state defects in
property fixtures, banner seed assumptions, payout/mobile/assignment state,
and one test deleting the isolated database. The exact repository wrapper was
attempted for ten minutes but did not finish its same monolithic API phase.
Security, responsive design, and maintainer review found no remaining
actionable feature defect. Completion coverage remains **99.4%**; next priority
returns to the FR-2.2 controlled-correction and remaining audit-family follow-up.

**Delivery:** [PR #194](https://github.com/brollysolutions/client1/pull/194). Next priority remains the FR-2.2 controlled-correction and remaining audit-family follow-up.

**Final banner acceptance update (2026-08-18; supersedes the residual-risk sentence in the banner record below):** all three anonymous placements are capped server-side at seven slides and use the shared five-second automatic horizontal carousel with manual arrows, dots, pause behavior, focus/hover pausing, and reduced-motion handling. Financial Services and Properties render at the top of their pages in a shorter 5:2 format; their 1440x576 artwork keeps the left copy area calm and advertises the applicable finance or property category, while Homepage retains its existing hero proportions. Live desktop and 390px mobile browser review verified fit, blend, interaction, and responsive copy without relevant console errors; review records were removed afterward. Anonymous serving and scheduled activation now fail closed for linked Offers with non-empty audience rules. The final focused API/RLS/scheduler/coverage gate passes 106 tests. The monolithic API suite completed with 1,683 passes and eight failures on the long-lived shared stack; the one feature-owned policy-ledger failure is fixed and green in the final focused gate, while the other seven are unrelated pre-existing shared-state failures. Web lint, strict typecheck, and all 376 unit tests pass; compilation, typechecking, and generation of all 93 pages complete before the known Windows standalone symlink `EPERM` packaging failure. Security, design, and diff review found no remaining actionable banner defect.

**Done on `claude/20260817-183438-scheduler-1-info-apscheduler-executors-def` — template-governed public banner campaigns:** the existing Sub Admin banner lifecycle and Admin approval gate now extend into fixed Homepage, Financial Services, and Properties placements. Migration `ee56ff78aa90` adds the `banner_placement` enum, a `banner_templates` catalogue seeded with 29 deterministic `uuid5` rows pointing at reviewed, text-free artwork committed under `apps/web/public/banner-templates/`, five additive `banners` columns, immutability triggers on both published template versions and campaign identity, a partial unique index enforcing one live campaign per placement/category, and a Sub Admin draft-only `banners_delete` grant plus policy. Existing banners backfill to `homepage`, and `personalized` rows to the internal `dashboard` placement, so authenticated personalization behavior is preserved exactly. **FR-12.3's Admin approval gate is unchanged** — Sub Admin still authors and submits; only Admin approves. The anonymous `GET /api/v1/public/banners` gains `?placement=` typed as a narrow three-value literal rather than the raw enum, so the internal `dashboard` placement cannot be served anonymously; verified live (no param → 200, `?placement=bogus` and `?placement=dashboard` → 422). Nine new `audit_action` values give banners a complete append-only trail across router, service, and scheduler transitions, closing one of the seven audit-family gaps tracked under FR-2.2 (now six). `banner_templates` is declared in both the business-line classification ledger (`PLATFORM_CONFIG`, line-neutral shared asset) and the Admin operational coverage registry. Requirement completion is unchanged at 78/79: this extends already-Complete FR-12.x placements rather than closing an open requirement. Fresh evidence: 55 focused banner API/RLS/catalog tests, 39 personalization/scheduler/purge/route-authorization/RLS-coverage tests, and 18 classification/database/Admin-coverage contract tests pass; Ruff check and format pass across 452 API files; one Alembic head, applied to the running stack; regenerated contracts show no drift; web lint, strict typecheck, and all 376 unit tests pass; the build generates all 93 pages before the known Windows standalone `EPERM`. Residual risks: the monolithic API suite was not run, and with no web dev server running and no live approved banner seeded, the rendered public appearance of a template campaign and the `design-review` pass are **unverified**.

**Done on `claude/20260817-125827-which-skill-to-use-to-design-frontend` — Financial Services navbar mega-menu (public UI, not FR-numbered):** the public navbar's "Financial Services" item was a plain link to `/loans`, a page that had grown to 16 consumer-finance products (11 loan types, 4 insurance types, credit cards) with no way to browse them from the navbar itself. This reverses the "dropdown children removed, dedicated pages only" decision from commit `45d9573`; see `.agent-workflow/DECISIONS.md` DEC-20260817-01. A same-branch follow-up (DEC-20260817-02) then applied direct user feedback: the mega-menu's desktop layout is now 2 columns — Loans alone, and Insurance + Credit Cards stacked as two headed sections in one column, replacing an earlier single-item "highlight tile" design for Credit Cards that read as a rendering bug; and `/loans`'s "Why people trust us" content moved from a standalone strip below the whole grid into a wide `ProductBand.trust` tile that sits beside the Credit Cards card, spanning that row's remaining columns. The public `/contact` form's topic selector now reads "Financial Services" instead of "Loans" (display label only; the underlying `LeadTopic`/`business_line` wire value is unchanged at `"loans"`). `lib/products.ts`'s `LOAN_PRODUCTS` grew 7 → 16, each with a `group`/`navLabel`; `/loans` renders them as two labeled bands (`LOAN_PRODUCT_BANDS`) instead of one flat grid, with 9 newly authored SVG illustrations so every card keeps the illustrated band. `property-loan` was retired as a product id and split into `home-loan` (which carries `legacyAnchorId: "property-loan"` so old links still resolve) and `loan-against-property`; `footer-links.ts` was updated to match. `components/ui/navigation-menu.tsx`'s viewport wrapper was recentered so the mega-panel does not clip off-screen at the 1024px `lg` breakpoint. No route, API, contract, migration, or RLS change; requirement completion is unaffected (this is public marketing UI, not an SRS-tracked requirement). Fresh evidence: `pnpm lint`, `pnpm typecheck`, and `pnpm test` (368/368, including new `lib/products.test.ts` and `components/navbars/financial-services-menu.test.ts`, updated `nav-items.test.ts`/`footer-links.test.ts`) pass; `pnpm build` compiles, typechecks, and statically generates all 93 pages before the known pre-existing Windows standalone `EPERM` symlink failure. No browser automation tool was connected this session, so the interactive manual pass (panel layout/clipping at 1024/1280/1440px, keyboard walk, focus return, reduced motion, mobile drawer) is unverified — flagged as a residual risk for follow-up.

**Done — [PR #187](https://github.com/brollysolutions/client1/pull/187) — security-audit remediation:** password recovery now treats suspended/deleted identities like unknown accounts for delivery and refuses a reset-token mutation while holding the user-row lock; password reset and authenticated password change increment `session_version` and revoke refresh tokens atomically. Browser push subscriptions accept only configured HTTPS provider hosts, unsafe legacy rows are pruned without a request, redirects are disabled, and delivery is bounded to ten seconds. Employee task documents now use storage-signed 5 MiB multipart policies, an hourly per-account budget, a single-use owner/task/type-bound confirmation claim, bounded canonical bytes that cannot be replaced through the staging signature, row-locked 12-document quotas, and private no-store responses. Generated contracts and the web multipart client are current; authorization, own-task RLS, private downloads, forced-reset activation, and requirement completion remain unchanged. Fresh evidence: 128 focused API tests and final 39-, 18-, and 1-test security reruns pass; Ruff and formatting pass across 447 API files; Alembic has one head; web lint, strict typecheck, and all 338 tests pass. The production build compiles, typechecks, and generates all 93 pages before the known Windows standalone `EPERM`; host-side public fetches cannot resolve Docker-only `api`. The monolithic API suite reached its 30-minute bound without a final report and is inconclusive. Security review additionally closed confirmation-budget bypass and post-confirm object replacement; no reachable finding remains in this remediation slice.

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

The **FR-2.2 Admin operational coverage audit** has an exhaustive, test-enforced
baseline across the mapped tables and all current platform-scope RLS policies.
The original visibility-remediation slice closed its eight confirmed read gaps,
and the controlled-correction slice closed one typed approved-listing correction
plus seven append-only audit-event families. Read-only platform-Admin oversight
now closes the newer `field_visibility_config` registry gap. FR-2.2 remains
Partial until `financial_service_enquiries` has an explicit safe Admin surface.
Payout controls,
private-document access, secret/location minimization, immutable ledgers, and
business-line segregation remain non-negotiable compatibility constraints.

## Delivered implementation

- **Admin field-visibility oversight** (FR-2.2) is delivered locally in
  [PR TBD](https://github.com/brollysolutions/client1/pulls). The existing
  Operational records workspace gains a paginated Field visibility tab backed
  by a generated-contract, `private, no-store` projection of role/entity/field/
  mode/update-time metadata. Updater identity and all customer/contact values
  are omitted. Platform-Admin dependencies and request-scoped RLS remain the
  access boundary; negative roles are tested. No mutation route, migration,
  default-policy change, or Agent/Telecaller/Employee projection changed.
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
  retain an expand/collapse rail (later changed to always start collapsed per
  session, dropping the remembered preference, by the loans-client home
  decluttering follow-up below) and every role retains the
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
  save optional email, gender, income, occupation, and location. The same
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
| Media/uploads (FR-13.x) | 4 | 0 | 0 | Purpose-bound property image/PDF/panorama and Loans image/PDF/MP4 flows plus assigned-Employee visit feedback enforce scanning, sanitization/transcoding, private/public state, quotas, immutable snapshots, RLS, retention, deletion, and orphan cleanup. |
| Support (FR-14.x) | 4 | 0 | 0 | Central tickets, WhatsApp route, Admin triage/resolution, and structured mobile-change fulfilment exist. |
| Contact privacy (FR-15.x) | 4 | 0 | 0 | Agent-owned and Telecaller-assigned mobile access is locked; Employee raw/deny/provider-neutral invitation modes and least-data projection are enforced server-side. |
| Analytics (FR-16.x) | 3 | 0 | 0 | **Complete** in [PR #156](https://github.com/brollysolutions/client1/pull/156): Linux PostgreSQL/Redis verification passed 30 reporting service/API/RLS tests with one Alembic head; web lint, strict typecheck, 294 unit tests, and the 92-page production build passed. |
| Profile/account (FR-17.x) | 4 | 0 | 0 | Profile/settings, optional demographic/income/location details, transactions/support, deletion, retention, and Admin removal exist. |
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
  transaction entry, documents, and processing-fee cashback. Compare Loan
  Offers (`/dashboard/loan-offers`) was redesigned to resolve real,
  Admin-published provider-offer data (interest rate, tenure, amount,
  processing fee, eligibility) instead of the thin `loan_types`/`banks`
  reference tables it previously read — sourced from the same anonymous
  public financial-products catalogue Explore's product page already used
  (`apps/web/lib/financial-catalog.ts`), via a new client-safe twin
  (`apps/web/lib/financial-catalog-client.ts`) since the page must run
  client-side to react to its localStorage shortlist
  (`apps/web/features/loans/loan-offers-store.tsx`, now keyed on
  `{offerId, productSlug}` rather than bank id). Offers are added to the
  shortlist from a new checkbox on Explore's lender-offer cards
  (`apps/web/features/loans/add-to-compare-button.tsx`, loan-category
  products only), resolved fresh against the catalogue and rendered as a
  side-by-side comparison table
  (`apps/web/features/loans/loan-offers-view.tsx`) mirroring the real-estate
  Bookmarks/Compare pattern. The prior placeholder metric grid (loan-type/bank
  counts inflated by unbounded dev-DB seed data) was removed. Fresh evidence
  ([PR #228](https://github.com/brollysolutions/client1/pull/228)): `pnpm
  lint`, `pnpm typecheck`, and all 421 web unit tests across 66 files pass,
  including 5 new tests for the extracted `resolveShortlistedOffers` pure
  function; `pnpm build` compiles, typechecks, and generates all 93 pages
  before the same pre-existing Windows-host `EPERM` standalone-symlink
  failure recorded elsewhere in this table, confirmed pre-existing here via a
  stash-and-rebuild check; the feature-tracking co-change guard passes. Live
  verification via Playwright MCP against the restarted `client1-web-1`
  container and the seeded demo Client account confirmed the real flow end
  to end: adding a real offer to compare from an Explore product page, the
  Compare page rendering the correct provider/interest-rate/tenure/amount/
  processing-fee/last-verified data and Apply link, removing the offer, and
  the empty state — zero console errors throughout. `pnpm test:e2e --
  dashboard-navigation.spec.ts` ran against the same container (2 passed, 10
  failed in 11.4m); every failure traces to the shared dev stack's
  already-exhausted `OTP_RATE_LIMIT_PER_IP` blocking the shared
  `registerClient`/`logIn` helper before reaching any changed code, the same
  pre-existing infrastructure limitation recorded against PR #223/#225/#226,
  not a regression from this change.
- Real-estate core: FR-7.1 through FR-7.5. Evidence includes dedicated
  site-visit vehicle arrangements with Client request/read, Admin fulfilment,
  direct Employee assignment, audit/notifications, and owner/assignee RLS;
  managed Client/Agent/Sub Admin property submission, Admin-only review,
  private/public
  media lifecycle, property deals, site visits, employee tasks/documents,
  client progress surfaces, and the absence of any property-payment collection
  path. `GET /api/v1/properties` (`apps/api/app/api/v1/properties.py`) is
  hardened against legacy `structured_details` rows that predate a
  since-tightened field requirement (e.g. `project_residence` rows missing
  the now-required `amenities_description`): one such dev-DB row was
  raising an unhandled `pydantic.ValidationError` on every list/detail
  request, 500ing the whole authenticated catalog for every Client/Agent/
  staff user. `_property_data` mirrors `app/api/v1/public_catalog.py`'s
  pre-existing `_public_property_data` fix for the anonymous catalog:
  validate `structured_details` separately and fall back to `null` with a
  logged warning rather than failing the whole row. Covered by a new
  regression test, `test_malformed_legacy_details_do_not_break_dashboard_catalog`
  in `test_properties_api.py`.
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
  occupation/location details; transaction and support surfaces;
  password-confirmed self-deletion; Admin deletion; immediate profile-PII scrub;
  de-linking; and seven-year retention purge behavior.
- Media controls: FR-13.1 through FR-13.4. Evidence includes a managed Real
  Estate image/PDF/panorama lifecycle and workflow-bound Loans image/PDF/MP4
  galleries; assigned-
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
| FR-2.2 | Partial | Admin dashboards cover users, leads, tasks, agents, loans, deals, payouts, content, audit, reports, and a paginated Operational records workspace. The exhaustive contract classifies every mapped table and current platform-scope policy. The original eight view gaps are closed with minimized generated contracts, soft-deleted contact redaction, per-line Client profile context, `private, no-store`, accessible UI, and platform-Admin/negative-role PostgreSQL evidence. A new read-only Field visibility tab safely projects persisted `field_visibility_config` policy metadata without updater or customer data. The approved-property correction is a typed, platform-Admin-only, reason-required staged command that preserves the live listing and approved media until re-review. All seven named operational mutation families have append-only, same-transaction, value-minimized audit coverage: `banners`, `content_blocks`, `loan_applications`, `offers`, `property_deals`, `referral_bonus_config`, and `tasks`. | Add safe read-only Admin visibility for the remaining `financial_service_enquiries` registry gap. Preserve protected secrets/location/media, immutable ledgers, command-bound updates, RLS, and safe audit details. |
| FR-2.8 | Complete | Lead name and journey notes carry immutable creator descriptors; Agent and Client edits follow explicit lifecycle cutoffs, Admin corrections preserve ownership and require an audited reason, and Telecaller notes remain append-only activities. Service checks, row locks, command-specific RLS, and a database trigger deny cross-owner, cross-role, cross-line, lifecycle, allowed-column, and descriptor-planting bypasses. | Preserve the ownership initializer/backfill, least-data no-store response, audit-value minimization, and direct SQL denial tests when adding future editable lead-detail paths. |
| FR-4.2 | Complete | Agent-introduced leads are atomically attributed and assigned through a durable, active-only same-line round-robin cursor, queued for bounded retry without capacity, and bound to a same-mobile Client only after OTP-proven registration. | Preserve global Agent ownership, expiry deadlines, generic-link authority boundaries, stable Telecaller order, cursor isolation, and concurrency tests as the workflow evolves. |
| FR-4.3 | Complete | Registration captures explicit one/both-line intent while retaining both Client profiles; each requested journey is independently bound and assigned through its line's separate round-robin cursor without cross-line leakage. | Preserve explicit intent, per-line uniqueness, deterministic assignment ordering, and account-deletion closure. |
| FR-10.3 | Complete | Cashback, referral bonuses, and commissions support UPI VPA and bank transfer through an explicit RazorpayX provider adapter plus an audited manual-cheque lifecycle. Cheque approval does not credit the ledger; issue, clearance, failure, duplicate/concurrent settlement, and compensating reversal are server-controlled, masked, and covered by migrated database tests. | Preserve provider scoping, Admin authorization, caps, raw-destination minimization, row-lock/CAS idempotency, account-deletion retention, and the no-card/no-failover boundary when adding future providers. |
| FR-11.2 | Complete | Every notification producer, Admin broadcast, web push, public banner CTA, and transactional email action uses a same-origin relevant route; verified active email addresses can receive best-effort transactional copies when enabled. | Maintain the producer inventory as future events are added; no marketing or unverified-email delivery is implied. |
| FR-12.1 | Complete | Authenticated Client/Agent dashboards receive one eligible banner per default, personalized, and action layer through a closed, versioned, fail-closed audience grammar. | Maintain schema/version and negative-rule tests when new dimensions are proposed. |
| FR-12.2 | Complete | The server proves Client line ownership, forces Agents to their active profile line, ranks exact-line/`both` content deterministically, and keeps Agents off customer offers. | Preserve server-side line proof and role separation for future placements. |
| FR-12.3 | Complete | Sub Admin authoring and Admin banner approval validate the closed grammar; only eligible consented users receive personalized rows, with public and cross-role negatives. | Keep approval and anonymous allowlist tests alongside future CMS changes. |
| FR-12.4 | Complete | Existing workflow facts and optional coarse location drive auditable, consented banner/offer placement without clickstream or inferred demographics. | Treat any new signal source as a separately approved privacy/security change. |
| FR-13.1 | Complete | Real Estate has private review/approved public image and panorama media; Loans has a private per-application image/PDF/MP4 gallery with processing and review state. | Preserve purpose-specific publication and keep Loans media private when future gallery work is proposed. |
| FR-13.2 | Complete | Agent KYC, loan/task documents, banners, property submissions, and assigned-Employee property-visit feedback have managed upload flows with applicable browser capture. | Require a separately approved purpose, audience, and retention policy for any new attachment surface. |
| FR-13.3 | Complete | Managed property, Loans, and feedback media enforce size/type/signature limits, fail-closed malware scanning, image metadata normalization, panorama geometry checks, and bounded Loans H.264/AAC transcoding before access/publication. | Preserve fail-closed production scanning and re-review codec/geometry/limit policy before accepting new formats. |
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
