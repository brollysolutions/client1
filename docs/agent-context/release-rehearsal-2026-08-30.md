# Frozen-release rehearsals — 30 August–2 September 2026

Status: **NO-GO**

Current exact candidate: `75e1031de0e3a7d16246bda294a0bc3b0757e78f`
([merged PR #290](https://github.com/brollysolutions/client1/pull/290))

Latest merged engineering source: `75e1031de0e3a7d16246bda294a0bc3b0757e78f`
([merged PR #290](https://github.com/brollysolutions/client1/pull/290)). It is the
frozen candidate above.

Latest registry-publication source baseline:
`8c29ad35b5dd901c76dbd0a3304f227b0dca67a0`
([merged PR #287](https://github.com/brollysolutions/client1/pull/287)), with the
nginx-CVE repair merged in
[PR #288](https://github.com/brollysolutions/client1/pull/288) at
`b02ac25ee9ffab215f500695606f62e72a608e8a`. The six private runtime-package
digests below remain byte-identical inputs to the current candidate; only web
dependency and release-document files changed between `b02ac25` and `75e1031`.

Previous exact candidate: `9b9e763fa0255114ab2c1d33a66e252dd8c0f8fd`
([merged PR #284](https://github.com/brollysolutions/client1/pull/284))

Earlier exact candidate: `eefc61d06708635f79055fe0187ede4fed3185cf`
([merged PR #277](https://github.com/brollysolutions/client1/pull/277))

Initial candidate: `3cc6bc07d98554b32924423e2f535b54fb21bb72`
([merged PR #267](https://github.com/brollysolutions/client1/pull/267))

Current rehearsal branch: `chore/exact-candidate-rehearsal-2026-09-02`.
The current rerun is delivered in
[PR #291](https://github.com/brollysolutions/client1/pull/291). The preceding
rerun was delivered in
[PR #285](https://github.com/brollysolutions/client1/pull/285).
The post-CVE rerun was delivered in
[PR #278](https://github.com/brollysolutions/client1/pull/278).
Historical evidence was delivered in
[initial PR #268](https://github.com/brollysolutions/client1/pull/268) and
[exact-candidate PR #273](https://github.com/brollysolutions/client1/pull/273).
The prior final rerun was delivered in
[PR #276](https://github.com/brollysolutions/client1/pull/276).

This record reports what was actually exercised. It is not production approval,
does not check any human-owned box in
[`pre-deployment-checklist.md`](pre-deployment-checklist.md), and contains no
production secret, customer data, database dump, or object.

## 2 September exact-candidate rerun after registry and dependency repairs

This is the current technical decision record. It freezes merged PR #290 at
`75e1031de0e3a7d16246bda294a0bc3b0757e78f`; no pass from an earlier candidate
is promoted into this ledger. All local identities, credentials, rows, objects,
origins, and authentication probes were synthetic. No production configuration,
secret, or data was accessed, and no package/image was published, visibility was
changed, deployment occurred, external-provider transfer or live payout ran, or
human-owned gate was approved.

The exact candidate remains **NO-GO**:

1. Exact-SHA GitHub CI and Security are green. Main-to-`prod` synchronization is
   also green, but it updates a branch and is not deployment evidence.
2. Fresh authenticated pulls resolve the six private runtime packages to their
   already-published immutable digests. Fresh Trivy 0.74.0 scans report **0 High
   / 0 Critical / 0 secrets** for those six packages and for the two exact
   first-party images built from `75e1031`.
3. The hosted Gitleaks step again logged zero scanned commits. A separate
   Gitleaks 8.30.1 run scanned all 539 local-history commits with zero findings,
   so the hosted badge is not misrepresented as full-history evidence.
4. Corrected production-image runtime probes, a real isolated media transcode,
   a cold synthetic database restore, and a destroyed-source object restore all
   match their expected source state. These local exercises do not prove
   production scheduling, encryption, retention, off-account copies, achieved
   RPO/RTO, cross-store reconciliation, or operator access.
5. The supplied 2-vCPU / 4-GB / 80-GB Ubuntu 24.04 `linux/amd64` droplet still
   has no representative load or reserve evidence against 9.125 GiB of
   configured service maxima. Real DNS/TLS, secret-manager, backup, monitoring,
   incident, legal/privacy/trademark/processor evidence and all nine qualified
   sign-offs remain open.

### 2 September exact-candidate verification ledger

| Gate | Result | Exact-candidate evidence |
| --- | --- | --- |
| Candidate identity | Pass | `upstream/main`, merged PR #290, the task base, and all hosted runs resolve to `75e1031de0e3a7d16246bda294a0bc3b0757e78f`. `git diff b02ac25..75e1031` contains only the web lock/workspace dependency repair and release documents, so the six immutable private runtime-package inputs are unchanged. |
| Hosted workflows | Pass with boundary | [CI 33617891197](https://github.com/brollysolutions/client1/actions/runs/33617891197) passes at the exact SHA, including 1,950 API tests in 19:10, 95 files / 610 web tests, the 94/94-route Linux production build, four zero-retry standalone browser journeys in 24.6 seconds, and contract drift. [Security 33617891196](https://github.com/brollysolutions/client1/actions/runs/33617891196) passes the frozen Python and production Node audits plus its limited-range secret step. [Sync 33617891389](https://github.com/brollysolutions/client1/actions/runs/33617891389) passes branch synchronization only. |
| Structural gates | Pass with one platform skip | The 45-test repository script suite completes with one expected Windows POSIX-resource skip. All 504 API files pass Ruff and format checks; Alembic reports the single head `d9f1a3b5c7e0`. |
| API aggregate and contracts | Pass hosted | The exact Linux run passes 1,950/1,950 tests without retries and committed OpenAPI/TypeScript outputs pass contract drift. The local rehearsal does not substitute a second aggregate for this exact hosted result. |
| Web unit/build/browser | Pass | Local lint, strict typecheck, and all 95 files / 610 tests pass. The exact local production build exports runnable OCI identity `58c51df66a53…`; the independent exact hosted build compiles, typechecks, generates 94/94 routes, and passes all four zero-retry browser journeys. |
| Secrets and dependencies | Pass with hosted-range note | Frozen `pip-audit==2.10.1` inventories 84 production Python packages with zero known vulnerabilities; production `pnpm audit` is clean. Gitleaks 8.30.1 scans 539 full-history commits with zero findings; its empty JSON report has SHA-256 `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570`. The API image secret report also has zero findings. Hosted Gitleaks is not counted as full-history evidence because it reports zero scanned commits. |
| Image vulnerabilities and SBOMs | Pass | Trivy 0.74.0 database version 2, updated `2026-09-02T13:02:59Z` and downloaded `2026-09-02T15:52:37Z`, reports 0 High / 0 Critical / 0 secret findings for every image below. CycloneDX inventories and machine reports remain outside Git at `D:\release-evidence-75e1031`. |
| Private registry | Pass for the six approved runtime packages | Authenticated pulls of all six exact `ghcr.io/dhanadhara` digests succeed and report up-to-date immutable content. The earlier raw no-authorization token checks and publication records remain valid because the digests are unchanged. API and web remain local exact-candidate identities; publishing or deploying them was not authorized. |
| Web headers/runtime | Pass locally | The exact image runs as `nextjs` with a read-only root, all capabilities dropped, no-new-privileges, 1 GiB memory and 256 PIDs. `/` returns 200 with CSP, one-year HSTS, `nosniff`, `DENY`, strict referrer policy, Permissions Policy and COOP, and no `Set-Cookie`. |
| API health/CORS/auth denial | Pass locally after setup corrections | The exact image runs as `app` with the same read-only/capability/no-new-privileges/1-GiB/256-PID boundary. Through exact PgBouncer to migrated PostgreSQL and exact Redis, health reports both checks `ok`; the configured synthetic origin receives the five-method closed CORS policy, an arbitrary origin receives 400 without ACAO, TRACE receives 405, and malformed Bearer plus a validly encoded unknown login receive 401. Tested mobile/password/token values do not appear in logs. An initial Windows-shell `ALLOWED_ORIGINS` quoting failure and one malformed curl body returning 422 were invalid harness inputs and are not counted. |
| Auth/upload/webhook behavior | Pass in aggregate; external block | The exact 1,950-test aggregate retains authentication/session/role/RLS/business-line, bounded upload, webhook signature/idempotency, payout-state, and privacy coverage. No approved-provider transfer or live payout ran. |
| Isolated media runtime | Pass locally | The private digest is healthy as UID/GID 10001 with a read-only root, 64-MiB noexec tmpfs, all capabilities dropped, no-new-privileges, one CPU, 768 MiB, 64 PIDs and an internal-only network. A real three-second 640x360 H.264/AAC input returns HTTP 200, protocol 1 and 66,592 canonical bytes in 2.862 seconds; FFprobe confirms H.264/AAC, 640x360, and 3.018005 seconds. Health is `ok` before and after, and no secret/data-service environment name is present. |
| Synthetic database restore | Pass locally after runbook correction | A custom-format `pg_dump` was streamed directly into `pg_restore` on a freshly recreated target volume in 10.614 seconds. Source and target match at head `d9f1a3b5c7e0`, 56 public tables including the synthetic probe, three probe rows with digest `d80f79b4ee1548058ad33ca2d141a664`, 111 RLS policies, 54 RLS-enabled relations, and the non-login/non-superuser `api_user` role. The first target attempt failed 114 grants because cluster roles are not in a database dump; that target volume was destroyed, `api_user` was provisioned as the runbook prerequisite, and the clean rerun passed. The repository safety hook correctly prevented persisting even a synthetic database archive to disk, so no durable archive hash is claimed. |
| Synthetic object restore | Pass locally | A 216,576-byte tar archive (`c9d971e545a59638e2ba569ee657007e29a6a076be448e9f08f731ade0441e34`) of six public synthetic artwork/icon objects was created in 1.456 seconds inside a task-owned backup volume. After the source volume was destroyed, restore to a separate target completed in 1.490 seconds and matched manifest `4302d3aeb0233033ec66a15651d18cf369fa6ffb24b7aecaab8ee9c63f4c4d66`. |
| Human/environment gates | **Blocked** | All nine canonical register rows remain `Open`; no accountable name, approval, date, durable production evidence, or risk acceptance was supplied. The target host also lacks representative capacity evidence. |

### 2 September exact image and SBOM evidence

First-party identities were built with `--pull` from the exact candidate. The
six runtime-package rows are authenticated re-pulls of the immutable private
OCI-index digests already approved for publication. Component counts exclude the
CycloneDX metadata component.

| Artifact | Exact local OCI/image ID or private index digest | Size (bytes) | High / critical / secrets | Components | Scan SHA-256 | SBOM SHA-256 |
| --- | --- | ---: | ---: | ---: | --- | --- |
| API | `06b0f645a92382b85a7822180c73ff33c69bdac73733dea772735b8bfaedcf56` | 87,409,652 | 0 / 0 / 0 | 123 | `5d9eaf937d278af79a34ddd9ae1807e7b3983360d31fb943584508e393bd8332` | `3bb645876d79f8eae79e183504fa58b56c308943a4e0f36f4b12e208c0d03343` |
| Web | `58c51df66a53195204e149876a2d557aca4888c384c3bf682b3fa3ea5ed2ddf2` | 135,245,601 | 0 / 0 / 0 | 46 | `956f369785224b79df23d67b0069e5105b8742b03587f3cc6d97055cf76fd157` | `95e0e6feab0500e97c505cadac262c187e3f2d40c6ac7418b64e34e675545b28` |
| PostgreSQL | `93ae1f58d3ada03b2b44cd33c6b99ee55032956e3ce1971a473268a2d60694e6` | 122,556,449 | 0 / 0 / 0 | 54 | `942bb75b5396c2f5b15f68f41e7ff5dda18e4885958b411b6551481fcc3c9be3` | `227f9c79644dd489cc27250dbd5afac83dd0cad69c1d894e96cf9ffcaacf5217` |
| Redis | `3c3a87a3c6edf90fc5ab9288fc4f522fcd9eaff6a3a8de5a18ae2a3137f92bcf` | 41,513,154 | 0 / 0 / 0 | 23 | `e255d19612750ec4fa2a027c44a18f260177ca9e957ef5a424ba512ed08c3392` | `e59e2183e80bdc7f4a4e23142c32b796b0e831702aa2ac24c84b52429bfa3342` |
| ClamAV | `9dfd42155b32c8f255d3a522261c0bd9247c5e34ff74d668a77464852e817bf4` | 155,180,423 | 0 / 0 / 0 | 42 | `ace0fe4d1c6ffd4e068680c770d0ac4c7f0e5ac6ae0d6d9d7e03c447becc2ee9` | `37d9c6bc51d0dd470ecbbb8d603c34127fc750b6dead0fccb2e7025633f14e03` |
| PgBouncer | `40e7044a95974e1bce86e154dbace58a18d0ae86cdcfe9eecbfc59c7e9b66879` | 11,561,706 | 0 / 0 / 0 | 26 | `2fbd2278bf30efc9017687e95d6fbdfa1c9af75c5d1591524a5fcd9ec74b2a14` | `801bd1eec2e90a3851858d8c93aac20acbd3ae16f8585e0cafe113f27f271571` |
| nginx | `243777dab5fe5094e6d7b9d55211a13847b3cb116e7f726cc8e70094213e482b` | 28,743,109 | 0 / 0 / 0 | 72 | `71450bb178a643a5b3719b6736e41c769126bdc0d755ddfae3a0a199c4dbf719` | `58819e1546729ec1a299859697a6f527d52234699e2235d5e3f880fc52fb4549` |
| Media runtime | `6eba9751614636f7451764a30140d8c12e7a905a562aa957f23a55d881ea8c6b` | 71,076,995 | 0 / 0 / 0 | 132 | `54092fd2fd9cbdb46fd1b0a57d49353972174dd74f31bb2fb9161c2c80ed7883` | `de87d9429458044388543dd54d824c3888541ae1c2a180cc9de6e595de8a6cce` |

The API secret-only report has SHA-256
`3c7694880821bfd2b4754d7af20ae1a709f000d970933a0452e1c6ab8b536194`.
All task-created containers, networks, and synthetic source/target/archive
volumes named `client1-rehearsal-75e1031-*` were removed after terminal evidence
was captured. The destroyed synthetic volumes are not recoverable. The exact API
and web images, authenticated runtime images, generated media samples, scan/SBOM
reports and scanner cache remain outside Git at `D:\release-evidence-75e1031`.
No global Docker prune ran.

## 2 September merge-result dependency-audit regression and repair

Merged PR #289 produced exact source `a6778a6d1affec4561b4b37f126375df9e6bd0b6`.
[Security run 33613946967](https://github.com/brollysolutions/client1/actions/runs/33613946967)
passed the Python audit and secret scan but failed the Node production audit on
two High advisories newly reported against locked Browserslist `4.28.4`:
`GHSA-c83g-rgw3-j3cx` / `CVE-2026-73089` (unbounded cache growth) and
`GHSA-73wf-gq98-2v4g` / `CVE-2026-73088` (malformed-statistics crash). Both are
fixed in Browserslist `4.28.7`. The failed main run prevents that source from
becoming the next exact candidate even though the independent main-to-`prod`
branch synchronization passed; synchronization is not deployment or release
approval.

The bounded repair in [PR #290](https://github.com/brollysolutions/client1/pull/290)
uses the web workspace's existing pnpm override mechanism to force exactly
`4.28.7`. Its required browser
compatibility data packages update with the patched manifest; Rollup, Next.js,
and application dependencies do not change. Fresh frozen installation resolves
one Browserslist version, passes the repository supply-chain policy, and the
exact production audit reports no known vulnerability. Web lint, strict
typecheck, 95 files / 610 tests, and 45 workflow tests with one expected Windows
POSIX skip pass. A strict Linux builder image `f12ae345008a…` compiles,
typechecks, generates 94/94 routes, completes standalone tracing, and exports.
The native build reaches 94/94 routes before the established Windows
standalone-symlink `EPERM`.

No application/API code, contract, schema, authentication/RLS, business-line,
PII/KYC, money flow, private GHCR package, image publication, deployment,
production system, or human approval changed. Release remains **NO-GO**. PR
#290 subsequently merged and its exact merge-result CI and Security runs pass;
the current exact-candidate rehearsal above supersedes this section's pending
rerun instruction without promoting evidence from `a6778a6`.

## 2 September registry publication — private package evidence verified

The user approved private publication of the six reviewed runtime images to the
new company-controlled `ghcr.io/dhanadhara` namespace and reported a successful
operator Docker login. The target host was identified as a 2-vCPU / 4-GB / 80-GB
Ubuntu 24.04 LTS x64 DigitalOcean droplet in BLR1, confirming `linux/amd64` but
not production capacity. No production host, secret, data, deployment, external
provider, payout, or human sign-off was accessed or changed.

The first local Trivy gate stopped before publication because nginx contained
`libexpat=2.8.2-r0`, reported High `CVE-2026-66046` and `CVE-2026-76641`, and had
fixed `2.8.4-r0` available. A dedicated nginx security wrapper now installs
exact `libexpat=2.8.4-r0` alongside the existing exact OpenSSL packages without
adding expat to the shared Redis/ClamAV wrapper. The focused structural test and
`nginx -t` pass. After that repair, all six local images passed a fail-closed
High/Critical vulnerability and secret scan before publication.

The six tags were published, resolved as OCI indexes with exactly one
`linux/amd64` runtime manifest and one provenance attestation, re-pulled by the
following immutable index digests, and rescanned. Trivy 0.74.0 used database
version 2, updated `2026-09-02T01:09:54Z` and downloaded
`2026-09-02T04:44:39Z`. Component counts exclude the CycloneDX metadata
component. Machine reports remain outside Git at
`D:\release-evidence-8c29ad3`.

| Artifact | Published OCI-index digest | High / critical / secrets | Components | Post-scan SHA-256 | Post-SBOM SHA-256 |
| --- | --- | ---: | ---: | --- | --- |
| PostgreSQL | `93ae1f58d3ada03b2b44cd33c6b99ee55032956e3ce1971a473268a2d60694e6` | 0 / 0 / 0 | 54 | `6624e09fa048b3173ab47c57bda683bf90ffc17a7c954b6f04866bdc07b9eed2` | `8baaf8317bbea2f8b8afbf98f1dc12c69dbfac159f7281db7d58c86761a8b91f` |
| Redis | `3c3a87a3c6edf90fc5ab9288fc4f522fcd9eaff6a3a8de5a18ae2a3137f92bcf` | 0 / 0 / 0 | 23 | `021955acb666041c7fcae671e60535d9353fca483766279dcd41dde19d51a9a4` | `222ae7f2459cfdfed7b055852463fdb741d874eeed0469ffac758d50cbf18048` |
| ClamAV | `9dfd42155b32c8f255d3a522261c0bd9247c5e34ff74d668a77464852e817bf4` | 0 / 0 / 0 | 42 | `f1fbd919efda3444e87cea550f8e2fef683051037ccd1812d536a462e9a9f243` | `c753b964ca7f9db9e8be069e6193e23b74b829dcdc7c5545c368b937894b7c92` |
| PgBouncer | `40e7044a95974e1bce86e154dbace58a18d0ae86cdcfe9eecbfc59c7e9b66879` | 0 / 0 / 0 | 26 | `0c53c8342e2a2805e01abbacbf53d1c1ae982f1d74d5cb24a4e53a3d91d58311` | `c71e50ea9413bbbde865f76313c8a7eb7d11994451961d895d32d75788ebcac0` |
| nginx | `243777dab5fe5094e6d7b9d55211a13847b3cb116e7f726cc8e70094213e482b` | 0 / 0 / 0 | 72 | `3ae6dd4510eab876dce60a54b039f28f5d76c2df26b96ffe0cbe8ac00fbc9e44` | `84cb7a8c164cf1b618555c288b303c28a5b519d496abcbc17f8b71f5b588b9a3` |
| Media runtime | `6eba9751614636f7451764a30140d8c12e7a905a562aa957f23a55d881ea8c6b` | 0 / 0 / 0 | 132 | `2719f9d154fa7dbca5a02de812aacc81a6b9f498defa54b80de55bb9f3f16c63` | `49deb79f7b0a362f589f2518b8073a265a862d0ffe55acb7de424ca8ea92bb13` |

The original visibility conclusion was incorrect. Pointing the Docker CLI at an
empty configuration directory did not isolate all local Docker credential state,
so its successful manifest resolution was not valid public-access evidence. A
corrected probe made raw
requests to GHCR's token endpoint without an `Authorization` header. Token
issuance returned HTTP 401 for each of the six
`repository:dhanadhara/<package>:pull` scopes, while the identical probe returned
HTTP 200 for the known-public `actions/actions-runner` control. GHCR therefore
issued no bearer token that an anonymous client could use to fetch any of the
six manifests.

Fresh authenticated pulls of all six exact tags succeeded and returned the same
OCI-index digests recorded above. Together, the positive authenticated pulls
and controlled no-credential denials prove that the packages exist and are
private. An unauthenticated organization package page may consequently report
zero packages; it is not evidence that the private registry objects are absent.
No package deletion, visibility change, or republication is required. The approved
private publication, immutable re-pull, post-publication scans, inventories, and
Compose digest render are complete for these six runtime packages. This corrects
only the visibility interpretation; it does not authorize deployment or turn
the later source into an exact release candidate.

Corrective verification on `fix/private-registry-evidence` includes the six raw
HTTP 401 denials and HTTP 200 public control, authenticated pulls resolving all
six recorded digests, byte-matching SHA-256 values and zero High/Critical/secret
rows across the retained post-publication reports, matching CycloneDX component
counts, and all 45 repository script tests passing with one expected Windows
POSIX-resource skip. No registry object or application code changed during the
correction.

Fresh bounded repository verification passes 11 production-runtime contract
tests, 7 feature-tracking tests, 11 migration/RLS tracking tests, API Ruff and
format checks across 504 files, the single Alembic head `d9f1a3b5c7e0`, web
lint/typecheck, and 95 files / 610 web tests. The native web build compiles,
typechecks, and generates 94/94 routes before the established Windows
standalone-symlink `EPERM`. The full repository wrapper was attempted twice;
its host API aggregate reached a repeated error cluster at 25% and
was stopped before a terminal traceback rather than recording hundreds of
identical errors as fresh application evidence. Its cause is untriaged and the
aggregate is not claimed as passing. No API or web application code changed in
this slice.

The supplied 4-GB target is a separate environment blocker. Current configured
service maxima total 9.125 GiB: PostgreSQL 1 GiB, Redis 128 MiB, ClamAV 4 GiB,
PgBouncer 128 MiB, media runtime 768 MiB, API 1 GiB, scheduler 1 GiB, web 1 GiB,
and nginx 128 MiB. Limits are not proof of simultaneous consumption, but ClamAV
alone may consume the host's advertised RAM and the OS also needs reserve.
Measured peak/steady usage under representative traffic plus explicit reserve,
or an approved larger/tuned topology, is required before deployment. Release
remains **NO-GO**.

## Exact-candidate rerun after hosted browser recovery

This is a historical technical decision record. It freezes merged PR #284 at
`9b9e763fa0255114ab2c1d33a66e252dd8c0f8fd`; no evidence from an earlier
candidate is promoted into this ledger. All local identities, credentials,
rows, objects, origins, and authentication probes were synthetic. No production
configuration or data was accessed, no image was published, no deployment,
external-provider transfer, or live payout ran, and no human-owned gate was
approved.

The exact candidate remains **NO-GO** even though the previous hosted-execution
blocker is removed:

1. Exact-SHA GitHub CI, Security, and main-to-`prod` branch sync are green. The
   sync workflow updates a branch; it is not evidence of a production deploy.
2. Fresh local Trivy 0.74.0 scans report **0 High / 0 Critical** for all eight
   distinct application and production-service images. These are local OCI
   identities, not approved, published, re-pulled registry-manifest digests.
3. Hosted Gitleaks reported success but its merge-result range scanned zero
   commits. A separate Gitleaks 8.30.1 full-history run scanned 527 commits and
   found no leaks, closing the technical gap without hiding the hosted-range
   limitation.
4. Fresh synthetic database and cold object restores match their sources. They
   do not prove production scheduling, encryption, retention, off-account
   copies, achieved RPO/RTO, cross-store reconciliation, or operator access.
5. Real DNS/TLS, secret-manager controls, monitoring and alert delivery,
   incident ownership, trademark, entity/Terms, privacy/data inventory, and
   processor approvals remain open. Every row in
   [`launch-signoff-register.md`](launch-signoff-register.md) is still `Open`.

### 1 September exact-candidate verification ledger

| Gate | Result | Exact-candidate evidence |
| --- | --- | --- |
| Candidate identity | Pass | `upstream/main`, PR #284's merge commit, the task base, and all three hosted runs resolve to `9b9e763fa0255114ab2c1d33a66e252dd8c0f8fd`. |
| Hosted workflows | Pass with boundary | [CI 33501907655](https://github.com/brollysolutions/client1/actions/runs/33501907655) passed at the exact SHA, including 1,948 API tests, 94 files / 608 web tests, 94/94 routes, the four-test Linux standalone browser gate, and contract drift. [Security 33501907605](https://github.com/brollysolutions/client1/actions/runs/33501907605) passed frozen Python/Node audits and its Gitleaks action. [Sync 33501907627](https://github.com/brollysolutions/client1/actions/runs/33501907627) passed branch synchronization only; no deployment is inferred. |
| Structural gates | Pass with one platform skip | `scripts/tests` passes 44 tests with one expected Windows POSIX-resource skip. Alembic reports only `d9f1a3b5c7e0`; all 504 API files pass Ruff and format checks. |
| API aggregate and contracts | Pass hosted | The exact Linux run passes 1,948/1,948 tests in 22:03 without retries and the committed OpenAPI/TypeScript outputs pass contract drift. The local rehearsal does not substitute a second aggregate for this exact hosted result. |
| Web unit/build/browser | Pass with engine observation | Local lint, strict typecheck, and 94 files / 608 tests pass. The exact Linux image compiles, typechecks, generates 94/94 routes, and yields runnable OCI identity `e1acae649cba…`. Docker returned engine HTTP 500 during final client status/unpack and was restarted; the retained image then ran successfully. The exact hosted standalone build and all four zero-retry browser journeys are the clean authoritative passes. |
| Secrets and dependencies | Pass with hosted-range note | Frozen `pip-audit==2.10.1` and production `pnpm audit` report no known vulnerability. Gitleaks 8.30.1 scans 527 full-history commits with zero findings; the API image scan also reports zero secret findings. Hosted Gitleaks 8.24.3 found no leak but logged `0 commits scanned`, so that badge is not used as full-history evidence. |
| Image vulnerabilities and SBOMs | Pass locally | A Trivy 0.74.0 database freshly downloaded on 1 September reports 0 High / 0 Critical for every image below. CycloneDX inventories and machine reports remain outside Git at `D:\release-evidence-9b9e763`. |
| Web headers/runtime | Pass locally | The exact image runs as `nextjs`; `/` returns 200 with CSP, one-year HSTS, `nosniff`, `DENY`, strict referrer policy, Permissions Policy, COOP, and no cookie. The intentionally unavailable synthetic catalogue origin caused bounded server-fetch errors before the cached page returned; it did not weaken headers or expose data. |
| API health/CORS/auth denial | Pass locally after setup correction | The exact image runs as `app` with read-only root, all capabilities dropped, no-new-privileges, 1 GiB memory, and 256 PIDs. Against restored synthetic PostgreSQL and isolated Redis, health reports both checks `ok`; the configured development origin receives the five-method/closed-header CORS response, an arbitrary origin receives 400 without ACAO, TRACE receives 405, and unknown login plus malformed Bearer credentials receive 401. Two earlier attempts were invalid rehearsal setup results: malformed JSON quoting for `ALLOWED_ORIGINS`, then an incorrect expectation that health checks were top-level rather than nested. |
| Auth/upload/webhook behavior | Pass in aggregate; external block | The exact 1,948-test aggregate retains authentication/session/role/RLS/business-line, bounded upload, signed/invalid webhook, payout transition, and idempotency coverage. No approved-provider transfer or live payout ran. |
| Isolated media runtime | Pass locally | The exact image is healthy as UID/GID 10001 with read-only root, bounded noexec tmpfs, all capabilities dropped, no-new-privileges, 768 MiB, and 64 PIDs. A real three-second 640x360 H.264/AAC input returns protocol 1, a 64,472-byte canonical output, and a 3.018005-second probe duration. The first host-copy attempt raced Docker Desktop file visibility and is not counted; the successful round-trip stayed inside the isolated container. |
| Synthetic database restore | Pass locally | A 451,037-byte custom archive (`a7dc123d3545646b8163f3c11e46350415d81f5e35fc897aef1715f534cc82d5`) was created in 3.183 seconds and restored in 9.913 seconds. Source and target match at head `d9f1a3b5c7e0`, 56 public tables including the synthetic probe table, three probe rows, and digest `e183afa608fc705a2ed7c4f5ac2fc364`. |
| Synthetic object restore | Pass locally | A 334-byte cold archive (`7de0f01a83af59de57e467d300bcd854558e3328ca8d9ff59b630bc9ab958bfa`) was created in 9.818 seconds. After destroying the source volume, restoration to a fresh volume completed in 7.815 seconds; all six PDF/JPEG/MP4 object and content-type files match. |
| Workstation continuity | Pass with observation | Docker Desktop initially needed startup, later returned an engine HTTP 500 during concurrent image/probe work, and recovered after one restart. Completed archives, reports, and exact images survived. The event is operational evidence, not a candidate pass or a production-availability claim. |
| Human/environment gates | **Blocked** | All nine canonical register rows remain `Open`; no accountable name, approval, date, durable production evidence, or risk acceptance was supplied. |

### 1 September image and SBOM evidence

All identities are local Docker OCI/image identities built with `--pull` from
the exact candidate. Component counts exclude the CycloneDX metadata component.

| Artifact | Exact local OCI/image ID | Size (bytes) | High / critical | Components | Scan SHA-256 | SBOM SHA-256 |
| --- | --- | ---: | ---: | ---: | --- | --- |
| API | `4accb5f639fe89eeeb7b9a14e564b3392caa3558b72659d18118d73199127af5` | 87,397,985 | 0 / 0 | 123 | `3e51a931adf8681d1e148d84afde974b3cdb9bba9d9dd7a7f4bb4223f914788e` | `ce06e3305691a82f28d0f7ef6a825974d4263b897eb71d4aa09b80cf77771736` |
| Web | `e1acae649cbaae77e2e60d2fbca51a1df4fe866517553d5d3c19e62d60ef6a37` | 135,241,645 | 0 / 0 | 46 | `64d9f693fe34a739b9ae9c3c46b884b7cd01e6d6c80391d5457145291536ca63` | `d46e670e286a2b1fcd948d95f381093429206cddb58e33be176b61b0d95e1ec0` |
| Media runtime | `8c048f5dfff6c2271665cb441e31a9509465b0dddf17a36ffd041d47c81de3a8` | 71,072,602 | 0 / 0 | 132 | `0dfab0e5f8e05b80446a1bc8db506f09bba4c3c980b2641a39d235d6434f7abf` | `21444c0fdffda974bcd829a582ae2b8ef93af18009c9b8a4adbad8beab09bff0` |
| PostgreSQL | `6263f74f0412be3b814f2c25f8dbd044a657136b8ee8b7b7edf784789cb8d646` | 122,556,451 | 0 / 0 | 54 | `a13f60a425f203481f2ba3e4d644a94b511049e27a44eba9c125f4d7665f13dc` | `992fb4d2c1e770463cf2be5be5de0958f818cd189346f8aaba2e47e4ec02ea64` |
| Redis | `4b0c0b2d230f3c9ad7c809aaa70a35172605bbf6f38a3a2a8f352bc6910e1d90` | 41,513,167 | 0 / 0 | 23 | `33a1dc22af1c0c08d525164088ce921aa1fd6e16101e802c77cd97af6809239f` | `e080cfc71602478ec3fc9bf5e2964e64a7c23769aa7001c78b4598f0ae9c702f` |
| ClamAV | `286685594377e0ba10b80777714d1b5a32bf9f40a36069bdfc5ad1736a511026` | 155,180,433 | 0 / 0 | 42 | `f85d36b1c87f0d69aaecdc50d574b9e84674738618576abf43d68b4056e001f6` | `7a578bc0067934c1ae7860e08fe9b636716ce9a67613b0e3a274c9cf545bcffa` |
| PgBouncer | `74993c4d60989e6fbcded1cd6bea53ac81754cadfa04af0bf72cb110ac5032fd` | 11,561,707 | 0 / 0 | 26 | `8b4693bfc27d060babee09e116581983182154118b9da921ca2dcc4f7da15f40` | `91d23dc0afaa6ed2b509451010879a1565c6cf3d07d804ebe6207db224608515` |
| nginx | `96ac75a9c9bf0d08cc41b4b590a4b0154970023ee7d31b2a050cef5445494fb4` | 28,680,240 | 0 / 0 | 72 | `7d81c9fa8314c509fac8cc283313fd8fb197e8e7c468bc723073d849b587030c` | `90df7beeac6de2b263142bba1ad92957b6279a3c1839da2d06a9394f4fca3e74` |

The zero-finding API-image secret report SHA-256 is
`a9b155785f8aed27d216e2e5dc920cbe2bdf27f6f3d2aee969a5b92ef41e71a7`.
The zero-finding full-history Gitleaks report SHA-256 is
`37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570`.

### 1 September cleanup boundary

All task-created containers, synthetic databases, Docker volumes, scanner
cache, and networks named with `client1-rehearsal-9b9e763` were removed after
terminal evidence was captured. The destroyed sources and removed recovery
volumes contained synthetic rehearsal bytes only and are not recoverable. Exact
local images and the machine reports at `D:\release-evidence-9b9e763` were
retained. No global Docker prune ran.

## Post-CVE exact-candidate rerun after merged PR #277

This is a historical technical decision record. It freezes merged PR #277
exactly at `eefc61d06708635f79055fe0187ede4fed3185cf` and supersedes the prior
candidate's local image, dependency, API, browser, runtime, and recovery result
rows. Earlier defect history remains historical evidence. Every identity,
credential, row, object, endpoint, and payout probe used here was synthetic.
No production configuration or data was accessed; no image was published, no
deployment or live payout ran, and no human-owned gate was approved.

The exact candidate remains **NO-GO**, but the rehearsed container-vulnerability
blocker is removed:

1. GitHub-hosted CI, Security, and main-to-production sync are attached to the
   exact SHA but executed zero job steps under the repository billing or
   spending-limit condition. Local evidence is not substituted for that
   independent execution.
2. Fresh Trivy scans now report **0 High / 0 Critical** rows for all nine exact
   application and production service outputs. No approved registry namespace
   or re-pulled registry-manifest digest was supplied, so the local OCI
   identities are evidence rather than deployable release references.
3. Exact local private-presign, webhook/idempotency, and full-suite coverage is
   retained, but no approved external object-provider transfer or live payout
   was authorized for this rerun.
4. Fresh synthetic database and cold object restores match their sources. They
   do not prove production scheduling, encryption, retention, off-account
   copies, achieved RPO/RTO, cross-store reconciliation, or operator access.
5. The checked-in Security workflow still carries the obsolete
   `PYSEC-2026-1325` ignore and comments from the removed Jose/ECDSA dependency.
   A stricter frozen-lock audit without that ignore is clean, so this is a
   future audit blind spot rather than evidence of a current vulnerable
   package. Remove it before relying on the next hosted Security result.
6. Real DNS/TLS, secret-manager controls, monitoring and alert delivery,
   incident ownership, trademark, entity/Terms, privacy/data inventory, and
   processor approvals remain open in
   [`launch-signoff-register.md`](launch-signoff-register.md).

### Post-CVE exact-candidate verification ledger

| Gate | Result | Exact-candidate evidence |
| --- | --- | --- |
| Candidate identity | Pass | `upstream/main`, the detached build worktree, and the task base all resolved to merged PR #277 SHA `eefc61d06708635f79055fe0187ede4fed3185cf`. |
| Hosted workflows | **Blocked** | [CI 33371719721](https://github.com/brollysolutions/client1/actions/runs/33371719721), [Security 33371719807](https://github.com/brollysolutions/client1/actions/runs/33371719807), and [sync 33371720001](https://github.com/brollysolutions/client1/actions/runs/33371720001) each concluded failure with zero executed steps under the billing/spending-limit block. |
| Structural gates | Pass with one platform skip | Seven feature-tracking, 11 migration/RLS, 10 production-runtime, and six media-runtime tests pass. The seventh media check is the expected Windows skip for its Linux POSIX-resource assertion. Alembic reports only `d9f1a3b5c7e0`. |
| API style and aggregate | Pass | All 504 API files pass Ruff and format checks. The authoritative dedicated-network Linux run used a freshly migrated database and isolated Redis: 1,948/1,948 tests pass with no skips or retries in 1:44:04. The read-only source mount produced only a harmless pytest-cache warning. |
| Contract drift | Pass | OpenAPI exported from the exact container and the pinned `openapi-typescript@7.13.0` output match the committed contracts after line-ending normalization. |
| Web unit/build | Pass | Frozen install, lint, strict typecheck, and 91 files / 602 tests pass. The exact Linux production build compiled, typechecked, generated 94/94 routes, completed standalone copy/export, and produced local OCI identity `4790757fc809...`. An initial build with a deliberately invalid placeholder host failed at the intended configuration guard and is not counted. |
| Production-artifact Playwright | Pass | After installing the lockfile-pinned Playwright Chromium 1228, the exact frozen web image passes all four Financial Services and registration journeys in 26.0 seconds with one worker, zero retries, and a loopback contract-shaped catalogue fixture. The pre-install missing-browser result was tooling bootstrap, not an application result. |
| Secrets and dependencies | Pass with follow-up | Gitleaks 8.30.1 scanned all 786 commits with zero findings. Production `pnpm audit` reports no known vulnerability. Frozen `pip-audit==2.10.1`, run more strictly without the stale workflow ignore, reports no known vulnerability. The exact API image's Trivy secret scan reports zero findings. |
| Image vulnerabilities and SBOMs | Pass locally | A fresh Trivy 0.74.0 database downloaded on 31 August 2026 reports 0 High / 0 Critical for every artifact in the table below. CycloneDX inventories and machine reports are retained outside Git at `D:\release-evidence-eefc61d`. |
| Web headers and runtime | Pass locally with topology note | Exact `/` returns 200 with CSP, one-year HSTS, `nosniff`, `DENY`, strict referrer policy, Permissions Policy, COOP, and no cookie. The production Compose web service uses a writable root and runs cleanly as `nextjs`. A stricter manual read-only-root probe still served the browser journeys but logged Next cache/ISR `EROFS` errors; because that is not the checked-in production topology, it is recorded as a hardening limitation rather than counted as a candidate failure or pass. |
| API health/CORS/auth denial | Pass locally with topology note | A manual runtime probe runs the exact production image as `app` with all capabilities dropped, no-new-privileges, a 1 GiB memory limit, and 256-PID limit. Health reports database and Redis `ok`. Only the configured HTTPS origin receives the five allowed methods, closed header set, credentials, and exact ACAO; arbitrary and `null` origins receive 400 without ACAO, TRACE receives 405, and unknown login plus malformed Bearer credentials receive 401. Probe values do not appear in logs. Production Compose sets the memory limit and non-root image user but does not itself declare the capability, no-new-privileges, PID, or read-only-root controls; those remain hardening follow-up rather than deployed-state evidence. |
| Auth/upload/webhook behavior | Pass in aggregate; external block | The 1,948-test aggregate retains HS256 valid/expired/wrong-signature/malformed-token, session rotation/replay, role denial, RLS/business-line, bounded private upload, invalid upload, signed/invalid webhook, payout transition, and idempotency coverage. Runtime inspection confirms PyJWT 2.13.0 and absence of Jose/ECDSA. No approved-provider transfer or live payout ran. |
| Isolated media runtime | Pass locally | The exact image is healthy as UID/GID 10001 with read-only root, bounded noexec tmpfs, all capabilities dropped, no-new-privileges, one CPU, 768 MiB, 64 PIDs, and an internal-only network. Three-second 640x360 and policy-maximum 1920x1080 H.264/AAC transcodes return protocol 1, bounded canonical output, and healthy status afterward. |
| Synthetic database restore | Pass locally | A 1,712,926-byte custom backup (`36aba008e8149bee00c51b083eacb53bf21b063b83c6ac4059862562f2ca7d8e`) was created in 3.318 seconds and restored to a new database in 8.872 seconds. Source and target match at head `d9f1a3b5c7e0`, 55 public tables, three synthetic probe rows, and digest `3342b735bc11259c96086f1668904319`. |
| Synthetic object restore | Pass locally after engine recovery | A 401-byte archive (`8ebc796af702b16b0c4d86a3dde1fb98edd664abd76c8bf5e1cb6040f8dad678`) was created in 2.012 seconds, then the source volume was destroyed. Docker Desktop stalled during the first extraction and was restarted; the already-created backup survived. A clean second restore to a freshly recreated volume completed in 1.279 seconds. All six object/metadata files match manifest `e18f916df0a37b8db3f6a4e43f108046b6966c4667dabbffdc38cf05fc356680`, including PDF, JPEG, and MP4 content types. The workstation stall is retained as an operational observation, not hidden. |
| Human/environment gates | **Blocked** | All nine canonical register rows remain `Open`; no accountable name, approval, date, durable production evidence, or risk acceptance has been supplied. |

### Post-CVE image and SBOM evidence

All identities are local Docker OCI/image identities built with `--pull` from
the exact candidate. Counts are CycloneDX components. A second media identity
appears because both the direct worker artifact and the production Compose
service output were built and scanned.

| Artifact | Exact local OCI/image ID | Size (bytes) | High / critical | Components | Scan SHA-256 | SBOM SHA-256 |
| --- | --- | ---: | ---: | ---: | --- | --- |
| API | `29c5f0fd3fb1d16f9b0ce071ecec576e1b63984908afd6f8af579565f211ba5a` | 82,584,221 | 0 / 0 | 123 | `889756c393e31685fca5a65d71783aa281a536a664d42e6415d87de6277d318b` | `5f2422be25eaa112c6f61bcb1a3538ea696365a2f0926476e3672d58983ec017` |
| Web | `4790757fc8099c9b72cf2f5e8990dcd0b37521c3ec0d889011f0c73e9f636067` | 135,238,648 | 0 / 0 | 46 | `7ccf79926c0d522327fc43b30af1e677327d90fb9d43400adc2fb286ce131960` | `744b8eda418ca9ae00c3e561e9d3ec603bb64b886806e81287e42320eac7858f` |
| Direct media worker | `67a9eac73bb41f7b8462caf0dc726cc536e67e15bba6d407d9ebfece204da275` | 71,072,923 | 0 / 0 | 132 | `010d7c79d041ca7cf83f33a409d3cfa770148c271d0bf6d82c0c08f46f789e4f` | `86baf839a06c0e2e38fb34b20658eef300263fc5e660640c56fbb7c2cfb9b9ae` |
| PostgreSQL | `f5fdc7015c40a03dd84496553a4e0bf750364f2e9afc7aa32d5f023b2291c7ea` | 122,556,462 | 0 / 0 | 54 | `eb6fd951d6e214ccb47cb432a527f3ab62b1745032f0ff51802f2e98af129ada` | `42c6771ef745612756aecdfe2ad24a07a47544e45f630ae8e304a3a5b2a16de7` |
| Redis | `f19af361db1b20c3d3b08d676dee8489819893932049f081a961e3d01f03bbf1` | 41,513,168 | 0 / 0 | 23 | `553a22cfb1edf282a4c63b4a46f4ab7122f134d4a19fe8370daf74b769bcef94` | `9ff477016a2c83ac92874e10ee8c7f85e8a43bfa67ad6a66ddad54a26139dec0` |
| ClamAV | `3d0581dc3769f1b931024fbbf5326702f7b68b018b8700043093f8e9c044066a` | 155,180,427 | 0 / 0 | 42 | `b22ed884d855836e1b0530dd10e09cb86d5b7414c39301a4f1acb09196bd3214` | `111e062f99a7f23314859613a6e75ef056a1f48cabb4ea5deedd75f8602cab44` |
| PgBouncer | `738c165d454e928a785ee876a84be9764884a88967b44c101fda8e532d727eeb` | 11,561,712 | 0 / 0 | 26 | `4cc6a66457059169fb7c032e2651ba5e74bacb111feade93bce29880ac13dfda` | `ad3641fabc136eb0ae151680de3b190264a68d98ff7107dabee79fc4e237b89d` |
| nginx | `fbe12d8b9ebd847a3657fa552c925cb6bfe91c5bf510e133ed290944c5925d34` | 28,680,232 | 0 / 0 | 72 | `bf7af75c5df9338eb88d997601d98ef2777babf8dd2190b983bee7207e86d5e7` | `ffa9e75f7e9cccfa32a50c9e72a4042cd1a83b9acaa760d943312256f7ffa246` |
| Compose media worker | `64aa12ecae1c34892b6e7b7a7a61ec9f14dacda7160818332d02c3e5ce2598c3` | 71,073,065 | 0 / 0 | 132 | `fba3671119262cb6da7e186d833d93f1782b2faaef3993c65210eb18039886b8` | `68b024d78668eb35d1374ed298009b3f7912fc13ac9fc7c790c38855bf64e478` |

The API secret-scan report SHA-256 is
`26658d8351fedc0c0303ecea81632b0763cd7ab0e65a279f5e207366810614e9`.
The zero-finding full-history Gitleaks report SHA-256 is
`37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570`.

### Post-CVE cleanup boundary

All task-created containers, synthetic databases, Docker volumes, and the task
network named with `client1-rehearsal-eefc61d` were removed after terminal
evidence was captured. The destroyed object source and removed backup/restore
volumes are not recoverable; they contained synthetic rehearsal bytes only.
Exact local images and the machine reports in `D:\release-evidence-eefc61d`
were retained. No global Docker prune ran.

## Prior exact-candidate rerun after merged PRs #274 and #275

This was the decision record for that candidate. It freezes merged PR #275
exactly at `fb692260c4793562b49915e740fbac09dd893b6d` and supersedes only the prior
candidate's API and Playwright result rows. Earlier defect history remains
historical evidence. The rerun used synthetic identities, credentials, data,
objects, and payout events only; it did not access production configuration,
move real money, publish an image, deploy, or approve a human-owned gate.

The exact candidate remains **NO-GO**:

1. GitHub-hosted CI, Security, and main-to-production sync are attached to the
   exact SHA but executed zero job steps because of the repository billing or
   spending-limit condition. No paid capacity is available, and the missing
   independent run is recorded rather than waived.
2. The fresh Trivy database reports 14 high / 3 critical rows in the exact API
   image and 137 high / 7 critical rows in the isolated media-runtime image.
   None has a reported fixed version. The web image remains zero high/critical.
   Isolation is a mitigation, not an advisory acceptance.
3. No approved registry namespace or final re-pulled registry-manifest hash was
   supplied for the six production service outputs. Local OCI identities are
   reproducible evidence, not production deployment references.
4. Exact production artifacts pass local headers, CORS, Client/Admin auth and
   denial, refresh replay revocation, bounded private upload presigning, invalid
   upload denial, negative webhook, and valid idempotent synthetic webhook
   probes. No approved external object-provider upload or live payout ran.
5. Fresh synthetic database and object-store restores match their sources, but
   do not prove production scheduling, encryption, retention, off-account
   copies, cross-store reconciliation, achieved RPO, or operator access.
6. Real DNS/TLS, secret-manager controls, monitoring/alert delivery, incident
   ownership, trademark, entity/Terms, privacy/data inventory, and processor
   approvals remain open in
   [`launch-signoff-register.md`](launch-signoff-register.md).

### Final exact-candidate verification ledger

| Gate | Result | Exact-candidate evidence |
| --- | --- | --- |
| Candidate identity | Pass | `upstream/main` and the task base resolve to merged PR #275 SHA `fb692260c4793562b49915e740fbac09dd893b6d`. |
| Hosted workflows | **Blocked** | [CI 33345587948](https://github.com/brollysolutions/client1/actions/runs/33345587948), [Security 33345587961](https://github.com/brollysolutions/client1/actions/runs/33345587961), and [sync 33345587946](https://github.com/brollysolutions/client1/actions/runs/33345587946) each contain zero executed steps under the billing/spending-limit block. |
| Repository wrapper | Split equivalent; single wrapper not passed | The canonical host invocation stopped before its first test because the existing Windows virtualenv could not load the `greenlet` DLL. Its structural, API, migration, contract, web, build, and browser constituents are executed separately, with API/migrations in a secretless Linux image. The failed host bootstrap is not counted as a passing wrapper. |
| Structural/API style | Pass with one platform skip | All 503 API files pass Ruff and format checks; Alembic reports only `d9f1a3b5c7e0`; 33 tracking, migration/RLS, production-runtime, and media-runtime tests pass, with the expected Windows-only skip for the Linux POSIX-resource assertion. |
| API aggregate | Pass | The authoritative secretless Linux run used a freshly migrated one-head `app_test_final` database and isolated Redis database 1 on a dedicated task network: 1,944/1,944 tests pass with no skips or retries in 1:12:07. Earlier attempts that shared stores, left orphaned processes, or traversed a timing-out Docker Desktop published port were discarded and are not release evidence. |
| Contract drift | Pass | OpenAPI exported inside the secretless Linux test image and the pinned `openapi-typescript@7.13.0` output both match the committed contracts; the byte-hash difference in JSON is CRLF/LF only. |
| Web unit/build | Pass | Lint, strict typecheck, and 91 files / 602 unit tests pass. The exact Linux production build compiled, typechecked, generated 94/94 routes, copied standalone output, and exported OCI index `630102c84307801e...`. |
| Playwright | Pass | The exact frozen web image passes all four Financial Services and registration journeys in 22.5 seconds with one worker and zero retries against the loopback contract-shaped catalogue fixture. The earlier host-saturated 3/4 run and focused diagnostic repetitions are not substituted for this authoritative 4/4 result. |
| Secrets/dependencies | Pass with existing exception | Gitleaks 8.30.1 scanned all 508 commits with zero leaks. Production `pnpm audit` reports no known vulnerability. Frozen `pip-audit==2.10.1` reports no known vulnerability and the one documented `PYSEC-2026-1325` exception. |
| Web headers/cookies | Pass locally | Exact image `/` returns 200 with CSP, one-year HSTS, `nosniff`, `DENY`, strict referrer policy, Permissions Policy, and COOP. It sets no cookie. The current essential-only cookie decision remains unchanged. |
| API health/CORS | Pass locally | The exact production image fails closed on malformed origin JSON and missing proxy trust, then starts healthy with valid synthetic production settings. The configured HTTPS origin receives only GET/POST/PUT/PATCH/DELETE, the closed header set, credentials, and exact ACAO; arbitrary and `null` origins receive 400 without ACAO, and TRACE receives 400. |
| Auth/roles | Pass locally | Client/Admin login, `/me`, Client-to-Admin 403, Admin home, refresh rotation, rotated-token and chain replay 401s, logout, and unknown/wrong-password 401 equivalence pass. The refresh cookie is Secure, HttpOnly, SameSite=Strict, refresh-path-only, and host-only. |
| Upload/webhook | Partial / external block | Client loan-document presign is HTTPS, 5 MiB bounded, private staging/application scoped, and `private, no-store`; another Client receives 404 and `text/html` receives 422. Unsigned/invalid webhook requests receive 400 without payload logging. A synthetic signed event moves one initiated payout to paid with a ledger link, and exact replay returns 200 without changing that link. No external upload or live payout ran. |
| Synthetic database restore | Pass locally | A 447,624-byte custom backup (`810abf11...`) was created in 0.99 seconds and restored to a new database in 4.14 seconds. Source/target match at head `d9f1a3b5c7e0`, 55 tables, three synthetic users, and the ordered identity/status digest. |
| Synthetic object restore | Pass locally | After destroying the source volume, a 55,808-byte cold object-store archive (`5814c5c8...`) restored to a fresh volume in 1.88 seconds. Three private PDF/JPEG/MP4 objects retain identical SHA-256 values, sizes, ETags, and content types. |
| Isolated media runtime | Pass locally | The exact image is healthy as UID/GID 10001 with read-only root, bounded noexec tmpfs, all capabilities dropped, no-new-privileges, one CPU, 768 MiB and 64 PIDs. A real three-second H.264/AAC transcode returns protocol 1, bounded canonical bytes, preserved 1280x720 H.264/AAC streams, and healthy status afterward. |
| Human/environment gates | **Blocked** | All nine canonical register rows remain `Open`; no accountable name, approval, date, or durable production evidence has been supplied. |

### Final image and SBOM evidence

Trivy 0.74.0 used a database freshly downloaded on 31 August 2026. Counts are
finding rows; unique advisories distinguish duplicate package rows. Every
reported API/media row lacks a fixed version.

| Artifact | Exact local OCI index ID | High / critical | Unique advisories | CycloneDX components | Evidence digest / result |
| --- | --- | ---: | ---: | ---: | --- |
| API | `15467cd6150a4ef7fd4a1c5e4fd637f10d7f4023b29e4bcfafa37ad497dce988` | 14 / 3 | 14 | 189 | Scan `f39a99fb...`; SBOM `8c49e58a...`; **block** |
| Web | `630102c84307801e372853c08b06c822bc9e463b8f916fa38f8fee4bac59dd14` | 0 / 0 | 0 | 46 | Scan `e6cf05fa...`; SBOM `88ca6450...`; pass |
| Media runtime | `08366ea1105471488ebea6544ed34ec9d8243d2610ea0dba0158116ae96af84e` | 137 / 7 | 45 | 294 | Scan `cbf7b787...`; SBOM `73e5324e...`; **block** |

### Workstation preparation and cleanup boundary

With the user's prior approval, 2.54 GB of non-project installer/browser/tool
caches and stale temporary profiles were moved from C: into the recoverable
`D:\nonproject-cache-quarantine-20260831` quarantine. No project file, personal
document, credential, Docker data VHDX, or unknown swap VHDX was touched. No
Docker image, build cache, volume, or user container was pruned. Task-created
synthetic containers, databases, volumes, and networks were removed after
terminal evidence was captured. The exact local images were retained; no global
Docker prune ran.

## Exact-candidate rerun after merged PR #272

This was the decision record for that candidate. It supersedes the earlier
report's interrupted Docker, unreviewed `c18d048…` media rebuild, and unverified recovery
statements. It does not supersede the original defect history or turn local
evidence into production or human approval.

The exact candidate is still **NO-GO**:

1. Hosted CI, Security, and main-to-production sync are attached to the correct
   `c37b9d5` SHA but did not execute a job step because the account reports a
   failed payment or exhausted spending limit.
2. The exact production API image has 14 high and 3 critical finding rows, and
   the exact native-media image has 137 high and 7 critical rows. Trivy reports
   no fixed version for any of those rows. Isolation is a mitigation, not an
   advisory waiver or launch approval.
3. None of the six reviewed service outputs has been published to an approved
   registry namespace and re-pulled by final registry-manifest hash. Local OCI
   index identities are evidence, not deployable production references.
4. The Linux API aggregate is not green: 1,931 tests pass and 13 fail. A fresh-
   database rerun makes the payout grace-window and automatic task-assignment
   cases pass; the other 11 reproduce superseded content-policy assertions,
   invalid property UUID fixtures, and validation-order expectations. These
   known test defects remain failures until corrected in a separate PR.
5. The exact standalone web artifact passes headers and two mocked registration
   journeys, but one profile journey is flaky and all three Financial Services
   Playwright cases fail: one uses a non-unique heading locator, while two need
   published catalogue data that was absent because the build-time internal
   API endpoint was intentionally unreachable. A release-artifact browser gate
   with reachable production-like catalogue data remains open.
6. Production-artifact upload evidence reaches HTTPS, private owner/application-
   scoped presigning and denial cases, but no approved external object provider
   was available for a positive object transfer. Live payout execution was not
   attempted. Missing-secret/invalid-signature webhook behavior fails closed.
7. The local synthetic database and object restores pass, but they do not prove
   production backup scheduling, encryption, retention, off-account copies,
   cross-store reference reconciliation, achieved RPO, or operator access.
8. Real DNS/TLS, secret-manager controls, monitoring/alert delivery, incident
   ownership, trademark, entity/Terms, privacy/data inventory, and processor
   approvals remain open in
   [`launch-signoff-register.md`](launch-signoff-register.md).

### Exact verification ledger

| Gate | Result | Exact-candidate evidence |
| --- | --- | --- |
| Candidate identity | Pass | Branch and merged PR #272 resolve to `c37b9d5fb68ea30daa5f4f55dd15f97cf27ce547`. |
| Hosted workflows | **Blocked** | [CI 33314962625](https://github.com/brollysolutions/client1/actions/runs/33314962625), [Security 33314962620](https://github.com/brollysolutions/client1/actions/runs/33314962620), and [sync 33314962985](https://github.com/brollysolutions/client1/actions/runs/33314962985) each report the payment/spending-limit block. Their four jobs ran zero steps. |
| Repository wrapper | **Incomplete** | The canonical `./scripts/verify.sh --ci` invocation passed 7 feature-tracking, 11 migration/RLS, 9 production-runtime and 6/7 media-runtime checks (one expected Windows POSIX skip), plus API Ruff/format. Its duplicate native-Windows API phase was stopped at 7% because it was skipping service-dependent cases and repeating the completed 82-minute Linux aggregate. It did not reach the web phase and is not counted as a pass. |
| API aggregate | **Fail — known baseline** | Exact isolated Linux run: 1,931 passed / 13 failed in 1:22:39. Fresh-database rerun: 2 passed / 11 failed. The reproducible failures are stale content-policy, UUID-fixture, and validation-order expectations; none is hidden or counted as passing. |
| Security-focused API | Pass | Fresh database: 93/93 login/session, CORS, loan-document API/RLS, managed-media, webhook/idempotency, and route-authorization tests pass. All 503 API files pass Ruff/format; Alembic reports the single `d9f1a3b5c7e0` head. |
| Contract drift | Pass | Fresh OpenAPI and TypeScript client generation produces no tracked diff. |
| Web unit/build | Pass | Frozen install, lint, strict typecheck, and 91 files / 602 tests pass. The exact Linux production build compiles, typechecks, generates 94/94 routes, copies standalone output, and exports OCI index `068178315215320e…`. |
| Playwright | **Fail / flaky** | Mocked registration: one pass and one pass only on retry. Financial Services: 3/3 fail for the non-unique locator and absent build-time catalogue data described above. |
| Secrets/dependencies | Pass with existing exception | Gitleaks 8.30.1 scans 503 commits with zero leaks. Production `pnpm audit` reports no vulnerability. Frozen `pip-audit==2.10.1` reports no known vulnerability and the one documented `PYSEC-2026-1325` exception. |
| Web headers | Pass locally | `/`, `/login`, `/privacy`, `/dashboard`, and a 404 all carry CSP, `nosniff`, `DENY`, strict referrer policy, Permissions Policy, COOP, and one-year production HSTS. Dashboard returns 307 to its encoded login return path. The real TLS edge remains unverified. |
| API health/CORS | Pass locally | Exact production image is healthy against isolated PostgreSQL/Redis. The configured HTTPS origin receives the five approved methods, three non-safelisted request headers, credentials, and exact ACAO. Arbitrary, `null`, suffix-confusion, HEAD/TRACE, and invented-header cases return 400 without an ACAO grant. |
| Auth/roles | Pass locally | Client/Admin login, `/me`, refresh rotation, Client-to-Admin denial, Admin home access, logout, revoked-token replay denial, unknown-login denial, and Secure/HttpOnly/SameSite=Strict refresh-only cookie scope pass. Runtime logs contain no tested password, JWT, refresh cookie, or synthetic mobile. |
| Upload/webhook | Partial / external block | Client loan-document presign is HTTPS, bounded and private owner/application scoped; another Client gets 404 and `text/html` gets 422. Exact unsigned webhook returns 400 without payload logging; the 93-test set covers valid signature, state transition and idempotency. No real provider transfer or live payout ran. |
| Synthetic database restore | Pass locally | A 458,860-byte custom archive (`ba024a36…`) restores to a fresh database in 6.72 seconds. Source/target match at head `d9f1a3b5c7e0`, 55 tables, 11 synthetic users, and identity/status digest `07302e6b…`. Backup creation takes 1.33 seconds. |
| Synthetic object restore | Pass locally | After destroying the source volume, three private PDF/JPEG/MP4 objects (79 bytes) restore to a fresh store in 2.15 seconds with identical manifest `537a746e…` and preserved content types. Production recovery controls remain blocked as described above. |
| Human/environment gates | **Blocked** | All nine canonical register rows remain `Open`; no accountable name, approval, date, or production evidence has been supplied. |

### Exact image and SBOM evidence

Trivy 0.74.0 used a fresh database updated at
`2026-08-30T13:05:01Z` and downloaded at `2026-08-30T14:08:37Z`.
Finding counts are rows; unique advisory counts distinguish duplicate package
rows. No image environment contains a sensitive configuration variable name.

| Artifact | Exact local OCI index ID | High / critical | Unique advisories | CycloneDX components | Evidence digest / result |
| --- | --- | ---: | ---: | ---: | --- |
| API | `5f97a404aada60afaebfdaee6e0c6c42427811fbc99433402475abd16cd169a0` | 14 / 3 | 14 | 189 | Scan `5a3a5af3…`; SBOM `043f0777…`; **block** |
| Web | `068178315215320ebba560e67d0f3f337aeec24daade08b9b79a30d2ec08d9cb` | 0 / 0 | 0 | 46 | Scan `a4728843…`; SBOM `7f45269e…`; pass |
| Media | `c18d048c411132bf7d6b6251a49c338cf9acfb91440c24841aa2ff1fa5f15bb9` | 137 / 7 | 45 | 294 | Scan `26629136…`; SBOM `ffedfc76…`; **block** |
| PostgreSQL | `cdbc6c84e6a6eef0b2738079278cdf2461b011470625339dc4914b028055fc61` | 0 / 0 | 0 | 54 | Pass |
| Redis | `a6922711f60f1e5af5fd68aa34eb5a37eeda604b20abd7b37ad98cf07e69e521` | 0 / 0 | 0 | 23 | Pass |
| ClamAV | `235632828205e20ed115d961cc3f502461c2936dd41a3dcf66768e71a82dccd3` | 0 / 0 | 0 | 42 | Pass |
| PgBouncer | `00a192ca4287f9b31ddfee73530bafcc74054772d0f688feace3966f141cabf7` | 0 / 0 | 0 | 26 | Pass |
| nginx | `033ce9bb4c58b0af9d89bb89796afba1953ec2ee23442e173935ae084cc98fca` | 0 / 0 | 0 | 72 | Pass |

The media runtime also passes a real synthetic three-second 1920×1080 H.264/
AAC transcode as UID/GID 10001 with no network, read-only root, bounded noexec
tmpfs, all capabilities dropped, no-new-privileges, one CPU, 768 MiB memory and
64 PIDs. The canonical output is H.264 1920×1080 plus AAC, and health remains
OK. The API and web run as `app` and `nextjs` respectively with read-only roots,
all capabilities dropped and no-new-privileges.

### Exact-rerun cleanup

The old `client1-rehearsal-*` resources named by the initial report were absent
after Docker recovery, and the unused scanner-cache volume was removed after
confirming no attached container. Exact-rerun object source, backup and restore
volumes were destroyed after their checks. The exact API/web/journey/test,
PostgreSQL and Redis containers, task network, anonymous synthetic database
volume, and synthetic environment list were removed after terminal results were
captured. All exercised data and credentials were synthetic; no production
source was accessed.

## Initial candidate decision summary

The remainder of this section is the historical PR #268 decision at `3cc6bc0`.

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

The PR #271 integration refresh runs 34 script/runtime/tracking tests: 33 pass
and one has the expected Windows POSIX-resource skip. Another 54 focused
media/config API tests pass with one Linux-only skip; Ruff/format over 503 API
files, one Alembic head, web lint/typecheck, and 91 files / 602 tests pass.
Production Compose renders six immutable
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
