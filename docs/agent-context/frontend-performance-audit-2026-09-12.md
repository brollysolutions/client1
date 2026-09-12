# Dhanadhara frontend performance audit

Date: 12 September 2026. Baseline: `68091c6`; application candidate: `bbf613d`.
Delivery: [PR #297](https://github.com/brollysolutions/client1/pull/297),
upstream head `fix/frontend-delivery-audit`, base `main`. The contribution branch
remains `feat/production-environment-evidence` on `origin`.

At delivery, GitHub reported the earlier PR #296 closed and `origin` outside the
fork network. The normal helper committed/pushed successfully but could not open
a cross-repository PR. The same reviewed commits were pushed to the new upstream
feature branch using existing write access; PR #297 includes the preceding
branding/mobile work. No protected branch was changed and no PR was merged.

The user confirmed Dhanadhara as the target after supplying a BrollyAI guide.
Only its measurement and preservation principles apply: that site's brand,
routes, architecture, historical scores and deployment assumptions do not.
This record describes local synthetic evidence, not deployed or field performance.

## Scope and acceptance

Visitors should reach readable public content, use the catalogue and calculators,
and enter existing contact/auth journeys without downloading invisible artwork
or unrelated calculators. Preserve source copy, blue/gold branding, responsive
composition, URL state, numerical results, exports and enquiry safeguards.

Acceptance is demonstrated removal of unnecessary transfer and calculator work,
stable loading, working interactions and comparable repeated lab evidence. Keep
performance >=90, LCP <=2,500 ms, TBT <=200 ms and CLS <=0.1 as explicit targets;
an improvement is not equivalent to meeting every budget. No new dependencies,
telemetry, financial logic, API/auth/RLS changes or deployment are in scope.

Resource inspection covers `/`, `/loans`, `/loans/personal-loan`, `/real-estate`,
`/calculators`, `/calculators/emi`, `/contact` and `/login` at 390 and 1440 pixels.
Repeated Lighthouse comparisons cover Home, EMI and Real Estate, three valid
samples for each mobile and desktop profile. This is representative coverage,
not an exhaustive timing audit of every public or authenticated route.

## Reproduction and evidence boundaries

- Next.js 15.5.21 production output, React 19, Node 22.23.1; source copied into
  ignored `build/frontend-audit/{baseline,candidate}/`, excluding all env files.
  Existing installed dependencies are reused; no packages are installed.
- Explicit synthetic public configuration and a GET-only local catalogue fixture
  on port 4311, including two bundled published banner images. Browser tests mock
  API requests. No real submissions, customer data or delivery providers.
- Next production origin on 3202 behind a local gzip fixture on 3201. The fixture
  uses the checked-in nginx MIME allowlist, compression level 5 and 512-byte
  threshold. Candidate adds RSC compression; this fixture is not a deployed nginx
  or TLS measurement. The origin is identified independently of any dev server.
- Lighthouse 13.4.1, Chrome 153.0.0.0, Windows workstation; pinned local audit
  plugin. Default simulated mobile throttling: 4x CPU, 150 ms RTT, 1,638.4 Kbps;
  viewport 412x823 at DPR 1.75. Desktop: 1350x940 at DPR 1, 1x CPU, 40 ms RTT,
  10,240 Kbps. Normal motion, new browser/cache for each run, same
  source fixture and route order. The server stays running after each version's
  resource sweep. The existing `isrFlushToDisk: false` disables Next's image disk
  cache; do not infer an optimizer cache hit from this warm process. Builds,
  browser suites and timing runs are
  sequential; no task-owned build/test runs overlap the measurements.
- Three valid runs per route/profile, medians and individual ranges retained.
  The baseline required two replacement runs because Chrome returned
  `NO_NAVSTART`; failed reports remain in their original directories.
- Local Lighthouse emits slow-test-CPU warnings and results vary. Do not dismiss
  failures or extrapolate these samples to the real production host. TBT is not
  INP; real-visitor p75 Core Web Vitals are unknown.
- Ignored evidence includes `candidate.json`, `build.log`, `serve.log`,
  `resources/summary.json`, viewport screenshots, Lighthouse HTML/JSON/logs,
  `lighthouse-results.json` and `comparison-summary.json` under each artifact
  directory. `*-retry-*` directories retain replacement samples separately.

The separate Chrome DevTools EMI trace used actual 4x CPU/Slow 4G throttling and
is diagnostic, not part of the Lighthouse comparison: LCP 5,945 ms, TTFB 18 ms,
render delay 5,928 ms and CLS 0.209. It attributes roughly 809 ms of forced layout
to Radix measurement/Presence work. The MCP rejected filesystem trace export;
that trace was inspected in memory, not claimed as a saved artifact.

## Confirmed causes and changes

1. CSS-hidden heroes still requested full images on mobile. Baseline Home fetched
   a hidden 200,054-byte banner; calculator/contact/product SVGs also transferred
   while hidden. `ResponsiveArtwork` uses Next `getImageProps` and native
   `<picture><source media>` selection with an inline transparent fallback.
   Desktop artwork remains eager when visible, with intrinsic dimensions or fill
   positioning. No hydration-dependent media-query hook or unconditional desktop
   preload is introduced.
2. The shared horizontal logo transferred 68,570 bytes despite a 144-pixel mobile
   display width. Shared logos now use Next responsive derivatives and accurate
   sizes in public, auth, footer and dashboard contexts. Original PNGs, accessible
   names, links and Excel source assets remain intact. Bundled banner templates
   use the same existing optimizer; uploaded URLs remain direct to preserve the
   storage public/internal host boundary.
3. Next deliberately disables its gzip because nginx owns compression, but nginx
   omitted `text/x-component`. EMI prefetched approximately 94,525 and 93,203 bytes
   for the calculator hub and Home RSC responses, almost entirely uncompressed.
   The existing gzip allowlist now includes that MIME. Vary, cache policy, proxy
   trust, security headers and private response handling are unchanged.
4. The EMI route included all 18 calculator implementations in one 116,784-byte
   decoded / 30,958-byte transferred route chunk. Moving the dynamic-import map
   below `CalculatorIsland`'s client boundary allows per-calculator chunks.
   Static page generation and server-rendered explanatory content remain. Inputs
   already required client hydration for nuqs URL state; this change does not
   claim to make them usable without JavaScript.
5. The empty calculator Suspense fallback painted following content in the space
   where controls appeared later. An accessible, static loading skeleton reserves
   initial space and disappears once controls load. It adds no animation, delay,
   permanent minimum height or new dependency.
6. Home's mobile CTA helper/link measured 4.4:1 contrast. Raising the existing white
   text opacity from 80% to 90% preserves its composition and improves contrast.

Implementation references: installed Next Image/loading implementation, official
[Next 15 Image API](https://nextjs.org/docs/15/app/api-reference/components/image),
[Next 15 lazy loading](https://nextjs.org/docs/15/app/guides/lazy-loading),
and [nginx gzip MIME configuration](https://nginx.org/en/docs/http/ngx_http_gzip_module.html).
Server Component dynamic imports do not automatically split client components
in this Next version; the production browser test checks actual downloaded code.

## Measurements and verification

The unthrottled resource sweep uses fresh browser contexts at DPR 1, waits for
load/fonts plus two seconds, and includes resources/prefetches observed in that
window. These are single transfer inventories, not repeated timing results;
resource totals exclude the initial document. Decimal kB are used below.

| Mobile route (390 px) | Baseline resource transfer | Candidate resource transfer |
| --- | ---: | ---: |
| Home | 524.6 kB | 259.2 kB |
| Financial Services | 531.9 kB | 263.4 kB |
| Personal Loan | 376.9 kB | 302.5 kB |
| Real Estate | 648.8 kB | 370.3 kB |
| Calculator hub | 461.7 kB | 266.0 kB |
| EMI | 611.7 kB | 365.0 kB |
| Contact | 337.0 kB | 266.9 kB |
| Login | 497.1 kB | 344.8 kB |

Desktop transfer also falls on all eight routes; Home changes from 768.8 to
531.6 kB, EMI from 641.3 to 404.2 kB and Real Estate from 774.8 to 537.6 kB.
The shared logo request changes from 68,570 to 5,824 transferred bytes. EMI's
observed script requests change from 263,968 to 202,108 transferred bytes and
817,162 to 618,752 decoded bytes. Its build-reported initial JS changes from
209 to 149 kB; that build statistic excludes subsequently loaded lazy chunks.
The browser assertion separately proves that unrelated implementations are not
downloaded. Small shared-helper JS overhead remains on other routes (roughly
0.4 kB transferred); their savings come from images and route compression.

A separate real nginx integration probe uses the repository-pinned nginx
1.30.4 Alpine base, the actual config with only its local web upstream port
changed, and the candidate Next origin. EMI's RSC body changes from 66,554 bytes
to 10,147 compressed bytes. Gunzip reproduces the exact original bytes; HTTP 200,
`text/x-component`, `Vary: Accept-Encoding` and equal cache headers are verified.
The temporary container is stopped. This validates gzip behavior, not the
patched deployment runtime image or production host. Evidence: `nginx-rsc.json`.

Both versions have 18 valid Lighthouse samples. The candidate runner exits 0
with all 18 reports valid; report generation success is not a budget pass.
Values below are **median [minimum–maximum]**, with three runs per row. LCP/TBT
are milliseconds; score is out of 100. Individual samples remain in the JSON
reports and `comparison-summary.json`.

| Mobile route/version | Performance | LCP | TBT | CLS |
| --- | ---: | ---: | ---: | ---: |
| Home baseline | 64 [59–69] | 3849 [3810–4078] | 1165 [834–1818] | 0 [0–0.001] |
| Home candidate | 62 [61–64] | 3965 [3960–4182] | 1313 [1184–1407] | 0 [0–0] |
| EMI baseline | 48 [41–50] | 4253 [4002–4962] | 1570 [1390–2095] | 0.225 [0.225–0.225] |
| EMI candidate | 63 [61–64] | 3731 [3686–3866] | 1475 [1457–1648] | 0 [0–0] |
| Real Estate baseline | 68 [60–76] | 4053 [4051–4167] | 813 [436–1503] | 0 [0–0] |
| Real Estate candidate | 58 [56–63] | 4126 [4122–4343] | 1875 [1064–2181] | 0 [0–0.001] |

| Desktop route/version | Performance | LCP | TBT | CLS |
| --- | ---: | ---: | ---: | ---: |
| Home baseline | 97 [97–97] | 1034 [950–1084] | 92 [67–113] | 0 [0–0] |
| Home candidate | 95 [93–96] | 987 [858–1090] | 152 [144–165] | 0 [0–0] |
| EMI baseline | 94 [84–95] | 1005 [947–1441] | 170 [148–258] | 0.040 [0.040–0.040] |
| EMI candidate | 92 [88–94] | 884 [872–909] | 207 [61–269] | 0 [0–0.144] |
| Real Estate baseline | 95 [95–95] | 1243 [1159–1249] | 100 [96–127] | 0 [0–0] |
| Real Estate candidate | 92 [90–98] | 997 [963–1102] | 198 [79–215] | 0 [0–0] |

The demonstrated wins are lower transfer, less calculator JavaScript, improved
EMI LCP in this comparison, and consistently eliminated **mobile calculator**
layout shift. Home and Real Estate mobile LCP/TBT do not improve; their candidate
performance medians are lower. There is no evidence here for a general site-wide
load-time improvement or good mobile Core Web Vitals. Wide overlapping TBT ranges
and CPU warnings limit attribution, but do not erase the observed failures.

All three mobile routes still fail performance, LCP and TBT targets. Desktop EMI
also exceeds the median TBT target, and its third run has a 0.144 CLS footer shift
(`emi/desktop-3.report.json`). The report associates that shift with font loading
and the footer logo; that logo has explicit dimensions, so the generic “unsized
image” suggestion is not proof of the cause. Retained filmstrip frames show the
page and loading region after first paint but do not isolate the brief shift.
Its cause remains unresolved; this result must not be discarded or described as
universal layout stability. Real Estate desktop also has a 215-ms TBT sample.

Home accessibility improves from mobile 96 to 100; desktop stays 100. EMI remains
86 and Real Estate remains 98. Home/EMI SEO remain 100; Real Estate remains 92
because its baseline and candidate lack a meta description. Best practices are
100 for all candidate reports. These scores are not conformance or ranking claims.

Fresh terminal verification:

- Web `pnpm lint`, `pnpm typecheck` and `pnpm test`: pass; 98 files / 620 tests.
  A CMS preview test initially failed because it expected the old raw URL; its
  updated assertion and the subsequent full suite pass. The final release-test
  configuration addition also passes focused lint and strict type checking.
- Isolated synthetic `next build`: exit 0, compilation/type/lint checks and
  95/95 routes generated. It emits the known Windows standalone symlink-copy
  `EPERM` warning. The runnable `.next` output is verified through `next start`;
  complete standalone packaging is not certified by that exit code.
- `pnpm test:e2e frontend-performance.spec.ts brand.spec.ts`: 23 passed against
  the candidate production fixture. Covers deep-link/edit/reload, actual script
  loading, pre-hydration copy/loading space, responsive requests, public/auth and
  six dashboard-role logos, local Excel/CSV parity and asset-failure recovery.
- `pnpm test:e2e mobile-layout.spec.ts --grep 'mobile route /(calculators|loans|real-estate|contact)'`:
  26 passed, including all 18 calculators and four widths (320/390/768/1365),
  reduced motion, loaded fonts, visible fields and no overflow/page errors.
- Separate normal-motion resource sweep: all 16 route/viewport cases return
  200 with no page errors or horizontal overflow. Home, EMI and Real Estate
  screenshots retain the established composition and visible desktop artwork.
- `python -m unittest discover -s scripts/tests -p 'test_*.py'`, using existing
  `uv --cache-dir .uv-cache run --no-project`: 90 passed, one expected Windows
  POSIX-resource skip. The 14 production-runtime tests also pass independently.
- `nginx -t` against the exact config in the pinned base: pass. The separate
  real nginx response probe passes as described above.
- New frontend regression tests are included in `playwright.release.config.ts`.
  The hosted release-browser workflow is not claimed as freshly passed here.

The full API/database/migration gate and monolithic `./scripts/verify.sh --ci`
were not rerun for this frontend/nginx-only increment. Prior branding/API results
remain historical, as recorded in the living ledger. No API, contract, migration,
financial calculation or authorization code changes in this increment. Linux
standalone packaging and the full release gate remain required before deployment.

## Remaining work and review boundaries

Existing EMI accessibility findings include slider names/value text placed on
the wrapper instead of the thumb, loan-type tab references without panels and
inactive-tab contrast. These are recorded, not hidden by the performance work.
Autoplay still needs an explicit accessible pause assessment; this patch does
not change the accepted carousel behavior. Normal/reduced-motion testing does
not certify WCAG conformance. Next's streamed public loading boundary also means
fully disabled JavaScript does not reveal all resolved content; preserving copy
before application hydration is a narrower claim.

Security review covers image source selection, optimizer host boundaries, public
asset provenance, unchanged Excel fetching, server/client serialization and nginx
compression. No new recipient, URL grant, secret, telemetry or authorization path
is introduced. No dependency, generated contract, migration or API change occurs.
Production host capacity, Linux standalone packaging, live delivery and field
metrics require their existing release evidence; PR delivery is not deployment.
The existing no-disk image-cache policy also means repeat server-side resizing
must be included in host capacity checks. Do not claim the 50-MB ISR memory-cache
setting proves persistent image caching. Browser image caching remains separate.

Next performance priority: isolate shared hydration and layout work on the target
host, including desktop navigation initialized on mobile and calculator Radix
measurement costs. The first candidate Home mobile trace records 1,942 ms script
evaluation and 1,464 ms style/layout; its actual trace has 59 ms document response
and 1,712 ms text render delay (distinct from simulated LCP). Use attributed
before/after experiments, investigate the footer/font outlier, and repeat the
same profiles before claiming those timing budgets closed. Accessibility slider/
tab fixes and Real Estate metadata are separate recorded follow-ups.
