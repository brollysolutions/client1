# Frozen-release rehearsals — 30–31 August 2026

Status: **NO-GO**

Current exact candidate: `eefc61d06708635f79055fe0187ede4fed3185cf`
([merged PR #277](https://github.com/brollysolutions/client1/pull/277))

Previous exact candidate: `fb692260c4793562b49915e740fbac09dd893b6d`
([merged PR #275](https://github.com/brollysolutions/client1/pull/275))

Initial candidate: `3cc6bc07d98554b32924423e2f535b54fb21bb72`
([merged PR #267](https://github.com/brollysolutions/client1/pull/267))

Current rehearsal branch: `chore/exact-candidate-rehearsal-post-cve`.
The post-CVE rerun is delivered in
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

## Post-CVE exact-candidate rerun after merged PR #277

This is the current technical decision record. It freezes merged PR #277
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
