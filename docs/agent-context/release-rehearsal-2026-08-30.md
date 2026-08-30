# Frozen-release rehearsal — 30 August 2026

Status: **NO-GO**

Frozen candidate: `3cc6bc07d98554b32924423e2f535b54fb21bb72`
([merged PR #267](https://github.com/brollysolutions/client1/pull/267))

Rehearsal branch: `chore/frozen-release-rehearsal`
([PR #268](https://github.com/brollysolutions/client1/pull/268))

This record reports what was actually exercised. It is not production approval,
does not check any human-owned box in
[`pre-deployment-checklist.md`](pre-deployment-checklist.md), and contains no
production secret, customer data, database dump, or object.

## Decision summary

The candidate is not ready to launch. The rehearsal corrected four concrete
release defects, but the following release blockers remain:

1. GitHub-hosted CI, Security, and main-to-production sync did not start because
   the repository account reported a failed payment or exhausted spending
   limit. All affected jobs have zero executed steps.
2. The rebuilt API image has 138 high and 7 critical OS findings (46 unique
   advisories) with no fixed Debian versions reported by Trivy. Much of the
   count is duplicated across FFmpeg libraries. Uploaded video reaches
   `ffprobe`/`ffmpeg` after size, MIME, and malware checks, so parser/codec risk
   cannot be dismissed as unreachable without advisory-by-advisory review or
   stronger media-process isolation.
3. The directly referenced production service images are not release-clean.
   Current publisher pulls still report high/critical findings, and the
   pgBouncer tag uses an end-of-life Alpine base. Compose uses mutable tags
   rather than reviewed immutable digests.
4. The fresh full API suite stopped at 64% when Docker Desktop's Linux engine
   began returning HTTP 500. The isolated production-mode stack, CORS probe,
   role journeys, upload/webhook runtime smoke, and timed restore could not
   complete after that engine failure. A skipped or interrupted gate is not a
   pass.
5. Real DNS/TLS/HSTS edge behavior, production secret-manager controls,
   encrypted database/object backup and restore, monitoring/alert delivery, and
   incident ownership have no environment evidence in this checkout.
6. Trademark, legal-entity, Terms, privacy/data-inventory, and processor
   decisions still require named qualified human sign-off.

The release remains **NO-GO** unless each blocker is removed or the accountable
owner records a specific, time-bounded risk acceptance allowed by the launch
checklist.

### Local cleanup pending

Docker's failed engine also prevented final inspection/removal of the explicitly
named synthetic rehearsal resources. After Docker Desktop is restarted by its
operator, inspect and remove only `client1-rehearsal-api`,
`client1-rehearsal-postgres`, `client1-rehearsal-redis`,
`client1-rehearsal-clamav`, network `client1-rehearsal-net`, their attached
anonymous volumes, and named scanner-cache volume
`client1-rehearsal-trivy-cache`. Some resources may not have been created before
the failure. They contain synthetic rehearsal configuration/data only; no
production source was accessed.

## Defects corrected during the rehearsal

- The Security workflow previously resolved the newest dependency versions from
  `pyproject.toml`, so it did not audit the shipped `uv.lock`. It now exports the
  frozen production lock and invokes the documented `pip-audit` version.
- The frozen lock contained five reported vulnerabilities across
  `cryptography==49.0.0` and `pyasn1==0.6.3`. The lock now carries
  `cryptography==50.0.1` and `pyasn1==0.6.4`; the final frozen audit reports no
  known vulnerability and the existing `PYSEC-2026-1325` exception only.
- The production API image created `/app/.venv` but Compose invoked `uv run` as a
  no-home `app` user. That failed before Uvicorn with a write attempt under
  `/nonexistent/.cache/uv`. The image now exposes `/app/.venv/bin` and API and
  scheduler start their locked executables directly. The rebuilt artifact runs
  as uid 100 and resolves both `python` and `uvicorn` from `/app/.venv/bin`.
- The original web runtime inherited 11 high/critical findings from unused npm
  and Corepack code plus two fixable Alpine OpenSSL findings. The production
  stage now applies Alpine updates and removes package managers that the
  standalone Node server does not use. The rebuilt artifact runs as uid 100 and
  scans with zero high or critical findings.
- Full-history Gitleaks found two non-secret historical prose/default-key false
  positives. `.gitleaks.toml` scopes each exception by rule, exact introducing
  commit, exact path, and exact non-secret line shape. The 492-commit scan then
  found zero leaks, while a synthetic canary was still detected.
- Four production-runtime contract tests protect the frozen dependency audit,
  API virtualenv/Compose command, and web-runtime hardening behavior in the
  normal repository gate.

## Verification ledger

| Gate | Result | Fresh evidence |
| --- | --- | --- |
| Frozen candidate | Pass | `HEAD` and `upstream/main` were `3cc6bc0` when the task branch was created. |
| Hosted CI | **Blocked** | [CI run 33291231409](https://github.com/brollysolutions/client1/actions/runs/33291231409), [Security run 33291231410](https://github.com/brollysolutions/client1/actions/runs/33291231410), and [sync run 33291231422](https://github.com/brollysolutions/client1/actions/runs/33291231422) report the account payment/spending-limit condition; no job steps ran. |
| Full repository gate | **Inconclusive** | `./scripts/verify.sh --ci` could not complete because its Docker-backed API run lost the Docker engine. Host-side tracking/runtime gates and the web gates below were run separately. |
| API style | Pass | Ruff and format check all 502 API files. |
| API aggregate | **Inconclusive** | Fresh Docker-backed run reached 64% and showed the known failure pattern before the engine HTTP 500; it has no final total. PR #267's 1,881 pass / 15 unrelated fail / 2 skip total is prior evidence, not substituted for this rehearsal. |
| Alembic/tracking | Pass | Exactly one head (`d9f1a3b5c7e0`); 7 feature-tracking, 11 migration/RLS, and 4 production-runtime tests pass. |
| Contract drift | Pass | Fresh OpenAPI/client regeneration produced no tracked contract diff. |
| Web checks | Pass | `pnpm install --frozen-lockfile`, lint, strict typecheck, and 91 files / 602 tests pass. |
| Web production build | Pass | Strict Linux image build compiled, typechecked, generated 94/94 routes, copied standalone output, and exported the image. Native Windows build reached the same 94/94 generation before the established standalone-symlink `EPERM`. |
| Secrets | Pass | Gitleaks 8.30.1 scanned all 492 commits with zero findings after the two narrow false-positive entries; a synthetic canary produced the expected non-zero detection. |
| Node dependencies | Pass | `pnpm audit --prod --audit-level high`: no known high/critical vulnerability. |
| Python dependencies | Pass with documented exception | Frozen-lock `pip-audit==2.10.1`: no known vulnerability, one ignored `PYSEC-2026-1325` exception already documented in the Security workflow. |
| Web artifact headers | Pass locally | `/`, `/login`, `/privacy`, and the unauthenticated `/dashboard` redirect carry CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: strict-origin-when-cross-origin`; `/dashboard` returns 307 to the encoded login return path. |
| API production health/CORS | **Inconclusive** | Isolated cold start was initiated with synthetic-only production settings, but Docker failed before migration/runtime evidence completed. Source configuration restricts origins but still allows all CORS methods and headers, so the checklist's exact-method/header criterion is not met. |
| Auth, roles, uploads, webhooks/payout | **Inconclusive** | Existing automated coverage was part of the interrupted aggregate. No complete production-artifact role/upload/webhook journey was obtained after the engine failure. |
| Backup/restore | **Blocked** | The planned synthetic `pg_dump`/isolated `pg_restore` timing could not run after the engine failure. No production database or object-backup provider evidence was available or accessed. |
| DNS/TLS/HSTS, monitoring, alerts | **Blocked** | These require the real edge and operator systems; neither is represented by source code or the local artifact. |

## Container and SBOM evidence

Scans used Trivy 0.74.0 with a freshly downloaded database and
`HIGH,CRITICAL` severity. App artifacts also have CycloneDX inventories. Counts
are finding rows because one advisory may appear in several installed packages;
the unique-advisory column makes that duplication visible.

| Artifact | High | Critical | Unique advisories | Fix reported | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Rebuilt web | 0 | 0 | 0 | 0 | Pass; 46-component CycloneDX inventory |
| Rebuilt API | 138 | 7 | 46 | 0 | **Block**; 394-component CycloneDX inventory and media-parser exposure require owned triage |
| `postgres:18` after current pull | 59 | 14 | 38 | 25 | **Block**; current mutable tag still includes fixable findings |
| `redis:8-alpine` after current pull | 2 | 0 | 1 | 2 | **Block**; OpenSSL update available |
| `clamav/clamav:1.4` after current pull | 2 | 0 | 1 | 2 | **Block**; OpenSSL update available |
| `edoburu/pgbouncer:v1.23.1-p3` | 47 | 2 | 25 | 49 | **Block**; publisher tag is current but its Alpine 3.20 base is EOL |
| `nginx:1.27-alpine` | 33 | 2 | 27 | 35 | **Block**; publisher tag is current but reported fixes are available |

## Follow-up: production service image remediation

Status: **SOURCE CONTRACT PASS; EXACT-ARTIFACT REVIEW, DEPLOYMENT, AND RELEASE REMAIN NO-GO**

Follow-up baseline: `87a0dbe`, refreshed through merged PR #271 at `539a074` on
`security/runtime-image-pinning` and delivered in
[PR #272](https://github.com/brollysolutions/client1/pull/272). This addendum
does not rewrite the frozen-candidate evidence above. It records all six direct
production service images now present at that integrated baseline.

The release build file now uses the same established publishers with explicit
patch versions and upstream multi-architecture manifest digests. Small Alpine
wrappers install only exact fixed package versions. The prior PgBouncer image's
Alpine 3.20 base passed its 1 April 2026 end-of-support date; the replacement
uses Alpine 3.23, supported through 1 November 2027. The selected Alpine 3.24
bases are supported through 1 June 2028. ClamAV remains on its 1.4 LTS feature
line, and nginx moves to the security-fixed 1.30.4 stable release.

Production Compose does not consume a local build tag. Each of the six service
references contains a fixed human-readable release tag and requires a
64-character final registry-manifest hash; omission fails Compose
interpolation. The exact local outputs below have not been published because
this task has no approved
registry namespace or package-write authority. Their local OCI index IDs are
therefore evidence only, not substituted for deployable registry digests. The
release stays NO-GO until an operator publishes the exact reviewed artifacts,
records those hashes, and reruns the scan against the pulled registry refs.

The five service-remediation scans used the digest-pinned Trivy 0.74.0 image
with database version 2 updated at `2026-08-30T01:19:05Z` and downloaded at
`2026-08-30T06:20:52Z`. Their base counts show why digest pinning alone was
insufficient; every reported base row had a publisher fix. Their final scans
used `--exit-code 1 --severity HIGH,CRITICAL`. The media row carries forward
merged PR #271's exact Trivy 0.74.0 artifact evidence; that source record did
not separately retain a base-image count.

| Service | Reviewed version/base | Base high / critical / fixable rows | Exact local OCI index ID | Final high / critical | CycloneDX components | SBOM SHA-256 |
| --- | --- | ---: | --- | ---: | ---: | --- |
| PostgreSQL | `18.6-alpine3.24` | 23 / 1 / 24 | `cdbc6c84e6a6eef0b2738079278cdf2461b011470625339dc4914b028055fc61` | 0 / 0 | 54 | `eaf40a44264c650fe9484df27ea1446277bbfa8998d9d4f43679a27edf84cfc4` |
| Redis | `8.10.1-alpine3.23` | 2 / 0 / 2 | `a6922711f60f1e5af5fd68aa34eb5a37eeda604b20abd7b37ad98cf07e69e521` | 0 / 0 | 23 | `304e0ed8c7326c631a4cdec1e9ee136edfb7bfd22821f067952a810da71c73bf` |
| ClamAV | `1.4.6` on Alpine 3.24 | 2 / 0 / 2 | `235632828205e20ed115d961cc3f502461c2936dd41a3dcf66768e71a82dccd3` | 0 / 0 | 42 | `5a182cfb82c7238f603f0123b350e1e3ac4320ae32888b972480b6d452961272` |
| PgBouncer | `1.25.2-p0` on Alpine 3.23 | 10 / 0 / 10 | `00a192ca4287f9b31ddfee73530bafcc74054772d0f688feace3966f141cabf7` | 0 / 0 | 26 | `43b653ca29a5cd2571fa5dc5478e78abf8e0194deff408e32744914614e3b819` |
| nginx | `1.30.4-alpine3.24` | 2 / 0 / 2 | `033ce9bb4c58b0af9d89bb89796afba1953ec2ee23442e173935ae084cc98fca` | 0 / 0 | 72 | `0bedf8ef9a55ffa6ce4a0c8bcec9bcc25a54e23acdfd4ac34cd79d4821f4c681` |
| media runtime | `python:3.12-slim` manifest plus FFmpeg 7.1.5 | Not separately recorded | `2646e443e722b471149ee63359dbad253f36c0f1e06d1fca1c60110907e2d403` | 137 / 7 | 294 | `90671df49e3ce6e1b15e4a0d4699648e3fa87a717fc4c59515bc8b61e7676e89` |

Fresh compatibility evidence uses only uniquely named synthetic Docker
resources. A brand-new PostgreSQL volume initialized 18.6 and became healthy
with both the configured user and PID 1 at uid/gid 70. PgBouncer remained
uid/gid 70, became healthy with the existing environment contract, and passed
`SELECT 1` through SCRAM authentication. Redis became healthy and its entrypoint
dropped PID 1 from the root image configuration to uid 999. ClamAV returned
`PONG`; its root `tini` supervisor contained `freshclam` and `clamd` running as
`clamav`. nginx 1.30.4 passed `nginx -t` and `/nginx-health`; the master retained
the existing bounded root requirement for ports 80/443 while workers ran as
`nginx`. All task-specific containers, network, and synthetic volumes were
removed after inspection.

Fresh branch verification passes feature tracking (7), migration/RLS tracking
(11), the runtime-image contracts (6), Ruff/format across all 502 API files,
and the single Alembic head. A fresh isolated Linux aggregate applied every
migration and exercised the full API suite against these hardened PostgreSQL
and Redis outputs: 1,885 tests passed, the same 13 unrelated baseline tests
failed, and there were zero setup errors. Web frozen install, lint, strict
typecheck, all 91 files / 602 tests, and a Linux production build through 94/94
pages and final image export pass. Both Compose files validate; the production
render contains each fixed release tag plus a syntactically complete
64-character hexadecimal manifest hash.

The PR #271 integration refresh passes 34 script/runtime/tracking tests with one
expected Windows POSIX-resource skip, 54 focused media/config API tests with one
Linux-only skip, Ruff/format over 503 API files, one Alembic head, web lint and
typecheck, and 91 files / 602 tests. Production Compose renders six immutable
registry references with synthetic settings and fails when
`MEDIA_RUNTIME_IMAGE_SHA256` is absent; the six-image build input also renders.
The native web build compiles, typechecks, and generates 94/94 routes before the
established Windows standalone-symlink `EPERM`. The new worker scan/SBOM,
runtime smoke, Linux build, and aggregate repository gate are unverified after
Docker became unavailable and are not counted as passes.

The Windows-host `./scripts/verify.sh --ci` attempt is not represented as a
pass. Its API phase terminated with 276 passes, 1,459 skips, 46 failures, and
117 setup errors because the native `_greenlet` DLL could not load and the
local database/Redis fixtures were unavailable; it exited before the web gate.
The isolated Linux aggregate above supplies the applicable API result, and the
web/migration/tracking gates were then run separately to completion.

There is no residual high/critical advisory in the five non-media local
outputs. The merged media worker remains blocked by 137 high and 7 critical
finding rows; its isolation is a mitigation, not acceptance. A fresh no-cache
worker rebuild completed as local OCI index `c18d048c4111…` after Debian
supplied newer OpenSSL packages, but its scan attempt exhausted the C: drive
while downloading the vulnerability database and left Docker Desktop
unresponsive. It produced no scan file or SBOM, so that new output is not a
reviewed artifact and must not be published. Any registry rebuild must fail the
release gate unless its exact pulled digest is inventoried and its findings are
remediated or an accountable owner records specific, reachable, expiring
acceptance. Every other blocker above is unchanged.

Provenance references: [Alpine release support](https://www.alpinelinux.org/releases/),
[ClamAV official Docker guidance](https://docs.clamav.net/manual/Installing/Docker.html),
[PgBouncer image release](https://github.com/edoburu/docker-pgbouncer/releases/tag/v1.25.2-p0),
[nginx stable downloads](https://nginx.org/en/download.html), and
[nginx security advisories](https://nginx.org/en/security_advisories.html).

The API critical set reported by the scanner is `CVE-2026-13221`,
`CVE-2026-34873`, `CVE-2026-34875`, `CVE-2026-42496`, `CVE-2026-58016`,
`CVE-2026-6653`, and `CVE-2026-8376`. This list is triage input, not a claim
that every advisory is exploitable in Dhanadhara. Conversely, package presence
alone is not a sufficient reason to accept risk where untrusted media reaches
native parsers.

## Browser storage and consent decision

The rehearsal found no evidence that analytics, advertising, replay,
attribution, chat, or another non-essential storage category has been enabled.
The existing essential-authentication-cookie decision therefore stands: no
consent banner is appropriate now. Before any non-essential storage is enabled,
privacy/security review and pre-consent blocking are required, with equally
clear **Accept** and **Reject** controls where consent is required.

## Human/environment sign-off ledger

No row below is approved by this engineering rehearsal.

| Gate | Required owner/evidence | State |
| --- | --- | --- |
| Dhanadhara name and trademark | Product/legal owner plus trademark counsel search/decision for launch classes and markets | Open — human sign-off required |
| Legal entity and public identity | Counsel-approved entity, addresses, grievance contact, dates, venue, age rule, and jurisdiction notices | Open — human sign-off required |
| Terms | Counsel/product approval for consumer, agent, staff, partner, referral, payout, property-link, suspension, dispute, and liability terms | Open — human sign-off required |
| Privacy/data inventory | Privacy owner record of processing, necessity, lawful basis/notice, access, retention, deletion, export/correction, and incident sensitivity | Open — human sign-off required |
| Processors | Contracts and region/transfer/breach/deletion review for communications, storage, payouts, malware, hosting, monitoring, and support | Open — human sign-off required |
| DNS/TLS | Operations owner external proof for apex/`www`/API/assets, redirects, certificates, renewal monitoring, and final HSTS | Open — environment and human sign-off required |
| Secrets | Security/operations owner proof of unique values, approved manager, least privilege, audit, and tested rotation/expiry | Open — environment and human sign-off required |
| Monitoring | Operations owner dashboards, SLOs, alert routes, and delivered synthetic alerts for the named failure modes | Open — environment and human sign-off required |
| Incident ownership | Named on-call/escalation, severities, security/privacy procedure, communications, and tested disable/rollback paths | Open — human sign-off required |

## Required rerun sequence

1. Restore GitHub Actions billing/spending capacity and rerun CI and Security on
   the exact reviewed commit.
2. Replace, rebuild, or explicitly patch and digest-pin every blocked runtime
   image. Complete advisory reachability review and either isolate native media
   processing or obtain accountable, expiring risk acceptance.
3. On a stable Linux runner, run `./scripts/verify.sh --ci`, the full API and web
   gates, Playwright role journeys, production-artifact auth/upload/webhook
   probes, exact CORS cases, and the complete image scan again.
4. Perform a timed database and object restore using synthetic data in an
   isolated environment; reconcile migration head, row/object counts,
   references, grants/RLS, integrity checks, and measured RPO/RTO.
5. Attach the named human/environment evidence above. Only then hold the final
   go/no-go review; this report by itself cannot authorize launch.
